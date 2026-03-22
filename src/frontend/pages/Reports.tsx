import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function Reports() {
  const { companyId } = useApp();
  const [view, setView] = useState<"pl" | "bs" | "tb">("pl");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    const fetcher = view === "pl" ? api.profitLoss : view === "bs" ? api.balanceSheet : api.trialBalance;
    fetcher(companyId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [companyId, view]);

  if (!companyId) return (
    <div className="empty-state">
      <div className="icon">🏢</div><h3>No company selected</h3>
      <p>Use the agent chat to create a company first.</p>
    </div>
  );

  return (
    <div>
      <h2 className="page-title">Reports</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button className={view === "pl" ? "btn-primary" : "btn-secondary"} onClick={() => setView("pl")}>Profit & loss</button>
        <button className={view === "bs" ? "btn-primary" : "btn-secondary"} onClick={() => setView("bs")}>Balance sheet</button>
        <button className={view === "tb" ? "btn-primary" : "btn-secondary"} onClick={() => setView("tb")}>Trial balance</button>
      </div>

      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : !data ? (
        <div className="empty-state"><div className="icon">📊</div><h3>No data</h3></div>
      ) : view === "pl" ? <ProfitLoss data={data} /> : view === "bs" ? <BalanceSheet data={data} /> : <TrialBalance data={data} />}
    </div>
  );
}

function ProfitLoss({ data }: { data: any }) {
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Profit & loss — {data.periodStart} to {data.periodEnd}</h3>
      <div className="label">Revenue</div>
      <table className="data-table">
        <tbody>
          {data.revenue.map((r: any) => <tr key={r.code}><td className="mono">{r.code}</td><td>{r.name}</td><td className="num">€{r.amount.toFixed(2)}</td></tr>)}
          <tr className="total-row"><td></td><td><strong>Total revenue</strong></td><td className="num"><strong>€{data.totalRevenue.toFixed(2)}</strong></td></tr>
        </tbody>
      </table>
      <div className="label" style={{ marginTop: 16 }}>Expenses</div>
      <table className="data-table">
        <tbody>
          {data.expenses.map((e: any) => <tr key={e.code}><td className="mono">{e.code}</td><td>{e.name}</td><td className="num">€{e.amount.toFixed(2)}</td></tr>)}
          <tr className="total-row"><td></td><td><strong>Total expenses</strong></td><td className="num"><strong>€{data.totalExpenses.toFixed(2)}</strong></td></tr>
        </tbody>
      </table>
      <div style={{ marginTop: 20, padding: "16px 0", borderTop: "2px solid #1C1C1C", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Net profit</span>
        <span style={{ fontSize: 20, fontWeight: 600, color: data.netProfit >= 0 ? "#34C759" : "#FF3B30" }}>€{data.netProfit.toFixed(2)}</span>
      </div>
    </div>
  );
}

function BalanceSheet({ data }: { data: any }) {
  const Section = ({ title, items, total }: { title: string; items: any[]; total: number }) => (
    <>
      <div className="label" style={{ marginTop: 16 }}>{title}</div>
      <table className="data-table"><tbody>
        {items.map((a: any) => <tr key={a.code}><td className="mono">{a.code}</td><td>{a.name}</td><td className="num">€{a.balance.toFixed(2)}</td></tr>)}
        <tr className="total-row"><td></td><td><strong>Total {title.toLowerCase()}</strong></td><td className="num"><strong>€{total.toFixed(2)}</strong></td></tr>
      </tbody></table>
    </>
  );
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Balance sheet — {data.date}</h3>
      <Section title="Assets" items={data.assets} total={data.totalAssets} />
      <Section title="Liabilities" items={data.liabilities} total={data.totalLiabilities} />
      <Section title="Equity" items={data.equity} total={data.totalEquity} />
    </div>
  );
}

function TrialBalance({ data }: { data: any }) {
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Trial balance</h3>
      <table className="data-table">
        <thead><tr><th>Code</th><th>Account</th><th>Debit</th><th>Credit</th></tr></thead>
        <tbody>
          {data.lines.map((l: any) => (
            <tr key={l.accountCode}>
              <td className="mono">{l.accountCode}</td><td>{l.accountName}</td>
              <td className="num">{l.debit ? `€${l.debit.toFixed(2)}` : ""}</td>
              <td className="num">{l.credit ? `€${l.credit.toFixed(2)}` : ""}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td></td><td><strong>Totals</strong></td>
            <td className="num"><strong>€{data.totalDebit.toFixed(2)}</strong></td>
            <td className="num"><strong>€{data.totalCredit.toFixed(2)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
