import React, { useEffect, useMemo, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney } from "../utils/format";
import { GlPostings } from "../components/GlPostings";
import { AiInput } from "../components/AiInput";
import { UniversalGrid, type GridColumn } from "../components/UniversalGrid";

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
  name: "",
  description: "",
  type: "product",
  unitOfMeasure: "pcs",
  costPrice: "0",
  sellingPrice: "0",
  vatRate: "21",
  purchaseAccountCode: "6110",
  salesAccountCode: "5110",
};

export function Items() {
  const { companyId, numberFormat: fmt, toast } = useApp();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Detail view
  const [selected, setSelected] = useState<any>(null);
  const [itemEntries, setItemEntries] = useState<any[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"" | "product" | "service">("");

  useEffect(() => {
    if (!selected || !companyId) {
      setItemEntries([]);
      return;
    }
    setLoadingEntries(true);
    api
      .itemTransactions(companyId, selected.code)
      .then((res: any) => setItemEntries(Array.isArray(res) ? res : []))
      .catch(() => setItemEntries([]))
      .finally(() => setLoadingEntries(false));
  }, [selected, companyId]);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    loadItems();
  }, [companyId]);

  function loadItems() {
    setLoading(true);
    api
      .items(companyId)
      .then((data: any) => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  const itemColumns: GridColumn<any>[] = useMemo(
    () => [
      {
        id: "code",
        header: "Code",
        accessor: (item) => item.code || "",
        render: (item) => <span className="mono">{item.code}</span>,
      },
      {
        id: "name",
        header: "Name",
        accessor: (item) => item.name || "",
        render: (item) => <span style={{ fontWeight: 500 }}>{item.name}</span>,
      },
      {
        id: "type",
        header: "Type",
        accessor: (item) => item.type || "",
        render: (item) => <span className="badge">{item.type}</span>,
        hideOnMobile: true,
      },
      {
        id: "sellingPrice",
        header: "Price",
        accessor: (item) => Number(item.sellingPrice || 0),
        render: (item) => (
          <span className="num">{formatMoney(item.sellingPrice, fmt)}</span>
        ),
        align: "right",
      },
      {
        id: "vatRate",
        header: "VAT",
        accessor: (item) => Number(item.vatRate || 0),
        render: (item) => `${item.vatRate}%`,
        hideOnMobile: true,
      },
      {
        id: "quantityOnHand",
        header: "On hand",
        accessor: (item) =>
          item.type === "service" ? -1 : Number(item.quantityOnHand || 0),
        render: (item) => (
          <span className="num">
            {item.type === "service" ? "—" : item.quantityOnHand}
          </span>
        ),
        align: "right",
        hideOnMobile: true,
      },
    ],
    [fmt],
  );

  // ─── AI Describe ──────────────────────────────────────────

  async function handleAiDescribe(desc: string) {
    if (!companyId) return;
    const fields = (await api.parseItemDescription(companyId, desc)) as any;
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
      toast(err.message || "Failed to create item");
    } finally {
      setSaving(false);
    }
  }

  // ─── Label style ──────────────────────────────────────────

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.02em",
    marginBottom: 4,
  };

  if (!companyId)
    return (
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
        <button className="btn-primary" onClick={() => setShowForm((f) => !f)}>
          {showForm ? "Cancel" : "+ Add item"}
        </button>
      </div>

      {/* ─── Add Item Form ────────────────────────────────── */}
      {showForm && (
        <div className="settings-card" style={{ marginBottom: 20 }}>
          {/* AI description bar */}
          <div style={{ marginBottom: 16 }}>
            <AiInput
              placeholder="e.g. Consulting service, €120/hour, for IT services"
              onSubmit={handleAiDescribe}
              disabled={!companyId}
            />
          </div>

          {/* Form fields */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <div style={{ gridColumn: "span 2" }}>
              <label style={labelStyle}>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className="form-input"
                style={{ width: "100%" }}
                aria-label="Item name"
              />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={labelStyle}>Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                className="form-input"
                style={{ width: "100%" }}
                aria-label="Item description"
              />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value as any }))
                }
                className="table-filter-select"
                aria-label="Item type"
              >
                <option value="product">Product</option>
                <option value="service">Service</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Unit of measure</label>
              <input
                type="text"
                value={form.unitOfMeasure}
                onChange={(e) =>
                  setForm((f) => ({ ...f, unitOfMeasure: e.target.value }))
                }
                className="form-input"
                style={{ width: "100%" }}
                aria-label="Unit of measure"
              />
            </div>
            <div>
              <label style={labelStyle}>Cost price (EUR)</label>
              <input
                type="number"
                step="0.01"
                value={form.costPrice}
                onChange={(e) =>
                  setForm((f) => ({ ...f, costPrice: e.target.value }))
                }
                className="form-input"
                style={{ width: "100%" }}
                aria-label="Cost price"
              />
            </div>
            <div>
              <label style={labelStyle}>Selling price (EUR)</label>
              <input
                type="number"
                step="0.01"
                value={form.sellingPrice}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sellingPrice: e.target.value }))
                }
                className="form-input"
                style={{ width: "100%" }}
                aria-label="Selling price"
              />
            </div>
            <div>
              <label style={labelStyle}>VAT rate (%)</label>
              <select
                value={form.vatRate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vatRate: e.target.value }))
                }
                className="table-filter-select"
                aria-label="VAT rate"
              >
                <option value="21">21% — standard</option>
                <option value="12">12% — reduced</option>
                <option value="5">5% — super-reduced</option>
                <option value="0">0% — exempt</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Purchase account</label>
              <input
                type="text"
                value={form.purchaseAccountCode}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    purchaseAccountCode: e.target.value,
                  }))
                }
                className="form-input"
                style={{ width: "100%" }}
                aria-label="Purchase account code"
              />
            </div>
            <div>
              <label style={labelStyle}>Sales account</label>
              <input
                type="text"
                value={form.salesAccountCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, salesAccountCode: e.target.value }))
                }
                className="form-input"
                style={{ width: "100%" }}
                aria-label="Sales account code"
              />
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
            >
              {saving ? "Saving..." : "Save item"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-tertiary)" }}>Loading...</p>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📦</div>
          <h3>No items yet</h3>
          <p>
            Click "+ Add item" to create your first item, or describe it with
            your voice.
          </p>
        </div>
      ) : (
        <>
          <div className="coa-level-controls" style={{ marginBottom: 12 }}>
            <button
              className={`coa-level-btn ${!typeFilter ? "active" : ""}`}
              onClick={() => setTypeFilter("")}
            >
              All
            </button>
            <button
              className={`coa-level-btn ${typeFilter === "product" ? "active" : ""}`}
              onClick={() => setTypeFilter("product")}
            >
              Products
            </button>
            <button
              className={`coa-level-btn ${typeFilter === "service" ? "active" : ""}`}
              onClick={() => setTypeFilter("service")}
            >
              Services
            </button>
          </div>
          <UniversalGrid
            rows={
              typeFilter ? items.filter((i) => i.type === typeFilter) : items
            }
            columns={itemColumns}
            rowKey={(row) => String(row.id)}
            onRowClick={(item) => setSelected(item)}
            searchPlaceholder="Search items..."
            emptyMessage="No matching items. Try adjusting filters."
            initialSort={{ columnId: "code", direction: "asc" }}
          />
        </>
      )}

      {/* Item detail panel */}
      {selected && (
        <div className="settings-card" style={{ marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>{selected.name}</h3>
            <button
              className="btn-secondary"
              style={{ fontSize: "var(--text-sm)", padding: "2px 10px" }}
              onClick={() => setSelected(null)}
            >
              ✕
            </button>
          </div>
          <div className="onboarding-details">
            <div className="detail-row">
              <span className="detail-label">Code</span>
              <span className="mono">{selected.code}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Type</span>
              <span className="badge">{selected.type}</span>
            </div>
            {selected.description && (
              <div className="detail-row">
                <span className="detail-label">Description</span>
                <span>{selected.description}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">Unit</span>
              <span>{selected.unitOfMeasure}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Cost price</span>
              <span>{formatMoney(selected.costPrice, fmt)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Selling price</span>
              <span>{formatMoney(selected.sellingPrice, fmt)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">VAT rate</span>
              <span>{selected.vatRate}%</span>
            </div>
            {selected.type !== "service" && (
              <div className="detail-row">
                <span className="detail-label">On hand</span>
                <span>{selected.quantityOnHand}</span>
              </div>
            )}
          </div>
          <GlPostings
            entries={itemEntries}
            loading={loadingEntries}
            emptyMessage="No transactions for this item"
            formatMoney={formatMoney}
            fmt={fmt}
          />
        </div>
      )}
    </div>
  );
}
