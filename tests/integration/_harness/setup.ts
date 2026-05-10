/**
 * Integration test setup — runs before each test file.
 *
 * Order of operations is critical:
 *   1. Set required env vars BEFORE importing anything that reads them
 *   2. Hoisted `vi.mock(...)` of services/cosmos.js so all backend imports
 *      get the in-memory fake instead of the real CosmosClient.
 *   3. Reset the in-memory state between tests.
 */
import { afterEach, beforeAll, vi } from "vitest";

// 1. Env vars — must be set before any backend module is imported anywhere.
process.env.NODE_ENV = "test";
process.env.COSMOS_ENDPOINT = "https://fake.documents.azure.com:443/";
process.env.COSMOS_KEY = "fake-key-for-tests";
process.env.COSMOS_DATABASE = "era-test";
process.env.GOOGLE_CLIENT_ID = "fake-google-client-id";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "fake-openai-key";
// Azure OpenAI vars are validated (URL + key presence) by the /health probe.
// Provide fakes so the health check reports "healthy" in tests; no real API
// call is made.
process.env.AZURE_OPENAI_ENDPOINT =
  process.env.AZURE_OPENAI_ENDPOINT ?? "https://fake.openai.azure.com";
process.env.AZURE_OPENAI_API_KEY =
  process.env.AZURE_OPENAI_API_KEY ?? "fake-azure-openai-key";

// 2. Mock services/cosmos.js — `vi.mock` is hoisted to the top automatically.
vi.mock("../../../src/backend/services/cosmos.js", async () => {
  const mod = await import("./cosmos-mock.js");
  return mod;
});

// Some files import without the .js extension via tsconfig path remapping.
// Vitest matches by resolved module specifier, so we cover the @backend alias too.
vi.mock("@backend/services/cosmos", async () => {
  const mod = await import("./cosmos-mock.js");
  return mod;
});

// 3. Reset state between tests so each test gets a clean slate.
afterEach(async () => {
  const { resetAllFakeContainers } = await import("./cosmos-fake.js");
  resetAllFakeContainers();
});

beforeAll(() => {
  // Sanity check — sets up shared seed if needed in future.
});
