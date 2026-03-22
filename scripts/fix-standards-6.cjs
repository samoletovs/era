// Fix script phase 6 - add missing docType to object literals
const fs = require("fs");

// chart-of-accounts.ts - accounts built for company
let coa = fs.readFileSync("src/backend/services/chart-of-accounts.ts", "utf8");
// The buildAccountsForCompany function creates account objects
coa = coa.replace(
  /return templates\.map\((t|template)/,
  (match, varName) => match // keep as-is, we need to add docType in the map
);
// Add docType to the account creation in buildAccountsForCompany
coa = coa.replace(
  /id: `\$\{companyId\}-acct-\$\{(t|template)\.code\}`/,
  (match) => `docType: "account" as const,\n    ${match}`
);
fs.writeFileSync("src/backend/services/chart-of-accounts.ts", coa);
console.log("Fixed: chart-of-accounts.ts");

// company.ts - fix the double-is isisVatRegistered  
let co = fs.readFileSync("src/backend/services/company.ts", "utf8");
co = co.replace("isisVatRegistered:", "isVatRegistered:");
fs.writeFileSync("src/backend/services/company.ts", co);
console.log("Fixed: company.ts (isisVatRegistered)");

// invoice.ts - add docType to createInvoice object literal
let inv = fs.readFileSync("src/backend/services/invoice.ts", "utf8");
// First createInvoice (main)
inv = inv.replace(
  /const invoice: Invoice = \{\s*\r?\n\s*id: uuidv4\(\),/,
  'const invoice: Invoice = {\n    id: uuidv4(),\n    docType: "invoice" as const,'
);
// Remove any duplicate docType that was already added by phase 2
inv = inv.replace(/docType: "invoice" as const,\s*\r?\n\s*docType: "invoice" as const,/g, 'docType: "invoice" as const,');
// Credit note
inv = inv.replace(
  /const creditNote: Invoice = \{\s*\r?\n\s*id: uuidv4\(\),/,
  'const creditNote: Invoice = {\n    id: uuidv4(),\n    docType: "invoice" as const,'
);
inv = inv.replace(/docType: "invoice" as const,\s*\r?\n\s*docType: "invoice" as const,/g, 'docType: "invoice" as const,');
fs.writeFileSync("src/backend/services/invoice.ts", inv);
console.log("Fixed: invoice.ts");

// payment.ts - add docType
let pay = fs.readFileSync("src/backend/services/payment.ts", "utf8");
pay = pay.replace(
  /const payment: Payment = \{\s*\r?\n\s*id: uuidv4\(\),/,
  'const payment: Payment = {\n    id: uuidv4(),\n    docType: "payment" as const,'
);
pay = pay.replace(/docType: "payment" as const,\s*\r?\n\s*docType: "payment" as const,/g, 'docType: "payment" as const,');
fs.writeFileSync("src/backend/services/payment.ts", pay);
console.log("Fixed: payment.ts");

// ledger.ts - add docType
let led = fs.readFileSync("src/backend/services/ledger.ts", "utf8");
led = led.replace(
  /const entry: JournalEntry = \{\s*\r?\n\s*id: uuidv4\(\),/,
  'const entry: JournalEntry = {\n    id: uuidv4(),\n    docType: "journal-entry" as const,'
);
led = led.replace(/docType: "journal-entry" as const,\s*\r?\n\s*docType: "journal-entry" as const,/g, 'docType: "journal-entry" as const,');
fs.writeFileSync("src/backend/services/ledger.ts", led);
console.log("Fixed: ledger.ts");

// inventory.ts - add docType to Item and StockMovement
let it = fs.readFileSync("src/backend/services/inventory.ts", "utf8");
it = it.replace(
  /const item: Item = \{\s*\r?\n\s*id: uuidv4\(\),/,
  'const item: Item = {\n    id: uuidv4(),\n    docType: "item" as const,'
);
it = it.replace(/docType: "item" as const,\s*\r?\n\s*docType: "item" as const,/g, 'docType: "item" as const,');
it = it.replace(
  /const movement: StockMovement = \{\s*\r?\n\s*id: uuidv4\(\),/,
  'const movement: StockMovement = {\n    id: uuidv4(),\n    docType: "stock-movement" as const,'
);
it = it.replace(/docType: "stock-movement" as const,\s*\r?\n\s*docType: "stock-movement" as const,/g, 'docType: "stock-movement" as const,');
fs.writeFileSync("src/backend/services/inventory.ts", it);
console.log("Fixed: inventory.ts");

// reporting.ts - add docType to VatReturn  
let rep = fs.readFileSync("src/backend/services/reporting.ts", "utf8");
rep = rep.replace(
  /const vatReturn: VatReturn = \{\s*\r?\n\s*id: uuidv4\(\),/,
  'const vatReturn: VatReturn = {\n    id: uuidv4(),\n    docType: "vat-return" as const,'
);
fs.writeFileSync("src/backend/services/reporting.ts", rep);
console.log("Fixed: reporting.ts");

// Fix duplicate FiscalPeriod export from index.ts
let idx = fs.readFileSync("src/shared/types/index.ts", "utf8");
// data-types.ts may have exported something that conflicts
// Check if there's a FiscalPeriod in data-types
let dt = fs.readFileSync("src/shared/types/data-types.ts", "utf8");
if (dt.includes("FiscalPeriod")) {
  // Rename the Zod schema version to FiscalPeriodSchema  
  dt = dt.replace('export const FiscalPeriod =', 'export const FiscalPeriodFormat =');
  dt = dt.replace("export type FiscalPeriodType", "export type FiscalPeriodFormatType");
  fs.writeFileSync("src/shared/types/data-types.ts", dt);
  console.log("Fixed: data-types.ts (renamed FiscalPeriod to FiscalPeriodFormat)");
}

console.log("\nPhase 6 complete!");
