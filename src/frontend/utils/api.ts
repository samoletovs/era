const API = "/api";
const TOKEN = "dev-bypass";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
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
  accounts: (companyId: string) => apiFetch(`/companies/${companyId}/accounts`),

  // Journal entries
  journalEntries: (companyId: string) => apiFetch(`/companies/${companyId}/journal-entries`),

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
  contactTransactions: (companyId: string, contactId: string) =>
    apiFetch(`/companies/${companyId}/contacts/${contactId}/transactions`),

  // Items
  items: (companyId: string) => apiFetch(`/companies/${companyId}/items`),

  // Payments
  payments: (companyId: string) => apiFetch(`/companies/${companyId}/payments`),

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

  // Feedback
  submitFeedback: (body: { page: string; message: string; companyId?: string }) =>
    apiFetch("/feedback", { method: "POST", body: JSON.stringify(body) }),
  feedback: () => apiFetch("/feedback"),

  // Credit notes
  createCreditNote: (companyId: string, invoiceId: string, reason: string) =>
    apiFetch(`/companies/${companyId}/invoices/${invoiceId}/credit-note`, { method: "POST", body: JSON.stringify({ reason }) }),

  // Invoice PDF
  invoicePdfUrl: (companyId: string, invoiceId: string) =>
    `${API}/companies/${companyId}/invoices/${invoiceId}/pdf?token=${TOKEN}`,

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

  // Annual report
  annualReport: (companyId: string, year: number) =>
    apiFetch(`/companies/${companyId}/reports/annual?year=${year}`),

  // Aging reports (Sprint 2)
  arAging: (companyId: string) => apiFetch(`/companies/${companyId}/reports/ar-aging`),
  apAging: (companyId: string) => apiFetch(`/companies/${companyId}/reports/ap-aging`),
};
