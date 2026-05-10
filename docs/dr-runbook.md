# Disaster Recovery — Cosmos DB restore runbook

The era ERP is the system of record for Latvian SIA financial data. A single
silently-bad write or a misclick in the portal can corrupt months of
ledger entries. This runbook is the battle plan for recovering from that.

It covers:

1. The supported recovery story (backup mode, retention, RTO/RPO targets).
2. How to flip on continuous backup (one-way migration — read carefully).
3. How to execute a point-in-time restore.
4. How to verify the restored data with the trial-balance reconciler shipped
   in this repo (`scripts/verify-restore.ts`).
5. Drill schedule, success criteria, and what to do when the drill fails.

> **Source of truth for backup primitives:** the [Cosmos DB continuous backup
> docs](https://learn.microsoft.com/azure/cosmos-db/continuous-backup-restore-introduction).
> When this runbook and the official docs disagree, the docs win — open a PR
> to fix the runbook.

---

## 1. Recovery objectives

| Metric | Target | Why |
|---|---|---|
| **RPO** (Recovery Point Objective) | ≤ 100 seconds | Continuous backup ships mutations to remote blob storage asynchronously within 100s. We accept losing up to ~2 minutes of writes. |
| **RTO** (Recovery Time Objective) | ≤ 4 hours | Includes account provisioning + data restore + reconciliation. Restoring is bounded by data size; ledger volume is well under 1 GB for the foreseeable future. |
| **Drill frequency** | Quarterly | One real restore per quarter, staged in `northeurope` against a non-production company. |
| **Reconciliation tolerance** | 0.00 EUR | Trial balance for the restored company must match the source to the cent for every (account, period) cell. |

These targets are calibrated for a Latvian SIA — the statutory bookkeeping
regime requires recoverable, complete records back to opening balances. We do
not get to "round" missing entries.

---

## 2. Backup configuration

### 2.1 Current state

The era Cosmos account (`Microsoft.DocumentDB/databaseAccounts`,
`infrastructure/main.bicep`) ships **without an explicit `backupPolicy`**,
which means it defaults to **Periodic mode**. Periodic mode requires a
support ticket to perform a restore. Self-service point-in-time restore
(PITR) requires **Continuous mode**.

### 2.2 Migration to Continuous mode (one-way!)

Per the Cosmos DB docs:

> *"If your account is configured in continuous mode, you can't switch it
> back to periodic mode."*

Continuous mode has two tiers:

| Tier | Retention | Storage cost | Notes |
|---|---|---|---|
| `Continuous7Days` | 7 days | none | Default for new accounts; sufficient for our restore-drill cadence. |
| `Continuous30Days` | 30 days | $0.20 / GB / region / month | Better for slow-burning corruption that takes weeks to surface. |

**Recommended for era**: `Continuous7Days`. Latvian financial-data corruption
is virtually always caught within hours (auto-balancing trial balance,
daily P&L review). The 7-day window covers the realistic detection horizon
at zero ongoing cost. We can upgrade to 30-day if a real incident shows
otherwise.

To migrate, edit the `cosmosAccount` resource in `infrastructure/main.bicep`:

```bicep
resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: '${prefix}-cosmos'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    locations: [
      { locationName: location, failoverPriority: 0 }
    ]
    capabilities: [
      { name: 'EnableServerless' }
    ]
    // ▲ NEW — opt in to point-in-time restore. ONE-WAY change.
    backupPolicy: {
      type: 'Continuous'
      continuousModeProperties: {
        tier: 'Continuous7Days'
      }
    }
  }
}
```

Deploy with the existing pipeline:

```powershell
npm run infra:deploy
```

Validate:

```powershell
az cosmosdb show --resource-group era-rg --name era-cosmos `
  --query 'properties.backupPolicy' --output table
```

Expected output:

```
ContinuousModeProperties.Tier   Type
------------------------------- ----------
Continuous7Days                 Continuous
```

A migration in progress will show `migrationState.status = InProgress` for a
few minutes — wait until that field disappears before declaring the change
done.

### 2.3 Operational guard-rails

- The Cosmos account is RBAC-secured (Cosmos Data Contributor role assigned
  to the Container App's managed identity). Restore operations need the
  *control-plane* permissions `Microsoft.DocumentDB/locations/restorableDatabaseAccounts/read`
  and `Microsoft.DocumentDB/databaseAccounts/restore/action` — those live on
  the subscription owner / Cosmos DB Operator role. Sam currently holds
  these. Document any RBAC changes here.
- Continuous backups are taken in the account's primary region only
  (`northeurope`). If that region is itself unavailable, restoring is
  deferred until Azure recovers it.

---

## 3. Restore procedure

There are two restore flavours. Pick the one that matches the incident:

### 3.1 Restore one company to a side database (drill / partial recovery)

Use this when production is healthy overall but one company's data was
corrupted. The output is a new Cosmos *account* (Continuous mode does not
support restoring into an existing account). Switch the affected company to
the side account by changing `COSMOS_ENDPOINT` for a debug Container App
revision, or copy the company's entries back via a one-shot Node script.

```powershell
# 1. Identify the source account ID and the latest restorable timestamp.
$source = az cosmosdb restorable-database-account list `
  --location northeurope `
  --query "[?accountName=='era-cosmos'].id" -o tsv

$timestamp = az cosmosdb restorable-database-account show `
  --location northeurope --instance-id <instanceId> `
  --query 'creationTime' -o tsv
# Or pick a precise UTC timestamp inside the last 7 days.

# 2. Provision the restore target. Note: must be a new account name.
$restoreName = "era-restore-$(Get-Date -Format 'yyyyMMdd-HHmm')"
az cosmosdb restore `
  --resource-group era-rg `
  --target-database-account-name $restoreName `
  --account-name era-cosmos `
  --restore-timestamp $timestamp `
  --location northeurope `
  --databases-to-restore "name=era-db,collections=ledger,companies,users,documents,contacts,inventory,agentState,chat,feedback,events,rules,idempotency"
```

Restore can take 10–60 minutes depending on data size. Watch the operation:

```powershell
az cosmosdb show --resource-group era-rg --name $restoreName `
  --query 'provisioningState' -o tsv
```

When `Succeeded`, run the verifier in §4.

### 3.2 Restore the entire account (full DR)

Same `az cosmosdb restore` invocation, but omit `--databases-to-restore` so
*all* databases are recovered. Then update `COSMOS_ENDPOINT` (and Container
App env) to point at the new account, fail traffic over, and decommission
the corrupted source.

> The Container App's managed identity has a Cosmos role assignment scoped
> to the original account. After failover, re-run the role-assignment
> branch of `infrastructure/main.bicep` against the restored account, or
> create a fresh assignment with `az cosmosdb sql role assignment create`.
> This is the most-likely-forgotten step in a real DR — call it out
> explicitly in the post-incident review.

---

## 4. Verifying the restore — trial-balance reconciliation

The roadmap states: *"point-in-time-restore one company to a side database;
verify GL balances reconcile."* We verify by comparing the trial balance —
debit/credit/net per (account, period) — between the primary and restored
ledgers for one chosen company.

### 4.1 Run the verifier

```powershell
# Primary (production) account.
$env:COSMOS_ENDPOINT = "https://era-cosmos.documents.azure.com:443/"
$env:COSMOS_DATABASE = "era-db"

# Restored side account (the one we just created in §3).
$env:COSMOS_RESTORE_ENDPOINT = "https://$restoreName.documents.azure.com:443/"
$env:COSMOS_RESTORE_DATABASE = "era-db"

# DefaultAzureCredential will be used for both unless COSMOS_KEY /
# COSMOS_RESTORE_KEY are also set.

npx tsx scripts/verify-restore.ts --company-id <company-uuid>
```

Exit codes:

| Code | Meaning | Action |
|---|---|---|
| 0 | Reconciled | Drill passes. Archive the console output. |
| 1 | Discrepancies | Drill fails. See §4.3. |
| 2 | Misconfiguration | Fix the env vars / RBAC / network and retry. |

### 4.2 What the verifier checks

For every posted `JournalEntry` row in the chosen company, the verifier:

1. Confirms total debit = total credit on each side (each ledger is
   self-consistent).
2. Confirms total debit and total credit match between primary and restored.
3. Confirms every entry ID present in primary is also in restored, and
   vice-versa.
4. Aggregates lines into a `(accountCode, period) → {debit, credit, net}`
   grid for both sides and reports every cell that differs by more than
   €0.005.

The pure logic lives in
[`src/backend/services/restore-reconciliation.ts`](../src/backend/services/restore-reconciliation.ts)
and is unit-tested in
[`tests/unit/restore-reconciliation.test.ts`](../tests/unit/restore-reconciliation.test.ts) —
those tests guard the reconciliation contract independently of any live
restore drill.

### 4.3 If the drill fails

A failed reconciliation is **not** automatically a Cosmos backup bug — it is
much more likely one of:

1. **Mid-flight writes during the chosen restore timestamp.** The restore is
   consistent up to the chosen point, but writes that landed *after* that
   point will appear missing from restored. Mitigation: pick a timestamp at
   least 2 minutes in the past, then re-run the verifier.
2. **TTL'd documents.** The `idempotency` container has a 7-day TTL. If a
   restore replays a row whose TTL elapsed in the source account between the
   restore timestamp and now, the source loses it; the restored copy keeps
   it. The verifier focuses on `ledger` only, so this should not surface as
   a reconciliation failure — but record it here if it ever does.
3. **Container drift.** If `infrastructure/main.bicep` added a new container
   between the restore timestamp and now, the restored account won't have
   it. Re-deploy the schema (the Bicep is idempotent) before re-running.

If none of those explain the failure, file a Sev-2 ticket against the Cosmos
DB resource provider and freeze further restore attempts until support
responds. Save the JSON report emitted by `verify-restore.ts` — it contains
the exact diff and is the artefact Microsoft support will ask for.

---

## 5. Drill cadence and ownership

| Cadence | Owner | Output |
|---|---|---|
| First drill | Sam | Confirms the runbook end-to-end after the Continuous-mode migration. |
| Quarterly drills | Sam | Console log + verifier exit code 0; archived alongside `nauro-ops` reports for the quarter. |
| After any backup-config change | Whoever made the change | Same as quarterly — re-prove the path. |

Drills run against a **non-production company** (one created specifically for
DR testing) so we can pick aggressive timestamps without affecting real
workflow. Tear the side account down after the drill:

```powershell
az cosmosdb delete --resource-group era-rg --name $restoreName --yes
```

---

## 6. What is *not* covered

- **Application Insights data.** App Insights has its own retention policy
  (90 days default, configurable). Restoring Cosmos does not restore
  telemetry. Trace IDs on `JournalEntry` rows will still resolve as long as
  the original telemetry is in the retention window.
- **Storage account contents.** Invoice PDFs and uploaded documents live in
  the era Storage account. Storage soft-delete + versioning is the
  recovery story there; a separate runbook will follow if and when we
  start running drills against Storage.
- **Latvian statutory archive (`Gada pārskats` annual report).** Once
  filed, the annual report lives at VID, not in Cosmos. Restoration of in-
  flight working data does not affect already-filed reports.

---

## 7. References

- [Continuous backup with point-in-time restore in Azure Cosmos DB](https://learn.microsoft.com/azure/cosmos-db/continuous-backup-restore-introduction)
- [Provision an Azure Cosmos DB account with continuous backup](https://learn.microsoft.com/azure/cosmos-db/provision-account-continuous-backup)
- [Restore an Azure Cosmos DB account that uses continuous backup mode](https://learn.microsoft.com/azure/cosmos-db/restore-account-continuous-backup)
- [Migrate from periodic to continuous backup](https://learn.microsoft.com/azure/cosmos-db/migrate-continuous-backup)
- era production roadmap: [`era-production-roadmap-2026.md`](era-production-roadmap-2026.md)
