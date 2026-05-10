import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api, formatApiError } from '../utils/api';
import { useApp } from '../utils/context';
import { formatMoney, formatDate } from '../utils/format';
import { AiInput } from '../components/AiInput';
import type { JournalLineAccountType } from '@shared/types';
import { UniversalGrid, type GridColumn } from '../components/UniversalGrid';

// ─── Types ──────────────────────────────────────────────────

type ViewTab = 'all' | 'posted' | 'recurring';

interface AccountOption {
  code: string;
  name: string;
  isPostable: boolean;
}
interface ContactOption {
  id: string;
  name: string;
  type: 'customer' | 'vendor' | 'both';
}
interface AssetOption {
  id: string;
  code: string;
  name: string;
  assetAccountCode: string;
}
interface ItemOption {
  id: string;
  code: string;
  name: string;
  purchaseAccountCode: string;
  salesAccountCode: string;
}

interface FormLine {
  key: number;
  accountType: JournalLineAccountType;
  accountCode: string;
  accountName: string;
  entityId: string; // contactId, fixedAssetId, itemId, or "" for ledger/bank
  entityName: string;
  debit: string;
  credit: string;
  description: string;
}

const ACCOUNT_TYPE_LABELS: Record<JournalLineAccountType, string> = {
  ledger: 'Ledger',
  customer: 'Customer',
  vendor: 'Vendor',
  bank: 'Bank',
  'fixed-asset': 'Fixed asset',
  item: 'Item',
};

function emptyLine(key: number): FormLine {
  return {
    key,
    accountType: 'ledger',
    accountCode: '',
    accountName: '',
    entityId: '',
    entityName: '',
    debit: '',
    credit: '',
    description: '',
  };
}

// ─── AI Account Guesser ─────────────────────────────────────

const EXPENSE_PATTERNS: Array<{
  keywords: string[];
  debitCode: string;
  creditCode: string;
}> = [
  {
    keywords: ['rent', 'office rent', 'lease'],
    debitCode: '6330',
    creditCode: '2420',
  },
  {
    keywords: ['salary', 'salaries', 'wages', 'payroll'],
    debitCode: '6510',
    creditCode: '2420',
  },
  { keywords: ['insurance'], debitCode: '6360', creditCode: '2420' },
  {
    keywords: ['internet', 'telecom', 'phone'],
    debitCode: '6340',
    creditCode: '2420',
  },
  {
    keywords: ['utilities', 'electricity', 'water', 'heating'],
    debitCode: '6330',
    creditCode: '2420',
  },
  {
    keywords: ['subscription', 'software', 'saas', 'license'],
    debitCode: '6350',
    creditCode: '2420',
  },
  { keywords: ['depreciation'], debitCode: '6380', creditCode: '1240' },
  { keywords: ['loan', 'interest'], debitCode: '6610', creditCode: '2420' },
  { keywords: ['tax', 'taxes'], debitCode: '6710', creditCode: '2420' },
  {
    keywords: ['advertising', 'marketing', 'ads'],
    debitCode: '6370',
    creditCode: '2420',
  },
  {
    keywords: ['transport', 'fuel', 'travel'],
    debitCode: '6340',
    creditCode: '2420',
  },
  {
    keywords: ['accounting', 'audit', 'legal'],
    debitCode: '6350',
    creditCode: '2420',
  },
];

function guessFromText(text: string, accounts: AccountOption[]) {
  const t = text.toLowerCase();
  let debitCode = '',
    creditCode = '';
  for (const p of EXPENSE_PATTERNS) {
    if (p.keywords.some((k) => t.includes(k))) {
      debitCode = p.debitCode;
      creditCode = p.creditCode;
      break;
    }
  }
  const debitAcc = accounts.find((a) => a.code === debitCode);
  const creditAcc = accounts.find((a) => a.code === creditCode);
  const amtMatch =
    text.match(/(\d[\d\s]*[.,]?\d*)\s*(eur|€)/i) || text.match(/(€|eur)\s*(\d[\d\s]*[.,]?\d*)/i);
  let amount = '';
  if (amtMatch) {
    const raw = (amtMatch[1] || amtMatch[2]).replace(/\s/g, '').replace(',', '.');
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) amount = String(parsed);
  }
  // Detect frequency hints
  let frequency = '';
  if (/monthly|every month|per month/i.test(text)) frequency = 'monthly';
  else if (/quarterly|every quarter/i.test(text)) frequency = 'quarterly';
  else if (/yearly|annual|every year/i.test(text)) frequency = 'yearly';

  return {
    debitCode,
    debitName: debitAcc?.name || '',
    creditCode,
    creditName: creditAcc?.name || '',
    amount,
    frequency,
  };
}

