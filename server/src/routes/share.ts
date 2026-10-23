import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createShareLink, validateShareToken, revokeShareLink, getShareLinksForReport } from '../services/share.js';
import { computeMetric, computeChart, computeTable } from '../services/aggregate.js';
import { getDb } from '../db/database.js';
import { AppError } from '../services/auth.js';

const router = Router();

const createLinkSchema = z.object({
  reportId: z.number().int().positive(),
  expiresInHours: z.number().min(1).max(720).optional(),
});

// Create a share link (authenticated)
router.post('/links', requireAuth, validate(createLinkSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reportId, expiresInHours } = req.body;
    const result = createShareLink(reportId, req.userId!, expiresInHours || 24);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// List share links for a report (authenticated)
router.get('/links/:reportId', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = parseInt(req.params.reportId, 10);
    if (isNaN(reportId)) throw new AppError(400, 'Invalid report ID.');
    const links = getShareLinksForReport(reportId, req.userId!);
    res.json({ links });
  } catch (err) {
    next(err);
  }
});

// Revoke a share link (authenticated)
router.post('/links/:linkId/revoke', requireAuth, (req: Request, res: Response, next: NextFunction) => {
  try {
    const linkId = parseInt(req.params.linkId, 10);
    if (isNaN(linkId)) throw new AppError(400, 'Invalid link ID.');
    revokeShareLink(linkId, req.userId!);
    res.json({ message: 'Link revoked.' });
  } catch (err) {
    next(err);
  }
});

// Public: view a shared report (no authentication required)
router.get('/public/:token', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reportId } = validateShareToken(req.params.token);

    const db = getDb();
    const report = db.prepare(
      `SELECT r.id, r.title, r.filter_json, r.dataset_id, d.name as dataset_name
       FROM reports r JOIN datasets d ON r.dataset_id = d.id
       WHERE r.id = ?`
    ).get(reportId) as any;
    if (!report) throw new AppError(404, 'Report not found.');

    const blocks = db.prepare(
      'SELECT id, block_type, config_json, block_order FROM report_blocks WHERE report_id = ? ORDER BY block_order'
    ).all(reportId);

    const columns = db.prepare(
      'SELECT col_index, original_name, safe_name, detected_type FROM dataset_columns WHERE dataset_id = ? ORDER BY col_index'
    ).all(report.dataset_id);

    res.json({ ...report, blocks, columns });
  } catch (err) {
    next(err);
  }
});

// Public: compute a block for a shared report
router.post('/public/:token/compute', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reportId } = validateShareToken(req.params.token);

    const db = getDb();
    const report = db.prepare('SELECT dataset_id, filter_json FROM reports WHERE id = ?').get(reportId) as any;
    if (!report) throw new AppError(404, 'Report not found.');

    const filter = JSON.parse(report.filter_json || '{}');
    const { block_type, config } = req.body;

    let result;
    switch (block_type) {
      case 'metric':
        result = computeMetric(report.dataset_id, config, filter);
        break;
      case 'chart':
        result = computeChart(report.dataset_id, config, filter);
        break;
      case 'table':
        result = computeTable(report.dataset_id, config, filter);
        break;
      case 'text':
        result = { text: config.text || '' };
        break;
      default:
        throw new AppError(400, `Unknown block type: ${block_type}`);
    }

    res.json({ result });
  } catch (err) {
    next(err);
  }
});

export default router;
