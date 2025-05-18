// src/lib/server/services/trade/types.ts
/**
 * Rate limiting tier configuration
 */
export interface RateLimitTier {
  hits: number;
  max: number;
  period: number; // in seconds
}

/**
 * Rate limit tracking state
 */
export interface RateLimitState {
  tiers: RateLimitTier[];
  lastReset: number;
}

/**
 * Rate limit check result
 */
export interface RateLimitCheck {
  allowed: boolean;
  timeToWait?: number;
}

/**
 * Interface for trade search request body
 */
export interface TradeSearchRequest {
  league: string;
  query: Record<string, unknown>;
}

/**
 * Interface for trade API response
 */
export interface TradeApiResponse {
  id: string;
  result: unknown[];
  [key: string]: unknown;
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  details?: string;
  retryAfter?: number;
  rateLimitStatus?: string;
}
