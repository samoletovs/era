// Unit tests for fixed-asset polish (Phase 3): declining-balance method,
// depreciation schedule projector, and register PDF formatter.
//
// Pure-function tests only. The Cosmos-touching functions (acquireAsset,
// disposeAsset, runDepreciation) are exercised by integration tests.

import { describe, expect, it } from 'vitest';

import {
  computeMonthlyDepreciation,
  getDepreciationSchedule,
  type FixedAsset,
} from '../../src/backend/services/fixed-assets';
import { formatAssetRegister } from '../../src/backend/services/fixed-asset-register-pdf';

function baseAsset(overrides: Partial<FixedAsset> = {}): FixedAsset {
  const now = new Date().toISOString();
  return {
    id: 'a-1',
    companyId: 'co-1',
    docType: 'fixed-asset',
    code: 'FA-0001',
    name: 'Server',
    assetAccountCode: '1240',
    depreciationAccountCode: '1249',
    expenseAccountCode: '6380',
    acquisitionDate: '2026-01-01',
    acquisitionCost: 12000,
    residualValue: 0,
    usefulLifeMonths: 60,
    depreciationMethod: 'straight-line',
    accumulatedDepreciation: 0,
    netBookValue: 12000,
    status: 'active',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'u-1',
    ...overrides,
  };
}

describe('computeMonthlyDepreciation — straight-line', () => {
  it('returns equal monthly amount across the asset life', () => {
    expect(computeMonthlyDepreciation(baseAsset())).toBeCloseTo(200, 2);
  });

  it('respects residualValue (depreciable base = cost - residual)', () => {
    expect(
      computeMonthlyDepreciation(baseAsset({ residualValue: 1200 })),
    ).toBeCloseTo(180, 2);
  });

  it('returns 0 when fully accumulated', () => {
    expect(
      computeMonthlyDepreciation(baseAsset({ accumulatedDepreciation: 12000 })),
    ).toBe(0);
  });

  it('caps the final month so accumulated never exceeds depreciable base', () => {
    // 59 months of 200 = 11800. Last month should be 200 (clean), but if we
    // started at 11900 accumulated, only 100 should be left.
    expect(
      computeMonthlyDepreciation(baseAsset({ accumulatedDepreciation: 11900 })),
    ).toBeCloseTo(100, 2);
  });
});

describe('computeMonthlyDepreciation — declining-balance', () => {
  it('uses NBV * rate / 12 each month', () => {
    const asset = baseAsset({
      depreciationMethod: 'declining-balance',
      decliningBalanceRate: 0.4,
      acquisitionCost: 10000,
      residualValue: 0,
    });
    // First month: 10000 * 0.4 / 12 = 333.33
    expect(computeMonthlyDepreciation(asset)).toBeCloseTo(333.33, 2);
  });

  it('decreases as accumulated grows (NBV shrinks)', () => {
    const asset = baseAsset({
      depreciationMethod: 'declining-balance',
      decliningBalanceRate: 0.4,
      acquisitionCost: 10000,
      residualValue: 0,
      accumulatedDepreciation: 5000,
    });
    // NBV = 5000, monthly = 5000 * 0.4 / 12 = 166.67
    expect(computeMonthlyDepreciation(asset)).toBeCloseTo(166.67, 2);
  });

  it('returns 0 when decliningBalanceRate is missing or zero', () => {
    expect(
      computeMonthlyDepreciation(
        baseAsset({ depreciationMethod: 'declining-balance' }),
      ),
    ).toBe(0);
    expect(
      computeMonthlyDepreciation(
        baseAsset({
          depreciationMethod: 'declining-balance',
          decliningBalanceRate: 0,
        }),
      ),
    ).toBe(0);
  });

  it('stops at residualValue', () => {
    const asset = baseAsset({
      depreciationMethod: 'declining-balance',
      decliningBalanceRate: 0.4,
      acquisitionCost: 10000,
      residualValue: 1000,
      accumulatedDepreciation: 9000, // already at residual
    });
    expect(computeMonthlyDepreciation(asset)).toBe(0);
  });
});

