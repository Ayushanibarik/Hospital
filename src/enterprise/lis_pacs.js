/**
 * ============================================================================
 * MODULE: LIS & PACS / DICOM Interoperability (src/enterprise/lis_pacs.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Diagnostic Equipment & Departmental Subsystem Integration:
 *   1. LIS (Laboratory Information System):
 *      - Direct biochemical / hematology analyzer webhook ingestion (HL7v2 ORU^R01)
 *      - Automated panic / critical value abnormal flagging
 *      - Auto-fulfillment of corresponding CPOE lab orders
 *   2. PACS (Picture Archiving and Communication System) & DICOM:
 *      - Modality Worklist (MWL) & DICOM study registration (CT, MRI, USG, X-Ray)
 *      - Radiologist structured reporting and impression sign-off
 *      - Auto-fulfillment of corresponding CPOE imaging orders
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { logDataAccess } from '../compliance/dpdp_engine.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── LIS (Laboratory Information System) ──────────────────────────────────

/**
 * Ingest clinical lab test result from analyzer or manual tech entry
 */
export function ingestLabResult({
  labOrderId = null,
  patientId,
  testCode,
  testName,
  loincCode = null,
  value,
  unit,
  referenceRange = null,
  analyzerId = 'ANALYZER-AUTO-01',
  analyzerName = 'Sysmex / Roche Cobas',
  validatedBy = null
}) {
  const resultId = genId('LIS');

  // Automated abnormal evaluation if numerical range provided (e.g. "70-100")
  let abnormalFlag = 'NORMAL';
  if (referenceRange && referenceRange.includes('-')) {
    const [minStr, maxStr] = referenceRange.split('-').map(s => parseFloat(s.trim()));
    const numVal = parseFloat(value);
    if (!isNaN(numVal) && !isNaN(minStr) && !isNaN(maxStr)) {
      if (numVal < minStr) abnormalFlag = numVal < minStr * 0.7 ? 'CRITICAL_LOW' : 'LOW';
      else if (numVal > maxStr) abnormalFlag = numVal > maxStr * 1.3 ? 'CRITICAL_HIGH' : 'HIGH';
    }
  }

  db.prepare(`
    INSERT INTO lis_results (
      result_id, lab_order_id, patient_id, test_code, test_name, loinc_code,
      value, unit, reference_range, abnormal_flag, status, analyzer_id,
      analyzer_name, validated_by, validated_at, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FINAL', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    resultId,
    labOrderId,
    patientId,
    testCode,
    testName,
    loincCode,
    value,
    unit,
    referenceRange,
    abnormalFlag,
    analyzerId,
    analyzerName,
    validatedBy || 'CHIEF_BIOCHEMIST'
  );

  // If order ID provided, mark CPOE lab order completed
  if (labOrderId) {
    db.prepare(`
      UPDATE lab_orders
      SET status = 'COMPLETED', reported_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
    `).run(labOrderId);
  }

  logDataAccess({
    userId: validatedBy || analyzerId,
    patientId,
    resourceType: 'LAB_RESULT',
    resourceId: resultId,
    action: 'INGEST_LAB_RESULT',
    accessReason: `Ingested lab result for ${testName}: ${value} ${unit}`
  });

  return {
    resultId,
    labOrderId,
    patientId,
    testName,
    value: `${value} ${unit}`,
    abnormalFlag,
    isPanicValue: abnormalFlag.startsWith('CRITICAL'),
    status: 'FINAL'
  };
}

/**
 * Fetch patient lab results
 */
export function getPatientLabResults(patientId) {
  return db.prepare(`
    SELECT * FROM lis_results
    WHERE patient_id = ?
    ORDER BY received_at DESC
  `).all(patientId);
}

// ─── PACS & DICOM Imaging ─────────────────────────────────────────────────

/**
 * Register DICOM imaging study from PACS modality (CT, MRI, X-Ray)
 */
export function registerPacsStudy({
  patientId,
  imagingOrderId = null,
  accessionNumber = null,
  studyInstanceUid = null,
  modality, // 'CT', 'MR', 'CR', 'DX', 'US'
  bodyPart,
  studyDescription = null,
  referringDoctor = null,
  numberOfSeries = 1,
  numberOfInstances = 10,
  pacsServer = 'DCM4CHEE-CENTRAL'
}) {
  const studyId = genId('PACS');
  const accNo = accessionNumber || `ACC-${Date.now().toString().slice(-6)}`;
  const uid = studyInstanceUid || `1.2.840.113619.2.${Date.now()}.${Math.floor(Math.random() * 10000)}`;

  db.prepare(`
    INSERT INTO pacs_studies (
      study_id, patient_id, imaging_order_id, accession_number, study_instance_uid,
      modality, body_part, study_date, study_description, number_of_series,
      number_of_instances, referring_doctor, report_status, pacs_server, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, 'PENDING', ?, CURRENT_TIMESTAMP)
  `).run(
    studyId,
    patientId,
    imagingOrderId || null,
    accNo,
    uid,
    modality,
    bodyPart,
    studyDescription || `${modality} of ${bodyPart}`,
    numberOfSeries,
    numberOfInstances,
    referringDoctor || null,
    pacsServer
  );

  return {
    studyId,
    accessionNumber: accNo,
    studyInstanceUid: uid,
    modality,
    reportStatus: 'PENDING'
  };
}

/**
 * Submit Radiologist Structured Report
 */
export function submitRadiologyReport({
  studyId,
  radiologist,
  reportText,
  reportImpression
}) {
  const study = db.prepare(`SELECT * FROM pacs_studies WHERE study_id = ?`).get(studyId);
  if (!study) throw new Error('PACS Study not found.');

  db.prepare(`
    UPDATE pacs_studies
    SET radiologist = ?,
        report_text = ?,
        report_impression = ?,
        report_status = 'FINAL'
    WHERE study_id = ?
  `).run(radiologist, reportText, reportImpression, studyId);

  // If order linked, mark CPOE imaging order as completed
  if (study.imaging_order_id) {
    db.prepare(`
      UPDATE imaging_orders
      SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
    `).run(study.imaging_order_id);
  }

  logDataAccess({
    userId: radiologist,
    patientId: study.patient_id,
    resourceType: 'RADIOLOGY_REPORT',
    resourceId: studyId,
    action: 'SIGN_RADIOLOGY_REPORT',
    accessReason: `Signed report for study ${study.accession_number}`
  });

  return {
    studyId,
    accessionNumber: study.accession_number,
    reportStatus: 'FINAL',
    radiologist,
    reportImpression
  };
}

/**
 * Fetch PACS studies for patient
 */
export function getPatientPacsStudies(patientId) {
  return db.prepare(`
    SELECT * FROM pacs_studies
    WHERE patient_id = ?
    ORDER BY created_at DESC
  `).all(patientId);
}
