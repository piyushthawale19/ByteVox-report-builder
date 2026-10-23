import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/database.js';

const SALT_ROUNDS = 12;

interface UserRow {
  id: number;
  email: string;
  password: string;
}

interface TokenPayload {
  userId: number;
  email: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set in environment');
  return secret;
}

// Hashes password with bcrypt (12 rounds, unique salt per password)
export async function createUser(email: string, password: string): Promise<{ id: number; email: string }> {
  const db = getDb();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as UserRow | undefined;
  if (existing) {
    throw new AppError(409, 'An account with this email already exists.');
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(email, hash);

  return { id: Number(result.lastInsertRowid), email };
}

// Verifies credentials and returns a signed JWT (1h expiry)
export async function loginUser(email: string, password: string): Promise<{ token: string; user: { id: number; email: string } }> {
  const db = getDb();
  const user = db.prepare('SELECT id, email, password FROM users WHERE email = ?').get(email) as UserRow | undefined;

  if (!user) {
    throw new AppError(401, 'Invalid email or password.');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new AppError(401, 'Invalid email or password.');
  }

  const payload: TokenPayload = { userId: user.id, email: user.email };
  const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '1h' });

  return { token, user: { id: user.id, email: user.email } };
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, getJwtSecret()) as TokenPayload;
  } catch {
    throw new AppError(401, 'Invalid or expired token.');
  }
}

// Custom error class with HTTP status code
export class AppError extends Error {
  public statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}
