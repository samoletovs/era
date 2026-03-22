import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function FixedAssets() {
  const { companyId } = useApp();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", assetAccountCode: "1220", acquisitionDate: new Date().toISOString().slice(0, 10), acquisitionCost: "", residualValue: "0", usefulLifeMonths: "60" });
  const [depPeriod, setDepPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [depResult, setDepResult] = useState<any>(null);

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
  }

  async function handleDispose(asset: any) {
    const amount = prompt(`Disposal proceeds for ${asset.name}? (€, enter 0 if scrapped)`);
    if (amount === null) return;
    await api.disposeAsset(companyId, asset.id, parseFloat(amount));
    loadAssets();
  }

  if (!companyId) return <div className="empty-state"><div className="icon">🏢</div><h3>No company selected</h3></div>;

  return (
    <div>
      <div className="coa-header">
        <h2 className="page-title">Fixed assets</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="month" value={depPeriod} onChange={(e) => setDepPeriod(e.target.value)} style={{ height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)" }} />
          <button className="btn-secondary" onClick={handleDepreciate}>Run depreciation</button>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "+ Acquire asset"}</button>
        </div>
      </div>

      {depResult && (
        <div className="metric-card" style={{ marginBottom: 16, background: "var(--success-bg)" }}>
          <span style={{ color: "#1A7F37", fontSize: "var(--text-sm)" }}>
            Depreciation complete: {depResult.assetsDepreciated} assets, €{depResult.totalAmount?.toFixed(2)} posted
          </span>
        </div>
      )}

      {showForm && (
        <div className="settings-card" style={{ marginBottom: 20, maxWidth: 720 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Acquire new asset</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div><div className="detail-label">Code</div><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="FA-001" className="settings-input" /></div>
            <div><div className="detail-label">Name</div><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Office equipment" className="settings-input" /></div>
            <div><div className="detail-label">GL account</div>
              <select value={form.assetAccountCode} onChange={(e) => setForm({ ...form, assetAccountCode: e.target.value })} className="settings-input">
                <option value="1210">1210 — Land and buildings</option>
                <option value="1220">1220 — Equipment and machinery</option>
                <option value="1230">1230 — Other fixed assets</option>
              </select>
            </div>
            <div><div className="detail-label">Acquisition date</div><input type="date" value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })} className="settings-input" /></div>
            <div><div className="detail-label">Cost (€)</div><input type="number" value={form.acquisitionCost} onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })} placeholder="10000" className="settings-input" /></div>
            <div><div className="detail-label">Residual value (€)</div><input type="number" value={form.residualValue} onChange={(e) => setForm({ ...form, residualValue: e.target.value })} placeholder="0" className="settings-input" /></div>
            <div><div className="detail-label">Useful life (months)</div><input type="number" value={form.usefulLifeMonths} onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })} placeholder="60" className="settings-input" /></div>
          </div>
          {error && <div style={{ marginTop: 12, padding: "8px 12px", background: "var(--error-bg)", color: "var(--error)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-sm)" }}>{error}</div>}
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={handleAcquire} disabled={saving}>{saving ? "Posting..." : "Acquire & post to GL"}</button>
        </div>
      )}

      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : assets.length === 0 ? (
        <div className="empty-state"><div className="icon">🏗️</div><h3>No fixed assets</h3><p>Acquire your first asset to start tracking depreciation.</p></div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Code</th><th>Name</th><th>Account</th><th>Cost</th><th>Accum. depr.</th><th>Net book value</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {assets.map((a: any) => (
              <tr key={a.id}>
                <td className="mono">{a.code}</td>
                <td>{a.name}</td>
                <td className="mono">{a.assetAccountCode}</td>
                <td className="num">€{a.acquisitionCost?.toFixed(2)}</td>
                <td className="num">€{a.accumulatedDepreciation?.toFixed(2)}</td>
                <td className="num" style={{ fontWeight: 500 }}>€{a.netBookValue?.toFixed(2)}</td>
                <td><span className={`badge ${a.status === "active" ? "badge-posted" : a.status === "disposed" ? "badge-cancelled" : "badge-paid"}`}>{a.status}</span></td>
                <td>{a.status === "active" && <button className="btn-secondary" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => handleDispose(a)}>Dispose</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
