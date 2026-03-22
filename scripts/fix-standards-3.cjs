// Fix script phase 3 - add emitEvent calls with CRLF handling
const fs = require("fs");

// contact.ts
let ct = fs.readFileSync("src/backend/services/contact.ts", "utf8");
if (!ct.includes("contact.created")) {
  ct = ct.replace(
    "await containers.contacts().items.create(contact);\r\n  return contact;\r\n}",
    `await containers.contacts().items.create(contact);\r\n\r\n  await emitEvent({\r\n    companyId: input.companyId,\r\n    type: "contact.created",\r\n    actor: input.createdBy,\r\n    documentType: "contact",\r\n    documentId: contact.id,\r\n    data: { name: contact.name, type: contact.type },\r\n  });\r\n\r\n  return contact;\r\n}`
  );
  fs.writeFileSync("src/backend/services/contact.ts", ct);
  console.log("OK: contact.ts - emitEvent added");
} else {
  console.log("SKIP: contact.ts already has emitEvent");
}

// company.ts
let co = fs.readFileSync("src/backend/services/company.ts", "utf8");
if (!co.includes("company.created")) {
  co = co.replace(
    "return company;\r\n}\r\n\r\nexport async function getCompany",
    `await emitEvent({\r\n    companyId: id,\r\n    type: "company.created",\r\n    actor: input.createdBy,\r\n    documentType: "company",\r\n    documentId: id,\r\n    data: { name: company.name, code: company.code },\r\n  });\r\n\r\n  return company;\r\n}\r\n\r\nexport async function getCompany`
  );
  fs.writeFileSync("src/backend/services/company.ts", co);
  console.log("OK: company.ts - emitEvent added");
} else {
  console.log("SKIP: company.ts already has emitEvent");
}

// inventory.ts
let inv = fs.readFileSync("src/backend/services/inventory.ts", "utf8");
if (!inv.includes("item.created")) {
  inv = inv.replace(
    "await containers.inventory().items.create(item);\r\n  return item;\r\n}",
    `await containers.inventory().items.create(item);\r\n\r\n  await emitEvent({\r\n    companyId: input.companyId,\r\n    type: "item.created",\r\n    actor: input.createdBy,\r\n    documentType: "item",\r\n    documentId: item.id,\r\n    data: { code: item.code, name: item.name, type: item.type },\r\n  });\r\n\r\n  return item;\r\n}`
  );
  fs.writeFileSync("src/backend/services/inventory.ts", inv);
  console.log("OK: inventory.ts - emitEvent added");
} else {
  console.log("SKIP: inventory.ts already has emitEvent");
}

console.log("\nPhase 3 complete!");
