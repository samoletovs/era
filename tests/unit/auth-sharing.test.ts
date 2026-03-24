import { describe, it, expect, vi, beforeEach } from "vitest";
import { companyAccess } from "../../src/backend/middleware/company-access";

// ─── Mock Cosmos ────────────────────────────────────────────

const mockRead = vi.fn();
const mockQuery = vi.fn();

vi.mock("../../src/backend/services/cosmos", () => ({
  containers: {
    users: () => ({
      item: () => ({
        read: mockRead,
      }),
      items: {
        query: () => ({
          fetchAll: mockQuery,
        }),
      },
    }),
  },
}));

// ─── Test Helpers ───────────────────────────────────────────

type MockReq = {
  method: string;
  path: string;
  params: Record<string, string>;
  headers: Record<string, string>;
  user?: { id: string; email: string; name: string; provider: "google" };
  companyRole?: string;
  companyId?: string;
};

type MockRes = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockRes;
  json: (payload: unknown) => MockRes;
};

function createRes(): MockRes {
  return {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

function createReq(overrides: Partial<MockReq> = {}): MockReq {
  return {
    method: "GET",
    path: "/companies/comp-1/accounts",
    params: { companyId: "comp-1" },
    headers: {},
    user: {
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      provider: "google",
    },
    ...overrides,
  };
}

function makeProfile(userId: string, companies: { companyId: string; role: string }[]) {
  return {
    id: userId,
    email: `${userId}@example.com`,
    displayName: "Test User",
    provider: "google",
    companies: companies.map((c) => ({
      companyId: c.companyId,
      companyName: "Test Company",
      role: c.role,
    })),
    createdAt: "2026-01-01T00:00:00Z",
    lastLoginAt: "2026-01-01T00:00:00Z",
  };
}

// ─── Tests ──────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("company access middleware", () => {
  it("passes through when no companyId in params", async () => {
    const req = createReq({ params: {} });
    const res = createRes();
    const next = vi.fn();

    await companyAccess(req as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 401 when no user on request", async () => {
    const req = createReq({ user: undefined });
    const res = createRes();
    const next = vi.fn();

    await companyAccess(req as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("allows owner to access company (GET)", async () => {
    const profile = makeProfile("user-1", [{ companyId: "comp-1", role: "owner" }]);
    mockRead.mockResolvedValue({ resource: profile });

    const req = createReq({ method: "GET" });
    const res = createRes();
    const next = vi.fn();

    await companyAccess(req as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect((req as any).companyRole).toBe("owner");
  });

  it("allows owner to do write operations (POST)", async () => {
    const profile = makeProfile("user-1", [{ companyId: "comp-1", role: "owner" }]);
    mockRead.mockResolvedValue({ resource: profile });

    const req = createReq({ method: "POST" });
    const res = createRes();
    const next = vi.fn();

    await companyAccess(req as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect((req as any).companyRole).toBe("owner");
  });

  it("allows accountant to do write operations", async () => {
    const profile = makeProfile("user-1", [{ companyId: "comp-1", role: "accountant" }]);
    mockRead.mockResolvedValue({ resource: profile });

    const req = createReq({ method: "POST" });
    const res = createRes();
    const next = vi.fn();

    await companyAccess(req as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect((req as any).companyRole).toBe("accountant");
  });

  it("allows viewer to read (GET)", async () => {
    const profile = makeProfile("user-1", [{ companyId: "comp-1", role: "viewer" }]);
    mockRead.mockResolvedValue({ resource: profile });

    const req = createReq({ method: "GET" });
    const res = createRes();
    const next = vi.fn();

    await companyAccess(req as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect((req as any).companyRole).toBe("viewer");
  });

  it("blocks viewer from write operations (POST)", async () => {
    const profile = makeProfile("user-1", [{ companyId: "comp-1", role: "viewer" }]);
    mockRead.mockResolvedValue({ resource: profile });

    const req = createReq({ method: "POST", path: "/companies/comp-1/invoices" });
    const res = createRes();
    const next = vi.fn();

    await companyAccess(req as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect((res.body as any).error.code).toBe("AUTH-004");
  });

  it("blocks viewer from DELETE operations", async () => {
    const profile = makeProfile("user-1", [{ companyId: "comp-1", role: "viewer" }]);
    mockRead.mockResolvedValue({ resource: profile });

    const req = createReq({ method: "DELETE", path: "/companies/comp-1/invoices/inv-1" });
    const res = createRes();
    const next = vi.fn();

    await companyAccess(req as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("blocks viewer from PATCH operations", async () => {
    const profile = makeProfile("user-1", [{ companyId: "comp-1", role: "viewer" }]);
    mockRead.mockResolvedValue({ resource: profile });

    const req = createReq({ method: "PATCH", path: "/companies/comp-1/contacts/c-1" });
    const res = createRes();
    const next = vi.fn();

    await companyAccess(req as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("allows viewer to POST on chat endpoints (read-like)", async () => {
    const profile = makeProfile("user-1", [{ companyId: "comp-1", role: "viewer" }]);
    mockRead.mockResolvedValue({ resource: profile });

    const req = createReq({ method: "POST", path: "/companies/comp-1/chat" });
    const res = createRes();
    const next = vi.fn();

    await companyAccess(req as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows access when user has no matching company and enforcement is off", async () => {
    const original = process.env.ENFORCE_COMPANY_MEMBERSHIP;
    delete process.env.ENFORCE_COMPANY_MEMBERSHIP;

    const profile = makeProfile("user-1", [{ companyId: "other-company", role: "owner" }]);
    mockRead.mockResolvedValue({ resource: profile });

    const req = createReq();
    const res = createRes();
    const next = vi.fn();

    await companyAccess(req as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect((req as any).companyRole).toBe("owner");

    process.env.ENFORCE_COMPANY_MEMBERSHIP = original;
  });

  it("denies access when user has no matching company and enforcement is on", async () => {
    const original = process.env.ENFORCE_COMPANY_MEMBERSHIP;
    process.env.ENFORCE_COMPANY_MEMBERSHIP = "true";

    const profile = makeProfile("user-1", [{ companyId: "other-company", role: "owner" }]);
    mockRead.mockResolvedValue({ resource: profile });

    const req = createReq();
    const res = createRes();
    const next = vi.fn();

    await companyAccess(req as never, res as never, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect((res.body as any).error.code).toBe("AUTH-003");

    process.env.ENFORCE_COMPANY_MEMBERSHIP = original;
  });

  it("handles multiple companies in profile correctly", async () => {
    const profile = makeProfile("user-1", [
      { companyId: "other-company", role: "owner" },
      { companyId: "comp-1", role: "viewer" },
    ]);
    mockRead.mockResolvedValue({ resource: profile });

    const req = createReq({ method: "GET" });
    const res = createRes();
    const next = vi.fn();

    await companyAccess(req as never, res as never, next);
    expect(next).toHaveBeenCalledOnce();
    expect((req as any).companyRole).toBe("viewer");
  });
});

// ─── Sharing Types ──────────────────────────────────────────

describe("sharing types", () => {
  it("UserCompanyRole includes sharing metadata fields", () => {
    const role = {
      companyId: "comp-1",
      companyName: "Test",
      role: "accountant" as const,
      sharedBy: "owner-1",
      sharedAt: "2026-01-01T00:00:00Z",
    };
    expect(role.sharedBy).toBe("owner-1");
    expect(role.sharedAt).toBeDefined();
  });

  it("CompanySharingEntry has required fields", () => {
    const entry = {
      userId: "user-2",
      email: "user2@example.com",
      displayName: "User 2",
      role: "viewer" as const,
      sharedBy: "owner-1",
      sharedAt: "2026-01-01T00:00:00Z",
    };
    expect(entry.userId).toBe("user-2");
    expect(entry.role).toBe("viewer");
  });
});
