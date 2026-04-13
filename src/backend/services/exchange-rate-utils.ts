import type { ExchangeRateType } from '@shared/types';

const EXCHANGE_RATE_TYPES: ExchangeRateType[] = ['daily', 'budget'];

export function isExchangeRateType(value: string): value is ExchangeRateType {
  return EXCHANGE_RATE_TYPES.includes(value as ExchangeRateType);
}

export function parseOptionalExchangeRateType(value: unknown): ExchangeRateType | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return null;
  return isExchangeRateType(value) ? value : null;
}

export function normalizeCurrencyCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) return null;
  return normalized;
}

export function parseOptionalExchangeRateListLimit(value: unknown): number | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > 500) return null;
  return parsed;
}

export function normalizeExchangeRateListLimit(value: unknown): number {
  const fallback = 200;
  const max = 500;

  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  if (normalized < 1) return fallback;
  if (normalized > max) return max;
  return normalized;
}
