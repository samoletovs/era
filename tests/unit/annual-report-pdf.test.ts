// Unit tests for annual-report formatter, snapshot hash, and sign-off
// state machine. PDF byte-rendering is intentionally NOT covered —
// PDFKit byte output is non-deterministic across versions; the
// formatted-section structure is what carries the contract.

import { describe, expect, it } from "vitest";

import type { AnnualReportApproval } from "../../src/shared/types/entities";
import type { AnnualReport } from "../../src/backend/services/reporting";
import {
  computeSnapshotHash,
  formatAnnualReport,
  lockAnnualReport,
  LockError,
  markSubmittedToVid,
  statusTransitions,
  unlockAnnualReport,
} from "../../src/backend/services/annual-report-pdf";

const sampleReport: AnnualReport = {
  companyName: "Acme SIA",
  registrationNumber: "40003123456",
  fiscalYear: 2025,
  periodStart: "2025-01-01",
  periodEnd: "2025-12-31",
  balanceSheet: { date: "2025-12-31", assets: [], liabilities: [], equity: [], totalAssets: 50000, totalLiabilities: 20000, totalEquity: 30000 },
  profitAndLoss: { periodStart: "2025-01-01", periodEnd: "2025-12-31", revenue: [], expenses: [], totalRevenue: 100000, totalExpenses: 80000, netProfit: 20000 },
  balanceSheetLv: {
    longTermAssets: 20000,
    currentAssets: 30000,
    totalAssets: 50000,
    equity: 30000,
    longTermLiabilities: 5000,
    currentLiabilities: 15000,
    totalEquityAndLiabilities: 50000,
  },
  profitAndLossLv: {
    netTurnover: 100000,
    costOfGoodsSold: 50000,
    grossProfit: 50000,
    sellingExpenses: 10000,
    administrativeExpenses: 15000,
    otherIncome: 0,
    financialExpenses: 1000,
    profitBeforeTax: 24000,
    corporateIncomeTax: 4000,
    netProfit: 20000,
  },
};

const sampleApproval: AnnualReportApproval = {
  id: "ar-2025",
  companyId: "co-1",
  docType: "annual-report-approval",
  fiscalYear: 2025,
  status: "unlocked",
  isActive: true,
  createdAt: "2026-01-15T08:00:00Z",
  updatedAt: "2026-01-15T08:00:00Z",
  createdBy: "user-1",
};

// ─── Formatter ──────────────────────────────────────────────

describe("formatAnnualReport — Latvian", () => {
  it("uses Latvian labels by default", () => {
    const f = formatAnnualReport(sampleReport);
    expect(f.title).toBe("Gada pārskats");
    expect(f.balanceSheet.title).toBe("Bilance");
    expect(f.profitAndLoss.title).toBe("Peļņas vai zaudējumu aprēķins");
    expect(f.signaturePage.statutoryLine).toContain("Ministru kabineta noteikumiem Nr. 775");
  });

  it("preserves balance-sheet equation", () => {
    const f = formatAnnualReport(sampleReport);
    const totalAssets = f.balanceSheet.rows.find((r) => r.label === "Aktīvu kopsumma")?.amount;
    const totalEqLiab = f.balanceSheet.rows.find((r) => r.label === "Pašu kapitāla un saistību kopsumma")?.amount;
    expect(totalAssets).toBe(50000);
    expect(totalEqLiab).toBe(50000);
  });

  it("renders cost lines with negative sign for the P&L stack-up", () => {
    const f = formatAnnualReport(sampleReport);
    const cogs = f.profitAndLoss.rows.find((r) => r.label.startsWith("Pārdotās"));
    expect(cogs?.amount).toBeLessThan(0);
  });

  it("marks subtotal rows with isTotal: true", () => {
    const f = formatAnnualReport(sampleReport);
    const totals = f.profitAndLoss.rows.filter((r) => r.isTotal);
    // Gross profit, profit before tax, net profit are totals.
    expect(totals.length).toBe(3);
  });
});

describe("formatAnnualReport — English", () => {
  it("uses English labels when requested", () => {
    const f = formatAnnualReport(sampleReport, { locale: "en" });
    expect(f.title).toBe("Annual report");
    expect(f.balanceSheet.title).toBe("Balance sheet");
    expect(f.profitAndLoss.title).toBe("Profit and loss");
  });
});

describe("formatAnnualReport — lock banner", () => {
  it("adds a banner when approval is locked", () => {
    const f = formatAnnualReport(sampleReport, {
      approval: { ...sampleApproval, status: "locked" },
    });
    expect(f.lockBanner).toBe("BLOĶĒTS — apstiprinājums veikts");
  });

  it("adds a banner when approval is submitted", () => {
    const f = formatAnnualReport(sampleReport, {
      approval: { ...sampleApproval, status: "submitted" },
    });
    expect(f.lockBanner).toBe("BLOĶĒTS — apstiprinājums veikts");
  });

  it("omits banner when approval is unlocked or absent", () => {
    expect(formatAnnualReport(sampleReport).lockBanner).toBeUndefined();
    expect(formatAnnualReport(sampleReport, { approval: sampleApproval }).lockBanner).toBeUndefined();
  });
});

// ─── Snapshot hash ──────────────────────────────────────────

