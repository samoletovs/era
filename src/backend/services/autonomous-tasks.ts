// Autonomous task scheduler — runs periodic accounting tasks automatically
// The agent calls run_month_end or the system triggers it on schedule
// Zero user interaction required for routine accounting operations

import { containers } from "./cosmos.js";
import { emitEvent } from "./events.js";
import { markOverdueInvoices } from "./reporting.js";
import { runDepreciation } from "./fixed-assets.js";
import { executeRecurringTemplate, listRecurringTemplates } from "./recurring-entries.js";
import { closePeriod } from "./period-close.js";
import type { Company, PeriodCloseRun, PeriodCloseStep } from "@shared/types";
import { v4 as uuidv4 } from "uuid";

// ─── Month-End Autonomous Process ───────────────────────────

export interface MonthEndResult {
  companyId: string;
  companyName: string;
  period: string;
  steps: MonthEndStep[];
  completedAt: string;
}

export interface MonthEndStep {
  name: string;
  status: "completed" | "skipped" | "failed";
  detail: string;
  error?: string;
}

export async function runMonthEnd(
  companyId: string,
  period: string,
  actor: string
): Promise<MonthEndResult> {
  const steps: MonthEndStep[] = [];
  const closeSteps: PeriodCloseStep[] = [];
  const startedAt = new Date().toISOString();
  const { resource: company } = await containers.companies()
    .item(companyId, companyId).read<Company>();
  const companyName = company?.name || companyId;

  // 1. Mark overdue invoices
  try {
    const count = await markOverdueInvoices(companyId);
    steps.push({ name: "Mark overdue invoices", status: "completed", detail: `${count} invoices marked overdue` });
    closeSteps.push({ name: "Mark overdue invoices", status: "completed", detail: `${count} invoices marked overdue` });
  } catch (err) {
    steps.push({ name: "Mark overdue invoices", status: "failed", detail: "Failed", error: String(err) });
    closeSteps.push({ name: "Mark overdue invoices", status: "failed", detail: "Failed", error: String(err) });
  }

  // 2. Execute recurring journal entries due this period
  try {
    const templates = await listRecurringTemplates(companyId);
    const [y, m] = period.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const periodEnd = `${period}-${lastDay}`;
    let executedCount = 0;
    const journalEntryIds: string[] = [];

    for (const t of templates) {
      if (!t.isActive) continue;
      if (t.nextRunDate && t.nextRunDate <= periodEnd) {
        try {
          const entry = await executeRecurringTemplate(companyId, t.id, t.nextRunDate, actor);
          executedCount++;
          journalEntryIds.push(entry.id);
        } catch { /* skip failed template */ }
      }
    }
    const detail = `${executedCount} of ${templates.filter(t => t.isActive).length} templates executed`;
    steps.push({ name: "Execute recurring entries", status: "completed", detail });
    closeSteps.push({ name: "Execute recurring entries", status: "completed", detail, journalEntryIds: journalEntryIds.length > 0 ? journalEntryIds : undefined });
  } catch (err) {
    steps.push({ name: "Execute recurring entries", status: "failed", detail: "Failed", error: String(err) });
    closeSteps.push({ name: "Execute recurring entries", status: "failed", detail: "Failed", error: String(err) });
  }

  // 3. Run fixed asset depreciation
  try {
    const result = await runDepreciation(companyId, period, actor);
    if (result.assetsDepreciated > 0) {
      const detail = `${result.assetsDepreciated} assets, €${result.totalAmount.toFixed(2)} total`;
      steps.push({ name: "Monthly depreciation", status: "completed", detail });
      closeSteps.push({ name: "Monthly depreciation", status: "completed", detail, journalEntryIds: result.journalEntryId ? [result.journalEntryId] : undefined });
    } else {
      steps.push({ name: "Monthly depreciation", status: "skipped", detail: "No active assets to depreciate" });
      closeSteps.push({ name: "Monthly depreciation", status: "skipped", detail: "No active assets to depreciate" });
    }
  } catch (err) {
    steps.push({ name: "Monthly depreciation", status: "failed", detail: "Failed", error: String(err) });
    closeSteps.push({ name: "Monthly depreciation", status: "failed", detail: "Failed", error: String(err) });
  }

  // 4. Close the period
  try {
    await closePeriod(companyId, period, actor);
    steps.push({ name: "Close period", status: "completed", detail: `Period ${period} closed` });
    closeSteps.push({ name: "Close period", status: "completed", detail: `Period ${period} closed` });
  } catch (err: any) {
    if (err?.code === "ALREADY_CLOSED") {
      steps.push({ name: "Close period", status: "skipped", detail: "Already closed" });
      closeSteps.push({ name: "Close period", status: "skipped", detail: "Already closed" });
    } else {
      steps.push({ name: "Close period", status: "failed", detail: "Failed", error: String(err) });
      closeSteps.push({ name: "Close period", status: "failed", detail: "Failed", error: String(err) });
    }
  }

  const completedAt = new Date().toISOString();
  const hasFailed = closeSteps.some(s => s.status === "failed");
  const allFailed = closeSteps.every(s => s.status === "failed");

  // Persist the close run
  const run: PeriodCloseRun = {
    id: uuidv4(),
    companyId,
    docType: "period-close-run",
    type: "month-end",
    period,
    steps: closeSteps,
    status: allFailed ? "failed" : hasFailed ? "partial" : "completed",
    startedBy: actor,
    startedAt,
    completedAt,
  };
  try { await containers.ledger().items.create(run); } catch { /* best-effort */ }

  const result: MonthEndResult = {
    companyId,
    companyName,
    period,
    steps,
    completedAt,
  };

  await emitEvent({
    companyId,
    type: "month-end.completed",
    actor,
    data: {
      period,
      stepsCompleted: steps.filter(s => s.status === "completed").length,
      stepsFailed: steps.filter(s => s.status === "failed").length,
      stepsSkipped: steps.filter(s => s.status === "skipped").length,
    },
  });

  return result;
}

