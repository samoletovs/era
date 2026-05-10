/**
 * Health check service — used by the `/health` endpoint and by external
 * monitors (`.github/scripts/nauro-monitor.py`).
 *
 * Probes the runtime dependencies the app actually needs to function:
 *
 *   - **api**:      always healthy (the fact that this code ran is the proof).
 *   - **database**: a `getDatabaseAccount()` round-trip against Cosmos DB.
 *                   This validates network reachability + managed-identity
 *                   credentials without touching any container or RU budget.
 *   - **openai**:   verifies the env vars required by `services/agent.ts` are
 *                   set and that the endpoint URL is well-formed. A real chat
 *                   completion call would cost tokens on every probe, so we
 *                   keep this layer cheap and let production traffic surface
 *                   any deeper auth/quota issues.
 *
 * Each check is bounded by `CHECK_TIMEOUT_MS` so a hung dependency can't
 * stall the whole probe (Container Apps' default liveness timeout is short).
 *
 * The Storage Account is provisioned in `infrastructure/main.bicep` but is
 * not currently a runtime dependency of any code path; it is intentionally
 * **not** probed here. Add a check when document upload becomes a hard dep.
 */

const CHECK_TIMEOUT_MS = 3000;

export type CheckStatus = 'healthy' | 'unhealthy' | 'skipped';

export interface HealthReport {
  status: 'healthy' | 'degraded';
  version: string;
  timestamp: string;
  checks: Record<string, CheckStatus>;
  /** Only populated for unhealthy checks; aids triage without leaking secrets. */
  errors?: Record<string, string>;
}

interface DependencyChecker {
  name: string;
  run: () => Promise<void>;
}

async function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} check timed out after ${CHECK_TIMEOUT_MS}ms`)),
          CHECK_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkCosmos(): Promise<void> {
  // Lazy import so unit tests can fully mock '../services/cosmos.js' without
  // dragging in the real Cosmos client at module import time.
  const { getCosmosClient } = await import('./cosmos.js');
  await withTimeout(getCosmosClient().getDatabaseAccount(), 'cosmos');
}

async function checkOpenAI(): Promise<void> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  if (!endpoint) throw new Error('AZURE_OPENAI_ENDPOINT not set');
  if (!apiKey) throw new Error('AZURE_OPENAI_API_KEY not set');
  // Validate endpoint is a parseable URL — guards against typos like the
  // missing `https://` prefix that would silently fail at request time.
  try {
    new URL(endpoint);
  } catch {
    throw new Error(`AZURE_OPENAI_ENDPOINT is not a valid URL: ${endpoint}`);
  }
}

const DEPENDENCY_CHECKS: DependencyChecker[] = [
  { name: 'database', run: checkCosmos },
  { name: 'openai', run: checkOpenAI },
];

/**
 * Run all dependency checks in parallel and assemble a single report.
 * Never throws — failures are recorded as `unhealthy` in the report.
 */
export async function getHealthReport(): Promise<HealthReport> {
  const checks: Record<string, CheckStatus> = { api: 'healthy' };
  const errors: Record<string, string> = {};

  const results = await Promise.allSettled(
    DEPENDENCY_CHECKS.map(async (c) => {
      await c.run();
      return c.name;
    }),
  );

  for (let i = 0; i < DEPENDENCY_CHECKS.length; i++) {
    const result = results[i];
    const name = DEPENDENCY_CHECKS[i].name;
    if (result.status === 'fulfilled') {
      checks[name] = 'healthy';
    } else {
      checks[name] = 'unhealthy';
      const reason = result.reason as Error | unknown;
      errors[name] = reason instanceof Error ? reason.message : String(reason);
    }
  }

  const overall = Object.values(checks).every((s) => s === 'healthy') ? 'healthy' : 'degraded';

  const report: HealthReport = {
    status: overall,
    version: process.env.npm_package_version ?? '0.1.0',
    timestamp: new Date().toISOString(),
    checks,
  };
  if (Object.keys(errors).length > 0) report.errors = errors;
  return report;
}
