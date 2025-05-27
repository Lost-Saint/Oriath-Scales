import type { StatEntry, StatGroup, StatOption } from '$lib/types/utils';
import { tryCatch } from '$lib/utils/error';
import Fuse from 'fuse.js';

let statsCache: StatOption[] | null = null;
let fuseInstance: Fuse<StatOption> | null = null;
let lastFetchAttempt = 0;
const CACHE_RETRY_INTERVAL = 60000;

export async function fetchStats(): Promise<StatOption[]> {
	const now = Date.now();

	const timeSinceLastTry = now - lastFetchAttempt;
	const tooSoonToRetry = timeSinceLastTry < CACHE_RETRY_INTERVAL;
	const noCache = !statsCache;

	if (tooSoonToRetry && noCache) {
		throw new Error('Stats cache is unavailable. Please try again later.');
	}

	if (statsCache && fuseInstance) {
		return statsCache;
	}

	lastFetchAttempt = now;

	const fetchResult = await tryCatch(
		fetch('/api/poe/stats', {
			cache: 'force-cache'
		})
	);

	if (fetchResult.error) {
		console.error('Failed to fetch stats:', fetchResult.error);
		clearStatsCache();
		throw new Error(`Failed to fetch stats: ${fetchResult.error.message}`);
	}

	const response = fetchResult.data;

	if (!response.ok) {
		clearStatsCache();
		throw new Error(`Failed to fetch stats: ${response.status}`);
	}

	const jsonResult = await tryCatch(response.json());

	if (jsonResult.error) {
		console.error('Failed to parse stats JSON:', jsonResult.error);
		clearStatsCache();
		throw new Error('Failed to parse stats response');
	}

	const data = jsonResult.data;

	if (data.error) {
		clearStatsCache();
		throw new Error(data.error);
	}

	if (!data.result || !Array.isArray(data.result)) {
		clearStatsCache();
		throw new Error('Invalid stats data received from API');
	}

	const processedStats = data.result.flatMap((group: StatGroup) =>
		group.entries.map((entry: StatEntry) => ({
			id: entry.id,
			text: entry.text,
			type: group.label,
			option: entry.option
		}))
	);

	if (processedStats.length === 0) {
		clearStatsCache();
		throw new Error('No stats data received from API');
	}

	statsCache = processedStats;
	fuseInstance = new Fuse(processedStats, {
		keys: ['text'],
		includeScore: true,
		threshold: 0.7,
		distance: 300,
		ignoreLocation: true,
		minMatchCharLength: 2,
		useExtendedSearch: true,
		getFn: (obj, path) => {
			const value = obj[path as keyof StatOption];
			if (path === 'text') {
				return normalizeStatText(value as string);
			}
			return value ? String(value) : '';
		}
	});

	return processedStats;
}

export function findStatId(statText: string): string | null {
	if (!statsCache || !fuseInstance) {
		console.error('Stats cache is not initialized');
		return null;
	}

	const cleanInput = normalizeStatText(statText);
	const searchingForImplicit = statText.toLowerCase().includes('implicit');

	let statsToSearch = statsCache;
	let searchInstance = fuseInstance;

	if (searchingForImplicit) {
		statsToSearch = statsCache.filter((stat) => stat.type === 'Implicit');

		searchInstance = new Fuse(statsToSearch, {
			keys: ['text'],
			includeScore: true,
			threshold: 0.7,
			distance: 300,
			ignoreLocation: true,
			minMatchCharLength: 2,
			useExtendedSearch: true,
			getFn: (obj, path) => {
				const value = obj[path as keyof StatOption];
				if (path === 'text') {
					return normalizeStatText(value as string);
				}
				return value ? String(value) : '';
			}
		});
	}

	for (let i = 0; i < statsToSearch.length; i++) {
		const stat = statsToSearch[i];

		if (!stat) {
			continue;
		}

		const cleanStatText = normalizeStatText(stat.text);

		if (cleanStatText === cleanInput) {
			console.log('Found exact match:', {
				input: cleanInput,
				match: stat.text,
				id: stat.id,
				type: stat.type,
				wasImplicitSearch: searchingForImplicit
			});
			return stat.id;
		}
	}

	const searchResults = searchInstance.search(cleanInput);

	if (searchResults.length > 0) {
		const bestResult = searchResults[0];

		if (bestResult && bestResult.score !== undefined && bestResult.score < 0.8) {
			console.log('Found fuzzy match:', {
				input: cleanInput,
				match: bestResult.item.text,
				id: bestResult.item.id,
				type: bestResult.item.type,
				score: bestResult.score,
				wasImplicitSearch: searchingForImplicit
			});
			return bestResult.item.id;
		}
	}

	console.log('No match found for:', {
		input: cleanInput,
		wasImplicitSearch: searchingForImplicit,
		statsSearched: statsToSearch.length
	});
	return null;
}

function clearStatsCache(): void {
	statsCache = null;
	fuseInstance = null;
}

function normalizeStatText(text: string): string {
	return text
		.toLowerCase()
		.replace(/\+(?=\d)/g, '') // Remove plus signs before numbers
		.replace(/\[|\]/g, '') // Remove brackets
		.replace(/\|.*?(?=\s|$)/g, '') // Remove pipe sections
		.replace(/[+-]?\d+\.?\d*/g, '#') // Replace numbers with placeholder
		.replace(/\s+/g, ' ') // Normalize whitespace
		.replace(/\s*\(implicit\)$/, '')
		.replace(/^adds /, '') // Remove common prefixes
		.replace(/^gain /, '')
		.replace(/^you /, '')
		.trim();
}

export function extractValue(statText: string): number {
	const numbers = statText.match(/([+-]?\d+\.?\d*)/g);

	if (!numbers) {
		return 0;
	}

	return parseFloat(numbers[0]);
}
