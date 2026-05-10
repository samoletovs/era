// PEPPOL Access Point abstraction
// =============================================================
//
// Pluggable provider that hands a built UBL XML document off to a
// PEPPOL Access Point. Real providers (Storecove, Tickstar, Pagero, ...)
// implement this interface and live in their own files; in this commit
// we ship two safe defaults:
//
//   • NoOpAccessPoint — never sends. Marks the outbox row as "pending"
//     and fails the call so callers learn they have not configured a
//     provider. Useful as a strict default in production until vendor
//     selection happens.
//
//   • MockAccessPoint — always succeeds. Stores the supplied UBL in an
//     in-memory ring buffer (last N documents) and synthesises a
//     deterministic message id. Used by tests and local dev.
//
// Real provider implementations should:
//   1. Validate transport credentials early (fail fast on missing API key).
//   2. POST the UBL with appropriate headers / encoding.
//   3. Map provider errors onto AccessPointError with a stable code
//      (`AUTH`, `RATE_LIMITED`, `INVALID_DOCUMENT`, `NETWORK`, `UNKNOWN`)
//      so the dispatcher can decide whether to retry.

export interface AccessPointSendInput {
  /** UBL XML document to dispatch — already validated by the builder. */
  ubl: string;
  /** Sender (supplier) endpoint identifier. */
  fromEndpoint: { schemeID: string; value: string };
  /** Recipient (customer) endpoint identifier. */
  toEndpoint: { schemeID: string; value: string };
  /** Internal correlation id — surfaced in provider logs / webhook callbacks. */
  correlationId: string;
}

export interface AccessPointSendResult {
  /** Provider-issued message identifier — opaque to era. */
  providerMessageId: string;
  /** Provider name (e.g. "mock", "storecove"). */
  provider: string;
  /** When the provider accepted the document (ISO timestamp). */
  acceptedAt: string;
}

export type AccessPointErrorCode =
  | 'AUTH'
  | 'RATE_LIMITED'
  | 'INVALID_DOCUMENT'
  | 'NETWORK'
  | 'NOT_CONFIGURED'
  | 'UNKNOWN';

export class AccessPointError extends Error {
  public readonly code: AccessPointErrorCode;
  public readonly retriable: boolean;
  constructor(code: AccessPointErrorCode, message: string, retriable: boolean) {
    super(message);
    this.code = code;
    this.retriable = retriable;
    this.name = 'AccessPointError';
  }
}

export interface PeppolAccessPoint {
  /** Stable name used in outbox rows (e.g. "noop", "mock", "storecove"). */
  readonly name: string;
  send(input: AccessPointSendInput): Promise<AccessPointSendResult>;
}

// ─── NoOpAccessPoint ────────────────────────────────────────

export class NoOpAccessPoint implements PeppolAccessPoint {
  public readonly name = 'noop';
  async send(_input: AccessPointSendInput): Promise<AccessPointSendResult> {
    void _input;
    throw new AccessPointError(
      'NOT_CONFIGURED',
      'No PEPPOL Access Point provider configured. Pick a vendor (Storecove, Tickstar, …) and wire its client into the dispatcher.',
      false,
    );
  }
}

// ─── MockAccessPoint ────────────────────────────────────────

export interface MockSendRecord extends AccessPointSendInput, AccessPointSendResult {}

/** In-memory test double — never makes a network call. */
export class MockAccessPoint implements PeppolAccessPoint {
  public readonly name = 'mock';
  private readonly buffer: MockSendRecord[] = [];
  private readonly maxRecords: number;
  private counter = 0;

  constructor(options: { maxRecords?: number } = {}) {
    this.maxRecords = options.maxRecords ?? 100;
  }

  async send(input: AccessPointSendInput): Promise<AccessPointSendResult> {
    this.counter += 1;
    const result: AccessPointSendResult = {
      providerMessageId: `mock-${input.correlationId}-${this.counter}`,
      provider: this.name,
      acceptedAt: new Date().toISOString(),
    };
    this.buffer.push({ ...input, ...result });
    if (this.buffer.length > this.maxRecords) this.buffer.shift();
    return result;
  }

  /** Inspect the in-memory buffer (used by tests). */
  recordsForCorrelation(correlationId: string): MockSendRecord[] {
    return this.buffer.filter((r) => r.correlationId === correlationId);
  }

  drain(): MockSendRecord[] {
    const copy = [...this.buffer];
    this.buffer.length = 0;
    return copy;
  }
}
