import type { RateLimitCheck, RateLimitState, RateLimitTier } from '$lib/types/trade-api.types.js';

const createDefaultTiers = (): RateLimitTier[] => {
	const now = Date.now();
	return [
		{ hits: 0, max: 5, period: 10000, lastUpdated: now },
		{ hits: 0, max: 15, period: 60000, lastUpdated: now },
		{ hits: 0, max: 30, period: 300000, lastUpdated: now }
	];
};

const parseIntSafely = (value: string | null | undefined): number | null => {
	if (!value) return null;
	const parsed = parseInt(value.trim(), 10);
	return isNaN(parsed) ? null : parsed;
};

const formatTime = (ms: number): string => {
	const seconds = Math.ceil(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
	return `${Math.ceil(seconds / 3600)}h`;
};

export class RateLimitService {
	private state: RateLimitState;

	constructor(tiers?: RateLimitTier[]) {
		this.state = { tiers: tiers || createDefaultTiers() };
	}

	private updateTier = (tier: RateLimitTier): void => {
		const now = Date.now();
		if (now - tier.lastUpdated >= tier.period) {
			tier.hits = 0;
			tier.lastUpdated = now;
		}
	};

	private updateAllTiers = (): void => {
		this.state.tiers.forEach(this.updateTier);
	};

	getStatus(): string {
		this.updateAllTiers();
		const now = Date.now();

		return this.state.tiers
			.map((tier, i) => {
				const remaining = Math.max(0, tier.max - tier.hits);
				const timeLeft = Math.max(0, tier.period - (now - tier.lastUpdated));
				const status = timeLeft > 0 ? `resets in ${formatTime(timeLeft)}` : 'reset now';
				return `Tier ${i + 1}: ${remaining}/${tier.max} (${status})`;
			})
			.join(' | ');
	}

	checkAndIncrementLimit(): RateLimitCheck {
		this.updateAllTiers();

		// Find the shortest wait time among exceeded tiers
		const shortestWait = this.state.tiers
			.filter((tier) => tier.hits >= tier.max)
			.map((tier) => Math.ceil((tier.period - (Date.now() - tier.lastUpdated)) / 1000))
			.reduce((min, wait) => Math.min(min, wait), Infinity);

		if (shortestWait < Infinity) {
			return { allowed: false, timeToWait: shortestWait };
		}

		// Increment all tiers
		this.state.tiers.forEach((tier) => tier.hits++);
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

		const updated = states.reduce((count, state, i) => {
			if (i >= this.state.tiers.length) return count;

			const [hitsStr, periodStr] = state.split(':');
			const hits = parseIntSafely(hitsStr);
			const periodSeconds = parseIntSafely(periodStr);

			if (hits !== null && periodSeconds !== null && hits >= 0 && periodSeconds > 0) {
				const tier = this.state.tiers[i];
				if (tier) {
					tier.hits = Math.min(hits, tier.max);
					tier.period = periodSeconds * 1000;
					tier.lastUpdated = now;
					return count + 1;
				}
			}

			return count;
		}, 0);

		console.log(`[Rate Limits] Updated ${updated} tiers - ${this.getStatus()}`);
	}

	getRetryAfterFromHeaders = (headers: Headers): number | undefined => {
		const retryAfter = parseIntSafely(headers.get('Retry-After'));
		return retryAfter && retryAfter >= 0 ? retryAfter : undefined;
	};

	setRestriction(seconds: number = 60): void {
		const now = Date.now();
		const restrictionPeriod = seconds * 1000;

		this.state.tiers.forEach((tier) => {
			tier.hits = tier.max;
			tier.lastUpdated = now;
			tier.period = Math.max(tier.period, restrictionPeriod);
		});
	}
}

export const rateLimitService = new RateLimitService();
