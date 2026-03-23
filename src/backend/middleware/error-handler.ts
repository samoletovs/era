import { Request, Response } from "express";
import { GLError } from "../services/ledger.js";

/**
 * Sanitize an error for client response — never expose internal details.
 * GLError = business error (safe to show message).
 * Everything else = generic message + structured log.
 */
export function safeError(err: unknown, defaultCode = "SYS-001"): { status: number; body: { error: { code: string; message: string } } } {
  if (err instanceof GLError) {
    return {
      status: 400,
      body: { error: { code: err.code, message: err.message } },
    };
  }

  // Known "not found" patterns
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.toLowerCase().includes("not found")) {
    return {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: msg } },
    };
  }

  // Log real error server-side, return generic to client
  console.error(JSON.stringify({
    level: "error",
    code: defaultCode,
    message: msg,
    stack: err instanceof Error ? err.stack : undefined,
  }));

  return {
    status: 500,
    body: { error: { code: defaultCode, message: "An internal error occurred. Please try again later." } },
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
