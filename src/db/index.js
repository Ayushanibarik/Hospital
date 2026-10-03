/**
 * ============================================================================
 * MODULE: Database Connection & Schema Initializer (src/db/index.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Provides the shared SQLite database connection using Node.js built-in DatabaseSync.
 *   Configures high-concurrency PRAGMAs (WAL mode, busy timeout) and initializes
 *   database tables from src/db/schema.sql.
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Blueprint V3: Section E (Data Model — Exact Fields)
 *   - Blueprint V3: Section Z (Error Handling & Idempotency)
 *
 * PACKAGES & DEPENDENCIES:
 *   - node:sqlite (DatabaseSync)           : Native fast synchronous SQLite driver
 *   - node:fs, node:path, node:url         : File system and path resolution utilities
 *
 * KEY EXPORTS:
 *   - db                                   : Shared singleton DatabaseSync instance
 *   - initDB()                             : Executes schema.sql and migrations
 *
 * SYSTEM USAGE & INTEGRATION:
 *   - Imported by all database-backed engines, seeders, adapters, and test suites.
 * ============================================================================
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../../hospital.db');
export const db = new DatabaseSync(DB_PATH);

try {
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
} catch (e) {}

export function initDB() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  try {
    db.exec(`ALTER TABLE doctors ADD COLUMN is_available INTEGER DEFAULT 1;`);
  } catch (e) {
  }

  return db;
}

export default db;
