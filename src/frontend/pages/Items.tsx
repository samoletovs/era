import React, { useEffect, useMemo, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney } from "../utils/format";
import { GlPostings } from "../components/GlPostings";
import { AiInput } from "../components/AiInput";

type ItemSortKey = "code" | "name" | "type" | "sellingPrice" | "vatRate" | "quantityOnHand";
type SortDir = "asc" | "desc";

interface ItemForm {
  name: string;
  description: string;
  type: "product" | "service";
  unitOfMeasure: string;
  costPrice: string;
  sellingPrice: string;
  vatRate: string;
  purchaseAccountCode: string;
  salesAccountCode: string;
}

const EMPTY_FORM: ItemForm = {
  name: "", description: "", type: "product", unitOfMeasure: "pcs",
  costPrice: "0", sellingPrice: "0", vatRate: "21",
  purchaseAccountCode: "6110", salesAccountCode: "5110",
};

export function Items() {
  const { companyId, numberFormat: fmt } = useApp();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<ItemSortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [typeFilter, setTypeFilter] = useState<string>("");

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Detail view
  const [selected, setSelected] = useState<any>(null);
  const [itemEntries, setItemEntries] = useState<any[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  useEffect(() => {
    if (!selected || !companyId) { setItemEntries([]); return; }
    setLoadingEntries(true);
    api.itemTransactions(companyId, selected.code)
      .then((res: any) => setItemEntries(Array.isArray(res) ? res : []))
      .catch(() => setItemEntries([]))
      .finally(() => setLoadingEntries(false));
  }, [selected, companyId]);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    loadItems();
  }, [companyId]);

  function loadItems() {
    setLoading(true);
    api.items(companyId).then((data: any) => { setItems(data); setLoading(false); }).catch(() => setLoading(false));
  }

  function handleSort(key: ItemSortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = items;
    if (q) {
      list = list.filter(item =>
        item.code?.toLowerCase().includes(q) ||
        item.name?.toLowerCase().includes(q)
      );
    }
    if (typeFilter) {
      list = list.filter(item => item.type === typeFilter);
    }
    list = [...list].sort((a, b) => {
      let av = a[sortKey] ?? "";
      let bv = b[sortKey] ?? "";
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
  }, [items, search, typeFilter, sortKey, sortDir]);

  // ─── AI Describe ──────────────────────────────────────────

  async function handleAiDescribe(desc: string) {
    if (!companyId) return;
    const fields = await api.parseItemDescription(companyId, desc) as any;
    setForm({
      name: fields.name || "",
      description: fields.description || "",
      type: fields.type || "product",
      unitOfMeasure: fields.unitOfMeasure || "pcs",
      costPrice: String(fields.costPrice ?? 0),
      sellingPrice: String(fields.sellingPrice ?? 0),
      vatRate: String(fields.vatRate ?? 21),
      purchaseAccountCode: fields.purchaseAccountCode || "6110",
      salesAccountCode: fields.salesAccountCode || "5110",
    });
  }

  // ─── Save Item ────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim() || !companyId) return;
    setSaving(true);
    try {
      await api.createItem(companyId, {
        code: "",
        name: form.name,
        description: form.description,
        type: form.type,
        unitOfMeasure: form.unitOfMeasure,
        costPrice: parseFloat(form.costPrice) || 0,
        sellingPrice: parseFloat(form.sellingPrice) || 0,
        vatRate: parseInt(form.vatRate) || 21,
        purchaseAccountCode: form.purchaseAccountCode,
        salesAccountCode: form.salesAccountCode,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      loadItems();
    } catch (err: any) {
      alert(err.message || "Failed to create item");
    } finally {
      setSaving(false);
    }
  }

  // ─── Label style ──────────────────────────────────────────

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)",
    textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4,
  };

  if (!companyId) return (
    <div className="empty-state">
      <div className="icon">🏢</div>
      <h3>No company selected</h3>
      <p>Use the agent chat to create a company first.</p>
    </div>
  );

  return (
    <div>
      <div className="coa-header">
        <h2 className="page-title">Items</h2>
        <button className="btn-primary" onClick={() => setShowForm(f => !f)}>
          {showForm ? "Cancel" : "+ Add item"}
        </button>
      </div>

      {/* ─── Add Item Form ────────────────────────────────── */}
      {showForm && (
        <div className="settings-card" style={{ marginBottom: 20 }}>
          {/* AI description bar */}
          <div style={{ marginBottom: 16 }}>
            <AiInput
              label="Describe the item you want to add"
              placeholder="e.g. Consulting service, €120/hour, for IT services"
              onSubmit={handleAiDescribe}
              disabled={!companyId}
            />
          </div>

          {/* Form fields */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={labelStyle}>Name</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="form-input" style={{ width: "100%" }} aria-label="Item name" />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={labelStyle}>Description</label>
              <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="form-input" style={{ width: "100%" }} aria-label="Item description" />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))} className="table-filter-select" aria-label="Item type">
                <option value="product">Product</option>
                <option value="service">Service</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Unit of measure</label>
              <input type="text" value={form.unitOfMeasure} onChange={e => setForm(f => ({ ...f, unitOfMeasure: e.target.value }))} className="form-input" style={{ width: "100%" }} aria-label="Unit of measure" />
            </div>
            <div>
              <label style={labelStyle}>Cost price (EUR)</label>
              <input type="number" step="0.01" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} className="form-input" style={{ width: "100%" }} aria-label="Cost price" />
            </div>
            <div>
              <label style={labelStyle}>Selling price (EUR)</label>
              <input type="number" step="0.01" value={form.sellingPrice} onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))} className="form-input" style={{ width: "100%" }} aria-label="Selling price" />
            </div>
            <div>
              <label style={labelStyle}>VAT rate (%)</label>
              <select value={form.vatRate} onChange={e => setForm(f => ({ ...f, vatRate: e.target.value }))} className="table-filter-select" aria-label="VAT rate">
                <option value="21">21% — standard</option>
                <option value="12">12% — reduced</option>
                <option value="5">5% — super-reduced</option>
                <option value="0">0% — exempt</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Purchase account</label>
              <input type="text" value={form.purchaseAccountCode} onChange={e => setForm(f => ({ ...f, purchaseAccountCode: e.target.value }))} className="form-input" style={{ width: "100%" }} aria-label="Purchase account code" />
            </div>
            <div>
              <label style={labelStyle}>Sales account</label>
              <input type="text" value={form.salesAccountCode} onChange={e => setForm(f => ({ ...f, salesAccountCode: e.target.value }))} className="form-input" style={{ width: "100%" }} aria-label="Sales account code" />
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? "Saving..." : "Save item"}
            </button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ─── Filter / Search ──────────────────────────────── */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="table-search-input"
          aria-label="Search items"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="table-filter-select"
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          <option value="service">Service</option>
          <option value="product">Product</option>
        </select>
        {(search || typeFilter) && (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
            {filteredItems.length} result{filteredItems.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? <p style={{ color: "var(--text-tertiary)" }}>Loading...</p> : filteredItems.length === 0 ? (
        items.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📦</div>
            <h3>No items yet</h3>
            <p>Click "+ Add item" to create your first item, or describe it with your voice.</p>
          </div>
        ) : (
          <div className="empty-state">
            <div className="icon">🔍</div>
            <h3>No matching items</h3>
            <p>Try adjusting your search or filters.</p>
          </div>
        )
      ) : (
        <>
        {/* Desktop table */}
        <table className="data-table desktop-only-table">
          <thead>
            <tr>
              {([
                ["code", "Code"],
                ["name", "Name"],
                ["type", "Type"],
                ["sellingPrice", "Price"],
                ["vatRate", "VAT"],
                ["quantityOnHand", "On hand"],
              ] as [ItemSortKey, string][]).map(([key, label]) => (
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
            {filteredItems.map((item: any) => (
              <tr key={item.id} onClick={() => setSelected(item)} style={{ cursor: "pointer" }}>
                <td className="mono">{item.code}</td>
                <td>{item.name}</td>
                <td><span className="badge">{item.type}</span></td>
                <td className="num">{formatMoney(item.sellingPrice, fmt)}</td>
                <td>{item.vatRate}%</td>
                <td className="num">{item.type === "service" ? "—" : item.quantityOnHand}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile card view */}
        <div className="mobile-card-list">
          {filteredItems.map((item: any) => (
            <div key={item.id} className="mobile-card" onClick={() => setSelected(item)}>
              <div className="mobile-card-header">
                <span className="mobile-card-title">{item.name}</span>
                <span className="mobile-card-amount">{formatMoney(item.sellingPrice, fmt)}</span>
              </div>
              <div className="mobile-card-meta">
                <span className="mono">{item.code}</span>
                <span className="badge">{item.type}</span>
                <span>{item.vatRate}%</span>
                {item.type !== "service" && <span>Qty: {item.quantityOnHand}</span>}
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {/* Item detail panel */}
      {selected && (
        <div className="settings-card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>{selected.name}</h3>
            <button className="btn-secondary" style={{ fontSize: "var(--text-sm)", padding: "2px 10px" }} onClick={() => setSelected(null)}>✕</button>
          </div>
          <div className="onboarding-details">
            <div className="detail-row"><span className="detail-label">Code</span><span className="mono">{selected.code}</span></div>
            <div className="detail-row"><span className="detail-label">Type</span><span className="badge">{selected.type}</span></div>
            {selected.description && <div className="detail-row"><span className="detail-label">Description</span><span>{selected.description}</span></div>}
            <div className="detail-row"><span className="detail-label">Unit</span><span>{selected.unitOfMeasure}</span></div>
            <div className="detail-row"><span className="detail-label">Cost price</span><span>{formatMoney(selected.costPrice, fmt)}</span></div>
            <div className="detail-row"><span className="detail-label">Selling price</span><span>{formatMoney(selected.sellingPrice, fmt)}</span></div>
            <div className="detail-row"><span className="detail-label">VAT rate</span><span>{selected.vatRate}%</span></div>
            {selected.type !== "service" && <div className="detail-row"><span className="detail-label">On hand</span><span>{selected.quantityOnHand}</span></div>}
          </div>
          <GlPostings entries={itemEntries} loading={loadingEntries} emptyMessage="No transactions for this item" formatMoney={formatMoney} fmt={fmt} />
        </div>
      )}
    </div>
  );
}
