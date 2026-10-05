/**
 * ============================================================================
 * MODULE: Oncology Chemotherapy Daycare & Cytotoxic Safety
 * FILE: src/advanced/oncology_chemo.js
 * ============================================================================
 * 
 * CLINICAL STANDARDS:
 *   - Mosteller Body Surface Area (BSA) Formula:
 *     BSA (m²) = sqrt([Height (cm) * Weight (kg)] / 3600)
 *   - Cytotoxic Drug Safety (ISOPP / ASCO / ONS Standards):
 *     * Independent Dual Verification (Medical Oncologist + Oncology Pharmacist)
 *     * Cytotoxic drug preparation in Class II Type B2 Biological Safety Cabinet (Laminar Hood)
 *   - Chemotherapy Extravasation Emergency Protocol:
 *     * Stop infusion immediately
 *     * Retain cannula and attempt gentle aspiration of extravasated drug
 *     * Do NOT flush the line
 *     * Administer drug-specific antidote (e.g., Dexrazoxane for anthracyclines, Hyaluronidase for vinca alkaloids)
 * ============================================================================
 */

import { db } from '../db/index.js';
import crypto from 'node:crypto';

/**
 * Calculate Body Surface Area (BSA) using Mosteller formula
 */
export function calculateMostellerBSA(heightCm, weightKg) {
  const ht = Number(heightCm);
  const wt = Number(weightKg);
  if (ht <= 0 || wt <= 0) {
    throw new Error('Height and weight must be greater than zero for BSA calculation');
  }
  const bsa = Math.sqrt((ht * wt) / 3600);
  return Number(bsa.toFixed(2));
}

/**
 * Schedule / Prescribe a Chemotherapy Cycle
 */
