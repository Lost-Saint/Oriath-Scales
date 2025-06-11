import type { RateLimitCheck, RateLimitState, RateLimitTier } from '$lib/types/trade.js';
import { tryCatch } from '$lib/utils/error.js';

function createDefaultTiers(): RateLimitTier[] {
	const now = Date.now();
	return [
		{ hits: 0, max: 5, period: 10000, restrictedTime: 0, lastUpdated: now },
		{ hits: 0, max: 15, period: 60000, restrictedTime: 0, lastUpdated: now },
		{ hits: 0, max: 30, period: 300000, restrictedTime: 0, lastUpdated: now }
	];
}

function parseIntSafely(value: string | undefined): number | null {
	const valueExists = value !== undefined && value !== null;
	if (!valueExists) return null;

	const trimmedValue = value.trim();
	const parsed = parseInt(trimmedValue, 10);
	const isValidNumber = !isNaN(parsed) && isFinite(parsed);

	return isValidNumber ? parsed : null;
}

function calculateTimeLeft(tier: RateLimitTier): number {
	const timeSinceUpdate = Date.now() - tier.lastUpdated;
	const timeLeft = tier.period - timeSinceUpdate;
	return Math.max(0, timeLeft);
}

function formatTimeRemaining(milliseconds: number): string {
	const seconds = Math.ceil(milliseconds / 1000);
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
	return `${Math.ceil(seconds / 3600)}h`;
}

export class RateLimitService {
	private state: RateLimitState;
	private static readonly MAX_TIERS = 10;
	private static readonly DEFAULT_RESTRICTION_SECONDS = 60;

	constructor(tiers?: RateLimitTier[]) {
		this.state = {
			tiers: tiers || createDefaultTiers()
		};
	}

	getStatus(): string {
		const statusParts: string[] = [];
		const now = Date.now();

		for (const [i, tier] of this.state.tiers.entries()) {
			const timeSinceUpdate = now - tier.lastUpdated;
			const periodExpired = timeSinceUpdate >= tier.period;
			if (periodExpired) {
				tier.hits = 0;
				tier.lastUpdated = now;
			}

			const restrictionExpired = tier.restrictedTime > 0 && tier.restrictedTime <= now;
			if (restrictionExpired) {
				tier.restrictedTime = 0;
			}

			const remaining = Math.max(0, tier.max - tier.hits);
			const timeLeft = calculateTimeLeft(tier);
			const isRestricted = tier.restrictedTime > now;

			let statusText = `Tier ${i + 1}: ${remaining}/${tier.max} remaining`;

			if (isRestricted) {
				const restrictedTime = tier.restrictedTime - now;
				statusText += ` (restricted for ${formatTimeRemaining(restrictedTime)})`;
			} else if (timeLeft > 0) {
				statusText += ` (resets in ${formatTimeRemaining(timeLeft)})`;
			} else {
				statusText += ` (reset now)`;
			}

			statusParts.push(statusText);
		}

		return statusParts.length > 0 ? statusParts.join(' | ') : 'No rate limits active';
	}

	checkAndIncrementLimit(): RateLimitCheck {
		const now = Date.now();
		let shortestWaitTime = Infinity;

		for (const tier of this.state.tiers) {
			const timeSinceUpdate = now - tier.lastUpdated;
			const periodExpired = timeSinceUpdate >= tier.period;

			if (periodExpired) {
				tier.hits = 0;
				tier.lastUpdated = now;
			}

			const restrictionExpired = tier.restrictedTime > 0 && tier.restrictedTime <= now;
			if (restrictionExpired) {
				tier.restrictedTime = 0;
			}

			const isCurrentlyRestricted = tier.restrictedTime > now;
			if (isCurrentlyRestricted) {
				const timeToWait = Math.ceil((tier.restrictedTime - now) / 1000);
				shortestWaitTime = Math.min(shortestWaitTime, timeToWait);
				continue;
			}

			const wouldExceedLimit = tier.hits >= tier.max;
			if (wouldExceedLimit) {
				const timeToWait = Math.ceil(calculateTimeLeft(tier) / 1000);
				shortestWaitTime = Math.min(shortestWaitTime, timeToWait);
			}
		}

		const hasBlockingTier = shortestWaitTime < Infinity;
		if (hasBlockingTier) {
			return { allowed: false, timeToWait: shortestWaitTime };
		}

		for (const tier of this.state.tiers) {
			tier.hits++;
		}

		return { allowed: true };
	}

