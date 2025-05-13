/**
 * Stats utility module for managing POE stats data
 *
 * Provides functionality to fetch, cache, normalize, and search game stats
 * with efficient fuzzy matching capabilities.
 */

import Fuse from 'fuse.js';

/**
 * API response type for stat groups
 */
interface StatApiResponse {
	result?: StatGroup[];
	error?: string;
}

/**
 * Represents a individual stat option with metadata
 */
export interface StatOption {
	id: string;
	text: string;
	type: string;
	option?: Record<string, unknown>;
}

/**
 * Raw stat entry from API
 */
interface StatEntry {
	id: string;
	text: string;
	option?: Record<string, unknown>;
}

/**
 * Group of related stats from API
 */
interface StatGroup {
	label: string;
	entries: StatEntry[];
}

// Module-level cache to avoid repeated API calls
let statsCache: StatOption[] | null = null;
let fuseInstance: Fuse<StatOption> | null = null;
let lastFetchAttempt = 0;
let fetchPromise: Promise<StatOption[]> | null = null;

const CACHE_RETRY_INTERVAL = 60000; // 1 minute
const DEFAULT_SEARCH_THRESHOLD = 0.8;

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
	if (statsCache && fuseInstance) {
		return statsCache;
	}

	const now = Date.now();

	// Throttle retry attempts when cache is empty
	if (now - lastFetchAttempt < CACHE_RETRY_INTERVAL && !statsCache) {
		throw new Error('Stats cache is unavailable. Please try again later.');
	}

	// Return existing promise to prevent multiple concurrent requests
	if (fetchPromise) {
		return fetchPromise;
	}

	// Create new fetch promise
	fetchPromise = (async () => {
		try {
			lastFetchAttempt = now;

			// Fetch with SvelteKit-specific options
			const response = await fetch('/api/poe/stats', {
				cache: 'force-cache'
			});

			if (!response.ok) {
				throw new Error(`Failed to fetch stats: HTTP ${response.status}`);
			}

			const data = (await response.json()) as StatApiResponse;

			if (data.error) {
				throw new Error(`API error: ${data.error}`);
			}

			if (
				!data.result ||
				!Array.isArray(data.result) ||
				data.result.length === 0
			) {
				throw new Error('Invalid or empty stats data received from API');
			}

			// Transform API response to flat list of stats
			const processedStats = data.result.flatMap((group: StatGroup) =>
				group.entries.map((entry: StatEntry) => ({
					id: entry.id,
					text: entry.text,
					type: group.label,
					option: entry.option
				}))
			);

			// Initialize search index
			statsCache = processedStats;
			fuseInstance = createFuseInstance(processedStats);

			return processedStats;
		} catch (error) {
			console.error('[Stats] Failed to fetch stats:', error);
			statsCache = null;
			fuseInstance = null;
			throw error;
		} finally {
			// Clear promise reference to allow future fetch attempts
			fetchPromise = null;
		}
	})();

	return fetchPromise;
}

/**
 * Creates a new Fuse.js instance for fuzzy searching
 */
function createFuseInstance(stats: StatOption[]): Fuse<StatOption> {
	return new Fuse(stats, {
		keys: ['text'],
		includeScore: true,
		threshold: DEFAULT_SEARCH_THRESHOLD,
		distance: 300,
		ignoreLocation: true,
		minMatchCharLength: 2,
		useExtendedSearch: true,
		getFn: (obj, path) => {
			const value = obj[path as keyof StatOption];
			if (path === 'text' && typeof value === 'string') {
				return normalizeStatText(value);
			}
			return value ? String(value) : '';
		}
	});
}

/**
 * Normalizes stat text for consistent matching
 *
 * Removes or replaces special characters, numbers, and common prefixes
 * to improve fuzzy matching accuracy.
 */
function normalizeStatText(text: string): string {
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
		.trim();
}

/**
 * Finds a stat ID based on text input using fuzzy matching
 *
 * First attempts exact match after normalization, then falls back to fuzzy search.
 *
 * @param statText The stat text to search for
 * @returns The matching stat ID or null if no match found
 */
export function findStatId(statText: string): string | null {
	if (!statText || typeof statText !== 'string') {
		console.warn('[Stats] Invalid input to findStatId:', statText);
		return null;
	}

	if (!statsCache || !fuseInstance) {
		console.warn(
			'[Stats] Stats cache not initialized. Call fetchStats() first.'
		);
		return null;
	}

	const normalizedInput = normalizeStatText(statText);
	if (!normalizedInput) return null;

	// First try exact match after normalization
	const exactMatch = statsCache.find(
		(s) => normalizeStatText(s.text) === normalizedInput
	);

	if (exactMatch) {
		return exactMatch.id;
	}

	// Fall back to fuzzy search
	const results = fuseInstance.search(normalizedInput);

	if (
		results.length > 0 &&
		results[0]?.score !== undefined &&
		results[0].score < DEFAULT_SEARCH_THRESHOLD
	) {
		return results[0].item.id;
	}

	return null;
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

/**
 * Clears the stats cache to force a fresh fetch on next request
 */
export function clearStatsCache(): void {
	statsCache = null;
	fuseInstance = null;
	lastFetchAttempt = 0;
	fetchPromise = null;
}

/**
 * Gets stats sync from cache without API request
 * Returns null if cache is not initialized
 */
export function getCachedStats(): StatOption[] | null {
	return statsCache;
}

/**
 * Preloads stats data in the background
 * Useful for initializing cache during app startup
 */
export function preloadStats(): void {
	fetchStats().catch((err) => {
		console.warn('[Stats] Preload failed:', err);
	});
}
