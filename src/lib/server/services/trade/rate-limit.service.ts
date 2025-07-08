import type { RateLimitCheck, RateLimitState, RateLimitTier } from '$lib/types/trade-api.types.js';

function createDefaultTiers(): RateLimitTier[] {
	const now = Date.now();
	return [
		{ hits: 0, max: 5, period: 10000, lastUpdated: now },
		{ hits: 0, max: 15, period: 60000, lastUpdated: now },
		{ hits: 0, max: 30, period: 300000, lastUpdated: now }
	];
}

function parseIntSafely(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = parseInt(value.trim(), 10);
	return isNaN(parsed) ? null : parsed;
}

function formatTime(ms: number): string {
	const seconds = Math.ceil(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
	return `${Math.ceil(seconds / 3600)}h`;
}

export class RateLimitService {
	private state: RateLimitState;

	constructor(tiers?: RateLimitTier[]) {
		this.state = { tiers: tiers || createDefaultTiers() };
	}

	private updateTier(tier: RateLimitTier): void {
		const now = Date.now();
		if (now - tier.lastUpdated >= tier.period) {
			tier.hits = 0;
			tier.lastUpdated = now;
		}
	}

	getStatus(): string {
		const now = Date.now();
		return this.state.tiers
			.map((tier, i) => {
				this.updateTier(tier);
				const remaining = Math.max(0, tier.max - tier.hits);
				const timeLeft = Math.max(0, tier.period - (now - tier.lastUpdated));
				const status = timeLeft > 0 ? `resets in ${formatTime(timeLeft)}` : 'reset now';
				return `Tier ${i + 1}: ${remaining}/${tier.max} (${status})`;
			})
			.join(' | ');
	}

	checkAndIncrementLimit(): RateLimitCheck {
		let shortestWait = Infinity;

		for (const tier of this.state.tiers) {
			this.updateTier(tier);

			if (tier.hits >= tier.max) {
				const timeLeft = tier.period - (Date.now() - tier.lastUpdated);
				shortestWait = Math.min(shortestWait, Math.ceil(timeLeft / 1000));
			}
		}

		if (shortestWait < Infinity) {
			return { allowed: false, timeToWait: shortestWait };
		}

		for (const tier of this.state.tiers) {
			tier.hits++;
		}

		return { allowed: true };
	}

	updateFromHeaders(headers: Headers): void {
		const stateHeader = headers.get('X-Rate-Limit-IP-State');
		if (!stateHeader) {
			console.log(`[Rate Limits] ${this.getStatus()}`);
			return;
		}

		const states = stateHeader.split(',').map((s) => s.trim());
		const now = Date.now();
		let updated = 0;

		for (let i = 0; i < Math.min(states.length, this.state.tiers.length); i++) {
			const state = states[i];
			if (!state) continue;

			const parts = state.split(':');
			if (parts.length < 2) continue;

			const hits = parseIntSafely(parts[0]);
			const periodSeconds = parseIntSafely(parts[1]);

			if (hits !== null && periodSeconds !== null && hits >= 0 && periodSeconds > 0) {
				const tier = this.state.tiers[i];
				if (tier) {
					tier.hits = Math.min(hits, tier.max);
					tier.period = periodSeconds * 1000;
					tier.lastUpdated = now;
					updated++;
				}
			}
		}

		console.log(`[Rate Limits] Updated ${updated} tiers - ${this.getStatus()}`);
	}

	getRetryAfterFromHeaders(headers: Headers): number | undefined {
		const retryAfter = headers.get('Retry-After');
		const parsed = parseIntSafely(retryAfter);
		return parsed && parsed >= 0 ? parsed : undefined;
	}

	setRestriction(seconds: number = 60): void {
		for (const tier of this.state.tiers) {
			tier.hits = tier.max;
			tier.lastUpdated = Date.now();
			tier.period = Math.max(tier.period, seconds * 1000);
		}
	}
}

export const rateLimitService = new RateLimitService();
