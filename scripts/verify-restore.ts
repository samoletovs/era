#!/usr/bin/env tsx
// Cosmos DB restore drill — trial-balance reconciliation CLI.
//
// Reads posted JournalEntry rows for a single company from the *primary*
// (production) and *restored* (point-in-time) Cosmos accounts, then proves
// the GL balances match. Companion to era/docs/dr-runbook.md.
//
// Usage:
//   COSMOS_ENDPOINT=https://era-prod-cosmos.documents.azure.com:443/ \
//   COSMOS_DATABASE=era-db \
//   COSMOS_RESTORE_ENDPOINT=https://era-restore-2026-05-10t12-00-cosmos.documents.azure.com:443/ \
//   COSMOS_RESTORE_DATABASE=era-db \
//   npx tsx scripts/verify-restore.ts --company-id <UUID>
//
// Auth: DefaultAzureCredential against both endpoints (or COSMOS_KEY /
// COSMOS_RESTORE_KEY for local fakes). The script never writes — it only
// reads, so it's safe to run against production at any time.
//
// Exit codes:
//   0 — balances reconcile, drill verified
//   1 — discrepancies found, see report
//   2 — argument or connectivity error

import "dotenv/config";

import { CosmosClient, type Database } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";

import { CONTAINERS } from "../src/shared/constants/index.js";
import type { JournalEntry } from "../src/shared/types/entities.js";
import {
  reconcile,
  toReconcilable,
} from "../src/backend/services/restore-reconciliation.js";

interface CliArgs {
  companyId: string;
}

function parseArgs(argv: string[]): CliArgs {
  const idx = argv.findIndex((a) => a === "--company-id" || a === "-c");
  if (idx === -1 || !argv[idx + 1]) {
    console.error(
      "[verify-restore] missing --company-id <uuid>\n" +
        "Run with --help for usage.",
    );
    process.exit(2);
  }
  return { companyId: argv[idx + 1] };
}

function buildClient(endpointEnv: string, keyEnv: string): CosmosClient {
  const endpoint = process.env[endpointEnv];
  if (!endpoint) {
    console.error(`[verify-restore] ${endpointEnv} not set`);
    process.exit(2);
  }
  const key = process.env[keyEnv];
  if (key) {
    return new CosmosClient({ endpoint, key });
  }
  return new CosmosClient({
    endpoint,
    aadCredentials: new DefaultAzureCredential(),
  });
}

async function fetchPostedEntries(
  database: Database,
  companyId: string,
): Promise<JournalEntry[]> {
  const { resources } = await database
    .container(CONTAINERS.LEDGER)
    .items.query<JournalEntry>({
      query:
        "SELECT * FROM c WHERE c.companyId = @cid AND (c.docType = 'journal-entry' OR IS_DEFINED(c.entryNumber)) AND c.status = 'posted'",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();
  return resources;
}

function formatMoney(n: number): string {
  return n.toFixed(2);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const primaryClient = buildClient("COSMOS_ENDPOINT", "COSMOS_KEY");
  const restoredClient = buildClient(
    "COSMOS_RESTORE_ENDPOINT",
    "COSMOS_RESTORE_KEY",
  );

  const primaryDb = primaryClient.database(
    process.env.COSMOS_DATABASE || "era-db",
  );
  const restoredDb = restoredClient.database(
    process.env.COSMOS_RESTORE_DATABASE ||
      process.env.COSMOS_DATABASE ||
      "era-db",
  );

  console.log(
    `[verify-restore] reconciling company=${args.companyId} ` +
      `primary=${primaryDb.id} restored=${restoredDb.id}`,
  );

  const [primaryRows, restoredRows] = await Promise.all([
    fetchPostedEntries(primaryDb, args.companyId),
    fetchPostedEntries(restoredDb, args.companyId),
  ]);

  const report = reconcile(
    args.companyId,
    primaryRows.map(toReconcilable),
    restoredRows.map(toReconcilable),
  );

  console.log("─".repeat(72));
  console.log(`primary  posted entries: ${report.primaryEntryCount}`);
  console.log(`restored posted entries: ${report.restoredEntryCount}`);
  console.log(
    `primary  totals: debit=${formatMoney(report.primaryTotalDebit)} credit=${formatMoney(report.primaryTotalCredit)}`,
  );
  console.log(
    `restored totals: debit=${formatMoney(report.restoredTotalDebit)} credit=${formatMoney(report.restoredTotalCredit)}`,
  );
  console.log("─".repeat(72));

  if (report.missingFromRestored.length > 0) {
    console.log(
      `MISSING from restored (${report.missingFromRestored.length}):`,
    );
    for (const id of report.missingFromRestored.slice(0, 20)) {
      console.log(`  - ${id}`);
    }
    if (report.missingFromRestored.length > 20) {
      console.log(
        `  ... ${report.missingFromRestored.length - 20} more (truncated)`,
      );
    }
  }

  if (report.extraInRestored.length > 0) {
    console.log(`EXTRA in restored (${report.extraInRestored.length}):`);
    for (const id of report.extraInRestored.slice(0, 20)) {
      console.log(`  + ${id}`);
    }
    if (report.extraInRestored.length > 20) {
      console.log(`  ... ${report.extraInRestored.length - 20} more`);
    }
  }

  if (report.diffs.length > 0) {
    console.log(`BALANCE DIFFS (${report.diffs.length}):`);
    console.log("  account | period   | side    | primary | restored | delta");
    for (const d of report.diffs.slice(0, 50)) {
      console.log(
        `  ${d.accountCode.padEnd(7)} | ${d.period.padEnd(7)} | ` +
          `debit   | ${formatMoney(d.primary.debit).padStart(9)} | ${formatMoney(d.restored.debit).padStart(9)} | ${formatMoney(d.delta.debit).padStart(9)}`,
      );
      console.log(
        `  ${"".padEnd(7)} | ${"".padEnd(7)} | ` +
          `credit  | ${formatMoney(d.primary.credit).padStart(9)} | ${formatMoney(d.restored.credit).padStart(9)} | ${formatMoney(d.delta.credit).padStart(9)}`,
      );
    }
    if (report.diffs.length > 50) {
      console.log(`  ... ${report.diffs.length - 50} more (truncated)`);
    }
  }

  console.log("─".repeat(72));

  if (report.isReconciled) {
    console.log("[verify-restore] ✓ reconciled — restore drill verified");
    process.exit(0);
  }

  console.log("[verify-restore] ✗ NOT reconciled — see diffs above");
  // Emit a JSON snapshot of the report so it can be archived alongside the
  // drill execution log.
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

void main().catch((err: unknown) => {
  console.error(
    "[verify-restore] fatal:",
    err instanceof Error ? err.message : err,
  );
  process.exit(2);
});
