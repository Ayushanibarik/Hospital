/**
 * ============================================================================
 * MODULE: EHR Standards & Clinical Coding Engine (src/compliance/ehr_coding.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Adheres to the Electronic Health Record (EHR) Standards for India (MoHFW):
 *   - ICD-10/11: Standardized classification of diseases and clinical diagnoses
 *   - SNOMED-CT: Clinical health terminology (findings, procedures, body sites)
 *   - LOINC: Logical Observation Identifiers Names and Codes for Lab & Vitals
 *   - Encounter-level clinical coding mapping & validation
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── Default Clinical Code Seeds ──────────────────────────────────────────

const DEFAULT_CODES = [
  // ICD-10 Diagnosis Codes
  { code_system: 'ICD-10', code: 'E11.9', display_name: 'Type 2 diabetes mellitus without complications', category: 'Endocrine' },
  { code_system: 'ICD-10', code: 'I10', display_name: 'Essential (primary) hypertension', category: 'Circulatory' },
  { code_system: 'ICD-10', code: 'J06.9', display_name: 'Acute upper respiratory infection, unspecified', category: 'Respiratory' },
  { code_system: 'ICD-10', code: 'J18.9', display_name: 'Pneumonia, unspecified organism', category: 'Respiratory' },
  { code_system: 'ICD-10', code: 'K29.7', display_name: 'Gastritis, unspecified', category: 'Digestive' },
  { code_system: 'ICD-10', code: 'A09', display_name: 'Infectious gastroenteritis and colitis, unspecified', category: 'Infectious' },
  { code_system: 'ICD-10', code: 'B34.9', display_name: 'Viral infection, unspecified', category: 'Infectious' },
  { code_system: 'ICD-10', code: 'N39.0', display_name: 'Urinary tract infection, site not specified', category: 'Genitourinary' },
  { code_system: 'ICD-10', code: 'M54.5', display_name: 'Low back pain', category: 'Musculoskeletal' },
  { code_system: 'ICD-10', code: 'R50.9', display_name: 'Fever, unspecified', category: 'Symptoms' },

  // SNOMED-CT Clinical Terminology
  { code_system: 'SNOMED-CT', code: '38341003', display_name: 'Hypertensive disorder', category: 'Clinical finding' },
  { code_system: 'SNOMED-CT', code: '73211009', display_name: 'Diabetes mellitus', category: 'Clinical finding' },
  { code_system: 'SNOMED-CT', code: '233604007', display_name: 'Pneumonia', category: 'Clinical finding' },
  { code_system: 'SNOMED-CT', code: '80146002', display_name: 'Appendectomy', category: 'Procedure' },
  { code_system: 'SNOMED-CT', code: '268556000', display_name: 'Urine analysis (procedure)', category: 'Procedure' },
  { code_system: 'SNOMED-CT', code: '399208008', display_name: 'Chest X-ray (procedure)', category: 'Procedure' },
  { code_system: 'SNOMED-CT', code: '169230002', display_name: 'Electrocardiogram normal', category: 'Clinical finding' },

  // LOINC Laboratory and Observation Codes
  { code_system: 'LOINC', code: '718-7', display_name: 'Hemoglobin [Mass/volume] in Blood', category: 'Hematology' },
  { code_system: 'LOINC', code: '4544-3', display_name: 'Hematocrit [Volume Fraction] of Blood', category: 'Hematology' },
  { code_system: 'LOINC', code: '6690-2', display_name: 'Leukocytes [#/volume] in Blood by Automated count', category: 'Hematology' },
  { code_system: 'LOINC', code: '777-3', display_name: 'Platelets [#/volume] in Blood by Automated count', category: 'Hematology' },
  { code_system: 'LOINC', code: '1558-6', display_name: 'Fasting glucose [Mass/volume] in Serum or Plasma', category: 'Biochemistry' },
  { code_system: 'LOINC', code: '4548-4', display_name: 'HbA1c MFr Bld', category: 'Biochemistry' },
  { code_system: 'LOINC', code: '2160-0', display_name: 'Creatinine [Mass/volume] in Serum or Plasma', category: 'Biochemistry' },
  { code_system: 'LOINC', code: '8867-4', display_name: 'Heart rate', category: 'Vitals' },
  { code_system: 'LOINC', code: '8480-6', display_name: 'Systolic blood pressure', category: 'Vitals' },
  { code_system: 'LOINC', code: '8462-4', display_name: 'Diastolic blood pressure', category: 'Vitals' },
  { code_system: 'LOINC', code: '8310-5', display_name: 'Body temperature', category: 'Vitals' },
  { code_system: 'LOINC', code: '2708-6', display_name: 'Oxygen saturation in Arterial blood by Pulse oximetry', category: 'Vitals' }
];

export function seedClinicalCodes() {
  const count = db.prepare(`SELECT COUNT(*) as c FROM clinical_codes`).get().c;
  if (count === 0) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO clinical_codes (code_id, code_system, code, display_name, category)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const c of DEFAULT_CODES) {
      stmt.run(genId('CODE'), c.code_system, c.code, c.display_name, c.category);
    }
  }
}

// Auto-seed on load
try { seedClinicalCodes(); } catch (e) {}

// ─── Code Search & Verification ───────────────────────────────────────────

/**
 * Search clinical codes by query and system
 */
export function searchClinicalCodes({ query, codeSystem, category, limit = 20 }) {
  let sql = `SELECT * FROM clinical_codes WHERE is_active = 1`;
  const params = [];

  if (codeSystem) {
    sql += ` AND code_system = ?`;
    params.push(codeSystem);
  }
  if (category) {
    sql += ` AND category = ?`;
    params.push(category);
  }
  if (query) {
    sql += ` AND (code LIKE ? OR display_name LIKE ?)`;
    params.push(`%${query}%`, `%${query}%`);
  }

  sql += ` ORDER BY code_system, code LIMIT ?`;
  params.push(limit);

  return db.prepare(sql).all(...params);
}

/**
 * Record a clinical diagnosis for a patient encounter
 */
export function recordDiagnosis({ patientId, encounterId, codeSystem = 'ICD-10', code, displayName, diagnosisType = 'PRIMARY', codedBy }) {
  const diagnosisId = genId('DIAG');
  
  // Resolve display name if not provided
  let resolvedName = displayName;
  if (!resolvedName) {
    const codeRow = db.prepare(`SELECT display_name FROM clinical_codes WHERE code_system = ? AND code = ?`).get(codeSystem, code);
    resolvedName = codeRow ? codeRow.display_name : code;
  }

  db.prepare(`
    INSERT INTO diagnosis_codes (
      diagnosis_id, patient_id, encounter_id, code_system, code, display_name, diagnosis_type, coded_by, coded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(diagnosisId, patientId, encounterId || null, codeSystem, code, resolvedName, diagnosisType, codedBy || 'ATTENDING_PHYSICIAN');

  return {
    diagnosisId,
    patientId,
    codeSystem,
    code,
    displayName: resolvedName,
    diagnosisType,
    codedAt: new Date().toISOString()
  };
}

/**
 * Get all diagnoses recorded for a patient
 */
export function getPatientDiagnoses(patientId) {
  return db.prepare(`
    SELECT * FROM diagnosis_codes
    WHERE patient_id = ?
    ORDER BY coded_at DESC
  `).all(patientId);
}
