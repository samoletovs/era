// Unit tests for the top-level Express error handler. Without it, anything
// that escapes per-route try/catch hits Express's default handler and renders
// an HTML stack trace — explicitly forbidden by the "no naked stack traces in
// UI" guarantee.
import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { errorHandlerMiddleware, safeError } from "../../src/backend/middleware/error-handler";
import { GLError } from "../../src/backend/services/ledger";

function makeRes(): Response & { _status: number; _body: unknown; _sent: boolean } {
  const res = {
    _status: 0,
    _body: undefined as unknown,
    _sent: false,
    headersSent: false,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      this._sent = true;
      return this;
    },
  };
  return res as unknown as Response & { _status: number; _body: unknown; _sent: boolean };
}

describe("safeError", () => {
  it("maps GLError to a 400 envelope with the original code", () => {
    const out = safeError(new GLError("MIN_LINES", "Journal entry must have at least 2 lines"));
    expect(out.status).toBe(400);
    expect(out.body.error.code).toBe("MIN_LINES");
  });

  it("maps 'not found' messages to a 404", () => {
    const out = safeError(new Error("Invoice not found"));
    expect(out.status).toBe(404);
    expect(out.body.error.code).toBe("NOT_FOUND");
    expect(out.body.error.message).toBe("Resource not found");
  });

  it("masks unknown errors as a generic 500 — never leaks the stack", () => {
    const original = new Error("internal database failure: connection string ABC");
    const out = safeError(original);
    expect(out.status).toBe(500);
    expect(out.body.error.code).toBe("SYS-001");
    // The verbatim internal message must not be sent to the client.
    expect(JSON.stringify(out.body)).not.toContain("connection string");
    expect(JSON.stringify(out.body)).not.toContain("internal database failure");
  });
});

describe("errorHandlerMiddleware", () => {
  it("responds with the safeError envelope for GLError", () => {
    const res = makeRes();
    const next = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      errorHandlerMiddleware(
        new GLError("ALREADY_REVERSED", "Entry already reversed"),
        {} as Request,
        res,
        next,
      );
      expect(res._status).toBe(400);
      expect((res._body as { error: { code: string } }).error.code).toBe("ALREADY_REVERSED");
      expect(next).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("masks unexpected errors as 500 SYS-001 with no stack leak", () => {
    const res = makeRes();
    const next = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      errorHandlerMiddleware(
        new Error("oh no internal kaboom"),
        {} as Request,
        res,
        next,
      );
      expect(res._status).toBe(500);
      const body = res._body as { error: { code: string; message: string } };
      expect(body.error.code).toBe("SYS-001");
      expect(body.error.message).not.toContain("kaboom");
      expect(next).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("delegates to next() if headers are already sent (Express recommendation)", () => {
    const res = makeRes();
    res.headersSent = true;
    const next = vi.fn();
    errorHandlerMiddleware(new Error("late error"), {} as Request, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res._sent).toBe(false);
  });
});
