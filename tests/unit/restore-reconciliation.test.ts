// Unit tests for services/restore-reconciliation.ts — pure logic, no
// Cosmos involvement. Verifies the trial-balance verifier catches every
// failure mode that a botched point-in-time restore would produce:
// missing/extra rows, per-account drift, status filtering, and float-noise
// tolerance.
import { describe, expect, it } from "vitest";
import {
  buildBalanceGrid,
  diffBalanceGrids,
  reconcile,
  summarizeEntries,
  toReconcilable,
  type ReconcilableEntry,
} from "../../src/backend/services/restore-reconciliation";
import type { JournalEntry } from "../../src/shared/types/entities";

function postedEntry(
  id: string,
  period: string,
  lines: { accountCode: string; debit: number; credit: number }[],
): ReconcilableEntry {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return {
    id,
    companyId: "co-1",
    status: "posted",
    period,
    date: `${period}-15`,
    totalDebit,
    totalCredit,
    lines,
  };
}

describe("summarizeEntries", () => {
  it("sums posted entries and ignores draft / reversed", () => {
    const entries: ReconcilableEntry[] = [
      postedEntry("p1", "2026-03", [
        { accountCode: "2210", debit: 121, credit: 0 },
        { accountCode: "5120", debit: 0, credit: 100 },
        { accountCode: "4230", debit: 0, credit: 21 },
      ]),
      { ...postedEntry("d1", "2026-03", []), status: "draft" },
      { ...postedEntry("r1", "2026-03", []), status: "reversed" },
    ];
    const summary = summarizeEntries(entries);
    expect(summary.count).toBe(1);
    expect(summary.totalDebit).toBeCloseTo(121, 2);
    expect(summary.totalCredit).toBeCloseTo(121, 2);
  });

  it("rounds float drift to cents", () => {
    const entries: ReconcilableEntry[] = [
      postedEntry("p1", "2026-03", [
        { accountCode: "5120", debit: 0.1 + 0.2, credit: 0 },
        { accountCode: "2210", debit: 0, credit: 0.3 },
      ]),
    ];
    const summary = summarizeEntries(entries);
    expect(summary.totalDebit).toBe(0.3);
    expect(summary.totalCredit).toBe(0.3);
  });
});

describe("buildBalanceGrid", () => {
  it("groups by (accountCode, period) and computes net", () => {
    const grid = buildBalanceGrid([
      postedEntry("p1", "2026-03", [
        { accountCode: "2210", debit: 121, credit: 0 },
        { accountCode: "5120", debit: 0, credit: 100 },
        { accountCode: "4230", debit: 0, credit: 21 },
      ]),
      postedEntry("p2", "2026-03", [
        { accountCode: "2210", debit: 50, credit: 0 },
        { accountCode: "5120", debit: 0, credit: 50 },
      ]),
      postedEntry("p3", "2026-04", [
        { accountCode: "2210", debit: 200, credit: 0 },
        { accountCode: "5120", debit: 0, credit: 200 },
      ]),
    ]);

    expect(grid.get("2210::2026-03")).toEqual({
      accountCode: "2210",
      period: "2026-03",
      debit: 171,
      credit: 0,
      net: 171,
    });
    expect(grid.get("5120::2026-03")?.credit).toBe(150);
    expect(grid.get("2210::2026-04")?.debit).toBe(200);
  });

  it("excludes draft entries from the grid", () => {
    const grid = buildBalanceGrid([
      {
        ...postedEntry("d1", "2026-03", [
          { accountCode: "2210", debit: 999, credit: 0 },
        ]),
        status: "draft",
      },
    ]);
    expect(grid.size).toBe(0);
  });
});

describe("diffBalanceGrids", () => {
  it("returns no diffs for identical grids", () => {
    const entries = [
      postedEntry("p1", "2026-03", [
        { accountCode: "2210", debit: 121, credit: 0 },
        { accountCode: "5120", debit: 0, credit: 100 },
        { accountCode: "4230", debit: 0, credit: 21 },
      ]),
    ];
    const a = buildBalanceGrid(entries);
    const b = buildBalanceGrid(entries);
    expect(diffBalanceGrids(a, b)).toEqual([]);
  });

  it("flags missing cells in restored grid", () => {
    const primary = buildBalanceGrid([
      postedEntry("p1", "2026-03", [
        { accountCode: "2210", debit: 100, credit: 0 },
        { accountCode: "5120", debit: 0, credit: 100 },
      ]),
    ]);
    const restored = buildBalanceGrid([]);
    const diffs = diffBalanceGrids(primary, restored);
    expect(diffs).toHaveLength(2);
    const arDiff = diffs.find((d) => d.accountCode === "2210");
    expect(arDiff?.delta.net).toBe(100);
    expect(arDiff?.restored.debit).toBe(0);
  });

  it("ignores sub-cent float noise", () => {
    const primary = new Map([
      [
        "2210::2026-03",
        {
          accountCode: "2210",
          period: "2026-03",
          debit: 100.0,
          credit: 0,
          net: 100.0,
        },
      ],
    ]);
    const restored = new Map([
      [
        "2210::2026-03",
        {
          accountCode: "2210",
          period: "2026-03",
          debit: 100.001,
          credit: 0,
          net: 100.001,
        },
      ],
    ]);
    expect(diffBalanceGrids(primary, restored)).toEqual([]);
  });
});

