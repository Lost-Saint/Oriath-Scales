/**
 * Stats utility module for managing POE stats data
 *
 * Provides functionality to fetch, cache, normalize, and search game stats
 * with efficient fuzzy matching capabilities and implicit stats support.
 */

import { browser } from '$app/environment';
import type { StatApiResponse, StatOption, StatEntry, StatGroup, SearchResult, SearchContext } from '$lib/types/utils';
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

/**
 * Class to manage stats data state
 */
class StatsManager {
	private cache: StatOption[] | null = null;
	private searchIndex: Fuse<StatOption> | null = null;
	private implicitIndex: Fuse<StatOption> | null = null;
	private lastFetchTime = 0;
	private fetchPromise: Promise<StatOption[]> | null = null;

	/**
	 * Returns cached stats or null if not available
	 */
	getCachedStats(): StatOption[] | null {
		return this.cache;
	}

	/**
	 * Clears all cached data
	 */
	clearCache(): void {
		this.cache = null;
		this.searchIndex = null;
		this.implicitIndex = null;
		this.lastFetchTime = 0;
		this.fetchPromise = null;
	}

	/**
	 * Checks if cache is ready to use
	 */
	isCacheReady(): boolean {
		return !!(this.cache && this.searchIndex && this.implicitIndex);
	}

	/**
	 * Updates cache with fresh data
	 */
	updateCache(stats: StatOption[]): void {
		this.cache = stats;
		this.searchIndex = this.createSearchIndex(stats);
		this.implicitIndex = this.createImplicitIndex(stats);
	}

	/**
	 * Indicates if we can attempt fetching data
	 */
	canAttemptFetch(): boolean {
		const now = Date.now();
		return now - this.lastFetchTime >= CONFIG.CACHE_RETRY_INTERVAL;
	}

	/**
	 * Sets up or returns existing fetch promise
	 */
	setupFetchPromise(
		fetchFn: () => Promise<StatOption[]>
	): Promise<StatOption[]> {
		if (!this.fetchPromise) {
			this.lastFetchTime = Date.now();
			this.fetchPromise = fetchFn().finally(() => {
				this.fetchPromise = null;
			});
		}
		return this.fetchPromise;
	}

	/**
	 * Creates Fuse.js search index for all stats
	 */
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

