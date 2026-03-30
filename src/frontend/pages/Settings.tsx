import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../utils/api';
import { useApp } from '../utils/context';
import {
  FORMAT_LABELS,
  formatSequencePreview,
  DATE_FORMAT_LABELS,
  DATETIME_FORMAT_LABELS,
} from '../utils/format';
import { CollapsibleSection } from '../components/CollapsibleSection';
import type {
  NumberFormat,
  SequenceType,
  NumberSequence,
  DateFormat,
  DateTimeFormat,
  CurrencySettings,
  CustomRateSource,
  CompanySharingEntry,
} from '@shared/types';
import { DEFAULT_SEQUENCES, SEQUENCE_LABELS, SYSTEM_RATE_SOURCES } from '@shared/types';

export function Settings() {
  const { companyId, setCompanyId, refreshCompanies } = useApp();
  const navigate = useNavigate();
  const [company, setCompany] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'confirm-txns' | 'deleting'>(
    'idle',
  );
  const [txnCount, setTxnCount] = useState(0);
  const [deleteError, setDeleteError] = useState('');

  // Editable fields
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [numberFormat, setNumberFormat] = useState<NumberFormat>('space_comma');
  const [dateFormat, setDateFormat] = useState<DateFormat>('dd.MM.yyyy');
  const [dateTimeFormat, setDateTimeFormat] = useState<DateTimeFormat>('24h');
  const [sequences, setSequences] = useState<Record<string, NumberSequence>>({});

  // Currency settings state
  const [accountingCurrency, setAccountingCurrency] = useState('EUR');
  const [reportingCurrency, setReportingCurrency] = useState('');
  const [accountingRateSource, setAccountingRateSource] = useState('ecb');
  const [reportingRateSource, setReportingRateSource] = useState('ecb');
  const [budgetRateSource, setBudgetRateSource] = useState('');
  const [customRateSources, setCustomRateSources] = useState<CustomRateSource[]>([]);
  const [newSourceName, setNewSourceName] = useState('');

  // Sharing state
  const [sharingList, setSharingList] = useState<CompanySharingEntry[]>([]);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [shareRole, setShareRole] = useState<'accountant' | 'viewer'>('accountant');
  const [shareError, setShareError] = useState('');
  const [shareSuccess, setShareSuccess] = useState('');
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    api.company(companyId).then((data: any) => {
      setCompany(data);
      setCode(data.code || '');
      setName(data.name || '');
      setShortName(data.shortName || '');
      setVatNumber(data.vatNumber || '');
      setPaymentTerms(data.settings?.defaultPaymentTermsDays || 30);
      setNumberFormat(data.settings?.numberFormat || 'space_comma');
      setDateFormat(data.settings?.dateFormat || 'dd.MM.yyyy');
      setDateTimeFormat(data.settings?.dateTimeFormat || '24h');
      // Merge saved sequences with defaults
      const saved = data.settings?.sequences || {};
      const merged: Record<string, NumberSequence> = {};
      for (const key of Object.keys(DEFAULT_SEQUENCES)) {
        merged[key] = saved[key] || {
          ...DEFAULT_SEQUENCES[key as SequenceType],
        };
      }
      setSequences(merged);

      // Load currency settings
      const cs = data.settings?.currency;
      if (cs) {
        setAccountingCurrency(cs.accountingCurrency || 'EUR');
        setReportingCurrency(cs.reportingCurrency || '');
        setAccountingRateSource(cs.accountingRateSource || 'ecb');
        setReportingRateSource(cs.reportingRateSource || 'ecb');
        setBudgetRateSource(cs.budgetRateSource || '');
        setCustomRateSources(cs.customRateSources || []);
      }
    });

    // Load sharing info (only works for owners)
    loadSharing();
  }, [companyId]);

  async function loadSharing() {
    if (!companyId) return;
    setSharingLoading(true);
    try {
      const data = (await api.sharingList(companyId)) as CompanySharingEntry[];
      setSharingList(data);
      setIsOwner(true);
    } catch {
      // Not owner or error — hide sharing section
      setIsOwner(false);
    } finally {
      setSharingLoading(false);
    }
  }

  async function handleShare() {
    if (!companyId || !shareEmail.trim()) return;
    setShareError('');
    setShareSuccess('');
    try {
      const result = (await api.shareCompany(companyId, shareEmail.trim(), shareRole)) as any;
      setShareEmail('');
      setShareSuccess(
        result.status === 'invited'
          ? `Invitation sent to ${shareEmail.trim()}`
          : `Shared with ${shareEmail.trim()}`,
      );
      setTimeout(() => setShareSuccess(''), 3000);
      await loadSharing();
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to share');
    }
  }

  async function handleRoleChange(userId: string, newRole: 'accountant' | 'viewer') {
    if (!companyId) return;
    try {
      await api.updateSharing(companyId, userId, newRole);
      await loadSharing();
    } catch {
      // ignore
    }
  }

  async function handleRemoveSharing(userId: string) {
    if (!companyId) return;
    try {
      await api.removeSharing(companyId, userId);
      await loadSharing();
    } catch {
      // ignore
    }
  }

  async function handleSave() {
    if (!companyId) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.updateCompany(companyId, {
        code: code
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 5),
        name,
        shortName: shortName || undefined,
        vatNumber: vatNumber || undefined,
        settings: {
          ...company.settings,
          defaultPaymentTermsDays: paymentTerms,
          numberFormat,
          dateFormat,
          dateTimeFormat,
          sequences,
          currency: {
            accountingCurrency,
            reportingCurrency: reportingCurrency || undefined,
            accountingRateSource,
            reportingRateSource: reportingCurrency ? reportingRateSource : undefined,
            budgetRateSource: budgetRateSource || undefined,
            customRateSources: customRateSources.length > 0 ? customRateSources : undefined,
          } as CurrencySettings,
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

  if (!companyId)
    return (
      <div className="empty-state">
        <div className="icon">🏢</div>
        <h3>No company selected</h3>
      </div>
    );

  if (!company) return <p style={{ color: '#A0A0A0' }}>Loading...</p>;

  return (
    <div>
      <h2 className="page-title">Company settings</h2>
      <div className="settings-card">
        {/* Block 1: Company information & invoicing — expanded by default */}
        <CollapsibleSection title="Company information" defaultExpanded>
          <div className="settings-section">
            <div className="settings-field">
              <label>Company code</label>
              <input
                className="code-input-lg"
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 5),
                  )
                }
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
              <label>Short name</label>
              <input
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="Friendly display name"
              />
              <span className="field-hint">
                Shown in the company switcher and across the app. Auto-generated from official name
                if empty.
              </span>
            </div>

            <div className="settings-field">
              <label>Registration number</label>
              <input value={company.registrationNumber} disabled className="disabled" />
              <span className="field-hint">Cannot be changed after creation</span>
            </div>

            <div className="settings-field">
              <label>VAT number</label>
              <input
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                placeholder="LV40003290084"
              />
            </div>
          </div>

          <div className="settings-section">
            <h3 className="section-title">Address</h3>
            <div className="settings-field">
              <label>Legal address</label>
              <input value={company.legalAddress?.line1 || ''} disabled className="disabled" />
            </div>
            <div className="settings-row">
              <div className="settings-field">
                <label>City</label>
                <input value={company.legalAddress?.city || ''} disabled className="disabled" />
              </div>
              <div className="settings-field">
                <label>Postal code</label>
                <input
                  value={company.legalAddress?.postalCode || ''}
                  disabled
                  className="disabled"
                />
              </div>
            </div>
          </div>

          <div
            className="settings-section"
            style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}
          >
            <h3 className="section-title">Invoicing</h3>
            <div className="settings-field">
              <label>Default payment terms (days)</label>
              <input
                type="number"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(Number(e.target.value))}
                className="settings-input"
                style={{ maxWidth: 120 }}
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* Block 2: Currency settings — collapsed by default */}
        <CollapsibleSection title="Currency settings">
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 16,
            }}
          >
            Configure accounting and reporting currencies. Transaction currency is set per document
            (invoice, payment) and can be any currency. Daily rates are imported automatically from
            the selected source. Closing rates and monthly averages are derived from daily rates per
            IAS 21.
          </p>

          <div className="settings-grid">
            <div className="settings-field">
              <label>Accounting currency</label>
              <select
                value={accountingCurrency}
                onChange={(e) => setAccountingCurrency(e.target.value)}
                className="settings-input"
              >
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
              <span className="field-hint">
                Local statutory currency for GL and authority reporting. Set once at company
                creation.
              </span>
            </div>
            <div className="settings-field">
              <label>Reporting currency (optional)</label>
              <select
                value={reportingCurrency}
                onChange={(e) => setReportingCurrency(e.target.value)}
                className="settings-input"
              >
                <option value="">None</option>
                <option value="EUR">EUR — Euro</option>
                <option value="USD">USD — US Dollar</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="PLN">PLN — Polish Zloty</option>
                <option value="SEK">SEK — Swedish Krona</option>
                <option value="CHF">CHF — Swiss Franc</option>
              </select>
              <span className="field-hint">
                Group consolidation currency. Converted independently from transaction currency (not
                via accounting currency).
              </span>
            </div>
          </div>

          <h3 className="section-title" style={{ marginTop: 20, marginBottom: 12 }}>
            Exchange rate sources
          </h3>
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 12,
            }}
          >
            ECB reference rates are imported automatically at ~16:00 CET daily — rates released
            today apply to next business day (per Latvian Accounting Law §5). Custom sources allow
            manual rate entry and are shared across your companies.
          </p>
          <div className="settings-grid">
            <div className="settings-field">
              <label>Accounting currency rate source</label>
              <select
                value={accountingRateSource}
                onChange={(e) => setAccountingRateSource(e.target.value)}
                className="settings-input"
              >
                {SYSTEM_RATE_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                {customRateSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Source for daily rates when converting transaction currency to accounting currency
              </span>
            </div>
            {reportingCurrency && (
              <div className="settings-field">
                <label>Reporting currency rate source</label>
                <select
                  value={reportingRateSource}
                  onChange={(e) => setReportingRateSource(e.target.value)}
                  className="settings-input"
                >
                  {SYSTEM_RATE_SOURCES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  {customRateSources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span className="field-hint">
                  Source for daily rates when converting transaction currency to reporting currency
                </span>
              </div>
            )}
            <div className="settings-field">
              <label>Budget rate source (optional)</label>
              <select
                value={budgetRateSource}
                onChange={(e) => setBudgetRateSource(e.target.value)}
                className="settings-input"
              >
                <option value="">Same as accounting</option>
                {SYSTEM_RATE_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
                {customRateSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Source for exchange rates used in budget and forecast scenarios
              </span>
            </div>
          </div>

          <h3 className="section-title" style={{ marginTop: 20, marginBottom: 12 }}>
            Custom rate sources
          </h3>
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 12,
            }}
          >
            Create custom sources for manual rate entry. These are shared across your companies. You
            can have up to 5 custom sources.
          </p>
          {customRateSources.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {customRateSources.map((src) => {
                const isUsed =
                  accountingRateSource === src.id ||
                  reportingRateSource === src.id ||
                  budgetRateSource === src.id;
                return (
                  <div
                    key={src.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ flex: 1, fontSize: 14 }}>{src.name}</span>
                    <button
                      onClick={() => {
                        if (isUsed) return;
                        setCustomRateSources((prev) => prev.filter((s) => s.id !== src.id));
                      }}
                      disabled={isUsed}
                      style={{
                        padding: '4px 10px',
                        fontSize: 12,
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--bg-card)',
                        color: 'var(--text-secondary)',
                        cursor: isUsed ? 'not-allowed' : 'pointer',
                        opacity: isUsed ? 0.45 : 1,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {customRateSources.length < 5 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                placeholder="Source name, e.g. Internal treasury"
                className="settings-input"
                style={{ flex: 1, maxWidth: 300 }}
                maxLength={40}
              />
              <button
                onClick={() => {
                  const trimmed = newSourceName.trim();
                  if (!trimmed) return;
                  const id = crypto.randomUUID();
                  setCustomRateSources((prev) => [...prev, { id, name: trimmed }]);
                  setNewSourceName('');
                }}
                disabled={!newSourceName.trim()}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-body)',
                  cursor: newSourceName.trim() ? 'pointer' : 'not-allowed',
                  opacity: newSourceName.trim() ? 1 : 0.45,
                }}
              >
                Add source
              </button>
            </div>
          )}

          <p
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              marginTop: 16,
            }}
          >
            ECB rates are imported automatically when the system needs them. View and manage
            exchange rates on the Accounting page.
          </p>
        </CollapsibleSection>

        {/* Block 3: Number & date format — collapsed by default */}
        <CollapsibleSection title="Number format">
          <div className="settings-field">
            <label>Amount display</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(Object.entries(FORMAT_LABELS) as [NumberFormat, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setNumberFormat(key)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border:
                      numberFormat === key
                        ? '2px solid var(--accent, #0A84FF)'
                        : '1px solid #E0E0E0',
                    background: numberFormat === key ? 'var(--accent-bg, #F0F7FF)' : '#fff',
                    color: 'var(--text-primary, #1C1C1C)',
                    fontFamily: 'monospace',
                    fontSize: 14,
                    cursor: 'pointer',
                    fontWeight: numberFormat === key ? 600 : 400,
                  }}
                >
                  €{label}
                </button>
              ))}
            </div>
            <span className="field-hint">How amounts appear across the app</span>
          </div>

          <div className="settings-field" style={{ marginTop: 8 }}>
            <label>Date display</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(Object.entries(DATE_FORMAT_LABELS) as [DateFormat, string][]).map(
                ([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setDateFormat(key)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border:
                        dateFormat === key
                          ? '2px solid var(--accent, #0A84FF)'
                          : '1px solid #E0E0E0',
                      background: dateFormat === key ? 'var(--accent-bg, #F0F7FF)' : '#fff',
                      color: 'var(--text-primary, #1C1C1C)',
                      fontFamily: 'monospace',
                      fontSize: 14,
                      cursor: 'pointer',
                      fontWeight: dateFormat === key ? 600 : 400,
                    }}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
            <span className="field-hint">How dates appear across the app</span>
          </div>

          <div className="settings-field" style={{ marginTop: 8 }}>
            <label>Time display</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(Object.entries(DATETIME_FORMAT_LABELS) as [DateTimeFormat, string][]).map(
                ([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setDateTimeFormat(key)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border:
                        dateTimeFormat === key
                          ? '2px solid var(--accent, #0A84FF)'
                          : '1px solid #E0E0E0',
                      background: dateTimeFormat === key ? 'var(--accent-bg, #F0F7FF)' : '#fff',
                      color: 'var(--text-primary, #1C1C1C)',
                      fontFamily: 'monospace',
                      fontSize: 14,
                      cursor: 'pointer',
                      fontWeight: dateTimeFormat === key ? 600 : 400,
                    }}
                  >
                    {label}
                  </button>
                ),
              )}
            </div>
            <span className="field-hint">24-hour or 12-hour clock</span>
          </div>
        </CollapsibleSection>

        {/* Block 4: Number sequences — collapsed by default */}
        <CollapsibleSection title="Number sequences">
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              marginBottom: 16,
            }}
          >
            Configure how document and record numbers are generated. Numbers grow naturally: 1, 2,
            ... 10, ... 100, etc.
          </p>
          <div className="sequences-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Prefix</th>
                  <th style={{ width: 50 }}>Sep.</th>
                  <th style={{ width: 65 }}>Next #</th>
                  <th>Suffix</th>
                  <th>Preview</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(SEQUENCE_LABELS) as SequenceType[]).map((key) => {
                  const seq = sequences[key] || DEFAULT_SEQUENCES[key];
                  return (
                    <tr key={key}>
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {SEQUENCE_LABELS[key]}
                      </td>
                      <td>
                        <input
                          value={seq.prefix}
                          onChange={(e) =>
                            setSequences((prev) => ({
                              ...prev,
                              [key]: {
                                ...seq,
                                prefix: e.target.value.toUpperCase(),
                              },
                            }))
                          }
                          style={{ width: 64 }}
                        />
                      </td>
                      <td>
                        <input
                          value={seq.separator ?? '-'}
                          onChange={(e) =>
                            setSequences((prev) => ({
                              ...prev,
                              [key]: { ...seq, separator: e.target.value },
                            }))
                          }
                          style={{ width: 36 }}
                          maxLength={2}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={seq.nextNumber}
                          onChange={(e) =>
                            setSequences((prev) => ({
                              ...prev,
                              [key]: {
                                ...seq,
                                nextNumber: Math.max(1, Number(e.target.value)),
                              },
                            }))
                          }
                          style={{ width: 58 }}
                          min={1}
                        />
                      </td>
                      <td>
                        <input
                          value={seq.suffix || ''}
                          onChange={(e) =>
                            setSequences((prev) => ({
                              ...prev,
                              [key]: {
                                ...seq,
                                suffix: e.target.value || undefined,
                              },
                            }))
                          }
                          style={{ width: 56 }}
                          placeholder="e.g. 2026"
                        />
                      </td>
                      <td
                        className="mono"
                        style={{
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatSequencePreview(seq)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            margin: '20px 0',
          }}
        >
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          {saved && <span style={{ color: '#34C759', fontSize: 13 }}>✓ Saved</span>}
        </div>

        {/* Block 5: Company sharing — only visible for owners */}
        {isOwner && (
          <CollapsibleSection title="Team access" defaultExpanded={true}>
            <p
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 16,
              }}
            >
              Share this company with other users. They will see it in their company switcher after
              they sign in.
            </p>

            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-end',
                marginBottom: 16,
                flexWrap: 'wrap',
              }}
            >
              <div className="settings-field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                <label>Email address</label>
                <input
                  type="email"
                  value={shareEmail}
                  onChange={(e) => {
                    setShareEmail(e.target.value);
                    setShareError('');
                  }}
                  placeholder="colleague@example.com"
                  onKeyDown={(e) => e.key === 'Enter' && handleShare()}
                />
              </div>
              <div className="settings-field" style={{ width: 140, marginBottom: 0 }}>
                <label>Access level</label>
                <select
                  value={shareRole}
                  onChange={(e) => setShareRole(e.target.value as 'accountant' | 'viewer')}
                  className="settings-input"
                >
                  <option value="accountant">Full access</option>
                  <option value="viewer">Read only</option>
                </select>
              </div>
              <button
                className="btn-primary"
                onClick={handleShare}
                disabled={!shareEmail.trim() || !shareEmail.includes('@')}
                style={{ height: 36, marginBottom: 0 }}
              >
                Share
              </button>
            </div>
            {shareError && (
              <p
                style={{
                  color: 'var(--error)',
                  fontSize: 12,
                  marginTop: -8,
                  marginBottom: 12,
                }}
              >
                {shareError}
              </p>
            )}
            {shareSuccess && (
              <p
                style={{
                  color: 'var(--success)',
                  fontSize: 12,
                  marginTop: -8,
                  marginBottom: 12,
                }}
              >
                ✓ {shareSuccess}
              </p>
            )}

            {sharingLoading && (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading...</p>
            )}

            {!sharingLoading && sharingList.length === 0 && (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>
                No one else has access to this company yet. Share it by entering their email above.
              </p>
            )}

            {!sharingLoading && sharingList.length > 0 && (
              <table className="data-table" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Access level</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sharingList.map((entry) => (
                    <tr key={entry.userId}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{entry.displayName}</div>
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {entry.email}
                        </div>
                      </td>
                      <td>
                        <select
                          value={entry.role}
                          onChange={(e) =>
                            handleRoleChange(
                              entry.userId,
                              e.target.value as 'accountant' | 'viewer',
                            )
                          }
                          className="settings-input"
                          style={{ width: 130 }}
                        >
                          <option value="accountant">Full access</option>
                          <option value="viewer">Read only</option>
                        </select>
                      </td>
                      <td>
                        <button
                          onClick={() => handleRemoveSharing(entry.userId)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--error)',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                          aria-label={`Remove access for ${entry.email}`}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CollapsibleSection>
        )}

        {/* Block 6: Danger zone — collapsed by default */}
        <CollapsibleSection title="Danger zone" variant="danger">
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginBottom: 16,
            }}
          >
            Permanently delete this company and all its data. This cannot be undone.
          </p>

          {deleteStep === 'idle' && (
            <button
              style={{
                background: 'none',
                border: '1px solid #FF3B30',
                color: '#FF3B30',
                padding: '8px 16px',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
              }}
              onClick={async () => {
                setDeleteError('');
                try {
                  const stats: any = await api.companyStats(companyId);
                  setTxnCount(stats.transactionCount || 0);
                  setDeleteStep(stats.transactionCount > 0 ? 'confirm-txns' : 'confirm');
                } catch {
                  setDeleteStep('confirm');
                }
              }}
            >
              Delete this company
            </button>
          )}

          {deleteStep === 'confirm' && (
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FEE2E2',
                borderRadius: 8,
                padding: 16,
              }}
            >
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#991B1B',
                  margin: '0 0 12px',
                }}
              >
                Are you sure you want to delete <strong>{company.name}</strong>?
              </p>
              <p style={{ fontSize: 12, color: '#991B1B', margin: '0 0 16px' }}>
                All accounts, settings, and data will be permanently removed.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{
                    background: '#FF3B30',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                  onClick={async () => {
                    setDeleteError('');
                    setDeleteStep('deleting');
                    try {
                      await api.deleteCompany(companyId);
                      localStorage.removeItem('era_companyId');
                      setCompanyId('');
                      await refreshCompanies();
                      navigate('/onboarding');
                    } catch (err) {
                      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
                      setDeleteStep('confirm');
                    }
                  }}
                >
                  Yes, delete permanently
                </button>
                <button className="btn-secondary" onClick={() => setDeleteStep('idle')}>
                  Cancel
                </button>
              </div>
              {deleteError && (
                <p style={{ color: '#FF3B30', fontSize: 12, marginTop: 8 }}>{deleteError}</p>
              )}
            </div>
          )}

          {deleteStep === 'confirm-txns' && (
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FEE2E2',
                borderRadius: 8,
                padding: 16,
              }}
            >
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#991B1B',
                  margin: '0 0 8px',
                }}
              >
                ⚠ This company has {txnCount} transaction
                {txnCount !== 1 ? 's' : ''}
              </p>
              <p style={{ fontSize: 12, color: '#991B1B', margin: '0 0 12px' }}>
                Deleting <strong>{company.name}</strong> will permanently remove all journal
                entries, invoices, payments, contacts, and financial data. This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{
                    background: '#991B1B',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                  onClick={async () => {
                    setDeleteError('');
                    setDeleteStep('deleting');
                    try {
                      await api.deleteCompany(companyId);
                      localStorage.removeItem('era_companyId');
                      setCompanyId('');
                      await refreshCompanies();
                      navigate('/onboarding');
                    } catch (err) {
                      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
                      setDeleteStep('confirm-txns');
                    }
                  }}
                >
                  I understand, delete everything
                </button>
                <button className="btn-secondary" onClick={() => setDeleteStep('idle')}>
                  Cancel
                </button>
              </div>
              {deleteError && (
                <p style={{ color: '#FF3B30', fontSize: 12, marginTop: 8 }}>{deleteError}</p>
              )}
            </div>
          )}

          {deleteStep === 'deleting' && (
            <div
              style={{
                background: '#FEF2F2',
                border: '1px solid #FEE2E2',
                borderRadius: 8,
                padding: 16,
              }}
            >
              <p style={{ fontSize: 13, color: '#991B1B' }}>Deleting company and all data...</p>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}
