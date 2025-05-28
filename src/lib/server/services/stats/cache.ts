import type { StatsResult } from '$lib/types/stats';
import { tryCatch } from '$lib/utils/error';
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
	let cacheReadSuccess = false;

	const mkdirResult = await tryCatch(fs.mkdir(cacheDir, { recursive: true }));
	if (mkdirResult.error) {
		console.warn('Could not create cache directory:', mkdirResult.error);
	}

	const readResult = await tryCatch(fs.readFile(cachePath, 'utf-8'));
	const cacheFileExists = !readResult.error;

	if (cacheFileExists) {
		const rawCacheContent = readResult.data;
		const parseResult = tryCatch<CacheData>(() => {
			const parsed = JSON.parse(rawCacheContent);
			const hasRequiredFields = parsed && 
				typeof parsed === 'object' && 
				parsed.data && 
				typeof parsed.lastUpdated === 'string';
				
			if (!hasRequiredFields) {
				throw new Error('Cache data missing required fields');
			}
			return parsed as CacheData;
		});

		const jsonParseSuccess = !parseResult.error;
		if (jsonParseSuccess) {
			const cacheData = parseResult.data;
			const cacheTimestamp = new Date(cacheData.lastUpdated).getTime();
			const cacheAge = now - cacheTimestamp;
			const cacheIsValid = !isNaN(cacheTimestamp) && cacheAge >= 0;
			const cacheIsFresh = cacheIsValid && cacheAge < cacheDurationMs;

			if (cacheIsFresh) {
				cachedData = cacheData.data;
				shouldRefresh = false;
				cacheReadSuccess = true;
				console.log(`Cache hit! Age: ${Math.round(cacheAge / 1000)}s, limit: ${Math.round(cacheDurationMs / 1000)}s`);
			} else if (cacheIsValid) {
				cachedData = cacheData.data;
				shouldRefresh = true;
				console.log(`Cache expired! Age: ${Math.round(cacheAge / 1000)}s, limit: ${Math.round(cacheDurationMs / 1000)}s`);
			} else {
				console.warn('Cache has invalid timestamp, treating as expired');
				shouldRefresh = true;
			}
		} else {
			console.warn('Failed to parse cache JSON:', parseResult.error);
			shouldRefresh = true;
		}
	} else {
		console.log('No cache file found, will need fresh data');
		shouldRefresh = true;
	}

	const writeToCache = async (newData: StatsResult): Promise<void> => {
		const ensureDirResult = await tryCatch(fs.mkdir(cacheDir, { recursive: true }));
		if (ensureDirResult.error) {
			console.error('Failed to ensure cache directory exists for writing:', ensureDirResult.error);
			return;
		}

		const cacheDataToWrite: CacheData = {
			data: newData,
			lastUpdated: new Date().toISOString()
		};

		const jsonToWrite = JSON.stringify(cacheDataToWrite, null, 2);

		const writeResult = await tryCatch(fs.writeFile(cachePath, jsonToWrite, 'utf-8'));
		
		if (writeResult.error) {
			console.error('Failed to write stats cache:', writeResult.error);
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
