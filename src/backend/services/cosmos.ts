import { CosmosClient, Database, Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { CONTAINERS } from "@shared/constants";

let client: CosmosClient;
let database: Database;

export function getCosmosClient(): CosmosClient {
  if (!client) {
    const endpoint = process.env.COSMOS_ENDPOINT;
    if (!endpoint) throw new Error("COSMOS_ENDPOINT not set");

    // Use managed identity in Azure, connection string locally
    if (process.env.COSMOS_KEY) {
      client = new CosmosClient({ endpoint, key: process.env.COSMOS_KEY });
    } else {
      const credential = new DefaultAzureCredential();
      client = new CosmosClient({ endpoint, aadCredentials: credential });
    }
  }
  return client;
}

export function getDatabase(): Database {
  if (!database) {
    const dbName = process.env.COSMOS_DATABASE || "era-db";
    database = getCosmosClient().database(dbName);
  }
  return database;
}

export function getContainer(name: string): Container {
  return getDatabase().container(name);
}

// Typed container accessors
export const containers = {
  companies: () => getContainer(CONTAINERS.COMPANIES),
  users: () => getContainer(CONTAINERS.USERS),
  ledger: () => getContainer(CONTAINERS.LEDGER),
  documents: () => getContainer(CONTAINERS.DOCUMENTS),
  contacts: () => getContainer(CONTAINERS.CONTACTS),
  inventory: () => getContainer(CONTAINERS.INVENTORY),
  agentState: () => getContainer(CONTAINERS.AGENT_STATE),
  chat: () => getContainer(CONTAINERS.CHAT),
  feedback: () => getContainer(CONTAINERS.FEEDBACK),
  events: () => getContainer(CONTAINERS.EVENTS),
  rules: () => getContainer(CONTAINERS.RULES),
};
