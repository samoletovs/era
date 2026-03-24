import React, { useEffect, useState, useMemo, useCallback } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney } from "../utils/format";

interface Transaction {
  entryId: string;
  entryNumber: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  sourceType: string;
}

function computeSubtotals(accounts: any[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const a of accounts) {
    if (a.isPostable) totals.set(a.code, a.balance);
  }
  // Roll up level 2 from children
  for (const a of accounts) {
    if (a.level === 2 && !a.isPostable) {
      const sum = accounts
        .filter((c: any) => c.parentCode === a.code && c.isPostable)
        .reduce((s: number, c: any) => s + c.balance, 0);
      totals.set(a.code, sum);
    }
  }
  // Roll up level 1 from level 2 children
  for (const a of accounts) {
    if (a.level === 1 && !a.isPostable) {
      const sum = accounts
        .filter((c: any) => c.parentCode === a.code)
        .reduce((s: number, c: any) => s + (totals.get(c.code) ?? 0), 0);
      totals.set(a.code, sum);
    }
  }
  return totals;
}

export function Accounts() {
  const { companyId, numberFormat: fmt } = useApp();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sortBalance, setSortBalance] = useState<"" | "asc" | "desc">("");
  const [asOfDate, setAsOfDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  // Transaction drawer state
  const [selectedAccount, setSelectedAccount] = useState<{
    code: string;
    name: string;
  } | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  const fetchAccounts = useCallback(
    (date: string) => {
      if (!companyId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      api
        .accounts(companyId, date)
        .then((data: any) => {
          setAccounts(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    },
    [companyId],
  );

  useEffect(() => {
    fetchAccounts(asOfDate);
  }, [fetchAccounts, asOfDate]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAsOfDate(e.target.value);
    setSelectedAccount(null);
  };

  const openTransactions = (code: string, name: string) => {
    if (!companyId) return;
    setSelectedAccount({ code, name });
    setTxLoading(true);
    api
      .accountTransactions(companyId, code, asOfDate)
      .then((data: any) => {
        // API returns { transactions: [...], balance } — handle both wrapped and unwrapped
        const txns = Array.isArray(data) ? data : data?.transactions || [];
        setTransactions(txns);
        setTxLoading(false);
      })
      .catch(() => {
        setTransactions([]);
        setTxLoading(false);
      });
  };

  const totals = useMemo(() => computeSubtotals(accounts), [accounts]);

  const visibleAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();

    // When searching, flatten to show matching accounts + their ancestors
    if (q) {
      const matchingCodes = new Set<string>();
      for (const a of accounts) {
        if (
          a.code.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.type || "").toLowerCase().includes(q)
        ) {
          matchingCodes.add(a.code);
          let parent = a.parentCode;
          while (parent) {
            matchingCodes.add(parent);
            const parentAcct = accounts.find((p: any) => p.code === parent);
            parent = parentAcct?.parentCode;
          }
        }
      }
      let result = accounts.filter((a: any) => matchingCodes.has(a.code));
      if (sortBalance) {
        result = [...result].sort((a, b) => {
          const ba = totals.get(a.code) ?? 0;
          const bb = totals.get(b.code) ?? 0;
          return sortBalance === "asc" ? ba - bb : bb - ba;
        });
      }
      return result;
    }

    // Normal tree mode — respect collapse state
    let result = accounts.filter((a: any) => {
      if (a.level === 1) return true;
      let parent = a.parentCode;
      while (parent) {
        if (collapsed.has(parent)) return false;
        const parentAcct = accounts.find((p: any) => p.code === parent);
        parent = parentAcct?.parentCode;
      }
      return true;
    });

    if (sortBalance) {
      result = [...result].sort((a, b) => {
        const ba = totals.get(a.code) ?? 0;
        const bb = totals.get(b.code) ?? 0;
        return sortBalance === "asc" ? ba - bb : bb - ba;
      });
    }

    return result;
  }, [accounts, collapsed, search, totals, sortBalance]);

  const toggleCollapse = (code: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const expandToLevel = (level: number) => {
    const toCollapse = new Set<string>();
    for (const a of accounts) {
      if (!a.isPostable && a.level >= level) {
        toCollapse.add(a.code);
      }
    }
    setCollapsed(toCollapse);
  };

  // Determine which level button is active
  const allLevel1 = accounts.filter((a: any) => a.level === 1 && !a.isPostable);
  const allLevel2 = accounts.filter((a: any) => a.level === 2 && !a.isPostable);
  const level1AllCollapsed =
    allLevel1.length > 0 && allLevel1.every((a: any) => collapsed.has(a.code));
  const level2AllCollapsed =
    allLevel2.length > 0 && allLevel2.every((a: any) => collapsed.has(a.code));
  const activeLevel = level1AllCollapsed ? 1 : level2AllCollapsed ? 2 : 3;

  if (!companyId) return <NoCompany />;

  return (
    <div>
      <div className="coa-header">
        <h2 className="page-title">Main accounts</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div className="coa-date-filter">
            <label className="detail-label" htmlFor="coa-date">
              Balance as of
            </label>
            <input
              id="coa-date"
              type="date"
              value={asOfDate}
              onChange={handleDateChange}
              style={{
                height: 34,
                padding: "0 10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--text-sm)",
                color: "var(--text-body)",
                background: "var(--bg-card)",
              }}
            />
          </div>
          {!loading && accounts.length > 0 && (
            <div className="coa-level-controls">
              <button
                className={`coa-level-btn ${activeLevel === 1 ? "active" : ""}`}
                onClick={() => expandToLevel(1)}
              >
                Classes
              </button>
              <button
                className={`coa-level-btn ${activeLevel === 2 ? "active" : ""}`}
                onClick={() => expandToLevel(2)}
              >
                Groups
              </button>
              <button
                className={`coa-level-btn ${activeLevel === 3 ? "active" : ""}`}
                onClick={() => expandToLevel(3)}
              >
                All
              </button>
            </div>
          )}
        </div>
      </div>
      {!loading && accounts.length > 0 && (
        <div className="filter-bar" style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="table-search-input"
            aria-label="Search accounts"
          />
          {search && (
            <span
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--text-tertiary)",
              }}
            >
              {visibleAccounts.filter((a: any) => a.isPostable).length} accounts
            </span>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ color: "#A0A0A0" }}>Loading...</p>
      ) : (
        <>
          {/* Desktop table */}
          <table className="data-table coa-table desktop-only-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th className="hide-mobile">Type</th>
                <th
                  className={`sortable-th${sortBalance ? " sorted" : ""}`}
                  onClick={() =>
                    setSortBalance((prev) =>
                      prev === "" ? "desc" : prev === "desc" ? "asc" : "",
                    )
                  }
                  style={{ textAlign: "right" }}
                >
                  Balance
                  {sortBalance && (
                    <span className="sort-indicator">
                      {sortBalance === "asc" ? " ▲" : " ▼"}
                    </span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((a: any) => {
                const balance = totals.get(a.code) ?? 0;
                const hasChildren =
                  !a.isPostable &&
                  accounts.some((c: any) => c.parentCode === a.code);
                const isCollapsed = collapsed.has(a.code);
                const isSelected = selectedAccount?.code === a.code;

                if (a.level === 1) {
                  return (
                    <tr
                      key={a.id}
                      className="coa-class"
                      onClick={() => hasChildren && toggleCollapse(a.code)}
                    >
                      <td className="mono">{a.code}</td>
                      <td>
                        {hasChildren && (
                          <span className="coa-toggle">
                            {isCollapsed ? "▸" : "▾"}
                          </span>
                        )}
                        {a.name}
                      </td>
                      <td className="hide-mobile">
                        <span className="badge">{a.type}</span>
                      </td>
                      <td className="num">{formatMoney(balance, fmt)}</td>
                    </tr>
                  );
                }

                if (a.level === 2) {
                  return (
                    <tr
                      key={a.id}
                      className="coa-group"
                      onClick={() => hasChildren && toggleCollapse(a.code)}
                    >
                      <td className="mono">{a.code}</td>
                      <td>
                        {hasChildren && (
                          <span className="coa-toggle">
                            {isCollapsed ? "▸" : "▾"}
                          </span>
                        )}
                        {a.name}
                      </td>
                      <td className="hide-mobile"></td>
                      <td className="num">{formatMoney(balance, fmt)}</td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={a.id}
                    className={`coa-account coa-account-clickable${isSelected ? " coa-account-selected" : ""}`}
                    onClick={() => openTransactions(a.code, a.name)}
                    aria-label={`View transactions for ${a.code} ${a.name}`}
                  >
                    <td className="mono">{a.code}</td>
                    <td>{a.name}</td>
                    <td className="hide-mobile"></td>
                    <td className="num">{formatMoney(balance, fmt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile card view */}
          <div className="coa-mobile-list">
            {visibleAccounts.map((a: any) => {
              const balance = totals.get(a.code) ?? 0;
              const hasChildren =
                !a.isPostable &&
                accounts.some((c: any) => c.parentCode === a.code);
              const isCollapsed = collapsed.has(a.code);
              const isSelected = selectedAccount?.code === a.code;

              return (
                <div
                  key={a.id}
                  className={`coa-mobile-item level-${a.level}${isSelected ? " coa-account-selected" : ""}`}
                  onClick={() => {
                    if (hasChildren) toggleCollapse(a.code);
                    else if (a.isPostable) openTransactions(a.code, a.name);
                  }}
                  aria-label={
                    a.isPostable
                      ? `View transactions for ${a.code} ${a.name}`
                      : `Toggle ${a.name}`
                  }
                >
                  {hasChildren && (
                    <span className="coa-toggle">
                      {isCollapsed ? "▸" : "▾"}
                    </span>
                  )}
                  <div className="coa-mobile-info">
                    <div className="coa-mobile-name">{a.name}</div>
                    <div className="coa-mobile-code">{a.code}</div>
                  </div>
                  <div className="coa-mobile-balance">
                    {formatMoney(balance, fmt)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Transaction drawer */}
      {selectedAccount && (
        <div
          className="coa-drawer-overlay"
          onClick={() => setSelectedAccount(null)}
        >
          <div className="coa-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="coa-drawer-header">
              <div>
                <div className="coa-drawer-title">
                  {selectedAccount.code} — {selectedAccount.name}
                </div>
                <div className="coa-drawer-subtitle">
                  Transactions as of {asOfDate}
                </div>
              </div>
              <button
                className="coa-drawer-close"
                onClick={() => setSelectedAccount(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="coa-drawer-body">
              {txLoading ? (
                <p style={{ color: "var(--text-tertiary)", padding: 16 }}>
                  Loading transactions...
                </p>
              ) : transactions.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", padding: 16 }}>
                  No transactions found
                </p>
              ) : (
                <>
                  {/* Desktop table */}
                  <table className="data-table coa-tx-table desktop-only-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="hide-mobile">Entry</th>
                        <th className="hide-mobile">Description</th>
                        <th>Debit</th>
                        <th>Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx, i) => (
                        <tr key={`${tx.entryId}-${i}`}>
                          <td className="mono">{tx.date}</td>
                          <td
                            className="mono hide-mobile"
                            style={{ fontSize: "var(--text-xs)" }}
                          >
                            {tx.entryNumber}
                          </td>
                          <td className="hide-mobile">{tx.description}</td>
                          <td className="num">
                            {tx.debit > 0 ? formatMoney(tx.debit, fmt) : ""}
                          </td>
                          <td className="num">
                            {tx.credit > 0 ? formatMoney(tx.credit, fmt) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Mobile card view */}
                  <div className="tx-mobile-list">
                    {transactions.map((tx, i) => (
                      <div
                        key={`${tx.entryId}-${i}`}
                        className="tx-mobile-item"
                      >
                        <div className="tx-mobile-left">
                          <div className="tx-mobile-date">{tx.date}</div>
                          <div className="tx-mobile-desc">
                            {tx.description || tx.entryNumber}
                          </div>
                        </div>
                        <div className="tx-mobile-amounts">
                          {tx.debit > 0 && (
                            <div className="tx-mobile-debit">
                              {formatMoney(tx.debit, fmt)}
                            </div>
                          )}
                          {tx.credit > 0 && (
                            <div className="tx-mobile-credit">
                              ({formatMoney(tx.credit, fmt)})
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NoCompany() {
  return (
    <div className="empty-state">
      <div className="icon">🏢</div>
      <h3>No company selected</h3>
      <p>
        Use the agent chat to create a company first: "Create a company called
        SIA MyCompany"
      </p>
    </div>
  );
}
