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
		const connectionError = `Connection error: ${response.error.message}`;
		throw new Error(`Failed to fetch PoE stats: ${connectionError}`);
	}

	const fetchResult = response.data;
	if (!fetchResult.ok) {
		const httpError = `HTTP ${fetchResult.status}: ${fetchResult.statusText}`;
		throw new Error(`Failed to fetch PoE stats: ${httpError}`);
	}

	const jsonResult = await tryCatch(fetchResult.json());
	if (jsonResult.error) {
		const parseError = `JSON parse error: ${jsonResult.error.message}`;
		throw new Error(`Failed to parse stats response: ${parseError}`);
	}

	const statsData = jsonResult.data as StatsResult;
	const hasValidResult = Array.isArray(statsData.result);

	if (!hasValidResult) {
		throw new Error('Invalid API response: missing or invalid "result" array');
	}

	return statsData;
}
