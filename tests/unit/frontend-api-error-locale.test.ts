import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, formatApiError } from "../../src/frontend/utils/api";

describe("formatApiError locale default", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("formats messages in Latvian when browser language starts with lv", () => {
    vi.stubGlobal("navigator", { language: "lv-LV" });
    const err = new ApiError(
      { error: { code: "VAL-001", message: "Validation failed" } },
      400,
    );

    expect(formatApiError(err)).toBe("Lūdzu, pārbaudiet ievadītos datus.");
  });

  it("formats messages in English for non-Latvian browser locales", () => {
    vi.stubGlobal("navigator", { language: "en-US" });
    const err = new ApiError(
      { error: { code: "VAL-001", message: "Validation failed" } },
      400,
    );

    expect(formatApiError(err)).toBe("Please check the values you entered.");
  });
});
