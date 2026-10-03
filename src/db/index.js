import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../../hospital.db');
export const db = new DatabaseSync(DB_PATH);

// High-Concurrency Production Tuning (WAL mode & busy timeout)
try {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
} catch (e) {}

// Initialize schema
export function initDB() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  // Safe migration for existing SQLite databases
  try {
    db.exec(`ALTER TABLE doctors ADD COLUMN is_available INTEGER DEFAULT 1;`);
  } catch (e) {
    // Column already exists
  }

  return db;
}

export default db;
