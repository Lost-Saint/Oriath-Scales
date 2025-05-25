import type { TradeApiResponse, TradeSearchRequest } from '$lib/types/trade';
import { tryCatch } from '$lib/utils/error';

/**
 * Path of Exile Trade API Client
 *
 * Handles trade search requests to the official Path of Exile API
 * with configurable proxy support and comprehensive error handling.
 */
export class TradeApiService {
	private readonly baseUrl =
		import.meta.env.VITE_POE_PROXY_URL || 'https://www.pathofexile.com';
	private readonly headers = {
		'Content-Type': 'application/json',
		'User-Agent':
			'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
		Accept: '*/*'
	};

	/**
	 * Get the configured base URL for API requests
	 */
	getBaseUrl(): string {
		return this.baseUrl;
	}

	/**
	 * Performs a trade search request
	 *
	 * @param request Search request with league and query parameters
	 * @returns Promise resolving to response and parsed data
	 * @throws Error for connection or parsing failures
	 */
	async search(request: TradeSearchRequest): Promise<{
		response: Response;
		data: TradeApiResponse;
	}> {
		const url = `${this.baseUrl}/api/trade2/search/${encodeURIComponent(request.league)}`;

		const result = await tryCatch(
			fetch(url, {
				method: 'POST',
				headers: this.headers,
				body: JSON.stringify(request.query)
			})
		);

		if (result.error) {
			throw new Error(`Failed to connect to PoE API: ${result.error.message}`);
		}

		const response = result.data;

		if (!response.ok) {
			return {
				response,
				data: { id: '', result: [] }
			};
		}

		const json = await tryCatch(response.json());
		if (json.error) {
			throw new Error(`Failed to parse API response: ${json.error.message}`);
		}

		const data = json.data as TradeApiResponse;
		if (!data.id) {
			throw new Error('Invalid API response: missing search ID');
		}

		return { response, data };
	}
}

// Singleton instance
export const tradeApiService = new TradeApiService();
