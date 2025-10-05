import { searchPoETrades } from '$lib/server/services/trade/poe-trade.api.js';
import { rateLimitService } from '$lib/server/services/trade/rate-limit.service.js';
import type { ErrorResponse, TradeSearchRequest } from '$lib/types/trade-api.types.js';
import { attempt } from '$lib/utils/attempt.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const createErrorResponse = (data: ErrorResponse, status: number): Response =>
	json(data, { status });

const handleRateLimitError = (timeToWait: number): Response =>
	createErrorResponse(
		{
			error: 'Rate limit exceeded',
			details: `Please wait ${timeToWait} seconds before trying again`,
			retryAfter: timeToWait,
			rateLimitStatus: rateLimitService.getStatus()
		},
		429
	);

const handleApiError = (response: Response): Response => {
	const errorMap: Record<number, () => Response> = {
		429: () => {
			const retryAfter = rateLimitService.getRetryAfterFromHeaders(response.headers) || 10;
			rateLimitService.setRestriction(retryAfter);
			console.log(`[Rate Limits] API returned 429 - ${rateLimitService.getStatus()}`);
			return handleRateLimitError(retryAfter);
		},
		403: () => {
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
	};

	const handler = errorMap[response.status];
	return handler
		? handler()
		: createErrorResponse(
				{
					error: `API Error: ${response.status}`,
					details: response.statusText
				},
				response.status
			);
};

export const POST: RequestHandler = async ({ request }) => {
	// Check rate limits first
	const rateLimitCheck = rateLimitService.checkAndIncrementLimit();
	if (!rateLimitCheck.allowed) {
		return handleRateLimitError(rateLimitCheck.timeToWait || 0);
	}

	// Parse request body
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

	// Execute search
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

	// Process response
	const { response, data } = searchResult;
	rateLimitService.updateFromHeaders(response.headers);

	return response.ok ? json(data) : handleApiError(response);
};
