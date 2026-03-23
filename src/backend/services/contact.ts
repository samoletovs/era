import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { emitEvent } from "./events.js";
import { getNextNumber } from "./sequences.js";
import { generateShortName } from "./company.js";
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

export async function createContact(input: CreateContactInput): Promise<Contact> {
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

export async function getContact(companyId: string, contactId: string): Promise<Contact | null> {
  try {
    const { resource } = await containers.contacts()
      .item(contactId, companyId)
      .read<Contact>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function findContactByName(companyId: string, name: string, registrationNumber?: string): Promise<Contact | null> {
  // First try exact match on registration number (most reliable identifier)
  if (registrationNumber) {
    const { resources: byReg } = await containers.contacts().items
      .query<Contact>({
        query: "SELECT * FROM c WHERE c.companyId = @cid AND c.registrationNumber = @reg",
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
  const { resources: byName } = await containers.contacts().items
    .query<Contact>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND LOWER(c.name) = @name",
      parameters: [
        { name: "@cid", value: companyId },
        { name: "@name", value: nameLower },
      ],
    })
    .fetchAll();
  if (byName.length > 0) return byName[0];

  return null;
}

export async function listContacts(companyId: string, type?: Contact["type"]): Promise<Contact[]> {
  const typeFilter = type && type !== "both" ? "AND (c.type = @type OR c.type = 'both')" : "";
  const params: { name: string; value: string }[] = [
    { name: "@cid", value: companyId },
  ];
  if (type && type !== "both") params.push({ name: "@type", value: type });

  const { resources } = await containers.contacts().items
    .query<Contact>({
      query: `SELECT * FROM c WHERE c.companyId = @cid ${typeFilter} ORDER BY c.name`,
      parameters: params,
    })
    .fetchAll();

  return resources;
}
