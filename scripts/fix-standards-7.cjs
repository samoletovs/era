// Fix script phase 7 - remaining IS_DEFINED cleanups
const fs = require("fs");

// budget.ts - fix hybrid query
let b = fs.readFileSync("src/backend/services/budget.ts", "utf8");
b = b.replace(
  "IS_DEFINED(c.fiscalYear) AND c.fiscalYear = @year AND IS_DEFINED(c.accountCode) AND NOT c.docType = 'journal-entry' AND NOT IS_DEFINED(c.normalSide)",
  "c.docType = 'budget' AND c.fiscalYear = @year"
);
fs.writeFileSync("src/backend/services/budget.ts", b);
console.log("Fixed: budget.ts");

// fixed-assets.ts - fix IS_DEFINED for fixed assets (uses ledger container)
let fa = fs.readFileSync("src/backend/services/fixed-assets.ts", "utf8");
fa = fa.replace(
  /IS_DEFINED\(c\.usefulLifeMonths\)/g,
  "c.docType = 'fixed-asset'"
);
fs.writeFileSync("src/backend/services/fixed-assets.ts", fa);
console.log("Fixed: fixed-assets.ts");

// period-close.ts - fix hybrid query
let pc = fs.readFileSync("src/backend/services/period-close.ts", "utf8");
pc = pc.replace(
  "IS_DEFINED(c.status) AND NOT c.docType = 'journal-entry' AND NOT IS_DEFINED(c.code)",
  "c.docType = 'fiscal-period'"
);
fs.writeFileSync("src/backend/services/period-close.ts", pc);
console.log("Fixed: period-close.ts");

// recurring-entries.ts - fix hybrid query
let re = fs.readFileSync("src/backend/services/recurring-entries.ts", "utf8");
re = re.replace(
  "IS_DEFINED(c.frequency) AND IS_DEFINED(c.lines) AND NOT c.docType = 'invoice'",
  "c.docType = 'recurring-template'"
);
fs.writeFileSync("src/backend/services/recurring-entries.ts", re);
console.log("Fixed: recurring-entries.ts");

// posting-rules.ts - the IS_DEFINED(c.effectiveTo) is legitimate null check, not type discrimination
// Leave it as-is — it checks if the field exists (valid Cosmos DB pattern for nullable fields)
console.log("SKIP: posting-rules.ts — IS_DEFINED(c.effectiveTo) is a null check, not type discrimination");

console.log("\nPhase 7 complete!");
