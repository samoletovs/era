/**
 * Smoke test — proves the test harness works:
 *   1. /health responds 200 with the in-memory cosmos fake
 *   2. dev-bypass auth lets us call /api/auth/me
 *   3. We can create a company via POST /api/companies and read it back
 *
 * If this passes, the harness is ready for the 7 critical-path tests.
 */
import { describe, it, expect } from "vitest";
import request from "supertest";
import { getApp, authHeader, DEV_USER } from "./_harness/test-server.js";

describe("integration harness smoke test", () => {
  it("GET /health returns 200 with healthy status", async () => {
    const app = await getApp();
    const res = await request(app as never).get("/health");
    expect(res.status).toBe(200);
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.body.status).toBe("healthy");
    expect(res.body.checks.api).toBe("healthy");
    expect(res.body.checks.database).toBe("healthy");
    expect(res.body.checks.openai).toBe("healthy");
    expect(res.body.errors).toBeUndefined();
  });

  it("GET /api/auth/me returns dev user when using Bearer dev-bypass", async () => {
    const app = await getApp();
    const res = await request(app as never).get("/api/auth/me").set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(DEV_USER.id);
    expect(res.body.data.email).toBe(DEV_USER.email);
  });

  it("POST /api/companies creates a company and GET reads it back", async () => {
    const app = await getApp();

    const createRes = await request(app as never)
      .post("/api/companies")
      .set(authHeader)
      .send({
        name: "SIA Test Latvia",
        registrationNumber: "40003000001",
        legalAddress: {
          street: "Brīvības iela 1",
          city: "Rīga",
          postalCode: "LV-1010",
          country: "LV",
        },
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.id).toBeDefined();
    expect(createRes.body.data.name).toBe("SIA Test Latvia");

    const companyId = createRes.body.data.id;
    const getRes = await request(app as never)
      .get(`/api/companies/${companyId}`)
      .set(authHeader);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(companyId);
    expect(getRes.body.data.registrationNumber).toBe("40003000001");
  });
});
