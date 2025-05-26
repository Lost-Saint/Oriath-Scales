/**
 * Stats utility module for managing POE stats data
 *
 * Provides functionality to fetch, cache, normalize, and search game stats
 * with efficient fuzzy matching capabilities and implicit stats support.
 */

import { browser } from '$app/environment';
import type {
	SearchContext,
	SearchResult,
	StatApiResponse,
	StatEntry,
	StatGroup,
	StatOption
} from '$lib/types/utils';
import { tryCatch } from '$lib/utils/error';
import Fuse from 'fuse.js';

// Configuration
// ------------------------------------

const CONFIG = {
	CACHE_RETRY_INTERVAL: 60000, // 1 minute
	SEARCH_THRESHOLD: 0.8,
	SEARCH_DISTANCE: 300,
	MIN_MATCH_LENGTH: 2,
	STATS_ENDPOINT: '/api/poe/stats',
	IMPLICIT_INDICATORS: ['(implicit)'],
	IMPLICIT_TYPE: 'Implicit'
};

// State management
// ------------------------------------
class StatsManager {
	private cache: StatOption[] | null = null;
	private searchIndex: Fuse<StatOption> | null = null;
	private implicitIndex: Fuse<StatOption> | null = null;
	private lastFetchTime = 0;
	private fetchPromise: Promise<StatOption[]> | null = null;

	getCachedStats(): StatOption[] | null {
		return this.cache;
	}

	clearCache(): void {
		this.cache = null;
		this.searchIndex = null;
		this.implicitIndex = null;
		this.lastFetchTime = 0;
		this.fetchPromise = null;
	}

	isCacheReady(): boolean {
		return !!(this.cache && this.searchIndex && this.implicitIndex);
	}

	updateCache(stats: StatOption[]): void {
		this.cache = stats;
		this.searchIndex = this.createSearchIndex(stats);
		this.implicitIndex = this.createImplicitIndex(stats);
	}

	canAttemptFetch(): boolean {
		const now = Date.now();
		return now - this.lastFetchTime >= CONFIG.CACHE_RETRY_INTERVAL;
	}

	setupFetchPromise(fetchFn: () => Promise<StatOption[]>): Promise<StatOption[]> {
		if (!this.fetchPromise) {
			this.lastFetchTime = Date.now();
			this.fetchPromise = fetchFn().finally(() => {
				this.fetchPromise = null;
			});
		}
		return this.fetchPromise;
	}

	private createSearchIndex(stats: StatOption[]): Fuse<StatOption> {
		return new Fuse(stats, {
			keys: ['text'],
			includeScore: true,
			threshold: CONFIG.SEARCH_THRESHOLD,
			distance: CONFIG.SEARCH_DISTANCE,
			ignoreLocation: true,
			minMatchCharLength: CONFIG.MIN_MATCH_LENGTH,
			useExtendedSearch: true,
			getFn: (obj, path) => {
				const value = obj[path as keyof StatOption];
				if (path === 'text' && typeof value === 'string') {
					return normalizeStatText(value);
				}
				if (typeof value === 'string' || typeof value === 'number') {
					return value;
				}
				return '';
			}
		});
	}

	private createImplicitIndex(stats: StatOption[]): Fuse<StatOption> {
		const implicitStats = stats.filter((stat) => stat.type === CONFIG.IMPLICIT_TYPE);

		return new Fuse(implicitStats, {
			keys: ['text'],
			includeScore: true,
			threshold: CONFIG.SEARCH_THRESHOLD,
			distance: CONFIG.SEARCH_DISTANCE,
			ignoreLocation: true,
			minMatchCharLength: CONFIG.MIN_MATCH_LENGTH,
			useExtendedSearch: true,
			getFn: (obj, path) => {
				const value = obj[path as keyof StatOption];
				if (path === 'text' && typeof value === 'string') {
					return normalizeStatText(value);
				}
				if (typeof value === 'string' || typeof value === 'number') {
					return value;
				}
				return '';
			}
		});
	}

	private analyzeSearchContext(statText: string): SearchContext {
		const lowerText = statText.toLowerCase();
		const isImplicitOnly = CONFIG.IMPLICIT_INDICATORS.some((indicator) =>
			lowerText.includes(indicator)
		);

		let cleanedText = statText;
		for (const indicator of CONFIG.IMPLICIT_INDICATORS) {
			cleanedText = cleanedText.replace(new RegExp(`\\s*\\(${indicator}\\)`, 'gi'), '');
			cleanedText = cleanedText.replace(new RegExp(`\\s*${indicator}\\s*`, 'gi'), ' ');
		}

		const normalizedTerm = normalizeStatText(cleanedText);

		return {
			searchTerm: cleanedText.trim(),
			normalizedTerm,
			isImplicitOnly,
			originalText: statText
		};
	}

