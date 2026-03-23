import React, { useEffect, useMemo, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney } from "../utils/format";
import { AiInput } from "../components/AiInput";

type ContactSortKey = "name" | "type" | "registrationNumber" | "vatNumber" | "city" | "paymentTermsDays";
type SortDir = "asc" | "desc";

interface ContactForm {
  type: "customer" | "vendor" | "both";
  name: string;
  registrationNumber: string;
  vatNumber: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  postalCode: string;
  country: string;
  iban: string;
  swift: string;
  bankName: string;
  paymentTermsDays: string;
  notes: string;
}

const EMPTY_FORM: ContactForm = {
  type: "customer",
  name: "",
  registrationNumber: "",
  vatNumber: "",
  email: "",
  phone: "",
  addressLine1: "",
  city: "",
  postalCode: "",
  country: "Latvia",
  iban: "",
  swift: "",
  bankName: "",
  paymentTermsDays: "30",
  notes: "",
};

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
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Merge state
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<any>(null);

  // Register check state
  const [registerData, setRegisterData] = useState<any>(null);
  const [checkingRegister, setCheckingRegister] = useState(false);
  const [applyingRegister, setApplyingRegister] = useState(false);

  function loadContacts() {
    if (!companyId) return;
    api.contacts(companyId).then((data: any) => { setContacts(data); setLoading(false); }).catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    loadContacts();
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

  async function handleAiParse(text: string) {
    const fields = await api.parseContactDescription(companyId, text) as any;
    setForm({
      type: fields.type || "customer",
      name: fields.name || "",
      registrationNumber: fields.registrationNumber || "",
      vatNumber: fields.vatNumber || "",
      email: fields.email || "",
      phone: fields.phone || "",
      addressLine1: fields.address?.line1 || "",
      city: fields.address?.city || "",
      postalCode: fields.address?.postalCode || "",
      country: fields.address?.country || "Latvia",
      iban: fields.bankAccount?.iban || "",
      swift: fields.bankAccount?.swift || "",
      bankName: fields.bankAccount?.bankName || "",
      paymentTermsDays: String(fields.paymentTermsDays ?? 30),
      notes: fields.notes || "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !companyId) return;
    setSaving(true);
    try {
      await api.createContact(companyId, {
        type: form.type,
        name: form.name,
        registrationNumber: form.registrationNumber || undefined,
        vatNumber: form.vatNumber || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: {
          line1: form.addressLine1,
          city: form.city,
          postalCode: form.postalCode,
          country: form.country,
        },
        bankAccount: form.iban ? {
          iban: form.iban,
          swift: form.swift,
          bankName: form.bankName,
        } : undefined,
        paymentTermsDays: parseInt(form.paymentTermsDays) || 30,
        notes: form.notes || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      loadContacts();
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = filter ? contacts.filter((c) => c.type === filter || c.type === "both") : contacts;
    if (q) {
      list = list.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.shortName?.toLowerCase().includes(q) ||
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

      <div style={{ marginBottom: 16 }}>
        <AiInput
          placeholder="Describe the contact, e.g. 'Vendor SIA Apex, reg 40003112233, Riga, payment 45 days'"
          buttonLabel="✨ Fill fields"
          loadingLabel="Parsing..."
          onSubmit={handleAiParse}
        />
      </div>

      {showForm && (
        <div className="settings-card" style={{ marginBottom: 20, maxWidth: "100%" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div className="settings-field">
              <label>Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="settings-field">
              <label>Type</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value as ContactForm["type"] }))}
                className="settings-input"
              >
                <option value="customer">Customer</option>
                <option value="vendor">Vendor</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div className="settings-field">
              <label>Registration number</label>
              <input value={form.registrationNumber} onChange={e => setForm(f => ({ ...f, registrationNumber: e.target.value }))} />
            </div>
            <div className="settings-field">
              <label>VAT number</label>
              <input value={form.vatNumber} onChange={e => setForm(f => ({ ...f, vatNumber: e.target.value }))} placeholder="LV40003290084" />
            </div>
            <div className="settings-field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="settings-field">
              <label>Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="settings-field" style={{ gridColumn: "1 / -1" }}>
              <label>Street address</label>
              <input value={form.addressLine1} onChange={e => setForm(f => ({ ...f, addressLine1: e.target.value }))} />
            </div>
            <div className="settings-field">
              <label>City</label>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="settings-field">
              <label>Postal code</label>
              <input value={form.postalCode} onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))} />
            </div>
            <div className="settings-field">
              <label>Country</label>
              <input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
            </div>
            <div className="settings-field">
              <label>Payment terms (days)</label>
              <input type="number" value={form.paymentTermsDays} onChange={e => setForm(f => ({ ...f, paymentTermsDays: e.target.value }))} min={0} />
            </div>
            <div className="settings-field">
              <label>IBAN</label>
              <input value={form.iban} onChange={e => setForm(f => ({ ...f, iban: e.target.value }))} placeholder="LV00HABA0551000000000" />
            </div>
            <div className="settings-field">
              <label>SWIFT / BIC</label>
              <input value={form.swift} onChange={e => setForm(f => ({ ...f, swift: e.target.value }))} />
            </div>
            <div className="settings-field" style={{ gridColumn: "1 / -1" }}>
              <label>Bank name</label>
              <input value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
            </div>
            <div className="settings-field" style={{ gridColumn: "1 / -1" }}>
              <label>Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? "Saving..." : "Save contact"}
            </button>
            <button className="btn-secondary" onClick={() => { setForm(EMPTY_FORM); setShowForm(false); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
            <p>Use the text field above to describe a contact and add it.</p>
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
                <td style={{ fontWeight: 500 }}>{c.shortName || c.name}</td>
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
