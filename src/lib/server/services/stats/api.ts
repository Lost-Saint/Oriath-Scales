import type { StatsResult } from '$lib/types/stats';
import { attempt } from '$lib/utils/attempt';

export async function fetchPoEStats(): Promise<StatsResult> {
	const [fetchError, response] = await attempt(
		fetch('https://www.pathofexile.com/api/trade2/data/stats', {
			headers: {
				'User-Agent': 'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
				Accept: 'application/json'
			}
		})
	);

	if (fetchError) {
		throw new Error(`Failed to fetch PoE stats: Connection error: ${fetchError.message}`);
	}

	if (!response.ok) {
		throw new Error(`Failed to fetch PoE stats: HTTP ${response.status}: ${response.statusText}`);
	}

	const [jsonError, statsData] = await attempt(response.json());
	if (jsonError) {
		throw new Error(`Failed to parse stats response: ${jsonError.message}`);
	}

	if (!statsData || !Array.isArray(statsData.result)) {
		throw new Error('Invalid API response: missing or invalid "result" array');
	}

	return statsData as StatsResult;
}
