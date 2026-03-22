import { v4 as uuidv4 } from "uuid";
import { containers } from "./cosmos.js";
import { emitEvent } from "./events.js";
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
  const now = new Date().toISOString();
  const contact: Contact = {
    id: uuidv4(),
    companyId: input.companyId,
    type: input.type,
    name: input.name,
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

export async function listContacts(companyId: string, type?: Contact["type"]): Promise<Contact[]> {
  const typeFilter = type ? "AND c.type = @type" : "";
  const params: { name: string; value: string }[] = [
    { name: "@cid", value: companyId },
  ];
  if (type) params.push({ name: "@type", value: type });

  const { resources } = await containers.contacts().items
    .query<Contact>({
      query: `SELECT * FROM c WHERE c.companyId = @cid ${typeFilter} ORDER BY c.name`,
      parameters: params,
    })
    .fetchAll();

  return resources;
}
