import rateLimit from 'express-rate-limit';
import { redisClient } from '../config/redis';
import { env } from '../config/env';
import { Request, Response } from 'express';

// Basic rate limiter using express-rate-limit
export const basicRateLimiter = rateLimit({
  windowMs: parseInt(env.RATE_LIMIT_WINDOW) * 1000,
  max: parseInt(env.RATE_LIMIT_MAX_REQUESTS),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Redis-based rate limiter for more advanced use cases
export async function redisRateLimiter(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  // Use Redis sorted set for sliding window
  const redisKey = `ratelimit:${key}`;

  try {
    // Remove old entries
    await redisClient.zRemRangeByScore(redisKey, 0, windowStart);

    // Count current requests
    const currentCount = await redisClient.zCard(redisKey);

    if (currentCount >= maxRequests) {
      // Get the oldest request timestamp to calculate reset time
      const oldestRequests = await redisClient.zRange(redisKey, 0, 0, {
        REV: false,
      });
      const oldestTimestamp = oldestRequests.length > 0 
        ? parseInt(oldestRequests[0]) 
        : now;
      const resetAt = oldestTimestamp + windowSeconds * 1000;

      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    // Add current request
    await redisClient.zAdd(redisKey, {
      score: now,
      value: `${now}-${Math.random()}`,
    });

    // Set expiry on the key
    await redisClient.expire(redisKey, windowSeconds);

    return {
      allowed: true,
      remaining: maxRequests - currentCount - 1,
      resetAt: now + windowSeconds * 1000,
    };
  } catch (error) {
    // If Redis fails, allow the request (fail open)
    console.error('Rate limiter error:', error);
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt: now + windowSeconds * 1000,
    };
  }
}

// Middleware for organization-based rate limiting
export function organizationRateLimiter(maxRequests: number, windowSeconds: number) {
  return async (req: any, res: Response, next: Function) => {
    const organizationId = req.organization?.id || req.user?.organizationId;

    if (!organizationId) {
      return next();
    }

    const result = await redisRateLimiter(
      `org:${organizationId}`,
      maxRequests,
      windowSeconds
    );

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.floor(result.resetAt / 1000).toString());

    if (!result.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        resetAt: new Date(result.resetAt).toISOString(),
      });
    }

    next();
  };
}
