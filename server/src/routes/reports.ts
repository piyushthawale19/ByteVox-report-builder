import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../services/auth.js';
import { computeMetric, computeChart, computeTable, getDistinctValues } from '../services/aggregate.js';
import { getDb } from '../db/database.js';

const router = Router();
router.use(requireAuth);

const createReportSchema = z.object({
  datasetId: z.number().int().positive(),
  title: z.string().min(1).max(200).optional(),
});

const updateReportSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  filter_json: z.string().optional(),
});

const blockSchema = z.object({
  block_type: z.enum(['metric', 'chart', 'table', 'text']),
  config_json: z.string(),
  block_order: z.number().int().min(0),
});

// Create a new report (ownership: tied to user_id)
router.post('/', validate(createReportSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const { datasetId, title } = req.body;

    const dataset = db.prepare('SELECT id FROM datasets WHERE id = ? AND user_id = ?').get(datasetId, req.userId!);
    if (!dataset) throw new AppError(404, 'Dataset not found.');

    const result = db.prepare(
      'INSERT INTO reports (user_id, dataset_id, title) VALUES (?, ?, ?)'
    ).run(req.userId!, datasetId, title || 'Untitled Report');

    res.status(201).json({ id: Number(result.lastInsertRowid) });
  } catch (err) {
    next(err);
  }
});

// List user's reports (ownership enforced)
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const reports = db.prepare(
      `SELECT r.id, r.title, r.dataset_id, r.created_at, r.updated_at, d.name as dataset_name
       FROM reports r JOIN datasets d ON r.dataset_id = d.id
       WHERE r.user_id = ? ORDER BY r.updated_at DESC`
    ).all(req.userId!);
    res.json({ reports });
  } catch (err) {
    next(err);
  }
});

// Get a single report with blocks (ownership enforced)
router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError(400, 'Invalid report ID.');

    const report = db.prepare(
      `SELECT r.*, d.name as dataset_name
       FROM reports r JOIN datasets d ON r.dataset_id = d.id
       WHERE r.id = ? AND r.user_id = ?`
    ).get(id, req.userId!) as any;
    if (!report) throw new AppError(404, 'Report not found.');

    const blocks = db.prepare(
      'SELECT id, block_type, config_json, block_order FROM report_blocks WHERE report_id = ? ORDER BY block_order'
    ).all(id);

    const columns = db.prepare(
      'SELECT col_index, original_name, safe_name, detected_type, missing_count FROM dataset_columns WHERE dataset_id = ? ORDER BY col_index'
    ).all(report.dataset_id);

    res.json({ ...report, blocks, columns });
  } catch (err) {
    next(err);
  }
});

// Update report title or filter (ownership enforced)
router.patch('/:id', validate(updateReportSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);

    const report = db.prepare('SELECT id FROM reports WHERE id = ? AND user_id = ?').get(id, req.userId!);
    if (!report) throw new AppError(404, 'Report not found.');

    if (req.body.title) {
      db.prepare('UPDATE reports SET title = ?, updated_at = datetime("now") WHERE id = ?').run(req.body.title, id);
    }
    if (req.body.filter_json !== undefined) {
      db.prepare('UPDATE reports SET filter_json = ?, updated_at = datetime("now") WHERE id = ?').run(req.body.filter_json, id);
    }

    res.json({ message: 'Report updated.' });
  } catch (err) {
    next(err);
  }
});

// Delete a report (ownership enforced)
router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);

    const result = db.prepare('DELETE FROM reports WHERE id = ? AND user_id = ?').run(id, req.userId!);
    if (result.changes === 0) throw new AppError(404, 'Report not found.');

    res.json({ message: 'Report deleted.' });
  } catch (err) {
    next(err);
  }
});

