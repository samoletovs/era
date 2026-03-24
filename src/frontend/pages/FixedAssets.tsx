import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney } from "../utils/format";
import { GlPostings } from "../components/GlPostings";
import { AiInput } from "../components/AiInput";
import { UniversalGrid, type GridColumn } from "../components/UniversalGrid";
import { EmptyState } from "../components/PageControls";

export function FixedAssets() {
  const { companyId, numberFormat: fmt } = useApp();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    assetAccountCode: "1220",
    acquisitionDate: new Date().toISOString().slice(0, 10),
    acquisitionCost: "",
    residualValue: "0",
    usefulLifeMonths: "60",
  });
  const [depPeriod, setDepPeriod] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [depResult, setDepResult] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [glEntries, setGlEntries] = useState<any[]>([]);
  const [loadingGl, setLoadingGl] = useState(false);
  const [disposeTarget, setDisposeTarget] = useState<any>(null);
  const [disposeAmount, setDisposeAmount] = useState("0");
  const [disposing, setDisposing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "disposed">(
    "",
  );

  useEffect(() => {
    if (!companyId) return;
    loadAssets();
  }, [companyId]);

  function loadAssets() {
    setLoading(true);
    api
      .fixedAssets(companyId)
      .then((d: any) => setAssets(d as any[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleAiDescribe(desc: string) {
    if (!companyId) return;
    const fields = (await api.parseAssetDescription(companyId, desc)) as any;
    setForm({
      code: fields.code || "",
      name: fields.name || "",
      assetAccountCode: fields.assetAccountCode || "1220",
      acquisitionDate:
        fields.acquisitionDate || new Date().toISOString().slice(0, 10),
      acquisitionCost: String(fields.acquisitionCost ?? ""),
      residualValue: String(fields.residualValue ?? "0"),
      usefulLifeMonths: String(fields.usefulLifeMonths ?? "60"),
    });
  }

  // Period filter: show assets acquired in/before the selected period
  const filteredByPeriod = (
    depPeriod
      ? assets.filter((a) => a.acquisitionDate <= depPeriod + "-31")
      : assets
  ).filter((a) => !statusFilter || a.status === statusFilter);

  async function handleSelect(asset: any) {
    setSelected(asset);
    setLoadingGl(true);
    try {
      const entries = await api.assetTransactions(companyId, asset.id);
      setGlEntries(entries as any[]);
    } catch {
      setGlEntries([]);
    }
    setLoadingGl(false);
  }

  async function handleAcquire() {
    if (!form.code || !form.name || !form.acquisitionCost) return;
    setError(null);
    setSaving(true);
    try {
      await api.acquireAsset(companyId, {
        code: form.code,
        name: form.name,
        assetAccountCode: form.assetAccountCode,
        depreciationAccountCode: "1240",
        expenseAccountCode: "6380",
        acquisitionDate: form.acquisitionDate,
        acquisitionCost: parseFloat(form.acquisitionCost),
        residualValue: parseFloat(form.residualValue || "0"),
        usefulLifeMonths: parseInt(form.usefulLifeMonths),
      });
      setShowForm(false);
      setForm({
        code: "",
        name: "",
        assetAccountCode: "1220",
        acquisitionDate: new Date().toISOString().slice(0, 10),
        acquisitionCost: "",
        residualValue: "0",
        usefulLifeMonths: "60",
      });
      loadAssets();
    } catch (err: any) {
      setError(err.message || "Failed to acquire asset");
    } finally {
      setSaving(false);
    }
  }

  async function handleDepreciate() {
    setDepResult(null);
    const result = await api.depreciate(companyId, depPeriod);
    setDepResult(result);
    loadAssets();
    if (selected) handleSelect(selected); // Refresh GL entries
  }

  function startDispose(asset: any) {
    setDisposeTarget(asset);
    setDisposeAmount("0");
  }

  async function confirmDispose() {
    if (!disposeTarget) return;
    setDisposing(true);
    try {
      await api.disposeAsset(
        companyId,
        disposeTarget.id,
        parseFloat(disposeAmount || "0"),
      );
      setDisposeTarget(null);
      loadAssets();
      if (selected?.id === disposeTarget.id) setSelected(null);
    } catch {
      /* ignore */
    }
    setDisposing(false);
  }

  if (!companyId)
    return (
      <EmptyState
        icon="🏢"
        title="No company selected"
        description="Add a company first to manage fixed assets."
      />
    );

  const statusBadge = (status: string) => (
    <span
      className={`badge ${status === "active" ? "badge-posted" : status === "disposed" ? "badge-cancelled" : "badge-paid"}`}
    >
      {status}
    </span>
  );

  const assetColumns: GridColumn<any>[] = [
    {
      id: "code",
      header: "Code",
      accessor: (a) => a.code || "",
      render: (a) => <span className="mono">{a.code}</span>,
      hideOnMobile: true,
    },
    {
      id: "name",
      header: "Name",
      accessor: (a) => a.name || "",
    },
    {
      id: "acquisitionCost",
      header: "Cost",
      accessor: (a) => a.acquisitionCost ?? 0,
      render: (a) => (
        <span className="num">{formatMoney(a.acquisitionCost, fmt)}</span>
      ),
      align: "right",
      hideOnMobile: true,
    },
    {
      id: "netBookValue",
      header: "NBV",
      accessor: (a) => a.netBookValue ?? 0,
      render: (a) => (
        <span className="num" style={{ fontWeight: 500 }}>
          {formatMoney(a.netBookValue, fmt)}
        </span>
      ),
      align: "right",
    },
    {
      id: "status",
      header: "Status",
      accessor: (a) => a.status || "",
      render: (a) => statusBadge(a.status),
    },
    {
      id: "actions",
      header: "",
      accessor: () => "",
      sortable: false,
      searchable: false,
      filterable: false,
      render: (a) =>
        a.status === "active" ? (
          <button
            className="btn-secondary"
            style={{ padding: "2px 8px", fontSize: 12 }}
            onClick={(e) => {
              e.stopPropagation();
              startDispose(a);
            }}
          >
            Dispose
          </button>
        ) : null,
      hideOnMobile: true,
    },
  ];

  // Detail view
  if (selected) {
    return (
      <div>
        <button
          className="btn-secondary"
          style={{ marginBottom: 16 }}
          onClick={() => setSelected(null)}
        >
          ← Back to list
        </button>
        <h2 className="page-title">{selected.name}</h2>

        <div className="detail-layout">
          <div className="detail-sidebar">
            <div className="settings-card">
              <div className="onboarding-details">
                <div className="detail-row">
                  <span className="detail-label">Code</span>
                  <span className="mono">{selected.code}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Asset account</span>
                  <span className="mono">{selected.assetAccountCode}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Depreciation account</span>
                  <span className="mono">
                    {selected.depreciationAccountCode}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Expense account</span>
                  <span className="mono">{selected.expenseAccountCode}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Acquisition date</span>
                  <span>{selected.acquisitionDate}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Cost</span>
                  <span>{formatMoney(selected.acquisitionCost, fmt)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Residual value</span>
                  <span>{formatMoney(selected.residualValue, fmt)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Useful life</span>
                  <span>{selected.usefulLifeMonths} months</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Method</span>
                  <span>{selected.depreciationMethod}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Accum. depreciation</span>
                  <span>
                    {formatMoney(selected.accumulatedDepreciation, fmt)}
                  </span>
                </div>
                <div className="detail-row" style={{ fontWeight: 600 }}>
                  <span className="detail-label">Net book value</span>
                  <span>{formatMoney(selected.netBookValue, fmt)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <span
                    className={`badge ${selected.status === "active" ? "badge-posted" : selected.status === "disposed" ? "badge-cancelled" : "badge-paid"}`}
                  >
                    {selected.status}
                  </span>
                </div>
                {selected.disposalDate && (
                  <>
                    <div className="detail-row">
                      <span className="detail-label">Disposal date</span>
                      <span>{selected.disposalDate}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Disposal proceeds</span>
                      <span>{formatMoney(selected.disposalAmount, fmt)}</span>
                    </div>
                  </>
                )}
              </div>
              {selected.status === "active" && (
                <button
                  className="btn-secondary"
                  style={{ marginTop: 16, color: "#FF3B30" }}
                  onClick={() => startDispose(selected)}
                >
                  Dispose asset
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div className="settings-card">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                GL postings
              </h3>
              <GlPostings
                entries={glEntries}
                loading={loadingGl}
                emptyMessage="No GL entries found"
                formatMoney={formatMoney}
                fmt={fmt}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="coa-header">
        <h2 className="page-title">Fixed assets</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="month"
            value={depPeriod}
            onChange={(e) => setDepPeriod(e.target.value)}
            className="form-input"
          />
          <button className="btn-secondary" onClick={handleDepreciate}>
            Run depreciation
          </button>
          <button
            className="btn-primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "Cancel" : "+ Acquire asset"}
          </button>
        </div>
      </div>

      {depResult && (
        <div
          className="metric-card"
          style={{
            marginBottom: 16,
            background: depResult.isSkipped
              ? "var(--bg-subtle, #F5F5F4)"
              : "var(--success-bg)",
          }}
        >
          <span
            style={{
              color: depResult.isSkipped ? "var(--text-secondary)" : "#1A7F37",
              fontSize: "var(--text-sm)",
            }}
          >
            {depResult.isSkipped
              ? `Depreciation for ${depPeriod} already posted (${formatMoney(depResult.totalAmount, fmt)}). No changes needed.`
              : `Depreciation posted: ${depResult.assetsDepreciated} asset${depResult.assetsDepreciated !== 1 ? "s" : ""}, ${formatMoney(depResult.totalAmount, fmt)} total`}
          </span>
        </div>
      )}

      {showForm && (
        <div
          className="settings-card"
          style={{ marginBottom: 20, maxWidth: 720 }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Acquire new asset
          </h3>
          <div style={{ marginBottom: 16 }}>
            <AiInput
              placeholder="e.g. MacBook Pro laptop, €2500, 3 years useful life"
              onSubmit={handleAiDescribe}
              disabled={!companyId}
            />
          </div>
          <div className="form-hint">
            <span className="required-dot">*</span> Fill in code, name, and
            cost. Other fields have sensible defaults you can adjust.
          </div>
          <div className="form-grid-3">
            <div>
              <div className="detail-label required">Code</div>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. FA-001"
                className="settings-input"
              />
            </div>
            <div>
              <div className="detail-label required">Name</div>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Office equipment"
                className="settings-input"
              />
            </div>
            <div>
              <div className="detail-label">GL account</div>
              <select
                value={form.assetAccountCode}
                onChange={(e) =>
                  setForm({ ...form, assetAccountCode: e.target.value })
                }
                className="settings-input"
              >
                <option value="1210">1210 — Land and buildings</option>
                <option value="1220">1220 — Equipment and machinery</option>
                <option value="1230">1230 — Other fixed assets</option>
              </select>
            </div>
            <div>
              <div className="detail-label">Acquisition date</div>
              <input
                type="date"
                value={form.acquisitionDate}
                onChange={(e) =>
                  setForm({ ...form, acquisitionDate: e.target.value })
                }
                className="settings-input"
              />
            </div>
            <div>
              <div className="detail-label required">Cost (€)</div>
              <input
                type="number"
                value={form.acquisitionCost}
                onChange={(e) =>
                  setForm({ ...form, acquisitionCost: e.target.value })
                }
                placeholder="e.g. 10000"
                className="settings-input"
              />
            </div>
            <div>
              <div className="detail-label">Residual value (€)</div>
              <input
                type="number"
                value={form.residualValue}
                onChange={(e) =>
                  setForm({ ...form, residualValue: e.target.value })
                }
                className="settings-input"
              />
              <span className="field-hint">Default: 0</span>
            </div>
            <div>
              <div className="detail-label">Useful life (months)</div>
              <input
                type="number"
                value={form.usefulLifeMonths}
                onChange={(e) =>
                  setForm({ ...form, usefulLifeMonths: e.target.value })
                }
                className="settings-input"
              />
              <span className="field-hint">Default: 60 (5 years)</span>
            </div>
          </div>
          {error && (
            <div
              style={{
                marginTop: 12,
                padding: "8px 12px",
                background: "var(--error-bg)",
                color: "var(--error)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-sm)",
              }}
            >
              {error}
            </div>
          )}
          <button
            className="btn-primary"
            style={{ marginTop: 16 }}
            onClick={handleAcquire}
            disabled={saving}
          >
            {saving ? "Posting..." : "Acquire & post to GL"}
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: "#A0A0A0" }}>Loading...</p>
      ) : filteredByPeriod.length === 0 && assets.length === 0 ? (
        <EmptyState
          icon="🏗️"
          title="No fixed assets"
          description="Acquire your first asset to start tracking depreciation."
        />
      ) : (
        <>
          <div className="coa-level-controls" style={{ marginBottom: 12 }}>
            <button
              className={`coa-level-btn ${!statusFilter ? "active" : ""}`}
              onClick={() => setStatusFilter("")}
            >
              All
            </button>
            <button
              className={`coa-level-btn ${statusFilter === "active" ? "active" : ""}`}
              onClick={() => setStatusFilter("active")}
            >
              Active
            </button>
            <button
              className={`coa-level-btn ${statusFilter === "disposed" ? "active" : ""}`}
              onClick={() => setStatusFilter("disposed")}
            >
              Disposed
            </button>
          </div>
          <UniversalGrid
            rows={filteredByPeriod}
            columns={assetColumns}
            rowKey={(a) => a.id}
            onRowClick={handleSelect}
            searchPlaceholder="Search assets..."
            emptyMessage="No matching assets. Try adjusting your search."
            initialSort={{ columnId: "code", direction: "asc" }}
          />
        </>
      )}

      {/* Disposal modal */}
      {disposeTarget && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
          onClick={() => setDisposeTarget(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: 400,
              maxWidth: "90vw",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              Dispose asset
            </h3>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                marginBottom: 16,
              }}
            >
              Disposing <strong>{disposeTarget.name}</strong> (net book value:{" "}
              {formatMoney(disposeTarget.netBookValue, fmt)})
            </p>
            <div className="detail-label">Disposal proceeds (€)</div>
            <input
              type="number"
              value={disposeAmount}
              onChange={(e) => setDisposeAmount(e.target.value)}
              className="settings-input"
              style={{ marginBottom: 8 }}
              min="0"
              step="0.01"
              autoFocus
            />
            <span
              className="field-hint"
              style={{ display: "block", marginBottom: 16 }}
            >
              Enter 0 if the asset is scrapped with no proceeds
            </span>
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                className="btn-secondary"
                onClick={() => setDisposeTarget(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={confirmDispose}
                disabled={disposing}
                style={{ background: "#FF3B30" }}
              >
                {disposing ? "Disposing..." : "Dispose asset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
