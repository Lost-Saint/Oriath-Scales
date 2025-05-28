import { searchPoETrades } from '$lib/server/services/trade/api';
import { rateLimitService } from '$lib/server/services/trade/rateLimit';
import type { ErrorResponse, TradeSearchRequest } from '$lib/types/trade';
import { tryCatch } from '$lib/utils/error';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const rateLimitCheck = rateLimitService.checkAndIncrementLimit();
	const isRateLimited = !rateLimitCheck.allowed;

	if (isRateLimited) {
		const timeToWait = rateLimitCheck.timeToWait;
		const rateLimitError: ErrorResponse = {
			error: 'Rate limit exceeded',
			details: `Please wait ${timeToWait} seconds before trying again`,
			retryAfter: timeToWait,
			rateLimitStatus: rateLimitService.getStatus()
		};
		return json(rateLimitError, { status: 429 });
	}

	const bodyResult = await tryCatch(request.json());
	const bodyParseError = bodyResult.error;
	if (bodyParseError) {
		console.error('Error parsing request body:', bodyParseError);
		return createErrorResponse(
			{
				error: 'Invalid request',
				details: 'Failed to parse request body'
			},
			400
		);
	}

	const searchRequest = bodyResult.data as TradeSearchRequest;
	const searchResult = await tryCatch(searchPoETrades(searchRequest));
	const searchError = searchResult.error;

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

	const { response, data } = searchResult.data;
	rateLimitService.updateFromHeaders(response.headers);

	const responseNotOk = !response.ok;
	if (responseNotOk) {
		const isRateLimitError = response.status === 429;
		if (isRateLimitError) {
			const retryAfterFromService = rateLimitService.getRetryAfterFromHeaders(response.headers);
			const retryAfterFromHeader = response.headers.get('Retry-After');
			const retryAfter = retryAfterFromService || parseInt(retryAfterFromHeader || '10');

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

		const isForbiddenError = response.status === 403;
		if (isForbiddenError) {
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

		const httpError = `API Error: ${response.status}`;
		return createErrorResponse(
			{
				error: httpError,
				details: response.statusText
			},
			response.status
		);
	}

	return json(data);
};

function createErrorResponse(data: ErrorResponse, status: number): Response {
	return json(data, { status });
}
