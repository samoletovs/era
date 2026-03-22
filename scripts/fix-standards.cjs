// Temporary script to apply development standards fixes across the codebase
const fs = require("fs");

function fix(file, replacements) {
  let content = fs.readFileSync(file, "utf8");
  for (const [from, to] of replacements) {
    if (!content.includes(from)) {
      console.log("WARN: not found in " + file + ": " + from.slice(0, 80).replace(/\n/g, "\\n"));
      continue;
    }
    content = content.replace(from, to);
  }
  fs.writeFileSync(file, content);
  console.log("Fixed: " + file);
}

// === invoice.ts: add docType to invoice creation + fix IS_DEFINED ===
fix("src/backend/services/invoice.ts", [
  [
    "    id: uuidv4(),\n    companyId: input.companyId,\n    invoiceNumber,\n    type: input.type,",
    '    id: uuidv4(),\n    companyId: input.companyId,\n    docType: "invoice" as const,\n    invoiceNumber,\n    type: input.type,',
  ],
  [
    "    id: uuidv4(),\n    companyId: input.companyId,\n    invoiceNumber,\n    type: original.type,",
    '    id: uuidv4(),\n    companyId: input.companyId,\n    docType: "invoice" as const,\n    invoiceNumber,\n    type: original.type,',
  ],
  [
    "IS_DEFINED(c.invoiceNumber) ${typeFilter}",
    'c.docType = "invoice" ${typeFilter}',
  ],
  [
    'c.sourceId = @sid AND IS_DEFINED(c.entryNumber)"',
    'c.sourceId = @sid AND c.docType = "journal-entry""',
  ],
]);

// === payment.ts: add docType to payment creation + fix IS_DEFINED ===
fix("src/backend/services/payment.ts", [
  [
    "    id: uuidv4(),\n    companyId: input.companyId,\n    type: input.type,",
    '    id: uuidv4(),\n    companyId: input.companyId,\n    docType: "payment" as const,\n    type: input.type,',
  ],
  [
    "IS_DEFINED(c.bankAccountIban) ${typeFilter}",
    'c.docType = "payment" ${typeFilter}',
  ],
]);

// === ledger.ts: add docType to journal entry creation + fix IS_DEFINED ===
fix("src/backend/services/ledger.ts", [
  [
    "    id: uuidv4(),\n    companyId: input.companyId,\n    entryNumber,",
    '    id: uuidv4(),\n    companyId: input.companyId,\n    docType: "journal-entry" as const,\n    entryNumber,',
  ],
  [
    "c.period = @period AND IS_DEFINED(c.entryNumber)",
    'c.period = @period AND c.docType = "journal-entry"',
  ],
  [
    "IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide) AND (c.isPostable = true OR NOT IS_DEFINED(c.isPostable))",
    'c.docType = "account" AND (c.isPostable = true OR c.isPostable = false)',
  ],
  [
    "IS_DEFINED(c.entryNumber) AND c.status = 'posted'",
    'c.docType = "journal-entry" AND c.status = \'posted\'',
  ],
]);

// === inventory.ts: add docType to item creation + fix IS_DEFINED ===
fix("src/backend/services/inventory.ts", [
  [
    "    id: uuidv4(),\n    companyId: input.companyId,\n    code: input.code,",
    '    id: uuidv4(),\n    companyId: input.companyId,\n    docType: "item" as const,\n    code: input.code,',
  ],
  [
    "IS_DEFINED(c.code) AND IS_DEFINED(c.sellingPrice)",
    'c.docType = "item"',
  ],
]);

// === contact.ts: add emitEvent import and call ===
fix("src/backend/services/contact.ts", [
  [
    'import type { Contact } from "@shared/types";',
    'import { emitEvent } from "./events.js";\nimport type { Contact } from "@shared/types";',
  ],
  [
    "  await containers.contacts().items.create(contact);\n  return contact;\n}",
    '  await containers.contacts().items.create(contact);\n\n  await emitEvent({\n    companyId: input.companyId,\n    type: "contact.created",\n    actor: input.createdBy,\n    documentType: "contact",\n    documentId: contact.id,\n    data: { name: contact.name, type: contact.type },\n  });\n\n  return contact;\n}',
  ],
]);

// === company.ts: add emitEvent ===
fix("src/backend/services/company.ts", [
  [
    'import type { Company, CompanySettings } from "@shared/types";',
    'import { emitEvent } from "./events.js";\nimport type { Company, CompanySettings } from "@shared/types";',
  ],
  [
    "  return company;\n}\n\nexport async function getCompany",
    '  await emitEvent({\n    companyId: id,\n    type: "company.created",\n    actor: input.createdBy,\n    documentType: "company",\n    documentId: id,\n    data: { name: company.name, code: company.code },\n  });\n\n  return company;\n}\n\nexport async function getCompany',
  ],
]);

// === inventory.ts: add emitEvent for item creation ===
fix("src/backend/services/inventory.ts", [
  [
    'import type { Item, StockMovement } from "@shared/types";',
    'import { emitEvent } from "./events.js";\nimport type { Item, StockMovement } from "@shared/types";',
  ],
  [
    "  await containers.inventory().items.create(item);\n  return item;\n}",
    '  await containers.inventory().items.create(item);\n\n  await emitEvent({\n    companyId: input.companyId,\n    type: "item.created",\n    actor: input.createdBy,\n    documentType: "item",\n    documentId: item.id,\n    data: { code: item.code, name: item.name, type: item.type },\n  });\n\n  return item;\n}',
  ],
]);

// === router.ts: fix IS_DEFINED queries ===
fix("src/backend/api/router.ts", [
  [
    'IS_DEFINED(c.code) AND IS_DEFINED(c.normalSide) ORDER BY c.code"',
    'c.docType = "account" ORDER BY c.code"',
  ],
  [
    'IS_DEFINED(c.entryNumber) ORDER BY c.date DESC"',
    'c.docType = "journal-entry" ORDER BY c.date DESC"',
  ],
  [
    "IS_DEFINED(c.invoiceNumber) ${typeFilter} ORDER BY c.date DESC",
    'c.docType = "invoice" ${typeFilter} ORDER BY c.date DESC',
  ],
  [
    'IS_DEFINED(c.code) ORDER BY c.name"',
    'c.docType = "item" ORDER BY c.name"',
  ],
  [
    'AND IS_DEFINED(c.invoiceNumber) ORDER BY c.date DESC"',
    'AND c.docType = "invoice" ORDER BY c.date DESC"',
  ],
  [
    'AND IS_DEFINED(c.bankAccountIban) ORDER BY c.date DESC"',
    'AND c.docType = "payment" ORDER BY c.date DESC"',
  ],
  [
    'IS_DEFINED(c.invoiceNumber) ORDER BY c.date DESC"',
    'c.docType = "invoice" ORDER BY c.date DESC"',
  ],
]);

// === autonomous-tasks.ts: fix IS_DEFINED queries  ===
fix("src/backend/services/autonomous-tasks.ts", [
  [
    'IS_DEFINED(c.invoiceNumber) AND (c.status',
    'c.docType = "invoice" AND (c.status',
  ],
  [
    "IS_DEFINED(c.status) AND NOT IS_DEFINED(c.entryNumber) AND NOT IS_DEFINED(c.code)",
    'c.docType = "fiscal-period"',
  ],
  [
    "IS_DEFINED(c.invoiceNumber) AND c.status = 'draft'",
    'c.docType = "invoice" AND c.status = \'draft\'',
  ],
  [
    "IS_DEFINED(c.vatPayable)",
    'c.docType = "vat-return"',
  ],
]);

console.log("\nAll service fixes applied successfully!");
