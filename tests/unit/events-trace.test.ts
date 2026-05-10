// Unit tests for trace-ID propagation in events.ts.
//
// Mocks both Cosmos and the observability bootstrap so we can assert the
// exact shape that the events container receives. This proves the wiring
// without needing a real OpenTelemetry tracer provider.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captured: Array<Record<string, unknown>> = [];

vi.mock("../../src/backend/services/cosmos.js", () => ({
  containers: {
    events: () => ({
      items: {
        create: async (record: Record<string, unknown>) => {
          captured.push(record);
          return { resource: record };
        },
      },
    }),
  },
}));

vi.mock("../../src/backend/observability.js", () => ({
  currentTraceId: vi.fn(),
}));

import { emitEvent } from "../../src/backend/services/events";
import { currentTraceId } from "../../src/backend/observability";

describe("emitEvent — traceId propagation", () => {
  beforeEach(() => {
    captured.length = 0;
    vi.mocked(currentTraceId).mockReset();
  });

  afterEach(() => {
    vi.mocked(currentTraceId).mockReset();
  });

  it("stamps the active trace ID onto the persisted event", async () => {
    vi.mocked(currentTraceId).mockReturnValue("0123456789abcdef0123456789abcdef");
    await emitEvent({
      companyId: "company-1",
      type: "invoice.posted",
      actor: "user-1",
      documentType: "invoice",
      documentId: "inv-1",
    });
    expect(captured).toHaveLength(1);
    expect(captured[0].traceId).toBe("0123456789abcdef0123456789abcdef");
    expect(captured[0].companyId).toBe("company-1");
    expect(captured[0].type).toBe("invoice.posted");
  });

  it("omits traceId when no span is active", async () => {
    vi.mocked(currentTraceId).mockReturnValue(undefined);
    await emitEvent({
      companyId: "company-1",
      type: "payment.applied",
      actor: "user-1",
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]).not.toHaveProperty("traceId");
  });

  it("prefers an explicit input traceId over the active span", async () => {
    vi.mocked(currentTraceId).mockReturnValue("active-trace");
    await emitEvent({
      companyId: "company-1",
      type: "entry.reversed",
      actor: "user-1",
      traceId: "explicit-trace",
    });
    expect(captured).toHaveLength(1);
    expect(captured[0].traceId).toBe("explicit-trace");
  });

  it("populates id and timestamp regardless of trace state", async () => {
    vi.mocked(currentTraceId).mockReturnValue(undefined);
    await emitEvent({
      companyId: "company-1",
      type: "invoice.posted",
      actor: "user-1",
    });
    expect(captured[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(captured[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("never throws when the underlying container fails (best-effort logging)", async () => {
    vi.mocked(currentTraceId).mockReturnValue(undefined);
    // Replace the mock for one call to throw.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      // Drive a failure by pushing a sentinel that throws when create is called.
      const cosmos = await import("../../src/backend/services/cosmos.js");
      const original = cosmos.containers.events;
      cosmos.containers.events = () =>
        ({
          items: {
            create: async () => {
              throw new Error("simulated cosmos write failure");
            },
          },
        }) as unknown as ReturnType<typeof original>;

      await expect(
        emitEvent({ companyId: "c", type: "invoice.posted", actor: "u" }),
      ).resolves.toBeUndefined();
      expect(errSpy).toHaveBeenCalled();

      cosmos.containers.events = original;
    } finally {
      errSpy.mockRestore();
    }
  });
});
