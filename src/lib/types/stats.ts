export interface StatEntry {
	id: string;
	text: string;
	type: string;
}

export interface StatGroup {
	id: string;
	label: string;
	entries: StatEntry[];
}

export interface StatsResult {
	result: StatGroup[];
}

export interface CacheData {
	data: StatsResult;
	lastUpdated: string;
}
