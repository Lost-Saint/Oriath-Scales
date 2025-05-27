import type { StatGroup, StatOption } from '$lib/types/utils';
import { tryCatch } from './error';
import Fuse from 'fuse.js';

let statsCache: StatOption[] | null = null;
let fuseInstance: Fuse<StatOption> | null = null;
let implicitFuseInstance: Fuse<StatOption> | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 60000; // 1 minute

export async function fetchStats() {
	const now = Date.now();

	if (statsCache !== null && now - lastFetchTime < CACHE_DURATION) {
		return { data: statsCache, error: null };
	}

	const fetchResult = await tryCatch(fetch('/api/poe/stats'));
	if (fetchResult.error) {
		return { data: null, error: `Network error: ${fetchResult.error.message}` };
	}

	if (!fetchResult.data.ok) {
		return {
			data: null,
			error: `Failed to fetch stats: ${fetchResult.data.status}`
		};
	}

	const jsonResult = await tryCatch(fetchResult.data.json());
	if (jsonResult.error) {
		return { data: null, error: `Failed to parse response: ${jsonResult.error.message}` };
	}

	const data = jsonResult.data;
	if (data.error) {
		return { data: null, error: data.error };
	}

	const resultExists = data.result && Array.isArray(data.result);
	if (!resultExists) {
		return { data: null, error: 'Invalid stats data received from API' };
	}

	const processResult = tryCatch(() => processStatsData(data.result));
	if (processResult.error) {
		return { data: null, error: `Failed to process stats data: ${processResult.error.message}` };
	}

	const processedStats = processResult.data;
	if (processedStats.length === 0) {
		return { data: null, error: 'No stats data received from API' };
	}

	const fuseResult = tryCatch(() => createFuseInstance(processedStats));
	if (fuseResult.error) {
		return { data: null, error: `Failed to create search index: ${fuseResult.error.message}` };
	}

	const implicitFuseResult = tryCatch(() => createImplicitFuseInstance(processedStats));
	if (implicitFuseResult.error) {
		return {
			data: null,
			error: `Failed to create implicit search index: ${implicitFuseResult.error.message}`
		};
	}

	statsCache = processedStats;
	fuseInstance = fuseResult.data;
	implicitFuseInstance = implicitFuseResult.data;
	lastFetchTime = now;

	return { data: processedStats, error: null };
}

function processStatsData(groups: StatGroup[]): StatOption[] {
	const allStats: StatOption[] = [];

	for (const group of groups) {
		if (!group.entries || !Array.isArray(group.entries)) {
			continue;
		}

		for (const entry of group.entries) {
			if (!entry.id || !entry.text) {
				continue;
			}

			const statOption: StatOption = {
				id: entry.id,
				text: entry.text,
				type: group.label,
				option: entry.option
			};
			allStats.push(statOption);
		}
	}

	return allStats;
}

function createFuseInstance(stats: StatOption[]): Fuse<StatOption> {
	return new Fuse(stats, {
		keys: ['text'],
		includeScore: true,
		threshold: 0.7,
		distance: 300,
		ignoreLocation: true,
		minMatchCharLength: 2,
		useExtendedSearch: true,
		getFn: (obj: StatOption, path: string | string[]) => {
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

function createImplicitFuseInstance(stats: StatOption[]): Fuse<StatOption> {
	const implicitStats = stats.filter((stat) => stat.type === 'Implicit');
	return createFuseInstance(implicitStats);
}

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
		.replace(/\s*\(implicit\)\s*$/i, '') // Remove (implicit) suffix
		.trim();
}

export function findStatId(statText: string) {
	if (!statsCache) {
		return { data: null, error: 'Stats cache not initialized' };
	}

	if (!fuseInstance) {
		return { data: null, error: 'Fuse instance not initialized' };
	}

	if (!implicitFuseInstance) {
		return { data: null, error: 'Implicit fuse instance not initialized' };
	}

	const normalizeResult = tryCatch(() => normalizeStatText(statText));
	if (normalizeResult.error) {
		return { data: null, error: `Failed to normalize stat text: ${normalizeResult.error.message}` };
	}

	const normalizedInput = normalizeResult.data;
	const shouldSearchImplicit = statText.toLowerCase().includes('implicit');

	const exactMatchResult = tryCatch(() => findExactMatch(normalizedInput, shouldSearchImplicit));
	if (exactMatchResult.error) {
		return { data: null, error: `Failed to find exact match: ${exactMatchResult.error.message}` };
	}

	const exactMatch = exactMatchResult.data;
	if (exactMatch) {
		console.log('Found exact match:', {
			input: normalizedInput,
			match: exactMatch.text,
			id: exactMatch.id
		});
		return { data: exactMatch.id, error: null };
	}

	const fuzzyMatchResult = tryCatch(() => findFuzzyMatch(normalizedInput, shouldSearchImplicit));
	if (fuzzyMatchResult.error) {
		return { data: null, error: `Failed to find fuzzy match: ${fuzzyMatchResult.error.message}` };
	}

	return { data: fuzzyMatchResult.data, error: null };
}

function findExactMatch(normalizedInput: string, implicitOnly: boolean): StatOption | null {
	if (!statsCache) return null;

	const relevantStats = implicitOnly
		? statsCache.filter((stat) => stat.type === 'Implicit')
		: statsCache;

	for (const stat of relevantStats) {
		const normalizedStatText = normalizeStatText(stat.text);

		if (normalizedStatText === normalizedInput) {
			return stat;
		}
	}

	return null;
}

function findFuzzyMatch(normalizedInput: string, implicitOnly: boolean): string | null {
	const searchInstance = implicitOnly ? implicitFuseInstance : fuseInstance;

	if (!searchInstance) return null;

	const results = searchInstance.search(normalizedInput);
	const firstResult = results[0];

	if (!firstResult) return null;
	if (firstResult.score === undefined) return null;
	if (firstResult.score >= 0.8) return null;

	return firstResult.item.id;
}

export function extractValue(statText: string) {
	const extractResult = tryCatch(() => {
		const matches = statText.match(/([+-]?\d+\.?\d*)/g);

		if (!matches) {
			return 0;
		}

		const firstMatch = matches[0];
		const parsed = parseFloat(firstMatch);

		if (isNaN(parsed)) {
			throw new Error(`Invalid number format: ${firstMatch}`);
		}

		return parsed;
	});

	if (extractResult.error) {
		console.warn(`Failed to extract value from "${statText}":`, extractResult.error.message);
		return { data: 0, error: extractResult.error.message };
	}

	return { data: extractResult.data, error: null };
}
