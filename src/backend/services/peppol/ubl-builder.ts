// PEPPOL UBL 2.1 BIS Billing 3.0 invoice builder
// =============================================================
//
// Generates a UBL 2.1 invoice document conforming to the OpenPeppol
// BIS Billing 3.0 specification — the format mandated for B2G invoicing
// in Latvia since 1 January 2026.
//
// Spec references:
//   • UBL 2.1: http://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.html
//   • BIS Billing 3.0: https://docs.peppol.eu/poacc/billing/3.0/
//   • EN 16931 (CEN semantic model): https://standards.cencenelec.eu/dyn/www/f?p=205:110:0::::FSP_PROJECT,FSP_ORG_ID:65820,1218399&cs=15CB7CD86691CCDB6203D5A1E13A99B17
//
// Latvian endpoint scheme IDs:
//   • 0218 — Latvian commercial register number (Uzņēmumu reģistrs)
//   • 9925 — Latvian VAT registration
//
// This module is **pure**: it depends only on TypeScript types. No
// Cosmos / Express / OpenTelemetry. The dispatcher resolves entities
// and feeds them in; the unit tests exercise this module directly with
// in-memory fixtures.

import type { Invoice, InvoiceLine } from '@shared/types';

const UBL_VERSION = '2.1';
const CUSTOMIZATION_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0';
const PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

// UN/ECE Recommendation 20 unit codes — "C62" is the BIS-recommended
// fallback meaning "one" (used for services and dimensionless line items).
export const DEFAULT_UNIT_CODE = 'C62';

// UN/CEFACT 4461 payment means codes
export const PAYMENT_MEANS_CREDIT_TRANSFER = '30'; // SEPA / wire transfer
export const PAYMENT_MEANS_DIRECT_DEBIT = '49';

// ─── Party model ────────────────────────────────────────────

/** A PEPPOL participant (supplier or customer). */
export interface PeppolParty {
  /** PEPPOL endpoint identifier — addressing key on the network. */
  endpoint: PeppolIdentifier;
  /** Optional secondary identification for matching. */
  identification?: PeppolIdentifier;
  /** Trading / display name. */
  name: string;
  /** Postal address — required by EN 16931. */
  postalAddress: PeppolPostalAddress;
  /** VAT registration if the party is VAT-registered. */
  taxScheme?: { vatNumber: string };
  /** Legal entity registration — required by EN 16931 for both parties. */
  legalEntity: {
    registrationName: string;
    companyID?: PeppolIdentifier;
  };
  /** Optional contact data shown on the rendered invoice. */
  contact?: { name?: string; email?: string; phone?: string };
}

export interface PeppolIdentifier {
  /** ISO 6523 / EAS scheme identifier (e.g. "0218" = LV reg). */
  schemeID: string;
  value: string;
}

export interface PeppolPostalAddress {
  streetName: string;
  additionalStreet?: string;
  cityName: string;
  postalZone: string;
  countrySubentity?: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "LV"). */
  countryCode: string;
}

// ─── Builder options ────────────────────────────────────────

export interface PeppolPaymentMeans {
  /** UN/CEFACT 4461 payment means code. Defaults to credit transfer (30). */
  code?: string;
  /** Optional human-readable payment ID (becomes RemittanceInformation). */
  paymentID?: string;
  /** Beneficiary account — required for credit transfer. */
  account: { iban: string; name?: string; bic?: string };
}

export type PeppolInvoiceSubset = Pick<
  Invoice,
  | 'invoiceNumber'
  | 'type'
  | 'date'
  | 'dueDate'
  | 'lines'
  | 'subtotal'
  | 'vatAmount'
  | 'total'
  | 'currency'
> & { note?: string };

export interface PeppolBuildOptions {
  invoice: PeppolInvoiceSubset;
  supplier: PeppolParty;
  customer: PeppolParty;
  paymentMeans?: PeppolPaymentMeans;
  /** Optional extra notes to surface in the UBL Note element. */
  notes?: string[];
}

export class PeppolBuildError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PeppolBuildError';
  }
}

