// src/routes/api/stats/+server.ts
import { fetchPoEStats } from '$lib/server/services/stats/api';
import { getStatsFromCache } from '$lib/server/services/stats/cache';
import { tryCatch } from '$lib/utils/error';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CACHE_DURATION_SECONDS = 24 * 60 * 60; // 24 hours in seconds for HTTP headers
const FALLBACK_CACHE_DURATION = 60 * 60; // 1 hour in seconds for stale cache

export const GET: RequestHandler = async () => {
	const cacheResult = await tryCatch(getStatsFromCache(CACHE_DURATION_MS));

	const cacheCallFailed = Boolean(cacheResult.error);
	if (cacheCallFailed) {
		console.error('Cache system failed completely:', cacheResult.error);
		const apiResult = await tryCatch(fetchPoEStats());
		const apiFetchFailed = Boolean(apiResult.error);

		if (apiFetchFailed) {
			console.error('Both cache and API failed:', apiResult.error);
			return createErrorResponse('Stats service temporarily unavailable');
		}

		const freshStatsData = apiResult.data!;
		console.log('Got fresh stats despite cache failure');
		return createSuccessResponse(freshStatsData, CACHE_DURATION_SECONDS);
	}

	const { data: cachedData, shouldRefresh, writeToCache } = cacheResult.data!;

	const hasValidCachedData = cachedData !== null && !shouldRefresh;
	if (hasValidCachedData) {
		console.debug('Serving stats from fresh cache');
		return createSuccessResponse(cachedData, CACHE_DURATION_SECONDS);
	}

	console.debug('Cache miss or expired, fetching fresh stats data');
	const apiResult = await tryCatch(fetchPoEStats());
	const apiFetchFailed = Boolean(apiResult.error);

	if (apiFetchFailed) {
		console.error('Failed to fetch fresh stats data:', apiResult.error);
		const hasStaleData = cachedData !== null;
		if (hasStaleData) {
			console.log('Using stale cache data due to API failure');
			return createSuccessResponse(cachedData, FALLBACK_CACHE_DURATION);
		}
		const errorMessage = 'Failed to fetch stats data and no cached data available';
		return createErrorResponse(errorMessage);
	}

	const freshStatsData = apiResult.data!;
	console.debug('Successfully fetched fresh stats, updating cache');
	writeToCache(freshStatsData).catch((error: unknown) => {
		console.error('Failed to update cache after successful API fetch:', error);
	});

	return createSuccessResponse(freshStatsData, CACHE_DURATION_SECONDS);
};

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
