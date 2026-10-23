import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db/database.js';
import { AppError } from './auth.js';

interface ColumnProfile {
  colIndex: number;
  originalName: string;
  safeName: string;
  detectedType: 'number' | 'date' | 'category' | 'text';
  missingCount: number;
  typeRule: string;
}

interface ParseResult {
  rowCount: number;
  columns: ColumnProfile[];
  badRows: Array<{ rowNumber: number; reason: string }>;
  invalidCells: Array<{ rowNumber: number; colIndex: number; rawValue: string; reason: string }>;
}

// Determines column type using the 90% rule for numbers/dates, <=20 distinct or <5% for category
function guessColumnType(values: string[], totalRows: number): { type: ColumnProfile['detectedType']; rule: string } {
  const nonBlank = values.filter(v => v.trim() !== '');
  if (nonBlank.length === 0) return { type: 'text', rule: 'All values blank' };

  let numberCount = 0;
  let dateCount = 0;
  const distinctValues = new Set<string>();

  for (const v of nonBlank) {
    const trimmed = v.trim();
    distinctValues.add(trimmed.toLowerCase());

    if (trimmed !== '' && !isNaN(Number(trimmed)) && trimmed !== '') {
      numberCount++;
    }

    if (isValidDate(trimmed)) {
      dateCount++;
    }
  }

  const ratio = nonBlank.length;
  if (numberCount / ratio >= 0.9) {
    return { type: 'number', rule: `${numberCount}/${ratio} values (${Math.round(numberCount / ratio * 100)}%) parsed as numbers (>=90% threshold)` };
  }
  if (dateCount / ratio >= 0.9) {
    return { type: 'date', rule: `${dateCount}/${ratio} values (${Math.round(dateCount / ratio * 100)}%) parsed as dates (>=90% threshold)` };
  }
  if (distinctValues.size <= 20 || distinctValues.size < totalRows * 0.05) {
    return { type: 'category', rule: `${distinctValues.size} distinct values (<=20 or <5% of ${totalRows} rows)` };
  }
  return { type: 'text', rule: 'Did not meet number/date/category thresholds' };
}

function isValidDate(value: string): boolean {
  if (!value || value.trim() === '') return false;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return false;
  const d = new Date(trimmed);
  return !isNaN(d.getTime());
}

