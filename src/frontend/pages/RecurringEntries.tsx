import React, { useEffect, useMemo, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney, formatDate } from "../utils/format";
import { AiInput } from "../components/AiInput";
import { UniversalGrid, type GridColumn } from "../components/UniversalGrid";

interface AccountOption {
  code: string;
  name: string;
  isPostable: boolean;
}

function getNextRunDate(frequency: string): string {
  const d = new Date();
  if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  else if (frequency === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (frequency === "yearly") d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

// Match accounts by code prefix or name substring
function findAccounts(
  accounts: AccountOption[],
  query: string,
): AccountOption[] {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  return accounts
    .filter(
      (a) =>
        a.isPostable &&
        (a.code.startsWith(q) || a.name.toLowerCase().includes(q)),
    )
    .slice(0, 8);
}

function findAccountByCode(
  accounts: AccountOption[],
  code: string,
): AccountOption | undefined {
  return accounts.find((a) => a.code === code);
}

function findAccountByName(
  accounts: AccountOption[],
  name: string,
): AccountOption | undefined {
  const q = name.toLowerCase();
  return accounts.find((a) => a.isPostable && a.name.toLowerCase() === q);
}

// Guess debit/credit accounts from a template name/description
function guessAccounts(
  text: string,
  accounts: AccountOption[],
): {
  debitCode: string;
  debitName: string;
  creditCode: string;
  creditName: string;
} {
  const t = text.toLowerCase();
  let debit = "",
    credit = "",
    debitName = "",
    creditName = "";

  // Common expense patterns
  const patterns: Array<{
    keywords: string[];
    debitCode: string;
    creditCode: string;
  }> = [
    {
      keywords: ["rent", "office rent", "lease"],
      debitCode: "6330",
      creditCode: "2420",
    },
    {
      keywords: ["salary", "salaries", "wages", "payroll"],
      debitCode: "6510",
      creditCode: "2420",
    },
    { keywords: ["insurance"], debitCode: "6360", creditCode: "2420" },
    {
      keywords: ["cleaning", "office cleaning"],
      debitCode: "6330",
      creditCode: "2420",
    },
    {
      keywords: ["internet", "telecom", "phone", "mobile"],
      debitCode: "6340",
      creditCode: "2420",
    },
    {
      keywords: ["utilities", "electricity", "water", "heating"],
      debitCode: "6330",
      creditCode: "2420",
    },
    {
      keywords: ["subscription", "software", "saas", "license"],
      debitCode: "6350",
      creditCode: "2420",
    },
    { keywords: ["depreciation"], debitCode: "6380", creditCode: "1240" },
    { keywords: ["loan", "interest"], debitCode: "6610", creditCode: "2420" },
    { keywords: ["tax", "taxes"], debitCode: "6710", creditCode: "2420" },
    {
      keywords: ["advertising", "marketing", "ads"],
      debitCode: "6370",
      creditCode: "2420",
    },
    {
      keywords: ["transport", "fuel", "travel"],
      debitCode: "6340",
      creditCode: "2420",
    },
    {
      keywords: ["accounting", "audit", "legal"],
      debitCode: "6350",
      creditCode: "2420",
    },
  ];

  for (const p of patterns) {
    if (p.keywords.some((k) => t.includes(k))) {
      debit = p.debitCode;
      credit = p.creditCode;
      break;
    }
  }

  // Look up names
  if (debit) {
    const acc = findAccountByCode(accounts, debit);
    if (acc) debitName = acc.name;
  }
  if (credit) {
    const acc = findAccountByCode(accounts, credit);
    if (acc) creditName = acc.name;
  }

  return { debitCode: debit, debitName, creditCode: credit, creditName };
}

export function RecurringEntries() {
  const { companyId, numberFormat: fmt, dateFormat: dfmt } = useApp();
  const [templates, setTemplates] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    frequency: "monthly",
    debitCode: "",
    debitName: "",
    creditCode: "",
    creditName: "",
    amount: "",
    nextRunDate: getNextRunDate("monthly"),
    quickText: "",
  });
  const [debitSuggestions, setDebitSuggestions] = useState<AccountOption[]>([]);
  const [creditSuggestions, setCreditSuggestions] = useState<AccountOption[]>(
    [],
  );
  const [focusField, setFocusField] = useState<string>("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    loadTemplates();
    api
      .accounts(companyId)
      .then((d: any) => {
        setAccounts(
          (d as any[]).map((a: any) => ({
            code: a.code,
            name: a.name,
            isPostable: a.isPostable,
          })),
        );
      })
      .catch(() => {});
  }, [companyId]);

  function loadTemplates() {
    setLoading(true);
    api
      .recurringTemplates(companyId)
      .then((d: any) => setTemplates(d as any[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function updateForm(patch: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  // Auto-suggest next run date when frequency changes
  function handleFrequencyChange(freq: string) {
    updateForm({ frequency: freq, nextRunDate: getNextRunDate(freq) });
  }

  // When debit code changes, look up the account name
  function handleDebitCodeChange(code: string) {
    updateForm({ debitCode: code });
    const acc = findAccountByCode(accounts, code);
    if (acc) updateForm({ debitCode: code, debitName: acc.name });
    setDebitSuggestions(findAccounts(accounts, code));
  }

  // When debit name changes, search for matching accounts
  function handleDebitNameChange(name: string) {
    updateForm({ debitName: name });
    const acc = findAccountByName(accounts, name);
    if (acc) updateForm({ debitName: name, debitCode: acc.code });
    setDebitSuggestions(findAccounts(accounts, name));
  }

  function handleCreditCodeChange(code: string) {
    updateForm({ creditCode: code });
    const acc = findAccountByCode(accounts, code);
    if (acc) updateForm({ creditCode: code, creditName: acc.name });
    setCreditSuggestions(findAccounts(accounts, code));
  }

  function handleCreditNameChange(name: string) {
    updateForm({ creditName: name });
    const acc = findAccountByName(accounts, name);
    if (acc) updateForm({ creditName: name, creditCode: acc.code });
    setCreditSuggestions(findAccounts(accounts, name));
  }

  function selectDebitAccount(acc: AccountOption) {
    updateForm({ debitCode: acc.code, debitName: acc.name });
    setDebitSuggestions([]);
  }

  function selectCreditAccount(acc: AccountOption) {
    updateForm({ creditCode: acc.code, creditName: acc.name });
    setCreditSuggestions([]);
  }

  async function handleCreate() {
    if (
      !form.name ||
      !form.debitCode ||
      !form.creditCode ||
      !form.amount ||
      !form.nextRunDate
    )
      return;
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) return;
    setCreating(true);
    try {
      await api.createRecurringTemplate(companyId, {
        name: form.name,
        description: form.description,
        frequency: form.frequency,
        nextRunDate: form.nextRunDate,
        lines: [
          {
            accountCode: form.debitCode,
            accountName: form.debitName || form.debitCode,
            debit: amt,
            credit: 0,
          },
          {
            accountCode: form.creditCode,
            accountName: form.creditName || form.creditCode,
            debit: 0,
            credit: amt,
          },
        ],
      });
      setShowForm(false);
      setForm({
        name: "",
        description: "",
        frequency: "monthly",
        debitCode: "",
        debitName: "",
        creditCode: "",
        creditName: "",
        amount: "",
        nextRunDate: getNextRunDate("monthly"),
        quickText: "",
      });
      loadTemplates();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  async function handleExecute(t: any) {
    await api.executeTemplate(companyId, t.id);
    loadTemplates();
  }

  const templateColumns: GridColumn<any>[] = useMemo(
    () => [
      {
        id: "name",
        header: "Name",
        accessor: (t) => t.name || "",
        render: (t) => <span style={{ fontWeight: 500 }}>{t.name}</span>,
      },
      {
        id: "frequency",
        header: "Frequency",
        accessor: (t) => t.frequency || "",
        render: (t) => <span className="badge">{t.frequency}</span>,
      },
      {
        id: "amount",
        header: "Amount",
        accessor: (t) =>
          t.lines?.reduce((s: number, l: any) => s + (l.debit || 0), 0) || 0,
        render: (t) => {
          const amount =
            t.lines?.reduce((s: number, l: any) => s + (l.debit || 0), 0) || 0;
          return <span className="num">{formatMoney(amount, fmt)}</span>;
        },
        align: "right",
      },
      {
        id: "nextRunDate",
        header: "Next run",
        accessor: (t) => t.nextRunDate || "",
        render: (t) => (t.nextRunDate ? formatDate(t.nextRunDate, dfmt) : "-"),
      },
      {
        id: "lastRunDate",
        header: "Last run",
        accessor: (t) => t.lastRunDate || "",
        render: (t) => (t.lastRunDate ? formatDate(t.lastRunDate, dfmt) : "-"),
      },
      {
        id: "actions",
        header: "",
        accessor: (t) => t.id,
        render: (t) => (
          <button
            className="btn-secondary"
            style={{ padding: "2px 10px", fontSize: 12 }}
            onClick={() => handleExecute(t)}
          >
            Execute now
          </button>
        ),
        searchable: false,
        filterable: false,
        sortable: false,
      },
    ],
    [dfmt, fmt],
  );

  if (!companyId)
    return (
      <div className="empty-state">
        <div className="icon">🏢</div>
        <h3>No company selected</h3>
        <p>Add a company first to manage recurring entries.</p>
      </div>
    );

  const suggestionStyle: React.CSSProperties = {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 10,
    background: "#fff",
    border: "1px solid #E8E8E8",
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    maxHeight: 200,
    overflowY: "auto",
  };
  const suggestionItemStyle: React.CSSProperties = {
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 13,
    display: "flex",
    justifyContent: "space-between",
  };

  return (
    <div>
      <div className="coa-header">
        <h2 className="page-title">Recurring entries</h2>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New template"}
        </button>
      </div>

      {showForm && (
        <div className="settings-card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
            New recurring template
          </h3>

          {/* Quick fill with AI + voice */}
          <div style={{ marginBottom: 16 }}>
            <AiInput
              placeholder="e.g. 'Monthly office rent 500 EUR' or 'Quarterly insurance 1200 EUR'"
              onSubmit={async (text) => {
                updateForm({ quickText: text });
                // run quick-fill logic
                const guess = guessAccounts(text, accounts);
                const amtMatch =
                  text.match(/(\d[\d\s]*[.,]?\d*)\s*(eur|€)/i) ||
                  text.match(/(€|eur)\s*(\d[\d\s]*[.,]?\d*)/i);
                let amount = form.amount;
                if (amtMatch) {
                  const raw = (amtMatch[1] || amtMatch[2])
                    .replace(/\s/g, "")
                    .replace(",", ".");
                  const parsed = parseFloat(raw);
                  if (!isNaN(parsed)) amount = String(parsed);
                }
                updateForm({
                  name: form.name || text.slice(0, 60),
                  description: form.description || text,
                  debitCode: guess.debitCode || form.debitCode,
                  debitName: guess.debitName || form.debitName,
                  creditCode: guess.creditCode || form.creditCode,
                  creditName: guess.creditName || form.creditName,
                  amount: amount || form.amount,
                  quickText: "",
                });
              }}
            />
            <span className="field-hint">
              Describe what you need — type or use voice. Fields will be filled
              automatically.
            </span>
          </div>

          <div style={{ borderTop: "1px solid #E8E8E8", paddingTop: 16 }}>
            <div className="form-grid-2">
              <div>
                <div className="detail-label required">Name</div>
                <input
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="e.g. Monthly office rent"
                  className="settings-input"
                />
              </div>
              <div>
                <div className="detail-label">Description</div>
                <input
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                  placeholder="Optional notes"
                  className="settings-input"
                />
              </div>
              <div>
                <div className="detail-label">Frequency</div>
                <select
                  value={form.frequency}
                  onChange={(e) => handleFrequencyChange(e.target.value)}
                  className="settings-input"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <div className="detail-label required">Next run date</div>
                <input
                  type="date"
                  value={form.nextRunDate}
                  onChange={(e) => updateForm({ nextRunDate: e.target.value })}
                  className="settings-input"
                />
              </div>

              {/* Debit account with autocomplete */}
              <div style={{ position: "relative" }}>
                <div className="detail-label required">Debit account</div>
                <input
                  value={form.debitCode}
                  onChange={(e) => handleDebitCodeChange(e.target.value)}
                  onFocus={() => setFocusField("debitCode")}
                  onBlur={() => setTimeout(() => setFocusField(""), 150)}
                  placeholder="e.g. 6330"
                  className="settings-input"
                />
                {focusField === "debitCode" && debitSuggestions.length > 0 && (
                  <div style={suggestionStyle}>
                    {debitSuggestions.map((a) => (
                      <div
                        key={a.code}
                        style={suggestionItemStyle}
                        onMouseDown={() => selectDebitAccount(a)}
                      >
                        <span className="mono">{a.code}</span>
                        <span
                          style={{
                            color: "var(--text-secondary)",
                            marginLeft: 8,
                          }}
                        >
                          {a.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <div className="detail-label required">Debit name</div>
                <input
                  value={form.debitName}
                  onChange={(e) => handleDebitNameChange(e.target.value)}
                  onFocus={() => setFocusField("debitName")}
                  onBlur={() => setTimeout(() => setFocusField(""), 150)}
                  placeholder="e.g. Rent and utilities"
                  className="settings-input"
                />
                {focusField === "debitName" && debitSuggestions.length > 0 && (
                  <div style={suggestionStyle}>
                    {debitSuggestions.map((a) => (
                      <div
                        key={a.code}
                        style={suggestionItemStyle}
                        onMouseDown={() => selectDebitAccount(a)}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>
                          {a.name}
                        </span>
                        <span className="mono" style={{ marginLeft: 8 }}>
                          {a.code}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Credit account with autocomplete */}
              <div style={{ position: "relative" }}>
                <div className="detail-label required">Credit account</div>
                <input
                  value={form.creditCode}
                  onChange={(e) => handleCreditCodeChange(e.target.value)}
                  onFocus={() => setFocusField("creditCode")}
                  onBlur={() => setTimeout(() => setFocusField(""), 150)}
                  placeholder="e.g. 2420"
                  className="settings-input"
                />
                {focusField === "creditCode" &&
                  creditSuggestions.length > 0 && (
                    <div style={suggestionStyle}>
                      {creditSuggestions.map((a) => (
                        <div
                          key={a.code}
                          style={suggestionItemStyle}
                          onMouseDown={() => selectCreditAccount(a)}
                        >
                          <span className="mono">{a.code}</span>
                          <span
                            style={{
                              color: "var(--text-secondary)",
                              marginLeft: 8,
                            }}
                          >
                            {a.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>
              <div style={{ position: "relative" }}>
                <div className="detail-label required">Credit name</div>
                <input
                  value={form.creditName}
                  onChange={(e) => handleCreditNameChange(e.target.value)}
                  onFocus={() => setFocusField("creditName")}
                  onBlur={() => setTimeout(() => setFocusField(""), 150)}
                  placeholder="e.g. Bank accounts"
                  className="settings-input"
                />
                {focusField === "creditName" &&
                  creditSuggestions.length > 0 && (
                    <div style={suggestionStyle}>
                      {creditSuggestions.map((a) => (
                        <div
                          key={a.code}
                          style={suggestionItemStyle}
                          onMouseDown={() => selectCreditAccount(a)}
                        >
                          <span style={{ color: "var(--text-secondary)" }}>
                            {a.name}
                          </span>
                          <span className="mono" style={{ marginLeft: 8 }}>
                            {a.code}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              <div>
                <div className="detail-label required">Amount (€)</div>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => updateForm({ amount: e.target.value })}
                  placeholder="e.g. 1200.00"
                  className="settings-input"
                  step="0.01"
                  min="0.01"
                />
              </div>
            </div>
            <button
              className="btn-primary"
              style={{ marginTop: 16 }}
              onClick={handleCreate}
              disabled={
                creating ||
                !form.name ||
                !form.debitCode ||
                !form.creditCode ||
                !form.amount ||
                !form.nextRunDate
              }
            >
              {creating ? "Creating..." : "Create template"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: "#A0A0A0" }}>Loading...</p>
      ) : templates.length === 0 ? (
        <div className="empty-state">
          <div className="icon">🔄</div>
          <h3>No recurring templates</h3>
          <p>
            Create templates for rent, salaries, insurance, and other regular
            entries.
          </p>
        </div>
      ) : (
        <UniversalGrid
          rows={templates}
          columns={templateColumns}
          rowKey={(row) => String(row.id)}
          searchPlaceholder="Search templates..."
          emptyMessage="No matching templates. Try adjusting filters."
          initialSort={{ columnId: "name", direction: "asc" }}
        />
      )}
    </div>
  );
}