describe('getDepreciationSchedule', () => {
  it('produces 60 rows for a 5-year SL asset', () => {
    const rows = getDepreciationSchedule(baseAsset());
    expect(rows).toHaveLength(60);
    expect(rows[0].depreciation).toBeCloseTo(200, 2);
    expect(rows[59].accumulatedDepreciation).toBeCloseTo(12000, 2);
    expect(rows[59].netBookValue).toBeCloseTo(0, 2);
  });

  it('has monotonically increasing accumulatedDepreciation', () => {
    const rows = getDepreciationSchedule(baseAsset());
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].accumulatedDepreciation).toBeGreaterThanOrEqual(
        rows[i - 1].accumulatedDepreciation,
      );
    }
  });

  it('emits YYYY-MM periods starting from the month after acquisition', () => {
    const rows = getDepreciationSchedule(
      baseAsset({ acquisitionDate: '2026-03-15' }),
    );
    expect(rows[0].period).toBe('2026-04');
    expect(rows[8].period).toBe('2026-12');
    expect(rows[9].period).toBe('2027-01');
  });

  it('terminates declining-balance schedule when NBV reaches residual', () => {
    const rows = getDepreciationSchedule(
      baseAsset({
        depreciationMethod: 'declining-balance',
        decliningBalanceRate: 0.4,
        residualValue: 100,
      }),
    );
    // Each row's NBV >= residualValue and depreciation > 0.
    for (const r of rows) expect(r.netBookValue).toBeGreaterThanOrEqual(100 - 0.01);
    // Should terminate (not run to maxMonths). Declining-balance with rate
    // 0.4 from 12000 to residual 100 should converge.
    expect(rows.length).toBeLessThan(600);
    expect(rows[rows.length - 1].netBookValue).toBeLessThan(rows[0].netBookValue);
  });
});

describe('formatAssetRegister', () => {
  it('sorts rows by code ascending', () => {
    const formatted = formatAssetRegister(
      [
        baseAsset({ id: 'b', code: 'FA-0002', name: 'B' }),
        baseAsset({ id: 'a', code: 'FA-0001', name: 'A' }),
      ],
      { companyName: 'Test SIA', asOfDate: '2026-12-31' },
    );
    expect(formatted.rows.map((r) => r.code)).toEqual(['FA-0001', 'FA-0002']);
  });

  it('computes correct totals across all rows', () => {
    const formatted = formatAssetRegister(
      [
        baseAsset({
          code: 'FA-0001',
          acquisitionCost: 1000,
          accumulatedDepreciation: 250,
          netBookValue: 750,
        }),
        baseAsset({
          id: 'a-2',
          code: 'FA-0002',
          acquisitionCost: 5000,
          accumulatedDepreciation: 1000,
          netBookValue: 4000,
        }),
      ],
      { companyName: 'Test SIA', asOfDate: '2026-12-31' },
    );
    expect(formatted.totals.cost).toBeCloseTo(6000, 2);
    expect(formatted.totals.accumulated).toBeCloseTo(1250, 2);
    expect(formatted.totals.nbv).toBeCloseTo(4750, 2);
  });

  it('translates status labels in LV locale', () => {
    const formatted = formatAssetRegister(
      [baseAsset({ status: 'fully-depreciated' })],
      { companyName: 'Test SIA', asOfDate: '2026-12-31', locale: 'lv' },
    );
    expect(formatted.title).toBe('Pamatlīdzekļu reģistrs');
    expect(formatted.rows[0].status).toBe('Pilnīgi nolietots');
    expect(formatted.columns.cost).toBe('Iegādes vērtība');
  });

  it('appends disposalDate to disposed status', () => {
    const formatted = formatAssetRegister(
      [baseAsset({ status: 'disposed', disposalDate: '2026-08-15' })],
      { companyName: 'Test SIA', asOfDate: '2026-12-31' },
    );
    expect(formatted.rows[0].status).toBe('Disposed 2026-08-15');
  });

  it('renders method label correctly', () => {
    const formatted = formatAssetRegister(
      [
        baseAsset({
          depreciationMethod: 'declining-balance',
          decliningBalanceRate: 0.4,
        }),
      ],
      { companyName: 'Test SIA', asOfDate: '2026-12-31' },
    );
    expect(formatted.rows[0].method).toBe('Declining-balance');
  });

  it('handles an empty register without crashing', () => {
    const formatted = formatAssetRegister([], {
      companyName: 'Test SIA',
      asOfDate: '2026-12-31',
    });
    expect(formatted.rows).toHaveLength(0);
    expect(formatted.totals.cost).toBe(0);
    expect(formatted.footer).toBe('0 assets on register');
  });
});
