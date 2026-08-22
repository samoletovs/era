import { describe, expect, it } from "vitest";
import { router } from "../../src/backend/api/router";

type Layer = {
  name: string;
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
};

type RegisteredRoute = { method: string; path: string };

function collect(stack: Layer[]): { routes: RegisteredRoute[]; middleware: string[] } {
  const routes: RegisteredRoute[] = [];
  const middleware: string[] = [];
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method: method.toUpperCase(), path: layer.route.path });
      }
    } else if (layer.handle?.stack) {
      const nested = collect(layer.handle.stack);
      routes.push(...nested.routes);
      middleware.push(...nested.middleware);
    } else {
      middleware.push(layer.name);
    }
  }
  return { routes, middleware };
}

const { routes, middleware } = collect((router as unknown as { stack: Layer[] }).stack);

function indexOf(method: string, path: string): number {
  const position = routes.findIndex((r) => r.method === method && r.path === path);
  expect(position, `${method} ${path} is not registered`).toBeGreaterThanOrEqual(0);
  return position;
}

describe("api router composition", () => {
  it("registers routes from every domain module", () => {
    const paths = new Set(routes.map((r) => `${r.method} ${r.path}`));
    for (const expected of [
      "GET /",
      "GET /register/search",
      "GET /vies/check",
      "GET /auth/me",
      "GET /companies",
      "GET /companies/:companyId/sharing",
      "GET /companies/:companyId/accounts",
      "POST /companies/:companyId/journal-entries",
      "POST /companies/:companyId/invoices",
      "GET /companies/:companyId/contacts",
      "POST /companies/:companyId/items",
      "POST /chat",
      "POST /companies/:companyId/payments",
      "GET /companies/:companyId/reports/balance-sheet",
      "GET /companies/:companyId/dashboard",
      "POST /migrate/short-names",
      "POST /feedback",
      "GET /rules",
      "GET /companies/:companyId/events",
      "GET /exchange-rates",
      "POST /companies/:companyId/periods/:period/close",
      "POST /companies/:companyId/bank-reconciliations",
      "GET /companies/:companyId/recurring-templates",
      "GET /companies/:companyId/fixed-assets",
      "POST /companies/:companyId/budgets",
      "POST /companies/:companyId/run-month-end",
      "GET /companies/:companyId/peppol/outbox",
      "GET /companies/:companyId/reports/annual/:year/approval",
      "GET /companies/:companyId/vid/submissions",
      "GET /companies/:companyId/audit/event/:eventId",
    ]) {
      expect(paths, `missing route ${expected}`).toContain(expected);
    }
  });

  it("keeps auth and idempotency middleware ahead of protected routes", () => {
    expect(middleware.slice(0, 2)).toEqual(["authMiddleware", "idempotency"]);
  });

  it("applies company access control before company-scoped routes", () => {
    // Asserts that the guard is present, not how many times it appears. The
    // previous version pinned the count at exactly 2, so adding the guard to a
    // route that was missing it FAILED the test - a test that punished fixing a
    // hole. `POST /chat` was that hole: it takes companyId from the body, matched
    // neither /companies/:companyId nor /companies/:id, and ran unguarded in front
    // of an agent holding post_journal_entry and record_payment.
    expect(
      middleware.filter((name) => name === "companyAccess").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("guards the flat /chat route, which takes its companyId from the body", () => {
    // The requirement: the body's companyId is surfaced as a param AND then
    // checked. Asserting the order encodes both halves - a shim with no guard
    // after it would leave the hole open while looking deliberate.
    const shim = middleware.indexOf("chatCompanyIdFromBody");
    expect(
      shim,
      "POST /chat must surface its body companyId for the guard to see",
    ).toBeGreaterThan(-1);
    expect(
      middleware.slice(shim + 1),
      "POST /chat must sit behind companyAccess — the agent behind it can post journal entries",
    ).toContain("companyAccess");
  });

  it("leaves the public routes reachable before the auth middleware", () => {
    const stack = (router as unknown as { stack: Layer[] }).stack;
    const authIndex = stack.findIndex((layer) => layer.name === "authMiddleware");
    const publicRoutes = collect(stack.slice(0, authIndex)).routes.map((r) => r.path);
    expect(publicRoutes).toEqual(["/", "/register/search"]);
  });

  it("matches static contact paths before the parameterised contact path", () => {
    expect(indexOf("GET", "/companies/:companyId/contacts/find")).toBeLessThan(
      indexOf("GET", "/companies/:companyId/contacts/:contactId"),
    );
  });

  it("matches the invoice upload path before the parameterised invoice path", () => {
    expect(indexOf("POST", "/companies/:companyId/invoices/upload")).toBeLessThan(
      indexOf("POST", "/companies/:companyId/invoices/:invoiceId/post"),
    );
  });

  it("matches the exchange rate list path before the base exchange rate path", () => {
    expect(indexOf("GET", "/exchange-rates/list")).toBeLessThan(indexOf("GET", "/exchange-rates"));
  });
});
