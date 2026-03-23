import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { FORMAT_LABELS, formatSequencePreview, DATE_FORMAT_LABELS, DATETIME_FORMAT_LABELS } from "../utils/format";
import type { NumberFormat, SequenceType, NumberSequence, DateFormat, DateTimeFormat } from "@shared/types";
import { DEFAULT_SEQUENCES, SEQUENCE_LABELS } from "@shared/types";

export function Settings() {
  const { companyId, setCompanyId, refreshCompanies } = useApp();
  const navigate = useNavigate();
  const [company, setCompany] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteStep, setDeleteStep] = useState<"idle" | "confirm" | "confirm-txns" | "deleting">("idle");
  const [txnCount, setTxnCount] = useState(0);
  const [deleteError, setDeleteError] = useState("");

  // Editable fields
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [numberFormat, setNumberFormat] = useState<NumberFormat>("space_comma");
  const [dateFormat, setDateFormat] = useState<DateFormat>("dd.MM.yyyy");
  const [dateTimeFormat, setDateTimeFormat] = useState<DateTimeFormat>("24h");
  const [sequences, setSequences] = useState<Record<string, NumberSequence>>({});

  useEffect(() => {
    if (!companyId) return;
    api.company(companyId).then((data: any) => {
      setCompany(data);
      setCode(data.code || "");
      setName(data.name || "");
      setVatNumber(data.vatNumber || "");
      setPaymentTerms(data.settings?.defaultPaymentTermsDays || 30);
      setNumberFormat(data.settings?.numberFormat || "space_comma");
      setDateFormat(data.settings?.dateFormat || "dd.MM.yyyy");
      setDateTimeFormat(data.settings?.dateTimeFormat || "24h");
      // Merge saved sequences with defaults
      const saved = data.settings?.sequences || {};
      const merged: Record<string, NumberSequence> = {};
      for (const key of Object.keys(DEFAULT_SEQUENCES)) {
        merged[key] = saved[key] || { ...DEFAULT_SEQUENCES[key as SequenceType] };
      }
      setSequences(merged);
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
          defaultPaymentTermsDays: paymentTerms,
          numberFormat,
          dateFormat,
          dateTimeFormat,
          sequences,
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
          <h3 className="section-title">Number sequences</h3>
          <p style={{ fontSize: 12, color: "var(--text-secondary, #787878)", marginBottom: 16 }}>
            Configure how document and record numbers are generated. Each type has a prefix, counter, and zero-padding width.
          </p>
          <table className="data-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Prefix</th>
                <th style={{ width: 60 }}>Separator</th>
                <th style={{ width: 70 }}>Padding</th>
                <th style={{ width: 80 }}>Next #</th>
                <th>Suffix</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(SEQUENCE_LABELS) as SequenceType[]).map((key) => {
                const seq = sequences[key] || DEFAULT_SEQUENCES[key];
                return (
                  <tr key={key}>
                    <td style={{ fontWeight: 500 }}>{SEQUENCE_LABELS[key]}</td>
                    <td>
                      <input
                        value={seq.prefix}
                        onChange={(e) => setSequences((prev) => ({ ...prev, [key]: { ...seq, prefix: e.target.value.toUpperCase() } }))}
                        style={{ width: 70 }}
                      />
                    </td>
                    <td>
                      <input
                        value={seq.separator ?? "-"}
                        onChange={(e) => setSequences((prev) => ({ ...prev, [key]: { ...seq, separator: e.target.value } }))}
                        style={{ width: 40 }}
                        maxLength={2}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={seq.padding}
                        onChange={(e) => setSequences((prev) => ({ ...prev, [key]: { ...seq, padding: Math.max(1, Math.min(12, Number(e.target.value))) } }))}
                        style={{ width: 50 }}
                        min={1}
                        max={12}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={seq.nextNumber}
                        onChange={(e) => setSequences((prev) => ({ ...prev, [key]: { ...seq, nextNumber: Math.max(1, Number(e.target.value)) } }))}
                        style={{ width: 70 }}
                        min={1}
                      />
                    </td>
                    <td>
                      <input
                        value={seq.suffix || ""}
                        onChange={(e) => setSequences((prev) => ({ ...prev, [key]: { ...seq, suffix: e.target.value || undefined } }))}
                        style={{ width: 60 }}
                        placeholder="e.g. 2026"
                      />
                    </td>
                    <td className="mono" style={{ color: "var(--text-secondary, #787878)" }}>
                      {formatSequencePreview(seq)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="settings-section">
          <h3 className="section-title">Invoicing</h3>
          <div className="settings-field">
            <label>Default payment terms (days)</label>
            <input type="number" value={paymentTerms} onChange={(e) => setPaymentTerms(Number(e.target.value))} className="settings-input" style={{ maxWidth: 120 }} />
          </div>
        </div>

        <div className="settings-section">
          <h3 className="section-title">Number format</h3>
          <div className="settings-field">
            <label>Amount display</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(Object.entries(FORMAT_LABELS) as [NumberFormat, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setNumberFormat(key)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: numberFormat === key ? "2px solid var(--accent, #0A84FF)" : "1px solid #E0E0E0",
                    background: numberFormat === key ? "var(--accent-bg, #F0F7FF)" : "#fff",
                    color: "var(--text-primary, #1C1C1C)",
                    fontFamily: "monospace",
                    fontSize: 14,
                    cursor: "pointer",
                    fontWeight: numberFormat === key ? 600 : 400,
                  }}
                >
                  €{label}
                </button>
              ))}
            </div>
            <span className="field-hint">How amounts appear across the app</span>
          </div>
        </div>

        <div className="settings-section">
          <h3 className="section-title">Date format</h3>
          <div className="settings-field">
            <label>Date display</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(Object.entries(DATE_FORMAT_LABELS) as [DateFormat, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDateFormat(key)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: dateFormat === key ? "2px solid var(--accent, #0A84FF)" : "1px solid #E0E0E0",
                    background: dateFormat === key ? "var(--accent-bg, #F0F7FF)" : "#fff",
                    color: "var(--text-primary, #1C1C1C)",
                    fontFamily: "monospace",
                    fontSize: 14,
                    cursor: "pointer",
                    fontWeight: dateFormat === key ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="field-hint">How dates appear across the app</span>
          </div>
          <div className="settings-field" style={{ marginTop: 16 }}>
            <label>Time display</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(Object.entries(DATETIME_FORMAT_LABELS) as [DateTimeFormat, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setDateTimeFormat(key)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: dateTimeFormat === key ? "2px solid var(--accent, #0A84FF)" : "1px solid #E0E0E0",
                    background: dateTimeFormat === key ? "var(--accent-bg, #F0F7FF)" : "#fff",
                    color: "var(--text-primary, #1C1C1C)",
                    fontFamily: "monospace",
                    fontSize: 14,
                    cursor: "pointer",
                    fontWeight: dateTimeFormat === key ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="field-hint">24-hour or 12-hour clock</span>
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

        <div className="settings-section" style={{ marginTop: 32 }}>
          <h3 className="section-title">Currency settings</h3>
          <p style={{ fontSize: 12, color: "var(--text-secondary, #787878)", marginBottom: 16 }}>
            Configure transaction, accounting, and reporting currencies. Exchange rates can be imported automatically from ECB or Latvian Central Bank.
          </p>
          <div className="settings-grid">
            <div className="settings-field">
              <label>Transaction currency</label>
              <select defaultValue="EUR" className="settings-input">
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — US Dollar</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="PLN">PLN — Polish Zloty</option>
                <option value="SEK">SEK — Swedish Krona</option>
                <option value="NOK">NOK — Norwegian Krone</option>
                <option value="DKK">DKK — Danish Krone</option>
                <option value="CZK">CZK — Czech Koruna</option>
                <option value="CHF">CHF — Swiss Franc</option>
              </select>
            </div>
            <div className="settings-field">
              <label>Accounting currency</label>
              <select defaultValue="EUR" className="settings-input">
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — US Dollar</option>
                <option value="GBP">GBP — British Pound</option>
              </select>
            </div>
            <div className="settings-field">
              <label>Reporting currency (optional)</label>
              <select defaultValue="" className="settings-input">
                <option value="">Same as accounting</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
              </select>
            </div>
            <div className="settings-field">
              <label>Exchange rate source</label>
              <select defaultValue="ecb" className="settings-input">
                <option value="ecb">European Central Bank (ECB)</option>
                <option value="latvian-bank">Bank of Latvia</option>
                <option value="manual">Manual entry</option>
                <option value="group">Group rates (shared)</option>
              </select>
            </div>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 8 }}>
            Currency revaluation runs automatically as part of the month-end close process.
          </p>
        </div>

        <div className="settings-section" style={{ marginTop: 40, borderTop: "1px solid #FEE2E2", paddingTop: 24 }}>
          <h3 className="section-title" style={{ color: "#FF3B30" }}>Danger zone</h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
            Permanently delete this company and all its data. This cannot be undone.
          </p>

          {deleteStep === "idle" && (
            <button
              style={{ background: "none", border: "1px solid #FF3B30", color: "#FF3B30", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}
              onClick={async () => {
                setDeleteError("");
                try {
                  const stats: any = await api.companyStats(companyId);
                  setTxnCount(stats.transactionCount || 0);
                  setDeleteStep(stats.transactionCount > 0 ? "confirm-txns" : "confirm");
                } catch {
                  setDeleteStep("confirm");
                }
              }}
            >
              Delete this company
            </button>
          )}

          {deleteStep === "confirm" && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FEE2E2", borderRadius: 8, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: "#991B1B", margin: "0 0 12px" }}>
                Are you sure you want to delete <strong>{company.name}</strong>?
              </p>
              <p style={{ fontSize: 12, color: "#991B1B", margin: "0 0 16px" }}>
                All accounts, settings, and data will be permanently removed.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={{ background: "#FF3B30", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}
                  onClick={async () => {
                    setDeleteError("");
                    setDeleteStep("deleting");
                    try {
                      await api.deleteCompany(companyId);
                      localStorage.removeItem("era_companyId");
                      setCompanyId("");
                      await refreshCompanies();
                      navigate("/onboarding");
                    } catch (err) {
                      setDeleteError(err instanceof Error ? err.message : "Delete failed");
                      setDeleteStep("confirm");
                    }
                  }}
                >
                  Yes, delete permanently
                </button>
                <button className="btn-secondary" onClick={() => setDeleteStep("idle")}>Cancel</button>
              </div>
              {deleteError && <p style={{ color: "#FF3B30", fontSize: 12, marginTop: 8 }}>{deleteError}</p>}
            </div>
          )}

          {deleteStep === "confirm-txns" && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FEE2E2", borderRadius: 8, padding: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#991B1B", margin: "0 0 8px" }}>
                ⚠ This company has {txnCount} transaction{txnCount !== 1 ? "s" : ""}
              </p>
              <p style={{ fontSize: 12, color: "#991B1B", margin: "0 0 12px" }}>
                Deleting <strong>{company.name}</strong> will permanently remove all journal entries, invoices, payments, contacts, and financial data. This cannot be undone.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  style={{ background: "#991B1B", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}
                  onClick={async () => {
                    setDeleteError("");
                    setDeleteStep("deleting");
                    try {
                      await api.deleteCompany(companyId);
                      localStorage.removeItem("era_companyId");
                      setCompanyId("");
                      await refreshCompanies();
                      navigate("/onboarding");
                    } catch (err) {
                      setDeleteError(err instanceof Error ? err.message : "Delete failed");
                      setDeleteStep("confirm-txns");
                    }
                  }}
                >
                  I understand, delete everything
                </button>
                <button className="btn-secondary" onClick={() => setDeleteStep("idle")}>Cancel</button>
              </div>
              {deleteError && <p style={{ color: "#FF3B30", fontSize: 12, marginTop: 8 }}>{deleteError}</p>}
            </div>
          )}

          {deleteStep === "deleting" && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FEE2E2", borderRadius: 8, padding: 16 }}>
              <p style={{ fontSize: 13, color: "#991B1B" }}>Deleting company and all data...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
