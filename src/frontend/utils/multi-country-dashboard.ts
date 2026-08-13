import type { PostingRule } from '@shared/types';
import { buildReportingDashboard } from './reporting-dashboard';

export interface MultiCountryCompany {
  id: string;
  name: string;
  shortName?: string;
  country?: string;
  currency?: string;
}

export interface MultiCountryFinancials {
  totalRevenue?: number;
  totalExpenses?: number;
  netProfit?: number;
  totalAssets?: number;
}

export interface MultiCountryCompanyRow {
  companyId: string;
  companyName: string;
  country: string;
  currency: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalAssets: number;
  hasData: boolean;
}

export interface MultiCountryGroup {
  country: string;
  companyCount: number;
  currencies: string[];
  activeRuleCount: number;
  localizedReportCount: number;
  isLocalized: boolean;
  legalBasis: string[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalAssets: number;
  statusLabel: string;
  companies: MultiCountryCompanyRow[];
}

export interface MultiCountryDashboardModel {
  countryCount: number;
  companyCount: number;
  currencies: string[];
  isMixedCurrency: boolean;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalAssets: number;
  summary: string;
  countries: MultiCountryGroup[];
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeCountry(country: string | undefined): string {
  const normalized = (country || 'LV').trim().toUpperCase();
  return normalized.length > 0 ? normalized : 'LV';
}

function normalizeCurrency(currency: string | undefined): string {
  const normalized = (currency || 'EUR').trim().toUpperCase();
  return normalized.length > 0 ? normalized : 'EUR';
}

function toAmount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Builds the consolidated multi-country reporting model.
 *
 * Companies are grouped by their ISO country code, each group is enriched with
 * the country's active posting rules (rule count, localized filing support and
 * legal basis citations) so users can see which statutory layouts back the
 * numbers they're looking at.
 */
export function buildMultiCountryDashboard(
  companies: MultiCountryCompany[],
  financials: Record<string, MultiCountryFinancials | null | undefined>,
  rulesByCountry: Record<string, PostingRule[]>,
): MultiCountryDashboardModel {
  const groups = new Map<string, MultiCountryGroup>();

  for (const company of companies) {
    const country = normalizeCountry(company.country);
    const currency = normalizeCurrency(company.currency);
    const result = financials[company.id];

    let group = groups.get(country);
    if (!group) {
      const countryRules = rulesByCountry[country] ?? [];
      const profile = buildReportingDashboard(country, countryRules);
      group = {
        country,
        companyCount: 0,
        currencies: [],
        activeRuleCount: profile.activeRuleCount,
        localizedReportCount: profile.localizedReportCount,
        isLocalized: profile.localizedReportCount > 0,
        legalBasis: profile.legalBasis,
        totalRevenue: 0,
        totalExpenses: 0,
        netProfit: 0,
        totalAssets: 0,
        statusLabel: '',
        companies: [],
      };
      groups.set(country, group);
    }

    const row: MultiCountryCompanyRow = {
      companyId: company.id,
      companyName: company.shortName || company.name,
      country,
      currency,
      totalRevenue: roundCurrency(toAmount(result?.totalRevenue)),
      totalExpenses: roundCurrency(toAmount(result?.totalExpenses)),
      netProfit: roundCurrency(toAmount(result?.netProfit)),
      totalAssets: roundCurrency(toAmount(result?.totalAssets)),
      hasData: Boolean(result),
    };

    group.companies.push(row);
    group.companyCount += 1;
    if (!group.currencies.includes(currency)) group.currencies.push(currency);
    group.totalRevenue = roundCurrency(group.totalRevenue + row.totalRevenue);
    group.totalExpenses = roundCurrency(group.totalExpenses + row.totalExpenses);
    group.netProfit = roundCurrency(group.netProfit + row.netProfit);
    group.totalAssets = roundCurrency(group.totalAssets + row.totalAssets);
  }

  const countries = Array.from(groups.values()).sort((a, b) => a.country.localeCompare(b.country));

  for (const group of countries) {
    group.companies.sort((a, b) => a.companyName.localeCompare(b.companyName));
    group.statusLabel = group.isLocalized
      ? `${group.activeRuleCount} active ${group.country} posting rule${group.activeRuleCount === 1 ? '' : 's'}`
      : `No localized filing layout for ${group.country} yet`;
  }

  const currencies = Array.from(new Set(countries.flatMap((group) => group.currencies))).sort();

  const companyCount = countries.reduce((sum, group) => sum + group.companyCount, 0);
  const totalRevenue = roundCurrency(countries.reduce((sum, group) => sum + group.totalRevenue, 0));
  const totalExpenses = roundCurrency(
    countries.reduce((sum, group) => sum + group.totalExpenses, 0),
  );
  const netProfit = roundCurrency(countries.reduce((sum, group) => sum + group.netProfit, 0));
  const totalAssets = roundCurrency(countries.reduce((sum, group) => sum + group.totalAssets, 0));

  let summary: string;
  if (companyCount === 0) {
    summary = 'No companies available to consolidate yet.';
  } else if (currencies.length > 1) {
    summary = `Consolidating ${companyCount} compan${companyCount === 1 ? 'y' : 'ies'} across ${countries.length} countr${countries.length === 1 ? 'y' : 'ies'}. Totals are unconverted sums of ${currencies.join(', ')} — review each country separately before filing.`;
  } else {
    summary = `Consolidating ${companyCount} compan${companyCount === 1 ? 'y' : 'ies'} across ${countries.length} countr${countries.length === 1 ? 'y' : 'ies'} in ${currencies[0]}.`;
  }

  return {
    countryCount: countries.length,
    companyCount,
    currencies,
    isMixedCurrency: currencies.length > 1,
    totalRevenue,
    totalExpenses,
    netProfit,
    totalAssets,
    summary,
    countries,
  };
}
