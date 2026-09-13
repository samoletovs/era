import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DASHBOARD_METRICS,
  DASHBOARD_METRICS_STORAGE_KEY,
  loadDashboardMetrics,
  saveDashboardMetrics,
  toggleDashboardMetric,
} from '../../src/frontend/utils/dashboard-metrics';

function createStorage(raw: string | null = null) {
  const entries = new Map<string, string>();
  if (raw !== null) entries.set(DASHBOARD_METRICS_STORAGE_KEY, raw);
  return {
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      entries.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      entries.delete(key);
    }),
  };
}

describe('dashboard metric preferences', () => {
  it('preserves the original four metrics for a first visit', () => {
    const storage = createStorage();
    expect(loadDashboardMetrics(() => storage)).toEqual({
      metrics: ['countries', 'companies', 'revenue', 'netProfit'],
      warning: null,
    });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('restores a custom selection from persistent storage', () => {
    const storage = createStorage();
    expect(saveDashboardMetrics(['revenue', 'expenses', 'assets'], () => storage)).toBeNull();
    expect(loadDashboardMetrics(() => storage)).toEqual({
      metrics: ['revenue', 'expenses', 'assets'],
      warning: null,
    });
    expect(storage.getItem(DASHBOARD_METRICS_STORAGE_KEY)).toBe('["revenue","expenses","assets"]');
  });

  it('deduplicates valid stored metrics in display order', () => {
    const storage = createStorage('["assets","revenue","assets"]');
    expect(loadDashboardMetrics(() => storage).metrics).toEqual(['revenue', 'assets']);
  });

  it.each(['', '{', 'null', '{}', '"revenue"', '[]', '[false]', '["revenue","unknown"]'])(
    'reports invalid saved preferences %s instead of hiding the failure',
    (raw) => {
      const storage = createStorage(raw);
      const result = loadDashboardMetrics(() => storage);
      expect(result.metrics).toEqual(DEFAULT_DASHBOARD_METRICS);
      expect(result.warning).toContain('invalid');
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it('reports a blocked storage getter without breaking the dashboard', () => {
    const result = loadDashboardMetrics(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    expect(result.metrics).toEqual(DEFAULT_DASHBOARD_METRICS);
    expect(result.warning).toContain('could not be read');
  });

  it('reports a blocked storage read', () => {
    const storage = createStorage();
    storage.getItem.mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    expect(loadDashboardMetrics(() => storage).warning).toContain('could not be read');
  });

  it('adds an optional metric without changing the caller selection', () => {
    const selected = ['revenue'] as const;
    expect(toggleDashboardMetric(selected, 'assets')).toEqual(['revenue', 'assets']);
    expect(selected).toEqual(['revenue']);
  });

  it('removes a selected metric', () => {
    expect(toggleDashboardMetric(['revenue', 'assets'], 'revenue')).toEqual(['assets']);
  });

  it('refuses to remove the last visible metric', () => {
    expect(toggleDashboardMetric(['revenue'], 'revenue')).toEqual(['revenue']);
  });

  it('rejects empty writes', () => {
    const storage = createStorage();
    expect(() => saveDashboardMetrics([], () => storage)).toThrow(TypeError);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('reset removes the preference instead of persisting another profile', () => {
    const storage = createStorage('["assets"]');
    expect(saveDashboardMetrics(null, () => storage)).toBeNull();
    expect(storage.getItem(DASHBOARD_METRICS_STORAGE_KEY)).toBeNull();
    expect(loadDashboardMetrics(() => storage).metrics).toEqual(DEFAULT_DASHBOARD_METRICS);
  });

  it('reports quota failures without claiming the selection was saved', () => {
    const storage = createStorage('["revenue"]');
    storage.setItem.mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    expect(saveDashboardMetrics(['assets'], () => storage)).toContain('could not be saved');
    expect(loadDashboardMetrics(() => storage).metrics).toEqual(['revenue']);
  });

  it('reports failed deletion without claiming the saved choices were removed', () => {
    const storage = createStorage('["assets"]');
    storage.removeItem.mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    expect(saveDashboardMetrics(null, () => storage)).toContain('could not be removed');
    expect(storage.getItem(DASHBOARD_METRICS_STORAGE_KEY)).toBe('["assets"]');
  });

  it('does not swallow unexpected read errors', () => {
    expect(() =>
      loadDashboardMetrics(() => {
        throw new TypeError('Programming error');
      }),
    ).toThrow('Programming error');
  });

  it('does not swallow unexpected write errors', () => {
    expect(() =>
      saveDashboardMetrics(['revenue'], () => {
        throw new TypeError('Programming error');
      }),
    ).toThrow('Programming error');
  });
});
