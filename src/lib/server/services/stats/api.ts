import type { StatsResult } from '$lib/types/stats';
import { tryCatch } from '$lib/utils/error';

export async function fetchPoEStats(): Promise<StatsResult> {
	const response = await tryCatch(
		fetch('https://www.pathofexile.com/api/trade2/data/stats', {
			headers: {
				'User-Agent': 'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
				Accept: 'application/json'
			}
		})
	);

	if (response.error) {
		throw new Error(`Failed to fetch PoE stats: Connection error: ${response.error.message}`);
	}

	const fetchResult = response.data;
	if (!fetchResult || !fetchResult.ok) {
		const httpError = fetchResult
			? `HTTP ${fetchResult.status}: ${fetchResult.statusText}`
			: 'No response object';
		throw new Error(`Failed to fetch PoE stats: ${httpError}`);
	}

	const jsonResult = await tryCatch(fetchResult.json());
	if (jsonResult.error) {
		throw new Error(`Failed to parse stats response: ${jsonResult.error.message}`);
	}

	const statsData = jsonResult.data;
	if (!statsData || !Array.isArray(statsData.result)) {
		throw new Error('Invalid API response: missing or invalid "result" array');
	}

	return statsData as StatsResult;
}
