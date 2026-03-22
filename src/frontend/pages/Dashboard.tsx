import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney } from "../utils/format";

export function Dashboard() {
  const { companyId, companies, numberFormat: fmt } = useApp();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    if (!companyId) return;
    api.dashboard(companyId).then(setData).catch(() => {});
    api.companyHealth(companyId).then(setHealth).catch(() => {});
  }, [companyId]);

  if (!companyId) return (
    <div className="empty-state" style={{ marginTop: 80 }}>
      <div className="icon">🏢</div>
      <h3>Welcome to ERA</h3>
      <p style={{ maxWidth: 360, marginBottom: 20 }}>Search the Latvian Enterprise Register and set up your company in seconds.</p>
      <button className="btn-primary" onClick={() => navigate("/onboarding")}>Add your first company</button>
    </div>
  );

  return (
    <div>
      <h2 className="page-title">Dashboard</h2>
      <div className="dashboard-grid">
        <div className="metric-card">
          <div className="label">Cash position</div>
          <div className="value">{formatMoney(data?.cash, fmt)}</div>
          <div className="subtitle">Bank + cash accounts</div>
        </div>
        <div className="metric-card">
          <div className="label">Receivables</div>
          <div className="value">{formatMoney(data?.receivables, fmt)}</div>
          <div className="subtitle">Outstanding invoices</div>
        </div>
        <div className="metric-card">
          <div className="label">Payables</div>
          <div className="value">{formatMoney(data?.payables, fmt)}</div>
          <div className="subtitle">Bills to pay</div>
        </div>
        <div className="metric-card">
          <div className="label">VAT due</div>
          <div className="value">{formatMoney(data?.vatDue, fmt)}</div>
          <div className="subtitle">Current period</div>
        </div>
      </div>

      {health && (
        <div className="metric-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div className="label">Company checklist</div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary, #A0A0A0)", marginTop: 2 }}>
                {health.issues?.length > 0
                  ? `${health.issues.length} item${health.issues.length !== 1 ? "s" : ""} need attention`
                  : "Everything up to date"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 80, height: 6, borderRadius: 3, background: "#F0EFEE", overflow: "hidden" }}>
                <div style={{
                  width: `${health.score}%`,
                  height: "100%",
                  borderRadius: 3,
                  background: health.score >= 80 ? "#34C759" : health.score >= 50 ? "#FF9500" : "#FF3B30",
                  transition: "width 0.3s ease",
                }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary, #787878)" }}>
                {health.score}%
              </span>
            </div>
          </div>
          {health.issues?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {health.issues.map((issue: any, i: number) => (
                <div key={i} onClick={() => {
                  if (issue.agentCommand) navigate("/chat", { state: { prefill: issue.agentCommand } });
                }} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: issue.severity === "critical" ? "#FEF2F2" : issue.severity === "warning" ? "#FFFBEB" : "#F0F7FF",
                  border: `1px solid ${issue.severity === "critical" ? "#FEE2E2" : issue.severity === "warning" ? "#FEF3C7" : "#DBEAFE"}`,
                  cursor: issue.agentCommand ? "pointer" : "default",
                  transition: "opacity 0.15s",
                }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: issue.severity === "critical" ? "#FF3B30" : issue.severity === "warning" ? "#FF9500" : "#0A84FF",
                  }} />
                  <div style={{ flex: 1, fontSize: 13 }}>
                    <span style={{ color: "var(--text-body, #3C3C3C)" }}>{issue.message}</span>
                  </div>
                  {issue.action && (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--accent, #0A84FF)",
                      whiteSpace: "nowrap",
                    }}>
                      {issue.action} &rarr;
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px",
              borderRadius: 8,
              background: "#F0FBF4",
              border: "1px solid #D1FAE5",
              fontSize: 13,
              color: "#065F46",
            }}>
              <span>✓</span> All good, no issues detected
            </div>
          )}
        </div>
      )}

      {data?.recentInvoices?.length > 0 && (
        <div className="metric-card">
          <div className="label">Recent invoices</div>
          <table className="data-table" style={{ marginTop: 12 }}>
            <thead><tr><th>Number</th><th>Type</th><th>Contact</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {data.recentInvoices.map((inv: any, i: number) => (
                <tr key={i}>
                  <td className="mono">{inv.invoiceNumber}</td>
                  <td><span className="badge">{inv.type}</span></td>
                  <td>{inv.contactName}</td>
                  <td className="num">{formatMoney(inv.total, fmt)}</td>
                  <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
