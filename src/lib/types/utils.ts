export interface StatApiResponse {
	result?: StatGroup[];
	error?: string;
}

export interface StatOption {
	id: string;
	text: string;
	type: string;
	option?: Record<string, unknown>;
}

export interface StatEntry {
	id: string;
	text: string;
	option?: Record<string, unknown>;
}

export interface StatGroup {
	label: string;
	entries: StatEntry[];
}

export interface SearchResult {
	id: string | null;
	exactMatch: boolean;
	score?: number;
}

export interface SearchContext {
	searchTerm: string;
	normalizedTerm: string;
	isImplicitOnly: boolean;
	originalText: string;
}
