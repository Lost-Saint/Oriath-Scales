/**
 * Represents an individual stat entry with metadata
 */
export interface StatEntry {
	id: string;
	text: string;
	type: string;
	option?: Record<string, unknown>;
}

/**
 * Group of related stats from API
 */
export interface StatGroup {
	id: string;
	label: string;
	entries: StatEntry[];
	option?: Record<string, unknown>;
}

/**
 * Search result containing grouped stats
 */
export interface StatsResult {
	result: StatGroup[];
}

/**
 * Cached stats data with timestamp
 */
export interface CacheData {
	data: StatsResult;
	lastUpdated: string;
}

/**
 * Represents a selectable stat option (same as StatEntry)
 */
export type StatOption = StatEntry;
