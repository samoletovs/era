// Fix script phase 5 - fix SQL string quoting (double quotes → single quotes for docType values)
const fs = require("fs");
const glob = require("path");

const files = [
  "src/backend/api/router.ts",
  "src/backend/services/reporting.ts",
  "src/backend/services/period-close.ts", 
  "src/backend/services/bank-reconciliation.ts",
  "src/backend/services/budget.ts",
  "src/backend/services/recurring-entries.ts",
  "src/backend/services/ledger.ts",
  "src/backend/services/invoice.ts",
  "src/backend/services/payment.ts",
  "src/backend/services/autonomous-tasks.ts",
  "src/backend/services/inventory.ts",
];

for (const file of files) {
  let c = fs.readFileSync(file, "utf8");
  const before = c;
  
  // In regular strings (double-quoted), fix: c.docType = "invoice" → c.docType = 'invoice'
  // Pattern: inside a "..." string, replace = "value" with = 'value'
  c = c.replace(/c\.docType = "([^"]+)"/g, "c.docType = '$1'");
  
  if (c !== before) {
    fs.writeFileSync(file, c);
    const count = (before.match(/c\.docType = "/g) || []).length;
    console.log(`Fixed ${count} docType quotes: ${file}`);
  }
}

console.log("\nPhase 5 complete - SQL strings fixed!");
