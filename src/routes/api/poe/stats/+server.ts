// src/routes/api/stats/+server.ts
import { statsApi } from '$lib/server/services/stats/api';
import { statsCache } from '$lib/server/services/stats/cache';
import { tryCatch } from '$lib/utils/error';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CACHE_DURATION_SECONDS = 24 * 60 * 60; // 24 hours in seconds
const FALLBACK_CACHE_DURATION = 60 * 60; // 1 hour in seconds

/**
 * SvelteKit GET handler for Path of Exile stats data
 *
 * Returns cached stats when available, or fetches fresh data
 */
export const GET = (async () => {
	const cacheResult = await tryCatch(statsCache.read());

	if (!cacheResult.error && cacheResult.data && !cacheResult.data.isExpired) {
		return createSuccessResponse(cacheResult.data.data, CACHE_DURATION_SECONDS);
	}

	const apiResult = await tryCatch(statsApi.fetchStats());

	if (apiResult.error) {
		console.error('Failed to fetch fresh stats data:', apiResult.error);

		if (cacheResult.data?.data) {
			console.log('Using expired cache due to API failure');
			return createSuccessResponse(cacheResult.data.data, FALLBACK_CACHE_DURATION);
		}

		return createErrorResponse('Failed to fetch stats data');
	}

	void tryCatch(statsCache.write(apiResult.data));

	return createSuccessResponse(apiResult.data, CACHE_DURATION_SECONDS);
}) satisfies RequestHandler;

function createSuccessResponse(data: unknown, maxAge: number) {
	return json(data, {
		headers: {
			'Cache-Control': `public, max-age=${maxAge}`,
			'Content-Type': 'application/json'
		}
	});
}

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