// Add a block to a report
router.post('/:id/blocks', validate(blockSchema), (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const reportId = parseInt(req.params.id, 10);

    const report = db.prepare('SELECT id FROM reports WHERE id = ? AND user_id = ?').get(reportId, req.userId!);
    if (!report) throw new AppError(404, 'Report not found.');

    const result = db.prepare(
      'INSERT INTO report_blocks (report_id, block_type, config_json, block_order) VALUES (?, ?, ?, ?)'
    ).run(reportId, req.body.block_type, req.body.config_json, req.body.block_order);

    db.prepare('UPDATE reports SET updated_at = datetime("now") WHERE id = ?').run(reportId);

    res.status(201).json({ id: Number(result.lastInsertRowid) });
  } catch (err) {
    next(err);
  }
});

// Update a block
router.patch('/:id/blocks/:blockId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const reportId = parseInt(req.params.id, 10);
    const blockId = parseInt(req.params.blockId, 10);

    const report = db.prepare('SELECT id FROM reports WHERE id = ? AND user_id = ?').get(reportId, req.userId!);
    if (!report) throw new AppError(404, 'Report not found.');

    if (req.body.config_json) {
      db.prepare('UPDATE report_blocks SET config_json = ? WHERE id = ? AND report_id = ?')
        .run(req.body.config_json, blockId, reportId);
    }
    if (req.body.block_order !== undefined) {
      db.prepare('UPDATE report_blocks SET block_order = ? WHERE id = ? AND report_id = ?')
        .run(req.body.block_order, blockId, reportId);
    }

    db.prepare('UPDATE reports SET updated_at = datetime("now") WHERE id = ?').run(reportId);
    res.json({ message: 'Block updated.' });
  } catch (err) {
    next(err);
  }
});

// Delete a block
router.delete('/:id/blocks/:blockId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const reportId = parseInt(req.params.id, 10);
    const blockId = parseInt(req.params.blockId, 10);

    const report = db.prepare('SELECT id FROM reports WHERE id = ? AND user_id = ?').get(reportId, req.userId!);
    if (!report) throw new AppError(404, 'Report not found.');

    db.prepare('DELETE FROM report_blocks WHERE id = ? AND report_id = ?').run(blockId, reportId);
    db.prepare('UPDATE reports SET updated_at = datetime("now") WHERE id = ?').run(reportId);

    res.json({ message: 'Block deleted.' });
  } catch (err) {
    next(err);
  }
});

// Reorder blocks
router.put('/:id/blocks/reorder', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const reportId = parseInt(req.params.id, 10);

    const report = db.prepare('SELECT id FROM reports WHERE id = ? AND user_id = ?').get(reportId, req.userId!);
    if (!report) throw new AppError(404, 'Report not found.');

    const { blockIds } = req.body;
    if (!Array.isArray(blockIds)) throw new AppError(400, 'blockIds must be an array.');

    const update = db.prepare('UPDATE report_blocks SET block_order = ? WHERE id = ? AND report_id = ?');
    const transaction = db.transaction(() => {
      blockIds.forEach((id: number, index: number) => {
        update.run(index, id, reportId);
      });
    });
    transaction();

    db.prepare('UPDATE reports SET updated_at = datetime("now") WHERE id = ?').run(reportId);
    res.json({ message: 'Blocks reordered.' });
  } catch (err) {
    next(err);
  }
});

// Compute a block's data (metric/chart/table with explanation)
router.post('/:id/compute', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const reportId = parseInt(req.params.id, 10);

    const report = db.prepare(
      'SELECT dataset_id, filter_json FROM reports WHERE id = ? AND user_id = ?'
    ).get(reportId, req.userId!) as any;
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

// Get distinct values for a column (for filter dropdowns)
router.get('/:id/distinct/:column', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const reportId = parseInt(req.params.id, 10);

    const report = db.prepare(
      'SELECT dataset_id FROM reports WHERE id = ? AND user_id = ?'
    ).get(reportId, req.userId!) as any;
    if (!report) throw new AppError(404, 'Report not found.');

    const values = getDistinctValues(report.dataset_id, req.params.column);
    res.json({ values });
  } catch (err) {
    next(err);
  }
});

export default router;
