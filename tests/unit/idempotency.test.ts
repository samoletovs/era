import { beforeEach, describe, expect, it, vi } from "vitest";
import { idempotency } from "../../src/backend/middleware/idempotency";
import { cacheInvalidate } from "../../src/backend/services/cache";

type MockReq = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
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

describe("idempotency middleware", () => {
  beforeEach(() => {
    cacheInvalidate("idem:");
  });

  it("rejects invalid idempotency key format", () => {
    const req: MockReq = {
      method: "POST",
      path: "/api/companies/c1/invoices",
      headers: { "x-idempotency-key": "bad key" },
    };
    const res = createRes();
    const next = vi.fn();

    idempotency(req as never, res as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: "VAL-001",
        message: "Invalid X-Idempotency-Key format",
      },
    });
  });

  it("returns cached success response for same method and path", () => {
    const req: MockReq = {
      method: "POST",
      path: "/api/companies/c1/invoices",
      headers: { "x-idempotency-key": "abc12345" },
    };

    const firstRes = createRes();
    idempotency(req as never, firstRes as never, () => {
      firstRes.status(201).json({ data: { id: "inv-1" } });
    });

    const secondRes = createRes();
    const next = vi.fn();
    idempotency(req as never, secondRes as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(secondRes.statusCode).toBe(201);
    expect(secondRes.body).toEqual({ data: { id: "inv-1" } });
  });

  it("does not share cache across different paths", () => {
    const key = "abc12345";

    const createReq = {
      method: "POST",
      path: "/api/companies/c1/invoices",
      headers: { "x-idempotency-key": key },
    } satisfies MockReq;

    const postReq = {
      method: "POST",
      path: "/api/companies/c1/journal-entries",
      headers: { "x-idempotency-key": key },
    } satisfies MockReq;

    const firstRes = createRes();
    idempotency(createReq as never, firstRes as never, () => {
      firstRes.status(201).json({ data: { id: "inv-1" } });
    });

    const secondRes = createRes();
    const next = vi.fn();
    idempotency(postReq as never, secondRes as never, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("does not cache failed responses", () => {
    const req: MockReq = {
      method: "POST",
      path: "/api/companies/c1/invoices",
      headers: { "x-idempotency-key": "abc12345" },
    };

    const firstRes = createRes();
    idempotency(req as never, firstRes as never, () => {
      firstRes.status(500).json({ error: { code: "SYS-001" } });
    });

    const secondRes = createRes();
    const next = vi.fn();
    idempotency(req as never, secondRes as never, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