export function scheduleChemoCycle(data) {
  const {
    patient_id,
    protocol_name,
    cycle_number = 1,
    total_cycles = 6,
    height_cm,
    weight_kg,
    oncologist_signature,
    pharmacist_signature = 'PENDING_DUAL_CHECK',
    administering_nurse_signature = 'PENDING_INFUSION',
    pre_medications = 'Ondansetron 8mg IV, Dexamethasone 12mg IV, Ranitidine 50mg IV',
    cytotoxic_drugs,
    scheduled_date = new Date().toISOString().split('T')[0],
    status = 'PRESCRIBED'
  } = data;

  if (!patient_id || !protocol_name || !height_cm || !weight_kg || !oncologist_signature || !cytotoxic_drugs) {
    throw new Error('Missing required fields for chemotherapy cycle prescription');
  }

  const calculated_bsa_m2 = calculateMostellerBSA(height_cm, weight_kg);
  const cycle_id = `CHEMO-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO chemotherapy_cycles (
      cycle_id, patient_id, protocol_name, cycle_number, total_cycles,
      height_cm, weight_kg, calculated_bsa_m2, oncologist_signature,
      pharmacist_signature, administering_nurse_signature,
      pre_medications, cytotoxic_drugs, scheduled_date, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    cycle_id,
    patient_id,
    protocol_name,
    Number(cycle_number),
    Number(total_cycles),
    Number(height_cm),
    Number(weight_kg),
    calculated_bsa_m2,
    oncologist_signature,
    pharmacist_signature,
    administering_nurse_signature,
    typeof pre_medications === 'object' ? JSON.stringify(pre_medications) : pre_medications,
    typeof cytotoxic_drugs === 'object' ? JSON.stringify(cytotoxic_drugs) : cytotoxic_drugs,
    scheduled_date,
    status
  );

  return {
    success: true,
    cycle_id,
    patient_id,
    protocol_name,
    calculated_bsa_m2,
    cycle: `${cycle_number}/${total_cycles}`,
    status,
    message: `Chemotherapy cycle scheduled. Calculated BSA: ${calculated_bsa_m2} m². Awaiting pharmacy dual verification.`
  };
}

/**
 * Perform mandatory dual-verification by Oncology Pharmacist
 */
export function dualVerifyChemoCycle(cycleId, pharmacistSignature) {
  if (!cycleId || !pharmacistSignature) {
    throw new Error('cycleId and pharmacistSignature are required for dual verification');
  }

  const cycle = db.prepare('SELECT * FROM chemotherapy_cycles WHERE cycle_id = ?').get(cycleId);
  if (!cycle) {
    throw new Error(`Chemotherapy cycle ${cycleId} not found`);
  }

  const stmt = db.prepare(`
    UPDATE chemotherapy_cycles
    SET pharmacist_signature = ?,
        status = 'VERIFIED_DUAL'
    WHERE cycle_id = ?
  `);

  stmt.run(pharmacistSignature, cycleId);

  return {
    success: true,
    cycle_id: cycleId,
    oncologist_signature: cycle.oncologist_signature,
    pharmacist_signature: pharmacistSignature,
    status: 'VERIFIED_DUAL',
    message: 'Dual clinical verification complete. Safe for laminar flow admixture & administration.'
  };
}

/**
 * Record administration by Oncology Certified Nurse
 */
export function administerChemoCycle(cycleId, nurseSignature) {
  if (!cycleId || !nurseSignature) {
    throw new Error('cycleId and nurseSignature are required for administration logging');
  }

  const cycle = db.prepare('SELECT * FROM chemotherapy_cycles WHERE cycle_id = ?').get(cycleId);
  if (!cycle) {
    throw new Error(`Chemotherapy cycle ${cycleId} not found`);
  }

  if (cycle.status !== 'VERIFIED_DUAL') {
    throw new Error(`Cannot administer chemo cycle ${cycleId}: Clinical status is ${cycle.status}. Dual pharmacist verification is mandatory prior to infusion.`);
  }

  const stmt = db.prepare(`
    UPDATE chemotherapy_cycles
    SET administering_nurse_signature = ?,
        status = 'ADMINISTERED'
    WHERE cycle_id = ?
  `);

  stmt.run(nurseSignature, cycleId);

  return {
    success: true,
    cycle_id: cycleId,
    administering_nurse_signature: nurseSignature,
    status: 'ADMINISTERED',
    message: 'Chemotherapy cycle administered successfully with cytotoxic safety precautions.'
  };
}

/**
 * Report a Chemotherapy Extravasation Emergency Incident
 */
export function reportExtravasation(data) {
  const {
    cycle_id,
    patient_id,
    drug_name,
    extravasation_grade = 'GRADE_2_VESICANT_ULCERATION',
    infusion_stopped_immediately = 1,
    cannula_retained_for_aspiration = 1,
    antidote_administered,
    reported_by
  } = data;

  if (!cycle_id || !patient_id || !drug_name || !antidote_administered || !reported_by) {
    throw new Error('Missing required fields for extravasation incident report');
  }

  const incident_id = `EXTRAV-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO chemo_extravasation_incidents (
      incident_id, cycle_id, patient_id, drug_name,
      extravasation_grade, infusion_stopped_immediately,
      cannula_retained_for_aspiration, antidote_administered,
      reported_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    incident_id,
    cycle_id,
    patient_id,
    drug_name,
    extravasation_grade,
    infusion_stopped_immediately ? 1 : 0,
    cannula_retained_for_aspiration ? 1 : 0,
    antidote_administered,
    reported_by
  );

  // Mark cycle as extravasation stopped
  db.prepare(`UPDATE chemotherapy_cycles SET status = 'EXTRAVASATION_STOPPED' WHERE cycle_id = ?`).run(cycle_id);

  return {
    success: true,
    incident_id,
    cycle_id,
    extravasation_grade,
    antidote_administered,
    message: `🚨 Chemotherapy Extravasation Emergency logged. Antidote (${antidote_administered}) administered.`
  };
}

/**
 * Get Oncology Daycare dashboard summary
 */
export function getOncologyDashboardSummary() {
  const totalCycles = db.prepare('SELECT COUNT(*) as count FROM chemotherapy_cycles').get().count;
  const statusCounts = db.prepare(`
    SELECT status, COUNT(*) as count 
    FROM chemotherapy_cycles 
    GROUP BY status
  `).all();

  const totalExtravasations = db.prepare('SELECT COUNT(*) as count FROM chemo_extravasation_incidents').get().count;
  const recentCycles = db.prepare('SELECT * FROM chemotherapy_cycles ORDER BY scheduled_date DESC LIMIT 10').all();

  return {
    total_chemo_cycles: totalCycles,
    cycles_by_status: statusCounts,
    total_extravasation_incidents: totalExtravasations,
    recent_chemo_cycles: recentCycles
  };
}
