import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { emitEvent } from "./events.js";
import { getNextNumber } from "./sequences.js";
import { generateShortName } from "./company.js";
import { searchCompanyByRegNumber } from "./company-lookup.js";
import type { Contact } from "@shared/types";

interface CreateContactInput {
  companyId: string;
  type: "customer" | "vendor" | "both";
  name: string;
  registrationNumber?: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
  address: Contact["address"];
  paymentTermsDays?: number;
  createdBy: string;
}

export async function createContact(
  input: CreateContactInput,
): Promise<Contact> {
  const contactNumber = await getNextNumber(input.companyId, "contact");
  const now = new Date().toISOString();
  const contact: Contact = {
    id: uuidv4(),
    companyId: input.companyId,
    contactNumber,
    type: input.type,
    name: input.name,
    shortName: generateShortName(input.name),
    registrationNumber: input.registrationNumber,
    vatNumber: input.vatNumber,
    email: input.email,
    phone: input.phone,
    address: input.address,
    paymentTermsDays: input.paymentTermsDays ?? 30,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };

  await containers.contacts().items.create(contact);

  await emitEvent({
    companyId: input.companyId,
    type: "contact.created",
    actor: input.createdBy,
    documentType: "contact",
    documentId: contact.id,
    data: { name: contact.name, type: contact.type },
  });

  return contact;
}

