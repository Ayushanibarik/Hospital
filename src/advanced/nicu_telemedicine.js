/**
 * ============================================================================
 * MODULE: NICU Neonatal Care & MoHFW Telemedicine Practice Guidelines (2020)
 * FILE: src/advanced/nicu_telemedicine.js
 * ============================================================================
 * 
 * CLINICAL & LEGAL GUIDELINES:
 *   - Neonatal Intensive Care Unit (NICU):
 *     * APGAR Score Assessment (1 min, 5 min, 10 min): Appearance, Pulse, Grimace, Activity, Respiration
 *     * Kangaroo Mother Care (KMC) skin-to-skin contact for Low Birth Weight (LBW) neonates
 *     * Phototherapy tracking for Neonatal Hyperbilirubinemia
 *   - Telemedicine Practice Guidelines, 2020 (MoHFW / NMC):
 *     * Registered Medical Practitioner (RMP) state/national registration verification
 *     * Patient consent capture (Implied vs Explicit)
 *     * Drug Dispensing Lists: List O (OTC), List A (First Consult / Refill), List B (Add-on)
 *     * PROHIBITED LIST: Schedule X of D&C Act, NDPS narcotics/psychotropics, injectables, cytotoxic chemo
 * ============================================================================
 */

import { db } from '../db/index.js';
import crypto from 'node:crypto';

// Strictly prohibited drugs for telemedicine prescriptions under MoHFW Telemedicine Guidelines 2020
export const TELEMEDICINE_PROHIBITED_SUBSTANCES = [
  'MORPHINE',
  'FENTANYL',
  'PETHIDINE',
  'METHADONE',
  'KETAMINE',
  'PENTOBARBITAL',
  'AMPHETAMINE',
  'METHYLPHENIDATE',
  'BUPRENORPHINE',
  'CISPLATIN',
  'DOXORUBICIN',
  'CYCLOPHOSPHAMIDE',
  'PACLITAXEL'
];

/**
 * Record a Neonatal Intensive Care Unit (NICU) Assessment
 */
