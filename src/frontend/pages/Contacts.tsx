import React, { useEffect, useMemo, useState } from 'react';
import { api, formatApiError } from '../utils/api';
import { useApp } from '../utils/context';
import { formatMoney } from '../utils/format';
import { AiInput } from '../components/AiInput';
import { UniversalGrid, type GridColumn } from '../components/UniversalGrid';

interface ContactForm {
  type: 'customer' | 'vendor' | 'both';
  name: string;
  registrationNumber: string;
  vatNumber: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  postalCode: string;
  country: string;
  iban: string;
  swift: string;
  bankName: string;
  paymentTermsDays: string;
  notes: string;
}

interface RegisterResult {
  registrationNumber: string;
  name: string;
  legalForm: string;
  address: string;
  registeredDate?: string;
}

interface RegisterDiff {
  field: string;
  current: string;
  register: string;
}

interface RegisterPanelData {
  found: boolean;
  diffs: RegisterDiff[];
  registerData?: {
    name: string;
    registrationNumber: string;
    vatNumber?: string;
    legalForm: string;
    address: string;
  };
  error?: string;
}

const EMPTY_FORM: ContactForm = {
  type: 'customer',
  name: '',
  registrationNumber: '',
  vatNumber: '',
  email: '',
  phone: '',
  addressLine1: '',
  city: '',
  postalCode: '',
  country: 'Latvia',
  iban: '',
  swift: '',
  bankName: '',
  paymentTermsDays: '30',
  notes: '',
};

