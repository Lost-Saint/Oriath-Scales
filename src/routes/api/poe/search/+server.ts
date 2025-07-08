import { searchPoETrades } from '$lib/server/services/trade/poe-trade.api.js';
import { rateLimitService } from '$lib/server/services/trade/rate-limit.service.js';
import type { ErrorResponse, TradeSearchRequest } from '$lib/types/trade-api.types.js';
import { attempt } from '$lib/utils/attempt.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	const rateLimitCheck = rateLimitService.checkAndIncrementLimit();
	if (!rateLimitCheck.allowed) {
		const timeToWait = rateLimitCheck.timeToWait || 0;
		return createErrorResponse(
			{
				error: 'Rate limit exceeded',
				details: `Please wait ${timeToWait} seconds before trying again`,
				retryAfter: timeToWait,
				rateLimitStatus: rateLimitService.getStatus()
			},
			429
		);
	}

	const [bodyError, searchRequest] = await attempt<Error, TradeSearchRequest>(request.json());
	if (bodyError) {
		console.error('Error parsing request body:', bodyError);
		return createErrorResponse(
			{
				error: 'Invalid request',
				details: 'Failed to parse request body'
			},
			400
		);
	}

	const [searchError, searchResult] = await attempt(searchPoETrades(searchRequest));
	if (searchError) {
		console.error('Error in trade search:', searchError);
		const errorMessage = searchError instanceof Error ? searchError.message : String(searchError);
		return createErrorResponse(
			{
				error: 'Trade API error',
				details: errorMessage
			},
			500
		);
	}

	const { response, data } = searchResult;
	rateLimitService.updateFromHeaders(response.headers);

	if (!response.ok) {
		return handleApiError(response);
	}

	return json(data);
};

function handleApiError(response: Response): Response {
	if (response.status === 429) {
		const retryAfter = rateLimitService.getRetryAfterFromHeaders(response.headers) || 10;

		rateLimitService.setRestriction(retryAfter);
		console.log(`[Rate Limits] API returned 429 - ${rateLimitService.getStatus()}`);

		return createErrorResponse(
			{
				error: 'Rate limit exceeded',
				details: `Please wait ${retryAfter} seconds`,
				retryAfter,
				rateLimitStatus: rateLimitService.getStatus()
			},
			429
		);
	}

	if (response.status === 403) {
		console.error('API Access Forbidden:', {
			status: response.status,
			statusText: response.statusText,
			headers: Object.fromEntries(response.headers.entries())
		});

		return createErrorResponse(
			{
				error: 'API Access Forbidden',
				details:
					'The PoE Trade API is currently blocking requests from this service. Please try using the official trade site directly.'
			},
			403
		);
	}

	return createErrorResponse(
		{
			error: `API Error: ${response.status}`,
			details: response.statusText
		},
		response.status
	);
}

function createErrorResponse(data: ErrorResponse, status: number): Response {
	return json(data, { status });
}
