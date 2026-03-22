import React, { useEffect, useState, useMemo } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

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
  const { companyId } = useApp();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    api.accounts(companyId).then((data: any) => { setAccounts(data); setLoading(false); }).catch(() => setLoading(false));
  }, [companyId]);

  const totals = useMemo(() => computeSubtotals(accounts), [accounts]);

  const visibleAccounts = useMemo(() => {
    return accounts.filter((a: any) => {
      if (a.level === 1) return true;
      // Check if any ancestor is collapsed
      let parent = a.parentCode;
      while (parent) {
        if (collapsed.has(parent)) return false;
        const parentAcct = accounts.find((p: any) => p.code === parent);
        parent = parentAcct?.parentCode;
      }
      return true;
    });
  }, [accounts, collapsed]);

  const toggleCollapse = (code: string) => {
    setCollapsed(prev => {
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
  const level1AllCollapsed = allLevel1.length > 0 && allLevel1.every((a: any) => collapsed.has(a.code));
  const level2AllCollapsed = allLevel2.length > 0 && allLevel2.every((a: any) => collapsed.has(a.code));
  const activeLevel = level1AllCollapsed ? 1 : level2AllCollapsed ? 2 : 3;

  if (!companyId) return <NoCompany />;

  return (
    <div>
      <div className="coa-header">
        <h2 className="page-title">Chart of accounts</h2>
        {!loading && accounts.length > 0 && (
          <div className="coa-level-controls">
            <button className={`coa-level-btn ${activeLevel === 1 ? "active" : ""}`} onClick={() => expandToLevel(1)}>Classes</button>
            <button className={`coa-level-btn ${activeLevel === 2 ? "active" : ""}`} onClick={() => expandToLevel(2)}>Groups</button>
            <button className={`coa-level-btn ${activeLevel === 3 ? "active" : ""}`} onClick={() => expandToLevel(3)}>All</button>
          </div>
        )}
      </div>
      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : (
        <table className="data-table coa-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Type</th><th>Balance</th></tr>
          </thead>
          <tbody>
            {visibleAccounts.map((a: any) => {
              const balance = totals.get(a.code) ?? 0;
              const hasChildren = !a.isPostable && accounts.some((c: any) => c.parentCode === a.code);
              const isCollapsed = collapsed.has(a.code);

              if (a.level === 1) {
                return (
                  <tr key={a.id} className="coa-class" onClick={() => hasChildren && toggleCollapse(a.code)}>
                    <td className="mono">{a.code}</td>
                    <td>
                      {hasChildren && <span className="coa-toggle">{isCollapsed ? "▸" : "▾"}</span>}
                      {a.name}
                    </td>
                    <td><span className="badge">{a.type}</span></td>
                    <td className="num">€{balance.toFixed(2)}</td>
                  </tr>
                );
              }

              if (a.level === 2) {
                return (
                  <tr key={a.id} className="coa-group" onClick={() => hasChildren && toggleCollapse(a.code)}>
                    <td className="mono">{a.code}</td>
                    <td>
                      {hasChildren && <span className="coa-toggle">{isCollapsed ? "▸" : "▾"}</span>}
                      {a.name}
                    </td>
                    <td></td>
                    <td className="num">€{balance.toFixed(2)}</td>
                  </tr>
                );
              }

              return (
                <tr key={a.id} className="coa-account">
                  <td className="mono">{a.code}</td>
                  <td>{a.name}</td>
                  <td></td>
                  <td className="num">€{balance.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NoCompany() {
  return (
    <div className="empty-state">
      <div className="icon">🏢</div>
      <h3>No company selected</h3>
      <p>Use the agent chat to create a company first: "Create a company called SIA MyCompany"</p>
    </div>
  );
}
