// Unit tests for the PEPPOL UBL builder and dispatcher.
// Pure-logic tests — no Cosmos, no network. Verify that:
//   • Required EN 16931 / BIS Billing 3.0 fields are present.
//   • Tax aggregation and monetary totals balance.
//   • XML escaping and validation guards behave correctly.
//   • The dispatcher writes outbox rows on both success and failure.

import { describe, expect, it } from "vitest";

import type { Company, Contact, Invoice } from "../../src/shared/types/entities";
import {
  buildPeppolInvoiceXml,
  buildTaxSubtotals,
  escapeXml,
  PeppolBuildError,
  vatCategoryCode,
  type PeppolBuildOptions,
  type PeppolParty,
} from "../../src/backend/services/peppol/ubl-builder";
import {
  AccessPointError,
  MockAccessPoint,
  NoOpAccessPoint,
} from "../../src/backend/services/peppol/access-point";
import {
  companyToPeppolParty,
  contactToPeppolParty,
  deriveLvEndpoint,
  dispatchInvoice,
} from "../../src/backend/services/peppol/dispatcher";

// ─── Fixtures ────────────────────────────────────────────────

const samplePartySupplier: PeppolParty = {
  endpoint: { schemeID: "0218", value: "40003123456" },
  identification: { schemeID: "0218", value: "40003123456" },
  name: "Acme SIA",
  postalAddress: {
    streetName: "Brivibas iela 1",
    cityName: "Riga",
    postalZone: "LV-1010",
    countryCode: "LV",
  },
  taxScheme: { vatNumber: "LV40003123456" },
  legalEntity: {
    registrationName: "Acme SIA",
    companyID: { schemeID: "0218", value: "40003123456" },
  },
};

const samplePartyCustomer: PeppolParty = {
  endpoint: { schemeID: "0218", value: "40003998877" },
  name: "Beta Ltd",
  postalAddress: {
    streetName: "Stabu iela 5",
    cityName: "Riga",
    postalZone: "LV-1011",
    countryCode: "LV",
  },
  taxScheme: { vatNumber: "LV40003998877" },
  legalEntity: { registrationName: "Beta Ltd" },
};

function buildSampleOptions(overrides: Partial<PeppolBuildOptions> = {}): PeppolBuildOptions {
  const base: PeppolBuildOptions = {
    invoice: {
      invoiceNumber: "INV-00042",
      type: "sales",
      date: "2026-05-10",
      dueDate: "2026-06-09",
      currency: "EUR",
      subtotal: 200,
      vatAmount: 42,
      total: 242,
      lines: [
        {
          description: "Consulting hours — May 2026",
          quantity: 10,
          unitPrice: 20,
          vatRate: 21,
          vatAmount: 42,
          lineTotal: 242,
          accountCode: "5120",
        },
      ],
    },
    supplier: samplePartySupplier,
    customer: samplePartyCustomer,
    paymentMeans: {
      account: { iban: "LV80HABA0001234567890", bic: "HABALV22", name: "Acme operating" },
      paymentID: "INV-00042",
    },
  };
  return {
    ...base,
    ...overrides,
    invoice: { ...base.invoice, ...(overrides.invoice ?? {}) },
  };
}

// ─── Tax category mapping ───────────────────────────────────

describe("vatCategoryCode", () => {
  it("returns 'S' for any positive rate", () => {
    expect(vatCategoryCode(21)).toBe("S");
    expect(vatCategoryCode(12)).toBe("S");
    expect(vatCategoryCode(5)).toBe("S");
    expect(vatCategoryCode(0.5)).toBe("S");
  });

  it("returns 'Z' for zero rate", () => {
    expect(vatCategoryCode(0)).toBe("Z");
  });
});

// ─── Tax subtotal aggregation ───────────────────────────────

