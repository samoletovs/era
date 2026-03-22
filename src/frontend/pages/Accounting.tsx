import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney, formatMoneyOr } from "../utils/format";
import type { PeriodCloseRun, PeriodCloseStep, NumberFormat } from "@shared/types";

export function Accounting() {
  const { companyId, numberFormat: fmt } = useApp();
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

  // Close run history
  const [closeRuns, setCloseRuns] = useState<PeriodCloseRun[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    api.companyHealth(companyId).then(setHealth).catch(() => {});
    api.closeRuns(companyId).then(setCloseRuns).catch(() => {});
  }, [companyId]);

  async function handleMonthEnd() {
    setRunning("month");
    setMonthEndResult(null);
    try {
      const result = await api.runMonthEnd(companyId, monthEndPeriod);
      setMonthEndResult(result);
      api.companyHealth(companyId).then(setHealth).catch(() => {});
      api.closeRuns(companyId).then(setCloseRuns).catch(() => {});
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
      api.closeRuns(companyId).then(setCloseRuns).catch(() => {});
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
      <div className="accounting-grid">
        <div className="metric-card">
          <div className="label" style={{ marginBottom: 16 }}>Month-end close</div>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: 16 }}>
            Marks overdue invoices, executes recurring entries, runs depreciation, and closes the period.
          </p>
          <div className="form-inline-row">
            <div>
              <div className="detail-label">Period</div>
              <input type="month" value={monthEndPeriod} onChange={(e) => setMonthEndPeriod(e.target.value)} className="form-input" />
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
          <div className="form-inline-row">
            <div>
              <div className="detail-label">Fiscal year</div>
              <input type="number" value={yearEndYear} onChange={(e) => setYearEndYear(Number(e.target.value))} className="form-input" />
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
                  Net result: <strong style={{ color: yearEndResult.netResult >= 0 ? "#34C759" : "#FF3B30" }}>{formatMoney(yearEndResult.netResult, fmt)}</strong> transferred to retained earnings
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Close run history */}
      <div style={{ marginTop: 32 }}>
        <h3 className="section-title">Close run history</h3>
        {closeRuns.length === 0 ? (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)", marginTop: 8 }}>No close runs yet</p>
        ) : (
          <table className="data-table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>Type</th>
                <th>Period / year</th>
                <th>Status</th>
                <th>Steps</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {closeRuns.map((run) => (
                <React.Fragment key={run.id}>
                  <tr
                    onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>
                      {expandedRunId === run.id ? "▾" : "▸"}
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      {run.type === "month-end" ? "Month-end" : "Year-end"}
                    </td>
                    <td className="mono">{run.period || `FY${run.fiscalYear}`}</td>
                    <td>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: "var(--text-xs)",
                        fontWeight: 500,
                        background: run.status === "completed" ? "#E8F5E9" : run.status === "partial" ? "#FFF3E0" : "#FFEBEE",
                        color: run.status === "completed" ? "#2E7D32" : run.status === "partial" ? "#E65100" : "#C62828",
                      }}>
                        {run.status}
                      </span>
                    </td>
                    <td>
                      {run.steps.filter(s => s.status === "completed").length}/{run.steps.length} completed
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
                      {new Date(run.completedAt).toLocaleDateString()} {new Date(run.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                  {expandedRunId === run.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <CloseRunDetail run={run} fmt={fmt} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CloseRunDetail({ run, fmt }: { run: PeriodCloseRun; fmt: NumberFormat | undefined }) {
  return (
    <div style={{ padding: "12px 16px 16px 40px", background: "var(--bg-subtle)", borderBottom: "1px solid var(--border)" }}>
      {run.type === "year-end" && run.netResult != null && (
        <div style={{ marginBottom: 12, fontSize: "var(--text-sm)" }}>
          Net result: <strong style={{ color: run.netResult >= 0 ? "#34C759" : "#FF3B30" }}>{formatMoney(run.netResult, fmt)}</strong> transferred to retained earnings
          {run.closingEntryId && (
            <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>
              (Entry: <span className="mono">{run.closingEntryId.slice(0, 8)}…</span>)
            </span>
          )}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {run.steps.map((step, i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontSize: "var(--text-sm)", padding: "4px 0", borderBottom: "1px solid #F0F0F0", alignItems: "center" }}>
            <span style={{ flexShrink: 0, color: step.status === "completed" ? "#34C759" : step.status === "failed" ? "#FF3B30" : "var(--text-tertiary)" }}>
              {step.status === "completed" ? "✓" : step.status === "failed" ? "✗" : "—"}
            </span>
            <span style={{ fontWeight: 500, color: "var(--text-body)", minWidth: 180 }}>{step.name}</span>
            <span style={{ color: "var(--text-secondary)" }}>{step.detail}</span>
            {step.journalEntryIds && step.journalEntryIds.length > 0 && (
              <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: "var(--text-xs)" }}>
                {step.journalEntryIds.length} journal {step.journalEntryIds.length === 1 ? "entry" : "entries"}
              </span>
            )}
            {step.error && (
              <span style={{ marginLeft: "auto", color: "#FF3B30", fontSize: "var(--text-xs)" }} title={step.error}>
                Error
              </span>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
        Started by {run.startedBy} at {new Date(run.startedAt).toLocaleString()}
      </div>
    </div>
  );
}