// ─── Year-End Autonomous Process ────────────────────────────

export interface YearEndResult {
  companyId: string;
  companyName: string;
  fiscalYear: number;
  monthEndResults: MonthEndResult[];
  closingEntryId?: string;
  netResult?: number;
  completedAt: string;
}

export async function runYearEnd(
  companyId: string,
  fiscalYear: number,
  actor: string
): Promise<YearEndResult> {
  const startedAt = new Date().toISOString();
  const { resource: company } = await containers.companies()
    .item(companyId, companyId).read<Company>();
  const companyName = company?.name || companyId;

  // 1. Run month-end for any unclosed periods
  const monthEndResults: MonthEndResult[] = [];
  const yearSteps: PeriodCloseStep[] = [];
  for (let m = 1; m <= 12; m++) {
    const period = `${fiscalYear}-${String(m).padStart(2, "0")}`;
    try {
      const result = await runMonthEnd(companyId, period, actor);
      monthEndResults.push(result);
      yearSteps.push({ name: `Month-end ${period}`, status: "completed", detail: `${result.steps.filter(s => s.status === "completed").length} steps completed` });
    } catch {
      yearSteps.push({ name: `Month-end ${period}`, status: "skipped", detail: "Already closed or skipped" });
    }
  }

  // 2. Year-end closing journal (via period-close service)
  const { yearEndClose } = await import("./period-close.js");
  let closingEntryId: string | undefined;
  let netResult: number | undefined;
  try {
    const result = await yearEndClose(companyId, fiscalYear, actor);
    closingEntryId = result.closingEntry.id;
    netResult = result.closingEntry.lines
      .filter((l: any) => l.accountCode === "3310")
      .reduce((s: number, l: any) => s + l.credit - l.debit, 0);
    yearSteps.push({ name: "Year-end closing journal", status: "completed", detail: `Net result €${netResult?.toFixed(2)} transferred to retained earnings`, journalEntryIds: closingEntryId ? [closingEntryId] : undefined });
  } catch (err) {
    yearSteps.push({ name: "Year-end closing journal", status: "failed", detail: "Failed", error: String(err) });
  }

  const completedAt = new Date().toISOString();
  const hasFailed = yearSteps.some(s => s.status === "failed");
  const allFailed = yearSteps.every(s => s.status === "failed");

  // Persist the close run
  const run: PeriodCloseRun = {
    id: uuidv4(),
    companyId,
    docType: "period-close-run",
    type: "year-end",
    fiscalYear,
    steps: yearSteps,
    closingEntryId,
    netResult,
    status: allFailed ? "failed" : hasFailed ? "partial" : "completed",
    startedBy: actor,
    startedAt,
    completedAt,
  };
  try { await containers.ledger().items.create(run); } catch { /* best-effort */ }

  return {
    companyId,
    companyName,
    fiscalYear,
    monthEndResults,
    closingEntryId,
    netResult,
    completedAt,
  };
}

// ─── Health Check — What Needs Attention ────────────────────

export interface CompanyHealthCheck {
  companyId: string;
  companyName: string;
  checkedAt: string;
  issues: HealthIssue[];
  score: number; // 0-100, 100 = perfect
}

export interface HealthIssue {
  severity: "critical" | "warning" | "info";
  area: string;
  message: string;
  action?: string;
  agentCommand?: string;
}

