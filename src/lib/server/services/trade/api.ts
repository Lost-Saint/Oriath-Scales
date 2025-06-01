import type { TradeApiResponse, TradeSearchRequest } from '$lib/types/trade';
import { tryCatch } from '$lib/utils/error';

const BASE_URL = import.meta.env.VITE_POE_PROXY_URL || 'https://www.pathofexile.com';
const HEADERS = {
	'Content-Type': 'application/json',
	'User-Agent': 'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
	Accept: '*/*'
};

async function makeTradeRequest(url: string, body: string): Promise<Response> {
	const fetchResult = await tryCatch(
		fetch(url, {
			method: 'POST',
			headers: HEADERS,
			body
		})
	);

	const fetchFailed = fetchResult.error !== null;
	if (fetchFailed) {
		const errorMessage = `Connection failed: ${fetchResult.error.message}`;
		console.error('Trade API connection failed:', {
			url,
			error: fetchResult.error.message
		});
		throw new Error(errorMessage);
	}

	return fetchResult.data;
}

async function parseTradeResponse(response: Response, url: string): Promise<TradeApiResponse> {
	const jsonResult = await tryCatch(response.json());
	const parseFailed = jsonResult.error !== null;

	if (parseFailed) {
		const errorMessage = `JSON parse failed: ${jsonResult.error.message}`;
		console.error('Trade API JSON parse failed:', {
			url,
			error: jsonResult.error.message
		});
		throw new Error(errorMessage);
	}

	const data = jsonResult.data;
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

	const parseResult = await tryCatch(parseTradeResponse(response, searchUrl));

	if (parseResult.error !== null) {
		console.error('Failed to parse trade response:', {
			error: parseResult.error.message,
			url: searchUrl,
			league: request.league,
			requestTime
		});
		throw parseResult.error;
	}

	const data = parseResult.data;
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
