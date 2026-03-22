import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function BankRecon() {
  const { companyId } = useApp();
  const [recons, setRecons] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [csvText, setCsvText] = useState("");

  useEffect(() => {
    if (!companyId) return;
    loadRecons();
  }, [companyId]);

  function loadRecons() {
    setLoading(true);
    api.bankReconciliations(companyId).then((d: any) => setRecons(d as any[])).catch(() => {}).finally(() => setLoading(false));
  }

  async function handleImport() {
    if (!csvText.trim()) return;
    setImporting(true);
    try {
      const lines = csvText.trim().split("\n").slice(1).map(row => {
        const cols = row.split(";").map(c => c.trim().replace(/^"|"$/g, ""));
        return { date: cols[0], description: cols[1] || "", reference: cols[2] || "", amount: parseFloat(cols[3]) || 0, counterparty: cols[4] || "" };
      }).filter(l => l.amount !== 0);

      const balance = lines.reduce((s, l) => s + l.amount, 0);
      const result = await api.importBankStatement(companyId, {
        bankAccountCode: "2420", statementDate: new Date().toISOString().slice(0, 10),
        statementBalance: Math.round(balance * 100) / 100, lines,
      });
      setCsvText("");
      setSelected(result);
      loadRecons();
    } catch (err: any) { alert(err.message); }
    finally { setImporting(false); }
  }

  if (!companyId) return <div className="empty-state"><div className="icon">🏢</div><h3>No company selected</h3></div>;

  if (selected) {
    const matched = selected.lines?.filter((l: any) => l.status === "matched").length || 0;
    const unmatched = selected.lines?.filter((l: any) => l.status === "unmatched").length || 0;
    const posted = selected.lines?.filter((l: any) => l.status === "posted").length || 0;

    return (
      <div>
        <div className="coa-header">
          <h2 className="page-title">Bank reconciliation</h2>
          <button className="btn-secondary" onClick={() => setSelected(null)}>← Back to list</button>
        </div>
        <div className="dashboard-grid" style={{ marginBottom: 20 }}>
          <div className="metric-card"><div className="label">Total lines</div><div className="value">{selected.lines?.length || 0}</div></div>
          <div className="metric-card"><div className="label">Matched</div><div className="value" style={{ color: "#34C759" }}>{matched}</div></div>
          <div className="metric-card"><div className="label">Unmatched</div><div className="value" style={{ color: unmatched > 0 ? "#FF9500" : "#34C759" }}>{unmatched}</div></div>
          <div className="metric-card"><div className="label">Posted</div><div className="value">{posted}</div></div>
        </div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {(selected.lines || []).map((l: any) => (
              <tr key={l.id}>
                <td className="mono">{l.date}</td>
                <td>{l.description}{l.counterparty ? ` — ${l.counterparty}` : ""}</td>
                <td className="num" style={{ color: l.amount >= 0 ? "#34C759" : "#FF3B30" }}>€{l.amount?.toFixed(2)}</td>
                <td><span className={`badge ${l.status === "matched" ? "badge-paid" : l.status === "posted" ? "badge-posted" : "badge-draft"}`}>{l.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <h2 className="page-title">Bank reconciliation</h2>

      <div className="settings-card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Import bank statement</h3>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: 12 }}>
          Paste CSV data: date;description;reference;amount;counterparty (semicolon-separated, first row = header)
        </p>
        <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={6} placeholder="date;description;reference;amount;counterparty&#10;2026-03-01;Office rent;R-001;-1200.00;SIA Landlord&#10;2026-03-05;Customer payment;INV-00001;4840.00;SIA Client" style={{ width: "100%", padding: 12, fontFamily: "ui-monospace, Consolas, monospace", fontSize: "var(--text-sm)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", resize: "vertical", background: "var(--bg-page)" }} />
        <button className="btn-primary" style={{ marginTop: 8 }} onClick={handleImport} disabled={importing || !csvText.trim()}>
          {importing ? "Importing..." : "Import & auto-match"}
        </button>
      </div>

      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : recons.length === 0 ? (
        <div className="empty-state"><div className="icon">🏦</div><h3>No reconciliations</h3><p>Import a bank statement to start reconciling.</p></div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Date</th><th>Bank account</th><th>Lines</th><th>Statement balance</th><th>Status</th></tr></thead>
          <tbody>
            {recons.map((r: any) => (
              <tr key={r.id} onClick={() => setSelected(r)} style={{ cursor: "pointer" }}>
                <td className="mono">{r.statementDate}</td>
                <td className="mono">{r.bankAccountCode}</td>
                <td>{r.lines?.length || 0}</td>
                <td className="num">€{r.statementBalance?.toFixed(2)}</td>
                <td><span className={`badge ${r.status === "reconciled" ? "badge-paid" : "badge-posted"}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
