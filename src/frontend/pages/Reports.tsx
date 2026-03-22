import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function Reports() {
  const { companyId } = useApp();
  const [view, setView] = useState<"pl" | "bs" | "tb" | "ar-aging" | "ap-aging" | "vat" | "annual" | "budget">("pl");
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
    else if (view === "tb") fetcher = api.trialBalance(companyId, dateFrom, dateTo);
    else if (view === "ar-aging") fetcher = api.arAging(companyId);
    else if (view === "ap-aging") fetcher = api.apAging(companyId);
    else if (view === "vat") { const d = new Date(dateTo); fetcher = api.vatDeclaration(companyId, d.getFullYear(), d.getMonth() + 1); }
    else if (view === "annual") fetcher = api.annualReport(companyId, parseInt(dateFrom.slice(0, 4)));
    else if (view === "budget") fetcher = api.budgetVsActual(companyId, parseInt(dateFrom.slice(0, 4)));
    else fetcher = Promise.resolve(null);
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
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button className={view === "pl" ? "btn-primary" : "btn-secondary"} onClick={() => setView("pl")}>Profit & loss</button>
        <button className={view === "bs" ? "btn-primary" : "btn-secondary"} onClick={() => setView("bs")}>Balance sheet</button>
        <button className={view === "tb" ? "btn-primary" : "btn-secondary"} onClick={() => setView("tb")}>Trial balance</button>
        <button className={view === "ar-aging" ? "btn-primary" : "btn-secondary"} onClick={() => setView("ar-aging")}>AR aging</button>
        <button className={view === "ap-aging" ? "btn-primary" : "btn-secondary"} onClick={() => setView("ap-aging")}>AP aging</button>
        <button className={view === "vat" ? "btn-primary" : "btn-secondary"} onClick={() => setView("vat")}>VAT declaration</button>
        <button className={view === "annual" ? "btn-primary" : "btn-secondary"} onClick={() => setView("annual")}>Annual report</button>
        <button className={view === "budget" ? "btn-primary" : "btn-secondary"} onClick={() => setView("budget")}>Budget vs actual</button>
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
      ) : view === "pl" ? <ProfitLoss data={data} />
        : view === "bs" ? <BalanceSheet data={data} />
        : view === "tb" ? <TrialBalance data={data} />
        : view === "ar-aging" || view === "ap-aging" ? <AgingReport data={data} />
        : view === "vat" ? <VatDeclaration data={data} />
        : view === "annual" ? <AnnualReport data={data} />
        : view === "budget" ? <BudgetVsActual data={data} />
        : null}
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

