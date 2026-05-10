import { Request, Response, NextFunction } from 'express';
import { GLError } from '../services/ledger.js';

/**
 * Sanitize an error for client response — never expose internal details.
 * GLError = business error (safe to show message).
 * Everything else = generic message + structured log.
 */
export function safeError(
  err: unknown,
  defaultCode = 'SYS-001',
): { status: number; body: { error: { code: string; message: string } } } {
  if (err instanceof GLError) {
    return {
      status: 400,
      body: { error: { code: err.code, message: err.message } },
    };
  }

  // Known "not found" patterns
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.toLowerCase().includes('not found')) {
    return {
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: msg } },
    };
  }

  // Log real error server-side, return generic to client
  console.error(
    JSON.stringify({
      level: 'error',
      code: defaultCode,
      message: msg,
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );

  return {
    status: 500,
    body: {
      error: { code: defaultCode, message: 'An internal error occurred. Please try again later.' },
    },
  };
}

/** Wraps an async route handler with standardized error handling */
export function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      const { status, body } = safeError(err);
      if (!res.headersSent) {
        res.status(status).json(body);
      }
    });
  };
}

/**
 * Top-level Express error-handling middleware (4-arg signature).
 *
 * Backstops any error that escapes the per-route try/catch — without it,
 * Express's default handler renders an HTML stack trace, which is exactly
 * what the "no naked stack traces in UI" goal forbids. Reuses `safeError` so
 * the response shape is identical to what every route already returns.
 *
 * Wire as the LAST `app.use(...)` in `index.ts`, after the API router and
 * the SPA catch-all.
 */
// 4-arg signature is required by Express to identify error middleware
export function errorHandlerMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    // Express recommendation: delegate to default handler if we've already started writing.
    next(err);
    return;
  }
  const { status, body } = safeError(err);
  res.status(status).json(body);
}
