import type { RateLimitCheck, RateLimitState, RateLimitTier } from '$lib/types/trade';

/**
 * Manages API rate limiting for Path of Exile trade API
 */
export class RateLimitService {
	private state: RateLimitState;
	
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

	getStatus(): string {
		return this.state.tiers
			.map((tier, index) => {
				const remaining = tier.max - tier.hits;
				const timeLeft = this.calculateTimeLeft(tier);
				return `Tier ${index + 1}: ${remaining}/${tier.max} requests remaining (resets in ${timeLeft}s)`;
			})
			.join(' | ');
	}

	private calculateTimeLeft(tier: RateLimitTier): number {
		return Math.max(0, Math.ceil((this.state.lastReset + tier.period * 1000 - Date.now()) / 1000));
	}

	private resetExpiredTiers(): void {
		const now = Date.now();

		this.state.tiers.forEach((tier) => {
			if (now - this.state.lastReset >= tier.period * 1000) {
				tier.hits = 0;
			}
		});
	}

	checkLimit(): RateLimitCheck {
		this.resetExpiredTiers();

		for (const tier of this.state.tiers) {
			if (tier.hits >= tier.max) {
				const timeToWait = this.calculateTimeLeft(tier);
				return { allowed: false, timeToWait };
			}
		}

		return { allowed: true };
	}

	incrementLimits(): void {
		this.state.tiers.forEach((tier) => {
			tier.hits++;
		});
	}

	updateFromHeaders(headers: Headers): void {
		const ipState = headers.get('x-rate-limit-ip-state')?.split(',') || [];

		ipState.forEach((state, index) => {
			const hits = this.parseHitsFromHeaderValue(state);

			if (!isNaN(hits) && this.state.tiers[index]) {
				this.state.tiers[index].hits = hits;
			}
		});

		this.state.lastReset = Date.now();
		console.log(`[Rate Limits] ${this.getStatus()}`);
	}

	private parseHitsFromHeaderValue(headerValue: string): number {
		const parts = headerValue.split(':');
		return parts.length > 0 ? Number(parts[0]) : NaN;
	}
}

export const rateLimitService = new RateLimitService();
