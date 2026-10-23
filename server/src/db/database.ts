import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dbInstance: Database.Database | null = null;

// Returns a singleton DB connection. In tests, call initDb with ':memory:'.
export function initDb(dbPath?: string): Database.Database {
  const resolvedPath = dbPath || path.join(__dirname, '../../data/bytevox.db');

  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new Database(resolvedPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  createTables(dbInstance);
  return dbInstance;
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password    TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS datasets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      filename    TEXT    NOT NULL,
      row_count   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dataset_columns (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id    INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      col_index     INTEGER NOT NULL,
      original_name TEXT    NOT NULL,
      safe_name     TEXT    NOT NULL,
      detected_type TEXT    NOT NULL CHECK(detected_type IN ('number','date','category','text')),
      missing_count INTEGER NOT NULL DEFAULT 0,
      type_rule     TEXT    NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS bad_rows (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id  INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      row_number  INTEGER NOT NULL,
      reason      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invalid_cells (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id  INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      row_number  INTEGER NOT NULL,
      col_index   INTEGER NOT NULL,
      raw_value   TEXT    NOT NULL,
      reason      TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dataset_id  INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
      title       TEXT    NOT NULL DEFAULT 'Untitled Report',
      filter_json TEXT    NOT NULL DEFAULT '{}',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS report_blocks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id   INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      block_order INTEGER NOT NULL,
      block_type  TEXT    NOT NULL CHECK(block_type IN ('metric','chart','table','text')),
      config_json TEXT    NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS share_links (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id     INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      token_hash    TEXT    NOT NULL UNIQUE,
      expires_at    TEXT    NOT NULL,
      revoked_at    TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_datasets_user ON datasets(user_id);
    CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id);
    CREATE INDEX IF NOT EXISTS idx_report_blocks_report ON report_blocks(report_id);
    CREATE INDEX IF NOT EXISTS idx_share_links_hash ON share_links(token_hash);
    CREATE INDEX IF NOT EXISTS idx_dataset_columns_dataset ON dataset_columns(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_bad_rows_dataset ON bad_rows(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_invalid_cells_dataset ON invalid_cells(dataset_id);
  `);
}