function findAccounts(accounts: AccountOption[], query: string): AccountOption[] {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  return accounts
    .filter((a) => a.isPostable && (a.code.startsWith(q) || a.name.toLowerCase().includes(q)))
    .slice(0, 8);
}

function getNextRunDate(frequency: string): string {
  const d = new Date();
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (frequency === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── Component ──────────────────────────────────────────────

export function JournalEntries() {
  const { companyId, numberFormat: fmt, dateFormat: dfmt } = useApp();

  // Data
  const [entries, setEntries] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [loading, setLoading] = useState(true);

  // View & filters
  const [tab, setTab] = useState<ViewTab>('all');

  // Form
  const [showForm, setShowForm] = useState(false);
  const [formDesc, setFormDesc] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<FormLine[]>([emptyLine(1), emptyLine(2)]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState('monthly');
  const [nextRunDate, setNextRunDate] = useState(() => getNextRunDate('monthly'));
  const [creating, setCreating] = useState(false);
  const [lineKeyCounter, setLineKeyCounter] = useState(3);

  // Suggestions
  const [focusField, setFocusField] = useState('');
  const [suggestions, setSuggestions] = useState<AccountOption[]>([]);

  // ─── Data Loading ───────────────────────────────────────

  useEffect(() => {
    if (!companyId) return;
    loadData();
  }, [companyId]);

  async function loadData() {
    setLoading(true);
    try {
      const [entryData, templateData, accountData, contactData, assetData, itemData] =
        await Promise.all([
          api.journalEntries(companyId).catch(() => []),
          api.recurringTemplates(companyId).catch(() => []),
          api.accounts(companyId).catch(() => []),
          api.contacts(companyId).catch(() => []),
          api.fixedAssets(companyId).catch(() => []),
          api.items(companyId).catch(() => []),
        ]);
      // Only show manually posted entries (not system-generated from invoices/payments)
      setEntries(
        (entryData as any[]).filter((e: any) => e.sourceType === 'manual' || !e.sourceType),
      );
      setTemplates(templateData as any[]);
      setAccounts(
        (accountData as any[]).map((a: any) => ({
          code: a.code,
          name: a.name,
          isPostable: a.isPostable,
        })),
      );
      setContacts(
        (contactData as any[]).map((c: any) => ({
          id: c.id,
          name: c.name || c.shortName,
          type: c.type,
        })),
      );
      setAssets(
        (assetData as any[]).map((a: any) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          assetAccountCode: a.assetAccountCode,
        })),
      );
      setItems(
        (itemData as any[]).map((i: any) => ({
          id: i.id,
          code: i.code,
          name: i.name,
          purchaseAccountCode: i.purchaseAccountCode,
          salesAccountCode: i.salesAccountCode,
        })),
      );
    } finally {
      setLoading(false);
    }
  }

  // ─── Line Management ───────────────────────────────────

  function updateLine(key: number, patch: Partial<FormLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    const k = lineKeyCounter;
    setLineKeyCounter(k + 1);
    setLines((prev) => [...prev, emptyLine(k)]);
  }

  function removeLine(key: number) {
    setLines((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.key !== key)));
  }

  // When account type changes, resolve the default GL account
  function handleAccountTypeChange(key: number, type: JournalLineAccountType) {
    updateLine(key, {
      accountType: type,
      accountCode: '',
      accountName: '',
      entityId: '',
      entityName: '',
    });
  }

  // When an entity is selected (customer, vendor, asset, item), auto-fill the GL account
  function handleEntitySelect(key: number, line: FormLine, entityId: string, entityName: string) {
    let accountCode = '',
      accountName = '';
    if (line.accountType === 'customer') {
      // Default AR control account
      const ar = accounts.find((a) => a.code === '2310');
      accountCode = ar?.code || '2310';
      accountName = ar?.name || 'Accounts receivable';
    } else if (line.accountType === 'vendor') {
      // Default AP control account
      const ap = accounts.find((a) => a.code === '5310');
      accountCode = ap?.code || '5310';
      accountName = ap?.name || 'Accounts payable';
    } else if (line.accountType === 'fixed-asset') {
      const asset = assets.find((a) => a.id === entityId);
      accountCode = asset?.assetAccountCode || '';
      accountName = accounts.find((a) => a.code === accountCode)?.name || '';
    } else if (line.accountType === 'item') {
      const item = items.find((i) => i.id === entityId);
      // Use purchase account as default for inventory
      accountCode = item?.purchaseAccountCode || '';
      accountName = accounts.find((a) => a.code === accountCode)?.name || '';
    }
    updateLine(key, { entityId, entityName, accountCode, accountName });
  }

  function handleAccountCodeChange(key: number, code: string) {
    updateLine(key, { accountCode: code });
    const acc = accounts.find((a) => a.code === code);
    if (acc) updateLine(key, { accountCode: code, accountName: acc.name });
    setSuggestions(findAccounts(accounts, code));
  }

  function _handleAccountNameChange(key: number, name: string) {
    updateLine(key, { accountName: name });
    const acc = accounts.find((a) => a.isPostable && a.name.toLowerCase() === name.toLowerCase());
    if (acc) updateLine(key, { accountName: name, accountCode: acc.code });
    setSuggestions(findAccounts(accounts, name));
  }

  function selectAccount(key: number, acc: AccountOption) {
    updateLine(key, { accountCode: acc.code, accountName: acc.name });
    setSuggestions([]);
  }

  // ─── AI Auto-fill ──────────────────────────────────────

  function handleAiFill(text: string) {
    const guess = guessFromText(text, accounts);
    const newLines = [...lines];
    if (guess.debitCode && newLines.length >= 1) {
      newLines[0] = {
        ...newLines[0],
        accountCode: guess.debitCode,
        accountName: guess.debitName,
        debit: guess.amount,
        credit: '',
      };
    }
    if (guess.creditCode && newLines.length >= 2) {
      newLines[1] = {
        ...newLines[1],
        accountCode: guess.creditCode,
        accountName: guess.creditName,
        debit: '',
        credit: guess.amount,
      };
    }
    setLines(newLines);
    if (!formDesc) setFormDesc(text.slice(0, 100));
    if (guess.frequency) {
      setIsRecurring(true);
      setFrequency(guess.frequency);
      setNextRunDate(getNextRunDate(guess.frequency));
    }
  }

  // ─── Submit ────────────────────────────────────────────

  async function handleSubmit() {
    if (!formDesc.trim()) return;
    const journalLines = lines
      .filter((l) => l.accountCode && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
      .map((l) => ({
        accountType: l.accountType !== 'ledger' ? l.accountType : undefined,
        accountCode: l.accountCode,
        accountName: l.accountName || l.accountCode,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description || undefined,
        contactId:
          l.accountType === 'customer' || l.accountType === 'vendor'
            ? l.entityId || undefined
            : undefined,
        contactName:
          l.accountType === 'customer' || l.accountType === 'vendor'
            ? l.entityName || undefined
            : undefined,
        fixedAssetId: l.accountType === 'fixed-asset' ? l.entityId || undefined : undefined,
        fixedAssetCode: l.accountType === 'fixed-asset' ? l.entityName || undefined : undefined,
        itemId: l.accountType === 'item' ? l.entityId || undefined : undefined,
        itemCode: l.accountType === 'item' ? l.entityName || undefined : undefined,
      }));
    if (journalLines.length < 2) return;

    setCreating(true);
    try {
      if (isRecurring) {
        await api.createRecurringTemplate(companyId, {
          name: formDesc.slice(0, 80),
          description: formDesc,
          frequency,
          nextRunDate,
          lines: journalLines,
        });
      } else {
        await api.postJournalEntry(companyId, {
          date: formDate,
          description: formDesc,
          lines: journalLines,
          sourceType: 'manual',
        });
      }
      resetForm();
      loadData();
    } finally {
      setCreating(false);
    }
  }

  function resetForm() {
    setShowForm(false);
    setFormDesc('');
    setFormDate(new Date().toISOString().slice(0, 10));
    setLines([emptyLine(1), emptyLine(2)]);
    setIsRecurring(false);
    setFrequency('monthly');
    setNextRunDate(getNextRunDate('monthly'));
    setLineKeyCounter(3);
  }

  async function handleExecuteTemplate(templateId: string) {
    await api.executeTemplate(companyId, templateId);
    loadData();
  }

  async function handleRevertEntry(entryId: string, entryNumber?: string) {
    const ok = window.confirm(
      `Revert journal entry ${entryNumber ?? entryId}?\n\nThis posts a counter-entry. The original is preserved and marked "reversed".`,
    );
    if (!ok) return;
    try {
      await api.reverseJournalEntry(companyId, entryId);
      await loadData();
    } catch (e) {
      window.alert(`Reversal failed: ${formatApiError(e)}`);
    }
  }

  // ─── Combined grid rows ───────────────────────────────

  const unifiedRows = useMemo(() => {
    const rows: any[] = [];

    if (tab === 'all' || tab === 'posted') {
      for (const e of entries) {
        rows.push({
          id: e.id,
          kind: 'entry' as const,
          date: e.date,
          description: e.description,
          amount: e.totalDebit || 0,
          status: e.status,
          entryNumber: e.entryNumber,
          lines: e.lines,
          raw: e,
        });
      }
    }

    if (tab === 'all' || tab === 'recurring') {
      for (const t of templates) {
        rows.push({
          id: t.id,
          kind: 'recurring' as const,
          date: t.nextRunDate || t.createdAt?.slice(0, 10) || '',
          description: t.name,
          amount: t.lines?.reduce((s: number, l: any) => s + (l.debit || 0), 0) || 0,
          status: t.isActive ? 'recurring' : 'inactive',
          frequency: t.frequency,
          nextRunDate: t.nextRunDate,
          lastRunDate: t.lastRunDate,
          lines: t.lines,
          raw: t,
        });
      }
    }

    return rows;
  }, [entries, templates, tab]);

  const gridColumns: GridColumn<any>[] = [
    {
      id: 'date',
      header: 'Date',
      accessor: (row) => row.date || '',
      render: (row) => (row.date ? formatDate(row.date, dfmt) : '—'),
    },
    {
      id: 'description',
      header: 'Description',
      accessor: (row) => row.description || '',
      render: (row) => (
        <span style={{ fontWeight: 500 }}>
          {row.description}
          {row.entryNumber && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                color: 'var(--text-tertiary)',
              }}
            >
              {row.entryNumber}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      accessor: (row) => Number(row.amount || 0),
      render: (row) => <span className="num">{formatMoney(row.amount, fmt)}</span>,
      align: 'right',
    },
    {
      id: 'status',
      header: 'Status',
      hideOnMobile: true,
      accessor: (row) =>
        row.kind === 'recurring' ? `recurring ${row.frequency || ''}` : row.status || '',
      render: (row) =>
        row.kind === 'recurring' ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span
              className="badge"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
            >
              recurring · {row.frequency}
            </span>
            {row.nextRunDate && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                next: {formatDate(row.nextRunDate, dfmt)}
              </span>
            )}
          </span>
        ) : (
          <span className={`badge ${row.status === 'reversed' ? 'badge-warning' : ''}`}>
            {row.status}
          </span>
        ),
    },
    {
      id: 'actions',
      header: '',
      hideOnMobile: true,
      accessor: (row) => row.kind,
      render: (row) =>
        row.kind === 'recurring' ? (
          <button
            className="btn-secondary"
            style={{ padding: '2px 10px', fontSize: 12 }}
            onClick={() => handleExecuteTemplate(row.id)}
          >
            Post now
          </button>
        ) : (
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <Link
              to={`/audit/entry/${row.id}`}
              title="View audit trail"
              style={{ fontSize: 12, padding: '2px 8px' }}
            >
              Audit
            </Link>
            {row.status !== 'reversed' && (
              <button
                className="btn-secondary"
                title="Reverse this entry"
                style={{ padding: '2px 10px', fontSize: 12 }}
                onClick={() => handleRevertEntry(row.id, row.entryNumber)}
              >
                ↩️ Revert
              </button>
            )}
          </span>
        ),
      searchable: false,
      filterable: false,
      sortable: false,
    },
  ];

  // ─── Totals ────────────────────────────────────────────

  const formTotalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const formTotalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(formTotalDebit - formTotalCredit) < 0.005 && formTotalDebit > 0;
  const hasRequiredFields =
    formDesc.trim() &&
    lines.filter((l) => l.accountCode && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
      .length >= 2;

  // AI-first: form fields only shown after AI has filled something
  const formFilled =
    formDesc.trim() !== '' ||
    lines.some((l) => l.accountCode !== '' || l.debit !== '' || l.credit !== '');

  if (!companyId)
    return (
      <div className="empty-state">
        <div className="icon">🏢</div>
        <h3>No company selected</h3>
        <p>Add a company first to create journal entries.</p>
      </div>
    );

  // ─── Suggestion dropdown style ─────────────────────────

  const suggestionStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 10,
    background: '#fff',
    border: '1px solid #E8E8E8',
    borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    maxHeight: 200,
    overflowY: 'auto',
  };
  const suggestionItemStyle: React.CSSProperties = {
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    justifyContent: 'space-between',
  };

  // ─── Entity options for a given line ───────────────────

  function getEntityOptions(type: JournalLineAccountType): { id: string; label: string }[] {
    if (type === 'customer')
      return contacts
        .filter((c) => c.type === 'customer' || c.type === 'both')
        .map((c) => ({ id: c.id, label: c.name }));
    if (type === 'vendor')
      return contacts
        .filter((c) => c.type === 'vendor' || c.type === 'both')
        .map((c) => ({ id: c.id, label: c.name }));
    if (type === 'fixed-asset')
      return assets.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }));
    if (type === 'item') return items.map((i) => ({ id: i.id, label: `${i.code} — ${i.name}` }));
    return [];
  }

  // Bank accounts come from accounts starting with "2420" or type=asset bank accounts
  const bankAccounts = accounts.filter(
    (a) => a.isPostable && (a.code.startsWith('242') || a.name.toLowerCase().includes('bank')),
  );

  return (
    <div>
      <div className="page-header-bar">
        <h2 className="page-title" style={{ marginBottom: 0 }}>
          Journal entries
        </h2>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New entry'}
        </button>
      </div>

      {/* ─── Create Form ─────────────────────────────────── */}
      {showForm && (
        <div className="settings-card" style={{ marginBottom: 20 }}>
          {/* AI description input — always visible */}
          <div style={{ marginBottom: formFilled ? 16 : 0 }}>
            <AiInput
              placeholder="e.g. 'Monthly rent 1200 EUR from bank' or 'Pay vendor Acme 500 EUR'"
              onSubmit={async (text) => handleAiFill(text)}
              clearOnSubmit={false}
            />
          </div>

          {formFilled && (
            <div>
              {/* Header fields */}
              <div className="form-grid-2">
                <div>
                  <div className="detail-label required">Description</div>
                  <input
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="Entry description"
                    className="settings-input"
                  />
                </div>
                {!isRecurring && (
                  <div>
                    <div className="detail-label required">Posting date</div>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="settings-input"
                    />
                  </div>
                )}
              </div>

              {/* Recurring toggle */}
              <div
                style={{
                  margin: '16px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text-body)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => {
                      setIsRecurring(e.target.checked);
                      if (e.target.checked) setNextRunDate(getNextRunDate(frequency));
                    }}
                    style={{
                      width: 16,
                      height: 16,
                      accentColor: 'var(--accent)',
                    }}
                  />
                  Make recurring
                </label>
                {isRecurring && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <select
                      value={frequency}
                      onChange={(e) => {
                        setFrequency(e.target.value);
                        setNextRunDate(getNextRunDate(e.target.value));
                      }}
                      className="settings-input"
                      style={{ width: 'auto' }}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Next:</span>
                      <input
                        type="date"
                        value={nextRunDate}
                        onChange={(e) => setNextRunDate(e.target.value)}
                        className="settings-input"
                        style={{ width: 'auto' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Journal lines */}
              <div style={{ marginTop: 8 }}>
                <div className="detail-label" style={{ marginBottom: 8 }}>
                  Lines
                </div>
                <table className="data-table" style={{ marginBottom: 8 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Type</th>
                      <th style={{ width: 160 }}>Entity / Account</th>
                      <th>GL account</th>
                      <th style={{ width: 120 }}>Debit</th>
                      <th style={{ width: 120 }}>Credit</th>
                      <th style={{ width: 32 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const needsEntity =
                        line.accountType !== 'ledger' && line.accountType !== 'bank';
                      const isBankType = line.accountType === 'bank';
                      const entityOpts = getEntityOptions(line.accountType);
                      const fieldId = `line-${line.key}`;

                      return (
                        <tr key={line.key}>
                          {/* Account type */}
                          <td>
                            <select
                              value={line.accountType}
                              onChange={(e) =>
                                handleAccountTypeChange(
                                  line.key,
                                  e.target.value as JournalLineAccountType,
                                )
                              }
                              className="settings-input"
                              style={{ fontSize: 12, padding: '4px 6px' }}
                              aria-label="Account type"
                            >
                              {(Object.keys(ACCOUNT_TYPE_LABELS) as JournalLineAccountType[]).map(
                                (t) => (
                                  <option key={t} value={t}>
                                    {ACCOUNT_TYPE_LABELS[t]}
                                  </option>
                                ),
                              )}
                            </select>
                          </td>

                          {/* Entity or bank selector */}
                          <td>
                            {needsEntity ? (
                              <select
                                value={line.entityId}
                                onChange={(e) => {
                                  const opt = entityOpts.find((o) => o.id === e.target.value);
                                  handleEntitySelect(
                                    line.key,
                                    line,
                                    e.target.value,
                                    opt?.label || '',
                                  );
                                }}
                                className="settings-input"
                                style={{ fontSize: 12, padding: '4px 6px' }}
                                aria-label={`Select ${ACCOUNT_TYPE_LABELS[line.accountType]}`}
                              >
                                <option value="">Select...</option>
                                {entityOpts.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            ) : isBankType ? (
                              <select
                                value={line.accountCode}
                                onChange={(e) => {
                                  const acc = bankAccounts.find((a) => a.code === e.target.value);
                                  updateLine(line.key, {
                                    accountCode: e.target.value,
                                    accountName: acc?.name || '',
                                  });
                                }}
                                className="settings-input"
                                style={{ fontSize: 12, padding: '4px 6px' }}
                                aria-label="Select bank account"
                              >
                                <option value="">Select bank...</option>
                                {bankAccounts.map((a) => (
                                  <option key={a.code} value={a.code}>
                                    {a.code} — {a.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span
                                style={{
                                  fontSize: 12,
                                  color: 'var(--text-tertiary)',
                                }}
                              >
                                —
                              </span>
                            )}
                          </td>

                          {/* GL account (auto-filled for non-ledger types, editable for ledger) */}
                          <td style={{ position: 'relative' }}>
                            {line.accountType === 'ledger' ? (
                              <>
                                <input
                                  value={line.accountCode}
                                  onChange={(e) =>
                                    handleAccountCodeChange(line.key, e.target.value)
                                  }
                                  onFocus={() => setFocusField(fieldId)}
                                  onBlur={() => setTimeout(() => setFocusField(''), 150)}
                                  placeholder="Code or name"
                                  className="settings-input"
                                  style={{ fontSize: 12, padding: '4px 6px' }}
                                  aria-label="GL account"
                                />
                                {focusField === fieldId && suggestions.length > 0 && (
                                  <div style={suggestionStyle}>
                                    {suggestions.map((a) => (
                                      <div
                                        key={a.code}
                                        style={suggestionItemStyle}
                                        onMouseDown={() => selectAccount(line.key, a)}
                                      >
                                        <span className="mono">{a.code}</span>
                                        <span
                                          style={{
                                            color: 'var(--text-secondary)',
                                            marginLeft: 8,
                                          }}
                                        >
                                          {a.name}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="mono" style={{ fontSize: 12 }}>
                                {line.accountCode
                                  ? `${line.accountCode} ${line.accountName}`
                                  : 'Auto-filled'}
                              </span>
                            )}
                          </td>

                          {/* Debit */}
                          <td>
                            <input
                              type="number"
                              value={line.debit}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  debit: e.target.value,
                                  credit: e.target.value ? '' : line.credit,
                                })
                              }
                              placeholder="0.00"
                              className="settings-input"
                              style={{
                                fontSize: 12,
                                padding: '4px 6px',
                                textAlign: 'right',
                              }}
                              step="0.01"
                              min="0"
                              aria-label="Debit amount"
                            />
                          </td>

                          {/* Credit */}
                          <td>
                            <input
                              type="number"
                              value={line.credit}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  credit: e.target.value,
                                  debit: e.target.value ? '' : line.debit,
                                })
                              }
                              placeholder="0.00"
                              className="settings-input"
                              style={{
                                fontSize: 12,
                                padding: '4px 6px',
                                textAlign: 'right',
                              }}
                              step="0.01"
                              min="0"
                              aria-label="Credit amount"
                            />
                          </td>

                          {/* Remove */}
                          <td>
                            {lines.length > 2 && (
                              <button
                                onClick={() => removeLine(line.key)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--text-tertiary)',
                                  fontSize: 16,
                                }}
                                aria-label="Remove line"
                              >
                                ×
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td
                        colSpan={3}
                        style={{
                          textAlign: 'right',
                          fontWeight: 500,
                          fontSize: 12,
                        }}
                      >
                        Total
                      </td>
                      <td className="num" style={{ fontSize: 12, fontWeight: 500 }}>
                        {formatMoney(formTotalDebit, fmt)}
                      </td>
                      <td className="num" style={{ fontSize: 12, fontWeight: 500 }}>
                        {formatMoney(formTotalCredit, fmt)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={addLine}
                  >
                    + Add line
                  </button>
                  {!isBalanced && formTotalDebit > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--error)' }}>
                      Entry is not balanced (difference:{' '}
                      {formatMoney(Math.abs(formTotalDebit - formTotalCredit), fmt)})
                    </span>
                  )}
                  {isBalanced && (
                    <span style={{ fontSize: 12, color: 'var(--success)' }}>✓ Balanced</span>
                  )}
                </div>
              </div>

              {/* Submit */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={creating || !hasRequiredFields || !isBalanced}
                >
                  {creating ? 'Saving...' : isRecurring ? 'Create recurring entry' : 'Post entry'}
                </button>
                <button className="btn-secondary" onClick={resetForm}>
                  Reset
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab Bar ─────────────────────────────────────── */}
      <div className="coa-level-controls" style={{ marginBottom: 12 }}>
        {(
          [
            ['all', 'All'],
            ['posted', 'Posted'],
            ['recurring', 'Recurring'],
          ] as [ViewTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`coa-level-btn${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── Content ─────────────────────────────────────── */}
      {loading ? (
        <p style={{ color: '#A0A0A0' }}>Loading...</p>
      ) : unifiedRows.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📒</div>
          <h3>No journal entries</h3>
          <p>
            Create entries for adjustments, accruals, or set up recurring entries for rent,
            salaries, and more.
          </p>
        </div>
      ) : (
        <UniversalGrid
          rows={unifiedRows}
          columns={gridColumns}
          rowKey={(row) => String(row.id)}
          searchPlaceholder="Search entries..."
          emptyMessage="No matching entries. Try adjusting filters."
          initialSort={{ columnId: 'date', direction: 'desc' }}
        />
      )}
    </div>
  );
}
