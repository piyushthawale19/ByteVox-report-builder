import { beforeAll, afterAll } from 'vitest';
import { initDb, closeDb } from '../db/database.js';

// Each test run uses a fresh in-memory database
beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-key';
  initDb(':memory:');
});

afterAll(() => {
  closeDb();
});
