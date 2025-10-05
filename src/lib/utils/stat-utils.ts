import type { StatGroup, StatOption } from '$lib/types/stats.types.js';
import { attempt } from '$lib/utils/attempt.js';
import Fuse from 'fuse.js';

function isStatsApiResponse(data: unknown): data is { result: StatGroup[]; error?: string } {
	return (
		typeof data === 'object' &&
		data !== null &&
		'result' in data &&
		Array.isArray((data as { result: unknown }).result)
	);
}

function isStatGroup(obj: unknown): obj is StatGroup {
	const candidate = obj as Record<string, unknown>;
	return (
		typeof obj === 'object' &&
		obj !== null &&
		'entries' in obj &&
		Array.isArray(candidate.entries) &&
		'label' in obj &&
		typeof candidate.label === 'string'
	);
}

function isStatEntry(
	obj: unknown
): obj is { id: string; text: string; option?: Record<string, unknown> } {
	const candidate = obj as Record<string, unknown>;
	return (
		typeof obj === 'object' &&
		obj !== null &&
		'id' in obj &&
		'text' in obj &&
		typeof candidate.id === 'string' &&
		typeof candidate.text === 'string'
	);
}

interface OptimizedStatsCache {
	allStats: StatOption[];
	normalizedTextToStat: Map<string, StatOption>;
	fuseInstance: Fuse<StatOption>;
	implicitStats: StatOption[];
	implicitNormalizedTextToStat: Map<string, StatOption>;
	implicitFuseInstance: Fuse<StatOption> | null;
	timestamp: number;
}

class StatsManager {
	private cache: OptimizedStatsCache | null = null;
	private lastFetchAttempt = 0;
	private fetchPromise: Promise<StatOption[]> | null = null;

	private readonly CACHE_RETRY_INTERVAL = 60000; // 1 minute
	private readonly CACHE_TTL = 300000; // 5 minutes
	private readonly FUSE_THRESHOLD = 0.6;

	async fetchStats(): Promise<StatOption[]> {
		if (this.fetchPromise) {
			return this.fetchPromise;
		}

		if (this.cache && this.isCacheValid()) {
			return this.cache.allStats;
		}

		const now = Date.now();
		const timeSinceLastTry = now - this.lastFetchAttempt;

		if (timeSinceLastTry < this.CACHE_RETRY_INTERVAL && !this.cache) {
			throw new Error('Stats cache is unavailable. Please try again later.');
		}

		this.lastFetchAttempt = now;
		this.fetchPromise = this.doFetchStats();

		try {
			const result = await this.fetchPromise;
			return result;
		} finally {
			this.fetchPromise = null;
		}
	}

	private async doFetchStats(): Promise<StatOption[]> {
		try {
			const response = await this.fetchStatsFromAPI();
			const statsData = await this.parseStatsResponse(response);
			const processedStats = this.processStatsData(statsData);

			this.cache = this.createOptimizedCache(processedStats);
			return this.cache.allStats;
		} catch (error) {
			this.clearCache();
			throw error;
		}
	}

	private async fetchStatsFromAPI(): Promise<Response> {
		const [fetchError, response] = await attempt(fetch('/api/poe/stats', { cache: 'force-cache' }));

		if (fetchError) {
			throw new Error(`Network failed: ${fetchError.message}`);
		}

		if (!response.ok) {
			throw new Error(`Server error: ${response.status}`);
		}

		return response;
	}

	private async parseStatsResponse(
		response: Response
	): Promise<{ result: StatGroup[]; error?: string }> {
		const [jsonError, data] = await attempt(response.json());

		if (jsonError) {
			throw new Error('Bad JSON from server');
		}

		// Type validation instead of assertion
		if (!isStatsApiResponse(data)) {
			throw new Error('Invalid response format from server');
		}

		if (data.error) {
			throw new Error(data.error);
		}

		if (!data.result || data.result.length === 0) {
			throw new Error('No stats data from server');
		}

		return data;
	}

	private processStatsData(data: { result: StatGroup[] }): {
		allStats: StatOption[];
		implicitStats: StatOption[];
	} {
		const allStats: StatOption[] = [];
		const implicitStats: StatOption[] = [];

		for (const group of data.result) {
			if (!isStatGroup(group)) {
				continue;
			}

			for (const entry of group.entries) {
				if (!isStatEntry(entry)) {
					continue;
				}

				const stat: StatOption = {
					id: entry.id,
					text: entry.text,
					type: group.label,
					option: entry.option
				};

				allStats.push(stat);

				if (group.label === 'Implicit') {
					implicitStats.push(stat);
				}
			}
		}

		if (allStats.length === 0) {
			throw new Error('No valid stats received');
		}

		return { allStats, implicitStats };
	}

	private createOptimizedCache(processedStats: {
		allStats: StatOption[];
		implicitStats: StatOption[];
	}): OptimizedStatsCache {
		const { allStats, implicitStats } = processedStats;

		// Pre-compute normalized text mappings for O(1) lookups
		const normalizedTextToStat = new Map<string, StatOption>();
		const implicitNormalizedTextToStat = new Map<string, StatOption>();

		// Build lookup maps
		for (const stat of allStats) {
			const normalized = normalizeStatText(stat.text);
			if (normalized) {
				normalizedTextToStat.set(normalized, stat);
			}
		}

		for (const stat of implicitStats) {
			const normalized = normalizeStatText(stat.text);
			if (normalized) {
				implicitNormalizedTextToStat.set(normalized, stat);
			}
		}

		return {
			allStats,
			normalizedTextToStat,
			fuseInstance: this.createFuseInstance(allStats),
			implicitStats,
			implicitNormalizedTextToStat,
			implicitFuseInstance:
				implicitStats.length > 0 ? this.createFuseInstance(implicitStats) : null,
			timestamp: Date.now()
		};
	}