describe("buildTaxSubtotals", () => {
  it("aggregates lines by (category, percent)", () => {
    const subtotals = buildTaxSubtotals([
      { description: "A", quantity: 1, unitPrice: 100, vatRate: 21, vatAmount: 21, lineTotal: 121, accountCode: "5120" },
      { description: "B", quantity: 2, unitPrice: 50, vatRate: 21, vatAmount: 21, lineTotal: 121, accountCode: "5120" },
      { description: "C", quantity: 1, unitPrice: 50, vatRate: 12, vatAmount: 6, lineTotal: 56, accountCode: "5120" },
      { description: "D", quantity: 1, unitPrice: 30, vatRate: 0, vatAmount: 0, lineTotal: 30, accountCode: "5120" },
    ]);
    expect(subtotals.length).toBe(3);
    const standard21 = subtotals.find((s) => s.percent === 21);
    expect(standard21?.taxableAmount).toBeCloseTo(200, 2);
    expect(standard21?.taxAmount).toBeCloseTo(42, 2);
    const standard12 = subtotals.find((s) => s.percent === 12);
    expect(standard12?.taxableAmount).toBeCloseTo(50, 2);
    const zero = subtotals.find((s) => s.percent === 0);
    expect(zero?.category).toBe("Z");
    expect(zero?.taxAmount).toBeCloseTo(0, 2);
  });

  it("sorts subtotals by descending percent", () => {
    const subtotals = buildTaxSubtotals([
      { description: "A", quantity: 1, unitPrice: 100, vatRate: 0, vatAmount: 0, lineTotal: 100, accountCode: "5120" },
      { description: "B", quantity: 1, unitPrice: 100, vatRate: 21, vatAmount: 21, lineTotal: 121, accountCode: "5120" },
      { description: "C", quantity: 1, unitPrice: 100, vatRate: 12, vatAmount: 12, lineTotal: 112, accountCode: "5120" },
    ]);
    expect(subtotals.map((s) => s.percent)).toEqual([21, 12, 0]);
  });
});

// ─── XML escaping ───────────────────────────────────────────

describe("escapeXml", () => {
  it("escapes XML metacharacters", () => {
    expect(escapeXml("Tom & Jerry")).toBe("Tom &amp; Jerry");
    expect(escapeXml('"foo"')).toBe("&quot;foo&quot;");
    expect(escapeXml("<a>")).toBe("&lt;a&gt;");
    expect(escapeXml("it's")).toBe("it&apos;s");
  });
});

// ─── UBL document structure ─────────────────────────────────

