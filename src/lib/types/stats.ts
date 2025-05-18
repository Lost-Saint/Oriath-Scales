/**
 * Represents a single stat entry in the PoE API
 */
export interface StatEntry {
	id: string;
	text: string;
	type: string;
}

/**
 * Represents a group of related stats
 */
export interface StatGroup {
	id: string;
	label: string;
	entries: StatEntry[];
}

/**
 * The complete stats response from the PoE API
 */
export interface StatsResult {
	result: StatGroup[];
}

/**
 * Stats data with timestamp for cache management
 */
export interface CacheData {
	data: StatsResult;
	lastUpdated: string;
}
