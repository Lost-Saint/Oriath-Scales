/**
 * API response type for stat groups
 */
export interface StatApiResponse {
	result?: StatGroup[];
	error?: string;
}

/**
 * Represents an individual stat option with metadata
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
export interface StatGroup {
	label: string;
	entries: StatEntry[];
}

/**
 * Search result with additional metadata
 */
export interface SearchResult {
	id: string | null;
	exactMatch: boolean;
	score?: number;
}

/**
 * Search context for filtering stats
 */
export interface SearchContext {
	searchTerm: string;
	normalizedTerm: string;
	isImplicitOnly: boolean;
	originalText: string;
}
