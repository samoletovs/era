/** Simple TTL-based in-memory cache — cost-effective alternative to Redis for single-instance workloads.
 *  Suitable for ERA's initial scale (1000 users, single Container App replica).
 *  Replace with Redis/distributed cache when scaling to multiple replicas. */

interface CacheEntry<T> {
  data: T;
  expiresAtMs: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/** Get a cached value, or undefined if expired/missing */
export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAtMs) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

/** Set a cached value with TTL in seconds */
export function cacheSet<T>(key: string, data: T, ttlSeconds: number): void {
  store.set(key, { data, expiresAtMs: Date.now() + ttlSeconds * 1000 });
}

/** Invalidate a specific key or all keys matching a prefix */
export function cacheInvalidate(keyOrPrefix: string): void {
  if (store.has(keyOrPrefix)) {
    store.delete(keyOrPrefix);
    return;
  }
  // Prefix-based invalidation
  for (const key of store.keys()) {
    if (key.startsWith(keyOrPrefix)) store.delete(key);
  }
}

/** Cache stats for monitoring */
export function cacheStats(): { size: number; keys: string[] } {
  // Clean expired entries
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAtMs) store.delete(key);
  }
  return { size: store.size, keys: [...store.keys()] };
}

// ─── Cache key builders ─────────────────────────────────────

export const CACHE_KEYS = {
  exchangeRate: (from: string, to: string, date: string) => `fx:${from}:${to}:${date}`,
  postingRules: (country: string) => `rules:${country}`,
  chartOfAccounts: (companyId: string) => `coa:${companyId}`,
  companyList: () => 'companies:list',
} as const;

// ─── TTL constants (seconds) ────────────────────────────────

export const CACHE_TTL = {
  EXCHANGE_RATE: 3600, // 1 hour — rates update daily
  POSTING_RULES: 1800, // 30 min — rules rarely change
  CHART_OF_ACCOUNTS: 300, // 5 min — accounts change infrequently
  COMPANY_LIST: 60, // 1 min — companies list is small
} as const;
