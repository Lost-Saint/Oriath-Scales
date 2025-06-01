import type { StatGroup, StatOption } from '$lib/types/utils';
import { tryCatch } from '$lib/utils/error';
import Fuse from 'fuse.js';

let statsCache: StatOption[] | null = null;
let fuseInstance: Fuse<StatOption> | null = null;
let implicitFuseInstance: Fuse<StatOption> | null = null;
let lastFetchAttempt = 0;

const CACHE_RETRY_INTERVAL = 60000;
const FUSE_THRESHOLD = 0.8;

export async function fetchStats(): Promise<StatOption[]> {
	const now = Date.now();
	const timeSinceLastTry = now - lastFetchAttempt;
	const tooSoonToRetry = timeSinceLastTry < CACHE_RETRY_INTERVAL;
	const hasCache = statsCache !== null;

	if (statsCache !== null && fuseInstance !== null) {
		return statsCache;
	}

	if (tooSoonToRetry && !hasCache) {
		throw new Error('Stats cache is unavailable. Please try again later.');
	}

	lastFetchAttempt = now;

	const fetchResult = await tryCatch(fetch('/api/poe/stats', { cache: 'force-cache' }));

	if (fetchResult.error) {
		clearStatsCache();
		throw new Error(`Network failed: ${fetchResult.error.message}`);
	}

	const response = fetchResult.data;
	const responseIsOk = response.ok;

	if (!responseIsOk) {
		clearStatsCache();
		throw new Error(`Server error: ${response.status}`);
	}

	const jsonResult = await tryCatch(response.json());

	if (jsonResult.error) {
		clearStatsCache();
		throw new Error('Bad JSON from server');
	}

	const data = jsonResult.data;
	const dataHasError = data.error;
	const dataHasResult = data.result;
	const resultIsArray = Array.isArray(data.result);

	if (dataHasError) {
		clearStatsCache();
		throw new Error(data.error);
	}

	if (!dataHasResult || !resultIsArray) {
		clearStatsCache();
		throw new Error('No stats data from server');
	}

	const allStats: StatOption[] = [];
	const implicitStats: StatOption[] = [];

	for (let i = 0; i < data.result.length; i++) {
		const group = data.result[i] as StatGroup;
		const groupHasEntries = group.entries && Array.isArray(group.entries);

		if (!groupHasEntries) {
			continue;
		}

		for (let j = 0; j < group.entries.length; j++) {
			const entry = group.entries[j];

			if (!entry) continue;

			const stat: StatOption = {
				id: entry.id,
				text: entry.text,
				type: group.label,
				option: entry.option
			};

			allStats.push(stat);

			const statIsImplicit = group.label === 'Implicit';
			if (statIsImplicit) {
				implicitStats.push(stat);
			}
		}
	}

	const hasStats = allStats.length > 0;
	if (!hasStats) {
		clearStatsCache();
		throw new Error('No stats received');
	}

	statsCache = allStats;
	fuseInstance = createFuseInstance(allStats);

	const hasImplicitStats = implicitStats.length > 0;
	if (hasImplicitStats) {
		implicitFuseInstance = createFuseInstance(implicitStats);
	}

	return allStats;
}

export function findStatId(statText: string): string | null {
	if (!statsCache || !fuseInstance) {
		console.error('Stats cache not ready');
		return null;
	}

	const cleanInput = normalizeStatText(statText);
	if (cleanInput.length === 0) {
		return null;
	}

	const searchingForImplicit = statText.toLowerCase().includes('implicit');

	let statsToSearch: StatOption[] = statsCache;
	let searchInstance: Fuse<StatOption> = fuseInstance;

	if (searchingForImplicit && implicitFuseInstance) {
		statsToSearch = statsCache.filter((stat) => stat.type === 'Implicit');
		searchInstance = implicitFuseInstance;
	}

	for (const stat of statsToSearch) {
		if (!stat) continue;

		if (normalizeStatText(stat.text) === cleanInput) {
			console.log('Exact match found:', {
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
	const bestResult = searchResults[0];

	if (bestResult && bestResult.score !== undefined && bestResult.score < FUSE_THRESHOLD) {
		console.log('Fuzzy match found:', {
			input: cleanInput,
			match: bestResult.item.text,
			id: bestResult.item.id,
			type: bestResult.item.type,
			score: bestResult.score,
			wasImplicitSearch: searchingForImplicit
		});
		return bestResult.item.id;
	}

	console.log('No match found:', {
		input: cleanInput,
		wasImplicitSearch: searchingForImplicit,
		statsSearched: statsToSearch.length
	});
	return null;
}

function createFuseInstance(stats: StatOption[]): Fuse<StatOption> {
	return new Fuse(stats, {
		keys: ['text'],
		includeScore: true,
		threshold: FUSE_THRESHOLD,
		distance: 300,
		ignoreLocation: true,
		minMatchCharLength: 2,
		useExtendedSearch: true,
		getFn: (obj, path) => {
			if (path === 'text' && typeof obj.text === 'string') {
				return normalizeStatText(obj.text);
			}

			const value = obj[path as keyof StatOption];
			return value != null ? String(value) : '';
		}
	});
}

function clearStatsCache(): void {
	statsCache = null;
	fuseInstance = null;
	implicitFuseInstance = null;
}

function normalizeStatText(text: string): string {
	if (!text || typeof text !== 'string') {
		return '';
	}

	return text
		.toLowerCase()
		.replace(/\+(?=\d)/g, '') // Remove plus signs before numbers
		.replace(/\[|\]/g, '') // Remove brackets
		.replace(/\|.*?(?=\s|$)/g, '') // Remove pipe sections
		.replace(/[+-]?\d+\.?\d*/g, '#') // Replace numbers with placeholder
		.replace(/\s+/g, ' ') // Normalize whitespace
		.replace(/\s*\(implicit\)$/, '') // remove `(implicit)`
		.replace(/^adds /, '') // Remove common prefixes
		.replace(/^gain /, '')
		.replace(/^you /, '')
		.trim();
}

export function extractValue(statText: unknown): number {
	if (typeof statText !== 'string') {
		return 0;
	}

	const match = statText.match(/([+-]?\d+\.?\d*)/);
	if (!match || typeof match[1] !== 'string') {
		return 0;
	}

	const value = parseFloat(match[1]);
	return isFinite(value) ? value : 0;
}
