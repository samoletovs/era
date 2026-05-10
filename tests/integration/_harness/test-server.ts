/**
 * Test server harness — provides a supertest agent over the Express app
 * with the in-memory Cosmos fake already wired up.
 *
 * Usage in a test:
 *   import { getApp, authHeader } from "./_harness/test-server.js";
 *   const app = await getApp();
 *   const res = await request(app).get("/api/companies").set(authHeader);
 */

let cachedApp: unknown | null = null;

export async function getApp(): Promise<unknown> {
  if (cachedApp) return cachedApp;
  // Import the backend AFTER setup.ts has installed env vars + cosmos mock.
  const mod = await import("../../../src/backend/index.js");
  cachedApp = mod.default;
  return cachedApp;
}

/** Standard auth header — uses the dev-bypass token shipped in the auth middleware. */
export const authHeader = { Authorization: "Bearer dev-bypass" };

/** Dev user identity that auth middleware injects when dev-bypass token is used. */
export const DEV_USER = {
  id: "dev-user",
  email: "dev@era.local",
  name: "Developer",
  provider: "google" as const,
};
