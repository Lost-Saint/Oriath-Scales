import type { TradeApiResponse, TradeSearchRequest } from '$lib/types/trade';
import { tryCatch } from '$lib/utils/error';

const BASE_URL = import.meta.env.VITE_POE_PROXY_URL || 'https://www.pathofexile.com';
const HEADERS = {
	'Content-Type': 'application/json',
	'User-Agent': 'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
	Accept: '*/*'
};

export async function searchPoETrades(request: TradeSearchRequest): Promise<{
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
	const searchUrl = `${BASE_URL}/api/trade2/search/${encodedLeague}`;
	const requestBody = JSON.stringify(request.query);
	const querySize = requestBody.length;

	console.debug(
		`Searching PoE trades for league: ${request.league}, query size: ${querySize} bytes`
	);

	const fetchResult = await tryCatch(
		fetch(searchUrl, {
			method: 'POST',
			headers: HEADERS,
			body: requestBody
		})
	);

	if (fetchResult.error) {
		const connectionError = `Failed to connect to PoE API at ${searchUrl}`;
		const detailedError = new Error(`${connectionError}: ${fetchResult.error.message}`);

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

	const responseIsOk = response.ok;
	if (!responseIsOk) {
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
		const parseError = new Error(
			`Failed to parse API response from ${searchUrl}: ${jsonResult.error.message}`
		);

		console.error('Trade API JSON parse failed:', {
			url: searchUrl,
			league: request.league,
			requestTime,
			error: jsonResult.error.message
		});

		throw parseError;
	}

	const data = jsonResult.data as TradeApiResponse;
	const dataIsObject = data && typeof data === 'object';

	if (!dataIsObject) {
		const structureError = new Error(
			`Invalid API response structure from ${searchUrl}: expected object, got ${typeof data}`
		);

		console.error('Trade API structure validation failed:', {
			url: searchUrl,
			league: request.league,
			requestTime,
			receivedType: typeof data
		});

		throw structureError;
	}

	const hasSearchId = Boolean(data.id);
	if (!hasSearchId) {
		const idError = new Error(`Invalid API response from ${searchUrl}: missing search ID`);

		console.error('Trade API missing search ID:', {
			url: searchUrl,
			league: request.league,
			requestTime,
			responseKeys: Object.keys(data)
		});

		throw idError;
	}

	const resultCount = data.result?.length || 0;
	console.debug('Trade search completed successfully:', {
		searchId: data.id,
		resultCount,
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
