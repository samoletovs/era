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

  // Trial balance
  trialBalance: (companyId: string) => apiFetch(`/companies/${companyId}/trial-balance`),

  // Invoices
  invoices: (companyId: string, type?: string) =>
    apiFetch(`/companies/${companyId}/invoices${type ? `?type=${type}` : ""}`),

  // Contacts
  contacts: (companyId: string) => apiFetch(`/companies/${companyId}/contacts`),

  // Items
  items: (companyId: string) => apiFetch(`/companies/${companyId}/items`),

  // Payments
  payments: (companyId: string) => apiFetch(`/companies/${companyId}/payments`),

  // Reports
  balanceSheet: (companyId: string) => apiFetch(`/companies/${companyId}/reports/balance-sheet`),
  profitLoss: (companyId: string) => apiFetch(`/companies/${companyId}/reports/profit-loss`),

  // Company
  company: (id: string) => apiFetch(`/companies/${id}`),
  updateCompany: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/companies/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  companies: () => apiFetch("/companies"),
};
