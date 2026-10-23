import crypto from 'crypto';
import { getDb } from '../db/database.js';
import { AppError } from './auth.js';

// Generates a URL-safe token and stores only the SHA-256 hash in the DB
export function createShareLink(reportId: number, userId: number, expiresInHours: number = 24): { token: string; expiresAt: string } {
  const db = getDb();

  const report = db.prepare('SELECT id FROM reports WHERE id = ? AND user_id = ?').get(reportId, userId) as any;
  if (!report) throw new AppError(404, 'Report not found.');

  const tokenBytes = crypto.randomBytes(32);
  const token = tokenBytes.toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO share_links (report_id, token_hash, expires_at) VALUES (?, ?, ?)'
  ).run(reportId, tokenHash, expiresAt);

  return { token, expiresAt };
}

// Validates a share token: checks hash match, expiry, and revocation
export function validateShareToken(token: string): { reportId: number } {
  const db = getDb();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const link = db.prepare(
    'SELECT report_id, expires_at, revoked_at FROM share_links WHERE token_hash = ?'
  ).get(tokenHash) as any;

  if (!link) throw new AppError(404, 'Link not found or invalid.');
  if (link.revoked_at) throw new AppError(410, 'This share link has been revoked.');
  if (new Date(link.expires_at) < new Date()) throw new AppError(410, 'This share link has expired.');

  return { reportId: link.report_id };
}

export function revokeShareLink(linkId: number, userId: number): void {
  const db = getDb();
  const link = db.prepare(
    `SELECT sl.id FROM share_links sl
     JOIN reports r ON sl.report_id = r.id
     WHERE sl.id = ? AND r.user_id = ?`
  ).get(linkId, userId) as any;

  if (!link) throw new AppError(404, 'Share link not found.');

  db.prepare('UPDATE share_links SET revoked_at = datetime("now") WHERE id = ?').run(linkId);
}

export function getShareLinksForReport(reportId: number, userId: number): any[] {
  const db = getDb();
  const report = db.prepare('SELECT id FROM reports WHERE id = ? AND user_id = ?').get(reportId, userId) as any;
  if (!report) throw new AppError(404, 'Report not found.');

  return db.prepare(
    `SELECT id, expires_at, revoked_at, created_at,
       CASE
         WHEN revoked_at IS NOT NULL THEN 'revoked'
         WHEN datetime(expires_at) < datetime('now') THEN 'expired'
         ELSE 'active'
       END as status
     FROM share_links WHERE report_id = ? ORDER BY created_at DESC`
  ).all(reportId);
}
