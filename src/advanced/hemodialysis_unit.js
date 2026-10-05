/**
 * ============================================================================
 * MODULE: Hemodialysis Unit, Dialyzer Reprocessing & ISO 23500 RO Water
 * FILE: src/advanced/hemodialysis_unit.js
 * ============================================================================
 * 
 * CLINICAL & REGULATORY PROTOCOLS:
 *   - Serology Isolation: HBV, HCV, and HIV positive patients dialyzed on dedicated machines
 *   - Dialyzer Reprocessing (AAMI / CDC Guideline):
 *     * Strictly single-patient assignment (No sharing of dialyzers)
 *     * Minimum bundle volume (Total Cell Volume) >= 80% of baseline
 *     * Negative pressure leak test mandatory before each reuse
 *   - Water Treatment System (ISO 23500 / AAMI Dialysis Water Standard):
 *     * Total Viable Microbial Count < 100 CFU/mL (Action level 50 CFU/mL)
 *     * Bacterial Endotoxin Level < 0.25 EU/mL (Action level 0.125 EU/mL)
 * ============================================================================
 */

import { db } from '../db/index.js';
import crypto from 'node:crypto';

/**
 * Record a Hemodialysis Session
 */
export function recordDialysisSession(data) {
  const {
    patient_id,
    station_number,
    machine_id,
    serology_status = 'NON_REACTIVE',
    pre_weight_kg,
    post_weight_kg,
    ultrafiltration_volume_ml,
    blood_flow_rate_ml_min = 300,
    dialysate_flow_rate_ml_min = 500,
    heparin_dose_units = 5000,
    session_duration_hours = 4.0,
    primary_technician_id,
    nephrologist_id,
    status = 'COMPLETED'
  } = data;

  if (!patient_id || !station_number || !machine_id || !pre_weight_kg || !post_weight_kg || !primary_technician_id || !nephrologist_id) {
    throw new Error('Missing required fields for Hemodialysis session');
  }

  const validSerology = ['NON_REACTIVE', 'HEPATITIS_B_POSITIVE', 'HEPATITIS_C_POSITIVE', 'HIV_POSITIVE'];
  if (!validSerology.includes(serology_status)) {
    throw new Error(`Invalid serology status: ${serology_status}. Must be one of: ${validSerology.join(', ')}`);
  }

  // Calculate ultrafiltration volume if not specified (weight loss in kg * 1000)
  const calcUF = ultrafiltration_volume_ml || Math.max(0, Math.round((Number(pre_weight_kg) - Number(post_weight_kg)) * 1000));

  const session_id = `HD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO hemodialysis_sessions (
      session_id, patient_id, station_number, machine_id, serology_status,
      pre_weight_kg, post_weight_kg, ultrafiltration_volume_ml,
      blood_flow_rate_ml_min, dialysate_flow_rate_ml_min, heparin_dose_units,
      session_duration_hours, primary_technician_id, nephrologist_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    session_id,
    patient_id,
    station_number,
    machine_id,
    serology_status,
    Number(pre_weight_kg),
    Number(post_weight_kg),
    Number(calcUF),
    Number(blood_flow_rate_ml_min),
    Number(dialysate_flow_rate_ml_min),
    Number(heparin_dose_units),
    Number(session_duration_hours),
    primary_technician_id,
    nephrologist_id,
    status
  );

  return {
    success: true,
    session_id,
    patient_id,
    station_number,
    serology_status,
    ultrafiltration_volume_ml: calcUF,
    message: `Hemodialysis session recorded successfully on Station ${station_number}.`
  };
}

/**
 * Reprocess and validate a dialyzer for single-patient reuse
 */
export function reprocessDialyzer(data) {
  const {
    dialyzer_barcode,
    patient_id,
    reuse_cycle_count = 1,
    bundle_volume_pct = 85.0,
    pressure_leak_test_passed = 1,
    chemical_disinfectant = 'PERACETIC_ACID_4PCT',
    reprocessed_by
  } = data;

  if (!dialyzer_barcode || !patient_id || !reprocessed_by) {
    throw new Error('dialyzer_barcode, patient_id, and reprocessed_by are required for dialyzer reprocessing');
  }

  // Cross-patient safety check: verify dialyzer has never been registered to another patient
  const previousLogs = db.prepare('SELECT DISTINCT patient_id FROM dialyzer_reuse_logs WHERE dialyzer_barcode = ?').all(dialyzer_barcode);
  if (previousLogs.length > 0 && previousLogs.some(row => row.patient_id !== patient_id)) {
    throw new Error(`CRITICAL CLINICAL HAZARD: Dialyzer ${dialyzer_barcode} was previously used by patient ${previousLogs[0].patient_id}! Dialyzer reuse across different patients is strictly illegal.`);
  }

  // Eligibility: bundle volume must be >= 80% and leak test must pass
  const isEligible = (Number(bundle_volume_pct) >= 80.0) && (pressure_leak_test_passed === 1 || pressure_leak_test_passed === true);

  const stmt = db.prepare(`
    INSERT INTO dialyzer_reuse_logs (
      dialyzer_barcode, patient_id, reuse_cycle_count,
      bundle_volume_pct, pressure_leak_test_passed,
      chemical_disinfectant, reprocessed_by, is_eligible_for_use
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    dialyzer_barcode,
    patient_id,
    Number(reuse_cycle_count),
    Number(bundle_volume_pct),
    pressure_leak_test_passed ? 1 : 0,
    chemical_disinfectant,
    reprocessed_by,
    isEligible ? 1 : 0
  );

  return {
    success: true,
    dialyzer_barcode,
    patient_id,
    reuse_cycle_count,
    bundle_volume_pct: Number(bundle_volume_pct),
    pressure_leak_test_passed: Boolean(pressure_leak_test_passed),
    is_eligible_for_use: isEligible,
    disposition: isEligible ? 'PASSED_STERILE_STORAGE' : 'CONDEMNED_DISCARD_REJECTED',
    message: isEligible
      ? `Dialyzer ${dialyzer_barcode} reprocessed successfully (Cycle ${reuse_cycle_count}, Volume: ${bundle_volume_pct}%).`
      : `Dialyzer ${dialyzer_barcode} failed reuse criteria (Volume <80% or leak detected). Tagged for disposal.`
  };
}

