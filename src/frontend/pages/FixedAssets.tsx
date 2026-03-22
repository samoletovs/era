import React, { useEffect, useMemo, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney, formatMoneyOr } from "../utils/format";

type SortKey = "code" | "name" | "assetAccountCode" | "acquisitionCost" | "accumulatedDepreciation" | "netBookValue" | "status";
type SortDir = "asc" | "desc";

export function FixedAssets() {
  const { companyId, numberFormat: fmt } = useApp();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", assetAccountCode: "1220", acquisitionDate: new Date().toISOString().slice(0, 10), acquisitionCost: "", residualValue: "0", usefulLifeMonths: "60" });
  const [depPeriod, setDepPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [depResult, setDepResult] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [glEntries, setGlEntries] = useState<any[]>([]);
  const [loadingGl, setLoadingGl] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [disposeTarget, setDisposeTarget] = useState<any>(null);
  const [disposeAmount, setDisposeAmount] = useState("0");
  const [disposing, setDisposing] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    loadAssets();
  }, [companyId]);

  function loadAssets() {
    setLoading(true);
    api.fixedAssets(companyId).then((d: any) => setAssets(d as any[])).catch(() => {}).finally(() => setLoading(false));
  }

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const filteredAssets = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = assets;
    if (q) {
      list = list.filter(a =>
        a.code?.toLowerCase().includes(q) ||
        a.name?.toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      list = list.filter(a => a.status === statusFilter);
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
  }, [assets, search, statusFilter, sortKey, sortDir]);

  async function handleSelect(asset: any) {
    setSelected(asset);
    setLoadingGl(true);
    try {
      const entries = await api.assetTransactions(companyId, asset.id);
      setGlEntries(entries as any[]);
    } catch { setGlEntries([]); }
    setLoadingGl(false);
  }

  async function handleAcquire() {
    if (!form.code || !form.name || !form.acquisitionCost) return;
    setError(null);
    setSaving(true);
    try {
      await api.acquireAsset(companyId, {
        code: form.code, name: form.name, assetAccountCode: form.assetAccountCode,
        depreciationAccountCode: "1240", expenseAccountCode: "6380",
        acquisitionDate: form.acquisitionDate, acquisitionCost: parseFloat(form.acquisitionCost),
        residualValue: parseFloat(form.residualValue || "0"), usefulLifeMonths: parseInt(form.usefulLifeMonths),
      });
      setShowForm(false);
      setForm({ code: "", name: "", assetAccountCode: "1220", acquisitionDate: new Date().toISOString().slice(0, 10), acquisitionCost: "", residualValue: "0", usefulLifeMonths: "60" });
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
      await api.disposeAsset(companyId, disposeTarget.id, parseFloat(disposeAmount || "0"));
      setDisposeTarget(null);
      loadAssets();
      if (selected?.id === disposeTarget.id) setSelected(null);
    } catch { /* ignore */ }
    setDisposing(false);
  }

  if (!companyId) return <div className="empty-state"><div className="icon">🏢</div><h3>No company selected</h3></div>;

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
                <div className="detail-row"><span className="detail-label">Code</span><span className="mono">{selected.code}</span></div>
                <div className="detail-row"><span className="detail-label">Asset account</span><span className="mono">{selected.assetAccountCode}</span></div>
                <div className="detail-row"><span className="detail-label">Depreciation account</span><span className="mono">{selected.depreciationAccountCode}</span></div>
                <div className="detail-row"><span className="detail-label">Expense account</span><span className="mono">{selected.expenseAccountCode}</span></div>
                <div className="detail-row"><span className="detail-label">Acquisition date</span><span>{selected.acquisitionDate}</span></div>
                <div className="detail-row"><span className="detail-label">Cost</span><span>{formatMoney(selected.acquisitionCost, fmt)}</span></div>
                <div className="detail-row"><span className="detail-label">Residual value</span><span>{formatMoney(selected.residualValue, fmt)}</span></div>
                <div className="detail-row"><span className="detail-label">Useful life</span><span>{selected.usefulLifeMonths} months</span></div>
                <div className="detail-row"><span className="detail-label">Method</span><span>{selected.depreciationMethod}</span></div>
                <div className="detail-row"><span className="detail-label">Accum. depreciation</span><span>{formatMoney(selected.accumulatedDepreciation, fmt)}</span></div>
                <div className="detail-row" style={{ fontWeight: 600 }}><span className="detail-label">Net book value</span><span>{formatMoney(selected.netBookValue, fmt)}</span></div>
                <div className="detail-row"><span className="detail-label">Status</span><span className={`badge ${selected.status === "active" ? "badge-posted" : selected.status === "disposed" ? "badge-cancelled" : "badge-paid"}`}>{selected.status}</span></div>
                {selected.disposalDate && (
                  <>
                    <div className="detail-row"><span className="detail-label">Disposal date</span><span>{selected.disposalDate}</span></div>
                    <div className="detail-row"><span className="detail-label">Disposal proceeds</span><span>{formatMoney(selected.disposalAmount, fmt)}</span></div>
                  </>
                )}
              </div>
              {selected.status === "active" && (
                <button className="btn-secondary" style={{ marginTop: 16, color: "#FF3B30" }} onClick={() => startDispose(selected)}>Dispose asset</button>
              )}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div className="settings-card">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>GL postings</h3>
              {loadingGl ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : glEntries.length === 0 ? (
                <p style={{ color: "#A0A0A0", fontSize: 13 }}>No GL entries found</p>
              ) : (
                glEntries.map((entry: any, ei: number) => (
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
                            <td className="num">{l.debit ? formatMoney(l.debit, fmt) : ""}</td>
                            <td className="num">{l.credit ? formatMoney(l.credit, fmt) : ""}</td>
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
      <div className="coa-header">
        <h2 className="page-title">Fixed assets</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="month" value={depPeriod} onChange={(e) => setDepPeriod(e.target.value)} className="form-input" />
          <button className="btn-secondary" onClick={handleDepreciate}>Run depreciation</button>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "+ Acquire asset"}</button>
        </div>
      </div>

      {depResult && (
        <div className="metric-card" style={{ marginBottom: 16, background: depResult.skipped ? "var(--bg-subtle, #F5F5F4)" : "var(--success-bg)" }}>
          <span style={{ color: depResult.skipped ? "var(--text-secondary)" : "#1A7F37", fontSize: "var(--text-sm)" }}>
            {depResult.skipped
              ? `Depreciation for ${depPeriod} already posted (${formatMoney(depResult.totalAmount, fmt)}). No changes needed.`
              : `Depreciation posted: ${depResult.assetsDepreciated} asset${depResult.assetsDepreciated !== 1 ? "s" : ""}, ${formatMoney(depResult.totalAmount, fmt)} total`}
          </span>
        </div>
      )}

      {showForm && (
        <div className="settings-card" style={{ marginBottom: 20, maxWidth: 720 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Acquire new asset</h3>
          <div className="form-hint"><span className="required-dot">*</span> Fill in code, name, and cost. Other fields have sensible defaults you can adjust.</div>
          <div className="form-grid-3">
            <div><div className="detail-label required">Code</div><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. FA-001" className="settings-input" /></div>
            <div><div className="detail-label required">Name</div><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Office equipment" className="settings-input" /></div>
            <div><div className="detail-label">GL account</div>
              <select value={form.assetAccountCode} onChange={(e) => setForm({ ...form, assetAccountCode: e.target.value })} className="settings-input">
                <option value="1210">1210 — Land and buildings</option>
                <option value="1220">1220 — Equipment and machinery</option>
                <option value="1230">1230 — Other fixed assets</option>
              </select>
            </div>
            <div><div className="detail-label">Acquisition date</div><input type="date" value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })} className="settings-input" /></div>
            <div><div className="detail-label required">Cost (€)</div><input type="number" value={form.acquisitionCost} onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })} placeholder="e.g. 10000" className="settings-input" /></div>
            <div><div className="detail-label">Residual value (€)</div><input type="number" value={form.residualValue} onChange={(e) => setForm({ ...form, residualValue: e.target.value })} className="settings-input" /><span className="field-hint">Default: 0</span></div>
            <div><div className="detail-label">Useful life (months)</div><input type="number" value={form.usefulLifeMonths} onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })} className="settings-input" /><span className="field-hint">Default: 60 (5 years)</span></div>
          </div>
          {error && <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--error-bg)", color: "var(--error)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-sm)" }}>{error}</div>}
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={handleAcquire} disabled={saving}>{saving ? "Posting..." : "Acquire & post to GL"}</button>
        </div>
      )}

      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : assets.length === 0 && !search && !statusFilter ? (
        <div className="empty-state"><div className="icon">🏗️</div><h3>No fixed assets</h3><p>Acquire your first asset to start tracking depreciation.</p></div>
      ) : (
        <>
          <div className="filter-bar">
            <input
              type="text"
              placeholder="Search assets..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="table-search-input"
              aria-label="Search assets"
            />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="table-filter-select"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="fully-depreciated">Fully depreciated</option>
              <option value="disposed">Disposed</option>
            </select>
            {(search || statusFilter) && (
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)" }}>
                {filteredAssets.length} result{filteredAssets.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {filteredAssets.length === 0 ? (
            <div className="empty-state"><div className="icon">🔍</div><h3>No matching assets</h3><p>Try adjusting your search or filters.</p></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  {([
                    ["code", "Code"],
                    ["name", "Name"],
                    ["assetAccountCode", "Account"],
                    ["acquisitionCost", "Cost"],
                    ["accumulatedDepreciation", "Accum. depr."],
                    ["netBookValue", "Net book value"],
                    ["status", "Status"],
                  ] as [SortKey, string][]).map(([key, label]) => (
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredAssets.map((a: any) => (
                  <tr key={a.id} onClick={() => handleSelect(a)} style={{ cursor: "pointer" }}>
                    <td className="mono">{a.code}</td>
                    <td>{a.name}</td>
                    <td className="mono">{a.assetAccountCode}</td>
                    <td className="num">{formatMoney(a.acquisitionCost, fmt)}</td>
                    <td className="num">{formatMoney(a.accumulatedDepreciation, fmt)}</td>
                    <td className="num" style={{ fontWeight: 500 }}>{formatMoney(a.netBookValue, fmt)}</td>
                    <td><span className={`badge ${a.status === "active" ? "badge-posted" : a.status === "disposed" ? "badge-cancelled" : "badge-paid"}`}>{a.status}</span></td>
                    <td onClick={e => e.stopPropagation()}>{a.status === "active" && <button className="btn-secondary" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => startDispose(a)}>Dispose</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* Disposal modal */}
      {disposeTarget && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }} onClick={() => setDisposeTarget(null)}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: 24, width: 400, maxWidth: "90vw",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Dispose asset</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
              Disposing <strong>{disposeTarget.name}</strong> (net book value: {formatMoney(disposeTarget.netBookValue, fmt)})
            </p>
            <div className="detail-label">Disposal proceeds (€)</div>
            <input
              type="number"
              value={disposeAmount}
              onChange={e => setDisposeAmount(e.target.value)}
              className="settings-input"
              style={{ marginBottom: 8 }}
              min="0"
              step="0.01"
              autoFocus
            />
            <span className="field-hint" style={{ display: "block", marginBottom: 16 }}>
              Enter 0 if the asset is scrapped with no proceeds
            </span>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn-secondary" onClick={() => setDisposeTarget(null)}>Cancel</button>
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
