// src/routes/api/search/+server.ts
import { tryCatch } from '$lib/utils/error';
import { json } from '@sveltejs/kit';
import { rateLimitService } from '$lib/server/services/trade/rateLimit';
import { tradeApiService } from '$lib/server/services/trade/api';
import type { RequestHandler } from './$types';
import type { ErrorResponse, TradeSearchRequest } from '$lib/types/trade';

/**
 * SvelteKit POST handler for POE trade search
 */
export const POST: RequestHandler = async ({ request }) => {
  // Step 1: Check rate limit before proceeding
  const rateLimitResult = checkRateLimit();
  if (!rateLimitResult.allowed) {
    return rateLimitResult.response!;
  }
  
  // Step 2: Parse the request body
  const parsedBody = await parseRequestBody(request);
  if (!parsedBody.success) {
    return parsedBody.response;
  }
  
  try {
    // Step 3: Call the trade API service
    const { response, data } = await tradeApiService.search(parsedBody.data);
    
    // Step 4: Update rate limits from response headers
    rateLimitService.updateFromHeaders(response.headers);
    
    // Step 5: Handle API error responses
    if (!response.ok) {
      return handleApiError(response);
    }
    
    // Step 6: Return successful response
    return json(data);
  } catch (error) {
    // Step 7: Handle unexpected errors
    console.error('Error in trade search:', error);
    return createErrorResponse({
      error: 'Trade API error',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
};

/**
 * Checks the rate limit and returns appropriate response if exceeded
 */
function checkRateLimit(): { allowed: boolean; response?: Response } {
  const rateLimitCheck = rateLimitService.checkLimit();
  
  if (!rateLimitCheck.allowed) {
    console.log(`[Rate Limits] Request blocked - ${rateLimitService.getStatus()}`);
    
    const errorResponse = createErrorResponse({
      error: 'Rate limit exceeded',
      details: `Please wait ${rateLimitCheck.timeToWait} seconds before trying again`,
      retryAfter: rateLimitCheck.timeToWait,
      rateLimitStatus: rateLimitService.getStatus()
    }, 429);
    
    return { allowed: false, response: errorResponse };
  }
  
  // Increment rate limits proactively
  rateLimitService.incrementLimits();
  return { allowed: true };
}

/**
 * Parses and validates the request body
 */
async function parseRequestBody(request: Request): Promise<
  { success: true; data: TradeSearchRequest } | 
  { success: false; response: Response }
> {
  const bodyResult = await tryCatch(request.json());
  
  if (bodyResult.error) {
    console.error('Error parsing request body:', bodyResult.error);
    
    const errorResponse = createErrorResponse({
      error: 'Invalid request',
      details: 'Failed to parse request body'
    }, 400);
    
    return { success: false, response: errorResponse };
  }
  
  return { 
    success: true, 
    data: bodyResult.data as TradeSearchRequest
  };
}

/**
 * Handles error responses from the PoE API
 */
function handleApiError(response: Response): Response {
  // Handle rate limiting from PoE API
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '10');
    
    return createErrorResponse({
      error: 'Rate limit exceeded',
      details: `Please wait ${retryAfter} seconds`,
      retryAfter
    }, 429);
  }
  
  // Handle forbidden responses
  if (response.status === 403) {
    console.error('API Access Forbidden:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    });
    
    return createErrorResponse({
      error: 'API Access Forbidden',
      details: 'The PoE Trade API is currently blocking requests from this service. Please try using the official trade site directly.'
    }, 403);
  }
  
  // Handle generic errors
  return createErrorResponse({
    error: `API Error: ${response.status}`,
    details: response.statusText
  }, response.status);
}

/**
 * Creates a standardized error response
 */
function createErrorResponse(data: ErrorResponse, status: number): Response {
  return json(data, { status });
}
