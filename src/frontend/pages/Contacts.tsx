import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function Contacts() {
  const { companyId } = useApp();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [txns, setTxns] = useState<any>(null);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [filter, setFilter] = useState<"" | "customer" | "vendor">("");

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    api.contacts(companyId).then((data: any) => { setContacts(data); setLoading(false); }).catch(() => setLoading(false));
  }, [companyId]);

  async function handleSelect(c: any) {
    setSelected(c);
    setLoadingTxns(true);
    try {
      const data = await api.contactTransactions(companyId, c.id);
      setTxns(data);
    } catch { setTxns(null); }
    setLoadingTxns(false);
  }

  const filtered = filter ? contacts.filter((c) => c.type === filter || c.type === "both") : contacts;

  if (!companyId) return (
    <div className="empty-state"><div className="icon">🏢</div><h3>No company selected</h3></div>
  );

  // Detail view
  if (selected) {
    return (
      <div>
        <button className="btn-secondary" style={{ marginBottom: 16 }} onClick={() => setSelected(null)}>← Back to list</button>
        <h2 className="page-title">{selected.name}</h2>

        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ width: 340, flexShrink: 0 }}>
            <div className="settings-card">
              <div className="onboarding-details">
                <div className="detail-row"><span className="detail-label">Type</span><span className="badge">{selected.type}</span></div>
                <div className="detail-row"><span className="detail-label">Reg. number</span><span className="mono">{selected.registrationNumber || "—"}</span></div>
                <div className="detail-row"><span className="detail-label">VAT number</span><span className="mono">{selected.vatNumber || "—"}</span></div>
                <div className="detail-row"><span className="detail-label">Email</span><span>{selected.email || "—"}</span></div>
                <div className="detail-row"><span className="detail-label">Phone</span><span>{selected.phone || "—"}</span></div>
                <div className="detail-row"><span className="detail-label">Address</span><span>{selected.address?.line1 || "—"}</span></div>
                <div className="detail-row"><span className="detail-label">City</span><span>{selected.address?.city || "—"}</span></div>
                <div className="detail-row"><span className="detail-label">Payment terms</span><span>{selected.paymentTermsDays} days</span></div>
              </div>
            </div>

            {txns && (
              <div className="settings-card" style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Balance</h3>
                <div className="onboarding-details">
                  <div className="detail-row"><span className="detail-label">Total invoiced</span><span>€{txns.totalInvoiced?.toFixed(2)}</span></div>
                  <div className="detail-row"><span className="detail-label">Total paid</span><span>€{txns.totalPaid?.toFixed(2)}</span></div>
                  <div className="detail-row" style={{ fontWeight: 600 }}>
                    <span className="detail-label">Balance</span>
                    <span style={{ color: txns.balance > 0 ? "#FF3B30" : "#34C759" }}>€{txns.balance?.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }}>
            {loadingTxns ? <p style={{ color: "#A0A0A0" }}>Loading transactions...</p> : txns && (
              <>
                <div className="settings-card">
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                    Invoices ({txns.invoices?.length || 0})
                  </h3>
                  {txns.invoices?.length > 0 ? (
                    <table className="data-table">
                      <thead><tr><th>Number</th><th>Date</th><th>Net</th><th>VAT</th><th>Total</th><th>Status</th></tr></thead>
                      <tbody>
                        {txns.invoices.map((inv: any) => (
                          <tr key={inv.id}>
                            <td className="mono">{inv.invoiceNumber}</td>
                            <td>{inv.date}</td>
                            <td className="num">€{inv.subtotal?.toFixed(2)}</td>
                            <td className="num">€{inv.vatAmount?.toFixed(2)}</td>
                            <td className="num" style={{ fontWeight: 500 }}>€{inv.total?.toFixed(2)}</td>
                            <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ color: "#A0A0A0", fontSize: 13 }}>No invoices</p>
                  )}
                </div>

                <div className="settings-card" style={{ marginTop: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                    Payments ({txns.payments?.length || 0})
                  </h3>
                  {txns.payments?.length > 0 ? (
                    <table className="data-table">
                      <thead><tr><th>Date</th><th>Reference</th><th>Amount</th><th>Type</th></tr></thead>
                      <tbody>
                        {txns.payments.map((p: any) => (
                          <tr key={p.id}>
                            <td>{p.date}</td>
                            <td>{p.reference}</td>
                            <td className="num" style={{ fontWeight: 500 }}>€{p.amount?.toFixed(2)}</td>
                            <td><span className="badge">{p.type}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p style={{ color: "#A0A0A0", fontSize: 13 }}>No payments</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 className="page-title" style={{ marginBottom: 0 }}>Contacts</h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={!filter ? "btn-primary" : "btn-secondary"} onClick={() => setFilter("")}>All</button>
          <button className={filter === "vendor" ? "btn-primary" : "btn-secondary"} onClick={() => setFilter("vendor")}>Vendors</button>
          <button className={filter === "customer" ? "btn-primary" : "btn-secondary"} onClick={() => setFilter("customer")}>Customers</button>
        </div>
      </div>
      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">👥</div>
          <h3>No contacts yet</h3>
          <p>Upload an invoice or use the agent chat to add contacts.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Reg. number</th><th>VAT number</th><th>City</th><th>Payment terms</th></tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => (
              <tr key={c.id} onClick={() => handleSelect(c)} style={{ cursor: "pointer" }}>
                <td style={{ fontWeight: 500 }}>{c.name}</td>
                <td><span className="badge">{c.type}</span></td>
                <td className="mono">{c.registrationNumber || "—"}</td>
                <td className="mono">{c.vatNumber || "—"}</td>
                <td>{c.address?.city || "—"}</td>
                <td>{c.paymentTermsDays} days</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
