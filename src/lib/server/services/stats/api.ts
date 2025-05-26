import type { StatsResult } from '$lib/types/stats';
import { tryCatch } from '$lib/utils/error';

/**
 * Path of Exile Stats API Client
 *
 * Handles communication with the official Path of Exile trade API
 * to fetch game statistics data with proper error handling and validation.
 */
export class StatsApi {
	private readonly apiUrl = 'https://www.pathofexile.com/api/trade2/data/stats';
	private readonly headers = {
		'User-Agent': 'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
		Accept: 'application/json'
	};

	async fetchStats(): Promise<StatsResult> {
		const response = await tryCatch(fetch(this.apiUrl, { headers: this.headers }));

		if (response.error || !response.data.ok) {
			const message = response.error
				? `Connection error: ${response.error.message}`
				: `API error: ${response.data.status} ${response.data.statusText}`;
			throw new Error(`Failed to fetch PoE stats: ${message}`);
		}

		const json = await tryCatch(response.data.json());
		if (json.error) {
			throw new Error(`Failed to parse stats response: ${json.error.message}`);
		}

		const data = json.data as StatsResult;
		if (!Array.isArray(data.result)) {
			throw new Error('Invalid API response: missing or invalid "result" array');
		}

		return data;
	}
}

export const statsApi = new StatsApi();
