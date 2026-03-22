import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function RecurringEntries() {
  const { companyId } = useApp();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", frequency: "monthly", debitCode: "", debitName: "", creditCode: "", creditName: "", amount: "", nextRunDate: "" });

  useEffect(() => {
    if (!companyId) return;
    loadTemplates();
  }, [companyId]);

  function loadTemplates() {
    setLoading(true);
    api.recurringTemplates(companyId).then((d: any) => setTemplates(d as any[])).catch(() => {}).finally(() => setLoading(false));
  }

  async function handleCreate() {
    if (!form.name || !form.debitCode || !form.creditCode || !form.amount) return;
    const amt = parseFloat(form.amount);
    await api.createRecurringTemplate(companyId, {
      name: form.name, description: form.description, frequency: form.frequency,
      nextRunDate: form.nextRunDate || undefined,
      lines: [
        { accountCode: form.debitCode, accountName: form.debitName || form.debitCode, debit: amt, credit: 0 },
        { accountCode: form.creditCode, accountName: form.creditName || form.creditCode, debit: 0, credit: amt },
      ],
    });
    setShowForm(false);
    setForm({ name: "", description: "", frequency: "monthly", debitCode: "", debitName: "", creditCode: "", creditName: "", amount: "", nextRunDate: "" });
    loadTemplates();
  }

  async function handleExecute(t: any) {
    await api.executeTemplate(companyId, t.id);
    loadTemplates();
  }

  if (!companyId) return <div className="empty-state"><div className="icon">🏢</div><h3>No company selected</h3></div>;

  return (
    <div>
      <div className="coa-header">
        <h2 className="page-title">Recurring entries</h2>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>{showForm ? "Cancel" : "+ New template"}</button>
      </div>

      {showForm && (
        <div className="settings-card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>New recurring template</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><div className="detail-label">Name</div><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Monthly office rent" className="settings-input" /></div>
            <div><div className="detail-label">Description</div><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Rent payment for HQ" className="settings-input" /></div>
            <div><div className="detail-label">Frequency</div>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="settings-input">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div><div className="detail-label">Next run date</div><input type="date" value={form.nextRunDate} onChange={(e) => setForm({ ...form, nextRunDate: e.target.value })} className="settings-input" /></div>
            <div><div className="detail-label">Debit account</div><input value={form.debitCode} onChange={(e) => setForm({ ...form, debitCode: e.target.value })} placeholder="6330" className="settings-input" /></div>
            <div><div className="detail-label">Debit name</div><input value={form.debitName} onChange={(e) => setForm({ ...form, debitName: e.target.value })} placeholder="Rent and utilities" className="settings-input" /></div>
            <div><div className="detail-label">Credit account</div><input value={form.creditCode} onChange={(e) => setForm({ ...form, creditCode: e.target.value })} placeholder="2420" className="settings-input" /></div>
            <div><div className="detail-label">Credit name</div><input value={form.creditName} onChange={(e) => setForm({ ...form, creditName: e.target.value })} placeholder="Bank accounts" className="settings-input" /></div>
            <div><div className="detail-label">Amount (€)</div><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="1200.00" className="settings-input" /></div>
          </div>
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={handleCreate}>Create template</button>
        </div>
      )}

      {loading ? <p style={{ color: "#A0A0A0" }}>Loading...</p> : templates.length === 0 ? (
        <div className="empty-state"><div className="icon">🔄</div><h3>No recurring templates</h3><p>Create templates for rent, salaries, insurance, and other regular entries.</p></div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Name</th><th>Frequency</th><th>Amount</th><th>Next run</th><th>Last run</th><th></th></tr></thead>
          <tbody>
            {templates.map((t: any) => {
              const amt = t.lines?.reduce((s: number, l: any) => s + (l.debit || 0), 0) || 0;
              return (
                <tr key={t.id}>
                  <td style={{ fontWeight: 500 }}>{t.name}</td>
                  <td><span className="badge">{t.frequency}</span></td>
                  <td className="num">€{amt.toFixed(2)}</td>
                  <td className="mono">{t.nextRunDate || "—"}</td>
                  <td className="mono">{t.lastRunDate || "—"}</td>
                  <td><button className="btn-secondary" style={{ padding: "2px 10px", fontSize: 12 }} onClick={() => handleExecute(t)}>Execute now</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
