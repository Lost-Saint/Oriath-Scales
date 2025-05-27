import type { RateLimitCheck, RateLimitState, RateLimitTier } from '$lib/types/trade';

/**
 * Manages API rate limiting for Path of Exile trade API
 * Refactored with grug wisdom: complexity very very bad!
 */
export class RateLimitService {
	private state: RateLimitState;

	constructor(tiers?: RateLimitTier[]) {
		const now = Date.now();
		this.state = {
			tiers: tiers || this.createDefaultTiers(now)
		};
	}

	private createDefaultTiers(now: number): RateLimitTier[] {
		return [
			{ hits: 0, max: 5, period: 10, restrictedTime: 0, lastUpdated: now },
			{ hits: 0, max: 15, period: 60, restrictedTime: 0, lastUpdated: now },
			{ hits: 0, max: 30, period: 300, restrictedTime: 0, lastUpdated: now }
		];
	}

	getStatus(): string {
		const statusParts: string[] = [];

		this.state.tiers.forEach((tier, index) => {
			this.resetTierIfExpired(tier);

			const remaining = tier.max - tier.hits;
			const timeLeft = this.calculateTimeLeft(tier);
			const isRestricted = tier.restrictedTime > 0;
			const restrictedText = isRestricted ? ` (restricted for ${tier.restrictedTime}s)` : '';

			const statusText = `Tier ${index + 1}: ${remaining}/${tier.max} requests remaining (resets in ${timeLeft}s)${restrictedText}`;
			statusParts.push(statusText);
		});

		return statusParts.join(' | ');
	}

	private calculateTimeLeft(tier: RateLimitTier): number {
		const timeSinceUpdate = (Date.now() - tier.lastUpdated) / 1000;
		const timeLeft = tier.period - timeSinceUpdate;
		return Math.max(0, Math.ceil(timeLeft));
	}

	private resetTierIfExpired(tier: RateLimitTier): void {
		const now = Date.now();
		const timeSinceUpdate = (now - tier.lastUpdated) / 1000;

		const periodIsExpired = timeSinceUpdate >= tier.period;
		if (periodIsExpired) {
			tier.hits = 0;
			tier.lastUpdated = now;
		}

		const isRestricted = tier.restrictedTime > 0;
		if (isRestricted) {
			const newRestrictionTime = tier.restrictedTime - timeSinceUpdate;
			tier.restrictedTime = Math.max(0, newRestrictionTime);
		}
	}

	private resetAllExpiredTiers(): void {
		this.state.tiers.forEach((tier) => this.resetTierIfExpired(tier));
	}

	checkLimit(): RateLimitCheck {
		this.resetAllExpiredTiers();

		for (const tier of this.state.tiers) {
			const isCurrentlyRestricted = tier.restrictedTime > 0;
			if (isCurrentlyRestricted) {
				const timeToWait = Math.ceil(tier.restrictedTime);
				return { allowed: false, timeToWait };
			}

			const wouldExceedLimit = tier.hits >= tier.max;
			if (wouldExceedLimit) {
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
		const rules = this.parseRulesFromHeaders(headers);

		for (const rule of rules) {
			const didUpdate = this.tryUpdateFromRule(headers, rule);
			if (didUpdate) {
				break;
			}
		}

		console.log(`[Rate Limits] ${this.getStatus()}`);
	}

	private parseRulesFromHeaders(headers: Headers): string[] {
		const rulesHeader = headers.get('X-Rate-Limit-Rules');
		const hasRulesHeader = rulesHeader !== null;

		if (hasRulesHeader) {
			return rulesHeader.split(',').map((r) => r.trim());
		}

		return ['ip'];
	}

	private tryUpdateFromRule(headers: Headers, rule: string): boolean {
		const ruleHeader = headers.get(`X-Rate-Limit-${rule}`);
		const stateHeader = headers.get(`X-Rate-Limit-${rule}-State`);

		const hasRequiredHeaders = ruleHeader && stateHeader;
		if (hasRequiredHeaders) {
			this.updateTiersFromHeaders(ruleHeader, stateHeader);
			return true;
		}

		return false;
	}

	private updateTiersFromHeaders(ruleHeader: string, stateHeader: string): void {
		const rules = ruleHeader.split(',');
		const states = stateHeader.split(',');
		const now = Date.now();

		rules.forEach((rule, index) => {
			const state = states[index];
			const hasValidData = rule && state;

			if (hasValidData) {
				this.updateSingleTier(rule, state, index, now);
			}
		});
	}

	private updateSingleTier(rule: string, state: string, index: number, now: number): void {
		const ruleParts = rule.trim().split(':');
		const stateParts = state.trim().split(':');

		const hasEnoughParts = ruleParts.length >= 3 && stateParts.length >= 3;
		if (!hasEnoughParts) {
			return;
		}

		const max = parseInt(ruleParts[0] || '0');
		const period = parseInt(ruleParts[1] || '0');
		const hits = parseInt(stateParts[0] || '0');
		const restrictedTime = parseInt(stateParts[2] || '0');

		const tierExists = index < this.state.tiers.length;
		if (tierExists) {
			this.updateExistingTier(index, { hits, max, period, restrictedTime, now });
		} else {
			this.addNewTier({ hits, max, period, restrictedTime, now });
		}
	}

	private updateExistingTier(
		index: number,
		data: { hits: number; max: number; period: number; restrictedTime: number; now: number }
	): void {
		const tier = this.state.tiers[index];
		if (tier) {
			tier.hits = data.hits;
			tier.max = data.max;
			tier.period = data.period;
			tier.restrictedTime = data.restrictedTime;
			tier.lastUpdated = data.now;
		}
	}

	private addNewTier(data: {
		hits: number;
		max: number;
		period: number;
		restrictedTime: number;
		now: number;
	}): void {
		this.state.tiers.push({
			hits: data.hits,
			max: data.max,
			period: data.period,
			restrictedTime: data.restrictedTime,
			lastUpdated: data.now
		});
	}

	getRetryAfterFromHeaders(headers: Headers): number | undefined {
		const retryAfter = headers.get('Retry-After');
		const hasRetryAfter = retryAfter !== null;

		if (hasRetryAfter) {
			return parseInt(retryAfter);
		}

		return undefined;
	}
}

export const rateLimitService = new RateLimitService();
