import { Request, Response, NextFunction } from 'express';
import { ZodType, ZodError } from 'zod';

/**
 * Express middleware that validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (typed) result.
 * On failure, returns 400 with structured validation errors.
 */
export function validate(schema: ZodType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = (result.error as ZodError).issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      res.status(400).json({
        error: {
          code: 'VAL-001',
          message: 'Validation failed',
          details: issues,
        },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