describe("computeSnapshotHash", () => {
  it("returns the same hash for identical reports", () => {
    const a = computeSnapshotHash(sampleReport);
    const b = computeSnapshotHash(JSON.parse(JSON.stringify(sampleReport)));
    expect(a).toBe(b);
  });

  it("changes when a balance-sheet number changes", () => {
    const before = computeSnapshotHash(sampleReport);
    const after = computeSnapshotHash({
      ...sampleReport,
      balanceSheetLv: { ...sampleReport.balanceSheetLv, totalAssets: 50001 },
    });
    expect(after).not.toBe(before);
  });

  it("ignores cosmetic changes — companyName is not part of the hash", () => {
    const a = computeSnapshotHash(sampleReport);
    const b = computeSnapshotHash({ ...sampleReport, companyName: "Different SIA" });
    expect(a).toBe(b);
  });

  it("returns an 8-character hex string", () => {
    expect(computeSnapshotHash(sampleReport)).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ─── Lock state machine ─────────────────────────────────────

describe("lockAnnualReport", () => {
  it("transitions an unlocked approval to locked, stamps signatory + hash", () => {
    const locked = lockAnnualReport({
      approval: sampleApproval,
      report: sampleReport,
      signatoryName: "Jānis Bērziņš",
      signatoryRole: "Valdes loceklis",
      signedAt: "2026-04-30T17:00:00Z",
    });
    expect(locked.status).toBe("locked");
    expect(locked.signatoryName).toBe("Jānis Bērziņš");
    expect(locked.signatoryRole).toBe("Valdes loceklis");
    expect(locked.signedAt).toBe("2026-04-30T17:00:00Z");
    expect(locked.snapshotHash).toBe(computeSnapshotHash(sampleReport));
  });

  it("trims signatory inputs", () => {
    const locked = lockAnnualReport({
      approval: sampleApproval,
      report: sampleReport,
      signatoryName: "  Jānis  ",
      signatoryRole: "  Valdes loceklis  ",
      signedAt: "2026-04-30T17:00:00Z",
    });
    expect(locked.signatoryName).toBe("Jānis");
    expect(locked.signatoryRole).toBe("Valdes loceklis");
  });

  it("rejects re-locking an already-locked approval", () => {
    const locked = { ...sampleApproval, status: "locked" as const };
    expect(() =>
      lockAnnualReport({
        approval: locked,
        report: sampleReport,
        signatoryName: "X",
        signatoryRole: "Y",
        signedAt: "2026-05-01T00:00:00Z",
      }),
    ).toThrowError(LockError);
  });

  it("rejects empty signatory name or role", () => {
    expect(() =>
      lockAnnualReport({
        approval: sampleApproval,
        report: sampleReport,
        signatoryName: "  ",
        signatoryRole: "Valdes loceklis",
        signedAt: "now",
      }),
    ).toThrowError(/signatoryName is required/);
    expect(() =>
      lockAnnualReport({
        approval: sampleApproval,
        report: sampleReport,
        signatoryName: "Jānis",
        signatoryRole: "",
        signedAt: "now",
      }),
    ).toThrowError(/signatoryRole is required/);
  });

  it("rejects fiscal year mismatch between approval and report", () => {
    expect(() =>
      lockAnnualReport({
        approval: { ...sampleApproval, fiscalYear: 2024 },
        report: sampleReport,
        signatoryName: "X",
        signatoryRole: "Y",
        signedAt: "now",
      }),
    ).toThrowError(/Approval is for FY 2024/);
  });
});

describe("unlockAnnualReport", () => {
  it("clears signatory metadata and resets to unlocked", () => {
    const locked = lockAnnualReport({
      approval: sampleApproval,
      report: sampleReport,
      signatoryName: "X",
      signatoryRole: "Y",
      signedAt: "2026-04-30T17:00:00Z",
    });
    const unlocked = unlockAnnualReport(locked, "2026-05-02T08:00:00Z");
    expect(unlocked.status).toBe("unlocked");
    expect(unlocked.signatoryName).toBeUndefined();
    expect(unlocked.snapshotHash).toBeUndefined();
    expect(unlocked.updatedAt).toBe("2026-05-02T08:00:00Z");
  });

  it("refuses to unlock a submitted approval", () => {
    const submitted: AnnualReportApproval = { ...sampleApproval, status: "submitted" };
    expect(() => unlockAnnualReport(submitted, "now")).toThrowError(/has been submitted to VID/);
  });
});

describe("markSubmittedToVid", () => {
  it("requires the approval to be locked first", () => {
    expect(() => markSubmittedToVid(sampleApproval, "vid-1", "now")).toThrowError(/must be locked before submission/);
  });

  it("transitions locked → submitted with submission id", () => {
    const locked = lockAnnualReport({
      approval: sampleApproval,
      report: sampleReport,
      signatoryName: "X",
      signatoryRole: "Y",
      signedAt: "2026-04-30T17:00:00Z",
    });
    const submitted = markSubmittedToVid(locked, "vid-123", "2026-05-15T10:00:00Z");
    expect(submitted.status).toBe("submitted");
    expect(submitted.vidSubmissionId).toBe("vid-123");
    expect(submitted.submittedAt).toBe("2026-05-15T10:00:00Z");
  });
});

describe("statusTransitions", () => {
  it("documents the legal moves between states", () => {
    const t = statusTransitions();
    expect(t.unlocked).toEqual(["locked"]);
    expect(t.locked).toEqual(["unlocked", "submitted"]);
    expect(t.submitted).toEqual([]);
  });
});
