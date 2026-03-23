const API = "/api";

/** Centralized auth token management. Uses stored token from login, falls back to dev-bypass in development. */
export function getAuthToken(): string {
  return localStorage.getItem("era_authToken") || "dev-bypass";
}

export function setAuthToken(token: string): void {
  localStorage.setItem("era_authToken", token);
}

export function clearAuthToken(): void {
  localStorage.removeItem("era_authToken");
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
      ...options?.headers,
    },
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.data;
}

export const api = {
  // Dashboard
  dashboard: (companyId: string) => apiFetch(`/companies/${companyId}/dashboard`),

  // Accounts
  accounts: (companyId: string, asOf?: string) =>
    apiFetch(`/companies/${companyId}/accounts${asOf ? `?asOf=${asOf}` : ""}`),
  accountTransactions: (companyId: string, accountCode: string, asOf?: string) =>
    apiFetch<{ transactions: { entryId: string; entryNumber: string; date: string; description: string; debit: number; credit: number; sourceType: string }[]; balance: number }>(
      `/companies/${companyId}/accounts/${accountCode}/transactions${asOf ? `?asOf=${asOf}` : ""}`
    ),

  // Journal entries
  journalEntries: (companyId: string) => apiFetch(`/companies/${companyId}/journal-entries`),
  postJournalEntry: (companyId: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/journal-entries`, { method: "POST", body: JSON.stringify(body) }),
  reverseJournalEntry: (companyId: string, entryId: string) =>
    apiFetch(`/companies/${companyId}/journal-entries/${entryId}/reverse`, { method: "POST" }),

  // Invoices
  invoices: (companyId: string, type?: string) =>
    apiFetch(`/companies/${companyId}/invoices${type ? `?type=${type}` : ""}`),
  invoice: (companyId: string, id: string) =>
    apiFetch(`/companies/${companyId}/invoices/${id}`),
  postInvoice: (companyId: string, id: string) =>
    apiFetch(`/companies/${companyId}/invoices/${id}/post`, { method: "POST" }),
  cancelInvoice: (companyId: string, id: string, reason?: string) =>
    apiFetch(`/companies/${companyId}/invoices/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }),
  invoicePostings: (companyId: string, id: string) =>
    apiFetch(`/companies/${companyId}/invoices/${id}/postings`),

  // Contacts
  contacts: (companyId: string) => apiFetch(`/companies/${companyId}/contacts`),
  contact: (companyId: string, id: string) => apiFetch(`/companies/${companyId}/contacts/${id}`),
  findContact: (companyId: string, name: string, registrationNumber?: string) => {
    const params = new URLSearchParams({ name });
    if (registrationNumber) params.set("registrationNumber", registrationNumber);
    return apiFetch(`/companies/${companyId}/contacts/find?${params}`);
  },
  createContact: (companyId: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/contacts`, { method: "POST", body: JSON.stringify(body) }),
  contactTransactions: (companyId: string, contactId: string) =>
    apiFetch(`/companies/${companyId}/contacts/${contactId}/transactions`),
  parseContactDescription: (companyId: string, description: string) =>
    apiFetch(`/companies/${companyId}/contacts/parse-description`, { method: "POST", body: JSON.stringify({ description }) }),

  // Contact merge & register
  mergeContacts: (companyId: string, sourceContactId: string, targetContactId: string) =>
    apiFetch(`/companies/${companyId}/contacts/merge`, { method: "POST", body: JSON.stringify({ sourceContactId, targetContactId }) }),
  findDuplicates: (companyId: string) =>
    apiFetch(`/companies/${companyId}/contacts/duplicates`),
  checkRegister: (companyId: string, contactId: string) =>
    apiFetch(`/companies/${companyId}/contacts/${contactId}/check-register`),
  applyRegister: (companyId: string, contactId: string, data: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/contacts/${contactId}/apply-register`, { method: "POST", body: JSON.stringify(data) }),
  updateContact: (companyId: string, contactId: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify(body) }),

  // Items
  items: (companyId: string) => apiFetch(`/companies/${companyId}/items`),
  createItem: (companyId: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/items`, { method: "POST", body: JSON.stringify(body) }),
  itemTransactions: (companyId: string, itemCode: string) =>
    apiFetch(`/companies/${companyId}/items/${itemCode}/transactions`),
  parseItemDescription: (companyId: string, description: string) =>
    apiFetch(`/companies/${companyId}/items/parse-description`, { method: "POST", body: JSON.stringify({ description }) }),

  // Invoice AI
  parseInvoiceDescription: (companyId: string, description: string) =>
    apiFetch(`/companies/${companyId}/invoices/parse-description`, { method: "POST", body: JSON.stringify({ description }) }),

  // Create invoice (direct)
  createInvoice: (companyId: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/invoices`, { method: "POST", body: JSON.stringify(body) }),

  // Payments
  payments: (companyId: string) => apiFetch(`/companies/${companyId}/payments`),
  createPayment: (companyId: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/payments`, { method: "POST", body: JSON.stringify(body) }),

  // Reports
  balanceSheet: (companyId: string, asOf?: string) =>
    apiFetch(`/companies/${companyId}/reports/balance-sheet${asOf ? `?asOf=${asOf}` : ""}`),
  profitLoss: (companyId: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return apiFetch(`/companies/${companyId}/reports/profit-loss${qs ? `?${qs}` : ""}`);
  },
  trialBalance: (companyId: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const qs = params.toString();
    return apiFetch(`/companies/${companyId}/trial-balance${qs ? `?${qs}` : ""}`);
  },

  // Company
  company: (id: string) => apiFetch(`/companies/${id}`),
  updateCompany: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  companies: () => apiFetch("/companies"),
  deleteCompany: (id: string) =>
    apiFetch(`/companies/${id}`, { method: "DELETE" }),
  companyStats: (id: string) =>
    apiFetch<{ transactionCount: number }>(`/companies/${id}/stats`),

  // Feedback
  submitFeedback: (body: { page: string; message: string; companyId?: string }) =>
    apiFetch("/feedback", { method: "POST", body: JSON.stringify(body) }),
  feedback: () => apiFetch("/feedback"),

  // Credit notes
  createCreditNote: (companyId: string, invoiceId: string, reason: string) =>
    apiFetch(`/companies/${companyId}/invoices/${invoiceId}/credit-note`, { method: "POST", body: JSON.stringify({ reason }) }),

  // Invoice PDF
  invoicePdfUrl: (companyId: string, invoiceId: string) =>
    `${API}/companies/${companyId}/invoices/${invoiceId}/pdf?token=${encodeURIComponent(getAuthToken())}`,

  // Period close
  closePeriod: (companyId: string, period: string) =>
    apiFetch(`/companies/${companyId}/periods/${period}/close`, { method: "POST" }),
  reopenPeriod: (companyId: string, period: string) =>
    apiFetch(`/companies/${companyId}/periods/${period}/reopen`, { method: "POST" }),
  yearEndClose: (companyId: string, fiscalYear: number) =>
    apiFetch(`/companies/${companyId}/year-end-close`, { method: "POST", body: JSON.stringify({ fiscalYear }) }),

  // VAT declaration
  vatDeclaration: (companyId: string, year: number, month: number) =>
    apiFetch(`/companies/${companyId}/reports/vat-declaration?year=${year}&month=${month}`),
  generateVatReturn: (companyId: string, year: number, month: number) =>
    apiFetch(`/companies/${companyId}/vat-returns`, { method: "POST", body: JSON.stringify({ year, month }) }),

  // Annual report
  annualReport: (companyId: string, year: number) =>
    apiFetch(`/companies/${companyId}/reports/annual?year=${year}`),

  // Aging reports
  arAging: (companyId: string) => apiFetch(`/companies/${companyId}/reports/ar-aging`),
  apAging: (companyId: string) => apiFetch(`/companies/${companyId}/reports/ap-aging`),

  // Fixed assets
  fixedAssets: (companyId: string) => apiFetch(`/companies/${companyId}/fixed-assets`),
  acquireAsset: (companyId: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/fixed-assets`, { method: "POST", body: JSON.stringify(body) }),
  parseAssetDescription: (companyId: string, description: string) =>
    apiFetch(`/companies/${companyId}/fixed-assets/parse-description`, { method: "POST", body: JSON.stringify({ description }) }),
  depreciate: (companyId: string, period: string) =>
    apiFetch(`/companies/${companyId}/fixed-assets/depreciate`, { method: "POST", body: JSON.stringify({ period }) }),
  disposeAsset: (companyId: string, assetId: string, amount: number) =>
    apiFetch(`/companies/${companyId}/fixed-assets/${assetId}/dispose`, { method: "POST", body: JSON.stringify({ disposalAmount: amount }) }),
  assetTransactions: (companyId: string, assetId: string) =>
    apiFetch(`/companies/${companyId}/fixed-assets/${assetId}/transactions`),

  // Bank reconciliation
  bankReconciliations: (companyId: string) => apiFetch(`/companies/${companyId}/bank-reconciliations`),
  bankReconciliation: (companyId: string, reconId: string) => apiFetch(`/companies/${companyId}/bank-reconciliations/${reconId}`),
  importBankStatement: (companyId: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/bank-reconciliations`, { method: "POST", body: JSON.stringify(body) }),
  openInvoices: (companyId: string) => apiFetch(`/companies/${companyId}/bank-reconciliations/open-invoices`),
  postBankLine: (companyId: string, reconId: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/bank-reconciliations/${reconId}/post-line`, { method: "POST", body: JSON.stringify(body) }),
  matchInvoice: (companyId: string, reconId: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/bank-reconciliations/${reconId}/match-invoice`, { method: "POST", body: JSON.stringify(body) }),
  addManualTransaction: (companyId: string, reconId: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/bank-reconciliations/${reconId}/manual-transaction`, { method: "POST", body: JSON.stringify(body) }),
  suggestAccount: (companyId: string, reconId: string, description: string) =>
    apiFetch(`/companies/${companyId}/bank-reconciliations/${reconId}/suggest-account`, { method: "POST", body: JSON.stringify({ description }) }),
  completeBankRecon: (companyId: string, reconId: string) =>
    apiFetch(`/companies/${companyId}/bank-reconciliations/${reconId}/complete`, { method: "POST" }),

  // Recurring entries
  recurringTemplates: (companyId: string) => apiFetch(`/companies/${companyId}/recurring-templates`),
  createRecurringTemplate: (companyId: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/recurring-templates`, { method: "POST", body: JSON.stringify(body) }),
  executeTemplate: (companyId: string, templateId: string) =>
    apiFetch(`/companies/${companyId}/recurring-templates/${templateId}/execute`, { method: "POST" }),

  // Budget
  budgetVsActual: (companyId: string, year: number) =>
    apiFetch(`/companies/${companyId}/reports/budget-vs-actual?year=${year}`),
  setBudget: (companyId: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${companyId}/budgets`, { method: "POST", body: JSON.stringify(body) }),

  // Health check
  companyHealth: (companyId: string) => apiFetch(`/companies/${companyId}/health`),

  // Autonomous month/year end
  runMonthEnd: (companyId: string, period: string) =>
    apiFetch(`/companies/${companyId}/run-month-end`, { method: "POST", body: JSON.stringify({ period }) }),
  runYearEnd: (companyId: string, fiscalYear: number) =>
    apiFetch(`/companies/${companyId}/run-year-end`, { method: "POST", body: JSON.stringify({ fiscalYear }) }),

  // Close run history
  closeRuns: (companyId: string) =>
    apiFetch<import("@shared/types").PeriodCloseRun[]>(`/companies/${companyId}/close-runs`),
  closeRun: (companyId: string, runId: string) =>
    apiFetch<import("@shared/types").PeriodCloseRun>(`/companies/${companyId}/close-runs/${runId}`),

  // Chat history
  chatHistory: (companyId: string) => apiFetch<any[]>(`/companies/${companyId}/chat`),

  // Event log
  events: (companyId: string, limit?: number) =>
    apiFetch(`/companies/${companyId}/events${limit ? `?limit=${limit}` : ""}`),
};
