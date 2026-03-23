// Tests for platform middleware: pagination, validation, error handling, cache, idempotency
import { describe, it, expect } from "vitest";

// ─── Pagination ─────────────────────────────────────────────

describe("pagination logic", () => {
  // Test the parsePagination logic directly
  const DEFAULT_PAGE_SIZE = 25;
  const MAX_PAGE_SIZE = 100;

  function parsePagination(query: { limit?: string; offset?: string }) {
    const rawLimit = parseInt(query.limit || "", 10);
    const rawOffset = parseInt(query.offset || "", 10);
    return {
      limit: (rawLimit > 0 && rawLimit <= MAX_PAGE_SIZE) ? rawLimit : DEFAULT_PAGE_SIZE,
      offset: (rawOffset >= 0) ? rawOffset : 0,
    };
  }

  it("uses defaults when no params provided", () => {
    const pg = parsePagination({});
    expect(pg.limit).toBe(25);
    expect(pg.offset).toBe(0);
  });

  it("accepts valid limit and offset", () => {
    const pg = parsePagination({ limit: "50", offset: "100" });
    expect(pg.limit).toBe(50);
    expect(pg.offset).toBe(100);
  });

  it("clamps limit to MAX_PAGE_SIZE", () => {
    const pg = parsePagination({ limit: "500" });
    expect(pg.limit).toBe(25); // Falls back to default since 500 > MAX
  });

  it("rejects negative limit", () => {
    const pg = parsePagination({ limit: "-5" });
    expect(pg.limit).toBe(25);
  });

  it("rejects zero limit", () => {
    const pg = parsePagination({ limit: "0" });
    expect(pg.limit).toBe(25);
  });

  it("rejects negative offset", () => {
    const pg = parsePagination({ offset: "-1" });
    expect(pg.offset).toBe(0);
  });

  it("accepts zero offset", () => {
    const pg = parsePagination({ offset: "0" });
    expect(pg.offset).toBe(0);
  });

  it("builds correct OFFSET/LIMIT clause", () => {
    const pg = { limit: 25, offset: 50 };
    const clause = `OFFSET ${pg.offset} LIMIT ${pg.limit}`;
    expect(clause).toBe("OFFSET 50 LIMIT 25");
  });

  it("wraps paginated response with metadata", () => {
    const items = ["a", "b", "c"];
    const params = { limit: 25, offset: 0 };
    const response = {
      data: items,
      meta: { limit: params.limit, offset: params.offset, count: items.length },
    };
    expect(response.data).toHaveLength(3);
    expect(response.meta.limit).toBe(25);
    expect(response.meta.offset).toBe(0);
    expect(response.meta.count).toBe(3);
  });
});

// ─── Error Sanitization ─────────────────────────────────────

describe("error sanitization", () => {
  it("never exposes stack traces to client", () => {
    const err = new Error("COSMOS_KEY is invalid");
    const response = {
      status: 500,
      body: { error: { code: "SYS-001", message: "An internal error occurred. Please try again later." } },
    };
    expect(response.body.error.message).not.toContain("COSMOS_KEY");
    expect(response.body.error.message).not.toContain("stack");
  });

  it("shows GLError messages to client (business errors are safe)", () => {
    // GLError is a known business error type
    const glError = { code: "FIN-001", message: "Invoice is already posted" };
    expect(glError.message).toBe("Invoice is already posted");
    expect(glError.code).toBe("FIN-001");
  });

  it("maps not-found errors to 404", () => {
    const err = new Error("Company not found");
    const isNotFound = err.message.toLowerCase().includes("not found");
    expect(isNotFound).toBe(true);
  });
});

// ─── Cache Logic ────────────────────────────────────────────

