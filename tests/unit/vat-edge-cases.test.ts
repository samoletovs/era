// Unit tests for VAT edge-case posting rules and VIES validation status.
// Pure-logic tests — no Cosmos, no network. Verifies:
//   • pickRuleType maps every (invoice.type, vatTreatment) pair to the
//     correct PostingRule documentType.
//   • Each new LV rule (intra-EU, export, OSS, reverse-charge-EU,
//     reverse-charge-domestic) produces balanced journal lines with the
//     expected tax codes.
//   • viesValidationStatus distinguishes valid / invalid / format-invalid
//     / service-unavailable from a ViesResult.

import { describe, expect, it } from 'vitest';

import { pickRuleType } from '../../src/backend/services/invoice';
import {
  type ViesResult,
  viesValidationStatus,
} from '../../src/backend/services/company-lookup';
import { evaluateInvoiceRule } from '../../src/backend/services/posting-rules';
import { LV_POSTING_RULES } from '../../src/shared/rules/lv';
import type { Invoice, PostingRule } from '../../src/shared/types/entities';

function findRule(documentType: PostingRule['documentType']): PostingRule {
  const r = LV_POSTING_RULES.find((x) => x.documentType === documentType);
  if (!r) throw new Error(`Missing LV rule for ${documentType}`);
  return r;
}

function makeInvoice(overrides: Partial<Invoice>): Invoice {
  const now = new Date().toISOString();
  return {
    id: 'inv-1',
    companyId: 'co-1',
    docType: 'invoice',
    invoiceNumber: 'INV-0001',
    type: 'sales',
    contactId: 'c-1',
    contactName: 'Test',
    date: '2026-05-10',
    dueDate: '2026-06-09',
    lines: [
      {
        description: 'Service',
        quantity: 1,
        unitPrice: 1000,
        vatRate: 21,
        vatAmount: 210,
        lineTotal: 1210,
        accountCode: '6110',
      },
    ],
    subtotal: 1000,
    vatAmount: 210,
    total: 1210,
    amountPaid: 0,
    status: 'draft',
    currency: 'EUR',
    documentNumber: 'INV-0001',
    documentDate: '2026-05-10',
    paymentJournalEntryIds: [],
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'u-1',
    ...overrides,
  };
}

describe('pickRuleType — VAT-treatment routing', () => {
  it('defaults to standard sales rule when vatTreatment is omitted', () => {
    const inv = makeInvoice({ type: 'sales' });
    expect(pickRuleType(inv)).toBe('sales-invoice');
  });

  it('routes intra-EU sales to the zero-rated rule', () => {
    expect(pickRuleType(makeInvoice({ type: 'sales', vatTreatment: 'intra-eu-supply' }))).toBe(
      'sales-invoice-intra-eu',
    );
  });

  it('routes export sales to the zero-rated export rule', () => {
    expect(pickRuleType(makeInvoice({ type: 'sales', vatTreatment: 'export-non-eu' }))).toBe(
      'sales-invoice-export-non-eu',
    );
  });

  it('routes OSS sales to the OSS rule', () => {
    expect(pickRuleType(makeInvoice({ type: 'sales', vatTreatment: 'oss' }))).toBe(
      'sales-invoice-oss',
    );
  });

  it('falls back to standard rule on a domestic-RC sales invoice (no VAT line)', () => {
    expect(
      pickRuleType(makeInvoice({ type: 'sales', vatTreatment: 'reverse-charge-domestic' })),
    ).toBe('sales-invoice');
  });

  it('routes EU-acquisition purchases to the reverse-charge-EU rule', () => {
    expect(
      pickRuleType(makeInvoice({ type: 'purchase', vatTreatment: 'reverse-charge-eu' })),
    ).toBe('purchase-invoice-reverse-charge-eu');
  });

  it('routes domestic-RC purchases to the reverse-charge-domestic rule', () => {
    expect(
      pickRuleType(makeInvoice({ type: 'purchase', vatTreatment: 'reverse-charge-domestic' })),
    ).toBe('purchase-invoice-reverse-charge-domestic');
  });

  it('falls back to standard purchase rule on irrelevant treatments (oss/intra-eu/export)', () => {
    for (const t of ['oss', 'intra-eu-supply', 'export-non-eu', 'standard'] as const) {
      expect(pickRuleType(makeInvoice({ type: 'purchase', vatTreatment: t }))).toBe(
        'purchase-invoice',
      );
    }
  });
});