function AgingReport({ data }: { data: any }) {
  const buckets = data?.buckets || [];
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>{data?.type === "ar" ? "Accounts receivable" : "Accounts payable"} aging — {data?.date}</h3>
      <table className="data-table">
        <thead><tr><th>Contact</th><th style={{ textAlign: "right" }}>Current</th><th style={{ textAlign: "right" }}>1-30 days</th><th style={{ textAlign: "right" }}>31-60 days</th><th style={{ textAlign: "right" }}>90+ days</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
        <tbody>
          {buckets.map((b: any, i: number) => (
            <tr key={i}>
              <td style={{ fontWeight: 500 }}>{b.contactName}</td>
              <td className="num">{b.current ? `€${b.current.toFixed(2)}` : ""}</td>
              <td className="num">{b.days30 ? `€${b.days30.toFixed(2)}` : ""}</td>
              <td className="num">{b.days60 ? `€${b.days60.toFixed(2)}` : ""}</td>
              <td className="num" style={{ color: b.days90plus > 0 ? "#FF3B30" : undefined }}>{b.days90plus ? `€${b.days90plus.toFixed(2)}` : ""}</td>
              <td className="num" style={{ fontWeight: 500 }}>€{b.total.toFixed(2)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td><strong>Totals</strong></td>
            <td className="num"><strong>€{(data?.totalCurrent ?? 0).toFixed(2)}</strong></td>
            <td className="num"><strong>€{(data?.totalDays30 ?? 0).toFixed(2)}</strong></td>
            <td className="num"><strong>€{(data?.totalDays60 ?? 0).toFixed(2)}</strong></td>
            <td className="num"><strong>€{(data?.totalDays90plus ?? 0).toFixed(2)}</strong></td>
            <td className="num"><strong>€{(data?.grandTotal ?? 0).toFixed(2)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function VatDeclaration({ data }: { data: any }) {
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>PVN deklarācija — {data?.period}</h3>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: 16 }}>{data?.companyName} · {data?.vatNumber}</div>
      <table className="data-table">
        <thead><tr><th>Rate</th><th style={{ textAlign: "right" }}>Taxable amount</th><th style={{ textAlign: "right" }}>VAT</th></tr></thead>
        <tbody>
          <tr><td>Standard (21%)</td><td className="num">€{(data?.taxableStandard ?? 0).toFixed(2)}</td><td className="num">€{(data?.outputVatStandard ?? 0).toFixed(2)}</td></tr>
          <tr><td>Reduced (12%)</td><td className="num">€{(data?.taxableReduced ?? 0).toFixed(2)}</td><td className="num">€{(data?.outputVatReduced ?? 0).toFixed(2)}</td></tr>
          <tr><td>Super-reduced (5%)</td><td className="num">€{(data?.taxableSuperReduced ?? 0).toFixed(2)}</td><td className="num">€{(data?.outputVatSuperReduced ?? 0).toFixed(2)}</td></tr>
          <tr className="total-row"><td><strong>Total output VAT</strong></td><td></td><td className="num"><strong>€{(data?.totalOutputVat ?? 0).toFixed(2)}</strong></td></tr>
          <tr><td><strong>Total input VAT</strong></td><td></td><td className="num"><strong>€{(data?.totalInputVat ?? 0).toFixed(2)}</strong></td></tr>
        </tbody>
      </table>
      <div style={{ marginTop: 20, padding: "16px 0", borderTop: "2px solid #1C1C1C", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>VAT payable to VID</span>
        <span style={{ fontSize: 20, fontWeight: 600, color: (data?.vatPayable ?? 0) >= 0 ? "#FF3B30" : "#34C759" }}>€{(data?.vatPayable ?? 0).toFixed(2)}</span>
      </div>
    </div>
  );
}

function AnnualReport({ data }: { data: any }) {
  const lv = data?.profitAndLossLv || {};
  const bsLv = data?.balanceSheetLv || {};
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Annual financial statements — FY{data?.fiscalYear}</h3>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: 16 }}>{data?.companyName} · Reg. {data?.registrationNumber}</div>

      <div className="label">Balance sheet (Latvian format)</div>
      <table className="data-table" style={{ marginBottom: 20 }}>
        <tbody>
          <tr><td>Long-term assets</td><td className="num">€{(bsLv.longTermAssets ?? 0).toFixed(2)}</td></tr>
          <tr><td>Current assets</td><td className="num">€{(bsLv.currentAssets ?? 0).toFixed(2)}</td></tr>
          <tr className="total-row"><td><strong>Total assets</strong></td><td className="num"><strong>€{(bsLv.totalAssets ?? 0).toFixed(2)}</strong></td></tr>
          <tr><td>Equity</td><td className="num">€{(bsLv.equity ?? 0).toFixed(2)}</td></tr>
          <tr><td>Long-term liabilities</td><td className="num">€{(bsLv.longTermLiabilities ?? 0).toFixed(2)}</td></tr>
          <tr><td>Current liabilities</td><td className="num">€{(bsLv.currentLiabilities ?? 0).toFixed(2)}</td></tr>
          <tr className="total-row"><td><strong>Total equity + liabilities</strong></td><td className="num"><strong>€{(bsLv.totalEquityAndLiabilities ?? 0).toFixed(2)}</strong></td></tr>
        </tbody>
      </table>

      <div className="label">Profit & loss (Latvian format)</div>
      <table className="data-table">
        <tbody>
          <tr><td>Net turnover</td><td className="num">€{(lv.netTurnover ?? 0).toFixed(2)}</td></tr>
          <tr><td>Cost of goods sold</td><td className="num">€{(lv.costOfGoodsSold ?? 0).toFixed(2)}</td></tr>
          <tr className="total-row"><td><strong>Gross profit</strong></td><td className="num"><strong>€{(lv.grossProfit ?? 0).toFixed(2)}</strong></td></tr>
          <tr><td>Selling expenses</td><td className="num">€{(lv.sellingExpenses ?? 0).toFixed(2)}</td></tr>
          <tr><td>Administrative expenses</td><td className="num">€{(lv.administrativeExpenses ?? 0).toFixed(2)}</td></tr>
          <tr><td>Other income</td><td className="num">€{(lv.otherIncome ?? 0).toFixed(2)}</td></tr>
          <tr><td>Financial expenses</td><td className="num">€{(lv.financialExpenses ?? 0).toFixed(2)}</td></tr>
          <tr className="total-row"><td><strong>Profit before tax</strong></td><td className="num"><strong>€{(lv.profitBeforeTax ?? 0).toFixed(2)}</strong></td></tr>
          <tr><td>Corporate income tax</td><td className="num">€{(lv.corporateIncomeTax ?? 0).toFixed(2)}</td></tr>
        </tbody>
      </table>
      <div style={{ marginTop: 20, padding: "16px 0", borderTop: "2px solid #1C1C1C", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Net profit</span>
        <span style={{ fontSize: 20, fontWeight: 600, color: (lv.netProfit ?? 0) >= 0 ? "#34C759" : "#FF3B30" }}>€{(lv.netProfit ?? 0).toFixed(2)}</span>
      </div>
    </div>
  );
}

function BudgetVsActual({ data }: { data: any }) {
  const items = Array.isArray(data) ? data : [];
  return (
    <div className="metric-card">
      <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Budget vs actual</h3>
      {items.length === 0 ? <p style={{ color: "var(--text-tertiary)" }}>No budget data. Set budgets via the agent chat.</p> : (
        <table className="data-table">
          <thead><tr><th>Code</th><th>Account</th><th style={{ textAlign: "right" }}>Budget</th><th style={{ textAlign: "right" }}>Actual</th><th style={{ textAlign: "right" }}>Variance</th><th style={{ textAlign: "right" }}>%</th></tr></thead>
          <tbody>
            {items.map((i: any) => (
              <tr key={i.accountCode}>
                <td className="mono">{i.accountCode}</td>
                <td>{i.accountName}</td>
                <td className="num">€{i.budget.toFixed(2)}</td>
                <td className="num">€{i.actual.toFixed(2)}</td>
                <td className="num" style={{ color: i.variance >= 0 ? "#34C759" : "#FF3B30" }}>€{i.variance.toFixed(2)}</td>
                <td className="num">{i.variancePercent.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
