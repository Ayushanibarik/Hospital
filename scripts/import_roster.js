/**
 * ============================================================================
 * SCRIPT: Bulk Doctor & OPD Roster Importer (scripts/import_roster.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   CLI utility for importing doctor rosters and available consultation slots from JSON
 *   into DemoCare's database using atomic transactions.
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Blueprint V3: Section D (Demo Calendar & Roster Setup)
 *   - Blueprint V3: Section X (HMS Onboarding)
 *
 * PACKAGES & DEPENDENCIES:
 *   - node:fs, node:path                   : File reading and validation
 *   - ../src/db/index.js (db)              : SQLite database instance
 *
 * USAGE:
 *   node scripts/import_roster.js <path-to-roster.json>
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db/index.js';

async function importRoster() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log(`
Usage: node scripts/import_roster.js <path-to-roster.json>

Expected JSON structure:
[
  {
    "doctor_id": "DOC-SUM-01",
    "name": "Dr. Subrat Acharya",
    "department": "Gastroenterology",
    "qualification": "MD, DM (AIIMS)",
    "room_number": "OPD Block A - 104",
    "slots": [
      {
        "slot_id": "SLOT-SUM-101",
        "slot_start": "2026-10-05 09:00:00",
        "slot_end": "2026-10-05 09:30:00"
      }
    ]
  }
]
    `);
    process.exit(1);
  }

  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  console.log(`Importing ${content.length} doctors into database...`);

  const insertDoc = db.prepare(`
    INSERT OR REPLACE INTO doctors (doctor_id, name, department, qualification, room_number, is_available)
    VALUES (?, ?, ?, ?, ?, 1)
  `);

  const insertSlot = db.prepare(`
    INSERT OR REPLACE INTO available_slots (slot_id, doctor_id, department, slot_start, slot_end, is_booked)
    VALUES (?, ?, ?, ?, ?, 0)
  `);

  let slotCount = 0;
  db.transaction(() => {
    for (const doc of content) {
      insertDoc.run(doc.doctor_id, doc.name, doc.department, doc.qualification || 'MBBS, MD', doc.room_number || 'OPD-101');
      if (Array.isArray(doc.slots)) {
        for (const s of doc.slots) {
          insertSlot.run(s.slot_id, doc.doctor_id, doc.department, s.slot_start, s.slot_end);
          slotCount++;
        }
      }
    }
  })();

  console.log(`✅ Success! Imported ${content.length} doctors and ${slotCount} slots.`);
}

importRoster().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
