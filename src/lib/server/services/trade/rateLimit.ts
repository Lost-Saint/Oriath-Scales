import type { RateLimitCheck, RateLimitState, RateLimitTier } from '$lib/types/trade';

export class RateLimitService {
	private state: RateLimitState;
	private static readonly MAX_TIERS = 10;

	constructor(tiers?: RateLimitTier[]) {
		const now = Date.now();
		this.state = {
			tiers: tiers || this.createDefaultTiers(now)
		};
	}

	private createDefaultTiers(now: number): RateLimitTier[] {
		return [
			{ hits: 0, max: 5, period: 10000, restrictedTime: 0, lastUpdated: now }, // 10 seconds in ms
			{ hits: 0, max: 15, period: 60000, restrictedTime: 0, lastUpdated: now }, // 60 seconds in ms
			{ hits: 0, max: 30, period: 300000, restrictedTime: 0, lastUpdated: now } // 300 seconds in ms
		];
	}

	getStatus(): string {
		const statusParts: string[] = [];

		this.state.tiers.forEach((tier, index) => {
			this.resetTierIfExpired(tier);

			const remaining = tier.max - tier.hits;
			const timeLeft = this.calculateTimeLeft(tier);
			const isRestricted = tier.restrictedTime > Date.now();
			const restrictedText = isRestricted
				? ` (restricted for ${Math.ceil((tier.restrictedTime - Date.now()) / 1000)}s)`
				: '';

			const statusText = `Tier ${index + 1}: ${remaining}/${tier.max} requests remaining (resets in ${Math.ceil(timeLeft / 1000)}s)${restrictedText}`;
			statusParts.push(statusText);
		});

		return statusParts.join(' | ');
	}

	private calculateTimeLeft(tier: RateLimitTier): number {
		const timeSinceUpdate = Date.now() - tier.lastUpdated;
		const timeLeft = tier.period - timeSinceUpdate;
		return Math.max(0, timeLeft);
	}

	private resetTierIfExpired(tier: RateLimitTier): void {
		const now = Date.now();
		const timeSinceUpdate = now - tier.lastUpdated;

		const periodIsExpired = timeSinceUpdate >= tier.period;
		if (periodIsExpired) {
			tier.hits = 0;
			tier.lastUpdated = now;
		}

		const isRestricted = tier.restrictedTime > now;
		if (!isRestricted && tier.restrictedTime > 0) {
			tier.restrictedTime = 0; // Clear expired restriction
		}
	}

	private resetAllExpiredTiers(): void {
		this.state.tiers.forEach((tier) => this.resetTierIfExpired(tier));
	}

	checkAndIncrementLimit(): RateLimitCheck {
		this.resetAllExpiredTiers();

		for (const tier of this.state.tiers) {
			const isCurrentlyRestricted = tier.restrictedTime > Date.now();
			if (isCurrentlyRestricted) {
				const timeToWait = Math.ceil((tier.restrictedTime - Date.now()) / 1000);
				return { allowed: false, timeToWait };
			}

			const wouldExceedLimit = tier.hits >= tier.max;
			if (wouldExceedLimit) {
				const timeToWait = Math.ceil(this.calculateTimeLeft(tier) / 1000);
				return { allowed: false, timeToWait };
			}
		}

		this.incrementLimits();
		return { allowed: true };
	}

	incrementLimits(): void {
		this.state.tiers.forEach((tier) => {
			tier.hits++;
		});
	}

	setRestriction(durationSeconds: number): void {
		const restrictedUntil = Date.now() + durationSeconds * 1000;

		const tier = this.state.tiers[0];
		if (tier) {
			tier.restrictedTime = restrictedUntil;
		}
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
			return rulesHeader
				.split(',')
				.map((r) => r.trim())
				.filter(Boolean);
		}

		return ['ip'];
	}

	private tryUpdateFromRule(headers: Headers, rule: string): boolean {
		const ruleHeader = headers.get(`X-Rate-Limit-${rule}`);
		const stateHeader = headers.get(`X-Rate-Limit-${rule}-State`);

		const hasRequiredHeaders = ruleHeader && stateHeader;
		if (hasRequiredHeaders) {
			try {
				this.updateTiersFromHeaders(ruleHeader, stateHeader);
				return true;
			} catch (error) {
				console.warn(`[Rate Limits] Failed to update from headers for rule ${rule}:`, error);
				return false;
			}
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
				try {
					this.updateSingleTier(rule, state, index, now);
				} catch (error) {
					console.warn(`[Rate Limits] Failed to update tier ${index}:`, error);
				}
			}
		});
	}

	private updateSingleTier(rule: string, state: string, index: number, now: number): void {
		const ruleParts = rule.trim().split(':');
		const stateParts = state.trim().split(':');

		const hasEnoughParts = ruleParts.length >= 3 && stateParts.length >= 3;
		if (!hasEnoughParts) {
			console.warn(`[Rate Limits] Invalid header format - rule: ${rule}, state: ${state}`);
			return;
		}

		const max = this.safeParseInt(ruleParts[0], 'max');
		const periodSeconds = this.safeParseInt(ruleParts[1], 'period');
		const hits = this.safeParseInt(stateParts[0], 'hits');
		const restrictedTimeSeconds = this.safeParseInt(stateParts[2], 'restrictedTime');

		if (max === null || periodSeconds === null || hits === null || restrictedTimeSeconds === null) {
			console.warn(`[Rate Limits] Failed to parse numeric values from headers`);
			return;
		}

		const period = periodSeconds * 1000;
		const restrictedTime = restrictedTimeSeconds > 0 ? now + restrictedTimeSeconds * 1000 : 0;

		if (max < 0 || periodSeconds < 0 || hits < 0 || restrictedTimeSeconds < 0) {
			console.warn(`[Rate Limits] Invalid negative values in headers`);
			return;
		}

		const tierExists = index < this.state.tiers.length;
		if (tierExists) {
			this.updateExistingTier(index, { hits, max, period, restrictedTime, now });
		} else if (this.state.tiers.length < RateLimitService.MAX_TIERS) {
			this.addNewTier({ hits, max, period, restrictedTime, now });
		} else {
			console.warn(
				`[Rate Limits] Maximum number of tiers (${RateLimitService.MAX_TIERS}) reached, ignoring additional tier`
			);
		}
	}

	private safeParseInt(value: string | undefined, fieldName: string): number | null {
		if (!value) {
			console.warn(`[Rate Limits] Missing value for ${fieldName}`);
			return null;
		}

		const parsed = parseInt(value.trim(), 10);
		if (isNaN(parsed)) {
			console.warn(`[Rate Limits] Invalid integer value for ${fieldName}: ${value}`);
			return null;
		}

		return parsed;
	}

	private updateExistingTier(
		index: number,
		data: { hits: number; max: number; period: number; restrictedTime: number; now: number }
	): void {
		const tier = this.state.tiers[index];
		if (!tier) {
			console.warn(`[Rate Limits] Tier index ${index} out of bounds`);
			return;
		}
		tier.hits = data.hits;
		tier.max = data.max;
		tier.period = data.period;
		tier.restrictedTime = data.restrictedTime;
		tier.lastUpdated = data.now;
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
			const parsed = parseInt(retryAfter, 10);
			if (!isNaN(parsed) && parsed >= 0) {
				return parsed;
			}
			console.warn(`[Rate Limits] Invalid Retry-After header value: ${retryAfter}`);
		}

		return undefined;
	}
}

export const rateLimitService = new RateLimitService();