describe("reconcile (top-level)", () => {
  const happyPath: ReconcilableEntry[] = [
    postedEntry("p1", "2026-03", [
      { accountCode: "2210", debit: 121, credit: 0 },
      { accountCode: "5120", debit: 0, credit: 100 },
      { accountCode: "4230", debit: 0, credit: 21 },
    ]),
    postedEntry("p2", "2026-03", [
      { accountCode: "2420", debit: 121, credit: 0 },
      { accountCode: "2210", debit: 0, credit: 121 },
    ]),
  ];

  it("reconciles when primary and restored match", () => {
    const r = reconcile("co-1", happyPath, happyPath);
    expect(r.isReconciled).toBe(true);
    expect(r.missingFromRestored).toEqual([]);
    expect(r.extraInRestored).toEqual([]);
    expect(r.diffs).toEqual([]);
    expect(r.primaryEntryCount).toBe(2);
    expect(r.restoredEntryCount).toBe(2);
    expect(r.primaryTotalDebit).toBe(242);
    expect(r.primaryTotalCredit).toBe(242);
  });

  it("flags an entry missing from the restored set", () => {
    const restored = [happyPath[0]]; // dropped p2
    const r = reconcile("co-1", happyPath, restored);
    expect(r.isReconciled).toBe(false);
    expect(r.missingFromRestored).toEqual(["p2"]);
    expect(r.extraInRestored).toEqual([]);
    // Two cells differ: 2420 debit (121 → 0) and 2210 credit (121 → 0)
    expect(r.diffs.map((d) => d.accountCode).sort()).toEqual(["2210", "2420"]);
  });

  it("flags an extra entry in the restored set", () => {
    const restored: ReconcilableEntry[] = [
      ...happyPath,
      postedEntry("p3", "2026-04", [
        { accountCode: "2210", debit: 50, credit: 0 },
        { accountCode: "5120", debit: 0, credit: 50 },
      ]),
    ];
    const r = reconcile("co-1", happyPath, restored);
    expect(r.isReconciled).toBe(false);
    expect(r.extraInRestored).toEqual(["p3"]);
    expect(r.missingFromRestored).toEqual([]);
  });

  it("flags per-account drift (same entry IDs, different amounts)", () => {
    // Same ID set but amounts on p2 mutated — simulates a partial-write
    // recovery hazard.
    const restored: ReconcilableEntry[] = [
      happyPath[0],
      postedEntry("p2", "2026-03", [
        { accountCode: "2420", debit: 121, credit: 0 },
        { accountCode: "2210", debit: 0, credit: 120 }, // 1 EUR short
      ]),
    ];
    const r = reconcile("co-1", happyPath, restored);
    expect(r.isReconciled).toBe(false);
    expect(r.missingFromRestored).toEqual([]);
    expect(r.extraInRestored).toEqual([]);
    const arDiff = r.diffs.find((d) => d.accountCode === "2210");
    expect(arDiff).toBeDefined();
    expect(arDiff?.delta.credit).toBeCloseTo(1, 2);
    // Restored side is also internally unbalanced — surfaces in totals.
    expect(r.restoredTotalDebit).not.toBe(r.restoredTotalCredit);
  });
});

describe("toReconcilable", () => {
  it("strips the JournalEntry down to reconciliation columns", () => {
    const entry: JournalEntry = {
      id: "je-1",
      companyId: "co-1",
      createdAt: "2026-03-15T00:00:00Z",
      updatedAt: "2026-03-15T00:00:00Z",
      createdBy: "user-1",
      isActive: true,
      docType: "journal-entry",
      entryNumber: "JE-001",
      date: "2026-03-15",
      description: "test",
      lines: [
        {
          accountCode: "2210",
          accountName: "Trade receivables",
          debit: 121,
          credit: 0,
          taxCode: "LV-21",
        },
        {
          accountCode: "5120",
          accountName: "Service revenue",
          debit: 0,
          credit: 100,
        },
        {
          accountCode: "4230",
          accountName: "VAT output",
          debit: 0,
          credit: 21,
        },
      ],
      status: "posted",
      period: "2026-03",
      sourceType: "invoice",
      sourceId: "inv-1",
      totalDebit: 121,
      totalCredit: 121,
      traceId: "abc123",
    };

    const r = toReconcilable(entry);
    expect(r.id).toBe("je-1");
    expect(r.status).toBe("posted");
    expect(r.lines).toHaveLength(3);
    // Only the reconciliation fields survive.
    expect(r.lines[0]).toEqual({
      accountCode: "2210",
      debit: 121,
      credit: 0,
    });
  });
});