describe("buildPeppolInvoiceXml", () => {
  it("emits the BIS Billing 3.0 customization and profile ids", () => {
    const xml = buildPeppolInvoiceXml(buildSampleOptions());
    expect(xml).toContain(
      "urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0",
    );
    expect(xml).toContain("urn:fdc:peppol.eu:2017:poacc:billing:01:1.0");
  });

  it("includes invoice id, dates, and InvoiceTypeCode 380", () => {
    const xml = buildPeppolInvoiceXml(buildSampleOptions());
    expect(xml).toContain("<cbc:ID>INV-00042</cbc:ID>");
    expect(xml).toContain("<cbc:IssueDate>2026-05-10</cbc:IssueDate>");
    expect(xml).toContain("<cbc:DueDate>2026-06-09</cbc:DueDate>");
    expect(xml).toContain("<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>");
    expect(xml).toContain("<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>");
  });

  it("includes both endpoint identifiers under the correct scheme", () => {
    const xml = buildPeppolInvoiceXml(buildSampleOptions());
    expect(xml).toContain('<cbc:EndpointID schemeID="0218">40003123456</cbc:EndpointID>');
    expect(xml).toContain('<cbc:EndpointID schemeID="0218">40003998877</cbc:EndpointID>');
  });

  it("emits supplier and customer postal addresses with country code", () => {
    const xml = buildPeppolInvoiceXml(buildSampleOptions());
    expect(xml).toContain("<cbc:StreetName>Brivibas iela 1</cbc:StreetName>");
    expect(xml).toContain("<cbc:StreetName>Stabu iela 5</cbc:StreetName>");
    expect(xml).toContain("<cbc:IdentificationCode>LV</cbc:IdentificationCode>");
  });

  it("renders LegalMonetaryTotal correctly for a single 21% line", () => {
    const xml = buildPeppolInvoiceXml(buildSampleOptions());
    expect(xml).toContain('<cbc:LineExtensionAmount currencyID="EUR">200.00</cbc:LineExtensionAmount>');
    expect(xml).toContain('<cbc:TaxExclusiveAmount currencyID="EUR">200.00</cbc:TaxExclusiveAmount>');
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="EUR">242.00</cbc:TaxInclusiveAmount>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">242.00</cbc:PayableAmount>');
  });

  it("renders an InvoiceLine with classified tax category", () => {
    const xml = buildPeppolInvoiceXml(buildSampleOptions());
    expect(xml).toContain("<cac:InvoiceLine>");
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="C62">10</cbc:InvoicedQuantity>');
    expect(xml).toContain("<cbc:Name>Consulting hours — May 2026</cbc:Name>");
    expect(xml).toContain("<cac:ClassifiedTaxCategory>");
    expect(xml).toContain("<cbc:ID>S</cbc:ID>");
    expect(xml).toContain("<cbc:Percent>21.00</cbc:Percent>");
  });

  it("renders PaymentMeans when an account is supplied", () => {
    const xml = buildPeppolInvoiceXml(buildSampleOptions());
    expect(xml).toContain("<cac:PaymentMeans>");
    expect(xml).toContain("<cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>");
    expect(xml).toContain("<cbc:ID>LV80HABA0001234567890</cbc:ID>");
    expect(xml).toContain("<cbc:ID>HABALV22</cbc:ID>");
    expect(xml).toContain("<cbc:PaymentID>INV-00042</cbc:PaymentID>");
  });

  it("escapes XML metacharacters in user-supplied fields", () => {
    const xml = buildPeppolInvoiceXml(
      buildSampleOptions({
        invoice: {
          invoiceNumber: "INV-00042",
          type: "sales",
          date: "2026-05-10",
          dueDate: "2026-06-09",
          currency: "EUR",
          subtotal: 100,
          vatAmount: 21,
          total: 121,
          lines: [
            {
              description: "Consulting <strong>hours</strong> & travel",
              quantity: 1,
              unitPrice: 100,
              vatRate: 21,
              vatAmount: 21,
              lineTotal: 121,
              accountCode: "5120",
            },
          ],
        },
      }),
    );
    expect(xml).toContain("Consulting &lt;strong&gt;hours&lt;/strong&gt; &amp; travel");
    expect(xml).not.toContain("<strong>");
  });

  it("aggregates multiple VAT rates into separate TaxSubtotal entries", () => {
    const opts = buildSampleOptions({
      invoice: {
        invoiceNumber: "INV-MIXED",
        type: "sales",
        date: "2026-05-10",
        dueDate: "2026-06-09",
        currency: "EUR",
        subtotal: 200,
        vatAmount: 21 + 6,
        total: 200 + 21 + 6,
        lines: [
          { description: "Std", quantity: 1, unitPrice: 100, vatRate: 21, vatAmount: 21, lineTotal: 121, accountCode: "5120" },
          { description: "Reduced", quantity: 1, unitPrice: 50, vatRate: 12, vatAmount: 6, lineTotal: 56, accountCode: "5120" },
          { description: "Zero", quantity: 1, unitPrice: 50, vatRate: 0, vatAmount: 0, lineTotal: 50, accountCode: "5120" },
        ],
      },
    });
    const xml = buildPeppolInvoiceXml(opts);
    // Three TaxSubtotal blocks expected.
    const matches = xml.match(/<cac:TaxSubtotal>/g);
    expect(matches?.length).toBe(3);
    expect(xml).toContain("<cbc:Percent>21.00</cbc:Percent>");
    expect(xml).toContain("<cbc:Percent>12.00</cbc:Percent>");
    expect(xml).toContain("<cbc:Percent>0.00</cbc:Percent>");
    // Total tax = 27.
    expect(xml).toMatch(/<cbc:TaxAmount currencyID="EUR">27\.00<\/cbc:TaxAmount>/);
  });
});

// ─── Validation ─────────────────────────────────────────────

describe("buildPeppolInvoiceXml — validation", () => {
  it("rejects purchase invoices", () => {
    expect(() =>
      buildPeppolInvoiceXml(buildSampleOptions({ invoice: { ...buildSampleOptions().invoice, type: "purchase" } })),
    ).toThrowError(PeppolBuildError);
  });

  it("rejects empty line array", () => {
    expect(() =>
      buildPeppolInvoiceXml(buildSampleOptions({ invoice: { ...buildSampleOptions().invoice, lines: [] } })),
    ).toThrowError(/lines must not be empty/);
  });

  it("rejects invalid currency", () => {
    expect(() =>
      buildPeppolInvoiceXml(buildSampleOptions({ invoice: { ...buildSampleOptions().invoice, currency: "EU" } })),
    ).toThrowError(/currency/);
  });

  it("rejects missing supplier name", () => {
    const opts = buildSampleOptions();
    opts.supplier = { ...opts.supplier, name: "" };
    expect(() => buildPeppolInvoiceXml(opts)).toThrowError(/name is required/);
  });

  it("rejects invalid country code", () => {
    const opts = buildSampleOptions();
    opts.customer = {
      ...opts.customer,
      postalAddress: { ...opts.customer.postalAddress, countryCode: "LVA" },
    };
    expect(() => buildPeppolInvoiceXml(opts)).toThrowError(/Country code/);
  });
});

