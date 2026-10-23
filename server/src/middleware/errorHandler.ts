import { Request, Response, NextFunction } from 'express';
import { AppError } from '../services/auth.js';

// Central error handler — returns consistent JSON and never leaks stack traces
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Multer file-size errors
  if (err.message?.includes('File too large')) {
    res.status(413).json({ error: 'File is too large. Maximum size is 10 MB.' });
    return;
  }

  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'An unexpected error occurred.' });
}
