/**
 * OpenTelemetry / Azure Monitor bootstrap.
 *
 * MUST be imported as the very first thing in `index.ts` — `useAzureMonitor()`
 * patches Node's module loader to add auto-instrumentation, so any HTTP client
 * or Azure SDK imported BEFORE this call won't be traced. This file uses
 * top-level await so its initialization completes before sibling imports in
 * the entry module begin evaluating (per the ESM spec).
 *
 * Behavior:
 *   - When `APPLICATIONINSIGHTS_CONNECTION_STRING` is set, the distro is
 *     activated and telemetry flows to Application Insights.
 *   - When it isn't (local dev, tests), this module silently no-ops so the
 *     app boots without any AI dependency.
 *
 * The `getTracer()` helper always returns a real OpenTelemetry tracer; without
 * a registered provider it returns the global no-op tracer, which makes
 * span-creation calls in business code free even when telemetry is disabled.
 */
import { trace, type Tracer } from '@opentelemetry/api';

const TRACER_NAME = 'era-erp';
let bootstrapped = false;

function isEnabled(): boolean {
  const cs = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  return typeof cs === 'string' && cs.length > 0;
}

if (isEnabled()) {
  try {
    const { useAzureMonitor } = await import('@azure/monitor-opentelemetry');
    useAzureMonitor({
      azureMonitorExporterOptions: {
        connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
      },
    });
    bootstrapped = true;
  } catch (err) {
    // Never crash the app over telemetry. Surface clearly so ops sees it.
    console.error(
      JSON.stringify({
        level: 'error',
        component: 'observability',
        message: 'Failed to initialize Azure Monitor OpenTelemetry; continuing without telemetry',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

export function isObservabilityEnabled(): boolean {
  return bootstrapped;
}

/** Returns a tracer — a no-op tracer when telemetry is disabled. */
export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

/** Returns the active span's trace ID, or undefined when no span is active. */
export function currentTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const ctx = span.spanContext();
  // OpenTelemetry uses the all-zeroes trace ID to signal "invalid". Treat that
  // as "no trace" so callers can rely on `undefined` to mean "not traced".
  if (!ctx.traceId || /^0+$/.test(ctx.traceId)) return undefined;
  return ctx.traceId;
}
