/**
 * Idempotency service — at-most-once execution for agent tool mutations.
 *
 * Pattern: every mutation tool in `agent-tools.ts` accepts an optional
 * `clientToken` parameter. When the dispatcher receives a tool call with a
 * `clientToken`, it consults this service first:
 *
 *   - cache hit + matching argsHash  → return the cached result (no re-run)
 *   - cache hit + mismatching args   → throw (token reuse with different args)
 *   - cache miss                     → run the operation, then cache the result
 *
 * Records are stored in the `idempotency` Cosmos container, partition key
 * `/companyId`, doc id `clientToken`. A 7-day TTL is set per record so the
 * container auto-purges (the container has TTL enabled with no default; each
 * doc carries its own `ttl`).
 *
 * Read tools bypass this service entirely — only mutations are deduped.
 */
import { createHash } from 'node:crypto';
import { containers } from './cosmos.js';

/** Names of agent tools that mutate state and therefore need idempotency. */
export const MUTATION_TOOLS: ReadonlySet<string> = new Set([
  'create_company',
  'create_contact',
  'create_invoice',
  'post_invoice',
  'record_payment',
  'post_journal_entry',
  'create_item',
  'generate_vat_return',
  'run_month_end',
  'run_year_end',
  'create_credit_note',
  'acquire_fixed_asset',
  'create_recurring_template',
]);

/** TTL for cached idempotency records, in seconds (7 days). */
const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface IdempotencyRecord {
  id: string; // clientToken
  companyId: string; // partition key
  toolName: string;
  argsHash: string;
  resultJson: string;
  createdAt: string;
  ttl: number;
}

/**
 * Stable, order-independent JSON of an args object — used as the input to the
 * argsHash. Keys are sorted recursively. `clientToken` itself is stripped so
 * that hashing focuses on the semantic payload only.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => k !== 'clientToken')
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function hashArgs(args: Record<string, unknown>): string {
  return createHash('sha256').update(stableStringify(args)).digest('hex');
}

/**
 * Look up a cached idempotency record. Returns `null` when no record exists.
 * Does NOT throw on argsHash mismatch — that's the caller's job (the caller
 * has the contextual `toolName` for a useful error message).
 */
export async function lookupIdempotency(
  clientToken: string,
  companyId: string,
): Promise<IdempotencyRecord | null> {
  try {
    const result = await containers
      .idempotency()
      .item(clientToken, companyId)
      .read<IdempotencyRecord>();
    return result.resource ?? null;
  } catch (err) {
    const code =
      (err as { code?: number; statusCode?: number }).code ??
      (err as { statusCode?: number }).statusCode;
    if (code === 404) return null;
    throw err;
  }
}

/**
 * Persist an idempotency record. Caller is responsible for computing the
 * argsHash and serializing the result. Errors are swallowed (logged) — caching
 * must never break a successful mutation.
 */
export async function saveIdempotency(params: {
  clientToken: string;
  companyId: string;
  toolName: string;
  argsHash: string;
  result: unknown;
}): Promise<void> {
  const record: IdempotencyRecord = {
    id: params.clientToken,
    companyId: params.companyId,
    toolName: params.toolName,
    argsHash: params.argsHash,
    resultJson: JSON.stringify(params.result ?? null),
    createdAt: new Date().toISOString(),
    ttl: IDEMPOTENCY_TTL_SECONDS,
  };
  try {
    await containers.idempotency().items.upsert(record);
  } catch (err) {
    console.error('Failed to persist idempotency record:', {
      clientToken: params.clientToken,
      toolName: params.toolName,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Error thrown when the same clientToken is replayed with different args.
 * Surfaces as a 409 Conflict to the caller.
 */
export class IdempotencyConflictError extends Error {
  public readonly statusCode = 409;
  constructor(
    public readonly toolName: string,
    public readonly clientToken: string,
  ) {
    super(
      `Idempotency conflict: clientToken '${clientToken}' was previously used for tool '${toolName}' with different arguments.`,
    );
    this.name = 'IdempotencyConflictError';
  }
}
