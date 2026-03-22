import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function Dashboard() {
  const { companyId } = useApp();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!companyId) return;
    api.dashboard(companyId).then(setData).catch(() => {});
  }, [companyId]);

  if (!companyId) return (
    <div className="empty-state" style={{ marginTop: 80 }}>
      <div className="icon">🚀</div>
      <h3>Welcome to ERA</h3>
      <p>Go to Agent chat and say: "Create a company called SIA MyCompany with registration 40003123456 in Riga"</p>
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
