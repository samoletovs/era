import { Router } from 'express';
import { containers } from '../../services/cosmos.js';
import { safeError } from '../../middleware/error-handler.js';
import type { ApiResponse, UserProfile } from '@shared/types';

const router = Router();

// ─── Auth ───────────────────────────────────────────────────

router.get('/auth/me', async (req, res) => {
  try {
    const userId = req.user!.id;
    let profile: UserProfile | null = null;

    try {
      const { resource } = await containers.users().item(userId, userId).read<UserProfile>();
      profile = resource ?? null;
    } catch {
      // Not found — create on first login
    }

    const now = new Date().toISOString();

    if (!profile) {
      profile = {
        id: userId,
        email: req.user!.email,
        displayName: req.user!.name,
        provider: req.user!.provider,
        companies: [],
        createdAt: now,
        lastLoginAt: now,
      };

      // Check for pending sharing invitations by email
      const pendingId = `pending:${req.user!.email.toLowerCase().trim()}`;
      try {
        const { resource: pendingProfile } = await containers
          .users()
          .item(pendingId, pendingId)
          .read<UserProfile>();
        if (pendingProfile?.companies?.length) {
          profile.companies.push(...pendingProfile.companies);
          // Remove the pending profile
          await containers.users().item(pendingId, pendingId).delete();
        }
      } catch {
        // No pending profile — normal case
      }

      await containers.users().items.upsert(profile);
    } else {
      // Update last login and potentially missing fields
      profile.lastLoginAt = now;
      if (req.user!.email && profile.email !== req.user!.email) profile.email = req.user!.email;
      if (req.user!.name && profile.displayName !== req.user!.name)
        profile.displayName = req.user!.name;
      await containers.users().items.upsert(profile);
    }

    res.json({
      data: {
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        photoUrl: profile.photoUrl,
        provider: profile.provider,
      },
    } as ApiResponse);
  } catch (err) {
    const e = safeError(err, 'AUTH_PROFILE_FAILED');
    res.status(e.status).json(e.body);
  }
});

export default router;
