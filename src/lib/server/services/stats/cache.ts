// src/lib/server/services/stats/cache.ts
import type { CacheData, StatsResult } from '$lib/types/stats';
import { tryCatch } from '$lib/utils/error';
import { promises as fs } from 'fs';
import { join } from 'path';
interface CacheReadResult {
	data: StatsResult;
	isExpired: boolean;
}
export class StatsCache {
	private readonly cachePath: string;
	private readonly cacheDuration: number; // in milliseconds
	private readonly cacheDir: string;

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

	async read(): Promise<CacheReadResult | null> {
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

	async write(data: StatsResult): Promise<void> {
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
