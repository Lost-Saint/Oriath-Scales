import type { StatGroup, StatOption } from '$lib/types/stats.types.js';
import { attempt } from '$lib/utils/attempt.js';
import Fuse from 'fuse.js';

interface StatsCache {
	allStats: StatOption[];
	fuseInstance: Fuse<StatOption>;
	implicitFuseInstance: Fuse<StatOption> | null;
}

let cache: StatsCache | null = null;
let lastFetchAttempt = 0;

const CACHE_RETRY_INTERVAL = 60000;
const FUSE_THRESHOLD = 0.6;

export async function fetchStats(): Promise<StatOption[]> {
	if (cache) {
		return cache.allStats;
	}

	const now = Date.now();
	const timeSinceLastTry = now - lastFetchAttempt;

	if (timeSinceLastTry < CACHE_RETRY_INTERVAL) {
		throw new Error('Stats cache is unavailable. Please try again later.');
	}

	lastFetchAttempt = now;

	try {
		const response = await fetchStatsFromAPI();
		const statsData = await parseStatsResponse(response);
		const processedStats = processStatsData(statsData);

		cache = createStatsCache(processedStats);
		return cache.allStats;
	} catch (error) {
		clearStatsCache();
		throw error;
	}
}

async function fetchStatsFromAPI(): Promise<Response> {
	const [fetchError, response] = await attempt(fetch('/api/poe/stats', { cache: 'force-cache' }));

	if (fetchError) {
		throw new Error(`Network failed: ${fetchError.message}`);
	}

	if (!response.ok) {
		throw new Error(`Server error: ${response.status}`);
	}

	return response;
}

async function parseStatsResponse(response: Response): Promise<unknown> {
	const [jsonError, data] = await attempt(response.json());

	if (jsonError) {
		throw new Error('Bad JSON from server');
	}

	if (data.error) {
		throw new Error(data.error);
	}

	if (!data.result || !Array.isArray(data.result)) {
		throw new Error('No stats data from server');
	}

	return data;
}

function processStatsData(data: unknown): { allStats: StatOption[]; implicitStats: StatOption[] } {
	const allStats: StatOption[] = [];
	const implicitStats: StatOption[] = [];

	const typedData = data as { result: StatGroup[] };

	for (const group of typedData.result) {
		if (!group.entries || !Array.isArray(group.entries)) {
			continue;
		}

		for (const entry of group.entries) {
			if (!entry) continue;

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
		throw new Error('No stats received');
	}

	return { allStats, implicitStats };
}

function createStatsCache(processedStats: {
	allStats: StatOption[];
	implicitStats: StatOption[];
}): StatsCache {
	const { allStats, implicitStats } = processedStats;

	return {
		allStats,
		fuseInstance: createFuseInstance(allStats),
		implicitFuseInstance: implicitStats.length > 0 ? createFuseInstance(implicitStats) : null
	};
}

export function findStatId(statText: string): string | null {
	if (!cache) {
		console.error('Stats cache not ready');
		return null;
	}

	const cleanInput = normalizeStatText(statText);
	if (cleanInput.length === 0) {
		return null;
	}

	const searchingForImplicit = statText.toLowerCase().includes('implicit');
	const searchConfig = getSearchConfiguration(searchingForImplicit);

	const exactMatch = findExactMatch(cleanInput, searchConfig.stats);
	if (exactMatch) {
		logMatch('Exact match found', cleanInput, exactMatch, searchingForImplicit);
		return exactMatch.id;
	}

	const fuzzyMatch = findFuzzyMatch(cleanInput, searchConfig.fuseInstance);
	if (fuzzyMatch) {
		logMatch('Fuzzy match found', cleanInput, fuzzyMatch, searchingForImplicit, fuzzyMatch.score);
		return fuzzyMatch.id;
	}

	logNoMatch(cleanInput, searchingForImplicit, searchConfig.stats.length);
	return null;
}

function getSearchConfiguration(searchingForImplicit: boolean) {
	if (!cache) {
		throw new Error('Cache not available');
	}

	if (searchingForImplicit && cache.implicitFuseInstance) {
		return {
			stats: cache.allStats.filter((stat) => stat.type === 'Implicit'),
			fuseInstance: cache.implicitFuseInstance
		};
	}

	return {
		stats: cache.allStats,
		fuseInstance: cache.fuseInstance
	};
}

function findExactMatch(cleanInput: string, stats: StatOption[]): StatOption | null {
	for (const stat of stats) {
		if (stat && normalizeStatText(stat.text) === cleanInput) {
			return stat;
		}
	}
	return null;
}

function findFuzzyMatch(
	cleanInput: string,
	fuseInstance: Fuse<StatOption>
): (StatOption & { score?: number }) | null {
	const searchResults = fuseInstance.search(cleanInput);
	const bestResult = searchResults[0];

	if (bestResult && bestResult.score !== undefined && bestResult.score < FUSE_THRESHOLD) {
		return { ...bestResult.item, score: bestResult.score };
	}

	return null;
}

function logMatch(
	type: string,
	input: string,
	match: StatOption,
	wasImplicitSearch: boolean,
	score?: number
): void {
	const logData: Record<string, unknown> = {
		input,
		match: match.text,
		id: match.id,
		type: match.type,
		wasImplicitSearch
	};

	if (score !== undefined) {
		logData.score = score;
	}

	console.log(type, logData);
}

function logNoMatch(input: string, wasImplicitSearch: boolean, statsSearched: number): void {
	console.log('No match found:', {
		input,
		wasImplicitSearch,
		statsSearched
	});
}

function createFuseInstance(stats: StatOption[]): Fuse<StatOption> {
	return new Fuse(stats, {
		keys: ['text'],
		includeScore: true,
		threshold: FUSE_THRESHOLD,
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

function clearStatsCache(): void {
	cache = null;
}

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

export function extractValue(statText: unknown): number {
	if (typeof statText !== 'string') {
		return 0;
	}

	const match = statText.match(/([+-]?\d+\.?\d*)/);
	if (!match || typeof match[1] !== 'string') {
		return 0;
	}

	const value = parseFloat(match[1]);
	return isFinite(value) ? value : 0;
}
