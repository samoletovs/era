// Unit tests for VID PVN deklarācija XML builder, MockVidClient, and
// the submission retry state machine.

import { describe, expect, it } from "vitest";

import type { VidSubmission } from "../../src/shared/types/entities";
import type { VatDeclaration } from "../../src/backend/services/reporting";
import {
  computeNextAttemptAt,
  DEFAULT_BASE_DELAY_SECONDS,
  MockVidClient,
  NoOpVidClient,
  retrySubmission,
  submitVidDeclaration,
  vatDeclarationToVidXml,
  VidClientError,
} from "../../src/backend/services/vid/submit";

// ─── Fixtures ────────────────────────────────────────────────

const sampleDeclaration: VatDeclaration = {
  companyName: "Acme SIA",
  registrationNumber: "40003123456",
  vatNumber: "LV40003123456",
  period: "2026-04",
  year: 2026,
  month: 4,
  taxableStandard: 1000,
  taxableReduced: 200,
  taxableSuperReduced: 0,
  outputVatStandard: 210,
  outputVatReduced: 24,
  outputVatSuperReduced: 0,
  totalOutputVat: 234,
  totalInputVat: 100,
  vatPayable: 134,
  lines: [
    { vatRate: 21, taxableAmount: 1000, vatAmount: 210, type: "output" },
    { vatRate: 12, taxableAmount: 200, vatAmount: 24, type: "output" },
    { vatRate: 21, taxableAmount: 500, vatAmount: 100, type: "input" },
  ],
};

// ─── XML builder ────────────────────────────────────────────

describe("vatDeclarationToVidXml", () => {
  it("emits a deterministic XML envelope with the declared namespace", () => {
    const xml = vatDeclarationToVidXml(sampleDeclaration);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('xmlns="urn:lv:vid:eds:pvn:1.0"');
    expect(xml).toContain("<PvnDeklaracija");
    expect(xml).toContain("</PvnDeklaracija>");
  });

  it("includes header fields", () => {
    const xml = vatDeclarationToVidXml(sampleDeclaration);
    expect(xml).toContain("<CompanyName>Acme SIA</CompanyName>");
    expect(xml).toContain("<RegistrationNumber>40003123456</RegistrationNumber>");
    expect(xml).toContain("<VatNumber>LV40003123456</VatNumber>");
    expect(xml).toContain("<Period>2026-04</Period>");
    expect(xml).toContain("<Year>2026</Year>");
    expect(xml).toContain("<Month>4</Month>");
  });

  it("emits totals with two-decimal precision", () => {
    const xml = vatDeclarationToVidXml(sampleDeclaration);
    expect(xml).toContain('<TaxableStandard rate="21">1000.00</TaxableStandard>');
    expect(xml).toContain("<TotalOutputVat>234.00</TotalOutputVat>");
    expect(xml).toContain("<TotalInputVat>100.00</TotalInputVat>");
    expect(xml).toContain("<VatPayable>134.00</VatPayable>");
  });

  it("emits one Line element per VAT-rate/type combination", () => {
    const xml = vatDeclarationToVidXml(sampleDeclaration);
    const matches = xml.match(/<Line type=/g);
    expect(matches?.length).toBe(3);
    expect(xml).toContain('<Line type="output" rate="21.00">');
    expect(xml).toContain('<Line type="output" rate="12.00">');
    expect(xml).toContain('<Line type="input" rate="21.00">');
  });

  it("escapes XML metacharacters in company name", () => {
    const xml = vatDeclarationToVidXml({
      ...sampleDeclaration,
      companyName: "Acme & Co <Ltd>",
    });
    expect(xml).toContain("Acme &amp; Co &lt;Ltd&gt;");
    expect(xml).not.toContain("<Ltd>");
  });

  it("renders an empty Lines block as an XML comment for declarations with no lines", () => {
    const xml = vatDeclarationToVidXml({ ...sampleDeclaration, lines: [] });
    expect(xml).toContain("<Lines>");
    expect(xml).toContain("<!-- no lines -->");
  });
});

// ─── Backoff ────────────────────────────────────────────────

describe("computeNextAttemptAt", () => {
  it("uses the default 60s base delay with exponential growth", () => {
    const t0 = new Date("2026-05-10T08:00:00Z");
    expect(computeNextAttemptAt(1, t0)).toBe(new Date(t0.getTime() + 60_000).toISOString());
    expect(computeNextAttemptAt(2, t0)).toBe(new Date(t0.getTime() + 120_000).toISOString());
    expect(computeNextAttemptAt(3, t0)).toBe(new Date(t0.getTime() + 240_000).toISOString());
    expect(computeNextAttemptAt(4, t0)).toBe(new Date(t0.getTime() + 480_000).toISOString());
  });

  it("respects a custom base delay", () => {
    const t0 = new Date("2026-05-10T08:00:00Z");
    expect(computeNextAttemptAt(1, t0, { baseDelaySeconds: 30 })).toBe(
      new Date(t0.getTime() + 30_000).toISOString(),
    );
  });

  it("uses the documented constants", () => {
    expect(DEFAULT_BASE_DELAY_SECONDS).toBe(60);
  });
});

