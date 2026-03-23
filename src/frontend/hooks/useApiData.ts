import { useState, useEffect, useCallback, useRef } from "react";

/** Loading state for async data fetching */
interface ApiDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Universal hook for API data fetching with loading/error states.
 * Replaces the repeated useState+useEffect+catch pattern across all pages.
 *
 * @example
 * const { data: invoices, loading, error, reload } = useApiData(
 *   () => api.invoices(companyId),
 *   [companyId]
 * );
 */
export function useApiData<T>(
  fetcher: (() => Promise<T>) | null,
  deps: unknown[] = [],
): ApiDataState<T> & { reload: () => void } {
  const [state, setState] = useState<ApiDataState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const mountedRef = useRef(true);

  const load = useCallback(() => {
    if (!fetcher) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    fetcher()
      .then(data => {
        if (mountedRef.current) setState({ data, loading: false, error: null });
      })
      .catch(err => {
        if (mountedRef.current) setState({ data: null, loading: false, error: err instanceof Error ? err.message : String(err) });
      });
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  return { ...state, reload: load };
}