describe('LV rules — intra-EU supply (zero-rated)', () => {
  it('produces balanced lines with no VAT credit and intra-EU tax code', () => {
    const rule = findRule('sales-invoice-intra-eu');
    const inv = makeInvoice({
      type: 'sales',
      vatAmount: 0,
      total: 1000,
      lines: [
        {
          description: 'Service',
          quantity: 1,
          unitPrice: 1000,
          vatRate: 0,
          vatAmount: 0,
          lineTotal: 1000,
          accountCode: '6110',
        },
      ],
    });
    const lines = evaluateInvoiceRule(rule, inv);
    expect(lines).not.toBeNull();
    const totalDr = lines!.reduce((s, l) => s + l.debit, 0);
    const totalCr = lines!.reduce((s, l) => s + l.credit, 0);
    expect(totalDr).toBeCloseTo(1000, 2);
    expect(totalCr).toBeCloseTo(1000, 2);
    expect(lines!.some((l) => l.taxCode === 'LV-intra-eu-0')).toBe(true);
    // No 4230 (VAT payable) line — zero-rated
    expect(lines!.some((l) => l.accountCode === '4230')).toBe(false);
  });
});

describe('LV rules — export non-EU (zero-rated)', () => {
  it('credits revenue at net only and tags export tax code', () => {
    const rule = findRule('sales-invoice-export-non-eu');
    const inv = makeInvoice({
      type: 'sales',
      vatAmount: 0,
      total: 500,
      lines: [
        {
          description: 'Goods',
          quantity: 1,
          unitPrice: 500,
          vatRate: 0,
          vatAmount: 0,
          lineTotal: 500,
          accountCode: '6110',
        },
      ],
    });
    const lines = evaluateInvoiceRule(rule, inv);
    expect(lines).not.toBeNull();
    expect(lines!.some((l) => l.taxCode === 'LV-export-0')).toBe(true);
    expect(lines!.some((l) => l.accountCode === '4230')).toBe(false);
  });
});

describe('LV rules — OSS B2C distance sale', () => {
  it('credits a separate OSS-VAT-payable account (4231), not the standard 4230', () => {
    const rule = findRule('sales-invoice-oss');
    const inv = makeInvoice({
      type: 'sales',
      subtotal: 100,
      vatAmount: 25, // pretend SE VAT 25%
      total: 125,
      lines: [
        {
          description: 'Digital goods',
          quantity: 1,
          unitPrice: 100,
          vatRate: 25,
          vatAmount: 25,
          lineTotal: 125,
          accountCode: '6110',
        },
      ],
    });
    const lines = evaluateInvoiceRule(rule, inv);
    expect(lines).not.toBeNull();
    expect(lines!.some((l) => l.accountCode === '4231' && l.credit === 25)).toBe(true);
    expect(lines!.some((l) => l.accountCode === '4230')).toBe(false);
  });
});

