/**
 * Rate Limiter Utility
 *
 * Story 1.7: Rate limiting for order edit endpoints
 *
 * Uses Redis to track request counts per order ID with atomic INCR operations.
 * This ensures rate limits persist across server restarts and work correctly
 * if the backend scales to multiple instances.
 */

import { Redis } from "ioredis";
import { getRedisConnection } from "../lib/redis";
import { logger } from "./logger";

const RATE_LIMIT_PREFIX = "rate-limit:order-edit:";

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    const connection = getRedisConnection();
    redisClient = new Redis(connection);
  }
  return redisClient;
}

const ORDER_EDIT_RATE_LIMIT = parseInt(
  process.env.ORDER_EDIT_RATE_LIMIT_PER_MINUTE || "10",
  10
);

/**
 * Check if request should be rate limited
 *
 * Uses Redis INCR with TTL for atomic rate limiting:
 * - First request in window: sets key with count 1 and TTL of 1 minute
 * - Subsequent requests: increments counter
 * - After window expires: key is auto-deleted by Redis
 *
 * @param orderId - The order ID to rate limit against
 * @returns true if rate limited, false if allowed
 */
export async function checkRateLimit(orderId: string): Promise<boolean> {
  if (!process.env.REDIS_URL) {
    // If Redis is not available, allow the request (fail-open)
    logger.warn("rate-limiter", "Redis not available, skipping rate limit check");
    return false;
  }

  try {
    const redis = getRedisClient();
    const key = `${RATE_LIMIT_PREFIX}${orderId}`;
    const windowMs = 60 * 1000; // 1 minute

    // Increment counter and get current count (atomic operation)
    const count = await redis.incr(key);

    // Set expiry on first request in window
    if (count === 1) {
      await redis.pexpire(key, windowMs);
    }

    // Check if limit exceeded
    if (count > ORDER_EDIT_RATE_LIMIT) {
      logger.warn("rate-limiter", "Rate limit exceeded", {
        orderId,
        count,
        limit: ORDER_EDIT_RATE_LIMIT,
      });
      return true; // Rate limited
    }

    return false; // Allowed
  } catch (error) {
    // Fail-open: if Redis fails, allow the request
    logger.error("rate-limiter", "Rate limit check failed", {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Rate limit response interface
 */
interface RateLimitResponse {
  status: (code: number) => RateLimitResponse;
  json: (body: Record<string, unknown>) => void;
}

/**
 * Rate limit request interface
 */
interface RateLimitRequest {
  params?: { id?: string };
}

/**
 * Middleware function for rate limiting order edit endpoints
 *
 * Configuration:
 * - Window: 1 minute
 * - Max requests: 10 per order ID per minute (configurable via ORDER_EDIT_RATE_LIMIT_PER_MINUTE)
 * - Key: order ID from route params
 * - Store: Redis (distributed, persistent across restarts)
 *
 * Why Redis instead of in-memory?
 * - Rate limits persist across server restarts
 * - Works correctly with multiple backend instances
 * - Consistent behavior in production environment
 * - Uses existing Redis infrastructure (same as BullMQ queues)
 */
export function orderEditRateLimiter(
  req: RateLimitRequest,
  res: RateLimitResponse,
  next: () => void
): void {
  // Extract order ID from route params
  const orderId = req.params?.id;

  if (!orderId) {
    // No order ID, skip rate limiting
    next();
    return;
  }

  // Check rate limit asynchronously
  checkRateLimit(orderId)
    .then((isLimited) => {
      if (isLimited) {
        res.status(429).json({
          success: false,
          errorCode: "RATE_LIMITED",
          error: "Too many edit attempts. Please wait before trying again.",
        });
      } else {
        next();
      }
    })
    .catch((error) => {
      // Fail-open: allow request if rate limit check fails
      logger.error("rate-limiter", "Rate limit middleware error", {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      next();
    });
}

/**
 * Cleanup function for graceful shutdown
 * Call this when the server is shutting down to close Redis connection
 */
export async function closeRateLimiterConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Reset rate limiter state (for testing only)
 */
export function resetRateLimiter(): void {
  redisClient = null;
}
