import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function Invoices() {
  const { companyId } = useApp();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [postings, setPostings] = useState<any[]>([]);
  const [loadingPostings, setLoadingPostings] = useState(false);
  const [filter, setFilter] = useState<"" | "sales" | "purchase">("");

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    api.invoices(companyId, filter || undefined).then((data: any) => { setInvoices(data); setLoading(false); }).catch(() => setLoading(false));
  }, [companyId, filter]);

  async function handleSelect(inv: any) {
    setSelected(inv);
    setLoadingPostings(true);
    try {
      const p = await api.invoicePostings(companyId, inv.id);
      setPostings(p as any[]);
    } catch { setPostings([]); }
    setLoadingPostings(false);
  }

  async function handlePost(inv: any) {
    try {
      await api.postInvoice(companyId, inv.id);
      // Refresh
      const data = await api.invoices(companyId, filter || undefined);
      setInvoices(data as any[]);
      if (selected?.id === inv.id) handleSelect(inv);
    } catch (e: any) { console.error(e.message); }
  }

  async function handleCancel(inv: any) {
    if (!confirm(`Cancel invoice ${inv.invoiceNumber}? This will reverse the GL entries.`)) return;
    try {
      await api.cancelInvoice(companyId, inv.id, "Cancelled by user");
      const data = await api.invoices(companyId, filter || undefined);
      setInvoices(data as any[]);
      setSelected(null);
    } catch (e: any) { console.error(e.message); }
  }

  async function handleCreditNote(inv: any) {
    const reason = prompt(`Reason for credit note on ${inv.invoiceNumber}?`);
    if (!reason) return;
    try {
      await api.createCreditNote(companyId, inv.id, reason);
      const data = await api.invoices(companyId, filter || undefined);
      setInvoices(data as any[]);
      setSelected(null);
    } catch (e: any) { alert(e.message); }
  }

  if (!companyId) return <NoCompany />;

  // Detail view
  if (selected) {
    return (
      <div>
        <button className="btn-secondary" style={{ marginBottom: 16 }} onClick={() => setSelected(null)}>← Back to list</button>
        <h2 className="page-title">Invoice {selected.invoiceNumber}</h2>

        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div className="settings-card">
              <div className="onboarding-details">
                <div className="detail-row"><span className="detail-label">ERA number</span><span className="mono">{selected.invoiceNumber}</span></div>
                {selected.vendorInvoiceNumber && (
                  <div className="detail-row"><span className="detail-label">Vendor invoice #</span><span className="mono">{selected.vendorInvoiceNumber}</span></div>
                )}
                <div className="detail-row"><span className="detail-label">Type</span><span className="badge">{selected.type}</span></div>
                <div className="detail-row"><span className="detail-label">Contact</span><span>{selected.contactName}</span></div>
                <div className="detail-row"><span className="detail-label">Date</span><span>{selected.date}</span></div>
                <div className="detail-row"><span className="detail-label">Due date</span><span>{selected.dueDate}</span></div>
                <div className="detail-row"><span className="detail-label">Subtotal</span><span>€{selected.subtotal?.toFixed(2)}</span></div>
                <div className="detail-row"><span className="detail-label">VAT</span><span>€{selected.vatAmount?.toFixed(2)}</span></div>
                <div className="detail-row" style={{ fontWeight: 600 }}><span className="detail-label">Total</span><span>€{selected.total?.toFixed(2)}</span></div>
                <div className="detail-row"><span className="detail-label">Paid</span><span>€{selected.amountPaid?.toFixed(2)}</span></div>
                <div className="detail-row"><span className="detail-label">Status</span><span className={`badge badge-${selected.status}`}>{selected.status}</span></div>
                {selected.recognitionConfidence && (
                  <div className="detail-row"><span className="detail-label">AI confidence</span><span className={`badge badge-${selected.recognitionConfidence === "high" ? "paid" : "posted"}`}>{selected.recognitionConfidence}</span></div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                {selected.status === "draft" && (
                  <button className="btn-primary" onClick={() => handlePost(selected)}>Post to ledger</button>
                )}
                {selected.status !== "cancelled" && selected.status !== "draft" && (
                  <button className="btn-secondary" onClick={() => handleCreditNote(selected)}>Credit note</button>
                )}
                <a href={api.invoicePdfUrl(companyId, selected.id)} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                  PDF ↓
                </a>
                {selected.status !== "cancelled" && (
                  <button className="btn-secondary" style={{ color: "#FF3B30" }} onClick={() => handleCancel(selected)}>Cancel invoice</button>
                )}
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            {selected.lines?.length > 0 && (
              <div className="settings-card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Line items</h3>
                <table className="data-table">
                  <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>VAT</th><th>Total</th></tr></thead>
                  <tbody>
                    {selected.lines.map((l: any, i: number) => (
                      <tr key={i}>
                        <td>{l.description}</td>
                        <td className="num">{l.quantity}</td>
                        <td className="num">€{l.unitPrice?.toFixed(2)}</td>
                        <td>{l.vatRate}%</td>
                        <td className="num">€{l.lineTotal?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="settings-card" style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>GL postings</h3>
              {loadingPostings ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : postings.length === 0 ? (
                <p style={{ color: "#A0A0A0", fontSize: 13 }}>No GL entries (invoice not yet posted)</p>
              ) : (
                postings.map((entry: any, ei: number) => (
                  <div key={ei} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "#787878", marginBottom: 6 }}>
                      <span className="mono">{entry.entryNumber}</span> · {entry.date} · {entry.description}
                      {entry.status === "reversed" && <span className="badge badge-cancelled" style={{ marginLeft: 8 }}>reversed</span>}
                    </div>
                    <table className="data-table">
                      <thead><tr><th>Account</th><th>Name</th><th>Debit</th><th>Credit</th></tr></thead>
                      <tbody>
                        {entry.lines?.map((l: any, li: number) => (
                          <tr key={li}>
                            <td className="mono">{l.accountCode}</td>
                            <td>{l.accountName}</td>
                            <td className="num">{l.debit ? `€${l.debit.toFixed(2)}` : ""}</td>
                            <td className="num">{l.credit ? `€${l.credit.toFixed(2)}` : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 className="page-title" style={{ marginBottom: 0 }}>Invoices</h2>
        <div className="coa-level-controls">
          <button className={`coa-level-btn ${!filter ? "active" : ""}`} onClick={() => setFilter("")}>All</button>
          <button className={`coa-level-btn ${filter === "purchase" ? "active" : ""}`} onClick={() => setFilter("purchase")}>Purchase</button>
          <button className={`coa-level-btn ${filter === "sales" ? "active" : ""}`} onClick={() => setFilter("sales")}>Sales</button>
        </div>
      </div>
      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : invoices.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📄</div>
          <h3>No invoices yet</h3>
          <p>Upload a supplier invoice or use the agent chat to create one.</p>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Number</th><th>Vendor inv #</th><th>Type</th><th>Contact</th><th>Date</th><th>Net</th><th>VAT</th><th>Total</th><th>Status</th></tr>
          </thead>
          <tbody>
            {invoices.map((inv: any) => (
              <tr key={inv.id} onClick={() => handleSelect(inv)} style={{ cursor: "pointer" }}>
                <td className="mono">{inv.invoiceNumber}</td>
                <td className="mono" style={{ color: "#787878" }}>{inv.vendorInvoiceNumber || "—"}</td>
                <td><span className="badge">{inv.type}</span></td>
                <td>{inv.contactName}</td>
                <td>{inv.date}</td>
                <td className="num">€{inv.subtotal?.toFixed(2)}</td>
                <td className="num">€{inv.vatAmount?.toFixed(2)}</td>
                <td className="num" style={{ fontWeight: 500 }}>€{inv.total?.toFixed(2)}</td>
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
