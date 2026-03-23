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

export function idempotency(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-idempotency-key"] as string | undefined;

  // Only applies to state-changing methods with an explicit key
  if (!key || req.method === "GET") {
    next();
    return;
  }

  // Check for cached response
  const cached = cacheGet<{ status: number; body: unknown }>(IDEMPOTENCY_PREFIX + key);
  if (cached) {
    res.status(cached.status).json(cached.body);
    return;
  }

  // Intercept the response to cache it
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    // Cache the response for future retries
    cacheSet(IDEMPOTENCY_PREFIX + key, { status: res.statusCode, body }, IDEMPOTENCY_TTL);
    return originalJson(body);
  };

  next();
}
