import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PostingRule } from '@shared/types';
import { api, formatApiError } from '../utils/api';
import { useApp } from '../utils/context';
import { formatMoney } from '../utils/format';
import { buildReportingDashboard, type ReportView } from '../utils/reporting-dashboard';
import { MultiCountryOverview } from '../components/MultiCountryOverview';

export function Reports() {
  const { companyId, companies } = useApp();
  const [view, setView] = useState<ReportView>('pl');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState<PostingRule[]>([]);

  // Period controls — default to this month
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  // Quick period presets
  function setPreset(preset: string) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexed
    switch (preset) {
      case 'ytd':
        setDateFrom(`${y}-01-01`);
        setDateTo(today);
        break;
      case 'q1':
        setDateFrom(`${y}-01-01`);
        setDateTo(`${y}-03-31`);
        break;
      case 'q2':
        setDateFrom(`${y}-04-01`);
        setDateTo(`${y}-06-30`);
        break;
      case 'q3':
        setDateFrom(`${y}-07-01`);
        setDateTo(`${y}-09-30`);
        break;
      case 'q4':
        setDateFrom(`${y}-10-01`);
        setDateTo(`${y}-12-31`);
        break;
      case 'last-month': {
        const lm = m === 0 ? 11 : m - 1;
        const ly = m === 0 ? y - 1 : y;
        const lastDay = new Date(ly, lm + 1, 0).getDate();
        setDateFrom(`${ly}-${String(lm + 1).padStart(2, '0')}-01`);
        setDateTo(`${ly}-${String(lm + 1).padStart(2, '0')}-${lastDay}`);
        break;
      }
      case 'this-month': {
        setDateFrom(`${y}-${String(m + 1).padStart(2, '0')}-01`);
        setDateTo(today);
        break;
      }
      case 'last-year':
        setDateFrom(`${y - 1}-01-01`);
        setDateTo(`${y - 1}-12-31`);
        break;
    }
  }

  const fetchIdRef = useRef(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const activeCompany = companies.find((company) => company.id === companyId);
  const companyCountry = activeCompany?.country || 'LV';
  const reportingDashboard = useMemo(
    () => buildReportingDashboard(companyCountry, rules),
    [companyCountry, rules],
  );
  const consolidatedCompanies = useMemo(
    () =>
      companies.map((company) => ({
        id: company.id,
        name: company.name,
        shortName: company.shortName,
        country: company.country,
        currency: company.currency,
      })),
    [companies],
  );

  useEffect(() => {
    if (!companyId) {
      setRules([]);
      return;
    }
    let cancelled = false;
    api
      .rules(companyCountry)
      .then((result) => {
        if (!cancelled) setRules(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (!cancelled) setRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, companyCountry]);

  useEffect(() => {
    if (!companyId) return;
    if (view === 'multi-country') {
      // Consolidated view fetches per company itself — invalidate any inflight single-company fetch.
      ++fetchIdRef.current;
      setLoading(false);
      setData(null);
      return;
    }
    const id = ++fetchIdRef.current;
    setLoading(true);
    setData(null);
    let fetcher: Promise<any>;
    if (view === 'pl') fetcher = api.profitLoss(companyId, dateFrom, dateTo);
    else if (view === 'bs') fetcher = api.balanceSheet(companyId, dateTo);
    else if (view === 'tb') fetcher = api.trialBalance(companyId, dateFrom, dateTo);
    else if (view === 'ar-aging') fetcher = api.arAging(companyId);
    else if (view === 'ap-aging') fetcher = api.apAging(companyId);
    else if (view === 'vat') {
      const d = new Date(dateTo);
      fetcher = api.vatDeclaration(companyId, d.getFullYear(), d.getMonth() + 1);
    } else if (view === 'annual')
      fetcher = api.annualReport(companyId, parseInt(dateFrom.slice(0, 4)));
    else if (view === 'budget')
      fetcher = api.budgetVsActual(companyId, parseInt(dateFrom.slice(0, 4)));
    else fetcher = Promise.resolve(null);
    fetcher
      .then((result) => {
        if (id === fetchIdRef.current) setData(result);
      })
      .catch(() => {
        if (id === fetchIdRef.current) setData(null);
      })
      .finally(() => {
        if (id === fetchIdRef.current) setLoading(false);
      });
  }, [companyId, view, dateFrom, dateTo, refreshKey]);

  if (!companyId)
    return (
      <div className="empty-state">
        <div className="icon">🏢</div>
        <h3>No company selected</h3>
        <p>Use the agent chat to create a company first.</p>
      </div>
    );

  return (
    <div>
      <h2 className="page-title">Reports</h2>
      <div className="metric-card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            marginBottom: reportingDashboard.legalBasis.length > 0 ? 12 : 0,
          }}
        >
          <div style={{ flex: '1 1 280px' }}>
            <div className="label">Reporting profile</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)' }}>
              {reportingDashboard.country} company
            </div>
            <div className="subtitle" style={{ maxWidth: 680 }}>
              {reportingDashboard.profileSummary}
            </div>
          </div>
          <div className="dashboard-grid" style={{ flex: '1 1 320px', minWidth: 280 }}>
            <div className="metric-card" style={{ padding: 16, marginBottom: 0 }}>
              <div className="label">Active posting rules</div>
              <div className="value">{reportingDashboard.activeRuleCount}</div>
            </div>
            <div className="metric-card" style={{ padding: 16, marginBottom: 0 }}>
              <div className="label">Localized filings</div>
              <div className="value">{reportingDashboard.localizedReportCount}</div>
            </div>
          </div>
        </div>
        {reportingDashboard.legalBasis.length > 0 && (
          <div>
            <div className="label" style={{ marginBottom: 8 }}>
              Legal basis
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {reportingDashboard.legalBasis.slice(0, 6).map((basis) => (
                <span
                  key={basis}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '999px',
                    background: 'var(--bg-page)',
                    border: '1px solid var(--border)',
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {basis}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="dashboard-grid" style={{ marginBottom: 16 }}>
        {reportingDashboard.cards.map((card) => (
          <div
            key={card.view}
            className={`metric-card metric-card-clickable${view === card.view ? ' metric-card-active' : ''}`}
            onClick={() => setView(card.view)}
            role="button"
            tabIndex={0}
            aria-label={`Open ${card.title}`}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setView(card.view);
              }
            }}
          >
            <div className="label">{card.category}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
              {card.title}
            </div>
            <div className="subtitle" style={{ marginTop: 6 }}>
              {card.description}
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 'var(--text-sm)',
                color: card.isLocalized ? 'var(--accent)' : 'var(--text-tertiary)',
                fontWeight: 500,
              }}
            >
              {card.statusLabel}
            </div>
            {card.legalBasis[0] && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                }}
              >
                {card.legalBasis[0]}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="coa-level-controls" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          className={`coa-level-btn ${view === 'pl' ? 'active' : ''}`}
          onClick={() => setView('pl')}
        >
          Profit & loss
        </button>
        <button
          className={`coa-level-btn ${view === 'bs' ? 'active' : ''}`}
          onClick={() => setView('bs')}
        >
          Balance sheet
        </button>
        <button
          className={`coa-level-btn ${view === 'tb' ? 'active' : ''}`}
          onClick={() => setView('tb')}
        >
          Trial balance
        </button>
        <button
          className={`coa-level-btn ${view === 'ar-aging' ? 'active' : ''}`}
          onClick={() => setView('ar-aging')}
        >
          AR aging
        </button>
        <button
          className={`coa-level-btn ${view === 'ap-aging' ? 'active' : ''}`}
          onClick={() => setView('ap-aging')}
        >
          AP aging
        </button>
        <button
          className={`coa-level-btn ${view === 'vat' ? 'active' : ''}`}
          onClick={() => setView('vat')}
        >
          VAT declaration
        </button>
        <button
          className={`coa-level-btn ${view === 'annual' ? 'active' : ''}`}
          onClick={() => setView('annual')}
        >
          Annual report
        </button>
        <button
          className={`coa-level-btn ${view === 'budget' ? 'active' : ''}`}
          onClick={() => setView('budget')}
        >
          Budget vs actual
        </button>
        <button
          className={`coa-level-btn ${view === 'multi-country' ? 'active' : ''}`}
          onClick={() => setView('multi-country')}
        >
          Multi-country overview
        </button>
      </div>

      <div className="report-period-bar">
        <div className="period-dates">
          {view === 'bs' || view === 'ar-aging' || view === 'ap-aging' ? (
            <>
              <label>As of</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </>
          ) : (
            <>
              <label>From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <label>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </>
          )}
        </div>
        <div className="period-presets">
          <button onClick={() => setPreset('this-month')}>This month</button>
          <button onClick={() => setPreset('last-month')}>Last month</button>
          <button onClick={() => setPreset('q1')}>Q1</button>
          <button onClick={() => setPreset('q2')}>Q2</button>
          <button onClick={() => setPreset('q3')}>Q3</button>
          <button onClick={() => setPreset('q4')}>Q4</button>
          <button onClick={() => setPreset('ytd')}>YTD</button>
          <button onClick={() => setPreset('last-year')}>Last year</button>
        </div>
      </div>

      {view === 'multi-country' ? (
        <MultiCountryOverview
          companies={consolidatedCompanies}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      ) : loading ? (
        <ReportLoadingSkeleton />
      ) : !data ? (
        <div className="empty-state">
          <div className="icon">📊</div>
          <h3>No data available</h3>
          <p>Post some invoices to see financial reports.</p>
        </div>
      ) : view === 'pl' ? (
        <ProfitLoss data={data} />
      ) : view === 'bs' ? (
        <BalanceSheet data={data} />
      ) : view === 'tb' ? (
        <TrialBalance data={data} />
      ) : view === 'ar-aging' || view === 'ap-aging' ? (
        <AgingReport data={data} />
      ) : view === 'vat' ? (
        <VatDeclaration data={data} country={reportingDashboard.country} />
      ) : view === 'annual' ? (
        <AnnualReport data={data} country={reportingDashboard.country} />
      ) : view === 'budget' ? (
        <BudgetVsActual data={data} onRefresh={() => setRefreshKey((k) => k + 1)} />
      ) : null}
    </div>
  );
}

function ProfitLoss({ data }: { data: any }) {
  const { numberFormat: fmt } = useApp();
  const revenue = data?.revenue || [];
  const expenses = data?.expenses || [];
  const totalRevenue = data?.totalRevenue ?? 0;
  const totalExpenses = data?.totalExpenses ?? 0;
  const netProfit = data?.netProfit ?? 0;

  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
        Profit & loss — {data?.periodStart || ''} to {data?.periodEnd || ''}
      </h3>
      <table className="data-table report-table">
        <colgroup>
          <col style={{ width: 72 }} />
          <col />
          <col style={{ width: 140 }} />
        </colgroup>
        <tbody>
          <tr className="section-label-row">
            <td colSpan={3} className="label" style={{ paddingBottom: 4 }}>
              Revenue
            </td>
          </tr>
          {revenue.map((r: any) => (
            <tr key={r.code}>
              <td className="mono">{r.code}</td>
              <td>{r.name}</td>
              <td className="num">{formatMoney(r.amount, fmt)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td></td>
            <td>
              <strong>Total revenue</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(totalRevenue, fmt)}</strong>
            </td>
          </tr>
          <tr className="section-label-row">
            <td colSpan={3} className="label" style={{ paddingTop: 20, paddingBottom: 4 }}>
              Expenses
            </td>
          </tr>
          {expenses.map((e: any) => (
            <tr key={e.code}>
              <td className="mono">{e.code}</td>
              <td>{e.name}</td>
              <td className="num">{formatMoney(e.amount, fmt)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td></td>
            <td>
              <strong>Total expenses</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(totalExpenses, fmt)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <div
        style={{
          marginTop: 20,
          padding: '16px 0',
          borderTop: '2px solid #1C1C1C',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>Net profit</span>
        <span
          style={{ fontSize: 20, fontWeight: 600, color: netProfit >= 0 ? '#34C759' : '#FF3B30' }}
        >
          {formatMoney(netProfit, fmt)}
        </span>
      </div>
    </div>
  );
}

function BalanceSheet({ data }: { data: any }) {
  const { numberFormat: fmt } = useApp();
  const assets = data?.assets || [];
  const liabilities = data?.liabilities || [];
  const equity = data?.equity || [];

  const sectionRows = (title: string, items: any[], total: number, isFirst?: boolean) => (
    <>
      <tr className="section-label-row">
        <td
          colSpan={3}
          className="label"
          style={{ paddingTop: isFirst ? 0 : 20, paddingBottom: 4 }}
        >
          {title}
        </td>
      </tr>
      {items.map((a: any, i: number) => (
        <tr key={a.code || i}>
          <td className="mono">{a.code}</td>
          <td>{a.name}</td>
          <td className="num">{formatMoney(a.balance, fmt)}</td>
        </tr>
      ))}
      <tr className="total-row">
        <td></td>
        <td>
          <strong>Total {title.toLowerCase()}</strong>
        </td>
        <td className="num">
          <strong>{formatMoney(total, fmt)}</strong>
        </td>
      </tr>
    </>
  );
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
        Balance sheet — {data?.date || ''}
      </h3>
      <table className="data-table report-table">
        <colgroup>
          <col style={{ width: 72 }} />
          <col />
          <col style={{ width: 140 }} />
        </colgroup>
        <tbody>
          {sectionRows('Assets', assets, data?.totalAssets ?? 0, true)}
          {sectionRows('Liabilities', liabilities, data?.totalLiabilities ?? 0)}
          {sectionRows('Equity', equity, data?.totalEquity ?? 0)}
        </tbody>
      </table>
    </div>
  );
}

function TrialBalance({ data }: { data: any }) {
  const { numberFormat: fmt } = useApp();
  const lines = data?.lines || [];
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
        Trial balance — {data?.periodStart || ''} to {data?.periodEnd || ''}
      </h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Account</th>
            <th style={{ textAlign: 'right' }}>Opening balance</th>
            <th style={{ textAlign: 'right' }}>Debit</th>
            <th style={{ textAlign: 'right' }}>Credit</th>
            <th style={{ textAlign: 'right' }}>Closing balance</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l: any, i: number) => (
            <tr key={l.accountCode || i}>
              <td className="mono">{l.accountCode}</td>
              <td>{l.accountName}</td>
              <td className="num">{l.openingBalance ? formatMoney(l.openingBalance, fmt) : ''}</td>
              <td className="num">{l.periodDebit ? formatMoney(l.periodDebit, fmt) : ''}</td>
              <td className="num">{l.periodCredit ? formatMoney(l.periodCredit, fmt) : ''}</td>
              <td className="num" style={{ fontWeight: 500 }}>
                {formatMoney(l.closingBalance, fmt)}
              </td>
            </tr>
          ))}
          <tr className="total-row">
            <td></td>
            <td>
              <strong>Totals</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(data?.totalOpeningBalance, fmt)}</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(data?.totalPeriodDebit, fmt)}</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(data?.totalPeriodCredit, fmt)}</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(data?.totalClosingBalance, fmt)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function AgingReport({ data }: { data: any }) {
  const { numberFormat: fmt } = useApp();
  const buckets = data?.buckets || [];
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
        {data?.type === 'ar' ? 'Accounts receivable' : 'Accounts payable'} aging — {data?.date}
      </h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Contact</th>
            <th style={{ textAlign: 'right' }}>Current</th>
            <th style={{ textAlign: 'right' }}>1-30 days</th>
            <th style={{ textAlign: 'right' }}>31-60 days</th>
            <th style={{ textAlign: 'right' }}>90+ days</th>
            <th style={{ textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b: any, i: number) => (
            <tr key={i}>
              <td style={{ fontWeight: 500 }}>{b.contactName}</td>
              <td className="num">{b.current ? formatMoney(b.current, fmt) : ''}</td>
              <td className="num">{b.days30 ? formatMoney(b.days30, fmt) : ''}</td>
              <td className="num">{b.days60 ? formatMoney(b.days60, fmt) : ''}</td>
              <td className="num" style={{ color: b.days90plus > 0 ? '#FF3B30' : undefined }}>
                {b.days90plus ? formatMoney(b.days90plus, fmt) : ''}
              </td>
              <td className="num" style={{ fontWeight: 500 }}>
                {formatMoney(b.total, fmt)}
              </td>
            </tr>
          ))}
          <tr className="total-row">
            <td>
              <strong>Totals</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(data?.totalCurrent, fmt)}</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(data?.totalDays30, fmt)}</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(data?.totalDays60, fmt)}</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(data?.totalDays90plus, fmt)}</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(data?.grandTotal, fmt)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ReportLoadingSkeleton() {
  return (
    <div className="dashboard-grid" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="metric-card">
          <div
            style={{
              height: 12,
              width: '30%',
              borderRadius: 999,
              background: 'var(--bg-page)',
              marginBottom: 12,
            }}
          />
          <div
            style={{
              height: 24,
              width: '60%',
              borderRadius: 999,
              background: 'var(--bg-page)',
              marginBottom: 10,
            }}
          />
          <div
            style={{
              height: 12,
              width: '100%',
              borderRadius: 999,
              background: 'var(--bg-page)',
              marginBottom: 8,
            }}
          />
          <div
            style={{
              height: 12,
              width: '80%',
              borderRadius: 999,
              background: 'var(--bg-page)',
            }}
          />
        </div>
      ))}
    </div>
  );
}

