/**
 * Vitest mock for `services/cosmos.ts` that swaps the real CosmosClient for the
 * in-memory fake. Used by integration tests via `vi.mock(...)` in setup.ts.
 *
 * The shape of `containers` here matches the real export: each property is a
 * zero-arg function returning a Container-like object.
 */
import { CONTAINERS } from "@shared/constants";
import { getFakeContainer } from "./cosmos-fake.js";

export function getCosmosClient() {
  return {
    getDatabaseAccount: async () => ({ resource: { id: "fake-cosmos" } }),
  } as unknown as { getDatabaseAccount: () => Promise<unknown> };
}
export function getDatabase(): never {
  throw new Error("getDatabase() must not be called in integration tests");
}
export function getContainer(name: string) {
  return getFakeContainer(name);
}

export const containers = {
  companies: () => getFakeContainer(CONTAINERS.COMPANIES),
  users: () => getFakeContainer(CONTAINERS.USERS),
  ledger: () => getFakeContainer(CONTAINERS.LEDGER),
  documents: () => getFakeContainer(CONTAINERS.DOCUMENTS),
  contacts: () => getFakeContainer(CONTAINERS.CONTACTS),
  inventory: () => getFakeContainer(CONTAINERS.INVENTORY),
  agentState: () => getFakeContainer(CONTAINERS.AGENT_STATE),
  chat: () => getFakeContainer(CONTAINERS.CHAT),
  feedback: () => getFakeContainer(CONTAINERS.FEEDBACK),
  events: () => getFakeContainer(CONTAINERS.EVENTS),
  rules: () => getFakeContainer(CONTAINERS.RULES),
  idempotency: () => getFakeContainer(CONTAINERS.IDEMPOTENCY),
};