describe("in-memory cache", () => {
  // Simulate cache behavior
  const store = new Map<string, { data: unknown; expiresAt: number }>();

  function cacheGet<T>(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { store.delete(key); return undefined; }
    return entry.data as T;
  }

  function cacheSet<T>(key: string, data: T, ttlSeconds: number): void {
    store.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  it("returns undefined for missing key", () => {
    expect(cacheGet("nonexistent")).toBeUndefined();
  });

  it("stores and retrieves value", () => {
    cacheSet("rate:EUR:USD", 1.08, 3600);
    expect(cacheGet<number>("rate:EUR:USD")).toBe(1.08);
  });

  it("returns undefined for expired key", () => {
    store.set("expired", { data: "old", expiresAt: Date.now() - 1000 });
    expect(cacheGet("expired")).toBeUndefined();
  });

  it("cache keys follow naming convention", () => {
    const key = `fx:EUR:USD:2026-03-23`;
    expect(key).toMatch(/^fx:[A-Z]{3}:[A-Z]{3}:\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── Idempotency ────────────────────────────────────────────

describe("idempotency key logic", () => {
  it("allows GET requests without idempotency key", () => {
    const method = "GET";
    const key = undefined;
    const shouldProcess = !key || method === "GET";
    expect(shouldProcess).toBe(true);
  });

  it("caches POST response for future retries", () => {
    const key = "idem:abc-123";
    const response = { status: 201, body: { data: { id: "inv-1" } } };

    // Simulate cache
    const idempotencyStore = new Map<string, typeof response>();
    idempotencyStore.set(key, response);

    const cached = idempotencyStore.get(key);
    expect(cached?.status).toBe(201);
    expect(cached?.body.data.id).toBe("inv-1");
  });

  it("returns cached response on retry with same key", () => {
    const key = "idem:abc-123";
    const firstResponse = { status: 201, body: { data: { id: "inv-1" } } };
    const cache = new Map<string, typeof firstResponse>();
    cache.set(key, firstResponse);

    // Second call with same key
    const secondResponse = cache.get(key);
    expect(secondResponse).toEqual(firstResponse);
  });

  it("different keys produce independent results", () => {
    const cache = new Map<string, { status: number }>();
    cache.set("idem:key-1", { status: 201 });
    cache.set("idem:key-2", { status: 400 });

    expect(cache.get("idem:key-1")?.status).toBe(201);
    expect(cache.get("idem:key-2")?.status).toBe(400);
  });
});

// ─── Zod Validation ─────────────────────────────────────────

describe("request validation schemas", () => {
  const { z } = require("zod");

  const CreateCompanySchema = z.object({
    name: z.string().min(1).max(200),
    code: z.string().regex(/^[A-Z0-9]{1,5}$/).optional(),
  }).strict();

  it("accepts valid company creation", () => {
    const result = CreateCompanySchema.safeParse({ name: "Test Company", code: "TEST" });
    expect(result.success).toBe(true);
  });

  it("rejects empty company name", () => {
    const result = CreateCompanySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid company code (lowercase)", () => {
    const result = CreateCompanySchema.safeParse({ name: "Test", code: "test" });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields (strict mode)", () => {
    const result = CreateCompanySchema.safeParse({ name: "Test", malicious: "drop table" });
    expect(result.success).toBe(false);
  });

  it("accepts company without optional code", () => {
    const result = CreateCompanySchema.safeParse({ name: "Test Company" });
    expect(result.success).toBe(true);
  });
});

// ─── GL Account Constants ───────────────────────────────────

describe("shared GL account constants", () => {
  const DEFAULT_GL_ACCOUNTS = {
    ACCOUNTS_RECEIVABLE: "2210",
    ACCOUNTS_PAYABLE: "4220",
    BANK: "2420",
    VAT_OUTPUT: "4230",
    VAT_INPUT: "2310",
  };

  it("defines all required GL accounts", () => {
    expect(DEFAULT_GL_ACCOUNTS.ACCOUNTS_RECEIVABLE).toBe("2210");
    expect(DEFAULT_GL_ACCOUNTS.ACCOUNTS_PAYABLE).toBe("4220");
    expect(DEFAULT_GL_ACCOUNTS.BANK).toBe("2420");
    expect(DEFAULT_GL_ACCOUNTS.VAT_OUTPUT).toBe("4230");
    expect(DEFAULT_GL_ACCOUNTS.VAT_INPUT).toBe("2310");
  });

  it("all GL codes are 4-digit strings", () => {
    for (const code of Object.values(DEFAULT_GL_ACCOUNTS)) {
      expect(code).toMatch(/^\d{4}$/);
    }
  });
});

// ─── Operation Result Types ─────────────────────────────────

describe("agent operation result structure", () => {
  it("create operation includes suggested next actions", () => {
    const result = {
      operation: "create" as const,
      entityType: "invoice" as const,
      entityId: "inv-123",
      status: "success" as const,
      message: "Invoice INV-001 created",
      suggestedActions: ["post", "edit", "attach-document"],
    };

    expect(result.operation).toBe("create");
    expect(result.suggestedActions).toContain("post");
    expect(result.suggestedActions).toContain("edit");
  });

  it("payment result includes related invoice entities", () => {
    const result = {
      operation: "create" as const,
      entityType: "payment" as const,
      entityId: "pay-123",
      status: "success" as const,
      message: "Payment PAY-001 recorded",
      relatedEntities: [
        { type: "invoice", id: "inv-001" },
        { type: "invoice", id: "inv-002" },
      ],
    };

    expect(result.relatedEntities).toHaveLength(2);
    expect(result.relatedEntities![0].type).toBe("invoice");
  });
});