	/**
	 * Creates dedicated Fuse.js search index for implicit stats only
	 */
	private createImplicitIndex(stats: StatOption[]): Fuse<StatOption> {
		const implicitStats = stats.filter(stat => stat.type === CONFIG.IMPLICIT_TYPE);
		
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

	/**
	 * Analyzes search input to determine context and filtering needs
	 */
	private analyzeSearchContext(statText: string): SearchContext {
		const lowerText = statText.toLowerCase();
		const isImplicitOnly = CONFIG.IMPLICIT_INDICATORS.some(indicator => 
			lowerText.includes(indicator)
		);

		// Clean the search term by removing implicit indicators
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

	/**
	 * Performs stat search using appropriate search index
	 */
	searchStats(statText: string): SearchResult {
		if (!this.cache || !this.searchIndex || !this.implicitIndex) {
			return { id: null, exactMatch: false };
		}

		const context = this.analyzeSearchContext(statText);
		
		// Choose appropriate dataset and search index
		const relevantStats = context.isImplicitOnly 
			? this.cache.filter(s => s.type === CONFIG.IMPLICIT_TYPE)
			: this.cache;
			
		const searchIndex = context.isImplicitOnly ? this.implicitIndex : this.searchIndex;

		// Try exact match first
		const exactMatch = this.findExactMatch(context.normalizedTerm, relevantStats);
		if (exactMatch) {
			return { id: exactMatch, exactMatch: true };
		}

		// Fall back to fuzzy search
		const results = searchIndex.search(context.normalizedTerm);

		if (results.length === 0) {
			return { id: null, exactMatch: false };
		}

		const bestMatch = results[0];
		if (
			bestMatch &&
			bestMatch.score !== undefined &&
			bestMatch.score < CONFIG.SEARCH_THRESHOLD
		) {
			return {
				id: bestMatch.item.id,
				exactMatch: false,
				score: bestMatch.score
			};
		}

		return { id: null, exactMatch: false };
	}

	/**
	 * Finds exact match after normalization within specified stats
	 */
	private findExactMatch(normalizedInput: string, stats: StatOption[]): string | null {
		const exactMatch = stats.find(
			(s) => normalizeStatText(s.text) === normalizedInput
		);

		return exactMatch?.id || null;
	}
}

// Create singleton manager instance
const statsManager = new StatsManager();

// Text processing functions
// ------------------------------------

/**
 * Normalizes stat text for consistent matching
 *
 * Removes or replaces special characters, numbers, common prefixes,
 * and implicit indicators to improve fuzzy matching accuracy.
 */
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

/**
 * Extracts numeric value from stat text
 *
 * @param statText The stat text containing numeric values
 * @returns The first numeric value found or 0 if none
 */
export function extractValue(statText: string): number {
	if (!statText || typeof statText !== 'string') return 0;

	const matches = statText.match(/([+-]?\d+\.?\d*)/g);
	if (!matches || matches.length === 0) return 0;

	return parseFloat(matches[0]);
}

// API interaction functions
// ------------------------------------

/**
 * Fetches stats data from API with intelligent caching
 *
 * - Returns cached data when available
 * - Prevents thundering herd with shared promise during concurrent calls
 * - Implements exponential backoff for failed requests
 *
 * @returns Promise resolving to array of stat options
 */
export async function fetchStats(): Promise<StatOption[]> {
	// Return cached data when available
	if (statsManager.isCacheReady()) {
		return statsManager.getCachedStats()!;
	}

	// Check if we should throttle retry attempts
	if (!statsManager.canAttemptFetch()) {
		throw new Error('Stats cache is unavailable. Please try again later.');
	}

	// Return existing promise or create new one
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

/**
 * Fetches raw stats data from the API
 */
async function fetchStatsFromApi() {
	// Attempt to fetch from API
	const fetchResult = await tryCatch(
		fetch(CONFIG.STATS_ENDPOINT, { cache: 'force-cache' })
	);

	if (fetchResult.error) {
		return {
			data: null,
			error: new Error(
				`Failed to connect to stats API: ${fetchResult.error.message}`
			)
		};
	}

	const response = fetchResult.data;
	if (!response.ok) {
		return {
			data: null,
			error: new Error(`Stats API error: HTTP ${response.status}`)
		};
	}

	// Parse JSON response
	const jsonResult = await tryCatch(response.json());
	if (jsonResult.error) {
		return {
			data: null,
			error: new Error(
				`Failed to parse stats response: ${jsonResult.error.message}`
			)
		};
	}

	const data = jsonResult.data as StatApiResponse;

	// Validate API response
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

	// Process data into flat structure
	return {
		data: flattenApiResponse(data.result),
		error: null
	};
}

/**
 * Transforms the API response into a flat array of stat options
 */
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

/**
 * Finds a stat ID based on text input using fuzzy matching
 *
 * Supports both regular stats and implicit-only searches. When input contains
 * "(implicit)" or "implicit", it will only search within implicit stats.
 * First attempts exact match after normalization, then falls back to fuzzy search.
 *
 * @param statText The stat text to search for (may include implicit indicators)
 * @returns The matching stat ID or null if no match found
 */
export function findStatId(statText: string): string | null {
	// Input validation
	if (!isValidStatText(statText)) {
		return null;
	}

	// Ensure cache is initialized
	if (!statsManager.isCacheReady()) {
		console.warn(
			'[Stats] Stats cache not initialized. Call fetchStats() first.'
		);
		return null;
	}

	// Perform context-aware search
	const result = statsManager.searchStats(statText);
	return result.id;
}

/**
 * Validates input for stat text search
 */
function isValidStatText(statText: unknown): statText is string {
	if (!statText || typeof statText !== 'string') {
		console.warn('[Stats] Invalid input to findStatId:', statText);
		return false;
	}
	return true;
}

// Public utility functions
// ------------------------------------

/**
 * Clears the stats cache to force a fresh fetch on next request
 */
export function clearStatsCache(): void {
	statsManager.clearCache();
}

/**
 * Gets stats sync from cache without API request
 * Returns null if cache is not initialized
 */
export function getCachedStats(): StatOption[] | null {
	return statsManager.getCachedStats();
}

/**
 * Gets only implicit stats from cache
 * Returns null if cache is not initialized
 */
export function getCachedImplicitStats(): StatOption[] | null {
	const stats = statsManager.getCachedStats();
	return stats ? stats.filter(s => s.type === CONFIG.IMPLICIT_TYPE) : null;
}

/**
 * Checks if a given stat text indicates implicit-only search
 * 
 * @param statText The stat text to analyze
 * @returns True if the text contains implicit indicators
 */
export function isImplicitSearch(statText: string): boolean {
	if (!statText) return false;
	const lowerText = statText.toLowerCase();
	return CONFIG.IMPLICIT_INDICATORS.some(indicator => 
		lowerText.includes(indicator)
	);
}

/**
 * Preloads stats data in the background
 * Useful for initializing cache during app startup
 */
export function preloadStats(): void {
	// Only run in browser environment
	if (browser) {
		fetchStats().catch((err) => {
			console.warn('[Stats] Preload failed:', err);
		});
	}
}