// Parses CSV file, profiles columns, and records every bad row and invalid cell
export function parseAndProfileCsv(filePath: string, datasetId: number, userId: number): ParseResult {
  const content = fs.readFileSync(filePath, 'utf-8');

  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: false,
    transformHeader: (h: string) => h.trim(),
  });

  if (!parsed.meta.fields || parsed.meta.fields.length === 0) {
    throw new AppError(400, 'CSV file has no columns. Please check the file format.');
  }

  const headers = parsed.meta.fields;
  const rows = parsed.data as Record<string, string>[];
  const expectedColCount = headers.length;

  const columnValues: string[][] = headers.map(() => []);
  const badRows: ParseResult['badRows'] = [];
  const invalidCells: ParseResult['invalidCells'] = [];
  const validRows: Record<string, string>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 because row 1 is headers, data starts at row 2

    // Check for wrong column count
    const rowKeys = Object.keys(row);
    if (rowKeys.length !== expectedColCount) {
      badRows.push({ rowNumber: rowNum, reason: `Expected ${expectedColCount} columns but found ${rowKeys.length}` });
      continue;
    }

    // Check if entire row is empty
    const allEmpty = headers.every(h => !row[h] || row[h].trim() === '');
    if (allEmpty) continue;

    validRows.push(row);
    headers.forEach((h, colIdx) => {
      columnValues[colIdx].push(row[h] ?? '');
    });
  }

  // Profile each column
  const columns: ColumnProfile[] = headers.map((header, idx) => {
    const values = columnValues[idx];
    const { type, rule } = guessColumnType(values, validRows.length);
    const missingCount = values.filter(v => v.trim() === '').length;

    return {
      colIndex: idx,
      originalName: header,
      safeName: `col_${idx}`,
      detectedType: type,
      missingCount,
      typeRule: rule,
    };
  });

  // Validate individual cells against detected types and record invalids
  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    const rowNum = i + 2 + badRows.filter(b => b.rowNumber <= i + 2).length;

    headers.forEach((h, colIdx) => {
      const value = row[h] ?? '';
      const trimmed = value.trim();
      if (trimmed === '') return; // Blank = missing, already counted

      const colType = columns[colIdx].detectedType;
      if (colType === 'number' && isNaN(Number(trimmed))) {
        invalidCells.push({
          rowNumber: rowNum,
          colIndex: colIdx,
          rawValue: trimmed,
          reason: `"${trimmed}" is not a valid number`,
        });
      } else if (colType === 'date' && !isValidDate(trimmed)) {
        invalidCells.push({
          rowNumber: rowNum,
          colIndex: colIdx,
          rawValue: trimmed,
          reason: `"${trimmed}" is not a valid date`,
        });
      }
    });
  }

  // Store everything in the database
  const db = getDb();
  const insertCol = db.prepare(
    `INSERT INTO dataset_columns (dataset_id, col_index, original_name, safe_name, detected_type, missing_count, type_rule)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertBadRow = db.prepare(
    `INSERT INTO bad_rows (dataset_id, row_number, reason) VALUES (?, ?, ?)`
  );
  const insertInvalidCell = db.prepare(
    `INSERT INTO invalid_cells (dataset_id, row_number, col_index, raw_value, reason) VALUES (?, ?, ?, ?, ?)`
  );

  const transaction = db.transaction(() => {
    for (const col of columns) {
      insertCol.run(datasetId, col.colIndex, col.originalName, col.safeName, col.detectedType, col.missingCount, col.typeRule);
    }
    for (const br of badRows) {
      insertBadRow.run(datasetId, br.rowNumber, br.reason);
    }
    for (const ic of invalidCells) {
      insertInvalidCell.run(datasetId, ic.rowNumber, ic.colIndex, ic.rawValue, ic.reason);
    }
    db.prepare('UPDATE datasets SET row_count = ? WHERE id = ? AND user_id = ?').run(validRows.length, datasetId, userId);
  });
  transaction();

  // Store parsed data as JSON for aggregation queries later
  const dataPath = filePath.replace('.csv', '_data.json');
  const structuredData = validRows.map((row, rowIdx) => {
    const obj: Record<string, any> = { _rowIndex: rowIdx + 2 };
    headers.forEach((h, colIdx) => {
      const val = row[h]?.trim() ?? '';
      const col = columns[colIdx];
      if (val === '') {
        obj[col.safeName] = null;
      } else if (col.detectedType === 'number') {
        const num = Number(val);
        obj[col.safeName] = isNaN(num) ? null : num;
      } else if (col.detectedType === 'date') {
        const d = new Date(val);
        obj[col.safeName] = isNaN(d.getTime()) ? null : d.toISOString();
      } else {
        obj[col.safeName] = val;
      }
    });
    return obj;
  });
  fs.writeFileSync(dataPath, JSON.stringify(structuredData));

  return { rowCount: validRows.length, columns, badRows, invalidCells };
}

// Reads stored parsed data for a dataset
export function getDatasetData(datasetId: number, userId: number): any[] {
  const db = getDb();
  const dataset = db.prepare('SELECT filename FROM datasets WHERE id = ? AND user_id = ?').get(datasetId, userId) as any;
  if (!dataset) throw new AppError(404, 'Dataset not found.');

  const uploadDir = process.env.UPLOAD_DIR || '../uploads';
  const dataPath = path.join(uploadDir, dataset.filename.replace('.csv', '_data.json'));
  if (!fs.existsSync(dataPath)) throw new AppError(404, 'Dataset data file not found.');

  return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
}

// Gets data for aggregation (can be called with just datasetId for share links)
export function getDatasetDataById(datasetId: number): any[] {
  const db = getDb();
  const dataset = db.prepare('SELECT filename FROM datasets WHERE id = ?').get(datasetId) as any;
  if (!dataset) throw new AppError(404, 'Dataset not found.');

  const uploadDir = process.env.UPLOAD_DIR || '../uploads';
  const dataPath = path.join(uploadDir, dataset.filename.replace('.csv', '_data.json'));
  if (!fs.existsSync(dataPath)) throw new AppError(404, 'Dataset data file not found.');

  return JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
}
