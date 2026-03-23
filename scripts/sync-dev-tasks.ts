// Sync user feedback from Cosmos DB → dev-tasks.md
// Usage: npx tsx scripts/sync-dev-tasks.ts
// Falls back to direct Cosmos DB access when API is unavailable

import { config } from "dotenv";
config();

interface FeedbackItem {
  id: string;
  page: string;
  message: string;
  status: string;
  submittedBy: string;
  submittedAt: string;
}

const API = process.env.ERA_API || "http://localhost:3000/api";
const TOKEN = process.env.ERA_TOKEN || "dev-bypass";

async function fetchFromApi(): Promise<FeedbackItem[]> {
  const res = await fetch(`${API}/feedback`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const json = await res.json();
  return json.data || [];
}

async function fetchFromCosmos(): Promise<FeedbackItem[]> {
  const { CosmosClient } = await import("@azure/cosmos");
  const { DefaultAzureCredential } = await import("@azure/identity");
  const endpoint = process.env.COSMOS_ENDPOINT;
  if (!endpoint) throw new Error("COSMOS_ENDPOINT not set");
  const client = process.env.COSMOS_KEY
    ? new CosmosClient({ endpoint, key: process.env.COSMOS_KEY })
    : new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
  const container = client.database(process.env.COSMOS_DATABASE || "era-db").container("feedback");
  const { resources } = await container.items
    .query<FeedbackItem>({ query: "SELECT * FROM c ORDER BY c.submittedAt DESC" })
    .fetchAll();
  return resources;
}

async function main() {
  let items: FeedbackItem[];
  try {
    items = await fetchFromApi();
    console.log("(fetched from API)");
  } catch {
    console.log("(API unavailable — fetching directly from Cosmos DB)");
    items = await fetchFromCosmos();
  }

  const open = items.filter((i) => i.status === "open");
  const inProgress = items.filter((i) => i.status === "in-progress");
  const done = items.filter((i) => i.status === "done" || i.status === "dismissed");

  function formatItem(item: FeedbackItem): string {
    const date = new Date(item.submittedAt).toLocaleDateString("en-GB");
    return `- [ ] **${item.message}**  \n  _Page: ${item.page} · ${date} · ID: ${item.id}_`;
  }

  function formatDoneItem(item: FeedbackItem): string {
    const date = new Date(item.submittedAt).toLocaleDateString("en-GB");
    return `- [x] ~~${item.message}~~  \n  _Page: ${item.page} · ${date} · ${item.status}_`;
  }

  const lines = [
    "# Dev tasks",
    "",
    `User feedback from the ERA app. Last synced: ${new Date().toISOString()}.`,
    "",
    `Run \`npm run dev-tasks\` to refresh. Total: ${items.length} (${open.length} open, ${inProgress.length} in-progress, ${done.length} resolved).`,
    "",
    "<!-- TASKS_START -->",
    "",
  ];

  if (open.length > 0) {
    lines.push("## Open", "");
    open.forEach((i) => lines.push(formatItem(i)));
    lines.push("");
  }

  if (inProgress.length > 0) {
    lines.push("## In progress", "");
    inProgress.forEach((i) => lines.push(formatItem(i)));
    lines.push("");
  }

  if (done.length > 0) {
    lines.push("## Resolved", "");
    done.forEach((i) => lines.push(formatDoneItem(i)));
    lines.push("");
  }

  if (items.length === 0) {
    lines.push("_No feedback submitted yet._", "");
  }

  lines.push("<!-- TASKS_END -->");

  const fs = await import("fs");
  const path = await import("path");
  const outPath = path.join(process.cwd(), "dev-tasks.md");
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf-8");

  console.log(`✓ Synced ${items.length} feedback items → dev-tasks.md`);
  if (open.length > 0) {
    console.log(`  ${open.length} open tasks:`);
    open.forEach((i) => console.log(`    • ${i.message} (${i.page})`));
  }
}

main().catch((err) => {
  console.error("Failed to sync dev tasks:", err.message);
  process.exit(1);
});
