import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";

export function Settings() {
  const { companyId, refreshCompanies } = useApp();
  const [company, setCompany] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editable fields
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("");
  const [paymentTerms, setPaymentTerms] = useState(30);

  useEffect(() => {
    if (!companyId) return;
    api.company(companyId).then((data: any) => {
      setCompany(data);
      setCode(data.code || "");
      setName(data.name || "");
      setVatNumber(data.vatNumber || "");
      setInvoicePrefix(data.settings?.invoiceNumberPrefix || "INV");
      setPaymentTerms(data.settings?.defaultPaymentTermsDays || 30);
    });
  }, [companyId]);

  async function handleSave() {
    if (!companyId) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.updateCompany(companyId, {
        code: code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5),
        name,
        vatNumber: vatNumber || undefined,
        settings: {
          ...company.settings,
          invoiceNumberPrefix: invoicePrefix,
          defaultPaymentTermsDays: paymentTerms,
        },
      });
      setCompany(updated);
      setSaved(true);
      await refreshCompanies();
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  if (!companyId) return (
    <div className="empty-state">
      <div className="icon">🏢</div>
      <h3>No company selected</h3>
    </div>
  );

  if (!company) return <p style={{ color: "#A0A0A0" }}>Loading...</p>;

  return (
    <div>
      <h2 className="page-title">Company settings</h2>
      <div className="settings-card">
        <div className="settings-section">
          <div className="settings-field">
            <label>Company code</label>
            <input
              className="code-input-lg"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
              maxLength={5}
              placeholder="DAIS"
            />
            <span className="field-hint">Max 5 characters, shown in the company switcher</span>
          </div>

          <div className="settings-field">
            <label>Company name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="settings-field">
            <label>Registration number</label>
            <input value={company.registrationNumber} disabled className="disabled" />
            <span className="field-hint">Cannot be changed after creation</span>
          </div>

          <div className="settings-field">
            <label>VAT number</label>
            <input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="LV40003290084" />
          </div>
        </div>

        <div className="settings-section">
          <h3 className="section-title">Invoicing</h3>
          <div className="settings-row">
            <div className="settings-field">
              <label>Invoice prefix</label>
              <input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())} style={{ width: 100 }} />
            </div>
            <div className="settings-field">
              <label>Payment terms (days)</label>
              <input type="number" value={paymentTerms} onChange={(e) => setPaymentTerms(Number(e.target.value))} style={{ width: 80 }} />
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3 className="section-title">Address</h3>
          <div className="settings-field">
            <label>Legal address</label>
            <input value={company.legalAddress?.line1 || ""} disabled className="disabled" />
          </div>
          <div className="settings-row">
            <div className="settings-field">
              <label>City</label>
              <input value={company.legalAddress?.city || ""} disabled className="disabled" />
            </div>
            <div className="settings-field">
              <label>Postal code</label>
              <input value={company.legalAddress?.postalCode || ""} disabled className="disabled" />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 24 }}>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </button>
          {saved && <span style={{ color: "#34C759", fontSize: 13 }}>✓ Saved</span>}
        </div>
      </div>

      <PeriodManagement companyId={companyId} />
    </div>
  );
}

function PeriodManagement({ companyId }: { companyId: string }) {
  const [monthEndPeriod, setMonthEndPeriod] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const [yearEndYear, setYearEndYear] = useState(new Date().getFullYear() - 1);
  const [monthEndResult, setMonthEndResult] = useState<any>(null);
  const [yearEndResult, setYearEndResult] = useState<any>(null);
  const [running, setRunning] = useState("");

  async function handleMonthEnd() {
    setRunning("month");
    setMonthEndResult(null);
    try {
      const result = await api.runMonthEnd(companyId, monthEndPeriod);
      setMonthEndResult(result);
    } catch (e: any) { alert(e.message); }
    finally { setRunning(""); }
  }

  async function handleYearEnd() {
    if (!confirm(`Run year-end close for FY${yearEndYear}? This will close all periods and transfer P&L to retained earnings.`)) return;
    setRunning("year");
    setYearEndResult(null);
    try {
      const result = await api.runYearEnd(companyId, yearEndYear);
      setYearEndResult(result);
    } catch (e: any) { alert(e.message); }
    finally { setRunning(""); }
  }

  return (
    <div className="settings-card" style={{ marginTop: 24 }}>
      <h3 className="section-title">Period management</h3>

      <div className="settings-row" style={{ alignItems: "flex-end", gap: 12, marginBottom: 16 }}>
        <div className="settings-field" style={{ flex: "none" }}>
          <label>Month-end close</label>
          <input type="month" value={monthEndPeriod} onChange={(e) => setMonthEndPeriod(e.target.value)} style={{ width: 160 }} />
        </div>
        <button className="btn-primary" onClick={handleMonthEnd} disabled={running === "month"} style={{ marginBottom: 0 }}>
          {running === "month" ? "Running..." : "Run month-end"}
        </button>
      </div>

      {monthEndResult && (
        <div style={{ marginBottom: 20, padding: 12, background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-sm)" }}>
          <strong>Month-end complete — {monthEndResult.period}</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {monthEndResult.steps?.map((s: any, i: number) => (
              <div key={i} style={{ color: s.status === "completed" ? "#34C759" : s.status === "failed" ? "#FF3B30" : "var(--text-tertiary)" }}>
                {s.status === "completed" ? "✓" : s.status === "failed" ? "✗" : "—"} {s.name}: {s.detail}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="settings-row" style={{ alignItems: "flex-end", gap: 12 }}>
        <div className="settings-field" style={{ flex: "none" }}>
          <label>Year-end close</label>
          <input type="number" value={yearEndYear} onChange={(e) => setYearEndYear(Number(e.target.value))} style={{ width: 100 }} />
        </div>
        <button className="btn-secondary" style={{ color: "#FF9500", marginBottom: 0 }} onClick={handleYearEnd} disabled={running === "year"}>
          {running === "year" ? "Running..." : "Run year-end close"}
        </button>
      </div>

      {yearEndResult && (
        <div style={{ marginTop: 12, padding: 12, background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-sm)" }}>
          <strong>Year-end complete — FY{yearEndResult.fiscalYear}</strong>
          {yearEndResult.netResult != null && (
            <div style={{ marginTop: 4 }}>Net result: <strong style={{ color: yearEndResult.netResult >= 0 ? "#34C759" : "#FF3B30" }}>€{yearEndResult.netResult?.toFixed(2)}</strong> transferred to retained earnings</div>
          )}
        </div>
      )}
    </div>
  );
}
