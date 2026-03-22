import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function Invoices() {
  const { companyId } = useApp();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    api.invoices(companyId).then((data: any) => { setInvoices(data); setLoading(false); }).catch(() => setLoading(false));
  }, [companyId]);

  if (!companyId) return <NoCompany />;

  return (
    <div>
      <h2 className="page-title">Invoices</h2>
      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : invoices.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📄</div>
          <h3>No invoices yet</h3>
          <p>Use the agent chat: "Create a sales invoice for SIA Acme, consulting 10h at €80"</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Number</th><th>Type</th><th>Contact</th><th>Date</th><th>Total</th><th>Status</th></tr>
          </thead>
          <tbody>
            {invoices.map((inv: any) => (
              <tr key={inv.id}>
                <td className="mono">{inv.invoiceNumber}</td>
                <td><span className="badge">{inv.type}</span></td>
                <td>{inv.contactName}</td>
                <td>{inv.date}</td>
                <td className="num">€{inv.total.toFixed(2)}</td>
                <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
              </tr>
            ))}
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
      <p>Use the agent chat to create a company first.</p>
    </div>
  );
}
