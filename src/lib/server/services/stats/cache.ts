// src/lib/server/services/stats/cache.ts
import type { CacheData, StatsResult } from '$lib/types/stats';
import { tryCatch } from '$lib/utils/error';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Result of a cache read operation
 */
interface CacheReadResult {
	data: StatsResult;
	isExpired: boolean;
}

/**
 * Manages caching of stats data to reduce API calls
 */
export class StatsCache {
	private readonly cachePath: string;
	private readonly cacheDuration: number; // in milliseconds
	private readonly cacheDir: string;

	/**
	 * Creates a new stats cache manager
	 *
	 * @param cacheDuration - How long cache remains valid (in milliseconds)
	 * @param basePath - Base path for cache storage
	 */
	constructor(
		cacheDuration: number = 24 * 60 * 60 * 1000, // 24 hours in milliseconds
		basePath: string = process.cwd()
	) {
		this.cacheDuration = cacheDuration;
		this.cacheDir = join(basePath, 'src/lib/server/cache');
		this.cachePath = join(this.cacheDir, 'stats.json');
	}

	private async ensureCacheDir(): Promise<void> {
		await tryCatch(fs.mkdir(this.cacheDir, { recursive: true }));
	}

	/**
	 * Read and validate the stats cache
	 *
	 * @returns The cached data and expiration status, or null if cache read fails
	 */
	async read(): Promise<CacheReadResult | null> {
		// Ensure cache directory exists before reading
		await this.ensureCacheDir();

		const readResult = await tryCatch(fs.readFile(this.cachePath, 'utf-8'));
		if (readResult.error) {
			console.error('Error reading stats cache:', readResult.error);
			return null;
		}

		const parseResult = tryCatch<CacheData>(() => JSON.parse(readResult.data) as CacheData);

		if (parseResult.error) {
			console.error('Error parsing stats cache:', parseResult.error);
			return null;
		}

		const cache = parseResult.data;
		const now = new Date().getTime();
		const cacheTime = new Date(cache.lastUpdated).getTime();
		const isExpired = now - cacheTime > this.cacheDuration;

		return {
			data: cache.data,
			isExpired
		};
	}

	/**
	 * Write stats data to the cache file
	 *
	 * @param data - The stats data to cache
	 */
	async write(data: StatsResult): Promise<void> {
		// Ensure the cache directory exists
		await this.ensureCacheDir();

		const cacheData: CacheData = {
			data,
			lastUpdated: new Date().toISOString()
		};

		const writeResult = await tryCatch(
			fs.writeFile(this.cachePath, JSON.stringify(cacheData, null, 2))
		);

		if (writeResult.error) {
			console.error('Error writing stats cache:', writeResult.error);
			return;
		}

		console.log('Stats cache updated successfully');
	}
}

export const statsCache = new StatsCache();
