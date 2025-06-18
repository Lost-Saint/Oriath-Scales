import type { TradeApiResponse, TradeSearchRequest } from '$lib/types/trade.js';
import { attempt } from '$lib/utils/attempt.js';

const BASE_URL = import.meta.env.VITE_POE_PROXY_URL || 'https://www.pathofexile.com';
const HEADERS = {
	'Content-Type': 'application/json',
	'User-Agent': 'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
	Accept: '*/*'
};

async function makeTradeRequest(url: string, body: string): Promise<Response> {
	const [fetchError, response] = await attempt(
		fetch(url, {
			method: 'POST',
			headers: HEADERS,
			body
		})
	);

	if (fetchError) {
		const errorMessage = `Connection failed: ${fetchError.message}`;
		console.error('Trade API connection failed:', {
			url,
			error: fetchError.message
		});
		throw new Error(errorMessage);
	}

	return response;
}

async function parseTradeResponse(response: Response, url: string): Promise<TradeApiResponse> {
	const [jsonError, data] = await attempt(response.json());

	if (jsonError) {
		const errorMessage = `JSON parse failed: ${jsonError.message}`;
		console.error('Trade API JSON parse failed:', {
			url,
			error: jsonError.message
		});
		throw new Error(errorMessage);
	}

	const dataIsValid = data && typeof data === 'object';

	if (!dataIsValid) {
		const errorMessage = `Invalid response structure: expected object, got ${typeof data}`;
		console.error('Trade API structure validation failed:', {
			url,
			receivedType: typeof data
		});
		throw new Error(errorMessage);
	}

	return data as TradeApiResponse;
}

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
	const searchUrl = buildSearchUrl(request.league);
	const requestBody = JSON.stringify(request.query);
	const querySize = requestBody.length;

	console.debug(
		`Searching PoE trades for league: ${request.league}, query size: ${querySize} bytes`
	);

	const response = await makeTradeRequest(searchUrl, requestBody);
	const requestTime = Date.now() - startTime;

	if (!response.ok) {
		throw new Error(
			`Trade API request failed with status ${response.status} (${response.statusText})`
		);
	}

	const [parseError, data] = await attempt(parseTradeResponse(response, searchUrl));

	if (parseError) {
		console.error('Failed to parse trade response:', {
			error: parseError.message,
			url: searchUrl,
			league: request.league,
			requestTime
		});
		throw parseError;
	}

	const dataHasSearchId = Boolean(data.id);

	if (!dataHasSearchId) {
		const errorMessage = `Invalid API response from ${searchUrl}: missing search ID`;
		console.error('Trade API missing search ID:', {
			url: searchUrl,
			league: request.league,
			requestTime,
			responseKeys: Object.keys(data)
		});
		throw new Error(errorMessage);
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

function buildSearchUrl(league: string): string {
	const encodedLeague = encodeURIComponent(league);
	return `${BASE_URL}/api/trade2/search/${encodedLeague}`;
}
