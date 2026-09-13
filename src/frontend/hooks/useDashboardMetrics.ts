import { useEffect, useState } from 'react';
import { useApp } from '../utils/context';
import {
  DEFAULT_DASHBOARD_METRICS,
  loadDashboardMetrics,
  saveDashboardMetrics,
  toggleDashboardMetric,
  type DashboardMetricId,
} from '../utils/dashboard-metrics';

export function useDashboardMetrics() {
  const { toast } = useApp();
  const [preference, setPreference] = useState(() => loadDashboardMetrics());

  useEffect(() => {
    if (preference.warning) toast(preference.warning);
  }, [preference.warning, toast]);

  function toggleMetric(metricId: DashboardMetricId) {
    const metrics = toggleDashboardMetric(preference.metrics, metricId);
    const warning = saveDashboardMetrics(metrics);
    setPreference({ metrics, warning });
  }

  function resetMetrics() {
    const warning = saveDashboardMetrics(null);
    setPreference({ metrics: [...DEFAULT_DASHBOARD_METRICS], warning });
  }

  return { ...preference, toggleMetric, resetMetrics };
}
