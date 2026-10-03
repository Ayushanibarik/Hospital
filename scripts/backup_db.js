import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db/index.js';

/**
 * Automated Enterprise Database Backup Utility
 * Creates a consistent point-in-time SQLite snapshot using VACUUM INTO.
 * Safe to run during live production traffic under SQLite WAL mode.
 */
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
