import type {
	RateLimitCheck,
	RateLimitState,
	RateLimitTier
} from '$lib/types/trade';

/**
 * Manages API rate limiting for Path of Exile trade API
 */
export class RateLimitService {
	private state: RateLimitState;

	/**
	 * Creates a new rate limit service with configured tiers
	 *
	 * @param tiers - Optional custom rate limit tiers
	 */
	constructor(tiers?: RateLimitTier[]) {
		this.state = {
			tiers: tiers || [
				{ hits: 0, max: 5, period: 10 }, // 5 requests per 10 seconds
				{ hits: 0, max: 15, period: 60 }, // 15 requests per 60 seconds
				{ hits: 0, max: 30, period: 300 } // 30 requests per 300 seconds
			],
			lastReset: Date.now()
		};
	}

	/**
	 * Get a human-readable status of current rate limits
	 *
	 * @returns Formatted string showing limits, usage, and reset times
	 */
	getStatus(): string {
		return this.state.tiers
			.map((tier, index) => {
				const remaining = tier.max - tier.hits;
				const timeLeft = this.calculateTimeLeft(tier);
				return `Tier ${index + 1}: ${remaining}/${tier.max} requests remaining (resets in ${timeLeft}s)`;
			})
			.join(' | ');
	}

	/**
	 * Calculate seconds remaining until tier reset
	 *
	 * @param tier - The rate limit tier to check
	 * @returns Seconds until this tier resets
	 */
	private calculateTimeLeft(tier: RateLimitTier): number {
		return Math.max(
			0,
			Math.ceil((this.state.lastReset + tier.period * 1000 - Date.now()) / 1000)
		);
	}

	/**
	 * Reset expired tiers
	 */
	private resetExpiredTiers(): void {
		const now = Date.now();

		this.state.tiers.forEach((tier) => {
			if (now - this.state.lastReset >= tier.period * 1000) {
				tier.hits = 0;
			}
		});
	}

	/**
	 * Check if the current request should be rate limited
	 *
	 * @returns Object indicating if request is allowed and wait time if not
	 */
	checkLimit(): RateLimitCheck {
		// Reset any expired tiers first
		this.resetExpiredTiers();

		// Check if any tier would be exceeded
		for (const tier of this.state.tiers) {
			if (tier.hits >= tier.max) {
				const timeToWait = this.calculateTimeLeft(tier);
				return { allowed: false, timeToWait };
			}
		}

		return { allowed: true };
	}

	/**
	 * Increment rate limit counters for a new request
	 */
	incrementLimits(): void {
		this.state.tiers.forEach((tier) => {
			tier.hits++;
		});
	}

	/**
	 * Update internal rate limits based on API response headers
	 *
	 * @param headers - Response headers from the PoE API
	 */
	updateFromHeaders(headers: Headers): void {
		const ipState = headers.get('x-rate-limit-ip-state')?.split(',') || [];

		ipState.forEach((state, index) => {
			const hits = this.parseHitsFromHeaderValue(state);

			// Only update if hits is a valid number and the tier exists
			if (!isNaN(hits) && this.state.tiers[index]) {
				this.state.tiers[index].hits = hits;
			}
		});

		this.state.lastReset = Date.now();
		console.log(`[Rate Limits] ${this.getStatus()}`);
	}

	/**
	 * Parse hits count from a rate limit header value
	 *
	 * @param headerValue - Single tier value from header (format: "hits:...")
	 * @returns Number of hits, or NaN if parsing failed
	 */
	private parseHitsFromHeaderValue(headerValue: string): number {
		const parts = headerValue.split(':');
		return parts.length > 0 ? Number(parts[0]) : NaN;
	}
}

// Create and export a singleton instance
export const rateLimitService = new RateLimitService();