// ─── XML helpers ────────────────────────────────────────────

/** Escape a string for XML text or attribute content. */
export function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Format a number as a UBL amount string with exactly 2 decimal places. */
function fmtAmount(n: number): string {
  if (!Number.isFinite(n)) {
    throw new PeppolBuildError('INVALID_AMOUNT', `Non-finite amount: ${n}`);
  }
  return n.toFixed(2);
}

/** Format a quantity — UBL allows up to 4 decimals; we trim trailing zeros for readability while keeping at least 1 decimal. */
function fmtQuantity(n: number): string {
  if (!Number.isFinite(n)) {
    throw new PeppolBuildError('INVALID_QUANTITY', `Non-finite quantity: ${n}`);
  }
  // Round to 4 decimals to satisfy BIS-CL-DT-08.
  return Number(n.toFixed(4)).toString();
}

// ─── Tax category mapping ────────────────────────────────────

/**
 * Map a VAT rate to the BIS Billing 3.0 tax category code.
 *
 * - "S" — Standard rate (any positive rate). BIS Billing 3.0 allows multiple
 *   "S" categories at different percents within one document; the consumer
 *   distinguishes by the Percent value.
 * - "Z" — Zero-rated supplies (rate exactly 0).
 * - "AE" — Reverse-charge (caller can pre-tag a line by marking vatRate as
 *   negative; we don't auto-detect — extension hook for future).
 *
 * Latvian "exempt" supplies (rate not applicable) should use category "E";
 * callers can pass a negative rate to opt-in. For now we emit "S" / "Z" and
 * leave "E" / "AE" as a follow-up when era models exempt sales.
 */
export function vatCategoryCode(rate: number): 'S' | 'Z' {
  if (rate === 0) return 'Z';
  return 'S';
}

// ─── Validation ─────────────────────────────────────────────

function validate(opts: PeppolBuildOptions): void {
  const { invoice, supplier, customer } = opts;
  if (invoice.type !== 'sales') {
    throw new PeppolBuildError(
      'UNSUPPORTED_INVOICE_TYPE',
      `Only sales invoices can be sent via PEPPOL outbound; got: ${invoice.type}`,
    );
  }
  if (!invoice.invoiceNumber) {
    throw new PeppolBuildError('MISSING_FIELD', 'invoice.invoiceNumber is required');
  }
  if (!invoice.date) {
    throw new PeppolBuildError('MISSING_FIELD', 'invoice.date is required');
  }
  if (!invoice.dueDate) {
    throw new PeppolBuildError('MISSING_FIELD', 'invoice.dueDate is required');
  }
  if (!invoice.lines || invoice.lines.length === 0) {
    throw new PeppolBuildError('MISSING_FIELD', 'invoice.lines must not be empty');
  }
  if (!invoice.currency || invoice.currency.length !== 3) {
    throw new PeppolBuildError(
      'INVALID_CURRENCY',
      'invoice.currency must be a 3-letter ISO 4217 code',
    );
  }
  for (const party of [supplier, customer] as const) {
    if (!party.endpoint?.value || !party.endpoint?.schemeID) {
      throw new PeppolBuildError(
        'MISSING_FIELD',
        `${party === supplier ? 'supplier' : 'customer'} endpoint is required`,
      );
    }
    if (!party.name) {
      throw new PeppolBuildError(
        'MISSING_FIELD',
        `${party === supplier ? 'supplier' : 'customer'} name is required`,
      );
    }
    if (!party.legalEntity?.registrationName) {
      throw new PeppolBuildError(
        'MISSING_FIELD',
        `${party === supplier ? 'supplier' : 'customer'} legalEntity.registrationName is required`,
      );
    }
    const addr = party.postalAddress;
    if (!addr || !addr.streetName || !addr.cityName || !addr.postalZone || !addr.countryCode) {
      throw new PeppolBuildError(
        'MISSING_FIELD',
        `${party === supplier ? 'supplier' : 'customer'} postalAddress is incomplete`,
      );
    }
    if (addr.countryCode.length !== 2) {
      throw new PeppolBuildError(
        'INVALID_COUNTRY_CODE',
        `Country code must be ISO 3166-1 alpha-2; got: ${addr.countryCode}`,
      );
    }
  }
}

