import { Router } from 'express';
import { getCompany } from '../../services/company.js';
import { containers } from '../../services/cosmos.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse, UserProfile, CompanySharingEntry } from '@shared/types';

const router = Router();

// ─── Company Sharing ────────────────────────────────────────

// List users with access to this company
router.get('/companies/:companyId/sharing', async (req, res) => {
  try {
    const companyId = req.params.companyId;
    // Verify caller is owner
    const { resource: callerProfile } = await containers
      .users()
      .item(req.user!.id, req.user!.id)
      .read<UserProfile>();
    const callerRole = callerProfile?.companies?.find((c) => c.companyId === companyId)?.role;
    if (callerRole !== 'owner') {
      res.status(403).json({
        error: {
          code: 'AUTH-003',
          message: 'Only the company owner can manage sharing',
        },
      });
      return;
    }

    // Query all users who have this company in their profile
    const { resources: users } = await containers
      .users()
      .items.query<UserProfile>({
        query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(c.companies, {"companyId": @companyId}, true)',
        parameters: [{ name: '@companyId', value: companyId }],
      })
      .fetchAll();

    const entries: CompanySharingEntry[] = [];
    for (const u of users) {
      const role = u.companies.find((c) => c.companyId === companyId);
      if (role && role.role !== 'owner') {
        entries.push({
          userId: u.id,
          email: u.email,
          displayName: u.displayName,
          role: role.role as 'accountant' | 'viewer',
          sharedBy: role.sharedBy || req.user!.id,
          sharedAt: role.sharedAt || u.createdAt,
        });
      }
    }

    res.json({ data: entries } as ApiResponse);
  } catch (err) {
    const e = safeError(err, 'QUERY_FAILED');
    res.status(e.status).json(e.body);
  }
});

// Share company with a user by email
router.post('/companies/:companyId/sharing', async (req, res) => {
  try {
    const companyId = req.params.companyId;
    const { email, role } = req.body as { email?: string; role?: string };

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({
        error: { code: 'VAL-001', message: 'Valid email is required' },
      });
      return;
    }
    if (!role || !['accountant', 'viewer'].includes(role)) {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: "Role must be 'accountant' or 'viewer'",
        },
      });
      return;
    }

    // Verify caller is owner
    const { resource: callerProfile } = await containers
      .users()
      .item(req.user!.id, req.user!.id)
      .read<UserProfile>();
    const callerRole = callerProfile?.companies?.find((c) => c.companyId === companyId)?.role;
    if (callerRole !== 'owner') {
      res.status(403).json({
        error: {
          code: 'AUTH-003',
          message: 'Only the company owner can share',
        },
      });
      return;
    }

    // Get company name
    const company = await getCompany(companyId);
    if (!company) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Company not found' } });
      return;
    }

    // Find target user by email
    const { resources: matchingUsers } = await containers
      .users()
      .items.query<UserProfile>({
        query: 'SELECT * FROM c WHERE c.email = @email OFFSET 0 LIMIT 1', // eslint-disable-line era/no-cross-partition-query
        parameters: [{ name: '@email', value: email.toLowerCase().trim() }],
      })
      .fetchAll();

    const now = new Date().toISOString();
    const targetUser = matchingUsers[0];

    if (!targetUser) {
      // User hasn't logged in yet — create a placeholder profile so sharing takes effect on first login
      const placeholderProfile: UserProfile = {
        id: `pending:${email.toLowerCase().trim()}`,
        email: email.toLowerCase().trim(),
        displayName: email.split('@')[0],
        provider: 'google',
        companies: [
          {
            companyId,
            companyName: company.name,
            role: role as 'accountant' | 'viewer',
            sharedBy: req.user!.id,
            sharedAt: now,
          },
        ],
        createdAt: now,
        lastLoginAt: now,
      };
      await containers.users().items.upsert(placeholderProfile);
      res.status(201).json({ data: { email, role, status: 'invited' } } as ApiResponse);
      return;
    }

    // Don't allow sharing with yourself
    if (targetUser.id === req.user!.id) {
      res.status(400).json({
        error: { code: 'BIZ-001', message: 'Cannot share with yourself' },
      });
      return;
    }

    // Check if already shared
    const existing = targetUser.companies.find((c) => c.companyId === companyId);
    if (existing) {
      // Update role
      existing.role = role as 'accountant' | 'viewer';
      existing.sharedBy = req.user!.id;
      existing.sharedAt = now;
    } else {
      targetUser.companies.push({
        companyId,
        companyName: company.name,
        role: role as 'accountant' | 'viewer',
        sharedBy: req.user!.id,
        sharedAt: now,
      });
    }

    await containers.users().items.upsert(targetUser);
    res.status(201).json({ data: { email, role, status: 'shared' } } as ApiResponse);
  } catch (err) {
    const e = safeError(err, 'SHARE_FAILED');
    res.status(e.status).json(e.body);
  }
});

// Update sharing role
router.patch('/companies/:companyId/sharing/:userId', async (req, res) => {
  try {
    const { companyId, userId } = req.params;
    const { role } = req.body as { role?: string };

    if (!role || !['accountant', 'viewer'].includes(role)) {
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: "Role must be 'accountant' or 'viewer'",
        },
      });
      return;
    }

    // Verify caller is owner
    const { resource: callerProfile } = await containers
      .users()
      .item(req.user!.id, req.user!.id)
      .read<UserProfile>();
    const callerRole = callerProfile?.companies?.find((c) => c.companyId === companyId)?.role;
    if (callerRole !== 'owner') {
      res.status(403).json({
        error: {
          code: 'AUTH-003',
          message: 'Only the company owner can update sharing',
        },
      });
      return;
    }

    // Load target user
    const { resource: targetUser } = await containers
      .users()
      .item(userId, userId)
      .read<UserProfile>();
    if (!targetUser) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    const companyRole = targetUser.companies.find((c) => c.companyId === companyId);
    if (!companyRole || companyRole.role === 'owner') {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'No sharing entry found for this user',
        },
      });
      return;
    }

    companyRole.role = role as 'accountant' | 'viewer';
    await containers.users().items.upsert(targetUser);
    res.json({ data: { userId, role } } as ApiResponse);
  } catch (err) {
    const e = safeError(err, 'UPDATE_FAILED');
    res.status(e.status).json(e.body);
  }
});

// Remove sharing
router.delete('/companies/:companyId/sharing/:userId', async (req, res) => {
  try {
    const { companyId, userId } = req.params;

    // Verify caller is owner
    const { resource: callerProfile } = await containers
      .users()
      .item(req.user!.id, req.user!.id)
      .read<UserProfile>();
    const callerRole = callerProfile?.companies?.find((c) => c.companyId === companyId)?.role;
    if (callerRole !== 'owner') {
      res.status(403).json({
        error: {
          code: 'AUTH-003',
          message: 'Only the company owner can remove sharing',
        },
      });
      return;
    }

    // Load target user
    const { resource: targetUser } = await containers
      .users()
      .item(userId, userId)
      .read<UserProfile>();
    if (!targetUser) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }

    const idx = targetUser.companies.findIndex((c) => c.companyId === companyId);
    if (idx === -1 || targetUser.companies[idx].role === 'owner') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'No sharing entry found' },
      });
      return;
    }

    targetUser.companies.splice(idx, 1);
    await containers.users().items.upsert(targetUser);
    res.json({ data: { removed: true } } as ApiResponse);
  } catch (err) {
    const e = safeError(err, 'DELETE_FAILED');
    res.status(e.status).json(e.body);
  }
});

export default router;
