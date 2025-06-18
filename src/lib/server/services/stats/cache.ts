import type { StatsResult } from '$lib/types/stats.js';
import { attempt } from '$lib/utils/attempt.js';
import { promises as fs } from 'fs';
import { join } from 'path';

interface CacheData {
	data: StatsResult;
	lastUpdated: string;
}

interface StatsFromCacheResult {
	data: StatsResult | null;
	shouldRefresh: boolean;
	writeToCache: (newData: StatsResult) => Promise<void>;
}

export async function getStatsFromCache(
	cacheDurationMs: number = 24 * 60 * 60 * 1000,
	basePath: string = process.cwd()
): Promise<StatsFromCacheResult> {
	const cacheDir = join(basePath, 'src/lib/server/cache');
	const cachePath = join(cacheDir, 'stats.json');
	const now = Date.now();

	let cachedData: StatsResult | null = null;
	let shouldRefresh = true;

	const [mkdirError] = await attempt(fs.mkdir(cacheDir, { recursive: true }));
	if (mkdirError) {
		console.warn('Could not create cache directory:', mkdirError);
	}

	const [readError, rawCacheContent] = await attempt(fs.readFile(cachePath, 'utf-8'));
	const cacheFileExists = !readError;

	if (cacheFileExists) {
		const [parseError, cacheData] = attempt<Error, CacheData>(() => {
			const parsed = JSON.parse(rawCacheContent);
			const hasRequiredFields =
				parsed &&
				typeof parsed === 'object' &&
				parsed.data &&
				typeof parsed.lastUpdated === 'string';

			if (!hasRequiredFields) {
				throw new Error('Cache data missing required fields');
			}
			return parsed as CacheData;
		});

		if (!parseError) {
			const cacheTimestamp = new Date(cacheData.lastUpdated).getTime();
			const cacheAge = now - cacheTimestamp;

			if (!isNaN(cacheTimestamp) && cacheAge >= 0) {
				cachedData = cacheData.data;
				shouldRefresh = cacheAge >= cacheDurationMs;

				console.log(
					`Cache ${shouldRefresh ? 'expired' : 'hit'}! Age: ${Math.round(cacheAge / 1000)}s, limit: ${Math.round(
						cacheDurationMs / 1000
					)}s`
				);
			} else {
				console.warn('Cache has invalid timestamp, treating as expired');
			}
		} else {
			console.warn('Failed to parse cache JSON:', parseError);
		}
	} else {
		console.log('No cache file found, will need fresh data');
	}

	const writeToCache = async (newData: StatsResult): Promise<void> => {
		const cacheDataToWrite: CacheData = {
			data: newData,
			lastUpdated: new Date().toISOString()
		};

		const jsonToWrite = JSON.stringify(cacheDataToWrite, null, 2);

		const [writeError] = await attempt(fs.writeFile(cachePath, jsonToWrite, 'utf-8'));

		if (writeError) {
			console.error('Failed to write stats cache:', writeError);
			return;
		}

		const dataSize = jsonToWrite.length;
		console.log(`Cache written successfully (${dataSize} bytes)`);
	};

	return {
		data: cachedData,
		shouldRefresh,
		writeToCache
	};
}

export async function getCachedStats(): Promise<StatsFromCacheResult> {
	return getStatsFromCache();
}
