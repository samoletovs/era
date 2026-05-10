// Unit tests for the observability bootstrap module.
//
// These tests verify the no-op (telemetry disabled) path — they don't actually
// connect to Application Insights. The bootstrap is intentionally idempotent
// and silent when APPLICATIONINSIGHTS_CONNECTION_STRING is absent.
import { describe, it, expect } from "vitest";
import {
  isObservabilityEnabled,
  getTracer,
  currentTraceId,
} from "../../src/backend/observability";
import { trace } from "@opentelemetry/api";

describe("observability (telemetry disabled)", () => {
  it("isObservabilityEnabled() returns false without a connection string", () => {
    // The integration harness sets the connection string to undefined; the
    // bootstrap module is loaded once at process start, so this is a stable
    // assertion in this test suite.
    expect(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING).toBeFalsy();
    expect(isObservabilityEnabled()).toBe(false);
  });

  it("getTracer() returns a usable tracer (no-op global)", () => {
    const tracer = getTracer();
    expect(tracer).toBeDefined();
    expect(typeof tracer.startActiveSpan).toBe("function");
  });

  it("currentTraceId() returns undefined when no span is active", () => {
    expect(currentTraceId()).toBeUndefined();
  });

  it("currentTraceId() inside a no-op span is still undefined (zeros are not a real trace)", async () => {
    // The no-op tracer creates a span with all-zero IDs — currentTraceId
    // explicitly filters those out so callers can rely on `undefined` ==
    // "not traced".
    await getTracer().startActiveSpan("test.span", async (span) => {
      try {
        const id = currentTraceId();
        expect(id).toBeUndefined();
      } finally {
        span.end();
      }
    });
  });

  it("getActiveSpan() returns undefined outside a span context", () => {
    expect(trace.getActiveSpan()).toBeUndefined();
  });

  it("startActiveSpan supports OK + ERROR status codes without throwing", async () => {
    await getTracer().startActiveSpan("test.ok", async (span) => {
      span.setAttribute("test.attr", "value");
      span.setStatus({ code: 1 }); // SpanStatusCode.OK
      span.end();
    });
    await getTracer().startActiveSpan("test.error", async (span) => {
      span.recordException(new Error("boom"));
      span.setStatus({ code: 2, message: "boom" });
      span.end();
    });
    // If we got here, the no-op tracer accepted all the calls.
    expect(true).toBe(true);
  });
});
