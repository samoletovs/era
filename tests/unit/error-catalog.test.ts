// Unit tests for the shared error catalog + bilingual formatter. The catalog
// is the single point that turns server error codes (e.g. `VAL-001`,
// `BIZ-001`) and Zod issue codes into user-readable LV/EN strings — without
// it the UI would render technical defaults like "Validation failed" or
// "Expected string, received undefined" to non-developer users.
import { describe, expect, it } from "vitest";
import {
  ERROR_CATALOG,
  ZOD_ISSUE_CATALOG,
  formatApiErrorEnvelope,
  lookupErrorMessage,
  lookupZodMessage,
} from "../../src/shared/errors/catalog";

describe("error catalog", () => {
  it("has both LV and EN messages for every entry", () => {
    for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(entry.lv, `LV missing for ${code}`).toBeTruthy();
      expect(entry.en, `EN missing for ${code}`).toBeTruthy();
      expect(entry.lv).not.toBe(entry.en);
    }
    for (const [code, entry] of Object.entries(ZOD_ISSUE_CATALOG)) {
      expect(entry.lv, `LV Zod missing for ${code}`).toBeTruthy();
      expect(entry.en, `EN Zod missing for ${code}`).toBeTruthy();
    }
  });

  it("covers every error code currently emitted by the backend router and middleware", () => {
    // Codes harvested from grep of the backend; if a new one is added without
    // a catalog entry, this test surfaces the regression — the UI will fall
    // back to the server message verbatim, which is the worst kind of
    // bilingual experience (English-only).
    const required = [
      "VAL-001",
      "INVALID_INPUT",
      "MISSING_DATA",
      "AUTH-001",
      "AUTH-003",
      "AUTH-004",
      "BIZ-001",
      "MIN_LINES",
      "MISSING_DATE",
      "MISSING_DESC",
      "NEGATIVE_AMOUNT",
      "ALREADY_REVERSED",
      "NOT_FOUND",
      "AUDIT_EVENT_NOT_FOUND",
      "AUDIT_ENTRY_NOT_FOUND",
      "RATE_LIMITED",
      "SYS-001",
      "SYS-002",
    ];
    for (const code of required) {
      expect(ERROR_CATALOG[code], `missing catalog entry for ${code}`).toBeDefined();
    }
  });
});

describe("lookupErrorMessage", () => {
  it("returns the LV message for known codes when locale=lv", () => {
    expect(lookupErrorMessage("VAL-001", "lv")).toBe(ERROR_CATALOG["VAL-001"].lv);
  });

  it("returns the EN message for known codes when locale=en", () => {
    expect(lookupErrorMessage("VAL-001", "en")).toBe(ERROR_CATALOG["VAL-001"].en);
  });

  it("falls back to the upstream message when the code is unknown", () => {
    expect(lookupErrorMessage("UNKNOWN-XYZ", "lv", "Server custom text")).toBe(
      "Server custom text",
    );
  });

  it("falls back to a generic locale-appropriate message when no fallback supplied", () => {
    expect(lookupErrorMessage("UNKNOWN-XYZ", "lv")).toContain("kļūda");
    expect(lookupErrorMessage("UNKNOWN-XYZ", "en")).toContain("Something");
  });

  it("falls back to generic when fallback is whitespace-only", () => {
    const out = lookupErrorMessage(undefined, "en", "   ");
    expect(out).toContain("Something");
  });
});

describe("lookupZodMessage", () => {
  it("translates known Zod issue codes", () => {
    expect(lookupZodMessage("invalid_type", "lv")).toBe(ZOD_ISSUE_CATALOG.invalid_type.lv);
    expect(lookupZodMessage("too_small", "en")).toBe(ZOD_ISSUE_CATALOG.too_small.en);
  });

  it("falls back to the raw Zod message for unknown codes", () => {
    expect(lookupZodMessage("invented_code", "en", "raw zod text")).toBe("raw zod text");
  });
});

describe("formatApiErrorEnvelope", () => {
  it("renders a known top-level code in the requested locale", () => {
    const out = formatApiErrorEnvelope(
      { error: { code: "AUTH-001", message: "ignored" } },
      "lv",
    );
    expect(out).toBe(ERROR_CATALOG["AUTH-001"].lv);
  });

  it("appends Zod field issues with translated text and a field prefix", () => {
    const out = formatApiErrorEnvelope(
      {
        error: {
          code: "VAL-001",
          message: "Validation failed",
          details: [
            { field: "email", code: "invalid_format", message: "Invalid email" },
            { field: "name", code: "too_small", message: "String must contain at least 1 character(s)" },
          ],
        },
      },
      "lv",
    );
    expect(out).toContain(ERROR_CATALOG["VAL-001"].lv);
    expect(out).toContain("email:");
    expect(out).toContain("name:");
    expect(out).toContain(ZOD_ISSUE_CATALOG.invalid_format.lv);
    expect(out).toContain(ZOD_ISSUE_CATALOG.too_small.lv);
  });

  it("caps shown details at 3 with a localized 'more' suffix", () => {
    const out = formatApiErrorEnvelope(
      {
        error: {
          code: "VAL-001",
          message: "Validation failed",
          details: [
            { field: "a", code: "too_small" },
            { field: "b", code: "too_small" },
            { field: "c", code: "too_small" },
            { field: "d", code: "too_small" },
            { field: "e", code: "too_small" },
          ],
        },
      },
      "en",
    );
    expect(out).toContain("(+2 more)");
    expect(out).toContain("a:");
    expect(out).toContain("b:");
    expect(out).toContain("c:");
    expect(out).not.toContain("d:");
  });

  it("uses LV 'vēl' suffix instead of 'more' when locale=lv", () => {
    const out = formatApiErrorEnvelope(
      {
        error: {
          code: "VAL-001",
          message: "Validation failed",
          details: Array.from({ length: 5 }).map((_, i) => ({
            field: `f${i}`,
            code: "too_small",
          })),
        },
      },
      "lv",
    );
    expect(out).toContain("(+2 vēl)");
    expect(out).not.toContain("more");
  });

  it("renders details without a field prefix when only code/message are present", () => {
    const out = formatApiErrorEnvelope(
      {
        error: {
          code: "VAL-001",
          message: "Validation failed",
          details: [{ code: "custom", message: "must be unique" }],
        },
      },
      "en",
    );
    expect(out).toContain(ZOD_ISSUE_CATALOG.custom.en);
    // Should NOT contain a leading colon-prefix from a missing field.
    expect(out).not.toMatch(/—\s+:/);
  });

  it("handles unknown error codes by surfacing the server message", () => {
    const out = formatApiErrorEnvelope(
      { error: { code: "MY-NEW-CODE", message: "ad-hoc server text" } },
      "en",
    );
    expect(out).toBe("ad-hoc server text");
  });

  it("handles a null/empty body with a locale-appropriate default", () => {
    expect(formatApiErrorEnvelope(null, "lv")).toContain("kļūda");
    expect(formatApiErrorEnvelope(undefined, "en")).toContain("Something");
  });

  it("handles GLError-style codes from ledger.ts (MIN_LINES, ALREADY_REVERSED)", () => {
    expect(
      formatApiErrorEnvelope(
        { error: { code: "MIN_LINES", message: "Journal entry must have at least 2 lines" } },
        "lv",
      ),
    ).toBe(ERROR_CATALOG.MIN_LINES.lv);
    expect(
      formatApiErrorEnvelope(
        { error: { code: "ALREADY_REVERSED", message: "Entry already reversed" } },
        "en",
      ),
    ).toBe(ERROR_CATALOG.ALREADY_REVERSED.en);
  });
});
