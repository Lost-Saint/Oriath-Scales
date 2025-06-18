import { fetchPoEStats } from '$lib/server/services/stats/api';
import { getStatsFromCache } from '$lib/server/services/stats/cache';
import { attempt } from '$lib/utils/attempt';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const CACHE_DURATION_SECONDS = 24 * 60 * 60; // 24 hours in seconds for HTTP headers
const FALLBACK_CACHE_DURATION = 60 * 60; // 1 hour in seconds for stale cache

export const GET: RequestHandler = async () => {
	const [cacheError, cacheResult] = await attempt(getStatsFromCache(CACHE_DURATION_MS));

	if (cacheError) {
		console.error('Cache system failed completely:', cacheError);
		return handleCacheFailure();
	}

	const { data: cachedData, shouldRefresh, writeToCache } = cacheResult;

	if (cachedData !== null && !shouldRefresh) {
		console.debug('Serving stats from fresh cache');
		return createSuccessResponse(cachedData, CACHE_DURATION_SECONDS);
	}

	console.debug('Cache miss or expired, fetching fresh stats data');
	const [apiError, freshData] = await attempt(fetchPoEStats());

	if (apiError) {
		console.error('Failed to fetch fresh stats data:', apiError);
		return handleApiFetchFailure(cachedData);
	}

	console.debug('Successfully fetched fresh stats, updating cache');
	updateCacheAsync(writeToCache, freshData);

	return createSuccessResponse(freshData, CACHE_DURATION_SECONDS);
};

async function handleCacheFailure(): Promise<Response> {
	const [apiError, freshData] = await attempt(fetchPoEStats());

	if (apiError) {
		console.error('Both cache and API failed:', apiError);
		return createErrorResponse('Stats service temporarily unavailable');
	}

	console.log('Got fresh stats despite cache failure');
	return createSuccessResponse(freshData, CACHE_DURATION_SECONDS);
}

function handleApiFetchFailure(cachedData: unknown): Response {
	if (cachedData !== null) {
		console.log('Using stale cache data due to API failure');
		return createSuccessResponse(cachedData, FALLBACK_CACHE_DURATION);
	}

	return createErrorResponse('Failed to fetch stats data and no cached data available');
}

function updateCacheAsync<T>(writeToCache: (data: T) => Promise<void>, data: T): void {
	writeToCache(data).catch((error: unknown) => {
		console.error('Failed to update cache after successful API fetch:', error);
	});
}

function createSuccessResponse(data: unknown, maxAge: number): Response {
	return json(data, {
		headers: {
			'Cache-Control': `public, max-age=${maxAge}`,
			'Content-Type': 'application/json'
		}
	});
}

function createErrorResponse(message: string, status: number = 500): Response {
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
