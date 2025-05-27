import type { RateLimitCheck, RateLimitState, RateLimitTier } from '$lib/types/trade';

/**
 * Manages API rate limiting for Path of Exile trade API
 */
export class RateLimitService {
	private state: RateLimitState;

	constructor(tiers?: RateLimitTier[]) {
		const now = Date.now();
		this.state = {
			tiers: tiers || [
				{ hits: 0, max: 5, period: 10, restrictedTime: 0, lastUpdated: now },
				{ hits: 0, max: 15, period: 60, restrictedTime: 0, lastUpdated: now },
				{ hits: 0, max: 30, period: 300, restrictedTime: 0, lastUpdated: now }
			]
		};
	}

	getStatus(): string {
		return this.state.tiers
			.map((tier, index) => {
				this.resetTierIfExpired(tier);
				const remaining = tier.max - tier.hits;
				const timeLeft = this.calculateTimeLeft(tier);
				const restricted =
					tier.restrictedTime > 0 ? ` (restricted for ${tier.restrictedTime}s)` : '';
				return `Tier ${index + 1}: ${remaining}/${tier.max} requests remaining (resets in ${timeLeft}s)${restricted}`;
			})
			.join(' | ');
	}

	private calculateTimeLeft(tier: RateLimitTier): number {
		const timeSinceUpdate = (Date.now() - tier.lastUpdated) / 1000;
		return Math.max(0, Math.ceil(tier.period - timeSinceUpdate));
	}

	private resetTierIfExpired(tier: RateLimitTier): void {
		const now = Date.now();
		const timeSinceUpdate = (now - tier.lastUpdated) / 1000;

		// Reset hits if period has elapsed
		if (timeSinceUpdate >= tier.period) {
			tier.hits = 0;
			tier.lastUpdated = now;
		}

		// Decrease restriction time
		if (tier.restrictedTime > 0) {
			tier.restrictedTime = Math.max(0, tier.restrictedTime - timeSinceUpdate);
		}
	}

	private resetExpiredTiers(): void {
		this.state.tiers.forEach((tier) => this.resetTierIfExpired(tier));
	}

	checkLimit(): RateLimitCheck {
		this.resetExpiredTiers();

		for (const tier of this.state.tiers) {
			// Check if currently restricted
			if (tier.restrictedTime > 0) {
				return { allowed: false, timeToWait: Math.ceil(tier.restrictedTime) };
			}

			// Check if would exceed limit
			if (tier.hits >= tier.max) {
				const timeToWait = this.calculateTimeLeft(tier);
				return { allowed: false, timeToWait };
			}
		}

		return { allowed: true };
	}

	incrementLimits(): void {
		const now = Date.now();
		this.state.tiers.forEach((tier) => {
			tier.hits++;
			tier.lastUpdated = now;
		});
	}

	updateFromHeaders(headers: Headers): void {
		// Parse the rules to know which headers to look for
		const rules = headers
			.get('X-Rate-Limit-Rules')
			?.split(',')
			.map((r) => r.trim()) || ['ip'];

		// For each rule, try to update our state
		for (const rule of rules) {
			const ruleHeader = headers.get(`X-Rate-Limit-${rule}`);
			const stateHeader = headers.get(`X-Rate-Limit-${rule}-State`);

			if (ruleHeader && stateHeader) {
				this.updateTiersFromHeaders(ruleHeader, stateHeader);
				break; // Use the first available rule
			}
		}

		console.log(`[Rate Limits] ${this.getStatus()}`);
	}

	private updateTiersFromHeaders(ruleHeader: string, stateHeader: string): void {
		const rules = ruleHeader.split(',');
		const states = stateHeader.split(',');
		const now = Date.now();

		rules.forEach((rule, index) => {
			const state = states[index];
			if (!rule || !state) return;

			const ruleParts = rule.trim().split(':');
			const stateParts = state.trim().split(':');

			if (ruleParts.length >= 3 && stateParts.length >= 3) {
				const max = parseInt(ruleParts[0] || '0');
				const period = parseInt(ruleParts[1] || '0');

				const hits = parseInt(stateParts[0] || '0');
				const restrictedTime = parseInt(stateParts[2] || '0');

				// Update existing tier or create new one
				if (index < this.state.tiers.length) {
					const tier = this.state.tiers[index];
					if (tier) {
						tier.hits = hits;
						tier.max = max;
						tier.period = period;
						tier.restrictedTime = restrictedTime;
						tier.lastUpdated = now;
					}
				} else {
					// Add new tier
					this.state.tiers.push({
						hits,
						max,
						period,
						restrictedTime,
						lastUpdated: now
					});
				}
			}
		});
	}

	// Helper method to get retry time from headers
	getRetryAfterFromHeaders(headers: Headers): number | undefined {
		const retryAfter = headers.get('Retry-After');
		return retryAfter ? parseInt(retryAfter) : undefined;
	}
}

export const rateLimitService = new RateLimitService();
