/**
 * Test factories — small helpers for setting up test data via API.
 *
 * Each factory makes one HTTP call and returns the unwrapped data envelope.
 * They throw if the call fails so tests fail fast at the source of the problem.
 */
import request from "supertest";
import { authHeader } from "./test-server.js";

interface CompanyOptions {
  name?: string;
  registrationNumber?: string;
  country?: string;
}

export async function createTestCompany(
  app: unknown,
  opts: CompanyOptions = {},
): Promise<{ id: string; name: string }> {
  const res = await request(app as never)
    .post("/api/companies")
    .set(authHeader)
    .send({
      name: opts.name ?? "SIA Test Latvia",
      registrationNumber: opts.registrationNumber ?? "40003000001",
      legalAddress: {
        street: "Brīvības iela 1",
        city: "Rīga",
        postalCode: "LV-1010",
        country: opts.country ?? "LV",
      },
    });
  if (res.status !== 201) {
    throw new Error(
      `createTestCompany failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return res.body.data;
}

interface ContactOptions {
  name?: string;
  type?: "customer" | "vendor" | "both";
  registrationNumber?: string;
}

export async function createTestContact(
  app: unknown,
  companyId: string,
  opts: ContactOptions = {},
): Promise<{ id: string; name: string }> {
  const res = await request(app as never)
    .post(`/api/companies/${companyId}/contacts`)
    .set(authHeader)
    .send({
      name: opts.name ?? "ABC SIA",
      type: opts.type ?? "customer",
      registrationNumber: opts.registrationNumber ?? "40103000002",
    });
  if (res.status !== 201) {
    throw new Error(
      `createTestContact failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return res.body.data;
}
