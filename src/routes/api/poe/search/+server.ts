import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Rate limiting tier configuration
 */
interface RateLimitTier {
	hits: number;
	max: number;
	period: number; // in seconds
}

/**
 * Rate limit tracking state
 */
interface RateLimitState {
	tiers: RateLimitTier[];
	lastReset: number;
}

// In-memory rate limit state (note: will reset on server restart)
const rateLimitState: RateLimitState = {
	tiers: [
		{ hits: 0, max: 5, period: 10 }, // 5 requests per 10 seconds
		{ hits: 0, max: 15, period: 60 }, // 15 requests per 60 seconds
		{ hits: 0, max: 30, period: 300 } // 30 requests per 300 seconds
	],
	lastReset: Date.now()
};

/**
 * Get the base URL for POE API requests
 */
function getBaseUrl(): string {
	return import.meta.env.VITE_POE_PROXY_URL || 'https://www.pathofexile.com';
}

/**
 * Get a human-readable status of current rate limits
 */
function getRateLimitStatus(): string {
	return rateLimitState.tiers
		.map((tier, index) => {
			const remaining = tier.max - tier.hits;
			const timeLeft = Math.max(
				0,
				Math.ceil(
					(rateLimitState.lastReset + tier.period * 1000 - Date.now()) / 1000
				)
			);
			return `Tier ${index + 1}: ${remaining}/${tier.max} requests remaining (resets in ${timeLeft}s)`;
		})
		.join(' | ');
}

/**
 * Check if the current request should be rate limited
 */
function checkRateLimit(): { allowed: boolean; timeToWait?: number } {
	const now = Date.now();

	// Reset counters if enough time has passed
	rateLimitState.tiers.forEach((tier) => {
		if (now - rateLimitState.lastReset >= tier.period * 1000) {
			tier.hits = 0;
		}
	});

	// Check if any tier would be exceeded
	for (const tier of rateLimitState.tiers) {
		if (tier.hits >= tier.max) {
			const timeToWait = Math.ceil(
				(rateLimitState.lastReset + tier.period * 1000 - now) / 1000
			);
			return { allowed: false, timeToWait };
		}
	}

	return { allowed: true };
}

/**
 * Update internal rate limits based on API response headers
 */
function updateRateLimits(headers: Headers): void {
	const ipState = headers.get('x-rate-limit-ip-state')?.split(',') || [];

	ipState.forEach((state, index) => {
		// Ensure we get a valid number even if parsing fails
		const parts = state.split(':');
		const hits = parts.length > 0 ? Number(parts[0]) : 0;

		// Only update if hits is a valid number and the tier exists
		if (!isNaN(hits) && rateLimitState.tiers[index]) {
			rateLimitState.tiers[index].hits = hits;
		}
	});

	rateLimitState.lastReset = Date.now();
	console.log(`[Rate Limits] ${getRateLimitStatus()}`);
}

/**
 * Increment rate limit counters for a new request
 */
function incrementRateLimits(): void {
	rateLimitState.tiers.forEach((tier) => {
		tier.hits++;
	});
}

/**
 * SvelteKit POST handler for POE trade search
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		// Check rate limit before making the request
		const rateLimitCheck = checkRateLimit();
		if (!rateLimitCheck.allowed) {
			console.log(`[Rate Limits] Request blocked - ${getRateLimitStatus()}`);
			return json(
				{
					error: 'Rate limit exceeded',
					details: `Please wait ${rateLimitCheck.timeToWait} seconds before trying again`,
					retryAfter: rateLimitCheck.timeToWait,
					rateLimitStatus: getRateLimitStatus()
				},
				{ status: 429 }
			);
		}

		// Increment rate limits proactively
		incrementRateLimits();

		const body = await request.json();
		const baseUrl = getBaseUrl();

		const response = await fetch(
			`${baseUrl}/api/trade2/search/${body.league}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent':
						'OAuth poe-item-checker/1.0.0 (contact: sanzodown@hotmail.fr)',
					Accept: '*/*'
				},
				body: JSON.stringify(body.query)
			}
		);

		// Update rate limits from response headers
		updateRateLimits(response.headers);

		if (!response.ok) {
			if (response.status === 429) {
				const retryAfter = parseInt(
					response.headers.get('Retry-After') || '10'
				);
				return json(
					{
						error: 'Rate limit exceeded',
						details: `Please wait ${retryAfter} seconds`,
						retryAfter
					},
					{ status: 429 }
				);
			}

			if (response.status === 403) {
				console.error('API Access Forbidden:', {
					status: response.status,
					statusText: response.statusText,
					headers: Object.fromEntries(response.headers.entries())
				});
				return json(
					{
						error: 'API Access Forbidden',
						details:
							'The PoE Trade API is currently blocking requests from this service. Please try using the official trade site directly.'
					},
					{ status: 403 }
				);
			}

			return json(
				{
					error: `API Error: ${response.status}`,
					details: response.statusText
				},
				{ status: response.status }
			);
		}

		const data = await response.json();
		if (!data.id) {
			console.error('Invalid API Response:', data);
			return json(
				{
					error: 'Invalid API Response',
					details: 'The API response did not contain a search ID'
				},
				{ status: 500 }
			);
		}

		return json(data);
	} catch (error) {
		console.error('Error with trade search:', error);
		return json(
			{
				error: 'Failed to perform trade search',
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
};
