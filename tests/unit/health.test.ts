// Unit tests for services/health.ts — verifies the dependency-probe report
// renders correctly across healthy / degraded / mixed scenarios. The Cosmos
// client is mocked at the module level; OpenAI is checked via env vars only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cosmosState = { shouldFail: false, hangMs: 0 };

vi.mock("../../src/backend/services/cosmos.js", () => {
  return {
    getCosmosClient: () => ({
      getDatabaseAccount: async () => {
        if (cosmosState.hangMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, cosmosState.hangMs));
        }
        if (cosmosState.shouldFail) {
          throw new Error("simulated cosmos outage");
        }
        return { resource: { id: "fake-cosmos" } };
      },
    }),
  };
});

import { getHealthReport } from "../../src/backend/services/health";

describe("health service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    cosmosState.shouldFail = false;
    cosmosState.hangMs = 0;
    process.env.AZURE_OPENAI_ENDPOINT = "https://fake.openai.azure.com";
    process.env.AZURE_OPENAI_API_KEY = "fake-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns healthy when all checks pass", async () => {
    const report = await getHealthReport();
    expect(report.status).toBe("healthy");
    expect(report.checks.api).toBe("healthy");
    expect(report.checks.database).toBe("healthy");
    expect(report.checks.openai).toBe("healthy");
    expect(report.errors).toBeUndefined();
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("marks database unhealthy when Cosmos throws", async () => {
    cosmosState.shouldFail = true;
    const report = await getHealthReport();
    expect(report.status).toBe("degraded");
    expect(report.checks.api).toBe("healthy");
    expect(report.checks.database).toBe("unhealthy");
    expect(report.checks.openai).toBe("healthy");
    expect(report.errors?.database).toContain("simulated cosmos outage");
  });

  it("marks openai unhealthy when AZURE_OPENAI_ENDPOINT is missing", async () => {
    delete process.env.AZURE_OPENAI_ENDPOINT;
    const report = await getHealthReport();
    expect(report.status).toBe("degraded");
    expect(report.checks.openai).toBe("unhealthy");
    expect(report.errors?.openai).toContain("AZURE_OPENAI_ENDPOINT");
  });

  it("marks openai unhealthy when AZURE_OPENAI_API_KEY is missing", async () => {
    delete process.env.AZURE_OPENAI_API_KEY;
    const report = await getHealthReport();
    expect(report.checks.openai).toBe("unhealthy");
    expect(report.errors?.openai).toContain("AZURE_OPENAI_API_KEY");
  });

  it("marks openai unhealthy when endpoint is malformed", async () => {
    process.env.AZURE_OPENAI_ENDPOINT = "not-a-url";
    const report = await getHealthReport();
    expect(report.checks.openai).toBe("unhealthy");
    expect(report.errors?.openai).toContain("not a valid URL");
  });

  it("aggregates multiple failures into a single degraded report", async () => {
    cosmosState.shouldFail = true;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    const report = await getHealthReport();
    expect(report.status).toBe("degraded");
    expect(report.checks.database).toBe("unhealthy");
    expect(report.checks.openai).toBe("unhealthy");
    expect(Object.keys(report.errors ?? {})).toEqual(
      expect.arrayContaining(["database", "openai"]),
    );
  });

  it("does not throw when a check hangs (timeout returns unhealthy)", async () => {
    cosmosState.hangMs = 5000; // longer than the 3s timeout
    const start = Date.now();
    const report = await getHealthReport();
    const elapsed = Date.now() - start;
    expect(report.checks.database).toBe("unhealthy");
    expect(report.errors?.database).toContain("timed out");
    // Timeout should fire well under 5s — proves the timeout fired, not the hang completed
    expect(elapsed).toBeLessThan(4500);
  }, 10000);
});
