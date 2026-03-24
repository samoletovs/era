import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useApp } from "../utils/context";
import { formatMoney } from "../utils/format";
import { GlPostings } from "../components/GlPostings";
import { UniversalGrid, type GridColumn } from "../components/UniversalGrid";
import type {
  PeriodCloseRun,
  NumberFormat,
  ExchangeRate,
  CustomRateSource,
} from "@shared/types";
import { SYSTEM_RATE_SOURCES } from "@shared/types";

export function Accounting() {
  const { companyId, numberFormat: fmt } = useApp();
  const [health, setHealth] = useState<any>(null);

  // Exchange rates
  const [ratesDate, setRatesDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [ratesSource, setRatesSource] = useState("");
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [customSources, setCustomSources] = useState<CustomRateSource[]>([]);
  const [newRateFrom, setNewRateFrom] = useState("EUR");
  const [newRateTo, setNewRateTo] = useState("USD");
  const [newRateValue, setNewRateValue] = useState("");
  const [newRateDate, setNewRateDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [newRateType, setNewRateType] = useState<"daily" | "budget">("daily");
  const [rateSaving, setRateSaving] = useState(false);

  // Month-end
  const [monthEndPeriod, setMonthEndPeriod] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const [monthEndResult, setMonthEndResult] = useState<any>(null);

  // Year-end
  const [yearEndYear, setYearEndYear] = useState(new Date().getFullYear() - 1);
  const [yearEndResult, setYearEndResult] = useState<any>(null);

  const [vatPeriod, setVatPeriod] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const [vatResult, setVatResult] = useState<any>(null);
  const [vatLoading, setVatLoading] = useState(false);

  const [running, setRunning] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [yearEndConfirm, setYearEndConfirm] = useState(false);

  // Close run history
  const [closeRuns, setCloseRuns] = useState<PeriodCloseRun[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    api
      .companyHealth(companyId)
      .then(setHealth)
      .catch(() => {});
    api
      .closeRuns(companyId)
      .then(setCloseRuns)
      .catch(() => {});
    // Load custom rate sources from company settings
    api
      .company(companyId)
      .then((data: any) => {
        setCustomSources(data?.settings?.currency?.customRateSources || []);
      })
      .catch(() => {});
  }, [companyId]);

  async function handleMonthEnd() {
    setRunning("month");
    setMonthEndResult(null);
    setErrorMsg("");
    try {
      const result = await api.runMonthEnd(companyId, monthEndPeriod);
      setMonthEndResult(result);
      api
        .companyHealth(companyId)
        .then(setHealth)
        .catch(() => {});
      api
        .closeRuns(companyId)
        .then(setCloseRuns)
        .catch(() => {});
    } catch (e: any) {
      setErrorMsg(e.message || "Month-end failed");
    } finally {
      setRunning("");
    }
  }

  async function handleYearEnd() {
    setYearEndConfirm(false);
    setRunning("year");
    setYearEndResult(null);
    setErrorMsg("");
    try {
      const result = await api.runYearEnd(companyId, yearEndYear);
      setYearEndResult(result);
      api
        .companyHealth(companyId)
        .then(setHealth)
        .catch(() => {});
      api
        .closeRuns(companyId)
        .then(setCloseRuns)
        .catch(() => {});
    } catch (e: any) {
      setErrorMsg(e.message || "Year-end failed");
    } finally {
      setRunning("");
    }
  }

  async function handleVatReturn() {
    if (!companyId) return;
    setVatLoading(true);
    setVatResult(null);
    setErrorMsg("");
    try {
      const [year, month] = vatPeriod.split("-").map(Number);
      const result = await api.generateVatReturn(companyId, year, month);
      setVatResult(result);
      api
        .closeRuns(companyId)
        .then(setCloseRuns)
        .catch(() => {});
    } catch (e: any) {
      setErrorMsg(e.message || "VAT return failed");
    } finally {
      setVatLoading(false);
    }
  }

  const TYPE_LABELS: Record<string, string> = {
    "month-end": "Month-end",
    "year-end": "Year-end",
    "vat-return": "VAT return",
  };

  const runHistoryColumns: GridColumn<PeriodCloseRun>[] = [
    {
      id: "type",
      header: "Type",
      accessor: (run) => TYPE_LABELS[run.type] || run.type,
      render: (run) => (
        <span style={{ fontWeight: 500 }}>
          {TYPE_LABELS[run.type] || run.type}
        </span>
      ),
    },
    {
      id: "period",
      header: "Period / year",
      accessor: (run) => run.period || `FY${run.fiscalYear}`,
      render: (run) => (
        <span className="mono">{run.period || `FY${run.fiscalYear}`}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessor: (run) => run.status,
      render: (run) => (
        <span
          className={`badge ${run.status === "completed" ? "badge-paid" : run.status === "partial" ? "badge-warning" : "badge-overdue"}`}
        >
          {run.status}
        </span>
      ),
    },
    {
      id: "steps",
      header: "Steps",
      accessor: (run) =>
        `${run.steps.filter((s) => s.status === "completed").length}/${run.steps.length}`,
      render: (run) =>
        `${run.steps.filter((s) => s.status === "completed").length}/${run.steps.length} completed`,
      hideOnMobile: true,
    },
    {
      id: "completedAt",
      header: "Completed",
      accessor: (run) => run.completedAt || "",
      render: (run) => (
        <span
          style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}
        >
          {new Date(run.completedAt).toLocaleDateString()}{" "}
          {new Date(run.completedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      ),
      hideOnMobile: true,
    },
  ];

  if (!companyId)
    return (
      <div className="empty-state">
        <div className="icon">🏢</div>
        <h3>No company selected</h3>
        <p>Add a company first to run accounting processes.</p>
      </div>
    );

  return (
    <div>
      <h2 className="page-title">Accounting</h2>

      {/* Error notification */}
      {errorMsg && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            marginBottom: 16,
            background: "var(--error-bg)",
            border: "1px solid #FEE2E2",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-sm)",
            color: "#D1242F",
          }}
        >
          <span style={{ flex: 1 }}>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg("")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              color: "#D1242F",
              padding: 2,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Year-end confirmation */}
      {yearEndConfirm && (
        <div
          style={{
            padding: "14px 16px",
            marginBottom: 16,
            background: "var(--warning-bg)",
            border: "1px solid #FDE68A",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-sm)",
          }}
        >
          <div
            style={{
              fontWeight: 500,
              marginBottom: 6,
              color: "var(--text-primary)",
            }}
          >
            Run year-end close for FY{yearEndYear}?
          </div>
          <div style={{ color: "var(--text-secondary)", marginBottom: 10 }}>
            This will close all periods and transfer P&L to retained earnings.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-primary" onClick={handleYearEnd}>
              Confirm
            </button>
            <button
              className="btn-secondary"
              onClick={() => setYearEndConfirm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Health overview */}
      {health && (
        <div className="dashboard-grid" style={{ marginBottom: 24 }}>
          <div className="metric-card">
            <div className="label">Health score</div>
            <div className="value">{health.score}/100</div>
          </div>
          <div className="metric-card">
            <div className="label">Issues</div>
            <div className="value">{health.issues?.length || 0}</div>
            <div className="subtitle">
              {health.issues?.filter((i: any) => i.severity === "critical")
                .length || 0}{" "}
              critical
            </div>
          </div>
        </div>
      )}

      {/* Issues list */}
      {health?.issues?.length > 0 && (
        <div className="metric-card" style={{ marginBottom: 24 }}>
          <div className="label">Issues requiring attention</div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 12,
            }}
          >
            {health.issues.map((issue: any, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "8px 0",
                  borderBottom: "1px solid #F0F0F0",
                }}
              >
                <span style={{ flexShrink: 0, fontSize: 16 }}>
                  {issue.severity === "critical"
                    ? "🔴"
                    : issue.severity === "warning"
                      ? "🟡"
                      : "🔵"}
                </span>
                <div>
                  <div
                    style={{ fontWeight: 500, color: "var(--text-primary)" }}
                  >
                    {issue.message}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--text-sm)",
                      color: "var(--text-tertiary)",
                      marginTop: 2,
                    }}
                  >
                    {issue.area}
                    {issue.action ? ` — ${issue.action}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Month-end close */}
      <div className="accounting-grid">
        <div className="metric-card">
          <div className="label" style={{ marginBottom: 16 }}>
            Month-end close
          </div>
          <p
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--text-secondary)",
              marginBottom: 16,
            }}
          >
            Marks overdue invoices, executes recurring entries, runs
            depreciation, and closes the period.
          </p>
          <div className="form-inline-row">
            <div>
              <div className="detail-label">Period</div>
              <input
                type="month"
                value={monthEndPeriod}
                onChange={(e) => setMonthEndPeriod(e.target.value)}
                className="form-input"
              />
            </div>
            <button
              className="btn-secondary"
              onClick={handleMonthEnd}
              disabled={running === "month"}
            >
              {running === "month" ? "Running..." : "Run month-end"}
            </button>
          </div>

          {monthEndResult && (
            <div
              style={{
                marginTop: 16,
                padding: 14,
                background: "var(--bg-page)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: 8 }}>
                Completed — {monthEndResult.period}
              </div>
              {monthEndResult.steps?.map((s: any, i: number) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 8,
                    fontSize: "var(--text-sm)",
                    padding: "3px 0",
                  }}
                >
                  <span
                    style={{
                      color:
                        s.status === "completed"
                          ? "#34C759"
                          : s.status === "failed"
                            ? "#FF3B30"
                            : "var(--text-tertiary)",
                    }}
                  >
                    {s.status === "completed"
                      ? "✓"
                      : s.status === "failed"
                        ? "✗"
                        : "—"}
                  </span>
                  <span style={{ color: "var(--text-body)" }}>{s.name}</span>
                  <span
                    style={{
                      color: "var(--text-tertiary)",
                      marginLeft: "auto",
                    }}
                  >
                    {s.detail}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="metric-card">
          <div className="label" style={{ marginBottom: 16 }}>
            Year-end close
          </div>
          <p
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--text-secondary)",
              marginBottom: 16,
            }}
          >
            Closes all 12 periods, posts the closing journal entry, and
            transfers P&L to retained earnings.
          </p>
          <div className="form-inline-row">
            <div>
              <div className="detail-label">Fiscal year</div>
              <input
                type="number"
                value={yearEndYear}
                onChange={(e) => setYearEndYear(Number(e.target.value))}
                className="form-input"
              />
            </div>
            <button
              className="btn-secondary"
              onClick={() => setYearEndConfirm(true)}
              disabled={running === "year"}
            >
              {running === "year" ? "Running..." : "Run year-end close"}
            </button>
          </div>

          {yearEndResult && (
            <div
              style={{
                marginTop: 16,
                padding: 14,
                background: "var(--bg-page)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: 4 }}>
                FY{yearEndResult.fiscalYear} closed
              </div>
              {yearEndResult.netResult !== null && (
                <div style={{ fontSize: "var(--text-sm)" }}>
                  Net result:{" "}
                  <strong
                    style={{
                      color:
                        yearEndResult.netResult >= 0 ? "#34C759" : "#FF3B30",
                    }}
                  >
                    {formatMoney(yearEndResult.netResult, fmt)}
                  </strong>{" "}
                  transferred to retained earnings
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* VAT return */}
      <div className="metric-card" style={{ marginTop: 24, marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 16 }}>
          VAT return (PVN deklarācija)
        </div>
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--text-secondary)",
            marginBottom: 16,
          }}
        >
          Generate the VAT return for a given month. Shows output VAT, input
          VAT, and amount payable to VID.
        </p>
        <div className="form-inline-row">
          <div>
            <div className="detail-label">Period</div>
            <input
              type="month"
              value={vatPeriod}
              onChange={(e) => setVatPeriod(e.target.value)}
              className="form-input"
            />
          </div>
          <button
            className="btn-secondary"
            onClick={handleVatReturn}
            disabled={vatLoading}
          >
            {vatLoading ? "Generating..." : "Generate VAT return"}
          </button>
        </div>
        {vatResult && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              background: "var(--bg-page)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: 8 }}>
              VAT return — {vatResult.period}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
                fontSize: "var(--text-sm)",
              }}
            >
              <div>
                <span style={{ color: "var(--text-secondary)" }}>
                  Output VAT
                </span>
                <br />
                <strong>{formatMoney(vatResult.totalOutputVat, fmt)}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>
                  Input VAT
                </span>
                <br />
                <strong>{formatMoney(vatResult.totalInputVat, fmt)}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>
                  VAT payable
                </span>
                <br />
                <strong
                  style={{
                    color:
                      (vatResult.vatPayable ?? 0) >= 0 ? "#FF3B30" : "#34C759",
                  }}
                >
                  {formatMoney(vatResult.vatPayable, fmt)}
                </strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Exchange rates */}
      <div style={{ marginTop: 32 }}>
        <h3 className="section-title">Exchange rates</h3>
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--text-secondary)",
            marginTop: 4,
            marginBottom: 16,
          }}
        >
          ECB rates are imported automatically when needed. View rates for a
          specific date or add manual rates for custom sources.
        </p>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <div>
            <div className="detail-label">Source</div>
            <select
              value={ratesSource}
              onChange={(e) => setRatesSource(e.target.value)}
              className="form-input"
              style={{ minWidth: 180 }}
            >
              <option value="">All sources</option>
              {SYSTEM_RATE_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {customSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="detail-label">Date</div>
            <input
              type="date"
              value={ratesDate}
              onChange={(e) => setRatesDate(e.target.value)}
              className="form-input"
            />
          </div>
          <button
            className="btn-secondary"
            onClick={async () => {
              setRatesLoading(true);
              try {
                const data = await api.exchangeRates({
                  source: ratesSource || undefined,
                  fromDate: ratesDate,
                  toDate: ratesDate,
                  limit: 100,
                });
                setRates(data);
              } catch {
                setRates([]);
              } finally {
                setRatesLoading(false);
              }
            }}
          >
            {ratesLoading ? "Loading..." : "Load rates"}
          </button>
        </div>

        {rates.length > 0 && (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              overflow: "hidden",
              marginBottom: 16,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "var(--bg-subtle)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    From
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    To
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    Rate
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    Date
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    Type
                  </th>
                  <th
                    style={{
                      padding: "8px 12px",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                    }}
                  >
                    Source
                  </th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td
                      style={{ padding: "6px 12px", fontFamily: "monospace" }}
                    >
                      {r.fromCurrency}
                    </td>
                    <td
                      style={{ padding: "6px 12px", fontFamily: "monospace" }}
                    >
                      {r.toCurrency}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        textAlign: "right",
                        fontFamily: "monospace",
                      }}
                    >
                      {r.rate}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {r.effectiveDate}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {r.rateType}
                    </td>
                    <td
                      style={{
                        padding: "6px 12px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {SYSTEM_RATE_SOURCES.find((s) => s.id === r.source)
                        ?.name ||
                        customSources.find((s) => s.id === r.source)?.name ||
                        r.source}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rates.length === 0 && !ratesLoading && (
          <p
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--text-tertiary)",
              marginBottom: 16,
            }}
          >
            No rates for this date. Select a date and click &quot;Load
            rates&quot;.
          </p>
        )}

        {customSources.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div className="detail-label" style={{ marginBottom: 8 }}>
              Add manual rate
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div className="detail-label">Source</div>
                <select
                  value={
                    customSources.find((s) => s.id === ratesSource)
                      ? ratesSource
                      : customSources[0]?.id || ""
                  }
                  onChange={(e) => setRatesSource(e.target.value)}
                  className="form-input"
                  style={{ minWidth: 140 }}
                >
                  {customSources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="detail-label">Type</div>
                <select
                  value={newRateType}
                  onChange={(e) =>
                    setNewRateType(e.target.value as "daily" | "budget")
                  }
                  className="form-input"
                  style={{ minWidth: 90 }}
                >
                  <option value="daily">Daily</option>
                  <option value="budget">Budget</option>
                </select>
              </div>
              <div>
                <div className="detail-label">From</div>
                <input
                  value={newRateFrom}
                  onChange={(e) =>
                    setNewRateFrom(e.target.value.toUpperCase().slice(0, 3))
                  }
                  className="form-input"
                  style={{ width: 60, fontFamily: "monospace" }}
                  maxLength={3}
                />
              </div>
              <div>
                <div className="detail-label">To</div>
                <input
                  value={newRateTo}
                  onChange={(e) =>
                    setNewRateTo(e.target.value.toUpperCase().slice(0, 3))
                  }
                  className="form-input"
                  style={{ width: 60, fontFamily: "monospace" }}
                  maxLength={3}
                />
              </div>
              <div>
                <div className="detail-label">Rate</div>
                <input
                  type="number"
                  step="0.000001"
                  value={newRateValue}
                  onChange={(e) => setNewRateValue(e.target.value)}
                  className="form-input"
                  style={{ width: 110, fontFamily: "monospace" }}
                  placeholder="1.0872"
                />
              </div>
              <div>
                <div className="detail-label">Date</div>
                <input
                  type="date"
                  value={newRateDate}
                  onChange={(e) => setNewRateDate(e.target.value)}
                  className="form-input"
                />
              </div>
              <button
                className="btn-secondary"
                disabled={
                  rateSaving || !newRateValue || parseFloat(newRateValue) <= 0
                }
                onClick={async () => {
                  const rateNum = parseFloat(newRateValue);
                  if (
                    !newRateFrom ||
                    !newRateTo ||
                    !rateNum ||
                    rateNum <= 0 ||
                    !newRateDate
                  )
                    return;
                  const sourceId = customSources.find(
                    (s) => s.id === ratesSource,
                  )
                    ? ratesSource
                    : customSources[0]?.id;
                  if (!sourceId) return;
                  setRateSaving(true);
                  try {
                    await api.createExchangeRate({
                      fromCurrency: newRateFrom,
                      toCurrency: newRateTo,
                      rate: rateNum,
                      effectiveDate: newRateDate,
                      source: sourceId,
                      rateType: newRateType,
                      companyId: companyId || undefined,
                    });
                    setNewRateValue("");
                    const data = await api.exchangeRates({
                      source: sourceId,
                      fromDate: newRateDate,
                      toDate: newRateDate,
                      limit: 100,
                    });
                    setRates(data);
                    setRatesSource(sourceId);
                    setRatesDate(newRateDate);
                  } catch {
                    /* ignore */
                  } finally {
                    setRateSaving(false);
                  }
                }}
              >
                {rateSaving ? "Saving..." : "Add rate"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Run history */}
      <div style={{ marginTop: 32 }}>
        <h3 className="section-title">Run history</h3>
        {closeRuns.length === 0 ? (
          <p
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--text-tertiary)",
              marginTop: 8,
            }}
          >
            No runs yet. Execute a month-end close, year-end close, or VAT
            return above.
          </p>
        ) : (
          <>
            {expandedRunId && closeRuns.find((r) => r.id === expandedRunId) && (
              <CloseRunDetail
                run={closeRuns.find((r) => r.id === expandedRunId)!}
                fmt={fmt}
                onClose={() => setExpandedRunId(null)}
              />
            )}
            <UniversalGrid
              rows={closeRuns}
              columns={runHistoryColumns}
              rowKey={(row) => String(row.id)}
              onRowClick={(run) =>
                setExpandedRunId(expandedRunId === run.id ? null : run.id)
              }
              searchPlaceholder="Search runs..."
              emptyMessage="No matching runs."
              initialSort={{ columnId: "completedAt", direction: "desc" }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function CloseRunDetail({
  run,
  fmt,
  onClose,
}: {
  run: PeriodCloseRun;
  fmt: NumberFormat | undefined;
  onClose?: () => void;
}) {
  const { companyId } = useApp();
  const [glEntries, setGlEntries] = useState<any[]>([]);
  const [loadingGl, setLoadingGl] = useState(false);

  // Collect all journal entry IDs from steps
  useEffect(() => {
    if (!companyId) return;
    const allIds: string[] = [];
    for (const step of run.steps) {
      if (step.journalEntryIds) allIds.push(...step.journalEntryIds);
    }
    if (run.closingEntryId) allIds.push(run.closingEntryId);
    if (allIds.length === 0) {
      setGlEntries([]);
      return;
    }

    setLoadingGl(true);
    api
      .journalEntries(companyId)
      .then((entries: any) => {
        const arr = Array.isArray(entries) ? entries : [];
        const idSet = new Set(allIds);
        setGlEntries(arr.filter((e: any) => idSet.has(e.id)));
      })
      .catch(() => setGlEntries([]))
      .finally(() => setLoadingGl(false));
  }, [companyId, run]);

  return (
    <div
      className="settings-card"
      style={{
        marginBottom: 16,
        padding: "14px 16px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            color: "var(--text-body)",
          }}
        >
          {run.type === "month-end"
            ? "Month-end"
            : run.type === "year-end"
              ? "Year-end"
              : "VAT return"}{" "}
          — {run.period || run.fiscalYear}
        </span>
        {onClose && (
          <button
            className="btn-secondary"
            style={{ fontSize: "var(--text-xs)", padding: "2px 8px" }}
            onClick={onClose}
            aria-label="Close details"
          >
            ✕
          </button>
        )}
      </div>
      {run.type === "year-end" &&
        run.netResult !== null &&
        run.netResult !== undefined && (
          <div style={{ marginBottom: 12, fontSize: "var(--text-sm)" }}>
            Net result:{" "}
            <strong
              style={{ color: run.netResult >= 0 ? "#34C759" : "#FF3B30" }}
            >
              {formatMoney(run.netResult, fmt)}
            </strong>{" "}
            transferred to retained earnings
            {run.closingEntryId && (
              <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>
                (Entry:{" "}
                <span className="mono">{run.closingEntryId.slice(0, 8)}…</span>)
              </span>
            )}
          </div>
        )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {run.steps.map((step, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 8,
              fontSize: "var(--text-sm)",
              padding: "4px 0",
              borderBottom: "1px solid #F0F0F0",
              alignItems: "center",
            }}
          >
            <span
              style={{
                flexShrink: 0,
                color:
                  step.status === "completed"
                    ? "#34C759"
                    : step.status === "failed"
                      ? "#FF3B30"
                      : "var(--text-tertiary)",
              }}
            >
              {step.status === "completed"
                ? "✓"
                : step.status === "failed"
                  ? "✗"
                  : "—"}
            </span>
            <span
              style={{
                fontWeight: 500,
                color: "var(--text-body)",
                minWidth: 180,
              }}
            >
              {step.name}
            </span>
            <span style={{ color: "var(--text-secondary)" }}>
              {step.detail}
            </span>
            {step.journalEntryIds && step.journalEntryIds.length > 0 && (
              <span
                style={{
                  marginLeft: "auto",
                  color: "var(--text-tertiary)",
                  fontSize: "var(--text-xs)",
                }}
              >
                {step.journalEntryIds.length} journal{" "}
                {step.journalEntryIds.length === 1 ? "entry" : "entries"}
              </span>
            )}
            {step.error && (
              <span
                style={{
                  marginLeft: "auto",
                  color: "#FF3B30",
                  fontSize: "var(--text-xs)",
                }}
                title={step.error}
              >
                Error
              </span>
            )}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: "var(--text-xs)",
          color: "var(--text-tertiary)",
        }}
      >
        Started by {run.startedBy} at {new Date(run.startedAt).toLocaleString()}
      </div>
      {(glEntries.length > 0 || loadingGl) && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              marginBottom: 8,
            }}
          >
            Generated transactions
          </div>
          <GlPostings
            entries={glEntries}
            loading={loadingGl}
            emptyMessage="No GL entries"
            formatMoney={formatMoney}
            fmt={fmt}
          />
        </div>
      )}
    </div>
  );
}