// ─── Client implementations ─────────────────────────────────

describe("NoOpVidClient", () => {
  it("rejects every call with NOT_CONFIGURED (non-retriable)", async () => {
    const client = new NoOpVidClient();
    await expect(
      client.submit({ payload: "x", contentType: "application/xml", kind: "pvn-declaration", period: "2026-04", correlationId: "c1" }),
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED", retriable: false });
  });
});

describe("MockVidClient", () => {
  it("synthesises a deterministic receipt id", async () => {
    const client = new MockVidClient();
    const r1 = await client.submit({ payload: "<x/>", contentType: "application/xml", kind: "pvn-declaration", period: "2026-04", correlationId: "abc" });
    const r2 = await client.submit({ payload: "<x/>", contentType: "application/xml", kind: "pvn-declaration", period: "2026-05", correlationId: "abc" });
    expect(r1.receiptId).toBe("mock-vid-abc-1");
    expect(r2.receiptId).toBe("mock-vid-abc-2");
    expect(client.history.length).toBe(2);
  });

  it("rejects with INVALID when configured to reject", async () => {
    const client = new MockVidClient({ isRejectAll: true });
    await expect(
      client.submit({ payload: "x", contentType: "application/xml", kind: "pvn-declaration", period: "2026-04", correlationId: "c1" }),
    ).rejects.toMatchObject({ code: "INVALID", retriable: false });
  });

  it("fails with NETWORK when configured to fail-network", async () => {
    const client = new MockVidClient({ isFailNetwork: true });
    await expect(
      client.submit({ payload: "x", contentType: "application/xml", kind: "pvn-declaration", period: "2026-04", correlationId: "c1" }),
    ).rejects.toMatchObject({ code: "NETWORK", retriable: true });
  });
});

// ─── Submission orchestrator ────────────────────────────────

const baseSubmitArgs = {
  companyId: "co-1",
  kind: "pvn-declaration" as const,
  period: "2026-04",
  sourcePeriod: { year: 2026, month: 4 },
  payload: vatDeclarationToVidXml(sampleDeclaration),
  contentType: "application/xml" as const,
  createdBy: "user-1",
};

describe("submitVidDeclaration — happy path", () => {
  it("persists draft → accepted with receipt id on first attempt", async () => {
    const persisted: Array<{ id: string; status: string; attempts: number }> = [];
    const client = new MockVidClient();
    let counter = 0;
    const result = await submitVidDeclaration(baseSubmitArgs, {
      client,
      persistSubmission: async (s) => {
        persisted.push({ id: s.id, status: s.status, attempts: s.attempts.length });
      },
      now: () => new Date("2026-05-10T08:00:00Z"),
      newId: () => `vid-${++counter}`,
    });
    expect(persisted).toEqual([
      { id: "vid-1", status: "queued", attempts: 0 },
      { id: "vid-1", status: "accepted", attempts: 1 },
    ]);
    expect(result.status).toBe("accepted");
    expect(result.receiptId).toMatch(/^mock-vid-vid-1-/);
    expect(result.attempts[0].outcome).toBe("accepted");
    expect(result.acknowledgedAt).toBeTruthy();
  });
});

describe("submitVidDeclaration — permanent rejection", () => {
  it("transitions to rejected with no nextAttemptAt", async () => {
    const client = new MockVidClient({ isRejectAll: true });
    let counter = 0;
    const result = await submitVidDeclaration(baseSubmitArgs, {
      client,
      persistSubmission: async () => {},
      newId: () => `vid-${++counter}`,
    });
    expect(result.status).toBe("rejected");
    expect(result.nextAttemptAt).toBeUndefined();
    expect(result.attempts[0].outcome).toBe("rejected");
    expect(result.attempts[0].validationErrors?.[0].code).toBe("MOCK_REJECT");
  });
});

describe("submitVidDeclaration — transient network failure", () => {
  it("transitions to failed with nextAttemptAt set per backoff schedule", async () => {
    const client = new MockVidClient({ isFailNetwork: true });
    const t0 = new Date("2026-05-10T08:00:00Z");
    let counter = 0;
    const result = await submitVidDeclaration(baseSubmitArgs, {
      client,
      persistSubmission: async () => {},
      now: () => t0,
      newId: () => `vid-${++counter}`,
    });
    expect(result.status).toBe("failed");
    expect(result.attempts[0].outcome).toBe("failed");
    expect(result.attempts[0].responseCode).toBe("NETWORK");
    expect(result.nextAttemptAt).toBe(new Date(t0.getTime() + 60_000).toISOString());
  });

  it("maps a generic Error to UNKNOWN response code", async () => {
    const client = {
      name: "broken",
      submit: async () => {
        throw new Error("kaboom");
      },
    };
    const result = await submitVidDeclaration(baseSubmitArgs, {
      client,
      persistSubmission: async () => {},
      now: () => new Date("2026-05-10T08:00:00Z"),
      newId: () => "vid-x",
    });
    expect(result.status).toBe("failed");
    expect(result.attempts[0].responseCode).toBe("UNKNOWN");
    expect(result.attempts[0].responseMessage).toBe("kaboom");
  });
});

// ─── Retry behaviour ────────────────────────────────────────

describe("retrySubmission", () => {
  it("appends a new attempt and recomputes backoff", async () => {
    // Build a failed submission with one prior attempt.
    const client = new MockVidClient({ isFailNetwork: true });
    const t0 = new Date("2026-05-10T08:00:00Z");
    let persisted: VidSubmission | undefined;
    const initial = await submitVidDeclaration(baseSubmitArgs, {
      client,
      persistSubmission: async (s) => {
        persisted = s;
      },
      now: () => t0,
      newId: () => "vid-x",
    });
    expect(initial.status).toBe("failed");
    expect(initial.attempts.length).toBe(1);

    // Now retry with a different "now" — backoff should be 2*base = 120s.
    const t1 = new Date("2026-05-10T08:01:00Z");
    const retried = await retrySubmission(persisted!, {
      client,
      persistSubmission: async () => {},
      now: () => t1,
    });
    expect(retried.attempts.length).toBe(2);
    expect(retried.nextAttemptAt).toBe(new Date(t1.getTime() + 120_000).toISOString());
  });

  it("refuses retry on accepted submissions", async () => {
    const client = new MockVidClient();
    const accepted = await submitVidDeclaration(baseSubmitArgs, {
      client,
      persistSubmission: async () => {},
      newId: () => "vid-x",
    });
    await expect(
      retrySubmission(accepted, { client, persistSubmission: async () => {} }),
    ).rejects.toThrowError(/already accepted/);
  });

  it("refuses retry on rejected submissions", async () => {
    const client = new MockVidClient({ isRejectAll: true });
    const rejected = await submitVidDeclaration(baseSubmitArgs, {
      client,
      persistSubmission: async () => {},
      newId: () => "vid-x",
    });
    await expect(
      retrySubmission(rejected, { client, persistSubmission: async () => {} }),
    ).rejects.toThrowError(/permanently rejected/);
  });

  it("caps retries at maxAttempts and clears nextAttemptAt on terminal failure", async () => {
    const client = new MockVidClient({ isFailNetwork: true });
    const t0 = new Date("2026-05-10T08:00:00Z");
    let last: VidSubmission | undefined;
    last = await submitVidDeclaration(
      baseSubmitArgs,
      {
        client,
        persistSubmission: async (s) => {
          last = s;
        },
        now: () => t0,
        newId: () => "vid-x",
        policy: { maxAttempts: 3 },
      },
    );
    // Manually loop — production scheduler would do the same after waiting.
    while (last!.attempts.length < 3) {
      last = await retrySubmission(last!, {
        client,
        persistSubmission: async () => {},
        now: () => t0,
        policy: { maxAttempts: 3 },
      });
    }
    expect(last!.status).toBe("failed");
    expect(last!.attempts.length).toBe(3);
    expect(last!.nextAttemptAt).toBeUndefined();
    // Further retries should be refused.
    await expect(
      retrySubmission(last!, {
        client,
        persistSubmission: async () => {},
        policy: { maxAttempts: 3 },
      }),
    ).rejects.toThrowError(/maximum attempts/);
  });
});

// ─── VidClientError ────────────────────────────────────────

describe("VidClientError", () => {
  it("captures code, retriable, validation errors, and response code", () => {
    const e = new VidClientError(
      "INVALID",
      "Invalid request",
      false,
      [{ code: "X", message: "msg" }],
      "VR-005",
    );
    expect(e.code).toBe("INVALID");
    expect(e.retriable).toBe(false);
    expect(e.validationErrors?.[0]).toEqual({ code: "X", message: "msg" });
    expect(e.responseCode).toBe("VR-005");
  });
});
