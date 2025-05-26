import { tradeApiService } from '$lib/server/services/trade/api';
import { rateLimitService } from '$lib/server/services/trade/rateLimit';
import type { ErrorResponse, TradeSearchRequest } from '$lib/types/trade';
import { tryCatch } from '$lib/utils/error';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * SvelteKit POST handler for POE trade search
 */
export const POST = (async ({ request }) => {
	const rateLimitResult = checkRateLimit();

	if (!rateLimitResult.allowed) {
		if (!rateLimitResult.response) {
			throw new Error('Rate limit response not provided');
		}
		return rateLimitResult.response;
	}

	const parsedBody = await parseRequestBody(request);
	if (!parsedBody.success) {
		return parsedBody.response;
	}

	try {
		const { response, data } = await tradeApiService.search(parsedBody.data);

		rateLimitService.updateFromHeaders(response.headers);

		if (!response.ok) {
			return handleApiError(response);
		}

		return json(data);
	} catch (error) {
		console.error('Error in trade search:', error);
		return createErrorResponse(
			{
				error: 'Trade API error',
				details: error instanceof Error ? error.message : String(error)
			},
			500
		);
	}
}) satisfies RequestHandler;

function checkRateLimit(): { allowed: boolean; response?: Response } {
	const rateLimitCheck = rateLimitService.checkLimit();

	if (!rateLimitCheck.allowed) {
		console.log(`[Rate Limits] Request blocked - ${rateLimitService.getStatus()}`);

		const errorResponse = createErrorResponse(
			{
				error: 'Rate limit exceeded',
				details: `Please wait ${rateLimitCheck.timeToWait} seconds before trying again`,
				retryAfter: rateLimitCheck.timeToWait,
				rateLimitStatus: rateLimitService.getStatus()
			},
			429
		);

		return { allowed: false, response: errorResponse };
	}

	rateLimitService.incrementLimits();
	return { allowed: true };
}

async function parseRequestBody(
	request: Request
): Promise<{ success: true; data: TradeSearchRequest } | { success: false; response: Response }> {
	const bodyResult = await tryCatch(request.json());

	if (bodyResult.error) {
		console.error('Error parsing request body:', bodyResult.error);

		const errorResponse = createErrorResponse(
			{
				error: 'Invalid request',
				details: 'Failed to parse request body'
			},
			400
		);

		return { success: false, response: errorResponse };
	}

	return {
		success: true,
		data: bodyResult.data as TradeSearchRequest
	};
}

function handleApiError(response: Response): Response {
	if (response.status === 429) {
		const retryAfter = parseInt(response.headers.get('Retry-After') || '10');

		return createErrorResponse(
			{
				error: 'Rate limit exceeded',
				details: `Please wait ${retryAfter} seconds`,
				retryAfter
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
