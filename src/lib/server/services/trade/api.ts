import type { TradeApiResponse, TradeSearchRequest } from '$lib/types/trade';
import { tryCatch } from '$lib/utils/error';

/**
 * Path of Exile Trade API Client
 *
 * Handles trade search requests to the official Path of Exile API
 * with configurable proxy support and comprehensive error handling.
 */
export class TradeApiService {
	private readonly baseUrl = import.meta.env.VITE_POE_PROXY_URL || 'https://www.pathofexile.com';
	private readonly headers = {
		'Content-Type': 'application/json',
		'User-Agent': 'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
		Accept: '*/*'
	};

	getBaseUrl(): string {
		return this.baseUrl;
	}

	async searchTrades(request: TradeSearchRequest): Promise<{
		response: Response;
		data: TradeApiResponse;
		metadata: {
			searchUrl: string;
			requestTime: number;
			league: string;
			querySize: number;
		};
	}> {
		const startTime = Date.now();
		
		const encodedLeague = encodeURIComponent(request.league);
		const searchUrl = `${this.baseUrl}/api/trade2/search/${encodedLeague}`;
		
		const requestBody = JSON.stringify(request.query);
		const querySize = requestBody.length;
		
		console.debug(`Searching PoE trades for league: ${request.league}, query size: ${querySize} bytes`);
		
		const fetchResult = await tryCatch(
			fetch(searchUrl, {
				method: 'POST',
				headers: this.headers,
				body: requestBody
			})
		);

		if (fetchResult.error) {
			const errorMessage = `Failed to connect to PoE API at ${searchUrl}`;
			const detailedError = new Error(`${errorMessage}: ${fetchResult.error.message}`);
			console.error('Trade API connection failed:', {
				url: searchUrl,
				league: request.league,
				error: fetchResult.error.message,
				requestTime: Date.now() - startTime
			});
			throw detailedError;
		}

		const response = fetchResult.data;
		const requestTime = Date.now() - startTime;

		if (!response.ok) {
			console.warn('Trade API returned non-OK status:', {
				status: response.status,
				statusText: response.statusText,
				url: searchUrl,
				league: request.league,
				requestTime
			});

			return {
				response,
				data: { id: '', result: [] },
				metadata: {
					searchUrl,
					requestTime,
					league: request.league,
					querySize
				}
			};
		}

		const jsonResult = await tryCatch(response.json());
		if (jsonResult.error) {
			const parseError = new Error(`Failed to parse API response from ${searchUrl}: ${jsonResult.error.message}`);
			console.error('Trade API JSON parse failed:', {
				url: searchUrl,
				league: request.league,
				requestTime,
				error: jsonResult.error.message
			});
			throw parseError;
		}

		const data = jsonResult.data as TradeApiResponse;
		if (!data || typeof data !== 'object') {
			const structureError = new Error(`Invalid API response structure from ${searchUrl}: expected object, got ${typeof data}`);
			console.error('Trade API structure validation failed:', {
				url: searchUrl,
				league: request.league,
				requestTime,
				receivedType: typeof data
			});
			throw structureError;
		}

		if (!data.id) {
			const idError = new Error(`Invalid API response from ${searchUrl}: missing search ID`);
			console.error('Trade API missing search ID:', {
				url: searchUrl,
				league: request.league,
				requestTime,
				responseKeys: Object.keys(data)
			});
			throw idError;
		}

		console.debug('Trade search completed successfully:', {
			searchId: data.id,
			resultCount: data.result?.length || 0,
			league: request.league,
			requestTime,
			url: searchUrl
		});

		return {
			response,
			data,
			metadata: {
				searchUrl,
				requestTime,
				league: request.league,
				querySize
			}
		};
	}

	async fetchItemDetails(searchId: string, itemIds: string[], league: string): Promise<any[]> {
		const url = `${this.baseUrl}/api/trade2/fetch/${searchId}?query=${itemIds.join(',')}`;
		
		const result = await tryCatch(
			fetch(url, {
				method: 'GET',
				headers: this.headers
			})
		);

		if (result.error) {
			throw new Error(`Failed to fetch item details: ${result.error.message}`);
		}

		const response = result.data;
		if (!response.ok) {
			throw new Error(`Item details request failed: ${response.status} ${response.statusText}`);
		}

		const json = await tryCatch(response.json());
		if (json.error) {
			throw new Error(`Failed to parse item details: ${json.error.message}`);
		}

		return json.data?.result || [];
	}

	isValidLeague(league: string): boolean {
		return typeof league === 'string' && league.trim().length > 0 && league.length < 100;
	}

	formatSearchUrl(league: string): string {
		return `${this.baseUrl}/api/trade2/search/${encodeURIComponent(league)}`;
	}
}

export const tradeApiService = new TradeApiService();