function VatDeclaration({ data, country }: { data: any; country: string }) {
  const { numberFormat: fmt } = useApp();
  const isLatvia = country === 'LV';
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
        {isLatvia ? 'PVN deklarācija' : 'VAT report'} — {data?.period}
      </h3>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 16 }}>
        {data?.companyName}
        {data?.vatNumber ? ` · ${data.vatNumber}` : ''}
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Rate</th>
            <th style={{ textAlign: 'right' }}>Taxable amount</th>
            <th style={{ textAlign: 'right' }}>VAT</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Standard (21%)</td>
            <td className="num">{formatMoney(data?.taxableStandard, fmt)}</td>
            <td className="num">{formatMoney(data?.outputVatStandard, fmt)}</td>
          </tr>
          <tr>
            <td>Reduced (12%)</td>
            <td className="num">{formatMoney(data?.taxableReduced, fmt)}</td>
            <td className="num">{formatMoney(data?.outputVatReduced, fmt)}</td>
          </tr>
          <tr>
            <td>Super-reduced (5%)</td>
            <td className="num">{formatMoney(data?.taxableSuperReduced, fmt)}</td>
            <td className="num">{formatMoney(data?.outputVatSuperReduced, fmt)}</td>
          </tr>
          <tr className="total-row">
            <td>
              <strong>Total output VAT</strong>
            </td>
            <td></td>
            <td className="num">
              <strong>{formatMoney(data?.totalOutputVat, fmt)}</strong>
            </td>
          </tr>
          <tr>
            <td>
              <strong>Total input VAT</strong>
            </td>
            <td></td>
            <td className="num">
              <strong>{formatMoney(data?.totalInputVat, fmt)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      <div
        style={{
          marginTop: 20,
          padding: '16px 0',
          borderTop: '2px solid #1C1C1C',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>
          {isLatvia ? 'VAT payable to VID' : 'VAT payable'}
        </span>
        <span
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: (data?.vatPayable ?? 0) >= 0 ? '#FF3B30' : '#34C759',
          }}
        >
          {formatMoney(data?.vatPayable, fmt)}
        </span>
      </div>
    </div>
  );
}

