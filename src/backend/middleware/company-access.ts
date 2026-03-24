import { Request, Response, NextFunction } from "express";
import { containers } from "../services/cosmos.js";
import type { UserProfile } from "@shared/types";

/**
 * Middleware that enforces company-level access control.
 * Checks that the authenticated user has access to the company specified in :companyId.
 * Attaches the user's role to the request for downstream use.
 * Viewers (read-only) are blocked from write operations (POST/PUT/PATCH/DELETE).
 */
async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { resource } = await containers
      .users()
      .item(userId, userId)
      .read<UserProfile>();
    if (resource) return resource;
  } catch {
    // Fallback query below.
  }

  try {
    const { resources } = await containers
      .users()
      .items.query<UserProfile>({
        query: "SELECT * FROM c WHERE c.id = @userId OFFSET 0 LIMIT 1",
        parameters: [{ name: "@userId", value: userId }],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function companyAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const companyId = req.params.companyId || req.params.id;
  if (!companyId) {
    next();
    return;
  }

  // Attach companyId to request for downstream use
  (req as any).companyId = companyId;

  if (!req.user) {
    res.status(401).json({
      error: { code: "AUTH-001", message: "Authentication required" },
    });
    return;
  }

  const enforceMembership = process.env.ENFORCE_COMPANY_MEMBERSHIP === "true";

  try {
    const profile = await getUserProfile(req.user.id);
    if (!profile) {
      if (enforceMembership) {
        res.status(403).json({
          error: { code: "AUTH-003", message: "Access to company denied" },
        });
        return;
      }
      console.warn(
        JSON.stringify({
          level: "warn",
          code: "AUTH-PROFILE-MISSING",
          message:
            "User profile not found; allowing access because ENFORCE_COMPANY_MEMBERSHIP is disabled",
          userId: req.user.id,
          companyId,
          requestId: (req as any).requestId,
        }),
      );
      next();
      return;
    }

    const companyRole = profile.companies?.find(
      (c) => c.companyId === companyId,
    );
    if (!companyRole) {
      if (enforceMembership) {
        res.status(403).json({
          error: { code: "AUTH-003", message: "Access to company denied" },
        });
        return;
      }
      // Allow access with owner-level permissions when membership enforcement is disabled
      (req as any).companyRole = "owner";
      next();
      return;
    }

    // Attach role to request for downstream checks
    (req as any).companyRole = companyRole.role;

    // Viewers can only read — block write operations (except sharing endpoints which check ownership themselves)
    if (companyRole.role === "viewer" && WRITE_METHODS.has(req.method)) {
      // Allow GET-like operations on routes that may use POST for complex queries (chat)
      const path = req.path.toLowerCase();
      const isReadOnlyPost =
        req.method === "POST" &&
        (path.includes("/chat") || path.includes("/parse"));
      if (!isReadOnlyPost) {
        res.status(403).json({
          error: {
            code: "AUTH-004",
            message:
              "Read-only access. Contact the company owner to request full access.",
          },
        });
        return;
      }
    }
  } catch {
    res.status(500).json({
      error: {
        code: "SYS-001",
        message: "An internal error occurred. Please try again later.",
      },
    });
    return;
  }

  next();
}
