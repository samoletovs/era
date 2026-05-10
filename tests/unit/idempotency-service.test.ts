// Unit tests for services/idempotency.ts — the tool-call-level idempotency
// store used by the agent dispatcher. Distinct from the HTTP middleware in
// middleware/idempotency.ts (which is what tests/unit/idempotency.test.ts
// covers).
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory fake for the idempotency container. Mock must be defined inline
// inside vi.mock factory because of hoisting.
vi.mock("../../src/backend/services/cosmos.js", () => {
  const store = new Map<string, Record<string, unknown>>();
  const container = {
    items: {
      upsert: async (item: Record<string, unknown>) => {
        store.set(`${item.companyId}:${item.id}`, { ...item });
        return { resource: { ...item } };
      },
    },
    item: (id: string, partitionKey: string) => ({
      read: async () => {
        const found = store.get(`${partitionKey}:${id}`);
        if (!found) {
          const err = new Error("Not found") as Error & { code: number };
          err.code = 404;
          throw err;
        }
        return { resource: { ...found } };
      },
    }),
    _reset: () => store.clear(),
  };
  return {
    containers: { idempotency: () => container },
    __testContainer: container,
  };
});

import {
  hashArgs,
  lookupIdempotency,
  saveIdempotency,
  IdempotencyConflictError,
  MUTATION_TOOLS,
} from "../../src/backend/services/idempotency";
import * as cosmosMock from "../../src/backend/services/cosmos.js";

const testContainer = (cosmosMock as unknown as { __testContainer: { _reset: () => void } })
  .__testContainer;

describe("idempotency service", () => {
  beforeEach(() => {
    testContainer._reset();
  });

  describe("hashArgs", () => {
    it("produces the same hash for objects with reordered keys", () => {
      const a = hashArgs({ companyId: "c1", amount: 100, name: "Acme" });
      const b = hashArgs({ name: "Acme", amount: 100, companyId: "c1" });
      expect(a).toBe(b);
    });

    it("strips clientToken from the input before hashing", () => {
      const a = hashArgs({ companyId: "c1", clientToken: "tok-1" });
      const b = hashArgs({ companyId: "c1", clientToken: "tok-2" });
      const c = hashArgs({ companyId: "c1" });
      expect(a).toBe(b);
      expect(a).toBe(c);
    });

    it("produces different hashes for different payloads", () => {
      const a = hashArgs({ companyId: "c1", amount: 100 });
      const b = hashArgs({ companyId: "c1", amount: 200 });
      expect(a).not.toBe(b);
    });

    it("hashes nested objects stably", () => {
      const a = hashArgs({ lines: [{ debit: 10, credit: 0 }, { debit: 0, credit: 10 }] });
      const b = hashArgs({ lines: [{ credit: 0, debit: 10 }, { credit: 10, debit: 0 }] });
      expect(a).toBe(b);
    });
  });

  describe("MUTATION_TOOLS membership", () => {
    it("contains expected mutation tools", () => {
      expect(MUTATION_TOOLS.has("create_invoice")).toBe(true);
      expect(MUTATION_TOOLS.has("post_invoice")).toBe(true);
      expect(MUTATION_TOOLS.has("record_payment")).toBe(true);
      expect(MUTATION_TOOLS.has("post_journal_entry")).toBe(true);
    });

    it("excludes read-only tools", () => {
      expect(MUTATION_TOOLS.has("get_trial_balance")).toBe(false);
      expect(MUTATION_TOOLS.has("list_invoices")).toBe(false);
      expect(MUTATION_TOOLS.has("lookup_company")).toBe(false);
      expect(MUTATION_TOOLS.has("find_contact")).toBe(false);
    });
  });

  describe("lookupIdempotency / saveIdempotency", () => {
    it("returns null on cache miss", async () => {
      const got = await lookupIdempotency("missing-token", "company-1");
      expect(got).toBeNull();
    });

    it("returns the cached record after save", async () => {
      await saveIdempotency({
        clientToken: "token-1",
        companyId: "company-1",
        toolName: "create_invoice",
        argsHash: "abc",
        result: { invoiceId: "inv-1", total: 605 },
      });
      const got = await lookupIdempotency("token-1", "company-1");
      expect(got).not.toBeNull();
      expect(got!.toolName).toBe("create_invoice");
      expect(got!.argsHash).toBe("abc");
      expect(JSON.parse(got!.resultJson)).toEqual({ invoiceId: "inv-1", total: 605 });
    });

    it("isolates records by companyId (partition key)", async () => {
      await saveIdempotency({
        clientToken: "shared-token",
        companyId: "company-1",
        toolName: "create_invoice",
        argsHash: "h1",
        result: { invoiceId: "inv-1" },
      });
      const wrongTenant = await lookupIdempotency("shared-token", "company-2");
      expect(wrongTenant).toBeNull();
      const rightTenant = await lookupIdempotency("shared-token", "company-1");
      expect(rightTenant).not.toBeNull();
    });

    it("upsert overwrites prior cache entry for the same token", async () => {
      await saveIdempotency({
        clientToken: "token-1",
        companyId: "company-1",
        toolName: "create_invoice",
        argsHash: "h1",
        result: { v: 1 },
      });
      await saveIdempotency({
        clientToken: "token-1",
        companyId: "company-1",
        toolName: "create_invoice",
        argsHash: "h2",
        result: { v: 2 },
      });
      const got = await lookupIdempotency("token-1", "company-1");
      expect(got!.argsHash).toBe("h2");
      expect(JSON.parse(got!.resultJson)).toEqual({ v: 2 });
    });

    it("attaches a 7-day TTL to saved records", async () => {
      await saveIdempotency({
        clientToken: "token-ttl",
        companyId: "company-1",
        toolName: "create_invoice",
        argsHash: "h",
        result: {},
      });
      const got = await lookupIdempotency("token-ttl", "company-1");
      expect(got!.ttl).toBe(7 * 24 * 60 * 60);
    });
  });

  describe("IdempotencyConflictError", () => {
    it("carries 409 status code and tool/token context", () => {
      const err = new IdempotencyConflictError("create_invoice", "tok-1");
      expect(err.statusCode).toBe(409);
      expect(err.toolName).toBe("create_invoice");
      expect(err.clientToken).toBe("tok-1");
      expect(err.message).toContain("create_invoice");
      expect(err.message).toContain("tok-1");
    });
  });
});