export function recordNICUAssessment(data) {
  const {
    mother_patient_id,
    neonate_id,
    birth_timestamp = new Date().toISOString(),
    gestational_age_weeks = 38.0,
    birth_weight_grams = 2800,
    apgar_1_min = 8,
    apgar_5_min = 9,
    apgar_10_min = 10,
    kmc_sessions_total_hours = 0,
    phototherapy_hours = 0,
    pediatrician_id,
    status = 'STABLE_IN_NICU'
  } = data;

  if (!mother_patient_id || !neonate_id || !pediatrician_id) {
    throw new Error('mother_patient_id, neonate_id, and pediatrician_id are required for NICU assessment');
  }

  const validStatus = ['CRITICAL_VENTILATED', 'STABLE_IN_NICU', 'STEP_DOWN_KMC', 'DISCHARGED_HEALTHY'];
  if (!validStatus.includes(status)) {
    throw new Error(`Invalid NICU status: ${status}. Valid: ${validStatus.join(', ')}`);
  }

  const assessment_id = `NICU-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO nicu_neonatal_assessments (
      assessment_id, mother_patient_id, neonate_id, birth_timestamp,
      gestational_age_weeks, birth_weight_grams, apgar_1_min,
      apgar_5_min, apgar_10_min, kmc_sessions_total_hours,
      phototherapy_hours, pediatrician_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    assessment_id,
    mother_patient_id,
    neonate_id,
    birth_timestamp,
    Number(gestational_age_weeks),
    Number(birth_weight_grams),
    Number(apgar_1_min),
    Number(apgar_5_min),
    apgar_10_min ? Number(apgar_10_min) : null,
    Number(kmc_sessions_total_hours),
    Number(phototherapy_hours),
    pediatrician_id,
    status
  );

  return {
    success: true,
    assessment_id,
    neonate_id,
    gestational_age_weeks,
    birth_weight_grams,
    apgar_score: `${apgar_1_min}/10 (1 min), ${apgar_5_min}/10 (5 min)`,
    status,
    message: `NICU Neonatal Assessment logged for neonate ${neonate_id}. APGAR: ${apgar_1_min} / ${apgar_5_min}.`
  };
}

/**
 * Log a Kangaroo Mother Care (KMC) session for LBW neonate
 */
export function logKMCSession(neonateId, additionalHours) {
  if (!neonateId || !additionalHours) {
    throw new Error('neonateId and additionalHours are required');
  }

  const neonate = db.prepare('SELECT * FROM nicu_neonatal_assessments WHERE neonate_id = ?').get(neonateId);
  if (!neonate) {
    throw new Error(`Neonate ${neonateId} not found in NICU registry`);
  }

  const updatedHours = Number((neonate.kmc_sessions_total_hours + Number(additionalHours)).toFixed(1));

  db.prepare(`
    UPDATE nicu_neonatal_assessments
    SET kmc_sessions_total_hours = ?,
        status = CASE WHEN status = 'CRITICAL_VENTILATED' THEN status ELSE 'STEP_DOWN_KMC' END
    WHERE neonate_id = ?
  `).run(updatedHours, neonateId);

  return {
    success: true,
    neonate_id: neonateId,
    cumulative_kmc_hours: updatedHours,
    message: `KMC session (+${additionalHours}h) logged. Total cumulative skin-to-skin: ${updatedHours} hours.`
  };
}

/**
 * Conduct and validate a Telemedicine Consultation under MoHFW Guidelines 2020
 */
export function recordTelemedicineConsultation(data) {
  const {
    patient_id,
    rmp_doctor_id,
    rmp_registration_number,
    mode = 'VIDEO',
    consent_type = 'IMPLIED_PATIENT_INITIATED',
    diagnosis_or_provisional,
    prescribed_medications = [],
    status = 'COMPLETED'
  } = data;

  if (!patient_id || !rmp_doctor_id || !rmp_registration_number || !diagnosis_or_provisional) {
    throw new Error('patient_id, rmp_doctor_id, rmp_registration_number, and diagnosis_or_provisional are required');
  }

  const validModes = ['VIDEO', 'AUDIO', 'TEXT_CHAT'];
  if (!validModes.includes(mode)) {
    throw new Error(`Invalid consultation mode: ${mode}. Valid: ${validModes.join(', ')}`);
  }

  const validConsents = ['IMPLIED_PATIENT_INITIATED', 'EXPLICIT_VERBAL_RECORDED', 'EXPLICIT_SMS_EMAIL'];
  if (!validConsents.includes(consent_type)) {
    throw new Error(`Invalid consent type: ${consent_type}. Valid: ${validConsents.join(', ')}`);
  }

  // Mandatory Safety Check: Screen prescribed medications against Prohibited List
  const medString = Array.isArray(prescribed_medications) 
    ? prescribed_medications.join(', ') 
    : String(prescribed_medications || '');

  const upperMeds = medString.toUpperCase();
  for (const prohibited of TELEMEDICINE_PROHIBITED_SUBSTANCES) {
    if (upperMeds.includes(prohibited)) {
      throw new Error(`STATUTORY VIOLATION (MoHFW Telemedicine Guidelines 2020): ${prohibited} is on the Prohibited List and CANNOT be prescribed via telemedicine! In-person hospital consultation required.`);
    }
  }

  const consultation_id = `TELE-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO telemedicine_consultations (
      consultation_id, patient_id, rmp_doctor_id, rmp_registration_number,
      mode, consent_type, diagnosis_or_provisional,
      prescribed_medications, prohibited_substance_screen_passed, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  stmt.run(
    consultation_id,
    patient_id,
    rmp_doctor_id,
    rmp_registration_number,
    mode,
    consent_type,
    diagnosis_or_provisional,
    medString,
    status
  );

  return {
    success: true,
    consultation_id,
    patient_id,
    rmp_registration_number,
    mode,
    consent_type,
    prohibited_substance_screen_passed: true,
    status,
    message: `Telemedicine consultation completed legally under NMC / MoHFW Guidelines 2020. Prohibited substance screening passed.`
  };
}

/**
 * Get NICU and Telemedicine Summary Metrics
 */
export function getNICUAndTelemedSummary() {
  const nicuCount = db.prepare('SELECT COUNT(*) as count FROM nicu_neonatal_assessments').get().count;
  const nicuStatus = db.prepare(`
    SELECT status, COUNT(*) as count 
    FROM nicu_neonatal_assessments 
    GROUP BY status
  `).all();

  const telemedCount = db.prepare('SELECT COUNT(*) as count FROM telemedicine_consultations').get().count;
  const telemedModes = db.prepare(`
    SELECT mode, COUNT(*) as count 
    FROM telemedicine_consultations 
    GROUP BY mode
  `).all();

  return {
    nicu_total_infants: nicuCount,
    nicu_census_by_status: nicuStatus,
    telemedicine_total_consultations: telemedCount,
    telemedicine_by_mode: telemedModes
  };
}
