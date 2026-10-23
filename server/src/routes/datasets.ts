import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../services/auth.js';
import { parseAndProfileCsv } from '../services/csv.js';
import { getDb } from '../db/database.js';

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || '../uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const maxSize = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10) * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: maxSize },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb(new AppError(400, 'Only .csv files are allowed.') as any);
    }
    if (!file.mimetype.includes('csv') && !file.mimetype.includes('text')) {
      return cb(new AppError(400, 'File content does not appear to be CSV.') as any);
    }
    cb(null, true);
  },
});

router.use(requireAuth);

// Upload a CSV file
router.post('/', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError(400, 'No file uploaded.');

    const db = getDb();
    const name = req.body.name || req.file.originalname.replace('.csv', '');

    const result = db.prepare(
      'INSERT INTO datasets (user_id, name, filename) VALUES (?, ?, ?)'
    ).run(req.userId!, name, req.file.filename);

    const datasetId = Number(result.lastInsertRowid);
    const filePath = path.join(uploadDir, req.file.filename);

    try {
      const profile = parseAndProfileCsv(filePath, datasetId, req.userId!);
      res.status(201).json({ id: datasetId, name, ...profile });
    } catch (parseErr) {
      db.prepare('DELETE FROM datasets WHERE id = ?').run(datasetId);
      fs.unlinkSync(filePath);
      throw parseErr;
    }
  } catch (err) {
    next(err);
  }
});

// List user's datasets (ownership enforced: filtered by user_id)
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const datasets = db.prepare(
      'SELECT id, name, row_count, created_at FROM datasets WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.userId!);
    res.json({ datasets });
  } catch (err) {
    next(err);
  }
});

// Get dataset profile (ownership enforced: filtered by user_id)
router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError(400, 'Invalid dataset ID.');

    const dataset = db.prepare(
      'SELECT id, name, row_count, created_at FROM datasets WHERE id = ? AND user_id = ?'
    ).get(id, req.userId!);
    if (!dataset) throw new AppError(404, 'Dataset not found.');

    const columns = db.prepare(
      'SELECT col_index, original_name, safe_name, detected_type, missing_count, type_rule FROM dataset_columns WHERE dataset_id = ? ORDER BY col_index'
    ).all(id);

    const badRows = db.prepare(
      'SELECT row_number, reason FROM bad_rows WHERE dataset_id = ? ORDER BY row_number'
    ).all(id);

    const invalidCells = db.prepare(
      'SELECT row_number, col_index, raw_value, reason FROM invalid_cells WHERE dataset_id = ? ORDER BY row_number, col_index'
    ).all(id);

    res.json({ ...dataset as any, columns, badRows, invalidCells });
  } catch (err) {
    next(err);
  }
});

// Delete a dataset (ownership enforced: filtered by user_id)
router.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw new AppError(400, 'Invalid dataset ID.');

    const dataset = db.prepare(
      'SELECT filename FROM datasets WHERE id = ? AND user_id = ?'
    ).get(id, req.userId!) as any;
    if (!dataset) throw new AppError(404, 'Dataset not found.');

    db.prepare('DELETE FROM datasets WHERE id = ? AND user_id = ?').run(id, req.userId!);

    const filePath = path.join(uploadDir, dataset.filename);
    const dataPath = filePath.replace('.csv', '_data.json');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);

    res.json({ message: 'Dataset deleted.' });
  } catch (err) {
    next(err);
  }
});

export default router;
