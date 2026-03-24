import { describe, expect, it, vi } from "vitest";
import { authMiddleware } from "../../src/backend/middleware/auth";

type MockReq = {
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  user?: unknown;
};

type MockRes = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockRes;
  json: (payload: unknown) => MockRes;
};

function createRes(): MockRes {
  return {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

describe("auth middleware", () => {
  it("rejects dev bypass token in production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const req: MockReq = {
      headers: { authorization: "Bearer dev-bypass" },
      query: {},
    };
    const res = createRes();
    const next = vi.fn();

    await authMiddleware(req as never, res as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      error: {
        code: "AUTH-001",
        message: "Invalid bearer token",
      },
    });

    process.env.NODE_ENV = original;
  });

  it("allows dev bypass token outside production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const req: MockReq = {
      headers: { authorization: "Bearer dev-bypass" },
      query: {},
    };
    const res = createRes();
    const next = vi.fn();

    await authMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toBeDefined();

    process.env.NODE_ENV = original;
  });
});
