/**
 * ============================================================================
 * MODULE: Computerized Provider Order Entry - CPOE (src/enterprise/cpoe_service.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Clinical Provider Order Entry (CPOE) with real-time Clinical Decision Support:
 *   - Inpatient medication orders with dosage, route, frequency, duration
 *   - Automatic CDS drug-drug, allergy, and LASA safety interception
 *   - Laboratory orders mapped to LOINC codes with STAT/Routine urgency
 *   - Radiology & Imaging orders (CT, MRI, Ultrasound, X-Ray)
 *   - Rapid Outpatient Prescription generation
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { runComprehensiveSafetyCheck } from './drug_safety.js';
import { logDataAccess } from '../compliance/dpdp_engine.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── Medication Order Entry ───────────────────────────────────────────────

/**
 * Place a CPOE medication order with mandatory Clinical Decision Support safety verification
 */
export function orderMedication({
  patientId,
  encounterId = null,
  admissionId = null,
  drugId,
  dose,
  doseUnit = 'mg',
  frequency = 'BD',
  route = 'ORAL',
  durationDays = 5,
  startDate = new Date().toISOString().slice(0, 10),
  instructions = null,
  orderedBy,
  icdCode = null,
  snomedCode = null,
  overrideSevereAlert = false,
  overrideReason = null
}) {
  // Fetch active medications for this patient to evaluate DDI
  const activeOrders = db.prepare(`
    SELECT drug_id FROM medication_orders
    WHERE patient_id = ? AND status = 'ACTIVE' AND (end_date IS NULL OR end_date >= DATE('now'))
  `).all(patientId);

  const activeDrugIds = activeOrders.map(o => o.drug_id);

  // Run comprehensive drug safety check
  const safetyCheck = runComprehensiveSafetyCheck({
    patientId,
    drugId,
    activeDrugIds
  });

  if (safetyCheck.hasSevereConflict && !overrideSevereAlert) {
    return {
      success: false,
      blockedByCds: true,
      message: 'Order blocked by Clinical Decision Support due to severe clinical contraindication.',
      safetyCheck
    };
  }

  const orderId = genId('ORD-MED');
  const endDate = durationDays ? new Date(new Date(startDate).getTime() + durationDays * 86400000).toISOString().slice(0, 10) : null;

  db.prepare(`
    INSERT INTO medication_orders (
      order_id, patient_id, encounter_id, admission_id, drug_id, dose, dose_unit,
      frequency, route, duration_days, start_date, end_date, instructions,
      status, ordered_by, icd_code, snomed_code, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    orderId,
    patientId,
    encounterId,
    admissionId,
    drugId,
    dose,
    doseUnit,
    frequency,
    route,
    durationDays,
    startDate,
    endDate,
    instructions,
    orderedBy,
    icdCode,
    snomedCode
  );

  // Log safety alerts into emar_safety_alerts if any warnings exist
  if (safetyCheck.alertCount > 0) {
    for (const alert of safetyCheck.alerts) {
      db.prepare(`
        INSERT INTO emar_safety_alerts (
          alert_id, medication_order_id, patient_id, alert_type, severity, description,
          overridden, overridden_by, override_reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        genId('ALT'),
        orderId,
        patientId,
        alert.type,
        alert.severity,
        alert.description || 'Clinical alert',
        overrideSevereAlert ? 1 : 0,
        overrideSevereAlert ? orderedBy : null,
        overrideSevereAlert ? overrideReason : null
      );
    }
  }

  logDataAccess({
    userId: orderedBy,
    patientId,
    resourceType: 'MEDICATION_ORDER',
    resourceId: orderId,
    action: 'CREATE_CPOE_ORDER',
    accessReason: `Ordered ${safetyCheck.drugInfo.brandName} ${dose}${doseUnit}`
  });

  return {
    success: true,
    orderId,
    patientId,
    drugInfo: safetyCheck.drugInfo,
    dose: `${dose} ${doseUnit}`,
    frequency,
    route,
    startDate,
    endDate,
    alertsOverridden: overrideSevereAlert,
    safetyAlerts: safetyCheck.alerts
  };
}

/**
 * Get active orders for a patient
 */
export function getPatientOrders(patientId) {
  return db.prepare(`
    SELECT mo.*, d.brand_name, d.generic_name, d.dosage_form, d.high_alert
    FROM medication_orders mo
    JOIN drug_master d ON mo.drug_id = d.drug_id
    WHERE mo.patient_id = ?
    ORDER BY mo.created_at DESC
  `).all(patientId);
}

