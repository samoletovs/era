export const APP_NAME = "ERA";
export const APP_FULL_NAME = "Enterprise Resource Application";
export const APP_VERSION = "0.1.0";

export const DEFAULT_CURRENCY = "USD";
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const ERP_MODULES = {
  FINANCE: "finance",
  INVENTORY: "inventory",
  SALES: "sales",
  PROCUREMENT: "procurement",
  HR: "hr",
  REPORTING: "reporting",
} as const;

export const INVOICE_STATUS = {
  DRAFT: "draft",
  SENT: "sent",
  PAID: "paid",
  OVERDUE: "overdue",
  CANCELLED: "cancelled",
} as const;

export const ORDER_STATUS = {
  DRAFT: "draft",
  CONFIRMED: "confirmed",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;

export const ACCOUNT_TYPES = [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
] as const;