function AnnualReport({ data, country }: { data: any; country: string }) {
  const { numberFormat: fmt } = useApp();
  const lv = data?.profitAndLossLv || {};
  const bsLv = data?.balanceSheetLv || {};
  const isLatvia = country === 'LV';
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
        Annual financial statements — FY{data?.fiscalYear}
      </h3>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 16 }}>
        {data?.companyName} · Reg. {data?.registrationNumber}
      </div>
      {!isLatvia && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-page)',
            border: '1px solid var(--border)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          This year-end view currently uses the default Latvian grouping until a {country}
          specific statutory layout is added.
        </div>
      )}

      <div className="label">
        {isLatvia ? 'Balance sheet (Latvian format)' : 'Balance sheet (default layout)'}
      </div>
      <table className="data-table report-table" style={{ marginBottom: 20 }}>
        <colgroup>
          <col />
          <col style={{ width: 140 }} />
        </colgroup>
        <tbody>
          <tr>
            <td>Long-term assets</td>
            <td className="num">{formatMoney(bsLv.longTermAssets, fmt)}</td>
          </tr>
          <tr>
            <td>Current assets</td>
            <td className="num">{formatMoney(bsLv.currentAssets, fmt)}</td>
          </tr>
          <tr className="total-row">
            <td>
              <strong>Total assets</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(bsLv.totalAssets, fmt)}</strong>
            </td>
          </tr>
          <tr>
            <td>Equity</td>
            <td className="num">{formatMoney(bsLv.equity, fmt)}</td>
          </tr>
          <tr>
            <td>Long-term liabilities</td>
            <td className="num">{formatMoney(bsLv.longTermLiabilities, fmt)}</td>
          </tr>
          <tr>
            <td>Current liabilities</td>
            <td className="num">{formatMoney(bsLv.currentLiabilities, fmt)}</td>
          </tr>
          <tr className="total-row">
            <td>
              <strong>Total equity + liabilities</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(bsLv.totalEquityAndLiabilities, fmt)}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="label">
        {isLatvia ? 'Profit & loss (Latvian format)' : 'Profit & loss (default layout)'}
      </div>
      <table className="data-table report-table">
        <colgroup>
          <col />
          <col style={{ width: 140 }} />
        </colgroup>
        <tbody>
          <tr>
            <td>Net turnover</td>
            <td className="num">{formatMoney(lv.netTurnover, fmt)}</td>
          </tr>
          <tr>
            <td>Cost of goods sold</td>
            <td className="num">{formatMoney(lv.costOfGoodsSold, fmt)}</td>
          </tr>
          <tr className="total-row">
            <td>
              <strong>Gross profit</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(lv.grossProfit, fmt)}</strong>
            </td>
          </tr>
          <tr>
            <td>Selling expenses</td>
            <td className="num">{formatMoney(lv.sellingExpenses, fmt)}</td>
          </tr>
          <tr>
            <td>Administrative expenses</td>
            <td className="num">{formatMoney(lv.administrativeExpenses, fmt)}</td>
          </tr>
          <tr>
            <td>Other income</td>
            <td className="num">{formatMoney(lv.otherIncome, fmt)}</td>
          </tr>
          <tr>
            <td>Financial expenses</td>
            <td className="num">{formatMoney(lv.financialExpenses, fmt)}</td>
          </tr>
          <tr className="total-row">
            <td>
              <strong>Profit before tax</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(lv.profitBeforeTax, fmt)}</strong>
            </td>
          </tr>
          <tr>
            <td>Corporate income tax</td>
            <td className="num">{formatMoney(lv.corporateIncomeTax, fmt)}</td>
          </tr>
        </tbody>
      </table>
      <div
        style={{
          marginTop: 20,
          padding: '16px 0',
          borderTop: '2px solid #1C1C1C',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>Net profit</span>
        <span
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: (lv.netProfit ?? 0) >= 0 ? '#34C759' : '#FF3B30',
          }}
        >
          {formatMoney(lv.netProfit, fmt)}
        </span>
      </div>
    </div>
  );
}

