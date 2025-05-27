export interface RateLimitTier {
	hits: number;
	max: number;
	period: number;
}

export interface RateLimitState {
	tiers: RateLimitTier[];
	lastReset: number;
}

export interface RateLimitCheck {
	allowed: boolean;
	timeToWait?: number;
}

export interface TradeSearchRequest {
	league: string;
	query: Record<string, unknown>;
}

export interface TradeApiResponse {
	id: string;
	result: unknown[];
	[key: string]: unknown;
}

export interface ErrorResponse {
	error: string;
	details?: string;
	retryAfter?: number;
	rateLimitStatus?: string;
}