	setRestriction(durationSeconds: number = RateLimitService.DEFAULT_RESTRICTION_SECONDS): void {
		const validDuration = Math.max(0, durationSeconds);
		const restrictedUntil = Date.now() + validDuration * 1000;

		for (const tier of this.state.tiers) {
			tier.restrictedTime = Math.max(tier.restrictedTime, restrictedUntil);
		}
	}

	updateFromHeaders(headers: Headers): void {
		const parseStartTime = Date.now();

		const rulesResult = tryCatch(() => {
			const rulesHeader = headers.get('X-Rate-Limit-Rules');
			const hasRulesHeader = rulesHeader !== null && rulesHeader.trim().length > 0;

			if (hasRulesHeader) {
				return rulesHeader
					.split(',')
					.map((r) => r.trim())
					.filter(Boolean);
			}
			return ['ip'];
		});

		if (rulesResult.error) {
			console.warn('[Rate Limits] Failed to parse rules header:', rulesResult.error.message);
			console.log(`[Rate Limits] ${this.getStatus()}`);
			return;
		}

		const rulesToCheck = rulesResult.data;
		let updatedSuccessfully = false;
		let parsedTiersCount = 0;

		for (const rule of rulesToCheck) {
			const headerResult = tryCatch(() => ({
				ruleHeader: headers.get(`X-Rate-Limit-${rule}`),
				stateHeader: headers.get(`X-Rate-Limit-${rule}-State`)
			}));

			if (headerResult.error) {
				console.warn(
					`[Rate Limits] Failed to access headers for rule ${rule}:`,
					headerResult.error.message
				);
				continue;
			}

			const { ruleHeader, stateHeader } = headerResult.data;
			const hasRequiredHeaders = ruleHeader !== null && stateHeader !== null;

			if (!hasRequiredHeaders) {
				console.debug(`[Rate Limits] Missing headers for rule ${rule}`);
				continue;
			}

			const updateResult = this.tryUpdateTiersFromHeaders(ruleHeader, stateHeader);
			if (updateResult.success) {
				updatedSuccessfully = true;
				parsedTiersCount = updateResult.tiersUpdated;
				console.debug(
					`[Rate Limits] Successfully updated ${parsedTiersCount} tiers from rule: ${rule}`
				);
				break;
			}
		}

		const parseTime = Date.now() - parseStartTime;

		if (!updatedSuccessfully) {
			console.warn('[Rate Limits] Could not update from any header rules');
		} else {
			console.debug(`[Rate Limits] Header parsing completed in ${parseTime}ms`);
		}

		console.log(`[Rate Limits] ${this.getStatus()}`);
	}

