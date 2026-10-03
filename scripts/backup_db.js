/**
 * ============================================================================
 * SCRIPT: Enterprise SQLite Database Backup Utility (scripts/backup_db.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Creates an atomic, consistent point-in-time database snapshot into backups/
 *   using SQLite VACUUM INTO. Fully safe to execute under live traffic in WAL mode.
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Blueprint V3: Section AL (Production Go-Live Step 2)
 *   - Blueprint V3: Section AM (Maintenance SOP — Weekly Backup Integrity)
 *
 * PACKAGES & DEPENDENCIES:
 *   - node:fs, node:path                   : File system management
 *   - ../src/db/index.js (db)              : SQLite database instance
 *
 * USAGE:
 *   node scripts/backup_db.js
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db/index.js';

async function backupDatabase() {
  const backupDir = path.resolve('backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `hospital_backup_${timestamp}.db`);

  console.log(`📦 Initiating database snapshot to: ${backupFile}...`);
  const start = Date.now();

  try {
    db.prepare(`VACUUM INTO ?`).run(backupFile);
    const durationMs = Date.now() - start;
    const stats = fs.statSync(backupFile);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`✅ Snapshot completed in ${durationMs}ms! Size: ${sizeMb} MB`);
    console.log(`📁 Saved to: ${backupFile}`);
  } catch (err) {
    console.error(`❌ Backup failed: ${err.message}`);
    process.exit(1);
  }
}

backupDatabase();
