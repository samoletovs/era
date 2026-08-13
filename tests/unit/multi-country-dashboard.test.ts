import { describe, expect, it } from 'vitest';
import type { PostingRule } from '@shared/types';
import { buildMultiCountryDashboard } from '../../src/frontend/utils/multi-country-dashboard';

function createRule(
  country: string,
  documentType: PostingRule['documentType'],
  legalBasis: string[],
): PostingRule {
  return {
    id: `${country}-${documentType}-rule`,
    country,
    documentType,
    name: `${documentType} rule`,
    description: 'Test rule',
    version: 1,
    conditions: [],
    lines: [],
    effectiveFrom: '2026-01-01',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'tester',
    legalBasis,
  };
}

describe('buildMultiCountryDashboard', () => {
  it('groups companies by country and consolidates totals', () => {
    const dashboard = buildMultiCountryDashboard(
      [
        { id: 'c1', name: 'Latvia one', country: 'lv', currency: 'EUR' },
        { id: 'c2', name: 'Latvia two', shortName: 'LV2', country: 'LV', currency: 'EUR' },
        { id: 'c3', name: 'Estonia one', country: 'EE', currency: 'EUR' },
      ],
      {
        c1: { totalRevenue: 100.005, totalExpenses: 40, netProfit: 60, totalAssets: 500 },
        c2: { totalRevenue: 50, totalExpenses: 20, netProfit: 30, totalAssets: 250 },
        c3: { totalRevenue: 10, totalExpenses: 4, netProfit: 6, totalAssets: 90 },
      },
      {
        LV: [createRule('LV', 'sales-invoice', ['VAT Law §1'])],
        EE: [],
      },
    );

    expect(dashboard.countryCount).toBe(2);
    expect(dashboard.companyCount).toBe(3);
    expect(dashboard.countries.map((group) => group.country)).toEqual(['EE', 'LV']);
    expect(dashboard.totalRevenue).toBe(160.01);
    expect(dashboard.netProfit).toBe(96);
    expect(dashboard.totalAssets).toBe(840);

    const lv = dashboard.countries.find((group) => group.country === 'LV');
    expect(lv).toMatchObject({
      companyCount: 2,
      activeRuleCount: 1,
      isLocalized: true,
      statusLabel: '1 active LV posting rule',
      totalRevenue: 150.01,
    });
    expect(lv?.legalBasis).toEqual(['VAT Law §1']);
    expect(lv?.companies.map((company) => company.companyName)).toEqual(['Latvia one', 'LV2']);
  });

  it('flags countries without a localized filing layout', () => {
    const dashboard = buildMultiCountryDashboard(
      [{ id: 'c3', name: 'Estonia one', country: 'EE', currency: 'EUR' }],
      { c3: { totalRevenue: 10, totalExpenses: 4, netProfit: 6, totalAssets: 90 } },
      {},
    );

    const ee = dashboard.countries[0];
    expect(ee.isLocalized).toBe(false);
    expect(ee.statusLabel).toBe('No localized filing layout for EE yet');
    expect(ee.legalBasis).toEqual([]);
  });

  it('warns when consolidated companies report in different currencies', () => {
    const dashboard = buildMultiCountryDashboard(
      [
        { id: 'c1', name: 'Latvia one', country: 'LV', currency: 'EUR' },
        { id: 'c4', name: 'Sweden one', country: 'SE', currency: 'SEK' },
      ],
      {},
      {},
    );

    expect(dashboard.isMixedCurrency).toBe(true);
    expect(dashboard.currencies).toEqual(['EUR', 'SEK']);
    expect(dashboard.summary).toContain('unconverted sums of EUR, SEK');
    expect(dashboard.countries.every((group) => group.companies.every((c) => !c.hasData))).toBe(
      true,
    );
  });

  it('returns an empty consolidation when no companies are available', () => {
    const dashboard = buildMultiCountryDashboard([], {}, {});

    expect(dashboard.countryCount).toBe(0);
    expect(dashboard.companyCount).toBe(0);
    expect(dashboard.summary).toBe('No companies available to consolidate yet.');
  });
});