// ─── Endpoint derivation ────────────────────────────────────

describe("deriveLvEndpoint", () => {
  it("prefers registrationNumber under scheme 0218", () => {
    expect(deriveLvEndpoint({ registrationNumber: "40003123456", vatNumber: "LV40003123456" })).toEqual({
      schemeID: "0218",
      value: "40003123456",
    });
  });

  it("falls back to VAT number under scheme 9925", () => {
    expect(deriveLvEndpoint({ vatNumber: "LV40003998877" })).toEqual({
      schemeID: "9925",
      value: "LV40003998877",
    });
  });

  it("returns null when neither identifier is present", () => {
    expect(deriveLvEndpoint({})).toBeNull();
  });
});

// ─── Mapping helpers ────────────────────────────────────────

const sampleCompany: Company = {
  id: "co-1",
  code: "ACME",
  name: "Acme SIA",
  shortName: "Acme",
  registrationNumber: "40003123456",
  vatNumber: "LV40003123456",
  legalAddress: { line1: "Brivibas iela 1", city: "Riga", postalCode: "LV-1010", country: "LV" },
  bankAccounts: [
    { name: "Operating", iban: "LV80HABA0001234567890", swift: "HABALV22", bankName: "Swedbank", isDefault: true },
  ],
  fiscalYearStart: 1,
  currency: "EUR",
  country: "LV",
  settings: {
    isVatRegistered: true,
    vatRate: 21,
    defaultPaymentTermsDays: 30,
    invoiceNumberPrefix: "INV-",
    nextInvoiceNumber: 43,
  },
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const sampleContact: Contact = {
  id: "ct-1",
  companyId: "co-1",
  type: "customer",
  name: "Beta Ltd",
  registrationNumber: "40003998877",
  vatNumber: "LV40003998877",
  email: "billing@beta.lv",
  address: { line1: "Stabu iela 5", city: "Riga", postalCode: "LV-1011", country: "LV" },
  paymentTermsDays: 30,
  isActive: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  createdBy: "system",
};

describe("companyToPeppolParty", () => {
  it("derives endpoint and legal entity from a Latvian SIA", () => {
    const party = companyToPeppolParty(sampleCompany);
    expect(party.endpoint).toEqual({ schemeID: "0218", value: "40003123456" });
    expect(party.legalEntity.registrationName).toBe("Acme SIA");
    expect(party.taxScheme?.vatNumber).toBe("LV40003123456");
  });

  it("uses shortName for display when present", () => {
    const party = companyToPeppolParty(sampleCompany);
    expect(party.name).toBe("Acme");
  });

  it("throws when the company has no identifier", () => {
    const broken = { ...sampleCompany, registrationNumber: "", vatNumber: undefined };
    expect(() => companyToPeppolParty(broken as Company)).toThrowError(/no registrationNumber/);
  });
});

describe("contactToPeppolParty", () => {
  it("includes contact email/phone when present", () => {
    const party = contactToPeppolParty(sampleContact);
    expect(party.contact?.email).toBe("billing@beta.lv");
  });
});

// ─── AccessPoint providers ──────────────────────────────────

describe("NoOpAccessPoint", () => {
  it("throws AccessPointError with NOT_CONFIGURED", async () => {
    const ap = new NoOpAccessPoint();
    await expect(
      ap.send({ ubl: "<x/>", fromEndpoint: { schemeID: "0218", value: "1" }, toEndpoint: { schemeID: "0218", value: "2" }, correlationId: "c" }),
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });
});

describe("MockAccessPoint", () => {
  it("synthesises a deterministic message id and records the call", async () => {
    const ap = new MockAccessPoint();
    const result = await ap.send({
      ubl: "<x/>",
      fromEndpoint: { schemeID: "0218", value: "1" },
      toEndpoint: { schemeID: "0218", value: "2" },
      correlationId: "abc",
    });
    expect(result.providerMessageId).toBe("mock-abc-1");
    expect(result.provider).toBe("mock");
    expect(ap.recordsForCorrelation("abc").length).toBe(1);
  });

  it("caps the in-memory ring buffer", async () => {
    const ap = new MockAccessPoint({ maxRecords: 2 });
    for (let i = 0; i < 5; i++) {
      await ap.send({ ubl: "<x/>", fromEndpoint: { schemeID: "0218", value: "1" }, toEndpoint: { schemeID: "0218", value: "2" }, correlationId: `c${i}` });
    }
    expect(ap.drain().length).toBe(2);
  });
});

// ─── Dispatcher ─────────────────────────────────────────────

const sampleInvoice: Invoice = {
  id: "inv-1",
  companyId: "co-1",
  docType: "invoice",
  invoiceNumber: "INV-00042",
  type: "sales",
  contactId: "ct-1",
  contactName: "Beta Ltd",
  date: "2026-05-10",
  dueDate: "2026-06-09",
  lines: [
    {
      description: "Consulting hours",
      quantity: 10,
      unitPrice: 20,
      vatRate: 21,
      vatAmount: 42,
      lineTotal: 242,
      accountCode: "5120",
    },
  ],
  subtotal: 200,
  vatAmount: 42,
  total: 242,
  amountPaid: 0,
  status: "posted",
  currency: "EUR",
  documentNumber: "INV-00042",
  documentDate: "2026-05-10",
  paymentJournalEntryIds: [],
  isActive: true,
  createdAt: "2026-05-10T08:00:00Z",
  updatedAt: "2026-05-10T08:00:00Z",
  createdBy: "user-1",
};

describe("dispatchInvoice", () => {
  it("persists outbox row twice (pending → sent) on success", async () => {
    const persisted: Array<{ id: string; status: string; attempts: number }> = [];
    const ap = new MockAccessPoint();
    let counter = 0;
    const result = await dispatchInvoice(
      { invoice: sampleInvoice, company: sampleCompany, customer: sampleContact },
      {
        accessPoint: ap,
        persistOutbox: async (entry) => {
          persisted.push({ id: entry.id, status: entry.status, attempts: entry.attempts });
        },
        now: () => new Date("2026-05-10T08:00:00Z"),
        newId: () => `outbox-${++counter}`,
      },
    );
    expect(persisted).toEqual([
      { id: "outbox-1", status: "pending", attempts: 0 },
      { id: "outbox-1", status: "sent", attempts: 1 },
    ]);
    expect(result.outbox.providerMessageId).toMatch(/^mock-outbox-1-/);
    expect(result.outbox.lastError).toBeUndefined();
    expect(result.ubl).toContain("INV-00042");
  });

  it("records lastError and marks failed when AccessPoint throws", async () => {
    const persisted: Array<{ status: string; lastError?: { code: string } }> = [];
    const ap = {
      name: "broken",
      send: async () => {
        throw new AccessPointError("RATE_LIMITED", "Slow down", true);
      },
    };
    const result = await dispatchInvoice(
      { invoice: sampleInvoice, company: sampleCompany, customer: sampleContact },
      {
        accessPoint: ap,
        persistOutbox: async (entry) => {
          persisted.push({ status: entry.status, lastError: entry.lastError });
        },
      },
    );
    expect(result.outbox.status).toBe("failed");
    expect(result.outbox.lastError?.code).toBe("RATE_LIMITED");
    expect(persisted[1].lastError?.code).toBe("RATE_LIMITED");
  });

  it("maps non-AccessPointError errors to UNKNOWN", async () => {
    const ap = { name: "exploded", send: async () => { throw new Error("kaboom"); } };
    const result = await dispatchInvoice(
      { invoice: sampleInvoice, company: sampleCompany, customer: sampleContact },
      { accessPoint: ap, persistOutbox: async () => {} },
    );
    expect(result.outbox.status).toBe("failed");
    expect(result.outbox.lastError?.code).toBe("UNKNOWN");
    expect(result.outbox.lastError?.message).toBe("kaboom");
  });
});