	searchStats(statText: string): SearchResult {
		if (!this.cache || !this.searchIndex || !this.implicitIndex) {
			return { id: null, exactMatch: false };
		}

		const context = this.analyzeSearchContext(statText);

		const relevantStats = context.isImplicitOnly
			? this.cache.filter((s) => s.type === CONFIG.IMPLICIT_TYPE)
			: this.cache;

		const searchIndex = context.isImplicitOnly ? this.implicitIndex : this.searchIndex;

		const exactMatch = this.findExactMatch(context.normalizedTerm, relevantStats);
		if (exactMatch) {
			return { id: exactMatch, exactMatch: true };
		}

		const results = searchIndex.search(context.normalizedTerm);

		if (results.length === 0) {
			return { id: null, exactMatch: false };
		}

		const bestMatch = results[0];
		if (bestMatch && bestMatch.score !== undefined && bestMatch.score < CONFIG.SEARCH_THRESHOLD) {
			return {
				id: bestMatch.item.id,
				exactMatch: false,
				score: bestMatch.score
			};
		}

		return { id: null, exactMatch: false };
	}

	private findExactMatch(normalizedInput: string, stats: StatOption[]): string | null {
		const exactMatch = stats.find((s) => normalizeStatText(s.text) === normalizedInput);

		return exactMatch?.id || null;
	}
}

const statsManager = new StatsManager();

// Text processing functions
// ------------------------------------

export function normalizeStatText(text: string): string {
	if (!text) return '';

	return text
		.toLowerCase()
		.replace(/\+(?=\d)/g, '') // Remove leading + before numbers
		.replace(/\[|\]/g, '') // Remove square brackets
		.replace(/\|.*?(?=\s|$)/g, '') // Remove pipe sections
		.replace(/[+-]?\d+\.?\d*/g, '#') // Replace numbers with placeholder
		.replace(/\s+/g, ' ') // Normalize whitespace
		.replace(/^adds /, '') // Remove common prefixes
		.replace(/^gain /, '')
		.replace(/^you /, '')
		.replace(/\s*\(implicit\)\s*$/i, '') // Remove (implicit) suffix
		.trim();
}

export function extractValue(statText: string): number {
	if (!statText || typeof statText !== 'string') return 0;

	const matches = statText.match(/([+-]?\d+\.?\d*)/g);
	if (!matches || matches.length === 0) return 0;

	return parseFloat(matches[0]);
}

// API interaction functions
// ------------------------------------

export async function fetchStats(): Promise<StatOption[]> {
	// Return cached data when available
	if (statsManager.isCacheReady()) {
		return statsManager.getCachedStats()!;
	}

	if (!statsManager.canAttemptFetch()) {
		throw new Error('Stats cache is unavailable. Please try again later.');
	}

	return statsManager.setupFetchPromise(async () => {
		const result = await fetchStatsFromApi();

		if (result.error) {
			console.error('[Stats] Failed to fetch stats:', result.error);
			throw result.error;
		}

		statsManager.updateCache(result.data);
		return result.data;
	});
}

async function fetchStatsFromApi() {
	const fetchResult = await tryCatch(fetch(CONFIG.STATS_ENDPOINT, { cache: 'force-cache' }));

	if (fetchResult.error) {
		return {
			data: null,
			error: new Error(`Failed to connect to stats API: ${fetchResult.error.message}`)
		};
	}

	const response = fetchResult.data;
	if (!response.ok) {
		return {
			data: null,
			error: new Error(`Stats API error: HTTP ${response.status}`)
		};
	}

	const jsonResult = await tryCatch(response.json());
	if (jsonResult.error) {
		return {
			data: null,
			error: new Error(`Failed to parse stats response: ${jsonResult.error.message}`)
		};
	}

	const data = jsonResult.data as StatApiResponse;

	if (data.error) {
		return {
			data: null,
			error: new Error(`Stats API reported error: ${data.error}`)
		};
	}

	if (!data.result || !Array.isArray(data.result) || data.result.length === 0) {
		return {
			data: null,
			error: new Error('Invalid or empty stats data received from API')
		};
	}
	return {
		data: flattenApiResponse(data.result),
		error: null
	};
}

function flattenApiResponse(groups: StatGroup[]): StatOption[] {
	return groups.flatMap((group: StatGroup) =>
		group.entries.map((entry: StatEntry) => ({
			id: entry.id,
			text: entry.text,
			type: group.label,
			option: entry.option
		}))
	);
}

// Query functions
// ------------------------------------

export function findStatId(statText: string): string | null {
	if (!isValidStatText(statText)) {
		return null;
	}

	if (!statsManager.isCacheReady()) {
		console.warn('[Stats] Stats cache not initialized. Call fetchStats() first.');
		return null;
	}

	const result = statsManager.searchStats(statText);
	return result.id;
}

function isValidStatText(statText: unknown): statText is string {
	if (!statText || typeof statText !== 'string') {
		console.warn('[Stats] Invalid input to findStatId:', statText);
		return false;
	}
	return true;
}

// Public utility functions
// ------------------------------------
export function clearStatsCache(): void {
	statsManager.clearCache();
}

export function getCachedStats(): StatOption[] | null {
	return statsManager.getCachedStats();
}

export function getCachedImplicitStats(): StatOption[] | null {
	const stats = statsManager.getCachedStats();
	return stats ? stats.filter((s) => s.type === CONFIG.IMPLICIT_TYPE) : null;
}

export function isImplicitSearch(statText: string): boolean {
	if (!statText) return false;
	const lowerText = statText.toLowerCase();
	return CONFIG.IMPLICIT_INDICATORS.some((indicator) => lowerText.includes(indicator));
}

export function preloadStats(): void {
	if (browser) {
		fetchStats().catch((err) => {
			console.warn('[Stats] Preload failed:', err);
		});
	}
}
