import { Request, Response, NextFunction } from "express";
import { cacheGet, cacheSet } from "../services/cache.js";

/**
 * Idempotency middleware for write operations.
 *
 * When a client (user or agent) sends a request with X-Idempotency-Key header,
 * the system ensures the operation executes at most once. On retry with the same
 * key, the cached response is returned instead of re-executing.
 *
 * This is CRITICAL for agent-driven ERP operations:
 * - Agent creates invoice → network timeout → agent retries → must not double-post
 * - Payment processing → crash → restart → must not double-pay
 *
 * Design follows Stripe/PayPal idempotency patterns.
 * Keys expire after 24 hours (covers any reasonable retry window).
 */
const IDEMPOTENCY_TTL = 86400; // 24 hours
const IDEMPOTENCY_PREFIX = "idem:";
const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9:_-]{8,128}$/;

export function idempotency(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const key = req.headers["x-idempotency-key"] as string | undefined;
  const method = req.method.toUpperCase();

  // Only applies to state-changing methods with an explicit key
  if (!key || method === "GET" || method === "HEAD" || method === "OPTIONS") {
    next();
    return;
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    res.status(400).json({
      error: {
        code: "VAL-001",
        message: "Invalid X-Idempotency-Key format",
      },
    });
    return;
  }

  const scopedKey = `${IDEMPOTENCY_PREFIX}${method}:${req.path}:${key}`;

  // Check for cached response
  const cached = cacheGet<{ status: number; body: unknown }>(scopedKey);
  if (cached) {
    res.status(cached.status).json(cached.body);
    return;
  }

  // Intercept the response to cache it
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    // Cache only successful responses to avoid pinning transient failures.
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cacheSet(scopedKey, { status: res.statusCode, body }, IDEMPOTENCY_TTL);
    }
    return originalJson(body);
  };

  next();
}
