import { describe, expect, it } from "vitest";

import {
  normalizeCurrencyCode,
  normalizeExchangeRateListLimit,
  parseOptionalExchangeRateListLimit,
  parseOptionalExchangeRateType,
} from "../../src/backend/services/exchange-rate-utils.js";

describe("exchange-rate-utils", () => {
  describe("parseOptionalExchangeRateType", () => {
    it("returns undefined for missing values", () => {
      expect(parseOptionalExchangeRateType(undefined)).toBeUndefined();
      expect(parseOptionalExchangeRateType("")).toBeUndefined();
    });

    it("accepts supported values", () => {
      expect(parseOptionalExchangeRateType("daily")).toBe("daily");
      expect(parseOptionalExchangeRateType("budget")).toBe("budget");
    });

    it("returns null for unsupported values", () => {
      expect(parseOptionalExchangeRateType("weekly")).toBeNull();
      expect(parseOptionalExchangeRateType(42)).toBeNull();
    });
  });

  describe("normalizeCurrencyCode", () => {
    it("normalizes valid ISO codes", () => {
      expect(normalizeCurrencyCode(" eur ")).toBe("EUR");
      expect(normalizeCurrencyCode("usd")).toBe("USD");
    });

    it("rejects invalid values", () => {
      expect(normalizeCurrencyCode("EURO")).toBeNull();
      expect(normalizeCurrencyCode("12")).toBeNull();
      expect(normalizeCurrencyCode(undefined)).toBeNull();
    });
  });

  describe("parseOptionalExchangeRateListLimit", () => {
    it("returns undefined when omitted", () => {
      expect(parseOptionalExchangeRateListLimit(undefined)).toBeUndefined();
      expect(parseOptionalExchangeRateListLimit("")).toBeUndefined();
    });

    it("accepts integer values in allowed range", () => {
      expect(parseOptionalExchangeRateListLimit("1")).toBe(1);
      expect(parseOptionalExchangeRateListLimit("200")).toBe(200);
      expect(parseOptionalExchangeRateListLimit(500)).toBe(500);
    });

    it("rejects invalid limit values", () => {
      expect(parseOptionalExchangeRateListLimit("0")).toBeNull();
      expect(parseOptionalExchangeRateListLimit("501")).toBeNull();
      expect(parseOptionalExchangeRateListLimit("20.5")).toBeNull();
      expect(parseOptionalExchangeRateListLimit("abc")).toBeNull();
    });
  });

  describe("normalizeExchangeRateListLimit", () => {
    it("uses fallback when input is invalid", () => {
      expect(normalizeExchangeRateListLimit(undefined)).toBe(200);
      expect(normalizeExchangeRateListLimit(Number.NaN)).toBe(200);
      expect(normalizeExchangeRateListLimit(0)).toBe(200);
    });

    it("clamps values over max", () => {
      expect(normalizeExchangeRateListLimit(999)).toBe(500);
    });

    it("keeps valid in-range limits", () => {
      expect(normalizeExchangeRateListLimit(250)).toBe(250);
    });
  });
});
