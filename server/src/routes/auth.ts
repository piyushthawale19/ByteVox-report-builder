import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createUser, loginUser, verifyToken } from '../services/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const signupSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 1000, // 1 hour, matches JWT expiry
  path: '/',
};

router.post('/signup', validate(signupSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const user = await createUser(email, password);
    const { token } = await loginUser(email, password);

    res.cookie('token', token, COOKIE_OPTIONS);
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

router.post('/login', validate(loginSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const { token, user } = await loginUser(email, password);

    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token', { path: '/' });
  res.json({ message: 'Logged out.' });
});

router.get('/me', (req: Request, res: Response) => {
  const token = req.cookies?.token;
  if (!token) {
    res.json({ user: null });
    return;
  }

  try {
    const payload = verifyToken(token);
    res.json({ user: { id: payload.userId, email: payload.email } });
  } catch {
    res.json({ user: null });
  }
});

export default router;