// ─── Lab Orders (CPOE) ────────────────────────────────────────────────────

/**
 * Order Laboratory Investigation
 */
export function orderLabTest({
  patientId,
  encounterId = null,
  admissionId = null,
  testCode,
  testName,
  loincCode = null,
  priority = 'ROUTINE',
  clinicalIndication = null,
  specimenType = 'BLOOD',
  orderedBy
}) {
  const orderId = genId('ORD-LAB');

  db.prepare(`
    INSERT INTO lab_orders (
      order_id, patient_id, encounter_id, admission_id, test_code, test_name,
      loinc_code, priority, clinical_indication, specimen_type, status, ordered_by, ordered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ORDERED', ?, CURRENT_TIMESTAMP)
  `).run(
    orderId,
    patientId,
    encounterId,
    admissionId,
    testCode,
    testName,
    loincCode,
    priority,
    clinicalIndication,
    specimenType,
    orderedBy
  );

  return {
    orderId,
    patientId,
    testCode,
    testName,
    loincCode,
    priority,
    status: 'ORDERED'
  };
}

// ─── Imaging Orders (CPOE) ────────────────────────────────────────────────

/**
 * Order Radiology / Diagnostic Imaging Study
 */
export function orderImaging({
  patientId,
  encounterId = null,
  admissionId = null,
  modality, // 'CT', 'MRI', 'X-RAY', 'ULTRASOUND', 'MAMMOGRAM'
  bodyPart,
  clinicalIndication,
  priority = 'ROUTINE',
  orderedBy
}) {
  const orderId = genId('ORD-RAD');

  db.prepare(`
    INSERT INTO imaging_orders (
      order_id, patient_id, encounter_id, admission_id, modality, body_part,
      clinical_indication, priority, status, ordered_by, ordered_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ORDERED', ?, CURRENT_TIMESTAMP)
  `).run(
    orderId,
    patientId,
    encounterId,
    admissionId,
    modality,
    bodyPart,
    clinicalIndication,
    priority,
    orderedBy
  );

  return {
    orderId,
    patientId,
    modality,
    bodyPart,
    priority,
    status: 'ORDERED'
  };
}

// ─── OPD Rapid Prescribing ────────────────────────────────────────────────

/**
 * Create Outpatient Prescription with multiple drug line items
 */
export function createPrescription({
  patientId,
  encounterId = null,
  appointmentId = null,
  doctorId,
  diagnosisText,
  icdCode = null,
  notes = null,
  items = []
}) {
  const prescriptionId = genId('RX');

  db.prepare(`
    INSERT INTO prescriptions (
      prescription_id, patient_id, encounter_id, appointment_id, doctor_id,
      diagnosis_text, icd_code, notes, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP)
  `).run(
    prescriptionId,
    patientId,
    encounterId,
    appointmentId,
    doctorId,
    diagnosisText,
    icdCode,
    notes
  );

  const itemStmt = db.prepare(`
    INSERT INTO prescription_items (
      item_id, prescription_id, drug_id, drug_name, dose, frequency, route, duration_days, quantity, instructions
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of items) {
    itemStmt.run(
      genId('RXI'),
      prescriptionId,
      item.drugId || null,
      item.drugName,
      item.dose || '1 tab',
      item.frequency || 'BD',
      item.route || 'ORAL',
      item.durationDays || 5,
      item.quantity || 10,
      item.instructions || 'After meals'
    );
  }

  logDataAccess({
    userId: doctorId,
    patientId,
    resourceType: 'PRESCRIPTION',
    resourceId: prescriptionId,
    action: 'CREATE_PRESCRIPTION',
    accessReason: `OPD Prescription with ${items.length} items`
  });

  return {
    prescriptionId,
    patientId,
    doctorId,
    diagnosisText,
    icdCode,
    itemCount: items.length,
    status: 'ACTIVE'
  };
}

/**
 * Fetch prescription with all medication line items
 */
export function getPrescription(prescriptionId) {
  const rx = db.prepare(`SELECT * FROM prescriptions WHERE prescription_id = ?`).get(prescriptionId);
  if (!rx) return null;

  const items = db.prepare(`SELECT * FROM prescription_items WHERE prescription_id = ?`).all(prescriptionId);
  return { ...rx, items };
}
