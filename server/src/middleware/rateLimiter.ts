import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { RedisClientType } from "redis";
import { Request, Response } from "express";

/**
 * Rate Limiting Configuration
 * Protects API endpoints from spam and DDoS attacks
 */

// Configuration constants
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute for general API
const MAX_AUTH_REQUESTS_PER_WINDOW = 20; // 20 auth requests per minute (stricter)
const MAX_DOCUMENT_REQUESTS_PER_WINDOW = 50; // 50 document requests per minute

// Store reference for Redis client
let redisClient: RedisClientType | null = null;

/**
 * Set Redis client for rate limiting store
 */
export function setRateLimitRedisClient(client: RedisClientType) {
  redisClient = client;
}

/**
 * Create a Redis-backed rate limit store or fallback to memory store
 */
function createStore(prefix: string) {
  if (redisClient) {
    return new RedisStore({
      sendCommand: (...args: string[]) => redisClient!.sendCommand(args),
      prefix: `rate-limit:${prefix}:`,
    });
  }
  // Falls back to in-memory store if Redis is not available
  return undefined;
}

/**
 * Standard response handler for rate limit exceeded
 */
function rateLimitHandler(req: Request, res: Response) {
  res.status(429).json({
    error: "Too many requests",
    message: "You have exceeded the rate limit. Please try again later.",
    retryAfter: res.getHeader("Retry-After"),
  });
}

/**
 * General API rate limiter
 * Allows 100 requests per minute per IP
 */
export const generalRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: MAX_REQUESTS_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  // Use default keyGenerator (handles IPv6 properly)
  handler: rateLimitHandler,
  store: createStore("general"),
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === "/health" || req.path === "/api/health";
  },
  validate: { xForwardedForHeader: false },
});

/**
 * Strict rate limiter for authentication endpoints
 * Allows 20 requests per minute per IP to prevent brute force attacks
 */
export const authRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: MAX_AUTH_REQUESTS_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  store: createStore("auth"),
  message: {
    error: "Too many authentication attempts",
    message: "Please wait before trying again.",
  },
  validate: { xForwardedForHeader: false },
});

/**
 * Document API rate limiter
 * Allows 50 requests per minute per IP
 */
export const documentRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: MAX_DOCUMENT_REQUESTS_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  store: createStore("document"),
  validate: { xForwardedForHeader: false },
});

/**
 * Very strict rate limiter for sensitive operations
 * Allows only 10 requests per minute
 */
export const strictRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  store: createStore("strict"),
  validate: { xForwardedForHeader: false },
});

/**
 * Create a custom rate limiter with specific configuration
 */
export function createCustomRateLimiter(options: {
  windowMs?: number;
  max: number;
  prefix: string;
}) {
  return rateLimit({
    windowMs: options.windowMs || RATE_LIMIT_WINDOW_MS,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
    store: createStore(options.prefix),
    validate: { xForwardedForHeader: false },
  });
}