/**
 * Record and audit ISO 23500 RO Plant Water Testing
 */
export function recordROWaterTest(data) {
  const {
    sampling_point,
    microbial_cfu_ml,
    endotoxin_eu_ml,
    conductivity_us_cm = 15.0,
    tested_by
  } = data;

  if (!sampling_point || microbial_cfu_ml === undefined || endotoxin_eu_ml === undefined || !tested_by) {
    throw new Error('sampling_point, microbial_cfu_ml, endotoxin_eu_ml, and tested_by are required');
  }

  // Standards: Microbial < 100 CFU/mL, Endotoxin < 0.25 EU/mL
  const isCompliant = (Number(microbial_cfu_ml) < 100.0) && (Number(endotoxin_eu_ml) < 0.25);

  const test_id = `RO-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO ro_plant_water_tests (
      test_id, sampling_point, microbial_cfu_ml,
      endotoxin_eu_ml, conductivity_us_cm,
      is_iso23500_compliant, tested_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    test_id,
    sampling_point,
    Number(microbial_cfu_ml),
    Number(endotoxin_eu_ml),
    Number(conductivity_us_cm),
    isCompliant ? 1 : 0,
    tested_by
  );

  return {
    success: true,
    test_id,
    sampling_point,
    microbial_cfu_ml: Number(microbial_cfu_ml),
    endotoxin_eu_ml: Number(endotoxin_eu_ml),
    is_iso23500_compliant: isCompliant,
    water_quality_status: isCompliant ? 'PASS_POTABLE_DIALYSIS_GRADE' : 'ALERT_CONTAMINATED_RO_MEMBRANE',
    message: isCompliant
      ? `RO Water sample at ${sampling_point} meets ISO 23500 hemodialysis standards.`
      : `CRITICAL ALERT: RO Water sample failed purity threshold! Chemical disinfection & filter replacement required.`
  };
}

/**
 * Summary metrics for dialysis operations
 */
export function getDialysisUnitSummary() {
  const sessionCount = db.prepare('SELECT COUNT(*) as count FROM hemodialysis_sessions').get().count;
  const serologyBreakdown = db.prepare(`
    SELECT serology_status, COUNT(*) as count 
    FROM hemodialysis_sessions 
    GROUP BY serology_status
  `).all();

  const totalDialyzersReprocessed = db.prepare('SELECT COUNT(*) as count FROM dialyzer_reuse_logs').get().count;
  const waterTests = db.prepare('SELECT * FROM ro_plant_water_tests ORDER BY tested_at DESC LIMIT 5').all();

  return {
    total_sessions_completed: sessionCount,
    serology_segregation: serologyBreakdown,
    total_dialyzers_reprocessed: totalDialyzersReprocessed,
    recent_water_quality_tests: waterTests
  };
}
