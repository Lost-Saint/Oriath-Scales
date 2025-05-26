// src/routes/api/stats/+server.ts
import { statsApi } from '$lib/server/services/stats/api';
import { statsCache } from '$lib/server/services/stats/cache';
import { tryCatch } from '$lib/utils/error';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Cache and HTTP configuration
const CACHE_DURATION_SECONDS = 24 * 60 * 60; // 24 hours in seconds
const FALLBACK_CACHE_DURATION = 60 * 60; // 1 hour in seconds

/**
 * SvelteKit GET handler for Path of Exile stats data
 *
 * Returns cached stats when available, or fetches fresh data
 */
export const GET = (async () => {
	// Step 1: Try to read from cache first
	const cacheResult = await tryCatch(statsCache.read());

	// Step 2: Return valid cache if available
	if (!cacheResult.error && cacheResult.data && !cacheResult.data.isExpired) {
		return createSuccessResponse(cacheResult.data.data, CACHE_DURATION_SECONDS);
	}

	// Step 3: Try to fetch fresh data from the API
	const apiResult = await tryCatch(statsApi.fetchStats());

	// Step 4: Handle API failure by falling back to expired cache if available
	if (apiResult.error) {
		console.error('Failed to fetch fresh stats data:', apiResult.error);

		if (cacheResult.data?.data) {
			console.log('Using expired cache due to API failure');
			return createSuccessResponse(cacheResult.data.data, FALLBACK_CACHE_DURATION);
		}

		// No cache available and API failed, return error
		return createErrorResponse('Failed to fetch stats data');
	}

	// Step 5: Cache the fresh data asynchronously (don't await)
	void tryCatch(statsCache.write(apiResult.data));

	// Step 6: Return the fresh data
	return createSuccessResponse(apiResult.data, CACHE_DURATION_SECONDS);
}) satisfies RequestHandler;

/**
 * Creates a standardized success response
 */
function createSuccessResponse(data: unknown, maxAge: number) {
	return json(data, {
		headers: {
			'Cache-Control': `public, max-age=${maxAge}`,
			'Content-Type': 'application/json'
		}
	});
}

/**
 * Creates a standardized error response
 */
function createErrorResponse(message: string, status: number = 500) {
	return json(
		{ error: message },
		{
			status,
			headers: {
				'Cache-Control': 'no-store',
				'Content-Type': 'application/json'
			}
		}
	);
}
