import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../services/auth.js';

// Validates request body against a Zod schema, returns 400 with details on failure
export function validate(schema: z.ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      return next(new AppError(400, messages));
    }
    req.body = result.data;
    next();
  };
}
