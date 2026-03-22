import React, { useEffect, useMemo, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney, formatMoneyOr } from "../utils/format";

type ContactSortKey = "name" | "type" | "registrationNumber" | "vatNumber" | "city" | "paymentTermsDays";
type SortDir = "asc" | "desc";

export function Contacts() {
  const { companyId, numberFormat: fmt } = useApp();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [txns, setTxns] = useState<any>(null);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [filter, setFilter] = useState<"" | "customer" | "vendor">("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<ContactSortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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

  function handleSort(key: ContactSortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = filter ? contacts.filter((c) => c.type === filter || c.type === "both") : contacts;
    if (q) {
      list = list.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.registrationNumber?.toLowerCase().includes(q) ||
        c.vatNumber?.toLowerCase().includes(q) ||
        c.address?.city?.toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      let av = sortKey === "city" ? (a.address?.city ?? "") : (a[sortKey] ?? "");
      let bv = sortKey === "city" ? (b.address?.city ?? "") : (b[sortKey] ?? "");
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [contacts, filter, search, sortKey, sortDir]);

  if (!companyId) return (
    <div className="empty-state"><div className="icon">🏢</div><h3>No company selected</h3></div>
  );

  // Detail view
  if (selected) {
    return (
      <div>
        <button className="btn-secondary" style={{ marginBottom: 16 }} onClick={() => setSelected(null)}>← Back to list</button>
        <h2 className="page-title">{selected.name}</h2>

        <div className="detail-layout">
          <div className="detail-sidebar">
            <div className="settings-card">
              <div className="onboarding-details">
                <div className="detail-row"><span className="detail-label">Type</span><span className="badge">{selected.type}</span></div>
                <div className="detail-row"><span className="detail-label">Reg. number</span><span className="mono">{selected.registrationNumber || "—"}</span></div>
                <div className="detail-row"><span className="detail-label">VAT number</span><span className="mono">{selected.vatNumber || "—"}</span></div>
                <div className="detail-row"><span className="detail-label">Email</span><span>{selected.email || "—"}</span></div>
                <div className="detail-row"><span className="detail-label">Phone</span><span>{selected.phone || "—"}</span></div>
                <div className="detail-row" style={{ alignItems: "flex-start" }}>
                  <span className="detail-label">Address</span>
                  <span style={{ textAlign: "right", lineHeight: 1.5 }}>
                    {selected.address?.line1 || selected.address?.city ? (
                      <>
                        {selected.address?.line1 && <span>{selected.address.line1}</span>}
                        {selected.address?.city && <><br />{[selected.address.city, selected.address.postalCode].filter(Boolean).join(", ")}</>}
                        {selected.address?.country && <><br />{selected.address.country}</>}
                      </>
                    ) : "—"}
                  </span>
                </div>
                <div className="detail-row"><span className="detail-label">Payment terms</span><span>{selected.paymentTermsDays} days</span></div>
              </div>
            </div>

            {txns && (
              <div className="settings-card" style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Balance</h3>
                <div className="onboarding-details">
                  <div className="detail-row"><span className="detail-label">Total invoiced</span><span>{formatMoney(txns.totalInvoiced, fmt)}</span></div>
                  <div className="detail-row"><span className="detail-label">Total paid</span><span>{formatMoney(txns.totalPaid, fmt)}</span></div>
                  <div className="detail-row" style={{ fontWeight: 600 }}>
                    <span className="detail-label">Balance</span>
                    <span style={{ color: txns.balance > 0 ? "#FF3B30" : "#34C759" }}>{formatMoney(txns.balance, fmt)}</span>
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
                            <td className="num">{formatMoney(inv.subtotal, fmt)}</td>
                            <td className="num">{formatMoney(inv.vatAmount, fmt)}</td>
                            <td className="num" style={{ fontWeight: 500 }}>{formatMoney(inv.total, fmt)}</td>
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
                            <td className="num" style={{ fontWeight: 500 }}>{formatMoney(p.amount, fmt)}</td>
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
      <div className="page-header-bar">
        <h2 className="page-title" style={{ marginBottom: 0 }}>Contacts</h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button className={!filter ? "btn-primary" : "btn-secondary"} onClick={() => setFilter("")}>All</button>
          <button className={filter === "vendor" ? "btn-primary" : "btn-secondary"} onClick={() => setFilter("vendor")}>Vendors</button>
          <button className={filter === "customer" ? "btn-primary" : "btn-secondary"} onClick={() => setFilter("customer")}>Customers</button>
        </div>
      </div>
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search contacts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="table-search-input"
          aria-label="Search contacts"
        />
        {(search || filter) && (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : filtered.length === 0 ? (
        contacts.length === 0 ? (
          <div className="empty-state">
            <div className="icon">👥</div>
            <h3>No contacts yet</h3>
            <p>Upload an invoice or use the agent chat to add contacts.</p>
          </div>
        ) : (
          <div className="empty-state">
            <div className="icon">🔍</div>
            <h3>No matching contacts</h3>
            <p>Try adjusting your search or filters.</p>
          </div>
        )
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              {([
                ["name", "Name"],
                ["type", "Type"],
                ["registrationNumber", "Reg. number"],
                ["vatNumber", "VAT number"],
                ["city", "City"],
                ["paymentTermsDays", "Payment terms"],
              ] as [ContactSortKey, string][]).map(([key, label]) => (
                <th
                  key={key}
                  className={`sortable-th ${sortKey === key ? "sorted" : ""}`}
                  onClick={() => handleSort(key)}
                  aria-sort={sortKey === key ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  {label}
                  {sortKey === key && (
                    <span className="sort-indicator">{sortDir === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </th>
              ))}
            </tr>
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
