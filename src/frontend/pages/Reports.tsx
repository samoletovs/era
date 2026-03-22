import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function Reports() {
  const { companyId } = useApp();
  const [view, setView] = useState<"pl" | "bs" | "tb">("pl");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Period controls
  const currentYear = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(`${currentYear}-01-01`);
  const [dateTo, setDateTo] = useState(today);

  // Quick period presets
  function setPreset(preset: string) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexed
    switch (preset) {
      case "ytd": setDateFrom(`${y}-01-01`); setDateTo(today); break;
      case "q1": setDateFrom(`${y}-01-01`); setDateTo(`${y}-03-31`); break;
      case "q2": setDateFrom(`${y}-04-01`); setDateTo(`${y}-06-30`); break;
      case "q3": setDateFrom(`${y}-07-01`); setDateTo(`${y}-09-30`); break;
      case "q4": setDateFrom(`${y}-10-01`); setDateTo(`${y}-12-31`); break;
      case "last-month": {
        const lm = m === 0 ? 11 : m - 1;
        const ly = m === 0 ? y - 1 : y;
        const lastDay = new Date(ly, lm + 1, 0).getDate();
        setDateFrom(`${ly}-${String(lm + 1).padStart(2, "0")}-01`);
        setDateTo(`${ly}-${String(lm + 1).padStart(2, "0")}-${lastDay}`);
        break;
      }
      case "this-month": {
        setDateFrom(`${y}-${String(m + 1).padStart(2, "0")}-01`);
        setDateTo(today);
        break;
      }
      case "last-year": setDateFrom(`${y - 1}-01-01`); setDateTo(`${y - 1}-12-31`); break;
    }
  }

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    setData(null);
    let fetcher: Promise<any>;
    if (view === "pl") fetcher = api.profitLoss(companyId, dateFrom, dateTo);
    else if (view === "bs") fetcher = api.balanceSheet(companyId, dateTo);
    else fetcher = api.trialBalance(companyId, dateFrom, dateTo);
    fetcher.then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [companyId, view, dateFrom, dateTo]);

  if (!companyId) return (
    <div className="empty-state">
      <div className="icon">🏢</div><h3>No company selected</h3>
      <p>Use the agent chat to create a company first.</p>
    </div>
  );

  return (
    <div>
      <h2 className="page-title">Reports</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={view === "pl" ? "btn-primary" : "btn-secondary"} onClick={() => setView("pl")}>Profit & loss</button>
        <button className={view === "bs" ? "btn-primary" : "btn-secondary"} onClick={() => setView("bs")}>Balance sheet</button>
        <button className={view === "tb" ? "btn-primary" : "btn-secondary"} onClick={() => setView("tb")}>Trial balance</button>
      </div>

      <div className="report-period-bar">
        <div className="period-dates">
          {view === "bs" ? (
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
          <button onClick={() => setPreset("this-month")}>This month</button>
          <button onClick={() => setPreset("last-month")}>Last month</button>
          <button onClick={() => setPreset("q1")}>Q1</button>
          <button onClick={() => setPreset("q2")}>Q2</button>
          <button onClick={() => setPreset("q3")}>Q3</button>
          <button onClick={() => setPreset("q4")}>Q4</button>
          <button onClick={() => setPreset("ytd")}>YTD</button>
          <button onClick={() => setPreset("last-year")}>Last year</button>
        </div>
      </div>

      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : !data ? (
        <div className="empty-state"><div className="icon">📊</div><h3>No data available</h3><p>Post some invoices to see financial reports.</p></div>
      ) : view === "pl" ? <ProfitLoss data={data} /> : view === "bs" ? <BalanceSheet data={data} /> : <TrialBalance data={data} />}
    </div>
  );
}