function BudgetVsActual({ data, onRefresh }: { data: any; onRefresh?: () => void }) {
  const { companyId, numberFormat: fmt, toast } = useApp();
  const items = Array.isArray(data) ? data : [];
  const [showAdd, setShowAdd] = useState(false);
  const [budgetAccountCode, setBudgetAccountCode] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetYear, setBudgetYear] = useState(new Date().getFullYear());
  const [saving, setSaving] = useState(false);

  async function handleAddBudget() {
    if (!budgetAccountCode || !budgetAmount || !companyId) return;
    setSaving(true);
    try {
      await api.setBudget(companyId, {
        year: budgetYear,
        entries: [{ accountCode: budgetAccountCode, monthlyAmount: parseFloat(budgetAmount) }],
      });
      setBudgetAccountCode('');
      setBudgetAmount('');
      setShowAdd(false);
      onRefresh?.();
    } catch (err: any) {
      toast(formatApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="metric-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Budget vs actual</h3>
        <button
          className="btn-secondary"
          style={{ fontSize: 'var(--text-sm)' }}
          onClick={() => setShowAdd(!showAdd)}
        >
          {showAdd ? 'Cancel' : '+ Add budget'}
        </button>
      </div>

      {showAdd && (
        <div
          style={{
            marginBottom: 16,
            padding: 14,
            background: 'var(--bg-page)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10,
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                  marginBottom: 4,
                }}
              >
                Account code
              </label>
              <input
                type="text"
                value={budgetAccountCode}
                onChange={(e) => setBudgetAccountCode(e.target.value)}
                placeholder="e.g. 6330"
                className="form-input"
                style={{ width: '100%' }}
                aria-label="Budget account code"
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                  marginBottom: 4,
                }}
              >
                Monthly amount (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                placeholder="1200"
                className="form-input"
                style={{ width: '100%' }}
                aria-label="Monthly budget amount"
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                  marginBottom: 4,
                }}
              >
                Year
              </label>
              <input
                type="number"
                value={budgetYear}
                onChange={(e) => setBudgetYear(Number(e.target.value))}
                className="form-input"
                style={{ width: '100%' }}
                aria-label="Budget year"
              />
            </div>
          </div>
          <button
            className="btn-primary"
            style={{ marginTop: 10 }}
            onClick={handleAddBudget}
            disabled={saving || !budgetAccountCode || !budgetAmount}
          >
            {saving ? 'Saving...' : 'Add budget entry'}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p style={{ color: 'var(--text-tertiary)' }}>
          No budget data yet. Click "+ Add budget" to set monthly budgets for expense accounts.
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Account</th>
              <th style={{ textAlign: 'right' }}>Budget</th>
              <th style={{ textAlign: 'right' }}>Actual</th>
              <th style={{ textAlign: 'right' }}>Variance</th>
              <th style={{ textAlign: 'right' }}>%</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i: any) => (
              <tr key={i.accountCode}>
                <td className="mono">{i.accountCode}</td>
                <td>{i.accountName}</td>
                <td className="num">{formatMoney(i.budget, fmt)}</td>
                <td className="num">{formatMoney(i.actual, fmt)}</td>
                <td className="num" style={{ color: i.variance >= 0 ? '#34C759' : '#FF3B30' }}>
                  {formatMoney(i.variance, fmt)}
                </td>
                <td className="num">{i.variancePercent.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
