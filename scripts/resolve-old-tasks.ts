// Mark all open feedback items as "done" in Cosmos DB
// Usage: npx tsx scripts/resolve-old-tasks.ts

import { config } from "dotenv";
config();

import { CosmosClient } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";

const endpoint = process.env.COSMOS_ENDPOINT;
if (!endpoint) throw new Error("COSMOS_ENDPOINT not set");

const client = process.env.COSMOS_KEY
  ? new CosmosClient({ endpoint, key: process.env.COSMOS_KEY })
  : new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });

const db = client.database(process.env.COSMOS_DATABASE || "era-db");
const container = db.container("feedback");

async function main() {
  const { resources } = await container.items
    .query({ query: "SELECT c.id, c._partitionKey, c.status, c.message FROM c WHERE c.status = 'open'" })
    .fetchAll();

  console.log(`Found ${resources.length} open feedback items`);
  if (resources.length > 0) {
    console.log("Sample item:", JSON.stringify(resources[0], null, 2));
  }

  // Try using upsert instead of replace
  let resolved = 0;
  for (const item of resources) {
    try {
      // Read with cross-partition to get the full item
      const fullQuery = await container.items.query({
        query: "SELECT * FROM c WHERE c.id = @id",
        parameters: [{ name: "@id", value: item.id }]
      }).fetchAll();
      
      if (fullQuery.resources.length > 0) {
        const fullItem = fullQuery.resources[0];
        fullItem.status = "done";
        await container.items.upsert(fullItem);
        resolved++;
        console.log(`  ✓ Resolved: ${(fullItem.message || "").substring(0, 60)}...`);
      }
    } catch (err: any) {
      console.log(`  ✗ Skipped (${err.code || err.message}): ${item.id}`);
    }
  }

  console.log(`\n✓ Marked ${resolved} items as done`);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