	private tryUpdateTiersFromHeaders(
		ruleHeader: string,
		stateHeader: string
	): { success: boolean; tiersUpdated: number } {
		const parseResult = tryCatch(() => ({
			rules: ruleHeader
				.split(',')
				.map((r) => r.trim())
				.filter(Boolean),
			states: stateHeader
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		}));

		if (parseResult.error) {
			console.warn('[Rate Limits] Failed to split header strings:', parseResult.error.message);
			return { success: false, tiersUpdated: 0 };
		}

		const { rules, states } = parseResult.data;
		const now = Date.now();
		let tiersUpdated = 0;

		for (let i = 0; i < Math.max(rules.length, states.length); i++) {
			const rule = rules[i];
			const state = states[i];

			const hasValidData = rule !== undefined && state !== undefined;
			if (!hasValidData) {
				console.debug(`[Rate Limits] Missing rule or state data at index ${i}`);
				continue;
			}

			const splitResult = tryCatch(() => ({
				ruleParts: rule.split(':').map((p) => p.trim()),
				stateParts: state.split(':').map((p) => p.trim())
			}));

			if (splitResult.error) {
				console.warn(
					`[Rate Limits] Failed to parse rule/state parts at index ${i}:`,
					splitResult.error.message
				);
				continue;
			}

			const { ruleParts, stateParts } = splitResult.data;
			const hasEnoughParts = ruleParts.length >= 3 && stateParts.length >= 3;

			if (!hasEnoughParts) {
				console.warn(
					`[Rate Limits] Invalid header format at index ${i} - rule: ${rule}, state: ${state}`
				);
				continue;
			}

			const max = parseIntSafely(ruleParts[0]);
			const periodSeconds = parseIntSafely(ruleParts[1]);
			const restrictionSeconds = parseIntSafely(ruleParts[2]);
			const hits = parseIntSafely(stateParts[0]);
			const currentPeriodSeconds = parseIntSafely(stateParts[1]);
			const activeRestrictionSeconds = parseIntSafely(stateParts[2]);

			const allNumbersValid =
				max !== null &&
				periodSeconds !== null &&
				restrictionSeconds !== null &&
				hits !== null &&
				currentPeriodSeconds !== null &&
				activeRestrictionSeconds !== null;

			if (!allNumbersValid) {
				console.warn(`[Rate Limits] Failed to parse numeric values at index ${i}`);
				continue;
			}

			const hasValidValues =
				max >= 0 &&
				periodSeconds > 0 &&
				restrictionSeconds >= 0 &&
				hits >= 0 &&
				currentPeriodSeconds >= 0 &&
				activeRestrictionSeconds >= 0;

			if (!hasValidValues) {
				console.warn(
					`[Rate Limits] Invalid values at index ${i} - negative or zero period not allowed`
				);
				continue;
			}

			const period = periodSeconds * 1000;
			const restrictedTime =
				activeRestrictionSeconds > 0 ? now + activeRestrictionSeconds * 1000 : 0;

			const tierExists = i < this.state.tiers.length;

			if (tierExists) {
				const tier = this.state.tiers[i];
				if (tier) {
					tier.hits = Math.min(hits, max);
					tier.max = max;
					tier.period = period;
					tier.restrictedTime = restrictedTime;
					tier.lastUpdated = now;
					tiersUpdated++;
				}
			} else {
				const canAddTier = this.state.tiers.length < RateLimitService.MAX_TIERS;

				if (canAddTier) {
					this.state.tiers.push({
						hits: Math.min(hits, max),
						max,
						period,
						restrictedTime,
						lastUpdated: now
					});
					tiersUpdated++;
				} else {
					console.warn(
						`[Rate Limits] Maximum tiers (${RateLimitService.MAX_TIERS}) reached, skipping tier ${i}`
					);
					break;
				}
			}
		}

		const updateSuccessful = tiersUpdated > 0;
		return { success: updateSuccessful, tiersUpdated };
	}

	getRetryAfterFromHeaders(headers: Headers): number | undefined {
		const retryAfter = headers.get('Retry-After');
		const hasRetryAfter = retryAfter !== null;

		if (!hasRetryAfter) {
			return undefined;
		}

		const parsed = parseIntSafely(retryAfter);
		const isValidPositive = parsed !== null && parsed >= 0;

		if (isValidPositive) {
			return parsed;
		}

		console.warn(`[Rate Limits] Invalid Retry-After header value: ${retryAfter}`);
		return undefined;
	}
}

export const rateLimitService = new RateLimitService();
