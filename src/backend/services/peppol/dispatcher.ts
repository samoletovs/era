// PEPPOL dispatch orchestrator
// =============================================================
//
// Resolves the supplier (Company) and customer (Contact) for an invoice,
// builds the UBL XML, persists an outbox entry, calls the configured
// Access Point, and finalises the outbox status.
//
// The dispatcher is intentionally split from `cosmos.ts` so the
// reconciliation / mapping logic is unit-testable without spinning up a
// Cosmos emulator. A ResolverDeps object is injected; the production
// caller supplies real Cosmos-backed resolvers, while unit tests
// supply in-memory functions.

import { v4 as uuid } from 'uuid';

import type {
  Company,
  Contact,
  Invoice,
  PeppolOutboxEntry,
  PeppolOutboxStatus,
} from '@shared/types';

import { AccessPointError, type PeppolAccessPoint } from './access-point.js';
import {
  buildPeppolInvoiceXml,
  PeppolBuildError,
  type PeppolBuildOptions,
  type PeppolParty,
} from './ubl-builder.js';

// ─── Latvian endpoint scheme defaults ────────────────────────

const LV_REG_SCHEME = '0218'; // ISO 6523: LV registration number
const LV_VAT_SCHEME = '9925'; // ISO 6523: LV VAT registration

/**
 * Derive a PEPPOL endpoint identifier from a Latvian SIA company /
 * contact. Prefers reg number under scheme 0218 (the canonical Latvian
 * PEPPOL routing key); falls back to VAT under 9925.
 */
export function deriveLvEndpoint(party: {
  registrationNumber?: string;
  vatNumber?: string;
}): { schemeID: string; value: string } | null {
  if (party.registrationNumber) {
    return { schemeID: LV_REG_SCHEME, value: party.registrationNumber };
  }
  if (party.vatNumber) {
    return { schemeID: LV_VAT_SCHEME, value: party.vatNumber };
  }
  return null;
}

// ─── Mapping helpers ─────────────────────────────────────────

export function companyToPeppolParty(company: Company): PeppolParty {
  const endpoint = deriveLvEndpoint(company);
  if (!endpoint) {
    throw new PeppolBuildError(
      'MISSING_ENDPOINT',
      `Company ${company.name} has no registrationNumber or vatNumber — cannot derive PEPPOL endpoint`,
    );
  }
  const bank = company.bankAccounts?.find((b) => b.isDefault) ?? company.bankAccounts?.[0];
  void bank;
  return {
    endpoint,
    identification: { schemeID: endpoint.schemeID, value: endpoint.value },
    name: company.shortName || company.name,
    postalAddress: {
      streetName: company.legalAddress.line1,
      additionalStreet: company.legalAddress.line2,
      cityName: company.legalAddress.city,
      postalZone: company.legalAddress.postalCode,
      countryCode: company.legalAddress.country,
    },
    taxScheme: company.vatNumber ? { vatNumber: company.vatNumber } : undefined,
    legalEntity: {
      registrationName: company.name,
      companyID: { schemeID: LV_REG_SCHEME, value: company.registrationNumber },
    },
  };
}

export function contactToPeppolParty(contact: Contact): PeppolParty {
  const endpoint = deriveLvEndpoint(contact);
  if (!endpoint) {
    throw new PeppolBuildError(
      'MISSING_ENDPOINT',
      `Contact ${contact.name} has no registrationNumber or vatNumber — cannot derive PEPPOL endpoint`,
    );
  }
  return {
    endpoint,
    identification: { schemeID: endpoint.schemeID, value: endpoint.value },
    name: contact.shortName || contact.name,
    postalAddress: {
      streetName: contact.address.line1,
      additionalStreet: contact.address.line2,
      cityName: contact.address.city,
      postalZone: contact.address.postalCode,
      countryCode: contact.address.country,
    },
    taxScheme: contact.vatNumber ? { vatNumber: contact.vatNumber } : undefined,
    legalEntity: {
      registrationName: contact.name,
      companyID: contact.registrationNumber
        ? { schemeID: LV_REG_SCHEME, value: contact.registrationNumber }
        : undefined,
    },
    contact:
      contact.email || contact.phone ? { email: contact.email, phone: contact.phone } : undefined,
  };
}

