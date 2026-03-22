import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function Accounting() {
  const { companyId } = useApp();
  const [health, setHealth] = useState<any>(null);

  // Month-end
  const [monthEndPeriod, setMonthEndPeriod] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const [monthEndResult, setMonthEndResult] = useState<any>(null);

  // Year-end
  const [yearEndYear, setYearEndYear] = useState(new Date().getFullYear() - 1);
  const [yearEndResult, setYearEndResult] = useState<any>(null);

  const [running, setRunning] = useState("");

  useEffect(() => {
    if (!companyId) return;
    api.companyHealth(companyId).then(setHealth).catch(() => {});
  }, [companyId]);

  async function handleMonthEnd() {
    setRunning("month");
    setMonthEndResult(null);
    try {
      const result = await api.runMonthEnd(companyId, monthEndPeriod);
      setMonthEndResult(result);
      api.companyHealth(companyId).then(setHealth).catch(() => {});
    } catch (e: any) { alert(e.message); }
    finally { setRunning(""); }
  }

  async function handleYearEnd() {
    if (!confirm(`Run year-end close for FY${yearEndYear}? This will close all periods and transfer P&L to retained earnings.`)) return;
    setRunning("year");
    setYearEndResult(null);
    try {
      const result = await api.runYearEnd(companyId, yearEndYear);
      setYearEndResult(result);
      api.companyHealth(companyId).then(setHealth).catch(() => {});
    } catch (e: any) { alert(e.message); }
    finally { setRunning(""); }
  }

  if (!companyId) return <div className="empty-state"><div className="icon">🏢</div><h3>No company selected</h3></div>;

  return (
    <div>
      <h2 className="page-title">Accounting</h2>

      {/* Health overview */}
      {health && (
        <div className="dashboard-grid" style={{ marginBottom: 24 }}>
          <div className="metric-card">
            <div className="label">Health score</div>
            <div className="value" style={{ color: health.score >= 80 ? "#34C759" : health.score >= 50 ? "#FF9500" : "#FF3B30" }}>{health.score}/100</div>
          </div>
          <div className="metric-card">
            <div className="label">Issues</div>
            <div className="value">{health.issues?.length || 0}</div>
            <div className="subtitle">{health.issues?.filter((i: any) => i.severity === "critical").length || 0} critical</div>
          </div>
        </div>
      )}

      {/* Issues list */}
      {health?.issues?.length > 0 && (
        <div className="metric-card" style={{ marginBottom: 24 }}>
          <div className="label">Issues requiring attention</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {health.issues.map((issue: any, i: number) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid #F0F0F0" }}>
                <span style={{ flexShrink: 0, fontSize: 16 }}>{issue.severity === "critical" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵"}</span>
                <div>
                  <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{issue.message}</div>
                  <div style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)", marginTop: 2 }}>{issue.area}{issue.action ? ` — ${issue.action}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Month-end close */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="metric-card">
          <div className="label" style={{ marginBottom: 16 }}>Month-end close</div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: 16 }}>
            Marks overdue invoices, executes recurring entries, runs depreciation, and closes the period.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div>
              <div className="detail-label">Period</div>
              <input type="month" value={monthEndPeriod} onChange={(e) => setMonthEndPeriod(e.target.value)} style={{ height: 38, padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }} />
            </div>
            <button className="btn-primary" onClick={handleMonthEnd} disabled={running === "month"}>
              {running === "month" ? "Running..." : "Run month-end"}
            </button>
          </div>

          {monthEndResult && (
            <div style={{ marginTop: 16, padding: 14, background: "var(--bg-page)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>Completed — {monthEndResult.period}</div>
              {monthEndResult.steps?.map((s: any, i: number) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: "var(--text-sm)", padding: "3px 0" }}>
                  <span style={{ color: s.status === "completed" ? "#34C759" : s.status === "failed" ? "#FF3B30" : "var(--text-tertiary)" }}>
                    {s.status === "completed" ? "✓" : s.status === "failed" ? "✗" : "—"}
                  </span>
                  <span style={{ color: "var(--text-body)" }}>{s.name}</span>
                  <span style={{ color: "var(--text-tertiary)", marginLeft: "auto" }}>{s.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="metric-card">
          <div className="label" style={{ marginBottom: 16 }}>Year-end close</div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: 16 }}>
            Closes all 12 periods, posts the closing journal entry, and transfers P&L to retained earnings.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div>
              <div className="detail-label">Fiscal year</div>
              <input type="number" value={yearEndYear} onChange={(e) => setYearEndYear(Number(e.target.value))} style={{ height: 38, width: 100, padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }} />
            </div>
            <button className="btn-secondary" onClick={handleYearEnd} disabled={running === "year"}>
              {running === "year" ? "Running..." : "Run year-end close"}
            </button>
          </div>

          {yearEndResult && (
            <div style={{ marginTop: 16, padding: 14, background: "var(--bg-page)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>FY{yearEndResult.fiscalYear} closed</div>
              {yearEndResult.netResult != null && (
                <div style={{ fontSize: "var(--text-sm)" }}>
                  Net result: <strong style={{ color: yearEndResult.netResult >= 0 ? "#34C759" : "#FF3B30" }}>€{yearEndResult.netResult?.toFixed(2)}</strong> transferred to retained earnings
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
