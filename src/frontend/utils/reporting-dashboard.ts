import type { PostingRule } from '@shared/types';

export type ReportView = 'pl' | 'bs' | 'tb' | 'ar-aging' | 'ap-aging' | 'vat' | 'annual' | 'budget';

export interface ReportingDashboardCard {
  view: ReportView;
  title: string;
  category: string;
  description: string;
  statusLabel: string;
  isLocalized: boolean;
  legalBasis: string[];
}

export interface ReportingDashboardModel {
  country: string;
  activeRuleCount: number;
  localizedReportCount: number;
  legalBasis: string[];
  profileSummary: string;
  cards: ReportingDashboardCard[];
}

const VAT_RULE_TYPES = new Set<PostingRule['documentType']>([
  'sales-invoice',
  'sales-invoice-intra-eu',
  'sales-invoice-export-non-eu',
  'sales-invoice-oss',
  'purchase-invoice',
  'purchase-invoice-reverse-charge-eu',
  'purchase-invoice-reverse-charge-domestic',
]);

function uniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  );
}

function getLocalizedStatutoryViews(country: string): Set<ReportView> {
  if (country === 'LV') return new Set<ReportView>(['vat', 'annual']);
  return new Set<ReportView>();
}

function getRelevantRules(view: ReportView, rules: PostingRule[]): PostingRule[] {
  if (view === 'vat') {
    return rules.filter((rule) => VAT_RULE_TYPES.has(rule.documentType));
  }
  if (view === 'annual') {
    return rules;
  }
  return [];
}

export function buildReportingDashboard(
  countryCode: string | undefined,
  rules: PostingRule[],
): ReportingDashboardModel {
  const country = (countryCode || 'LV').trim().toUpperCase();
  const localizedViews = getLocalizedStatutoryViews(country);
  const legalBasis = uniqueStrings(rules.flatMap((rule) => rule.legalBasis ?? []));

  const cards: ReportingDashboardCard[] = [
    {
      view: 'pl',
      title: 'Profit & loss',
      category: 'Core financial',
      description: 'Summarises posted revenue and expense movements for the selected period.',
      statusLabel: 'Posted journal entries',
      isLocalized: false,
      legalBasis: [],
    },
    {
      view: 'bs',
      title: 'Balance sheet',
      category: 'Core financial',
      description: 'Shows current asset, liability, and equity balances from the live ledger.',
      statusLabel: 'Live ledger balances',
      isLocalized: false,
      legalBasis: [],
    },
    {
      view: 'tb',
      title: 'Trial balance',
      category: 'Audit',
      description: 'Lists opening, movement, and closing balances by account code.',
      statusLabel: 'Opening + period movements',
      isLocalized: false,
      legalBasis: [],
    },
    {
      view: 'ar-aging',
      title: 'AR aging',
      category: 'Subledger',
      description: 'Buckets open receivables by due date to spot collection risk.',
      statusLabel: 'Open customer invoices',
      isLocalized: false,
      legalBasis: [],
    },
    {
      view: 'ap-aging',
      title: 'AP aging',
      category: 'Subledger',
      description: 'Buckets open payables by due date to plan outgoing payments.',
      statusLabel: 'Open supplier invoices',
      isLocalized: false,
      legalBasis: [],
    },
    {
      view: 'vat',
      title: localizedViews.has('vat') ? 'VAT declaration' : 'VAT report',
      category: localizedViews.has('vat') ? 'Localized filing' : 'Tax',
      description: localizedViews.has('vat')
        ? `Prepares the ${country} monthly VAT filing using country-specific invoice posting rules.`
        : 'Summarises output and input VAT using posted invoices for the selected month.',
      statusLabel: `${getRelevantRules('vat', rules).length} active VAT rule${getRelevantRules('vat', rules).length === 1 ? '' : 's'}`,
      isLocalized: localizedViews.has('vat'),
      legalBasis: uniqueStrings(
        getRelevantRules('vat', rules).flatMap((rule) => rule.legalBasis ?? []),
      ),
    },
    {
      view: 'annual',
      title: localizedViews.has('annual') ? 'Annual report' : 'Annual statements',
      category: localizedViews.has('annual') ? 'Localized filing' : 'Year-end',
      description: localizedViews.has('annual')
        ? `Builds the ${country} year-end statement layout using active posting rules and ledger balances.`
        : 'Provides a year-end statement view using the current default grouping layout.',
      statusLabel: `${getRelevantRules('annual', rules).length} active country rule${getRelevantRules('annual', rules).length === 1 ? '' : 's'}`,
      isLocalized: localizedViews.has('annual'),
      legalBasis: uniqueStrings(
        getRelevantRules('annual', rules).flatMap((rule) => rule.legalBasis ?? []),
      ),
    },
    {
      view: 'budget',
      title: 'Budget vs actual',
      category: 'Planning',
      description: 'Compares budget entries with actual account movements for the year.',
      statusLabel: 'Budget entries + actuals',
      isLocalized: false,
      legalBasis: [],
    },
  ];

  const localizedReportCount = cards.filter((card) => card.isLocalized).length;

  return {
    country,
    activeRuleCount: rules.length,
    localizedReportCount,
    legalBasis,
    profileSummary:
      localizedReportCount > 0
        ? `Localized statutory filings are available for ${country}. Core reports still use live ledger data and active posting rules.`
        : `Localized statutory filing layouts are not configured for ${country} yet. Core reports still use the company's posting rules and live ledger data.`,
    cards,
  };
}