export function Contacts() {
  const { companyId, numberFormat: fmt, toast } = useApp();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [txns, setTxns] = useState<any>(null);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [filter, setFilter] = useState<'' | 'customer' | 'vendor'>('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Merge state
  const [showMerge, setShowMerge] = useState(false);
  const [mergeSearch, setMergeSearch] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeResult, setMergeResult] = useState<any>(null);

  // Register check state
  const [showRegisterPanel, setShowRegisterPanel] = useState(false);
  const [registerSource, setRegisterSource] = useState<'lv' | 'vies'>('lv');
  const [registerQuery, setRegisterQuery] = useState('');
  const [registerResults, setRegisterResults] = useState<RegisterResult[]>([]);
  const [registerSearchDone, setRegisterSearchDone] = useState(false);
  const [registerData, setRegisterData] = useState<RegisterPanelData | null>(null);
  const [viesResult, setViesResult] = useState<{
    valid: boolean;
    name?: string;
    address?: string;
    countryCode?: string;
    vatNumber?: string;
    source?: string;
  } | null>(null);
  const [vidStatus, setVidStatus] = useState<{
    vatPayer?: {
      isRegistered: boolean;
      vatNumber?: string;
      registeredDate?: string;
      excludedDate?: string;
      isConstruction?: boolean;
      checkedAt: string;
    };
    suspended?: {
      isSuspended: boolean;
      companyName?: string;
      suspendedFrom?: string;
      suspendedUntil?: string;
      restorationDate?: string;
      checkedAt: string;
    };
  } | null>(null);
  const [checkingRegister, setCheckingRegister] = useState(false);
  const [applyingRegister, setApplyingRegister] = useState(false);

  function normalizeRegNumber(value: string | undefined): string {
    return String(value || '')
      .replace(/\s/g, '')
      .toLowerCase();
  }

  function buildAddress(value: any): string {
    return [value?.address?.line1, value?.address?.city, value?.address?.postalCode]
      .filter(Boolean)
      .join(', ');
  }

  function buildRegisterPanelData(contact: any, registerEntry: RegisterResult): RegisterPanelData {
    const diffs: RegisterDiff[] = [];
    const currentAddress = buildAddress(contact);

    if (registerEntry.name && registerEntry.name !== contact.name) {
      diffs.push({
        field: 'name',
        current: contact.name || '—',
        register: registerEntry.name,
      });
    }

    if (
      registerEntry.registrationNumber &&
      normalizeRegNumber(registerEntry.registrationNumber) !==
        normalizeRegNumber(contact.registrationNumber)
    ) {
      diffs.push({
        field: 'registration number',
        current: contact.registrationNumber || '—',
        register: registerEntry.registrationNumber,
      });
    }

    if (registerEntry.address && registerEntry.address !== currentAddress) {
      diffs.push({
        field: 'address',
        current: currentAddress || '—',
        register: registerEntry.address,
      });
    }

    // Auto-derive VAT number for Latvian companies (LV + reg number)
    const derivedVat = registerEntry.registrationNumber
      ? `LV${registerEntry.registrationNumber}`
      : undefined;
    if (derivedVat && derivedVat !== contact.vatNumber) {
      diffs.push({
        field: 'VAT number',
        current: contact.vatNumber || '—',
        register: derivedVat,
      });
    }

    return {
      found: true,
      diffs,
      registerData: {
        name: registerEntry.name,
        registrationNumber: registerEntry.registrationNumber,
        vatNumber: derivedVat,
        legalForm: registerEntry.legalForm,
        address: registerEntry.address,
      },
    };
  }

  function loadContacts() {
    if (!companyId) return;
    api
      .contacts(companyId)
      .then((data: any) => {
        setContacts(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    loadContacts();
  }, [companyId]);

  async function handleSelect(c: any) {
    setSelected(c);
    setLoadingTxns(true);
    try {
      const data = await api.contactTransactions(companyId, c.id);
      setTxns(data);
    } catch {
      setTxns(null);
    }
    setLoadingTxns(false);
  }

  async function handleAiParse(text: string) {
    const fields = (await api.parseContactDescription(companyId, text)) as any;
    setForm({
      type: fields.type || 'customer',
      name: fields.name || '',
      registrationNumber: fields.registrationNumber || '',
      vatNumber: fields.vatNumber || '',
      email: fields.email || '',
      phone: fields.phone || '',
      addressLine1: fields.address?.line1 || '',
      city: fields.address?.city || '',
      postalCode: fields.address?.postalCode || '',
      country: fields.address?.country || 'Latvia',
      iban: fields.bankAccount?.iban || '',
      swift: fields.bankAccount?.swift || '',
      bankName: fields.bankAccount?.bankName || '',
      paymentTermsDays: String(fields.paymentTermsDays ?? 30),
      notes: fields.notes || '',
    });
    setShowForm(true);
    setFormVerifyStatus(null);

    // Auto-verify in register if we have a name or reg number
    const searchQuery = fields.registrationNumber || fields.name || '';
    if (searchQuery.length >= 2) {
      autoVerifyForm(searchQuery, {
        type: fields.type || 'customer',
        name: fields.name || '',
        registrationNumber: fields.registrationNumber || '',
        vatNumber: fields.vatNumber || '',
        email: fields.email || '',
        phone: fields.phone || '',
        addressLine1: fields.address?.line1 || '',
        city: fields.address?.city || '',
        postalCode: fields.address?.postalCode || '',
        country: fields.address?.country || 'Latvia',
        iban: fields.bankAccount?.iban || '',
        swift: fields.bankAccount?.swift || '',
        bankName: fields.bankAccount?.bankName || '',
        paymentTermsDays: String(fields.paymentTermsDays ?? 30),
        notes: fields.notes || '',
      });
    }
  }

  // ─── Form register verification ────────────────────────────

  const [formVerifyStatus, setFormVerifyStatus] = useState<
    'searching' | 'found' | 'not-found' | null
  >(null);
  const [formVerifySource, setFormVerifySource] = useState('');

  async function autoVerifyForm(query: string, currentForm: ContactForm) {
    setFormVerifyStatus('searching');
    try {
      const result = await api.registerSearch(query);
      const raw = result as Record<string, unknown>;
      const results: RegisterResult[] = Array.isArray(raw?.results)
        ? (raw.results as RegisterResult[])
        : [];
      if (results.length === 0) {
        setFormVerifyStatus('not-found');
        setFormVerifySource(String(raw?.source || ''));
        return;
      }

      // Pick best match: exact reg number match, or first result
      const regNum = currentForm.registrationNumber;
      const match = regNum
        ? results.find(
            (r) => normalizeRegNumber(r.registrationNumber) === normalizeRegNumber(regNum),
          ) || results[0]
        : results[0];

      // Fill empty fields from register data
      setForm((f) => ({
        ...f,
        name: f.name || match.name || f.name,
        registrationNumber: match.registrationNumber || f.registrationNumber,
        vatNumber:
          f.vatNumber || (match.registrationNumber ? `LV${match.registrationNumber}` : f.vatNumber),
        addressLine1: f.addressLine1 || match.address || '',
      }));
      setFormVerifyStatus('found');
      setFormVerifySource(String(raw?.source || 'register'));
    } catch {
      setFormVerifyStatus('not-found');
    }
  }

  async function handleFormVerify() {
    const query = (form.registrationNumber || form.name || '').trim();
    if (query.length < 2) return;
    await autoVerifyForm(query, form);
  }

  async function handleMerge(targetId: string) {
    if (!companyId || !selected) return;
    setMerging(true);
    try {
      const result = (await api.mergeContacts(companyId, selected.id, targetId)) as any;
      setMergeResult(result);
      setShowMerge(false);
      // Refresh and navigate to merged contact
      loadContacts();
      const merged = (await api.contact(companyId, targetId)) as any;
      setSelected(merged);
      const data = await api.contactTransactions(companyId, targetId);
      setTxns(data);
    } catch (e: any) {
      setMergeResult({ error: e.message });
    } finally {
      setMerging(false);
    }
  }

  async function handleRegisterSearch(queryOverride?: string) {
    if (!companyId || !selected) return;
    const query = (queryOverride ?? registerQuery).trim();

    setRegisterSearchDone(true);
    if (query.length < 2) {
      setRegisterResults([]);
      setRegisterData({
        found: false,
        diffs: [],
        error: 'Enter at least 2 characters to search the register.',
      });
      return;
    }

    setCheckingRegister(true);
    setRegisterData(null);
    try {
      const result = (await api.registerSearch(query)) as any;
      const results: RegisterResult[] = Array.isArray(result?.results) ? result.results : [];
      setRegisterResults(results);

      if (results.length === 0) {
        setRegisterData({
          found: false,
          diffs: [],
          error: 'No matching record found in the register.',
        });
        return;
      }

      const exactByReg = selected.registrationNumber
        ? results.find(
            (r) =>
              normalizeRegNumber(r.registrationNumber) ===
              normalizeRegNumber(selected.registrationNumber),
          )
        : undefined;
      const selectedEntry = exactByReg ?? results[0];
      setRegisterData(buildRegisterPanelData(selected, selectedEntry));
    } catch (e: any) {
      setRegisterResults([]);
      setRegisterData({
        found: false,
        diffs: [],
        error: e.message || 'Could not search register.',
      });
    } finally {
      setCheckingRegister(false);
    }
  }

  async function handleViesSearch(queryOverride?: string) {
    if (!selected) return;
    const vatNum = (queryOverride ?? registerQuery).trim();
    setRegisterSearchDone(true);
    setViesResult(null);
    if (vatNum.length < 4) {
      setViesResult({
        valid: false,
        source: 'Enter a full EU VAT number (e.g. DE123456789)',
      });
      return;
    }
    setCheckingRegister(true);
    try {
      const result = await api.viesCheck(vatNum);
      setViesResult(result as typeof viesResult);
    } catch {
      setViesResult({ valid: false, source: 'VIES check failed' });
    } finally {
      setCheckingRegister(false);
    }
  }

  async function handleCheckRegister() {
    if (!selected) return;

    // Auto-detect source: if contact has a VAT number, default to VIES
    const hasVat = !!selected.vatNumber?.trim();
    const source = hasVat ? 'vies' : 'lv';
    setRegisterSource(source);

    const defaultQuery =
      source === 'vies'
        ? (selected.vatNumber || '').trim()
        : (selected.registrationNumber || selected.name || '').trim();

    setShowRegisterPanel(true);
    setRegisterQuery(defaultQuery);
    setRegisterSearchDone(false);
    setRegisterResults([]);
    setRegisterData(null);
    setViesResult(null);
    setVidStatus(null);

    // Always run VID check in parallel if we have a registration number
    const regNum = (selected.registrationNumber || '').replace(/\s/g, '');
    if (regNum.length >= 9) {
      api
        .vidStatus(regNum)
        .then((result) => {
          const r = result as Record<string, unknown>;
          setVidStatus(r as typeof vidStatus);
          // Also update the selected contact in-memory so badges show immediately
          if (r) {
            setSelected((prev: typeof selected) =>
              prev
                ? {
                    ...prev,
                    vidVatStatus: r.vatPayer,
                    vidSuspendedStatus: r.suspended,
                  }
                : prev,
            );
          }
        })
        .catch(() => {
          /* VID check failed silently */
        });
    }

    if (defaultQuery.length >= 2) {
      if (source === 'vies') {
        await handleViesSearch(defaultQuery);
      } else {
        await handleRegisterSearch(defaultQuery);
      }
    }
  }

  function handleUseRegisterResult(registerEntry: RegisterResult) {
    if (!selected) return;
    setRegisterData(buildRegisterPanelData(selected, registerEntry));
  }

  async function handleApplyRegister() {
    if (!companyId || !selected || !registerData?.registerData) return;
    setApplyingRegister(true);
    try {
      const updated = (await api.applyRegister(
        companyId,
        selected.id,
        registerData.registerData,
      )) as any;
      setSelected(updated);
      setShowRegisterPanel(false);
      setRegisterResults([]);
      setRegisterSearchDone(false);
      setRegisterQuery('');
      setRegisterData(null);
      setViesResult(null);
      setVidStatus(null);
      loadContacts();
    } catch {
      // keep panel open on error
    } finally {
      setApplyingRegister(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !companyId) return;
    setSaving(true);
    try {
      await api.createContact(companyId, {
        type: form.type,
        name: form.name,
        registrationNumber: form.registrationNumber || undefined,
        vatNumber: form.vatNumber || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: {
          line1: form.addressLine1,
          city: form.city,
          postalCode: form.postalCode,
          country: form.country,
        },
        bankAccount: form.iban
          ? {
              iban: form.iban,
              swift: form.swift,
              bankName: form.bankName,
            }
          : undefined,
        paymentTermsDays: parseInt(form.paymentTermsDays) || 30,
        notes: form.notes || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      loadContacts();
    } catch (err) {
      toast(formatApiError(err) || 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  }

  // AI-first: form fields only shown after AI has parsed or user has data
  const contactFormFilled =
    form.name.trim() !== '' || form.registrationNumber.trim() !== '' || form.email.trim() !== '';

  const filteredContacts = useMemo(
    () => (filter ? contacts.filter((c) => c.type === filter || c.type === 'both') : contacts),
    [contacts, filter],
  );

  const contactColumns: GridColumn<any>[] = useMemo(
    () => [
      {
        id: 'name',
        header: 'Name',
        accessor: (c) => c.shortName || c.name || '',
        render: (c) => <span style={{ fontWeight: 500 }}>{c.shortName || c.name}</span>,
      },
      {
        id: 'type',
        header: 'Type',
        accessor: (c) => c.type || '',
        render: (c) => <span className="badge">{c.type}</span>,
      },
      {
        id: 'registrationNumber',
        header: 'Reg. number',
        accessor: (c) => c.registrationNumber || '',
        render: (c) => <span className="mono">{c.registrationNumber || '—'}</span>,
      },
      {
        id: 'vatNumber',
        header: 'VAT number',
        accessor: (c) => c.vatNumber || '',
        render: (c) => <span className="mono">{c.vatNumber || '—'}</span>,
      },
      {
        id: 'city',
        header: 'City',
        accessor: (c) => c.address?.city || '',
        render: (c) => c.address?.city || '—',
      },
      {
        id: 'paymentTermsDays',
        header: 'Payment terms',
        accessor: (c) => Number(c.paymentTermsDays ?? 0),
        render: (c) => `${c.paymentTermsDays} days`,
      },
    ],
    [],
  );

  if (!companyId)
    return (
      <div className="empty-state">
        <div className="icon">🏢</div>
        <h3>No company selected</h3>
        <p>Add a company first to manage contacts.</p>
      </div>
    );

  // Detail view
  if (selected) {
    const mergeTargets = contacts.filter(
      (c) =>
        c.id !== selected.id &&
        (!mergeSearch ||
          c.name?.toLowerCase().includes(mergeSearch.toLowerCase()) ||
          c.registrationNumber?.includes(mergeSearch)),
    );

    return (
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <button
            className="btn-secondary"
            onClick={() => {
              setSelected(null);
              setShowRegisterPanel(false);
              setRegisterQuery('');
              setRegisterResults([]);
              setRegisterSearchDone(false);
              setRegisterData(null);
              setViesResult(null);
              setVidStatus(null);
              setShowMerge(false);
              setMergeResult(null);
            }}
          >
            ← Back to list
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={handleCheckRegister}
              disabled={checkingRegister}
              title="Verify contact via local register or EU VIES"
              aria-label="Verify contact"
            >
              {checkingRegister ? 'Checking...' : 'Verify contact'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                setShowMerge(!showMerge);
                setMergeResult(null);
              }}
              aria-label="Merge with another contact"
            >
              Merge contact
            </button>
          </div>
        </div>

        <h2 className="page-title">{selected.name}</h2>

        {/* Merge result notification */}
        {mergeResult && !mergeResult.error && (
          <div
            className="settings-card"
            style={{
              marginBottom: 16,
              borderLeft: '3px solid var(--success, #34C759)',
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-body, #3C3C3C)',
                margin: 0,
              }}
            >
              Contacts merged. Updated {mergeResult.invoicesUpdated} invoice
              {mergeResult.invoicesUpdated !== 1 ? 's' : ''}, {mergeResult.paymentsUpdated} payment
              {mergeResult.paymentsUpdated !== 1 ? 's' : ''}, {mergeResult.journalEntriesUpdated}{' '}
              journal {mergeResult.journalEntriesUpdated !== 1 ? 'entries' : 'entry'}.
            </p>
          </div>
        )}
        {mergeResult?.error && (
          <div
            className="settings-card"
            style={{
              marginBottom: 16,
              borderLeft: '3px solid var(--error, #FF3B30)',
            }}
          >
            <p
              style={{
                fontSize: 13,
                color: 'var(--error, #FF3B30)',
                margin: 0,
              }}
            >
              {mergeResult.error}
            </p>
          </div>
        )}

        {/* Register check panel */}
        {showRegisterPanel && (
          <div className="settings-card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Verify contact</h3>

            {/* Source toggle */}
            <div className="segmented-control" style={{ marginBottom: 12 }}>
              <button
                className={`segmented-btn${registerSource === 'lv' ? ' active' : ''}`}
                onClick={() => {
                  setRegisterSource('lv');
                  setRegisterSearchDone(false);
                  setRegisterResults([]);
                  setRegisterData(null);
                  setViesResult(null);
                  setRegisterQuery(selected?.registrationNumber || selected?.name || '');
                }}
              >
                Local register
              </button>
              <button
                className={`segmented-btn${registerSource === 'vies' ? ' active' : ''}`}
                onClick={() => {
                  setRegisterSource('vies');
                  setRegisterSearchDone(false);
                  setRegisterResults([]);
                  setRegisterData(null);
                  setViesResult(null);
                  setRegisterQuery(selected?.vatNumber || '');
                }}
              >
                EU VIES
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                value={registerQuery}
                onChange={(e) => setRegisterQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (registerSource === 'vies') {
                      handleViesSearch();
                    } else {
                      handleRegisterSearch();
                    }
                  }
                }}
                placeholder={
                  registerSource === 'vies'
                    ? 'EU VAT number (e.g. DE123456789, LV40003999999)'
                    : 'Search by company name or registration number'
                }
                className="table-search-input"
                style={{ flex: 1 }}
                aria-label={registerSource === 'vies' ? 'EU VAT number' : 'Search register'}
                autoFocus
              />
              <button
                className="btn-secondary"
                onClick={() =>
                  registerSource === 'vies' ? handleViesSearch() : handleRegisterSearch()
                }
                disabled={checkingRegister}
              >
                {checkingRegister ? 'Checking...' : registerSource === 'vies' ? 'Verify' : 'Search'}
              </button>
            </div>

            {/* VIES result */}
            {registerSource === 'vies' && viesResult && (
              <div style={{ marginBottom: 12 }}>
                {viesResult.valid ? (
                  <div
                    style={{
                      padding: '12px 14px',
                      background: 'var(--success-bg)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid #D1FAE5',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          color: 'var(--success)',
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        ✓ Valid EU VAT number
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {viesResult.source}
                      </span>
                    </div>
                    {viesResult.name && (
                      <div style={{ fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Name:</span>{' '}
                        <span style={{ fontWeight: 500 }}>{viesResult.name}</span>
                      </div>
                    )}
                    {viesResult.address && (
                      <div style={{ fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Address:</span>{' '}
                        <span>{viesResult.address}</span>
                      </div>
                    )}
                    <div style={{ fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Country:</span>{' '}
                      <span className="mono">{viesResult.countryCode}</span>
                      {' · '}
                      <span style={{ color: 'var(--text-secondary)' }}>VAT:</span>{' '}
                      <span className="mono">
                        {viesResult.countryCode}
                        {viesResult.vatNumber}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '12px 14px',
                      background: 'var(--error-bg)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid #FEE2E2',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          color: 'var(--error)',
                          fontWeight: 600,
                          fontSize: 13,
                        }}
                      >
                        ✗ Invalid or not found
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        margin: '4px 0 0',
                      }}
                    >
                      {viesResult.source}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* VID Status panel — shows for both LV and VIES tabs */}
            {vidStatus && (
              <div
                style={{
                  marginBottom: 12,
                  padding: '12px 14px',
                  background: 'var(--surface-secondary, #F5F5F5)',
                  borderRadius: 'var(--radius-sm)',
                  border: vidStatus.suspended?.isSuspended
                    ? '1px solid #FEE2E2'
                    : '1px solid var(--border, #E5E5E5)',
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  VID — Latvian Tax Authority
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>VAT payer: </span>
                    {vidStatus.vatPayer?.isRegistered ? (
                      <span
                        style={{
                          color: 'var(--success, #34C759)',
                          fontWeight: 600,
                        }}
                      >
                        ✓ Registered
                      </span>
                    ) : (
                      <span
                        style={{
                          color: 'var(--error, #FF3B30)',
                          fontWeight: 600,
                        }}
                      >
                        ✗ Not registered
                      </span>
                    )}
                    {vidStatus.vatPayer?.isConstruction && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        (construction reverse-charge)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Business status: </span>
                    {vidStatus.suspended?.isSuspended ? (
                      <span
                        style={{
                          color: 'var(--error, #FF3B30)',
                          fontWeight: 600,
                        }}
                      >
                        ⚠ Suspended
                        {vidStatus.suspended.suspendedFrom &&
                          ` (${vidStatus.suspended.suspendedFrom} → ${vidStatus.suspended.suspendedUntil || 'ongoing'})`}
                      </span>
                    ) : (
                      <span
                        style={{
                          color: 'var(--success, #34C759)',
                          fontWeight: 600,
                        }}
                      >
                        ✓ Active
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Local register results */}
            {registerSource === 'lv' && registerSearchDone && registerResults.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-secondary, #787878)',
                    margin: '0 0 8px',
                  }}
                >
                  Found {registerResults.length} match
                  {registerResults.length !== 1 ? 'es' : ''}. Choose the correct record.
                </p>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Reg. number</th>
                        <th>Address</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {registerResults.slice(0, 10).map((r) => {
                        const isSelected =
                          registerData?.registerData?.registrationNumber === r.registrationNumber &&
                          registerData?.registerData?.name === r.name;
                        return (
                          <tr key={`${r.registrationNumber}-${r.name}`}>
                            <td style={{ fontWeight: 500 }}>{r.name}</td>
                            <td className="mono">{r.registrationNumber || '—'}</td>
                            <td>{r.address || '—'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                className="btn-secondary"
                                style={{ fontSize: 12, padding: '4px 10px' }}
                                onClick={() => handleUseRegisterResult(r)}
                                disabled={isSelected}
                              >
                                {isSelected ? 'Selected' : 'Use this'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {registerSource === 'lv' && !registerData?.found ? (
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary, #787878)',
                  margin: 0,
                }}
              >
                {registerData?.error || 'Search register to compare and update contact details.'}
              </p>
            ) : registerData?.diffs?.length === 0 ? (
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--success, #34C759)',
                  margin: 0,
                }}
              >
                Contact data matches the register. No updates needed.
              </p>
            ) : (
              <>
                <table className="data-table" style={{ marginBottom: 12 }}>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Current value</th>
                      <th>Register value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registerData?.diffs?.map((d: any) => (
                      <tr key={d.field}>
                        <td
                          style={{
                            fontWeight: 500,
                            textTransform: 'capitalize',
                          }}
                        >
                          {d.field}
                        </td>
                        <td style={{ color: 'var(--text-secondary, #787878)' }}>
                          {d.current || '—'}
                        </td>
                        <td style={{ fontWeight: 500 }}>{d.register}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn-primary"
                    onClick={handleApplyRegister}
                    disabled={applyingRegister}
                  >
                    {applyingRegister ? 'Applying...' : 'Apply updates'}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setShowRegisterPanel(false);
                      setRegisterResults([]);
                      setRegisterSearchDone(false);
                      setRegisterQuery('');
                      setRegisterData(null);
                      setViesResult(null);
                      setVidStatus(null);
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Merge contact picker */}
        {showMerge && (
          <div className="settings-card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              Merge into another contact
            </h3>
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-secondary, #787878)',
                margin: '0 0 12px',
              }}
            >
              Select the contact to keep. All invoices, payments and journal entries from{' '}
              <strong>{selected.shortName || selected.name}</strong> will be reassigned, and this
              contact will be deleted.
            </p>
            <input
              type="text"
              placeholder="Search by name or reg. number..."
              value={mergeSearch}
              onChange={(e) => setMergeSearch(e.target.value)}
              className="table-search-input"
              style={{ marginBottom: 8 }}
              aria-label="Search merge target"
            />
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {mergeTargets.length === 0 ? (
                <p
                  style={{
                    fontSize: 13,
                    color: 'var(--text-tertiary, #A0A0A0)',
                  }}
                >
                  No contacts found
                </p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Reg. number</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergeTargets.slice(0, 10).map((c: any) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 500 }}>{c.shortName || c.name}</td>
                        <td>
                          <span className="badge">{c.type}</span>
                        </td>
                        <td className="mono">{c.registrationNumber || '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                            onClick={() => handleMerge(c.id)}
                            disabled={merging}
                          >
                            {merging ? 'Merging...' : 'Merge here'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <button
              className="btn-secondary"
              style={{ marginTop: 8 }}
              onClick={() => setShowMerge(false)}
            >
              Cancel
            </button>
          </div>
        )}

        <div className="detail-layout">
          <div className="detail-sidebar">
            <div className="settings-card">
              <div className="onboarding-details">
                <div className="detail-row">
                  <span className="detail-label">Type</span>
                  <span className="badge">{selected.type}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Reg. number</span>
                  <span className="mono">{selected.registrationNumber || '—'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">VAT number</span>
                  <span className="mono">{selected.vatNumber || '—'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email</span>
                  <span>{selected.email || '—'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Phone</span>
                  <span>{selected.phone || '—'}</span>
                </div>
                <div className="detail-row" style={{ alignItems: 'flex-start' }}>
                  <span className="detail-label">Address</span>
                  <span style={{ textAlign: 'right', lineHeight: 1.5 }}>
                    {selected.address?.line1 || selected.address?.city ? (
                      <>
                        {selected.address?.line1 && <span>{selected.address.line1}</span>}
                        {selected.address?.city && (
                          <>
                            <br />
                            {[selected.address.city, selected.address.postalCode]
                              .filter(Boolean)
                              .join(', ')}
                          </>
                        )}
                        {selected.address?.country && (
                          <>
                            <br />
                            {selected.address.country}
                          </>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Payment terms</span>
                  <span>{selected.paymentTermsDays} days</span>
                </div>
                {/* VID Status badges */}
                {selected.vidVatStatus && (
                  <div className="detail-row">
                    <span className="detail-label">VAT payer (VID)</span>
                    <span
                      className={`badge ${selected.vidVatStatus.isRegistered ? 'badge-posted' : 'badge-cancelled'}`}
                    >
                      {selected.vidVatStatus.isRegistered ? 'Registered' : 'Not registered'}
                    </span>
                  </div>
                )}
                {selected.vidSuspendedStatus && (
                  <div className="detail-row">
                    <span className="detail-label">Business status (VID)</span>
                    {selected.vidSuspendedStatus.isSuspended ? (
                      <span
                        className="badge badge-overdue"
                        title={`Suspended from ${selected.vidSuspendedStatus.suspendedFrom || '?'} to ${selected.vidSuspendedStatus.suspendedUntil || '?'}`}
                      >
                        ⚠ Suspended
                      </span>
                    ) : (
                      <span className="badge badge-posted">Active</span>
                    )}
                  </div>
                )}
                {(selected.vidVatStatus || selected.vidSuspendedStatus) && (
                  <div className="detail-row">
                    <span className="detail-label">VID checked</span>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--text-tertiary, #A0A0A0)',
                      }}
                    >
                      {new Date(
                        selected.vidVatStatus?.checkedAt || selected.vidSuspendedStatus?.checkedAt,
                      ).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {txns && (
              <div className="settings-card" style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Balance</h3>
                <div className="onboarding-details">
                  <div className="detail-row">
                    <span className="detail-label">Total invoiced</span>
                    <span>{formatMoney(txns.totalInvoiced, fmt)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Total paid</span>
                    <span>{formatMoney(txns.totalPaid, fmt)}</span>
                  </div>
                  <div className="detail-row" style={{ fontWeight: 600 }}>
                    <span className="detail-label">Balance</span>
                    <span
                      style={{
                        color: txns.balance > 0 ? '#FF3B30' : '#34C759',
                      }}
                    >
                      {formatMoney(txns.balance, fmt)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1 }}>
            {loadingTxns ? (
              <p style={{ color: '#A0A0A0' }}>Loading transactions...</p>
            ) : (
              txns && (
                <>
                  <div className="settings-card">
                    <h3
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 12,
                      }}
                    >
                      Invoices ({txns.invoices?.length || 0})
                    </h3>
                    {txns.invoices?.length > 0 ? (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Number</th>
                            <th>Date</th>
                            <th>Net</th>
                            <th>VAT</th>
                            <th>Total</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {txns.invoices.map((inv: any) => (
                            <tr key={inv.id}>
                              <td className="mono">{inv.invoiceNumber}</td>
                              <td>{inv.date}</td>
                              <td className="num">{formatMoney(inv.subtotal, fmt)}</td>
                              <td className="num">{formatMoney(inv.vatAmount, fmt)}</td>
                              <td className="num" style={{ fontWeight: 500 }}>
                                {formatMoney(inv.total, fmt)}
                              </td>
                              <td>
                                <span className={`badge badge-${inv.status}`}>{inv.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ color: '#A0A0A0', fontSize: 13 }}>No invoices</p>
                    )}
                  </div>

                  <div className="settings-card" style={{ marginTop: 16 }}>
                    <h3
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        marginBottom: 12,
                      }}
                    >
                      Payments ({txns.payments?.length || 0})
                    </h3>
                    {txns.payments?.length > 0 ? (
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Reference</th>
                            <th>Amount</th>
                            <th>Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {txns.payments.map((p: any) => (
                            <tr key={p.id}>
                              <td>{p.date}</td>
                              <td>{p.reference}</td>
                              <td className="num" style={{ fontWeight: 500 }}>
                                {formatMoney(p.amount, fmt)}
                              </td>
                              <td>
                                <span className="badge">{p.type}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ color: '#A0A0A0', fontSize: 13 }}>No payments</p>
                    )}
                  </div>
                </>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header-bar">
        <h2 className="page-title" style={{ marginBottom: 0 }}>
          Contacts
        </h2>
        <button className="btn-primary" onClick={() => setShowForm((f) => !f)}>
          {showForm ? 'Cancel' : '+ Add contact'}
        </button>
      </div>

      {showForm && (
        <div className="settings-card" style={{ marginBottom: 20, maxWidth: '100%' }}>
          <div style={{ marginBottom: contactFormFilled ? 16 : 0 }}>
            <AiInput
              placeholder="e.g. 'Vendor SIA Apex, reg 40003112233, Riga, payment 45 days'"
              onSubmit={handleAiParse}
              clearOnSubmit={false}
            />
          </div>

          {contactFormFilled && (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 16,
                }}
              >
                <div className="settings-field">
                  <label>Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="settings-field">
                  <label>Type</label>
                  <select
                    value={form.type}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        type: e.target.value as ContactForm['type'],
                      }))
                    }
                    className="settings-input"
                  >
                    <option value="customer">Customer</option>
                    <option value="vendor">Vendor</option>
                    <option value="both">Both</option>
                  </select>
                </div>

                {/* Register verification row */}
                <div className="settings-field" style={{ gridColumn: '1 / -1' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      className="btn-secondary"
                      style={{
                        fontSize: 'var(--text-sm)',
                        padding: '4px 12px',
                      }}
                      onClick={handleFormVerify}
                      disabled={
                        formVerifyStatus === 'searching' ||
                        (!form.name.trim() && !form.registrationNumber.trim())
                      }
                      type="button"
                    >
                      {formVerifyStatus === 'searching' ? 'Searching...' : '🔍 Verify in register'}
                    </button>
                    {formVerifyStatus === 'found' && (
                      <span style={{ fontSize: 'var(--text-sm)', color: '#34C759' }}>
                        ✓ Verified — fields updated from {formVerifySource}
                      </span>
                    )}
                    {formVerifyStatus === 'not-found' && (
                      <span
                        style={{
                          fontSize: 'var(--text-sm)',
                          color: 'var(--text-tertiary)',
                        }}
                      >
                        Not found in register — enter details manually
                      </span>
                    )}
                  </div>
                </div>

                <div className="settings-field">
                  <label>Registration number</label>
                  <input
                    value={form.registrationNumber}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        registrationNumber: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="settings-field">
                  <label>VAT number</label>
                  <input
                    value={form.vatNumber}
                    onChange={(e) => setForm((f) => ({ ...f, vatNumber: e.target.value }))}
                    placeholder="LV40003290084"
                  />
                </div>
                <div className="settings-field">
                  <label>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="settings-field">
                  <label>Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div className="settings-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Street address</label>
                  <input
                    value={form.addressLine1}
                    onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
                  />
                </div>
                <div className="settings-field">
                  <label>City</label>
                  <input
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  />
                </div>
                <div className="settings-field">
                  <label>Postal code</label>
                  <input
                    value={form.postalCode}
                    onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                  />
                </div>
                <div className="settings-field">
                  <label>Country</label>
                  <input
                    value={form.country}
                    onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                  />
                </div>
                <div className="settings-field">
                  <label>Payment terms (days)</label>
                  <input
                    type="number"
                    value={form.paymentTermsDays}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        paymentTermsDays: e.target.value,
                      }))
                    }
                    min={0}
                  />
                </div>
                <div className="settings-field">
                  <label>IBAN</label>
                  <input
                    value={form.iban}
                    onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
                    placeholder="LV00HABA0551000000000"
                  />
                </div>
                <div className="settings-field">
                  <label>SWIFT / BIC</label>
                  <input
                    value={form.swift}
                    onChange={(e) => setForm((f) => ({ ...f, swift: e.target.value }))}
                  />
                </div>
                <div className="settings-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Bank name</label>
                  <input
                    value={form.bankName}
                    onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                  />
                </div>
                <div className="settings-field" style={{ gridColumn: '1 / -1' }}>
                  <label>Notes</label>
                  <input
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={saving || !form.name.trim()}
                >
                  {saving ? 'Saving...' : 'Save contact'}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setForm(EMPTY_FORM);
                    setShowForm(false);
                    setFormVerifyStatus(null);
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="coa-level-controls" style={{ marginBottom: 12 }}>
        <button
          className={`coa-level-btn ${!filter ? 'active' : ''}`}
          onClick={() => setFilter('')}
        >
          All
        </button>
        <button
          className={`coa-level-btn ${filter === 'vendor' ? 'active' : ''}`}
          onClick={() => setFilter('vendor')}
        >
          Vendors
        </button>
        <button
          className={`coa-level-btn ${filter === 'customer' ? 'active' : ''}`}
          onClick={() => setFilter('customer')}
        >
          Customers
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#A0A0A0' }}>Loading...</p>
      ) : filteredContacts.length === 0 ? (
        contacts.length === 0 ? (
          <div className="empty-state">
            <div className="icon">👥</div>
            <h3>No contacts yet</h3>
            <p>Click "+ Add contact" to create your first contact.</p>
          </div>
        ) : (
          <div className="empty-state">
            <div className="icon">🔍</div>
            <h3>No matching contacts</h3>
            <p>Try adjusting your search or filters.</p>
          </div>
        )
      ) : (
        <UniversalGrid
          rows={filteredContacts}
          columns={contactColumns}
          rowKey={(row) => String(row.id)}
          onRowClick={handleSelect}
          searchPlaceholder="Search contacts..."
          emptyMessage="No matching contacts. Try adjusting filters."
          initialSort={{ columnId: 'name', direction: 'asc' }}
        />
      )}
    </div>
  );
}