export async function getContact(
  companyId: string,
  contactId: string,
): Promise<Contact | null> {
  try {
    const { resource } = await containers
      .contacts()
      .item(contactId, companyId)
      .read<Contact>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function findContactByName(
  companyId: string,
  name: string,
  registrationNumber?: string,
): Promise<Contact | null> {
  // First try exact match on registration number (most reliable identifier)
  if (registrationNumber) {
    const { resources: byReg } = await containers
      .contacts()
      .items.query<Contact>({
        query:
          "SELECT * FROM c WHERE c.companyId = @cid AND c.registrationNumber = @reg",
        parameters: [
          { name: "@cid", value: companyId },
          { name: "@reg", value: registrationNumber },
        ],
      })
      .fetchAll();
    if (byReg.length > 0) return byReg[0];
  }

  // Then try case-insensitive name match
  const nameLower = name.trim().toLowerCase();
  const { resources: byName } = await containers
    .contacts()
    .items.query<Contact>({
      query:
        "SELECT * FROM c WHERE c.companyId = @cid AND LOWER(c.name) = @name",
      parameters: [
        { name: "@cid", value: companyId },
        { name: "@name", value: nameLower },
      ],
    })
    .fetchAll();
  if (byName.length > 0) return byName[0];

  return null;
}

export async function updateContact(
  companyId: string,
  contactId: string,
  updates: Partial<
    Pick<
      Contact,
      | "name"
      | "shortName"
      | "type"
      | "registrationNumber"
      | "vatNumber"
      | "email"
      | "phone"
      | "address"
      | "paymentTermsDays"
      | "isActive"
    >
  >,
): Promise<Contact | null> {
  const contact = await getContact(companyId, contactId);
  if (!contact) return null;

  Object.assign(contact, updates, { updatedAt: new Date().toISOString() });
  if (updates.name && !updates.shortName) {
    contact.shortName = generateShortName(updates.name);
  }
  const { resource } = await containers
    .contacts()
    .item(contactId, companyId)
    .replace(contact);
  return resource ?? null;
}

export async function listContacts(
  companyId: string,
  type?: Contact["type"],
): Promise<Contact[]> {
  const typeFilter =
    type && type !== "both" ? "AND (c.type = @type OR c.type = 'both')" : "";
  const params: { name: string; value: string }[] = [
    { name: "@cid", value: companyId },
  ];
  if (type && type !== "both") params.push({ name: "@type", value: type });

  const { resources } = await containers
    .contacts()
    .items.query<Contact>({
      query: `SELECT * FROM c WHERE c.companyId = @cid ${typeFilter} ORDER BY c.name`,
      parameters: params,
    })
    .fetchAll();

  return resources;
}

// ─── Merge Contacts ─────────────────────────────────────────

export interface MergeResult {
  targetContact: Contact;
  invoicesUpdated: number;
  paymentsUpdated: number;
  journalEntriesUpdated: number;
  sourceDeleted: boolean;
}

export async function mergeContacts(
  companyId: string,
  sourceId: string,
  targetId: string,
  actor: string,
): Promise<MergeResult> {
  const source = await getContact(companyId, sourceId);
  const target = await getContact(companyId, targetId);
  if (!source) throw new Error("Source contact not found");
  if (!target) throw new Error("Target contact not found");
  if (sourceId === targetId)
    throw new Error("Cannot merge a contact with itself");

  // 1. Fill missing fields on target from source
  const fieldsToMerge: (keyof Pick<
    Contact,
    "registrationNumber" | "vatNumber" | "email" | "phone" | "notes"
  >)[] = ["registrationNumber", "vatNumber", "email", "phone", "notes"];
  const mergedUpdates: Partial<Contact> = {};
  for (const field of fieldsToMerge) {
    if (!target[field] && source[field]) {
      (mergedUpdates as Record<string, unknown>)[field] = source[field];
    }
  }
  // Merge address fields
  if (source.address) {
    const addr = { ...target.address };
    if (!addr.line1 && source.address.line1) addr.line1 = source.address.line1;
    if (!addr.city && source.address.city) addr.city = source.address.city;
    if (!addr.postalCode && source.address.postalCode)
      addr.postalCode = source.address.postalCode;
    if (!addr.country && source.address.country)
      addr.country = source.address.country;
    mergedUpdates.address = addr;
  }
  // Merge bank account
  if (!target.bankAccount && source.bankAccount) {
    mergedUpdates.bankAccount = source.bankAccount;
  }
  // If source is vendor and target is customer (or vice versa), upgrade to "both"
  if (source.type !== target.type && target.type !== "both") {
    mergedUpdates.type = "both";
  }

  if (Object.keys(mergedUpdates).length > 0) {
    await updateContact(companyId, targetId, mergedUpdates);
  }

  // 2. Reassign invoices
  const { resources: invoices } = await containers
    .documents()
    .items.query<{ id: string; contactId: string; contactName: string }>({
      query:
        "SELECT c.id, c.contactId, c.contactName FROM c WHERE c.companyId = @cid AND c.contactId = @sourceId AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber))",
      parameters: [
        { name: "@cid", value: companyId },
        { name: "@sourceId", value: sourceId },
      ],
    })
    .fetchAll();

  for (const inv of invoices) {
    await containers
      .documents()
      .item(inv.id, companyId)
      .patch([
        { op: "set", path: "/contactId", value: targetId },
        { op: "set", path: "/contactName", value: target.name },
      ]);
  }

  // 3. Reassign payments
  const { resources: payments } = await containers
    .documents()
    .items.query<{ id: string; contactId: string }>({
      query:
        "SELECT c.id, c.contactId FROM c WHERE c.companyId = @cid AND c.contactId = @sourceId AND (c.docType = 'payment' OR IS_DEFINED(c.bankAccountIban))",
      parameters: [
        { name: "@cid", value: companyId },
        { name: "@sourceId", value: sourceId },
      ],
    })
    .fetchAll();

  for (const pay of payments) {
    await containers
      .documents()
      .item(pay.id, companyId)
      .patch([
        { op: "set", path: "/contactId", value: targetId },
        { op: "set", path: "/contactName", value: target.name },
      ]);
  }

  // 4. Reassign journal entry lines that reference the source contact
  const { resources: entries } = await containers
    .ledger()
    .items.query<{
      id: string;
      lines: Array<{ contactId?: string; contactName?: string }>;
    }>({
      query:
        "SELECT c.id, c.lines FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber))",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();

  let journalEntriesUpdated = 0;
  for (const entry of entries) {
    let changed = false;
    for (const line of entry.lines) {
      if (line.contactId === sourceId) {
        line.contactId = targetId;
        line.contactName = target.name;
        changed = true;
      }
    }
    if (changed) {
      await containers
        .ledger()
        .item(entry.id, companyId)
        .patch([{ op: "set", path: "/lines", value: entry.lines }]);
      journalEntriesUpdated++;
    }
  }

  // 5. Delete the source contact
  await containers.contacts().item(sourceId, companyId).delete();

  // 6. Emit event
  await emitEvent({
    companyId,
    type: "contact.merged",
    actor,
    documentType: "contact",
    documentId: targetId,
    data: {
      sourceId,
      sourceName: source.name,
      targetId,
      targetName: target.name,
      invoicesUpdated: invoices.length,
      paymentsUpdated: payments.length,
      journalEntriesUpdated,
    },
  });

  const updatedTarget = await getContact(companyId, targetId);
  return {
    targetContact: updatedTarget!,
    invoicesUpdated: invoices.length,
    paymentsUpdated: payments.length,
    journalEntriesUpdated,
    sourceDeleted: true,
  };
}

// ─── Find Duplicate Contacts ─────────────────────────────────

export interface DuplicateGroup {
  contacts: Contact[];
  reason: string; // e.g. "Same registration number", "Similar name"
}

export async function findDuplicateContacts(
  companyId: string,
): Promise<DuplicateGroup[]> {
  const allContacts = await listContacts(companyId);
  const groups: DuplicateGroup[] = [];
  const used = new Set<string>();

  // Group by registration number (exact match)
  const byRegNum = new Map<string, Contact[]>();
  for (const c of allContacts) {
    if (c.registrationNumber) {
      const key = c.registrationNumber.replace(/\s/g, "");
      if (!byRegNum.has(key)) byRegNum.set(key, []);
      byRegNum.get(key)!.push(c);
    }
  }
  for (const [, dupes] of byRegNum) {
    if (dupes.length > 1) {
      groups.push({ contacts: dupes, reason: "Same registration number" });
      for (const d of dupes) used.add(d.id);
    }
  }

  // Group by similar name (normalized)
  const normalize = (n: string) =>
    n.toLowerCase().replace(/[^a-zāčēģīķļņšūž0-9]/g, "");
  const byName = new Map<string, Contact[]>();
  for (const c of allContacts) {
    if (used.has(c.id)) continue;
    const key = normalize(c.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(c);
  }
  for (const [, dupes] of byName) {
    if (dupes.length > 1) {
      groups.push({ contacts: dupes, reason: "Same name" });
    }
  }

  return groups;
}

// ─── Refresh Contact from Register ──────────────────────────

export interface RegisterDiff {
  field: string;
  current: string;
  register: string;
}

export interface RefreshResult {
  found: boolean;
  diffs: RegisterDiff[];
  registerData?: {
    name: string;
    registrationNumber: string;
    legalForm: string;
    address: string;
  };
}

export async function checkContactRegister(
  companyId: string,
  contactId: string,
): Promise<RefreshResult> {
  const contact = await getContact(companyId, contactId);
  if (!contact) throw new Error("Contact not found");

  if (!contact.registrationNumber) {
    return { found: false, diffs: [], registerData: undefined };
  }

  const result = await searchCompanyByRegNumber(
    contact.registrationNumber.replace(/\s/g, ""),
  );
  if (!result.found || result.results.length === 0) {
    return { found: false, diffs: [], registerData: undefined };
  }

  const reg = result.results[0];
  const diffs: RegisterDiff[] = [];

  if (reg.name && reg.name !== contact.name) {
    diffs.push({ field: "name", current: contact.name, register: reg.name });
  }

  if (
    reg.registrationNumber &&
    reg.registrationNumber !== contact.registrationNumber
  ) {
    diffs.push({
      field: "registrationNumber",
      current: contact.registrationNumber || "—",
      register: reg.registrationNumber,
    });
  }

  // Parse address from register (typically "City, Street, Postal")
  const regAddress = reg.address || "";
  const currentAddress = [
    contact.address?.line1,
    contact.address?.city,
    contact.address?.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
  if (regAddress && regAddress !== currentAddress) {
    diffs.push({
      field: "address",
      current: currentAddress || "—",
      register: regAddress,
    });
  }

  return {
    found: true,
    diffs,
    registerData: {
      name: reg.name,
      registrationNumber: reg.registrationNumber,
      legalForm: reg.legalForm,
      address: reg.address,
    },
  };
}

export async function applyRegisterData(
  companyId: string,
  contactId: string,
  data: { name?: string; address?: string; registrationNumber?: string },
  actor: string,
): Promise<Contact | null> {
  const contact = await getContact(companyId, contactId);
  if (!contact) return null;

  const updates: Partial<Contact> = {};
  if (data.name) {
    updates.name = data.name;
    updates.shortName = generateShortName(data.name);
  }
  if (data.registrationNumber) {
    updates.registrationNumber = data.registrationNumber;
  }
  if (data.address) {
    // Parse register address - typically "City, Street line" or "Street, City, LV-XXXX"
    updates.address = { ...contact.address };
    updates.address.line1 = data.address;
  }

  const updated = await updateContact(companyId, contactId, updates);

  await emitEvent({
    companyId,
    type: "contact.updated",
    actor,
    documentType: "contact",
    documentId: contactId,
    data: { source: "register", fields: Object.keys(updates) },
  });

  return updated;
}