	findStatId(statText: string): string | null {
		if (!statText || typeof statText !== 'string') {
			return null;
		}

		if (!this.cache) {
			console.error('Stats cache not ready');
			return null;
		}

		const cleanInput = normalizeStatText(statText);
		if (!cleanInput) {
			return null;
		}

		const searchingForImplicit = statText.toLowerCase().includes('implicit');
		const searchConfig = this.getSearchConfiguration(searchingForImplicit);

		const exactMatch = searchConfig.normalizedMap.get(cleanInput);
		if (exactMatch) {
			this.logMatch('Exact match found', cleanInput, exactMatch, searchingForImplicit);
			return exactMatch.id;
		}

		const fuzzyMatch = this.findFuzzyMatch(cleanInput, searchConfig.fuseInstance);
		if (fuzzyMatch) {
			this.logMatch(
				'Fuzzy match found',
				cleanInput,
				fuzzyMatch,
				searchingForImplicit,
				fuzzyMatch.score
			);
			return fuzzyMatch.id;
		}

		this.logNoMatch(cleanInput, searchingForImplicit, searchConfig.normalizedMap.size);
		return null;
	}

	private getSearchConfiguration(searchingForImplicit: boolean) {
		if (!this.cache) {
			throw new Error('Cache not available');
		}

		if (searchingForImplicit && this.cache.implicitFuseInstance) {
			return {
				normalizedMap: this.cache.implicitNormalizedTextToStat,
				fuseInstance: this.cache.implicitFuseInstance
			};
		}

		return {
			normalizedMap: this.cache.normalizedTextToStat,
			fuseInstance: this.cache.fuseInstance
		};
	}

	private findFuzzyMatch(
		cleanInput: string,
		fuseInstance: Fuse<StatOption>
	): (StatOption & { score?: number }) | null {
		const searchResults = fuseInstance.search(cleanInput);
		const bestResult = searchResults[0];

		if (bestResult && bestResult.score !== undefined && bestResult.score < this.FUSE_THRESHOLD) {
			return { ...bestResult.item, score: bestResult.score };
		}

		return null;
	}

	private createFuseInstance(stats: StatOption[]): Fuse<StatOption> {
		return new Fuse(stats, {
			keys: ['text'],
			includeScore: true,
			threshold: this.FUSE_THRESHOLD,
			distance: 300,
			ignoreLocation: true,
			minMatchCharLength: 3,
			useExtendedSearch: true,
			getFn: (obj, path) => {
				if (path === 'text' && typeof obj.text === 'string') {
					return normalizeStatText(obj.text);
				}
				const value = obj[path as keyof StatOption];
				return value != null ? String(value) : '';
			}
		});
	}

	private isCacheValid(): boolean {
		return this.cache !== null && Date.now() - this.cache.timestamp < this.CACHE_TTL;
	}

	private clearCache(): void {
		this.cache = null;
	}

	// Logging methods
	private logMatch(
		type: string,
		input: string,
		match: StatOption,
		wasImplicitSearch: boolean,
		score?: number
	): void {
		if (process.env.NODE_ENV === 'development') {
			const logData: Record<string, unknown> = {
				input: this.sanitizeForLogging(input),
				match: this.sanitizeForLogging(match.text),
				id: match.id,
				type: match.type,
				wasImplicitSearch
			};
			if (score !== undefined) {
				logData.score = score;
			}
			console.debug(type, logData);
		}
	}

	private logNoMatch(input: string, wasImplicitSearch: boolean, statsSearched: number): void {
		if (process.env.NODE_ENV === 'development') {
			console.debug('No match found:', {
				input: this.sanitizeForLogging(input),
				wasImplicitSearch,
				statsSearched
			});
		}
	}

	private sanitizeForLogging(text: string): string {
		return text.replace(/[<>]/g, '');
	}
}

const statsManager = new StatsManager();

// Public API exports
export const fetchStats = (): Promise<StatOption[]> => statsManager.fetchStats();
export const findStatId = (statText: string): string | null => statsManager.findStatId(statText);

function normalizeStatText(text: string): string {
	if (!text || typeof text !== 'string') {
		return '';
	}

	return text
		.toLowerCase()
		.replace(/\+(?=\d)/g, '') // Remove plus signs before numbers
		.replace(/\[|\]/g, '') // Remove brackets
		.replace(/\|.*?(?=\s|$)/g, '') // Remove pipe sections
		.replace(/[+-]?\d+\.?\d*/g, '#') // Replace numbers with placeholder
		.replace(/\s+/g, ' ') // Normalize whitespace
		.replace(/\s*\(implicit\)$/, '') // Remove `(implicit)`
		.replace(/^adds /, '') // Remove common prefixes
		.replace(/^gain /, '')
		.replace(/^you /, '')
		.trim();
}

// Value extraction utility
export function extractValue(statText: string): number {
	if (!statText || typeof statText !== 'string') {
		return 0;
	}

	const matches = statText.match(/([+-]?\d+\.?\d*)/g);
	if (!matches) return 0;
	return parseFloat(matches[0]);
}
