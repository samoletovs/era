import { z } from 'zod';
import { GLError } from '../../services/ledger.js';
import { safeError } from '../../middleware/error-handler.js';

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const AccountsQuerySchema = z.object({
  asOf: IsoDateSchema.optional(),
});
export const InvoicesQuerySchema = z.object({
  type: z.enum(['sales', 'purchase']).optional(),
});
export const TrialBalanceQuerySchema = z.object({
  from: IsoDateSchema.optional(),
  to: IsoDateSchema.optional(),
});

export function handleGLError(err: unknown, res: import('express').Response) {
  if (err instanceof GLError) {
    res.status(400).json({ error: { code: err.code, message: err.message } });
  } else {
    {
      const e = safeError(err, 'SYS-001');
      res.status(e.status).json(e.body);
    }
  }
}
