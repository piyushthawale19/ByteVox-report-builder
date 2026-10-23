import { Request, Response, NextFunction } from 'express';
import { verifyToken, AppError } from '../services/auth.js';

// Extends Express Request to carry authenticated user info
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userEmail?: string;
    }
  }
}

// Reads JWT from httpOnly cookie, verifies it, attaches userId to request
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.token;
  if (!token) {
    return next(new AppError(401, 'Authentication required. Please log in.'));
  }

  try {
    const payload = verifyToken(token);
    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  } catch (err) {
    next(err);
  }
}