// ─── Dispatch flow ───────────────────────────────────────────

export interface DispatchInput {
  invoice: Invoice;
  company: Company;
  customer: Contact;
}

export interface DispatchResult {
  outbox: PeppolOutboxEntry;
  ubl: string;
}

export interface DispatchContext {
  /** Provider used to actually transmit the document. */
  accessPoint: PeppolAccessPoint;
  /** Persist the outbox row — typed as a function so tests can inject a no-op. */
  persistOutbox: (entry: PeppolOutboxEntry) => Promise<void>;
  /** Wall-clock factory — overridable for deterministic tests. */
  now?: () => Date;
  /** UUID factory — overridable. */
  newId?: () => string;
}

function buildOptions(input: DispatchInput): PeppolBuildOptions {
  const supplier = companyToPeppolParty(input.company);
  const customer = contactToPeppolParty(input.customer);
  const bank =
    input.company.bankAccounts?.find((b) => b.isDefault) ?? input.company.bankAccounts?.[0];
  return {
    invoice: input.invoice,
    supplier,
    customer,
    paymentMeans: bank
      ? {
          account: { iban: bank.iban, name: bank.name, bic: bank.swift },
          paymentID: input.invoice.invoiceNumber,
        }
      : undefined,
  };
}

/**
 * High-level "send invoice via PEPPOL" entry point. Builds UBL,
 * persists an outbox row, calls the configured Access Point, and
 * updates the row with the result. Idempotency is the caller's
 * responsibility (use `clientToken` on the agent-tool call).
 */
export async function dispatchInvoice(
  input: DispatchInput,
  ctx: DispatchContext,
): Promise<DispatchResult> {
  const now = (ctx.now ?? (() => new Date()))();
  const newId = ctx.newId ?? uuid;
  const opts = buildOptions(input);
  const ubl = buildPeppolInvoiceXml(opts);

  const baseEntry: PeppolOutboxEntry = {
    id: newId(),
    companyId: input.company.id,
    docType: 'peppol-outbox',
    invoiceId: input.invoice.id,
    invoiceNumber: input.invoice.invoiceNumber,
    direction: 'outbound',
    status: 'pending',
    ubl,
    supplierEndpoint: opts.supplier.endpoint,
    customerEndpoint: opts.customer.endpoint,
    provider: ctx.accessPoint.name,
    attempts: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy: input.invoice.createdBy ?? 'system',
    isActive: true,
  };

  await ctx.persistOutbox(baseEntry);

  // Best-effort send. The outbox row is the source of truth — even on
  // failure we leave a permanent audit trail.
  let nextStatus: PeppolOutboxStatus = 'sending';
  let providerMessageId: string | undefined;
  let lastError: { code: string; message: string } | undefined;
  let sentAt: string | undefined;
  try {
    const result = await ctx.accessPoint.send({
      ubl,
      fromEndpoint: opts.supplier.endpoint,
      toEndpoint: opts.customer.endpoint,
      correlationId: baseEntry.id,
    });
    nextStatus = 'sent';
    providerMessageId = result.providerMessageId;
    sentAt = result.acceptedAt;
  } catch (err) {
    if (err instanceof AccessPointError) {
      lastError = { code: err.code, message: err.message };
    } else if (err instanceof Error) {
      lastError = { code: 'UNKNOWN', message: err.message };
    } else {
      lastError = { code: 'UNKNOWN', message: String(err) };
    }
    nextStatus = 'failed';
  }

  const finalEntry: PeppolOutboxEntry = {
    ...baseEntry,
    status: nextStatus,
    attempts: 1,
    lastAttemptAt: now.toISOString(),
    providerMessageId,
    lastError,
    sentAt,
    updatedAt: new Date().toISOString(),
  };
  await ctx.persistOutbox(finalEntry);

  return { outbox: finalEntry, ubl };
}