describe('LV rules — intra-EU acquisition (purchase reverse-charge)', () => {
  it('self-assesses output AND input VAT (DR 2310 + CR 4230) on a vendor invoice with no VAT', () => {
    const rule = findRule('purchase-invoice-reverse-charge-eu');
    const inv = makeInvoice({
      type: 'purchase',
      subtotal: 1000,
      vatAmount: 210, // calculated by buyer
      total: 1000, // vendor invoice has no VAT — total = net
      lines: [
        {
          description: 'EU service',
          quantity: 1,
          unitPrice: 1000,
          vatRate: 21,
          vatAmount: 210,
          lineTotal: 1000,
          accountCode: '6110',
        },
      ],
    });
    const lines = evaluateInvoiceRule(rule, inv);
    expect(lines).not.toBeNull();

    const totalDr = lines!.reduce((s, l) => s + l.debit, 0);
    const totalCr = lines!.reduce((s, l) => s + l.credit, 0);
    expect(totalDr).toBeCloseTo(totalCr, 2);

    // Both VAT entries present — input recoverable + output self-assessed
    expect(lines!.some((l) => l.accountCode === '2310' && l.debit === 210)).toBe(true);
    expect(lines!.some((l) => l.accountCode === '4230' && l.credit === 210)).toBe(true);
    // AP credited at NET, not gross
    expect(lines!.some((l) => l.accountCode === '4220' && l.credit === 1000)).toBe(true);
  });
});

describe('LV rules — domestic reverse charge (LV construction etc.)', () => {
  it('uses dedicated domestic-RC tax codes', () => {
    const rule = findRule('purchase-invoice-reverse-charge-domestic');
    const inv = makeInvoice({
      type: 'purchase',
      subtotal: 1000,
      vatAmount: 210,
      total: 1000,
      lines: [
        {
          description: 'Construction',
          quantity: 1,
          unitPrice: 1000,
          vatRate: 21,
          vatAmount: 210,
          lineTotal: 1000,
          accountCode: '6110',
        },
      ],
    });
    const lines = evaluateInvoiceRule(rule, inv);
    expect(lines).not.toBeNull();
    expect(lines!.some((l) => l.taxCode === 'LV-input-rc-dom')).toBe(true);
    expect(lines!.some((l) => l.taxCode === 'LV-output-rc-dom')).toBe(true);
  });
});

describe('viesValidationStatus — discriminator', () => {
  const baseResult = (overrides: Partial<ViesResult>): ViesResult => ({
    valid: false,
    countryCode: '',
    vatNumber: '',
    name: '',
    address: '',
    requestDate: '2026-05-10',
    source: '',
    ...overrides,
  });

  it('returns "valid" when valid=true', () => {
    expect(viesValidationStatus(baseResult({ valid: true, countryCode: 'LV' }))).toBe('valid');
  });

  it('returns "format-invalid" for "Invalid EU VAT number format"', () => {
    expect(
      viesValidationStatus(
        baseResult({ source: 'Invalid EU VAT number format. Expected: ...' }),
      ),
    ).toBe('format-invalid');
  });

  it('returns "format-invalid" when the country code did not parse', () => {
    expect(viesValidationStatus(baseResult({ countryCode: '', source: 'EU VIES' }))).toBe(
      'format-invalid',
    );
  });

  it('returns "service-unavailable" for member-state-down', () => {
    expect(
      viesValidationStatus(
        baseResult({
          countryCode: 'DE',
          source: 'The DE tax authority is temporarily unavailable. Try again later.',
        }),
      ),
    ).toBe('service-unavailable');
  });

  it('returns "service-unavailable" for HTTP 5xx', () => {
    expect(
      viesValidationStatus(
        baseResult({ countryCode: 'LV', source: 'VIES service error (HTTP 503)' }),
      ),
    ).toBe('service-unavailable');
  });

  it('returns "service-unavailable" for generic outage', () => {
    expect(
      viesValidationStatus(
        baseResult({ countryCode: 'LV', source: 'VIES service unavailable — try again later' }),
      ),
    ).toBe('service-unavailable');
  });

  it('returns "invalid" for a definitive negative answer', () => {
    expect(
      viesValidationStatus(
        baseResult({ countryCode: 'LV', source: 'EU VIES (ec.europa.eu)' }),
      ),
    ).toBe('invalid');
  });
});