export async function checkCompanyHealth(companyId: string): Promise<CompanyHealthCheck> {
  const issues: HealthIssue[] = [];
  const { resource: company } = await containers.companies()
    .item(companyId, companyId).read<Company>();
  if (!company) throw new Error("Company not found");

  const today = new Date().toISOString().slice(0, 10);
  const _currentPeriod = today.slice(0, 7);
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastPeriod = lastMonth.toISOString().slice(0, 7);

  // 1. Check for overdue invoices
  const { resources: overdueInvoices } = await containers.documents().items
    .query<any>({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.companyId = @cid AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) AND (c.status = 'posted' OR c.status = 'partially_paid') AND c.dueDate < @today",
      parameters: [{ name: "@cid", value: companyId }, { name: "@today", value: today }],
    })
    .fetchAll();
  const overdueCount = overdueInvoices[0] || 0;
  if (overdueCount > 0) {
    issues.push({
      severity: "warning",
      area: "Accounts receivable",
      message: `${overdueCount} overdue invoice${overdueCount !== 1 ? "s" : ""} need attention`,
      action: "Review overdue invoices",
      agentCommand: "run month-end to mark overdue invoices and send reminders",
    });
  }

  // 2. Check if last month is still open
  const { resources: periodDocs } = await containers.ledger().items
    .query<any>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND c.period = @period AND (c.docType = 'fiscal-period' OR (IS_DEFINED(c.status) AND IS_DEFINED(c.period) AND NOT IS_DEFINED(c.entryNumber)))",
      parameters: [{ name: "@cid", value: companyId }, { name: "@period", value: lastPeriod }],
    })
    .fetchAll();
  const lastPeriodStatus = periodDocs[0]?.status || "open";
  if (lastPeriodStatus === "open") {
    issues.push({
      severity: "critical",
      area: "Period management",
      message: `Period ${lastPeriod} is still open and should be closed`,
      action: `Close period ${lastPeriod}`,
      agentCommand: `run month-end close for period ${lastPeriod}`,
    });
  }

  // 3. Check for unposted draft invoices
  const { resources: draftCounts } = await containers.documents().items
    .query<any>({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.companyId = @cid AND (c.docType = 'invoice' OR IS_DEFINED(c.invoiceNumber)) AND c.status = 'draft'",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();
  const draftCount = draftCounts[0] || 0;
  if (draftCount > 0) {
    issues.push({
      severity: "info",
      area: "Invoicing",
      message: `${draftCount} draft invoice${draftCount !== 1 ? "s" : ""} not yet posted`,
      action: "Review draft invoices",
      agentCommand: "post all draft invoices to the general ledger",
    });
  }

  // 4. Check VAT filing status
  const lastQuarterEnd = new Date();
  lastQuarterEnd.setMonth(Math.floor(lastQuarterEnd.getMonth() / 3) * 3, 0);
  const vatCheckMonth = lastQuarterEnd.getMonth(); // 0-indexed
  const vatCheckYear = lastQuarterEnd.getFullYear();
  if (vatCheckMonth >= 0) {
    const { resources: vatReturns } = await containers.documents().items
      .query<any>({
        query: "SELECT VALUE COUNT(1) FROM c WHERE c.companyId = @cid AND (c.docType = 'vat-return' OR IS_DEFINED(c.vatPayable)) AND c.period = @period",
        parameters: [
          { name: "@cid", value: companyId },
          { name: "@period", value: `${vatCheckYear}-${String(vatCheckMonth + 1).padStart(2, "0")}` },
        ],
      })
      .fetchAll();
    if ((vatReturns[0] || 0) === 0) {
      issues.push({
        severity: "warning",
        area: "VAT compliance",
        message: `No VAT return generated for ${vatCheckYear}-${String(vatCheckMonth + 1).padStart(2, "0")}`,
        action: "Generate VAT return",
        agentCommand: `generate VAT return for period ${vatCheckYear}-${String(vatCheckMonth + 1).padStart(2, "0")}`,
      });
    }
  }

  // Calculate health score
  const criticalCount = issues.filter(i => i.severity === "critical").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;
  const score = Math.max(0, 100 - (criticalCount * 25) - (warningCount * 10) - (issues.filter(i => i.severity === "info").length * 2));

  return {
    companyId,
    companyName: company.name,
    checkedAt: new Date().toISOString(),
    issues,
    score,
  };
}

// ─── Close Run History ──────────────────────────────────────

export async function listCloseRuns(companyId: string): Promise<PeriodCloseRun[]> {
  const { resources } = await containers.ledger().items
    .query<PeriodCloseRun>({
      query: "SELECT * FROM c WHERE c.companyId = @cid AND c.docType = 'period-close-run' ORDER BY c.completedAt DESC",
      parameters: [{ name: "@cid", value: companyId }],
    })
    .fetchAll();
  return resources;
}

export async function getCloseRun(companyId: string, runId: string): Promise<PeriodCloseRun | null> {
  try {
    const { resource } = await containers.ledger()
      .item(runId, companyId).read<PeriodCloseRun>();
    return resource ?? null;
  } catch {
    return null;
  }
}
