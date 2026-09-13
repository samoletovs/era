export const DASHBOARD_METRICS = [
  {
    id: 'countries',
    label: 'Countries',
    cardLabel: 'Countries',
    field: 'countryCount',
    money: false,
  },
  {
    id: 'companies',
    label: 'Companies',
    cardLabel: 'Companies',
    field: 'companyCount',
    money: false,
  },
  {
    id: 'revenue',
    label: 'Revenue',
    cardLabel: 'Consolidated revenue',
    field: 'totalRevenue',
    money: true,
  },
  {
    id: 'expenses',
    label: 'Expenses',
    cardLabel: 'Consolidated expenses',
    field: 'totalExpenses',
    money: true,
  },
  {
    id: 'netProfit',
    label: 'Net profit',
    cardLabel: 'Consolidated net profit',
    field: 'netProfit',
    money: true,
  },
  {
    id: 'assets',
    label: 'Assets',
    cardLabel: 'Consolidated assets',
    field: 'totalAssets',
    money: true,
  },
] as const;

export type DashboardMetricId = (typeof DASHBOARD_METRICS)[number]['id'];

export const DEFAULT_DASHBOARD_METRICS: readonly DashboardMetricId[] = [
  'countries',
  'companies',
  'revenue',
  'netProfit',
];
export const DASHBOARD_METRICS_STORAGE_KEY = 'era_multiCountryDashboardMetrics_v1';

type MetricStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type GetStorage = () => MetricStorage;

interface DashboardMetricPreference {
  metrics: DashboardMetricId[];
  warning: string | null;
}

function isMetricId(value: unknown): value is DashboardMetricId {
  return DASHBOARD_METRICS.some((metric) => metric.id === value);
}

function isStorageError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    ['SecurityError', 'QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(error.name)
  );
}

export function loadDashboardMetrics(
  getStorage: GetStorage = () => window.localStorage,
): DashboardMetricPreference {
  const defaults = [...DEFAULT_DASHBOARD_METRICS];
  let raw: string | null;
  try {
    raw = getStorage().getItem(DASHBOARD_METRICS_STORAGE_KEY);
  } catch (error) {
    if (!isStorageError(error)) throw error;
    return {
      metrics: defaults,
      warning: 'Saved metric choices could not be read. Default metrics are shown.',
    };
  }
  if (raw === null) return { metrics: defaults, warning: null };

  const invalid = {
    metrics: defaults,
    warning:
      'Saved metric choices were invalid. Default metrics are shown; select metrics to replace them.',
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return invalid;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isMetricId)) {
    return invalid;
  }
  return {
    metrics: DASHBOARD_METRICS.filter((metric) => parsed.includes(metric.id)).map(
      (metric) => metric.id,
    ),
    warning: null,
  };
}

export function toggleDashboardMetric(
  selected: readonly DashboardMetricId[],
  metricId: DashboardMetricId,
): DashboardMetricId[] {
  if (selected.length === 1 && selected.includes(metricId)) return [...selected];
  return DASHBOARD_METRICS.filter((metric) =>
    metric.id === metricId ? !selected.includes(metric.id) : selected.includes(metric.id),
  ).map((metric) => metric.id);
}

export function saveDashboardMetrics(
  metrics: readonly DashboardMetricId[] | null,
  getStorage: GetStorage = () => window.localStorage,
): string | null {
  if (metrics !== null && (metrics.length === 0 || !metrics.every(isMetricId))) {
    throw new TypeError('Select at least one supported dashboard metric.');
  }
  try {
    const storage = getStorage();
    if (metrics === null) {
      storage.removeItem(DASHBOARD_METRICS_STORAGE_KEY);
    } else {
      storage.setItem(DASHBOARD_METRICS_STORAGE_KEY, JSON.stringify(metrics));
    }
    return null;
  } catch (error) {
    if (!isStorageError(error)) throw error;
    return metrics === null
      ? 'Default metrics are shown, but saved choices could not be removed. Allow browser storage and retry reset.'
      : 'Metric choices could not be saved. They apply only to this view; allow browser storage and try again.';
  }
}
