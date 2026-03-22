// Fix script phase 2 - handles newline-sensitive replacements
const fs = require("fs");

function fixFile(file, pairs) {
  let c = fs.readFileSync(file, "utf8");
  let changed = false;
  for (const [pattern, replacement] of pairs) {
    if (c.includes(pattern)) {
      c = c.replace(pattern, replacement);
      changed = true;
    } else {
      console.log("  SKIP: " + pattern.slice(0, 70).replace(/\n/g, "\\n"));
    }
  }
  if (changed) {
    fs.writeFileSync(file, c);
    console.log("OK: " + file);
  }
}

// invoice.ts - find unique markers for creation
let ic = fs.readFileSync("src/backend/services/invoice.ts", "utf8");
// First createInvoice - the unique marker is "amountPaid: 0,"
ic = ic.replace(
  /id: uuidv4\(\),\n(\s+)companyId: input\.companyId,\n(\s+)invoiceNumber,\n(\s+)type: input\.type,/,
  'id: uuidv4(),\n$1companyId: input.companyId,\n$2docType: "invoice" as const,\n$3invoiceNumber,\n$3type: input.type,'
);
// Second createInvoice (credit note) - unique marker is "type: original.type"
ic = ic.replace(
  /id: uuidv4\(\),\n(\s+)companyId: input\.companyId,\n(\s+)invoiceNumber,\n(\s+)type: original\.type,/,
  'id: uuidv4(),\n$1companyId: input.companyId,\n$2docType: "invoice" as const,\n$3invoiceNumber,\n$3type: original.type,'
);
fs.writeFileSync("src/backend/services/invoice.ts", ic);
console.log("OK: invoice.ts - docType added");

// payment.ts
let pc = fs.readFileSync("src/backend/services/payment.ts", "utf8");
pc = pc.replace(
  /id: uuidv4\(\),\n(\s+)companyId: input\.companyId,\n(\s+)type: input\.type,/,
  'id: uuidv4(),\n$1companyId: input.companyId,\n$2docType: "payment" as const,\n$2type: input.type,'
);
fs.writeFileSync("src/backend/services/payment.ts", pc);
console.log("OK: payment.ts - docType added");

// ledger.ts
let lc = fs.readFileSync("src/backend/services/ledger.ts", "utf8");
lc = lc.replace(
  /id: uuidv4\(\),\n(\s+)companyId: input\.companyId,\n(\s+)entryNumber,/,
  'id: uuidv4(),\n$1companyId: input.companyId,\n$2docType: "journal-entry" as const,\n$2entryNumber,'
);
fs.writeFileSync("src/backend/services/ledger.ts", lc);
console.log("OK: ledger.ts - docType added");

// inventory.ts - item creation
let inv = fs.readFileSync("src/backend/services/inventory.ts", "utf8");
inv = inv.replace(
  /id: uuidv4\(\),\n(\s+)companyId: input\.companyId,\n(\s+)code: input\.code,/,
  'id: uuidv4(),\n$1companyId: input.companyId,\n$2docType: "item" as const,\n$2code: input.code,'
);
// stock movement creation
inv = inv.replace(
  /id: uuidv4\(\),\n(\s+)companyId: input\.companyId,\n(\s+)itemId: input\.itemId,/,
  'id: uuidv4(),\n$1companyId: input.companyId,\n$2docType: "stock-movement" as const,\n$2itemId: input.itemId,'
);
fs.writeFileSync("src/backend/services/inventory.ts", inv);
console.log("OK: inventory.ts - docType added (item + stock movement)");

// contact.ts - add emitEvent
let ct = fs.readFileSync("src/backend/services/contact.ts", "utf8");
if (!ct.includes("emitEvent")) {
  ct = ct.replace(
    'import type { Contact } from "@shared/types";',
    'import { emitEvent } from "./events.js";\nimport type { Contact } from "@shared/types";'
  );
  ct = ct.replace(
    /await containers\.contacts\(\)\.items\.create\(contact\);\n(\s+)return contact;\n\}/,
    `await containers.contacts().items.create(contact);

  await emitEvent({
    companyId: input.companyId,
    type: "contact.created",
    actor: input.createdBy,
    documentType: "contact",
    documentId: contact.id,
    data: { name: contact.name, type: contact.type },
  });

  return contact;
}`
  );
  fs.writeFileSync("src/backend/services/contact.ts", ct);
  console.log("OK: contact.ts - emitEvent added");
}

// company.ts - add emitEvent
let co = fs.readFileSync("src/backend/services/company.ts", "utf8");
if (!co.includes("emitEvent")) {
  co = co.replace(
    'import type { Company, CompanySettings } from "@shared/types";',
    'import { emitEvent } from "./events.js";\nimport type { Company, CompanySettings } from "@shared/types";'
  );
  co = co.replace(
    /return company;\n\}\n\nexport async function getCompany/,
    `await emitEvent({
    companyId: id,
    type: "company.created",
    actor: input.createdBy,
    documentType: "company",
    documentId: id,
    data: { name: company.name, code: company.code },
  });

  return company;
}

export async function getCompany`
  );
  fs.writeFileSync("src/backend/services/company.ts", co);
  console.log("OK: company.ts - emitEvent added");
}

// inventory.ts - add emitEvent for item
inv = fs.readFileSync("src/backend/services/inventory.ts", "utf8");
if (!inv.includes("emitEvent")) {
  inv = inv.replace(
    'import type { Item, StockMovement } from "@shared/types";',
    'import { emitEvent } from "./events.js";\nimport type { Item, StockMovement } from "@shared/types";'
  );
  inv = inv.replace(
    /await containers\.inventory\(\)\.items\.create\(item\);\n(\s+)return item;\n\}/,
    `await containers.inventory().items.create(item);

  await emitEvent({
    companyId: input.companyId,
    type: "item.created",
    actor: input.createdBy,
    documentType: "item",
    documentId: item.id,
    data: { code: item.code, name: item.name, type: item.type },
  });

  return item;
}`
  );
  fs.writeFileSync("src/backend/services/inventory.ts", inv);
  console.log("OK: inventory.ts - emitEvent added");
}

console.log("\nPhase 2 fixes complete!");