function ProfitLoss({ data }: { data: any }) {
  const revenue = data?.revenue || [];
  const expenses = data?.expenses || [];
  const totalRevenue = data?.totalRevenue ?? 0;
  const totalExpenses = data?.totalExpenses ?? 0;
  const netProfit = data?.netProfit ?? 0;

  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Profit & loss — {data?.periodStart || ""} to {data?.periodEnd || ""}</h3>
      <div className="label">Revenue</div>
      <table className="data-table">
        <tbody>
          {revenue.map((r: any) => <tr key={r.code}><td className="mono">{r.code}</td><td>{r.name}</td><td className="num">€{(r.amount ?? 0).toFixed(2)}</td></tr>)}
          <tr className="total-row"><td></td><td><strong>Total revenue</strong></td><td className="num"><strong>€{totalRevenue.toFixed(2)}</strong></td></tr>
        </tbody>
      </table>
      <div className="label" style={{ marginTop: 16 }}>Expenses</div>
      <table className="data-table">
        <tbody>
          {expenses.map((e: any) => <tr key={e.code}><td className="mono">{e.code}</td><td>{e.name}</td><td className="num">€{(e.amount ?? 0).toFixed(2)}</td></tr>)}
          <tr className="total-row"><td></td><td><strong>Total expenses</strong></td><td className="num"><strong>€{totalExpenses.toFixed(2)}</strong></td></tr>
        </tbody>
      </table>
      <div style={{ marginTop: 20, padding: "16px 0", borderTop: "2px solid #1C1C1C", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Net profit</span>
        <span style={{ fontSize: 20, fontWeight: 600, color: netProfit >= 0 ? "#34C759" : "#FF3B30" }}>€{netProfit.toFixed(2)}</span>
      </div>
    </div>
  );
}

function BalanceSheet({ data }: { data: any }) {
  const assets = data?.assets || [];
  const liabilities = data?.liabilities || [];
  const equity = data?.equity || [];

  const Section = ({ title, items, total }: { title: string; items: any[]; total: number }) => (
    <>
      <div className="label" style={{ marginTop: 16 }}>{title}</div>
      <table className="data-table"><tbody>
        {items.map((a: any, i: number) => <tr key={a.code || i}><td className="mono">{a.code}</td><td>{a.name}</td><td className="num">€{(a.balance ?? 0).toFixed(2)}</td></tr>)}
        <tr className="total-row"><td></td><td><strong>Total {title.toLowerCase()}</strong></td><td className="num"><strong>€{(total ?? 0).toFixed(2)}</strong></td></tr>
      </tbody></table>
    </>
  );
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Balance sheet — {data?.date || ""}</h3>
      <Section title="Assets" items={assets} total={data?.totalAssets ?? 0} />
      <Section title="Liabilities" items={liabilities} total={data?.totalLiabilities ?? 0} />
      <Section title="Equity" items={equity} total={data?.totalEquity ?? 0} />
    </div>
  );
}

function TrialBalance({ data }: { data: any }) {
  const lines = data?.lines || [];
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
        Trial balance — {data?.periodStart || ""} to {data?.periodEnd || ""}
      </h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Account</th>
            <th style={{ textAlign: "right" }}>Opening balance</th>
            <th style={{ textAlign: "right" }}>Debit</th>
            <th style={{ textAlign: "right" }}>Credit</th>
            <th style={{ textAlign: "right" }}>Closing balance</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l: any, i: number) => (
            <tr key={l.accountCode || i}>
              <td className="mono">{l.accountCode}</td>
              <td>{l.accountName}</td>
              <td className="num">{l.openingBalance ? `€${l.openingBalance.toFixed(2)}` : ""}</td>
              <td className="num">{l.periodDebit ? `€${l.periodDebit.toFixed(2)}` : ""}</td>
              <td className="num">{l.periodCredit ? `€${l.periodCredit.toFixed(2)}` : ""}</td>
              <td className="num" style={{ fontWeight: 500 }}>€{(l.closingBalance ?? 0).toFixed(2)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td></td>
            <td><strong>Totals</strong></td>
            <td className="num"><strong>€{(data?.totalOpeningBalance ?? 0).toFixed(2)}</strong></td>
            <td className="num"><strong>€{(data?.totalPeriodDebit ?? 0).toFixed(2)}</strong></td>
            <td className="num"><strong>€{(data?.totalPeriodCredit ?? 0).toFixed(2)}</strong></td>
            <td className="num"><strong>€{(data?.totalClosingBalance ?? 0).toFixed(2)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
