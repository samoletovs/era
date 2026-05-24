import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../utils/api';
import { useApp } from '../utils/context';
import { formatMoney } from '../utils/format';

type KpiKey = 'cash' | 'receivables' | 'payables' | 'vat';

interface AccountTransaction {
  entryId: string;
  entryNumber: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  sourceType: string;
}

const KPI_ACCOUNTS: Record<KpiKey, { codes: string[]; label: string }> = {
  cash: { codes: ['2420'], label: 'Cash & bank transactions' },
  receivables: { codes: ['2210'], label: 'Receivable transactions' },
  payables: { codes: ['4220'], label: 'Payable transactions' },
  vat: { codes: ['4230', '2310'], label: 'VAT transactions' },
};

export function Dashboard() {
  const { companyId, numberFormat: fmt } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);

  // Drill-down state
  const [activeKpi, setActiveKpi] = useState<KpiKey | null>(null);
  const [drillTxns, setDrillTxns] = useState<AccountTransaction[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [invoiceSort, setInvoiceSort] = useState<{
    key: string;
    dir: 'asc' | 'desc';
  }>({ key: 'invoiceNumber', dir: 'desc' });

  useEffect(() => {
    if (!companyId) return;
    api
      .dashboard(companyId)
      .then(setData)
      .catch(() => {});
    api
      .companyHealth(companyId)
      .then(setHealth)
      .catch(() => {});
  }, [companyId]);

  async function handleKpiClick(key: KpiKey) {
    if (activeKpi === key) {
      setActiveKpi(null);
      setDrillTxns([]);
      return;
    }
    setActiveKpi(key);
    setDrillLoading(true);
    setDrillTxns([]);
    try {
      const { codes } = KPI_ACCOUNTS[key];
      const results = await Promise.all(
        codes.map((code) => api.accountTransactions(companyId, code)),
      );
      const allTxns = results.flatMap((r) => r.transactions);
      allTxns.sort((a, b) => b.date.localeCompare(a.date));
      setDrillTxns(allTxns);
    } catch {
      setDrillTxns([]);
    }
    setDrillLoading(false);
  }

  function handleInvoiceClick(inv: any) {
    if (inv.id) {
      navigate('/invoices', { state: { selectedInvoiceId: inv.id } });
    } else {
      navigate('/invoices');
    }
  }

  if (!companyId)
    return (
      <div className="empty-state" style={{ marginTop: 80 }}>
        <div className="icon">🏢</div>
        <h3>Welcome to ERA</h3>
        <p style={{ maxWidth: 360, marginBottom: 20 }}>
          Search the Latvian Enterprise Register and set up your company in seconds.
        </p>
        <button className="btn-primary" onClick={() => navigate('/onboarding')}>
          Add your first company
        </button>
      </div>
    );

  return (
    <div>
      <h2 className="page-title">Dashboard</h2>
      <div className="dashboard-grid">
        {[
          {
            key: 'cash' as KpiKey,
            label: 'Cash position',
            value: data?.cash,
            subtitle: 'Bank + cash accounts',
          },
          {
            key: 'receivables' as KpiKey,
            label: 'Receivables',
            value: data?.receivables,
            subtitle: 'Outstanding invoices',
          },
          {
            key: 'payables' as KpiKey,
            label: 'Payables',
            value: data?.payables,
            subtitle: 'Bills to pay',
          },
          {
            key: 'vat' as KpiKey,
            label: 'VAT due',
            value: data?.vatDue,
            subtitle: 'Current period',
          },
        ].map((kpi) => (
          <div
            key={kpi.key}
            className={`metric-card metric-card-clickable${activeKpi === kpi.key ? ' metric-card-active' : ''}`}
            onClick={() => handleKpiClick(kpi.key)}
            role="button"
            tabIndex={0}
            aria-label={`View ${kpi.label} details`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleKpiClick(kpi.key);
              }
            }}
          >
            <div className="label">{kpi.label}</div>
            <div className="value">{formatMoney(kpi.value, fmt)}</div>
            <div className="subtitle">
              {kpi.subtitle}
              <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)' }}>
                {activeKpi === kpi.key ? '▴' : '▾'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* KPI drill-down panel */}
      {activeKpi && (
        <div className="metric-card" style={{ marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <div className="label" style={{ marginBottom: 0 }}>
              {KPI_ACCOUNTS[activeKpi].label}
            </div>
            <button
              onClick={() => {
                setActiveKpi(null);
                setDrillTxns([]);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                color: 'var(--text-tertiary)',
                padding: 4,
              }}
              aria-label="Close drill-down"
            >
              ✕
            </button>
          </div>
          {drillLoading ? (
            <div
              style={{
                padding: '20px 0',
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--text-sm)',
              }}
            >
              Loading transactions...
            </div>
          ) : drillTxns.length === 0 ? (
            <div
              style={{
                padding: '20px 0',
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--text-sm)',
              }}
            >
              No transactions found
            </div>
          ) : (
            <table className="data-table" style={{ marginTop: 4 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Entry</th>
                  <th>Description</th>
                  <th>Debit</th>
                  <th>Credit</th>
                </tr>
              </thead>
              <tbody>
                {drillTxns.slice(0, 20).map((txn, i) => (
                  <tr key={`${txn.entryId}-${i}`}>
                    <td style={{ whiteSpace: 'nowrap' }}>{txn.date}</td>
                    <td className="mono">{txn.entryNumber}</td>
                    <td>{txn.description}</td>
                    <td className="num">{txn.debit ? formatMoney(txn.debit, fmt) : ''}</td>
                    <td className="num">{txn.credit ? formatMoney(txn.credit, fmt) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {drillTxns.length > 20 && (
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <button
                className="btn-secondary"
                style={{ fontSize: 'var(--text-sm)' }}
                onClick={() =>
                  navigate('/accounts', {
                    state: { accountCode: KPI_ACCOUNTS[activeKpi].codes[0] },
                  })
                }
              >
                View all {drillTxns.length} transactions
              </button>
            </div>
          )}
        </div>
      )}

      {health && (
        <div className="metric-card" style={{ marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <div>
              <div className="label">Company checklist</div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-tertiary, #A0A0A0)',
                  marginTop: 2,
                }}
              >
                {health.issues?.length > 0
                  ? `${health.issues.length} item${health.issues.length !== 1 ? 's' : ''} need attention`
                  : 'Everything up to date'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 80,
                  height: 6,
                  borderRadius: 3,
                  background: '#F0EFEE',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${health.score}%`,
                    height: '100%',
                    borderRadius: 3,
                    background:
                      health.score >= 80 ? '#34C759' : health.score >= 50 ? '#FF9500' : '#FF3B30',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-secondary, #787878)',
                }}
              >
                {health.score}%
              </span>
            </div>
          </div>
          {health.issues?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {health.issues.map((issue: any, i: number) => (
                <div
                  key={i}
                  onClick={() => {
                    if (issue.agentCommand)
                      navigate('/chat', {
                        state: { prefill: issue.agentCommand },
                      });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--bg-subtle, #F5F5F4)',
                    border: '1px solid var(--border, #E8E8E8)',
                    cursor: issue.agentCommand ? 'pointer' : 'default',
                    transition: 'opacity 0.15s',
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background:
                        issue.severity === 'critical'
                          ? '#FF3B30'
                          : issue.severity === 'warning'
                            ? '#FF9500'
                            : '#0A84FF',
                    }}
                  />
                  <div style={{ flex: 1, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-body, #3C3C3C)' }}>{issue.message}</span>
                  </div>
                  {issue.action && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--accent, #0A84FF)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {issue.action} &rarr;
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px',
                borderRadius: 8,
                background: '#F0FBF4',
                border: '1px solid #D1FAE5',
                fontSize: 13,
                color: '#065F46',
              }}
            >
              <span>✓</span> All good, no issues detected
            </div>
          )}
        </div>
      )}

      {data?.recentInvoices?.length > 0 &&
        (() => {
          const toggleSort = (key: string) => {
            setInvoiceSort((prev) =>
              prev.key === key
                ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                : { key, dir: 'asc' },
            );
          };
          const sorted = [...data.recentInvoices].sort((a: any, b: any) => {
            const key = invoiceSort.key;
            let av = a[key] ?? '';
            let bv = b[key] ?? '';
            if (typeof av === 'number' && typeof bv === 'number') {
              return invoiceSort.dir === 'asc' ? av - bv : bv - av;
            }
            av = String(av).toLowerCase();
            bv = String(bv).toLowerCase();
            const cmp = av.localeCompare(bv);
            return invoiceSort.dir === 'asc' ? cmp : -cmp;
          });
          const SortTh = ({
            colKey,
            children,
            className,
            style,
          }: {
            colKey: string;
            children: React.ReactNode;
            className?: string;
            style?: React.CSSProperties;
          }) => (
            <th
              className={`sortable-th${invoiceSort.key === colKey ? ' sorted' : ''}${className ? ' ' + className : ''}`}
              onClick={() => toggleSort(colKey)}
              style={style}
            >
              {children}
              {invoiceSort.key === colKey && (
                <span className="sort-indicator">{invoiceSort.dir === 'asc' ? ' ▲' : ' ▼'}</span>
              )}
            </th>
          );
          return (
            <div className="metric-card">
              <div className="label">Recent invoices</div>
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <SortTh colKey="invoiceNumber">Number</SortTh>
                      <SortTh colKey="type">Type</SortTh>
                      <SortTh colKey="contactName">Contact</SortTh>
                      <SortTh colKey="total" style={{ textAlign: 'right' }}>
                        Total
                      </SortTh>
                      <SortTh colKey="status">Status</SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((inv: any, i: number) => (
                      <tr
                        key={i}
                        onClick={() => handleInvoiceClick(inv)}
                        className="row-clickable"
                        role="link"
                        tabIndex={0}
                        aria-label={`Open invoice ${inv.invoiceNumber}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleInvoiceClick(inv);
                        }}
                      >
                        <td className="mono">{inv.invoiceNumber}</td>
                        <td>
                          <span className="badge">{inv.type}</span>
                        </td>
                        <td>{inv.contactName}</td>
                        <td className="num">{formatMoney(inv.total, fmt)}</td>
                        <td>
                          <span className={`badge badge-${inv.status}`}>{inv.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
