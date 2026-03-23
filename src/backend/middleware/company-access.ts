import { Request, Response, NextFunction } from "express";

/**
 * Middleware that enforces company-level access control.
 * Checks that the authenticated user has access to the company specified in :companyId.
 * 
 * For initial launch: all authenticated users can access all companies (multi-tenant trust).
 * TODO: Implement proper company membership when user management is built:
 *   - Check users container for { userId, companyId } membership record
 *   - Cache memberships per request to avoid repeated lookups
 */
export function companyAccess(req: Request, res: Response, next: NextFunction): void {
  const companyId = req.params.companyId || req.params.id;
  if (!companyId) {
    next();
    return;
  }

  // Attach companyId to request for downstream use
  (req as any).companyId = companyId;

  // Phase 1: Trust all authenticated users (enforcement point for future RBAC)
  // Phase 2: Validate user <-> company membership from Cosmos users container
  if (!req.user) {
    res.status(401).json({ error: { code: "AUTH-001", message: "Authentication required" } });
    return;
  }

  next();
}
