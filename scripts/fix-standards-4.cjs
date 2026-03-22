// Fix script phase 4 - remaining IS_DEFINED queries + frontend alert/confirm
const fs = require("fs");

function fixIS(file) {
  let c = fs.readFileSync(file, "utf8");
  const before = c;
  
  // Generic replacements for IS_DEFINED patterns
  c = c.replace(/IS_DEFINED\(c\.invoiceNumber\)/g, 'c.docType = "invoice"');
  c = c.replace(/IS_DEFINED\(c\.entryNumber\)/g, 'c.docType = "journal-entry"');
  c = c.replace(/IS_DEFINED\(c\.bankAccountIban\)/g, 'c.docType = "payment"');
  c = c.replace(/IS_DEFINED\(c\.vatPayable\)/g, 'c.docType = "vat-return"');
  c = c.replace(/IS_DEFINED\(c\.code\) AND IS_DEFINED\(c\.normalSide\)/g, 'c.docType = "account"');
  c = c.replace(/IS_DEFINED\(c\.code\) AND IS_DEFINED\(c\.sellingPrice\)/g, 'c.docType = "item"');
  c = c.replace(/IS_DEFINED\(c\.bankAccountCode\) AND IS_DEFINED\(c\.statementBalance\)/g, 'c.docType = "bank-reconciliation"');
  c = c.replace(/IS_DEFINED\(c\.frequency\) AND IS_DEFINED\(c\.lines\) AND NOT IS_DEFINED\(c\.invoiceNumber\)/g, 'c.docType = "recurring-template"');
  c = c.replace(/IS_DEFINED\(c\.fiscalYear\) AND c\.fiscalYear = @year AND IS_DEFINED\(c\.accountCode\) AND NOT IS_DEFINED\(c\.entryNumber\) AND NOT IS_DEFINED\(c\.normalSide\)/g, 'c.docType = "budget" AND c.fiscalYear = @year');
  c = c.replace(/IS_DEFINED\(c\.status\) AND NOT IS_DEFINED\(c\.entryNumber\) AND NOT IS_DEFINED\(c\.code\)/g, 'c.docType = "fiscal-period"');
  
  if (c !== before) {
    fs.writeFileSync(file, c);
    console.log("Fixed IS_DEFINED: " + file);
  } else {
    console.log("No IS_DEFINED changes: " + file);
  }
}

// Fix remaining backend files with IS_DEFINED
fixIS("src/backend/services/reporting.ts");
fixIS("src/backend/services/period-close.ts");
fixIS("src/backend/services/bank-reconciliation.ts");
fixIS("src/backend/services/budget.ts");
fixIS("src/backend/services/recurring-entries.ts");
fixIS("src/backend/services/ledger.ts");
fixIS("src/backend/services/invoice.ts");
fixIS("src/backend/services/payment.ts");
fixIS("src/backend/services/autonomous-tasks.ts");
fixIS("src/backend/api/router.ts");

// Fix frontend alert/confirm in Invoices.tsx
let inv = fs.readFileSync("src/frontend/pages/Invoices.tsx", "utf8");
if (inv.includes("alert(")) {
  // Replace alert(e.message) with console.error
  inv = inv.replace(/alert\(e\.message\)/g, "console.error(e.message)");
  // Replace confirm() with a simple window.confirm for now (proper toast later)
  // Actually keep confirm for destructive actions — it's the only option without a toast lib
  fs.writeFileSync("src/frontend/pages/Invoices.tsx", inv);
  console.log("Fixed: Invoices.tsx - removed alert()");
}

console.log("\nPhase 4 complete!");
