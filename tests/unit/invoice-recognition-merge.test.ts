// Unit tests for invoice-recognition pure helpers (Phase 3 polish).
// The model-calling code (extractFromImage, recognizeInvoice,
// recognizeInvoiceMultiPage) requires a live Azure OpenAI client and is
// covered by integration tests. This file pins the deterministic
// behaviour of the merge / confidence helpers.

import { describe, it, expect } from 'vitest';

import {
  lowConfidenceFields,
  mergeRecognitions,
  worstFieldConfidence,
  type FieldConfidence,
  type RecognizedInvoice,
} from '../../src/backend/services/invoice-recognition';

function makePage(overrides: Partial<RecognizedInvoice> = {}): RecognizedInvoice {
  return {
    vendorName: 'ACME SIA',
    vendorRegistrationNumber: '40003290084',
    invoiceNumber: 'INV-1',
    invoiceDate: '2026-05-01',
    currency: 'EUR',
    lines: [],
    subtotal: 0,
    vatAmount: 0,
    total: 0,
    confidence: 'high',
    fieldConfidence: { vendorName: 'high', invoiceNumber: 'high' },
    ...overrides,
  };
}

describe('worstFieldConfidence', () => {
  it('returns "medium" when fc is undefined', () => {
    expect(worstFieldConfidence(undefined)).toBe('medium');
  });

  it('returns "high" when all populated fields are high', () => {
    expect(
      worstFieldConfidence({ vendorName: 'high', invoiceNumber: 'high' }),
    ).toBe('high');
  });

  it('returns "low" when any field is low', () => {
    expect(
      worstFieldConfidence({
        vendorName: 'high',
        bankAccount: 'low',
        invoiceNumber: 'medium',
      }),
    ).toBe('low');
  });

  it('ignores undefined entries', () => {
    const fc: FieldConfidence = {
      vendorName: 'high',
      invoiceNumber: undefined,
      total: 'medium',
    };
    expect(worstFieldConfidence(fc)).toBe('medium');
  });
});

describe('lowConfidenceFields', () => {
  it('returns names of fields below the threshold', () => {
    const fc: FieldConfidence = {
      vendorName: 'high',
      vendorRegistrationNumber: 'low',
      invoiceNumber: 'medium',
      total: 'low',
    };
    expect(lowConfidenceFields(fc)).toEqual(['vendorRegistrationNumber', 'total']);
  });

  it('respects a custom threshold', () => {
    const fc: FieldConfidence = {
      vendorName: 'medium',
      invoiceNumber: 'high',
      total: 'low',
    };
    expect(lowConfidenceFields(fc, 'medium')).toEqual(['vendorName', 'total']);
  });

  it('returns empty when fc is undefined', () => {
    expect(lowConfidenceFields(undefined)).toEqual([]);
  });
});

describe('mergeRecognitions', () => {
  it('passes through a single page unchanged (with pageCount=1)', () => {
    const p = makePage({ vendorName: 'Solo SIA' });
    const merged = mergeRecognitions([p]);
    expect(merged.vendorName).toBe('Solo SIA');
    expect(merged.pageCount).toBe(1);
  });

  it('throws on empty pages', () => {
    expect(() => mergeRecognitions([])).toThrow();
  });

  it('picks header field from the page with highest reported confidence', () => {
    const p1 = makePage({
      vendorName: 'Wrong SIA',
      fieldConfidence: { vendorName: 'low' },
    });
    const p2 = makePage({
      vendorName: 'Right SIA',
      fieldConfidence: { vendorName: 'high' },
    });
    const merged = mergeRecognitions([p1, p2]);
    expect(merged.vendorName).toBe('Right SIA');
  });

  it('concatenates line items in page order', () => {
    const p1 = makePage({
      lines: [
        { description: 'A', quantity: 1, unitPrice: 10, vatRate: 21, lineTotal: 12.1 },
      ],
    });
    const p2 = makePage({
      lines: [
        { description: 'B', quantity: 2, unitPrice: 20, vatRate: 21, lineTotal: 48.4 },
        { description: 'C', quantity: 1, unitPrice: 5, vatRate: 21, lineTotal: 6.05 },
      ],
    });
    const merged = mergeRecognitions([p1, p2]);
    expect(merged.lines.map((l) => l.description)).toEqual(['A', 'B', 'C']);
  });

  it('takes totals from the last page with non-zero total (summary block)', () => {
    const p1 = makePage({ subtotal: 100, vatAmount: 21, total: 121 });
    const p2 = makePage({ subtotal: 0, vatAmount: 0, total: 0 });
    const p3 = makePage({ subtotal: 1000, vatAmount: 210, total: 1210 });
    const merged = mergeRecognitions([p1, p2, p3]);
    expect(merged.subtotal).toBe(1000);
    expect(merged.total).toBe(1210);
  });

  it('falls back to the last page if no page has positive total', () => {
    const p1 = makePage({ subtotal: 0, vatAmount: 0, total: 0 });
    const p2 = makePage({ subtotal: 0, vatAmount: 0, total: 0 });
    const merged = mergeRecognitions([p1, p2]);
    expect(merged.total).toBe(0);
  });

  it('keeps the best confidence per field across pages', () => {
    const p1 = makePage({
      fieldConfidence: { vendorName: 'low', invoiceNumber: 'high', total: 'medium' },
    });
    const p2 = makePage({
      fieldConfidence: { vendorName: 'high', invoiceNumber: 'medium', bankAccount: 'low' },
    });
    const merged = mergeRecognitions([p1, p2]);
    expect(merged.fieldConfidence?.vendorName).toBe('high');
    expect(merged.fieldConfidence?.invoiceNumber).toBe('high');
    expect(merged.fieldConfidence?.total).toBe('medium');
    expect(merged.fieldConfidence?.bankAccount).toBe('low');
  });

  it('derives top-level confidence from the merged fieldConfidence', () => {
    const p1 = makePage({
      fieldConfidence: { vendorName: 'high', total: 'low' },
    });
    const p2 = makePage({
      fieldConfidence: { vendorName: 'high', total: 'high' },
    });
    const merged = mergeRecognitions([p1, p2]);
    // best across pages on `total` is high, so worst across all fields is high
    expect(merged.confidence).toBe('high');
  });

  it('records the page count', () => {
    const merged = mergeRecognitions([makePage(), makePage(), makePage()]);
    expect(merged.pageCount).toBe(3);
  });
});
