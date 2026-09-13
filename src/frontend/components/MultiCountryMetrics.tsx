import { useId, useState } from 'react';
import { useDashboardMetrics } from '../hooks/useDashboardMetrics';
import { useApp } from '../utils/context';
import { DASHBOARD_METRICS } from '../utils/dashboard-metrics';
import { formatMoney } from '../utils/format';
import type { MultiCountryDashboardModel } from '../utils/multi-country-dashboard';
import './MultiCountryMetrics.css';

export function MultiCountryMetrics({ dashboard }: { dashboard: MultiCountryDashboardModel }) {
  const { numberFormat } = useApp();
  const { metrics, warning, toggleMetric, resetMetrics } = useDashboardMetrics();
  const [customizing, setCustomizing] = useState(false);
  const panelId = useId();
  const hintId = useId();

  return (
    <div className="multi-country-metrics">
      <div className="multi-country-metrics-toolbar">
        <button
          type="button"
          className="btn-secondary"
          aria-expanded={customizing}
          aria-controls={panelId}
          onClick={() => setCustomizing(!customizing)}
        >
          Customize metrics
        </button>
        <p className="multi-country-metrics-hint">
          Choices are stored in this browser, not synced to your account.
        </p>
      </div>
      {warning && (
        <p role="status" className="multi-country-metrics-hint">
          {warning}
        </p>
      )}
      <fieldset id={panelId} hidden={!customizing} className="multi-country-metrics-options">
        <legend>Visible metrics</legend>
        <p id={hintId} className="multi-country-metrics-hint">
          Keep at least one metric selected. Reset removes your saved choices.
        </p>
        <div className="multi-country-metrics-choices">
          {DASHBOARD_METRICS.map((metric) => (
            <label key={metric.id} className="multi-country-metrics-choice">
              <input
                type="checkbox"
                checked={metrics.includes(metric.id)}
                disabled={metrics.length === 1 && metrics.includes(metric.id)}
                aria-describedby={hintId}
                onChange={() => toggleMetric(metric.id)}
              />
              {metric.label}
            </label>
          ))}
        </div>
        <button type="button" className="btn-secondary" onClick={resetMetrics}>
          Reset to defaults
        </button>
      </fieldset>
      <section className="dashboard-grid" aria-label="Dashboard metrics">
        {DASHBOARD_METRICS.filter((metric) => metrics.includes(metric.id)).map((metric) => (
          <div key={metric.id} className="metric-card">
            <div className="label">{metric.cardLabel}</div>
            <div className="value">
              {metric.money
                ? formatMoney(dashboard[metric.field], numberFormat)
                : dashboard[metric.field]}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
