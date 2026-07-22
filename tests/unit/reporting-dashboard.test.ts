import { describe, expect, it } from 'vitest';
import type { PostingRule } from '@shared/types';
import { buildReportingDashboard } from '../../src/frontend/utils/reporting-dashboard';

function createRule(
  documentType: PostingRule['documentType'],
  legalBasis: string[],
): PostingRule {
  return {
    id: `${documentType}-rule`,
    country: 'LV',
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

describe('buildReportingDashboard', () => {
  it('surfaces localized statutory cards for Latvia', () => {
    const dashboard = buildReportingDashboard('lv', [
      createRule('sales-invoice', ['VAT Law §1', 'VAT Law §1']),
      createRule('purchase-invoice', ['VAT Law §2']),
      createRule('manual-entry', ['Reg 775 §50']),
    ]);

    expect(dashboard.country).toBe('LV');
    expect(dashboard.activeRuleCount).toBe(3);
    expect(dashboard.localizedReportCount).toBe(2);
    expect(dashboard.legalBasis).toEqual(['VAT Law §1', 'VAT Law §2', 'Reg 775 §50']);

    const vatCard = dashboard.cards.find((card) => card.view === 'vat');
    const annualCard = dashboard.cards.find((card) => card.view === 'annual');

    expect(vatCard).toMatchObject({
      title: 'VAT declaration',
      category: 'Localized filing',
      isLocalized: true,
      statusLabel: '2 active VAT rules',
    });
    expect(vatCard?.legalBasis).toEqual(['VAT Law §1', 'VAT Law §2']);

    expect(annualCard).toMatchObject({
      title: 'Annual report',
      category: 'Localized filing',
      isLocalized: true,
      statusLabel: '3 active country rules',
    });
  });

  it('falls back to generic statutory summaries for other countries', () => {
    const dashboard = buildReportingDashboard('EE', []);

    expect(dashboard.localizedReportCount).toBe(0);
    expect(dashboard.profileSummary).toContain('not configured for EE yet');

    const vatCard = dashboard.cards.find((card) => card.view === 'vat');
    const annualCard = dashboard.cards.find((card) => card.view === 'annual');

    expect(vatCard).toMatchObject({
      title: 'VAT report',
      category: 'Tax',
      isLocalized: false,
      statusLabel: '0 active VAT rules',
    });
    expect(annualCard).toMatchObject({
      title: 'Annual statements',
      category: 'Year-end',
      isLocalized: false,
      statusLabel: '0 active country rules',
    });
  });
});
