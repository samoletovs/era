import React, { useEffect, useMemo, useState, useRef } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney } from "../utils/format";

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
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

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

  async function handleAiDescribe(text?: string) {
    const desc = text || aiPrompt;
    if (!desc.trim() || !companyId) return;
    setAiLoading(true);
    try {
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
    } catch (err: any) {
      alert(err.message || "Failed to parse description");
    } finally {
      setAiLoading(false);
    }
  }

  // ─── Voice Input ──────────────────────────────────────────

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setAiPrompt(transcript);
      setListening(false);
      handleAiDescribe(transcript);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
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
      setAiPrompt("");
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
            <label style={labelStyle}>Describe the item you want to add</label>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <input
                type="text"
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAiDescribe(); }}
                placeholder="e.g. Consulting service, €120/hour, for IT services"
                className="form-input"
                style={{ flex: 1 }}
                aria-label="Describe item"
              />
              <button
                className="btn-primary"
                onClick={() => handleAiDescribe()}
                disabled={aiLoading || !aiPrompt.trim()}
                style={{ whiteSpace: "nowrap" }}
              >
                {aiLoading ? "Thinking..." : "✨ Fill fields"}
              </button>
              <button
                className={listening ? "btn-primary" : "btn-secondary"}
                onClick={toggleVoice}
                title={listening ? "Stop listening" : "Voice input"}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                style={{
                  width: 40, minWidth: 40, padding: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                  ...(listening ? { animation: "pulse 1.5s ease-in-out infinite" } : {}),
                }}
              >
                🎙
              </button>
            </div>
            {listening && (
              <p style={{ fontSize: "var(--text-sm)", color: "var(--accent)", marginTop: 4, marginBottom: 0 }}>
                Listening... speak now
              </p>
            )}
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
            <button className="btn-secondary" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setAiPrompt(""); }}>
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
        <table className="data-table">
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
              <tr key={item.id}>
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
      )}
    </div>
  );
}
