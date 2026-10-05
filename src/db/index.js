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

  // Load enterprise ERP schema (RBAC, compliance, clinical, SCM, FHIR)
  const enterpriseSchemaPath = path.resolve(__dirname, 'enterprise_schema.sql');
  if (fs.existsSync(enterpriseSchemaPath)) {
    const enterpriseSql = fs.readFileSync(enterpriseSchemaPath, 'utf8');
    db.exec(enterpriseSql);
  }

  try {
    db.exec(`ALTER TABLE doctors ADD COLUMN is_available INTEGER DEFAULT 1;`);
  } catch (e) {
  }

  // Add site_id and abha_number columns to patients if missing (multi-site + ABDM)
  try { db.exec(`ALTER TABLE patients ADD COLUMN site_id TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE patients ADD COLUMN abha_number TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE patients ADD COLUMN date_of_birth DATE;`); } catch (e) {}
  try { db.exec(`ALTER TABLE patients ADD COLUMN gender TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE patients ADD COLUMN blood_group TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE patients ADD COLUMN address TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE patients ADD COLUMN emergency_contact TEXT;`); } catch (e) {}

  // Seed default site if none exists
  try {
    const siteCount = db.prepare(`SELECT COUNT(*) as c FROM sites`).get().c;
    if (siteCount === 0) {
      db.prepare(`INSERT INTO sites (site_id, site_name, site_code, city, state, abdm_facility_id) VALUES (?, ?, ?, ?, ?, ?)`)
        .run('SITE-HQ', process.env.HOSPITAL_NAME || 'DemoCare Multispeciality Hospital', 'HQ', process.env.HOSPITAL_CITY || 'Mumbai', 'Maharashtra', process.env.ABDM_FACILITY_ID || 'IN-MH-MUM-00941');
    }
  } catch (e) {}

  // Seed default RBAC roles
  try {
    const roleCount = db.prepare(`SELECT COUNT(*) as c FROM roles`).get().c;
    if (roleCount === 0) {
      const roles = [
        ['ROLE-ADMIN', 'SUPER_ADMIN', 'Full system administrator', 1],
        ['ROLE-DOC', 'DOCTOR', 'Clinical physician with prescribing rights', 1],
        ['ROLE-NURSE', 'NURSE', 'Nursing staff with eMAR access', 1],
        ['ROLE-PHARMA', 'PHARMACIST', 'Pharmacy dispensing and inventory', 1],
        ['ROLE-RECEP', 'RECEPTIONIST', 'Front desk registration and scheduling', 1],
        ['ROLE-BILLING', 'BILLING_OFFICER', 'Billing, TPA claims, and finance', 1],
        ['ROLE-LAB', 'LAB_TECHNICIAN', 'Laboratory operations and result entry', 1],
        ['ROLE-RAD', 'RADIOLOGIST', 'Imaging and radiology reporting', 1],
        ['ROLE-SCM', 'SCM_MANAGER', 'Supply chain and inventory management', 1],
        ['ROLE-QA', 'QUALITY_OFFICER', 'NABH quality metrics and compliance', 1],
        ['ROLE-MGMT', 'MANAGEMENT', 'C-suite dashboards and reporting', 1]
      ];
      const stmt = db.prepare(`INSERT OR IGNORE INTO roles (role_id, role_name, description, is_system_role) VALUES (?, ?, ?, ?)`);
      for (const r of roles) stmt.run(...r);
    }
  } catch (e) {}

  return db;
}

export default db;
