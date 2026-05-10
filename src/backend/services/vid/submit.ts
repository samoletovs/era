// VID PVN deklarācija — XML builder, transport client abstraction,
// and a retry state machine.
//
// Scope of this autonomous slice:
//   • Convert a `VatDeclaration` (already produced by reporting.ts) into
//     a deterministic XML payload shaped after the public structure of
//     the EDS PVN deklarācija. Real EDS schemas evolve and require a
//     credentialed download; this XML is therefore generator-internal
//     and meant to be plug-replaced once the live XSD is available.
//   • Provide a `VidClient` interface with `NoOpVidClient` and
//     `MockVidClient` implementations so business logic + UI can be
//     wired without any vendor configuration.
//   • Expose a `submitVidDeclaration` orchestrator that records the
//     submission and a `retrySubmission` helper that applies
//     exponential backoff — the same shape the real EDS integration
//     will need.

import { v4 as uuid } from 'uuid';

import type {
  VatReturnLine,
  VidDocumentKind,
  VidSubmission,
  VidSubmissionAttempt,
  VidSubmissionStatus,
} from '@shared/types';
import type { VatDeclaration } from '../reporting.js';

// ─── XML builder ─────────────────────────────────────────────

export function vatDeclarationToVidXml(declaration: VatDeclaration): string {
  const e = escapeXml;
  const m = (n: number) => n.toFixed(2);

  const lineEls = declaration.lines
    .map(
      (l: VatReturnLine) =>
        `    <Line type="${e(l.type)}" rate="${m(l.vatRate)}">\n` +
        `      <TaxableAmount>${m(l.taxableAmount)}</TaxableAmount>\n` +
        `      <VatAmount>${m(l.vatAmount)}</VatAmount>\n` +
        `    </Line>`,
    )
    .join('\n');

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<PvnDeklaracija version="1.0" xmlns="urn:lv:vid:eds:pvn:1.0">`,
    `  <Header>`,
    `    <CompanyName>${e(declaration.companyName)}</CompanyName>`,
    `    <RegistrationNumber>${e(declaration.registrationNumber)}</RegistrationNumber>`,
    `    <VatNumber>${e(declaration.vatNumber)}</VatNumber>`,
    `    <Period>${e(declaration.period)}</Period>`,
    `    <Year>${declaration.year}</Year>`,
    `    <Month>${declaration.month}</Month>`,
    `  </Header>`,
    `  <Totals>`,
    `    <TaxableStandard rate="21">${m(declaration.taxableStandard)}</TaxableStandard>`,
    `    <TaxableReduced rate="12">${m(declaration.taxableReduced)}</TaxableReduced>`,
    `    <TaxableSuperReduced rate="5">${m(declaration.taxableSuperReduced)}</TaxableSuperReduced>`,
    `    <OutputVatStandard rate="21">${m(declaration.outputVatStandard)}</OutputVatStandard>`,
    `    <OutputVatReduced rate="12">${m(declaration.outputVatReduced)}</OutputVatReduced>`,
    `    <OutputVatSuperReduced rate="5">${m(declaration.outputVatSuperReduced)}</OutputVatSuperReduced>`,
    `    <TotalOutputVat>${m(declaration.totalOutputVat)}</TotalOutputVat>`,
    `    <TotalInputVat>${m(declaration.totalInputVat)}</TotalInputVat>`,
    `    <VatPayable>${m(declaration.vatPayable)}</VatPayable>`,
    `  </Totals>`,
    `  <Lines>`,
    lineEls || `    <!-- no lines -->`,
    `  </Lines>`,
    `</PvnDeklaracija>`,
  ].join('\n');
}

export function escapeXml(s: string | undefined | null): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Client abstraction ─────────────────────────────────────

export type VidClientErrorCode = 'AUTH' | 'INVALID' | 'NETWORK' | 'NOT_CONFIGURED' | 'UNKNOWN';

export class VidClientError extends Error {
  public readonly code: VidClientErrorCode;
  /** Whether retry has any chance of succeeding. */
  public readonly retriable: boolean;
  public readonly responseCode?: string;
  public readonly validationErrors?: Array<{ field?: string; code: string; message: string }>;
  constructor(
    code: VidClientErrorCode,
    message: string,
    retriable = false,
    validationErrors?: Array<{ field?: string; code: string; message: string }>,
    responseCode?: string,
  ) {
    super(message);
    this.code = code;
    this.retriable = retriable;
    this.validationErrors = validationErrors;
    this.responseCode = responseCode;
    this.name = 'VidClientError';
  }
}

export interface VidSubmitInput {
  payload: string;
  contentType: 'application/xml' | 'application/json';
  kind: VidDocumentKind;
  period: string;
  correlationId: string;
}

export interface VidSubmitResult {
  receiptId: string;
  acceptedAt: string;
  responseCode?: string;
}

export interface VidClient {
  readonly name: string;
  submit(input: VidSubmitInput): Promise<VidSubmitResult>;
}

export class NoOpVidClient implements VidClient {
  public readonly name = 'noop';
  async submit(_input: VidSubmitInput): Promise<VidSubmitResult> {
    void _input;
    throw new VidClientError(
      'NOT_CONFIGURED',
      'No VID client is configured (set VID_PROVIDER=mock for local development)',
      false,
    );
  }
}

export interface MockVidOptions {
  /** When true, every call rejects with INVALID — used in tests. */
  isRejectAll?: boolean;
  /** When true, every call fails with NETWORK (transient) — used in tests. */
  isFailNetwork?: boolean;
}

export class MockVidClient implements VidClient {
  public readonly name = 'mock';
  private counter = 0;
  private readonly options: MockVidOptions;
  public readonly history: VidSubmitInput[] = [];

  constructor(options: MockVidOptions = {}) {
    this.options = options;
  }

  async submit(input: VidSubmitInput): Promise<VidSubmitResult> {
    this.history.push(input);
    if (this.options.isRejectAll) {
      throw new VidClientError(
        'INVALID',
        'Mock validation failure',
        false,
        [{ code: 'MOCK_REJECT', message: 'mock validation: payload missing required field' }],
        'VR-001',
      );
    }
    if (this.options.isFailNetwork) {
      throw new VidClientError('NETWORK', 'Mock network failure', true);
    }
    this.counter += 1;
    return {
      receiptId: `mock-vid-${input.correlationId}-${this.counter}`,
      acceptedAt: new Date().toISOString(),
      responseCode: 'OK',
    };
  }
}

// ─── Retry state machine ────────────────────────────────────

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_BASE_DELAY_SECONDS = 60;

export interface RetryPolicy {
  /** Hard cap on attempt count before status flips to terminal `failed`. */
  maxAttempts?: number;
  /** Base delay; effective wait = base * 2^(attempts-1). */
  baseDelaySeconds?: number;
}

/** Compute next retry timestamp using exponential backoff. */
export function computeNextAttemptAt(
  attempts: number,
  now: Date,
  policy: RetryPolicy = {},
): string {
  const base = policy.baseDelaySeconds ?? DEFAULT_BASE_DELAY_SECONDS;
  const wait = base * Math.pow(2, Math.max(0, attempts - 1));
  return new Date(now.getTime() + wait * 1000).toISOString();
}

export interface SubmitContext {
  client: VidClient;
  persistSubmission: (s: VidSubmission) => Promise<void>;
  now?: () => Date;
  newId?: () => string;
  policy?: RetryPolicy;
}

export interface SubmitArgs {
  companyId: string;
  kind: VidDocumentKind;
  period: string;
  sourcePeriod: { year: number; month?: number };
  payload: string;
  contentType: 'application/xml' | 'application/json';
  createdBy: string;
}

/** First-time submission. Persists draft → calls client → updates with attempt. */
export async function submitVidDeclaration(
  args: SubmitArgs,
  ctx: SubmitContext,
): Promise<VidSubmission> {
  const now = (ctx.now ?? (() => new Date()))();
  const newId = ctx.newId ?? uuid;
  const id = newId();
  const policy = ctx.policy ?? {};
  const maxAttempts = policy.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const draft: VidSubmission = {
    id,
    companyId: args.companyId,
    docType: 'vid-submission',
    kind: args.kind,
    period: args.period,
    sourcePeriod: args.sourcePeriod,
    payload: { contentType: args.contentType, body: args.payload },
    provider: ctx.client.name,
    status: 'queued',
    attempts: [],
    maxAttempts,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy: args.createdBy,
    isActive: true,
  };
  await ctx.persistSubmission(draft);

  return executeAttempt(draft, ctx);
}

/**
 * Execute one submit attempt and record the outcome. Returns the
 * updated entity. Used by both the initial submit and retry paths.
 */
async function executeAttempt(current: VidSubmission, ctx: SubmitContext): Promise<VidSubmission> {
  const policy = ctx.policy ?? {};
  const maxAttempts = current.maxAttempts ?? policy.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const now = (ctx.now ?? (() => new Date()))();
  const attemptNumber = current.attempts.length + 1;

  let nextStatus: VidSubmissionStatus = 'submitting';
  let receiptId: string | undefined;
  let acknowledgedAt: string | undefined;
  let nextAttemptAt: string | undefined;
  let attempt: VidSubmissionAttempt;

  try {
    const result = await ctx.client.submit({
      payload: current.payload.body,
      contentType: current.payload.contentType,
      kind: current.kind,
      period: current.period,
      correlationId: current.id,
    });
    nextStatus = 'accepted';
    receiptId = result.receiptId;
    acknowledgedAt = result.acceptedAt;
    attempt = {
      attemptedAt: now.toISOString(),
      outcome: 'accepted',
      responseCode: result.responseCode,
      responseMessage: 'Accepted',
    };
  } catch (err) {
    if (err instanceof VidClientError) {
      if (err.retriable) {
        nextStatus = 'failed';
        if (attemptNumber < maxAttempts) {
          nextAttemptAt = computeNextAttemptAt(attemptNumber, now, policy);
        }
        attempt = {
          attemptedAt: now.toISOString(),
          outcome: 'failed',
          responseCode: err.responseCode ?? err.code,
          responseMessage: err.message,
          validationErrors: err.validationErrors,
        };
      } else {
        // Permanent rejection or config error.
        nextStatus = 'rejected';
        attempt = {
          attemptedAt: now.toISOString(),
          outcome: 'rejected',
          responseCode: err.responseCode ?? err.code,
          responseMessage: err.message,
          validationErrors: err.validationErrors,
        };
      }
    } else if (err instanceof Error) {
      nextStatus = 'failed';
      if (attemptNumber < maxAttempts) {
        nextAttemptAt = computeNextAttemptAt(attemptNumber, now, policy);
      }
      attempt = {
        attemptedAt: now.toISOString(),
        outcome: 'failed',
        responseCode: 'UNKNOWN',
        responseMessage: err.message,
      };
    } else {
      nextStatus = 'failed';
      attempt = {
        attemptedAt: now.toISOString(),
        outcome: 'failed',
        responseCode: 'UNKNOWN',
        responseMessage: String(err),
      };
    }
  }

  const updated: VidSubmission = {
    ...current,
    status: nextStatus,
    attempts: [...current.attempts, attempt],
    receiptId: receiptId ?? current.receiptId,
    acknowledgedAt: acknowledgedAt ?? current.acknowledgedAt,
    nextAttemptAt,
    updatedAt: now.toISOString(),
  };
  await ctx.persistSubmission(updated);
  return updated;
}

/**
 * Retry a previously-failed submission. Caller is responsible for
 * checking `nextAttemptAt`; this function will retry regardless.
 */
export async function retrySubmission(
  current: VidSubmission,
  ctx: SubmitContext,
): Promise<VidSubmission> {
  if (current.status === 'accepted') {
    throw new Error('Submission already accepted');
  }
  if (current.status === 'rejected') {
    throw new Error('Submission was permanently rejected; cannot retry');
  }
  if (current.attempts.length >= (current.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)) {
    throw new Error('Submission has reached maximum attempts');
  }
  return executeAttempt(current, ctx);
}
