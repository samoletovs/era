import { describe, expect, it } from "vitest";
import { CreateContactSchema } from "../../src/backend/api/schemas";

describe("CreateContactSchema", () => {
  it("accepts nested address and bankAccount objects", () => {
    const result = CreateContactSchema.safeParse({
      name: "SIA Test",
      type: "customer",
      address: {
        line1: "Brivibas iela 1",
        city: "Riga",
        postalCode: "LV-1010",
        country: "Latvia",
      },
      bankAccount: {
        iban: "LV80BANK0000435195001",
        swift: "BANKLV2X",
        bankName: "Test Bank",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects address line1 values longer than 500 characters", () => {
    const result = CreateContactSchema.safeParse({
      name: "SIA Test",
      address: {
        line1: "a".repeat(501),
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path.join(".")).toBe("address.line1");
    }
  });

  it("rejects SWIFT values longer than 11 characters", () => {
    const result = CreateContactSchema.safeParse({
      name: "SIA Test",
      bankAccount: {
        iban: "LV80BANK0000435195001",
        swift: "ABCDEFGHIJKL",
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path.join(".")).toBe("bankAccount.swift");
    }
  });
});
