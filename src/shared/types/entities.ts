// ERA ERP - Core Entity Types

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  isActive: boolean;
}

// Finance Module
export interface Account extends BaseEntity {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  parentId?: string;
  balance: number;
  currency: string;
}

export interface JournalEntry extends BaseEntity {
  entryNumber: string;
  date: string;
  description: string;
  lines: JournalLine[];
  status: "draft" | "posted" | "reversed";
}

export interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface Invoice extends BaseEntity {
  invoiceNumber: string;
  type: "sales" | "purchase";
  customerId?: string;
  vendorId?: string;
  date: string;
  dueDate: string;
  lines: InvoiceLine[];
  subtotal: number;
  tax: number;
  total: number;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  currency: string;
}

export interface InvoiceLine {
  itemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  total: number;
}

// Inventory Module
export interface Item extends BaseEntity {
  sku: string;
  name: string;
  description?: string;
  category: string;
  unitOfMeasure: string;
  costPrice: number;
  sellingPrice: number;
  reorderLevel: number;
  quantityOnHand: number;
}

export interface Warehouse extends BaseEntity {
  code: string;
  name: string;
  address: Address;
}

// Sales / CRM
export interface Customer extends BaseEntity {
  code: string;
  name: string;
  email: string;
  phone?: string;
  billingAddress: Address;
  shippingAddress?: Address;
  taxId?: string;
  creditLimit: number;
}

export interface SalesOrder extends BaseEntity {
  orderNumber: string;
  customerId: string;
  date: string;
  lines: SalesOrderLine[];
  subtotal: number;
  tax: number;
  total: number;
  status: "draft" | "confirmed" | "shipped" | "delivered" | "cancelled";
}

export interface SalesOrderLine {
  itemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  total: number;
}

// Procurement
export interface Vendor extends BaseEntity {
  code: string;
  name: string;
  email: string;
  phone?: string;
  address: Address;
  taxId?: string;
  paymentTerms: string;
}

export interface PurchaseOrder extends BaseEntity {
  orderNumber: string;
  vendorId: string;
  date: string;
  expectedDate: string;
  lines: PurchaseOrderLine[];
  subtotal: number;
  tax: number;
  total: number;
  status: "draft" | "sent" | "received" | "invoiced" | "cancelled";
}

export interface PurchaseOrderLine {
  itemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  total: number;
}

// HR
export interface Employee extends BaseEntity {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  position: string;
  hireDate: string;
  salary: number;
  status: "active" | "onLeave" | "terminated";
}

// Shared
export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string>;
}
