import React, { useEffect, useState, useCallback } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney } from "../utils/format";

interface StatementLine {
  id: string;
  date: string;
  description: string;
  reference?: string;
  amount: number;
  counterparty?: string;
  status: "unmatched" | "matched" | "posted";
  matchedJournalEntryId?: string;
  matchedInvoiceId?: string;
  matchedInvoiceNumber?: string;
  allocatedAmount?: number;
  differenceAmount?: number;
  differenceType?: "overpayment" | "underpayment" | "exact";
  differenceAccountCode?: string;
  differenceAccountName?: string;
  suggestedAccountCode?: string;
  suggestedAccountName?: string;
  accountCode?: string;
  accountName?: string;
  isManual?: boolean;
}

interface Reconciliation {
  id: string;
  companyId: string;
  bankAccountCode: string;
  statementDate: string;
  statementBalance: number;
  bookBalance: number;
  lines: StatementLine[];
  status: "in-progress" | "reconciled";
}

interface OpenInvoice {
  id: string;
  invoiceNumber: string;
  type: string;
  contactName: string;
  date: string;
  dueDate: string;
  total: number;
  amountPaid: number;
  amountDue: number;
}

export function BankRecon() {
  const { companyId, numberFormat: fmt } = useApp();
  const [recons, setRecons] = useState<Reconciliation[]>([]);
  const [selected, setSelected] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [csvText, setCsvText] = useState("");

  // Detail view state
  const [tab, setTab] = useState<"lines" | "invoices" | "add">("lines");
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [matchingLine, setMatchingLine] = useState<StatementLine | null>(null);
  const [postingLine, setPostingLine] = useState<StatementLine | null>(null);
  const [accounts, setAccounts] = useState<Array<{ code: string; name: string; isPostable: boolean }>>([]);

  // Match invoice form
  const [allocatedAmount, setAllocatedAmount] = useState("");
  const [diffAccountCode, setDiffAccountCode] = useState("");
  const [diffAccountName, setDiffAccountName] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<OpenInvoice | null>(null);

  // Post to GL form
  const [postAccountCode, setPostAccountCode] = useState("");
  const [postAccountName, setPostAccountName] = useState("");

  // Manual transaction form
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualDesc, setManualDesc] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualAccountCode, setManualAccountCode] = useState("");
  const [manualAccountName, setManualAccountName] = useState("");

  const [busy, setBusy] = useState(false);
  const [creatingManual, setCreatingManual] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    loadRecons();
    loadAccounts();
  }, [companyId]);

  const loadRecons = useCallback(() => {
    setLoading(true);
    api.bankReconciliations(companyId)
      .then((d: any) => setRecons(d as Reconciliation[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  const loadAccounts = useCallback(() => {
    api.accounts(companyId)
      .then((d: any) => setAccounts((d as any[]).filter((a: any) => a.isPostable)))
      .catch(() => {});
  }, [companyId]);

  const loadOpenInvoices = useCallback(() => {
    api.openInvoices(companyId)
      .then((d: any) => setOpenInvoices(d as OpenInvoice[]))
      .catch(() => {});
  }, [companyId]);

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
      }) as Reconciliation;
      setCsvText("");
      setSelected(result);
      loadRecons();
      loadOpenInvoices();
    } catch (err: any) { alert(err.message); }
    finally { setImporting(false); }
  }

  function selectRecon(r: Reconciliation) {
    setSelected(r);
    setTab("lines");
    setMatchingLine(null);
    setPostingLine(null);
    loadOpenInvoices();
  }

  function refreshSelected() {
    if (!selected) return;
    api.bankReconciliation(companyId, selected.id)
      .then((d: any) => setSelected(d as Reconciliation))
      .catch(() => {});
  }

  // ─── Create manual reconciliation ─────────────────────────

  async function handleCreateManualRecon() {
    setCreatingManual(true);
    try {
      const result = await api.importBankStatement(companyId, {
        bankAccountCode: "2420",
        statementDate: new Date().toISOString().slice(0, 10),
        statementBalance: 0,
        lines: [],
      }) as Reconciliation;
      setSelected(result);
      setTab("add");
      loadRecons();
      loadOpenInvoices();
    } catch (err: any) { alert(err.message); }
    finally { setCreatingManual(false); }
  }

  // ─── Match to invoice ──────────────────────────────────────

  function startMatchInvoice(line: StatementLine) {
    setMatchingLine(line);
    setPostingLine(null);
    setSelectedInvoice(null);
    setAllocatedAmount(String(Math.abs(line.amount)));
    setDiffAccountCode("");
    setDiffAccountName("");
    setTab("invoices");
    loadOpenInvoices();
  }

  function pickInvoice(inv: OpenInvoice) {
    setSelectedInvoice(inv);
    setAllocatedAmount(String(Math.min(Math.abs(matchingLine?.amount || 0), inv.amountDue)));
  }

  async function handleMatchInvoice() {
    if (!selected || !matchingLine || !selectedInvoice) return;
    const allocated = parseFloat(allocatedAmount);
    if (isNaN(allocated) || allocated <= 0) return;

    const absAmount = Math.abs(matchingLine.amount);
    const diff = Math.round((absAmount - allocated) * 100) / 100;
    if (Math.abs(diff) > 0.005 && !diffAccountCode) {
      alert("Please select a GL account for the over/underpayment difference.");
      return;
    }

    setBusy(true);
    try {
      const result = await api.matchInvoice(companyId, selected.id, {
        lineId: matchingLine.id,
        invoiceId: selectedInvoice.id,
        invoiceNumber: selectedInvoice.invoiceNumber,
        allocatedAmount: allocated,
        differenceAccountCode: diffAccountCode || undefined,
        differenceAccountName: diffAccountName || undefined,
      }) as Reconciliation;
      setSelected(result);
      setMatchingLine(null);
      setSelectedInvoice(null);
      setTab("lines");
      loadOpenInvoices();
    } catch (err: any) { alert(err.message); }
    finally { setBusy(false); }
  }

  // ─── Post directly to GL ──────────────────────────────────

  function startPostDirect(line: StatementLine) {
    setPostingLine(line);
    setMatchingLine(null);
    setPostAccountCode(line.suggestedAccountCode || "");
    setPostAccountName(line.suggestedAccountName || "");
  }

  async function handlePostDirect() {
    if (!selected || !postingLine || !postAccountCode) return;
    setBusy(true);
    try {
      await api.postBankLine(companyId, selected.id, {
        lineId: postingLine.id,
        accountCode: postAccountCode,
        accountName: postAccountName,
      });
      refreshSelected();
      setPostingLine(null);
    } catch (err: any) { alert(err.message); }
    finally { setBusy(false); }
  }

  // ─── Manual transaction ───────────────────────────────────

  async function handleSuggest(description: string) {
    if (!selected || !description.trim()) return;
    try {
      const s = await api.suggestAccount(companyId, selected.id, description) as any;
      if (s) {
        setManualAccountCode(s.accountCode);
        setManualAccountName(s.accountName);
      }
    } catch { /* ignore */ }
  }

  async function handleAddManual() {
    if (!selected || !manualDesc.trim() || !manualAmount || !manualAccountCode) return;
    setBusy(true);
    try {
      const result = await api.addManualTransaction(companyId, selected.id, {
        date: manualDate,
        description: manualDesc,
        amount: parseFloat(manualAmount),
        accountCode: manualAccountCode,
        accountName: manualAccountName,
      }) as Reconciliation;
      setSelected(result);
      setManualDesc("");
      setManualAmount("");
      setManualAccountCode("");
      setManualAccountName("");
    } catch (err: any) { alert(err.message); }
    finally { setBusy(false); }
  }

  // ─── Complete reconciliation ──────────────────────────────

  async function handleComplete() {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await api.completeBankRecon(companyId, selected.id) as Reconciliation;
      setSelected(result);
      loadRecons();
    } catch (err: any) { alert(err.message); }
    finally { setBusy(false); }
  }

  // ─── Render helpers ───────────────────────────────────────

  function badgeClass(status: string): string {
    switch (status) {
      case "matched": return "badge badge-paid";
      case "posted": return "badge badge-posted";
      case "unmatched": return "badge badge-draft";
      case "reconciled": return "badge badge-paid";
      default: return "badge";
    }
  }

  if (!companyId) return <div className="empty-state"><div className="icon">🏢</div><h3>No company selected</h3></div>;

  // ─── Detail view ──────────────────────────────────────────

  if (selected) {
    const matched = selected.lines?.filter(l => l.status === "matched").length || 0;
    const unmatched = selected.lines?.filter(l => l.status === "unmatched").length || 0;
    const posted = selected.lines?.filter(l => l.status === "posted").length || 0;
    const manual = selected.lines?.filter(l => l.isManual).length || 0;

    const filteredInvoices = openInvoices.filter(inv => {
      if (!invoiceSearch) return true;
      const q = invoiceSearch.toLowerCase();
      return inv.invoiceNumber.toLowerCase().includes(q) || inv.contactName.toLowerCase().includes(q);
    });

    return (
      <div>
        <div className="coa-header">
          <h2 className="page-title">Reconciliation details</h2>
          <div style={{ display: "flex", gap: 8 }}>
            {selected.status === "in-progress" && unmatched === 0 && (
              <button className="btn-primary" onClick={handleComplete} disabled={busy}>
                {busy ? "Completing..." : "Complete reconciliation"}
              </button>
            )}
            <button className="btn-secondary" onClick={() => { setSelected(null); setMatchingLine(null); setPostingLine(null); }}>
              ← Back to list
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div className="dashboard-grid" style={{ marginBottom: 20 }}>
          <div className="metric-card">
            <div className="label">Total lines</div>
            <div className="value">{selected.lines?.length || 0}</div>
          </div>
          <div className="metric-card">
            <div className="label">Matched</div>
            <div className="value" style={{ color: "var(--success)" }}>{matched}</div>
          </div>
          <div className="metric-card">
            <div className="label">Unmatched</div>
            <div className="value" style={{ color: unmatched > 0 ? "var(--warning)" : "var(--success)" }}>{unmatched}</div>
          </div>
          <div className="metric-card">
            <div className="label">Posted</div>
            <div className="value">{posted}</div>
          </div>
          {manual > 0 && (
            <div className="metric-card">
              <div className="label">Manual</div>
              <div className="value">{manual}</div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
          {(["lines", "invoices", "add"] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); if (t === "invoices") loadOpenInvoices(); }}
              style={{
                padding: "8px 16px",
                fontSize: "var(--text-sm)",
                fontWeight: tab === t ? 500 : 400,
                color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
                background: "none",
                border: "none",
                borderBottom: tab === t ? "2px solid var(--text-primary)" : "2px solid transparent",
                cursor: "pointer",
              }}
            >
              {t === "lines" ? "Statement lines" : t === "invoices" ? "Open invoices" : "Add transaction"}
            </button>
          ))}
        </div>

        {/* Tab: Statement lines */}
        {tab === "lines" && (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Reference</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Status</th>
                  <th>Matched to</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(selected.lines || []).map(l => (
                  <tr key={l.id} style={{ background: postingLine?.id === l.id ? "var(--accent-bg)" : undefined }}>
                    <td className="mono">{l.date}</td>
                    <td>
                      {l.description}
                      {l.counterparty ? <span style={{ color: "var(--text-tertiary)" }}> — {l.counterparty}</span> : ""}
                      {l.isManual && <span className="badge" style={{ marginLeft: 6, fontSize: 10 }}>manual</span>}
                    </td>
                    <td className="mono" style={{ color: "var(--text-secondary)" }}>{l.reference || ""}</td>
                    <td className="num" style={{ color: l.amount >= 0 ? "var(--success)" : "var(--error)" }}>
                      {formatMoney(l.amount, fmt)}
                    </td>
                    <td><span className={badgeClass(l.status)}>{l.status}</span></td>
                    <td style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                      {l.matchedInvoiceNumber || ""}
                      {l.differenceType && l.differenceType !== "exact" && (
                        <span style={{ marginLeft: 4, fontSize: 11, color: l.differenceType === "overpayment" ? "var(--success)" : "var(--warning)" }}>
                          ({l.differenceType}: {formatMoney(Math.abs(l.differenceAmount || 0), fmt)})
                        </span>
                      )}
                      {l.accountCode && !l.matchedInvoiceNumber && (
                        <span className="mono">{l.accountCode} {l.accountName}</span>
                      )}
                    </td>
                    <td>
                      {l.status === "unmatched" && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 11, padding: "2px 8px" }}
                            onClick={() => startMatchInvoice(l)}
                            aria-label={`Match ${l.description} to invoice`}
                          >
                            Match invoice
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 11, padding: "2px 8px" }}
                            onClick={() => startPostDirect(l)}
                            aria-label={`Post ${l.description} to GL`}
                          >
                            Post to GL
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Post to GL inline form */}
            {postingLine && (
              <div className="settings-card" style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  Post to GL: {postingLine.description} ({formatMoney(postingLine.amount, fmt)})
                </h3>
                {postingLine.suggestedAccountCode && (
                  <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: 8 }}>
                    Suggested: {postingLine.suggestedAccountCode} — {postingLine.suggestedAccountName}
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4 }}>Account</label>
                    <select
                      value={postAccountCode}
                      onChange={e => {
                        setPostAccountCode(e.target.value);
                        const acct = accounts.find(a => a.code === e.target.value);
                        setPostAccountName(acct?.name || "");
                      }}
                      className="table-filter-select"
                      aria-label="GL account"
                    >
                      <option value="">Select account</option>
                      {accounts.map(a => (
                        <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    className="btn-primary"
                    style={{ fontSize: "var(--text-sm)" }}
                    onClick={handlePostDirect}
                    disabled={busy || !postAccountCode}
                  >
                    {busy ? "Posting..." : "Post"}
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: "var(--text-sm)" }}
                    onClick={() => setPostingLine(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Tab: Open invoices */}
        {tab === "invoices" && (
          <>
            {matchingLine && (
              <div className="settings-card" style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  Matching: {matchingLine.description} ({formatMoney(matchingLine.amount, fmt)})
                </h3>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", margin: 0 }}>
                  Select an invoice below to match this bank statement line.
                </p>
              </div>
            )}

            <input
              className="table-search-input"
              placeholder="Search invoices by number or contact..."
              value={invoiceSearch}
              onChange={e => setInvoiceSearch(e.target.value)}
              style={{ marginBottom: 12, maxWidth: 360 }}
              aria-label="Search invoices"
            />

            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Type</th>
                  <th>Contact</th>
                  <th>Date</th>
                  <th>Due date</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  <th style={{ textAlign: "right" }}>Paid</th>
                  <th style={{ textAlign: "right" }}>Due</th>
                  {matchingLine && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map(inv => (
                  <tr
                    key={inv.id}
                    style={{
                      background: selectedInvoice?.id === inv.id ? "var(--accent-bg)" : undefined,
                      cursor: matchingLine ? "pointer" : undefined,
                    }}
                    onClick={matchingLine ? () => pickInvoice(inv) : undefined}
                  >
                    <td className="mono">{inv.invoiceNumber}</td>
                    <td><span className={inv.type === "sales" ? "badge badge-paid" : "badge badge-posted"}>{inv.type}</span></td>
                    <td>{inv.contactName}</td>
                    <td className="mono">{inv.date}</td>
                    <td className="mono">{inv.dueDate}</td>
                    <td className="num">{formatMoney(inv.total, fmt)}</td>
                    <td className="num">{formatMoney(inv.amountPaid, fmt)}</td>
                    <td className="num" style={{ fontWeight: 500 }}>{formatMoney(inv.amountDue, fmt)}</td>
                    {matchingLine && (
                      <td>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: 11, padding: "2px 8px" }}
                          onClick={e => { e.stopPropagation(); pickInvoice(inv); }}
                          aria-label={`Select ${inv.invoiceNumber}`}
                        >
                          Select
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {filteredInvoices.length === 0 && (
                  <tr><td colSpan={matchingLine ? 9 : 8} style={{ textAlign: "center", color: "var(--text-tertiary)", padding: 32 }}>No open invoices</td></tr>
                )}
              </tbody>
            </table>

            {/* Match form when an invoice is selected */}
            {matchingLine && selectedInvoice && (
              <div className="settings-card" style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                  Match {matchingLine.description} → {selectedInvoice.invoiceNumber}
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4 }}>Bank amount</label>
                    <div style={{ fontFamily: "var(--font-mono, ui-monospace, Consolas, monospace)", fontSize: "var(--text-base)", fontWeight: 500 }}>
                      {formatMoney(Math.abs(matchingLine.amount), fmt)}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4 }}>Invoice due</label>
                    <div style={{ fontFamily: "var(--font-mono, ui-monospace, Consolas, monospace)", fontSize: "var(--text-base)", fontWeight: 500 }}>
                      {formatMoney(selectedInvoice.amountDue, fmt)}
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4 }}>Allocate to invoice</label>
                    <input
                      type="number"
                      step="0.01"
                      value={allocatedAmount}
                      onChange={e => setAllocatedAmount(e.target.value)}
                      className="table-search-input"
                      style={{ width: 140 }}
                      aria-label="Allocated amount"
                    />
                  </div>
                  {(() => {
                    const alloc = parseFloat(allocatedAmount) || 0;
                    const diff = Math.round((Math.abs(matchingLine.amount) - alloc) * 100) / 100;
                    if (Math.abs(diff) <= 0.005) return null;
                    return (
                      <>
                        <div>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: diff > 0 ? "var(--success)" : "var(--warning)", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4 }}>
                            {diff > 0 ? "Overpayment" : "Underpayment"}
                          </label>
                          <div style={{ fontFamily: "var(--font-mono, ui-monospace, Consolas, monospace)", fontSize: "var(--text-base)", fontWeight: 500, color: diff > 0 ? "var(--success)" : "var(--warning)" }}>
                            {formatMoney(Math.abs(diff), fmt)}
                          </div>
                        </div>
                        <div style={{ gridColumn: "span 2" }}>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4 }}>
                            Difference account
                          </label>
                          <select
                            value={diffAccountCode}
                            onChange={e => {
                              setDiffAccountCode(e.target.value);
                              const acct = accounts.find(a => a.code === e.target.value);
                              setDiffAccountName(acct?.name || "");
                            }}
                            className="table-filter-select"
                            aria-label="Difference GL account"
                          >
                            <option value="">Select account for difference</option>
                            {accounts.map(a => (
                              <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button className="btn-primary" onClick={handleMatchInvoice} disabled={busy || !allocatedAmount}>
                    {busy ? "Matching..." : "Match & post"}
                  </button>
                  <button className="btn-secondary" onClick={() => { setMatchingLine(null); setSelectedInvoice(null); setTab("lines"); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Tab: Add manual transaction */}
        {tab === "add" && (
          <div className="settings-card">
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Add manual transaction</h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: 16, marginTop: 0 }}>
              Record fees, commissions, interest, or other transactions not in the bank statement. The system will suggest a ledger account based on the description.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4 }}>Date</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={e => setManualDate(e.target.value)}
                  className="table-search-input"
                  aria-label="Transaction date"
                />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4 }}>Description</label>
                <input
                  type="text"
                  value={manualDesc}
                  onChange={e => setManualDesc(e.target.value)}
                  onBlur={() => handleSuggest(manualDesc)}
                  placeholder="e.g. Bank commission, Interest charge"
                  className="table-search-input"
                  style={{ width: "100%" }}
                  aria-label="Transaction description"
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4 }}>Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={manualAmount}
                  onChange={e => setManualAmount(e.target.value)}
                  placeholder="Negative = expense"
                  className="table-search-input"
                  style={{ width: 160 }}
                  aria-label="Transaction amount"
                />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 4 }}>
                  Ledger account
                  {manualAccountCode && <span style={{ fontWeight: 400, color: "var(--text-secondary)", marginLeft: 8, textTransform: "none", letterSpacing: 0, fontSize: "var(--text-sm)" }}>suggested: {manualAccountCode}</span>}
                </label>
                <select
                  value={manualAccountCode}
                  onChange={e => {
                    setManualAccountCode(e.target.value);
                    const acct = accounts.find(a => a.code === e.target.value);
                    setManualAccountName(acct?.name || "");
                  }}
                  className="table-filter-select"
                  style={{ width: "100%" }}
                  aria-label="Ledger account"
                >
                  <option value="">Select account</option>
                  {accounts.map(a => (
                    <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button
                className="btn-primary"
                onClick={handleAddManual}
                disabled={busy || !manualDesc.trim() || !manualAmount || !manualAccountCode}
              >
                {busy ? "Adding..." : "Add & post"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── List view ────────────────────────────────────────────

  return (
    <div>
      <h2 className="page-title">Bank</h2>

      {/* Bank balance dashboard */}
      <div className="dashboard-grid" style={{ marginBottom: 20 }}>
        <div className="metric-card">
          <div className="label">Bank balance</div>
          <div className="value">{formatMoney(
            recons.filter(r => r.status === "reconciled").reduce((s, r) => s + r.statementBalance, 0), fmt
          )}</div>
          <div className="subtitle">Last reconciled</div>
        </div>
        <div className="metric-card">
          <div className="label">Reconciliations</div>
          <div className="value">{recons.length}</div>
          <div className="subtitle">{recons.filter(r => r.status === "in-progress").length} in progress</div>
        </div>
        <div className="metric-card">
          <div className="label">Unmatched lines</div>
          <div className="value" style={{ color: recons.reduce((s, r) => s + (r.lines?.filter(l => l.status === "unmatched").length || 0), 0) > 0 ? "var(--warning)" : "var(--success)" }}>
            {recons.reduce((s, r) => s + (r.lines?.filter(l => l.status === "unmatched").length || 0), 0)}
          </div>
          <div className="subtitle">Across all statements</div>
        </div>
      </div>

      <div className="settings-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Import bank statement</h3>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
            Tip: click a reconciliation → "Add transaction" tab for manual entries
          </span>
        </div>
        <div className="form-hint">Paste semicolon-separated CSV with headers: date;description;reference;amount;counterparty</div>
        <textarea
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          rows={6}
          placeholder={"date;description;reference;amount;counterparty\n2026-03-01;Office rent;R-001;-1200.00;SIA Landlord\n2026-03-05;Customer payment;INV-00001;4840.00;SIA Client"}
          style={{ width: "100%", padding: 12, fontFamily: "ui-monospace, Consolas, monospace", fontSize: "var(--text-sm)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", resize: "vertical", background: "var(--bg-page)" }}
          aria-label="Bank statement CSV"
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn-primary" onClick={handleImport} disabled={importing || !csvText.trim()}>
            {importing ? "Importing..." : "Import & auto-match"}
          </button>
          <button className="btn-secondary" onClick={handleCreateManualRecon} disabled={creatingManual}>
            {creatingManual ? "Creating..." : "New manual reconciliation"}
          </button>
        </div>
      </div>

      {loading ? <p style={{ color: "var(--text-tertiary)" }}>Loading...</p> : recons.length === 0 ? (
        <div className="empty-state"><div className="icon">🏦</div><h3>No reconciliations</h3><p>Import a bank statement to start reconciling.</p></div>
      ) : (
        <table className="data-table">
          <thead><tr><th>Date</th><th>Bank account</th><th>Lines</th><th style={{ textAlign: "right" }}>Statement balance</th><th>Status</th></tr></thead>
          <tbody>
            {recons.map(r => {
              const unm = r.lines?.filter(l => l.status === "unmatched").length || 0;
              return (
                <tr key={r.id} onClick={() => selectRecon(r)} style={{ cursor: "pointer" }}>
                  <td className="mono">{r.statementDate}</td>
                  <td className="mono">{r.bankAccountCode}</td>
                  <td>
                    {r.lines?.length || 0}
                    {unm > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--warning)" }}>{unm} unmatched</span>}
                  </td>
                  <td className="num">{formatMoney(r.statementBalance, fmt)}</td>
                  <td><span className={badgeClass(r.status)}>{r.status}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