// ─── Tax breakdown ──────────────────────────────────────────

interface TaxSubtotal {
  taxableAmount: number;
  taxAmount: number;
  category: 'S' | 'Z';
  percent: number;
}

/** Aggregate invoice lines into TaxSubtotal entries — one per (category, percent) pair. */
export function buildTaxSubtotals(lines: InvoiceLine[]): TaxSubtotal[] {
  const map = new Map<string, TaxSubtotal>();
  for (const line of lines) {
    const taxable = round2(line.quantity * line.unitPrice);
    const tax = round2(line.vatAmount);
    const category = vatCategoryCode(line.vatRate);
    const key = `${category}-${line.vatRate}`;
    const existing = map.get(key);
    if (existing) {
      existing.taxableAmount = round2(existing.taxableAmount + taxable);
      existing.taxAmount = round2(existing.taxAmount + tax);
    } else {
      map.set(key, {
        taxableAmount: taxable,
        taxAmount: tax,
        category,
        percent: line.vatRate,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.percent - a.percent);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── XML rendering ──────────────────────────────────────────

function renderIdentifier(id: PeppolIdentifier, tag: string): string {
  return `<${tag} schemeID="${escapeXml(id.schemeID)}">${escapeXml(id.value)}</${tag}>`;
}

function renderPostalAddress(addr: PeppolPostalAddress): string {
  const parts: string[] = [];
  parts.push(`<cbc:StreetName>${escapeXml(addr.streetName)}</cbc:StreetName>`);
  if (addr.additionalStreet) {
    parts.push(
      `<cbc:AdditionalStreetName>${escapeXml(addr.additionalStreet)}</cbc:AdditionalStreetName>`,
    );
  }
  parts.push(`<cbc:CityName>${escapeXml(addr.cityName)}</cbc:CityName>`);
  parts.push(`<cbc:PostalZone>${escapeXml(addr.postalZone)}</cbc:PostalZone>`);
  if (addr.countrySubentity) {
    parts.push(`<cbc:CountrySubentity>${escapeXml(addr.countrySubentity)}</cbc:CountrySubentity>`);
  }
  parts.push(
    `<cac:Country><cbc:IdentificationCode>${escapeXml(addr.countryCode)}</cbc:IdentificationCode></cac:Country>`,
  );
  return `<cac:PostalAddress>${parts.join('')}</cac:PostalAddress>`;
}

function renderParty(party: PeppolParty): string {
  const sections: string[] = [];
  sections.push(renderIdentifier(party.endpoint, 'cbc:EndpointID'));
  if (party.identification) {
    sections.push(
      `<cac:PartyIdentification>${renderIdentifier(party.identification, 'cbc:ID')}</cac:PartyIdentification>`,
    );
  }
  sections.push(`<cac:PartyName><cbc:Name>${escapeXml(party.name)}</cbc:Name></cac:PartyName>`);
  sections.push(renderPostalAddress(party.postalAddress));
  if (party.taxScheme?.vatNumber) {
    sections.push(
      `<cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(
        party.taxScheme.vatNumber,
      )}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`,
    );
  }
  // PartyLegalEntity is mandatory in EN 16931.
  const legalIdParts: string[] = [];
  legalIdParts.push(
    `<cbc:RegistrationName>${escapeXml(party.legalEntity.registrationName)}</cbc:RegistrationName>`,
  );
  if (party.legalEntity.companyID) {
    legalIdParts.push(renderIdentifier(party.legalEntity.companyID, 'cbc:CompanyID'));
  }
  sections.push(`<cac:PartyLegalEntity>${legalIdParts.join('')}</cac:PartyLegalEntity>`);
  if (party.contact && (party.contact.name || party.contact.email || party.contact.phone)) {
    const c = party.contact;
    const contactParts: string[] = [];
    if (c.name) contactParts.push(`<cbc:Name>${escapeXml(c.name)}</cbc:Name>`);
    if (c.phone) contactParts.push(`<cbc:Telephone>${escapeXml(c.phone)}</cbc:Telephone>`);
    if (c.email)
      contactParts.push(`<cbc:ElectronicMail>${escapeXml(c.email)}</cbc:ElectronicMail>`);
    sections.push(`<cac:Contact>${contactParts.join('')}</cac:Contact>`);
  }
  return `<cac:Party>${sections.join('')}</cac:Party>`;
}

function renderPaymentMeans(
  currency: string,
  paymentMeans: PeppolPaymentMeans,
  dueDate: string,
): string {
  const code = paymentMeans.code ?? PAYMENT_MEANS_CREDIT_TRANSFER;
  const accountSections: string[] = [];
  accountSections.push(`<cbc:ID>${escapeXml(paymentMeans.account.iban)}</cbc:ID>`);
  if (paymentMeans.account.name) {
    accountSections.push(`<cbc:Name>${escapeXml(paymentMeans.account.name)}</cbc:Name>`);
  }
  if (paymentMeans.account.bic) {
    accountSections.push(
      `<cac:FinancialInstitutionBranch><cbc:ID>${escapeXml(paymentMeans.account.bic)}</cbc:ID></cac:FinancialInstitutionBranch>`,
    );
  }
  // Suppress unused param lint warnings — currency/dueDate retained for API symmetry / future extension.
  void currency;
  void dueDate;
  const remittance = paymentMeans.paymentID
    ? `<cbc:PaymentID>${escapeXml(paymentMeans.paymentID)}</cbc:PaymentID>`
    : '';
  return `<cac:PaymentMeans><cbc:PaymentMeansCode>${escapeXml(code)}</cbc:PaymentMeansCode>${remittance}<cac:PayeeFinancialAccount>${accountSections.join('')}</cac:PayeeFinancialAccount></cac:PaymentMeans>`;
}

function renderTaxTotal(currency: string, subtotals: TaxSubtotal[]): string {
  const totalTax = round2(subtotals.reduce((s, st) => s + st.taxAmount, 0));
  const subtotalXml = subtotals
    .map(
      (st) =>
        `<cac:TaxSubtotal>` +
        `<cbc:TaxableAmount currencyID="${escapeXml(currency)}">${fmtAmount(st.taxableAmount)}</cbc:TaxableAmount>` +
        `<cbc:TaxAmount currencyID="${escapeXml(currency)}">${fmtAmount(st.taxAmount)}</cbc:TaxAmount>` +
        `<cac:TaxCategory>` +
        `<cbc:ID>${st.category}</cbc:ID>` +
        `<cbc:Percent>${fmtAmount(st.percent)}</cbc:Percent>` +
        `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>` +
        `</cac:TaxCategory>` +
        `</cac:TaxSubtotal>`,
    )
    .join('');
  return (
    `<cac:TaxTotal>` +
    `<cbc:TaxAmount currencyID="${escapeXml(currency)}">${fmtAmount(totalTax)}</cbc:TaxAmount>` +
    subtotalXml +
    `</cac:TaxTotal>`
  );
}

function renderInvoiceLine(line: InvoiceLine, index: number, currency: string): string {
  const lineExtension = round2(line.quantity * line.unitPrice);
  const unit = DEFAULT_UNIT_CODE;
  const category = vatCategoryCode(line.vatRate);
  return (
    `<cac:InvoiceLine>` +
    `<cbc:ID>${index + 1}</cbc:ID>` +
    `<cbc:InvoicedQuantity unitCode="${unit}">${fmtQuantity(line.quantity)}</cbc:InvoicedQuantity>` +
    `<cbc:LineExtensionAmount currencyID="${escapeXml(currency)}">${fmtAmount(lineExtension)}</cbc:LineExtensionAmount>` +
    `<cac:Item>` +
    `<cbc:Name>${escapeXml(line.description || 'Item')}</cbc:Name>` +
    `<cac:ClassifiedTaxCategory>` +
    `<cbc:ID>${category}</cbc:ID>` +
    `<cbc:Percent>${fmtAmount(line.vatRate)}</cbc:Percent>` +
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>` +
    `</cac:ClassifiedTaxCategory>` +
    `</cac:Item>` +
    `<cac:Price>` +
    `<cbc:PriceAmount currencyID="${escapeXml(currency)}">${fmtAmount(line.unitPrice)}</cbc:PriceAmount>` +
    `</cac:Price>` +
    `</cac:InvoiceLine>`
  );
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Build a UBL 2.1 BIS Billing 3.0 invoice XML string from the supplied
 * options. Throws PeppolBuildError if required fields are missing or the
 * invoice type is unsupported.
 *
 * The output is a self-contained XML document including the XML
 * declaration. UTF-8 is the assumed transport encoding.
 */
export function buildPeppolInvoiceXml(opts: PeppolBuildOptions): string {
  validate(opts);

  const { invoice, supplier, customer, paymentMeans, notes } = opts;
  const currency = invoice.currency;
  const subtotals = buildTaxSubtotals(invoice.lines);

  // BIS Billing 3.0 monetary totals.
  const lineExtensionAmount = round2(subtotals.reduce((s, st) => s + st.taxableAmount, 0));
  const taxExclusiveAmount = lineExtensionAmount;
  const taxAmount = round2(subtotals.reduce((s, st) => s + st.taxAmount, 0));
  const taxInclusiveAmount = round2(taxExclusiveAmount + taxAmount);
  const payableAmount = taxInclusiveAmount;

  const noteFromInvoice = invoice.note ? [invoice.note] : [];
  const allNotes = [...noteFromInvoice, ...(notes ?? [])];
  const noteXml = allNotes.map((n) => `<cbc:Note>${escapeXml(n)}</cbc:Note>`).join('');

  const paymentMeansXml = paymentMeans
    ? renderPaymentMeans(currency, paymentMeans, invoice.dueDate)
    : '';

  const lineXml = invoice.lines.map((l, i) => renderInvoiceLine(l, i, currency)).join('');

  // Header — namespaces required by BIS Billing 3.0.
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ` +
    `xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" ` +
    `xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">` +
    `<cbc:CustomizationID>${CUSTOMIZATION_ID}</cbc:CustomizationID>` +
    `<cbc:ProfileID>${PROFILE_ID}</cbc:ProfileID>` +
    `<cbc:ID>${escapeXml(invoice.invoiceNumber)}</cbc:ID>` +
    `<cbc:IssueDate>${escapeXml(invoice.date)}</cbc:IssueDate>` +
    `<cbc:DueDate>${escapeXml(invoice.dueDate)}</cbc:DueDate>` +
    `<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>` +
    noteXml +
    `<cbc:DocumentCurrencyCode>${escapeXml(currency)}</cbc:DocumentCurrencyCode>` +
    `<cac:AccountingSupplierParty>${renderParty(supplier)}</cac:AccountingSupplierParty>` +
    `<cac:AccountingCustomerParty>${renderParty(customer)}</cac:AccountingCustomerParty>` +
    paymentMeansXml +
    renderTaxTotal(currency, subtotals) +
    `<cac:LegalMonetaryTotal>` +
    `<cbc:LineExtensionAmount currencyID="${escapeXml(currency)}">${fmtAmount(lineExtensionAmount)}</cbc:LineExtensionAmount>` +
    `<cbc:TaxExclusiveAmount currencyID="${escapeXml(currency)}">${fmtAmount(taxExclusiveAmount)}</cbc:TaxExclusiveAmount>` +
    `<cbc:TaxInclusiveAmount currencyID="${escapeXml(currency)}">${fmtAmount(taxInclusiveAmount)}</cbc:TaxInclusiveAmount>` +
    `<cbc:PayableAmount currencyID="${escapeXml(currency)}">${fmtAmount(payableAmount)}</cbc:PayableAmount>` +
    `</cac:LegalMonetaryTotal>` +
    lineXml +
    `</Invoice>`;

  return xml;
}

export const __peppolUblInternals = { UBL_VERSION, CUSTOMIZATION_ID, PROFILE_ID };
