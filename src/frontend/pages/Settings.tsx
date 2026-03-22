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
    </div>
  );
}
