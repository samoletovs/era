import React, { useEffect, useMemo, useState } from 'react';
import type { PostingRule } from '@shared/types';
import { api } from '../utils/api';
import { useApp } from '../utils/context';
import { formatMoney } from '../utils/format';
import {
  buildMultiCountryDashboard,
  type MultiCountryCompany,
  type MultiCountryFinancials,
} from '../utils/multi-country-dashboard';

interface MultiCountryOverviewProps {
  companies: MultiCountryCompany[];
  dateFrom: string;
  dateTo: string;
}

function readNumber(source: unknown, key: string): number {
  if (source && typeof source === 'object') {
    const value = (source as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
}

async function loadCompanyFinancials(
  companyId: string,
  dateFrom: string,
  dateTo: string,
): Promise<MultiCountryFinancials | null> {
  const [profitLoss, balanceSheet] = await Promise.allSettled([
    api.profitLoss(companyId, dateFrom, dateTo),
    api.balanceSheet(companyId, dateTo),
  ]);
  if (profitLoss.status === 'rejected' && balanceSheet.status === 'rejected') return null;
  const pl = profitLoss.status === 'fulfilled' ? profitLoss.value : null;
  const bs = balanceSheet.status === 'fulfilled' ? balanceSheet.value : null;
  return {
    totalRevenue: readNumber(pl, 'totalRevenue'),
    totalExpenses: readNumber(pl, 'totalExpenses'),
    netProfit: readNumber(pl, 'netProfit'),
    totalAssets: readNumber(bs, 'totalAssets'),
  };
}

/**
 * Consolidated reporting view across every company the user can access,
 * grouped by country and annotated with the country's active posting rules.
 */
export function MultiCountryOverview({ companies, dateFrom, dateTo }: MultiCountryOverviewProps) {
  const { numberFormat: fmt } = useApp();
  const [financials, setFinancials] = useState<Record<string, MultiCountryFinancials | null>>({});
  const [rulesByCountry, setRulesByCountry] = useState<Record<string, PostingRule[]>>({});
  const [loading, setLoading] = useState(false);

  const countries = useMemo(
    () =>
      Array.from(
        new Set(companies.map((company) => (company.country || 'LV').trim().toUpperCase())),
      ).sort(),
    [companies],
  );
  useEffect(() => {
    if (companies.length === 0) {
      setFinancials({});
      setRulesByCountry({});
      return;
    }
    let cancelled = false;
    setLoading(true);

    Promise.all([
      Promise.all(
        companies.map(async (company) => ({
          id: company.id,
          result: await loadCompanyFinancials(company.id, dateFrom, dateTo).catch(() => null),
        })),
      ),
      Promise.all(
        countries.map(async (country) => ({
          country,
          rules: await api
            .rules(country)
            .then((result) => (Array.isArray(result) ? (result as PostingRule[]) : []))
            .catch(() => [] as PostingRule[]),
        })),
      ),
    ])
      .then(([companyResults, countryRules]) => {
        if (cancelled) return;
        setFinancials(Object.fromEntries(companyResults.map((entry) => [entry.id, entry.result])));
        setRulesByCountry(
          Object.fromEntries(countryRules.map((entry) => [entry.country, entry.rules])),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companies, countries, dateFrom, dateTo]);

  const dashboard = useMemo(
    () => buildMultiCountryDashboard(companies, financials, rulesByCountry),
    [companies, financials, rulesByCountry],
  );

  if (companies.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">🌍</div>
        <h3>No companies to consolidate</h3>
        <p>Create at least one company to see the multi-country overview.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="metric-card">
        <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
          Multi-country overview — {dateFrom} to {dateTo}
        </h3>
        <div className="dashboard-grid" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="metric-card" style={{ padding: 16, marginBottom: 0 }}>
              <div
                style={{
                  height: 12,
                  width: '40%',
                  borderRadius: 999,
                  background: 'var(--bg-page)',
                  marginBottom: 12,
                }}
              />
              <div
                style={{
                  height: 24,
                  width: '65%',
                  borderRadius: 999,
                  background: 'var(--bg-page)',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 4, fontSize: 16, fontWeight: 600 }}>
        Multi-country overview — {dateFrom} to {dateTo}
      </h3>
      <div className="subtitle" style={{ marginBottom: 16 }}>
        {dashboard.summary}
      </div>

      <div className="dashboard-grid" style={{ marginBottom: 16 }}>
        <div className="metric-card" style={{ padding: 16, marginBottom: 0 }}>
          <div className="label">Countries</div>
          <div className="value">{dashboard.countryCount}</div>
        </div>
        <div className="metric-card" style={{ padding: 16, marginBottom: 0 }}>
          <div className="label">Companies</div>
          <div className="value">{dashboard.companyCount}</div>
        </div>
        <div className="metric-card" style={{ padding: 16, marginBottom: 0 }}>
          <div className="label">Consolidated revenue</div>
          <div className="value">{formatMoney(dashboard.totalRevenue, fmt)}</div>
        </div>
        <div className="metric-card" style={{ padding: 16, marginBottom: 0 }}>
          <div className="label">Consolidated net profit</div>
          <div className="value">{formatMoney(dashboard.netProfit, fmt)}</div>
        </div>
      </div>

      <table className="data-table report-table">
        <thead>
          <tr>
            <th>Country / company</th>
            <th className="num">Revenue</th>
            <th className="num">Expenses</th>
            <th className="num">Net profit</th>
            <th className="num">Assets</th>
          </tr>
        </thead>
        <tbody>
          {dashboard.countries.map((group) => (
            <React.Fragment key={group.country}>
              <tr className="section-label-row">
                <td colSpan={5} className="label" style={{ paddingTop: 16, paddingBottom: 4 }}>
                  {group.country} · {group.statusLabel}
                  {group.legalBasis[0] ? ` · ${group.legalBasis[0]}` : ''}
                </td>
              </tr>
              {group.companies.map((company) => (
                <tr key={company.companyId}>
                  <td>
                    {company.companyName}{' '}
                    <span style={{ color: 'var(--text-tertiary)' }}>{company.currency}</span>
                  </td>
                  <td className="num">{formatMoney(company.totalRevenue, fmt)}</td>
                  <td className="num">{formatMoney(company.totalExpenses, fmt)}</td>
                  <td className="num">{formatMoney(company.netProfit, fmt)}</td>
                  <td className="num">{formatMoney(company.totalAssets, fmt)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>
                  <strong>Total {group.country}</strong>
                </td>
                <td className="num">
                  <strong>{formatMoney(group.totalRevenue, fmt)}</strong>
                </td>
                <td className="num">
                  <strong>{formatMoney(group.totalExpenses, fmt)}</strong>
                </td>
                <td className="num">
                  <strong>{formatMoney(group.netProfit, fmt)}</strong>
                </td>
                <td className="num">
                  <strong>{formatMoney(group.totalAssets, fmt)}</strong>
                </td>
              </tr>
            </React.Fragment>
          ))}
          <tr className="total-row">
            <td>
              <strong>Consolidated total</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(dashboard.totalRevenue, fmt)}</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(dashboard.totalExpenses, fmt)}</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(dashboard.netProfit, fmt)}</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(dashboard.totalAssets, fmt)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
