import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function Dashboard() {
  const { companyId, companies } = useApp();
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
          <div className="value">€{(data?.cash ?? 0).toFixed(2)}</div>
          <div className="subtitle">Bank + cash accounts</div>
        </div>
        <div className="metric-card">
          <div className="label">Receivables</div>
          <div className="value">€{(data?.receivables ?? 0).toFixed(2)}</div>
          <div className="subtitle">Outstanding invoices</div>
        </div>
        <div className="metric-card">
          <div className="label">Payables</div>
          <div className="value">€{(data?.payables ?? 0).toFixed(2)}</div>
          <div className="subtitle">Bills to pay</div>
        </div>
        <div className="metric-card">
          <div className="label">VAT due</div>
          <div className="value">€{(data?.vatDue ?? 0).toFixed(2)}</div>
          <div className="subtitle">Current period</div>
        </div>
      </div>

      {health && (
        <div className="metric-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="label">Company health</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: health.score >= 80 ? "#34C759" : health.score >= 50 ? "#FF9500" : "#FF3B30" }}>
              {health.score}/100
            </div>
          </div>
          {health.issues?.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {health.issues.map((issue: any, i: number) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "var(--text-sm)" }}>
                  <span style={{ flexShrink: 0 }}>{issue.severity === "critical" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵"}</span>
                  <div>
                    <span style={{ color: "var(--text-body)" }}>{issue.message}</span>
                    {issue.action && <span style={{ color: "var(--text-tertiary)", marginLeft: 4 }}>— {issue.action}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#34C759", fontSize: "var(--text-sm)" }}>All good — no issues detected.</p>
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
                  <td className="num">€{inv.total.toFixed(2)}</td>
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
