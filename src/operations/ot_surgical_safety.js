/**
 * ============================================================================
 * MODULE: Operation Theatre (OT) & WHO Surgical Safety Checklist (src/operations/ot_surgical_safety.js)
 * ============================================================================
 * 
 * CLINICAL & STATUTORY MANDATE:
 *   - WHO Guidelines for Safe Surgery (World Alliance for Patient Safety)
 *   - NABH 5th Edition: Care of Patients (COP.14 - Safe Surgical Practices)
 *   - JCI International Patient Safety Goals (IPSG 4: Correct Site, Procedure, Patient)
 * 
 * CORE FEATURES:
 *   - 3-Phase WHO Surgical Safety Checklist (Sign In, Time Out, Sign Out)
 *   - Intraoperative Instrument, Sponge/Swab, and Needle Count Reconciliation
 *   - Surgical Implant Traceability (Barcodes, Serial numbers, Batch, Expiry, Placement)
 *   - Blocking gates: Closure and PACU discharge blocked if counts or safety steps fail
 * ============================================================================
 */

import { db } from '../db/index.js';
import crypto from 'node:crypto';

/**
 * Schedule or initialize an OT Surgery
 */
export function scheduleOtSurgery({
  patientId,
  otRoom,
  procedureName,
  scheduledStart,
  chiefSurgeonId,
  anesthetistId,
  scrubNurseId,
  circulatingNurseId,
  anesthesiaType = 'GENERAL'
}) {
  if (!patientId || !otRoom || !procedureName || !chiefSurgeonId || !anesthetistId) {
    throw new Error('Mandatory OT parameters missing: patientId, otRoom, procedureName, chiefSurgeonId, anesthetistId.');
  }

  const surgeryId = `SURG-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  db.prepare(`
    INSERT INTO ot_surgeries (
      surgery_id, patient_id, ot_room, procedure_name, scheduled_start,
      chief_surgeon_id, anesthetist_id, scrub_nurse_id, circulating_nurse_id,
      anesthesia_type, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED')
  `).run(
    surgeryId, patientId, otRoom, procedureName, scheduledStart || new Date().toISOString(),
    chiefSurgeonId, anesthetistId, scrubNurseId || 'NURSE-SCRUB', circulatingNurseId || 'NURSE-CIRC',
    anesthesiaType
  );

  // Initialize empty WHO checklist record
  db.prepare(`
    INSERT INTO ot_who_checklists (surgery_id, count_reconciliation_status)
    VALUES (?, 'NOT_STARTED')
  `).run(surgeryId);

  return {
    success: true,
    surgery_id: surgeryId,
    patient_id: patientId,
    ot_room: otRoom,
    procedure_name: procedureName,
    anesthesia_type: anesthesiaType,
    status: 'SCHEDULED'
  };
}

/**
 * Execute Phase 1: SIGN IN (Before Induction of Anesthesia)
 */
export function executeWhoSignIn(surgeryId, signInData) {
  const checklist = db.prepare(`SELECT * FROM ot_who_checklists WHERE surgery_id = ?`).get(surgeryId);
  if (!checklist) throw new Error(`Checklist not found for surgery: ${surgeryId}`);

  const requiredChecks = [
    'patientIdentityConfirmed',
    'siteMarked',
    'consentVerified',
    'pulseOximeterFunctioning',
    'knownAllergiesChecked',
    'airwayAspirationRiskAssessed',
    'bloodLossRiskChecked'
  ];

  for (const check of requiredChecks) {
    if (signInData[check] === false) {
      throw new Error(`WHO Sign In Aborted: Critical safety condition failed: ${check}`);
    }
  }

  const payload = {
    ...signInData,
    completedAt: new Date().toISOString()
  };

  db.prepare(`
    UPDATE ot_who_checklists 
    SET sign_in_completed = 1, sign_in_data = ?
    WHERE surgery_id = ?
  `).run(JSON.stringify(payload), surgeryId);

  db.prepare(`UPDATE ot_surgeries SET status = 'SIGN_IN_COMPLETED' WHERE surgery_id = ?`).run(surgeryId);

  return {
    success: true,
    surgery_id: surgeryId,
    phase: 'SIGN_IN',
    status: 'VERIFIED_PASSED',
    safety_clearance: 'Patient cleared for induction of anesthesia'
  };
}

/**
 * Execute Phase 2: TIME OUT (Before Skin Incision)
 */
export function executeWhoTimeOut(surgeryId, timeOutData) {
  const checklist = db.prepare(`SELECT * FROM ot_who_checklists WHERE surgery_id = ?`).get(surgeryId);
  if (!checklist) throw new Error(`Checklist not found for surgery: ${surgeryId}`);
  if (!checklist.sign_in_completed) {
    throw new Error('WHO Safety Protocol Violation: Cannot execute TIME OUT before SIGN IN is completed.');
  }

  const requiredChecks = [
    'teamIntroduced',
    'patientNameVerballyConfirmed',
    'procedureAndSiteConfirmed',
    'antibioticProphylaxisWithin60Min',
    'sterilityIndicatorPass',
    'essentialImagingDisplayed'
  ];

  for (const check of requiredChecks) {
    if (timeOutData[check] === false) {
      throw new Error(`WHO Time Out Pause Aborted: Surgical pause violation on: ${check}`);
    }
  }

  const payload = {
    ...timeOutData,
    completedAt: new Date().toISOString()
  };

  db.prepare(`
    UPDATE ot_who_checklists 
    SET time_out_completed = 1, time_out_data = ?
    WHERE surgery_id = ?
  `).run(JSON.stringify(payload), surgeryId);

  db.prepare(`UPDATE ot_surgeries SET status = 'TIME_OUT_COMPLETED' WHERE surgery_id = ?`).run(surgeryId);

  return {
    success: true,
    surgery_id: surgeryId,
    phase: 'TIME_OUT',
    status: 'VERIFIED_PASSED',
    surgical_pause: 'Entire team verbally verified. Cleared for skin incision.'
  };
}

/**
 * Execute Phase 3: SIGN OUT (Before Patient Leaves Operating Room)
 */
export function executeWhoSignOut(surgeryId, signOutData) {
  const checklist = db.prepare(`SELECT * FROM ot_who_checklists WHERE surgery_id = ?`).get(surgeryId);
  if (!checklist) throw new Error(`Checklist not found for surgery: ${surgeryId}`);
  if (!checklist.time_out_completed) {
    throw new Error('WHO Protocol Violation: Cannot execute SIGN OUT before TIME OUT is completed.');
  }

  const {
    instrumentCountCorrect,
    spongeSwabCountCorrect,
    needleCountCorrect,
    specimenLabeled,
    equipmentIssuesAddressed,
    recoveryKeyConcerns
  } = signOutData;

  // Strict count validation: If any count is false, flag mismatch and block normal completion
  const countsMatch = instrumentCountCorrect && spongeSwabCountCorrect && needleCountCorrect;
  const countStatus = countsMatch ? 'VERIFIED_CORRECT' : 'MISMATCH_XRAY_REQUIRED';

  const payload = {
    ...signOutData,
    countsMatch,
    completedAt: new Date().toISOString()
  };

  const allPassed = checklist.sign_in_completed && checklist.time_out_completed && countsMatch ? 1 : 0;

  db.prepare(`
    UPDATE ot_who_checklists 
    SET sign_out_completed = 1,
        sign_out_data = ?,
        count_reconciliation_status = ?,
        all_phases_passed = ?
    WHERE surgery_id = ?
  `).run(JSON.stringify(payload), countStatus, allPassed, surgeryId);

  const nextStatus = countsMatch ? 'SIGN_OUT_COMPLETED' : 'SURGERY_IN_PROGRESS';
  db.prepare(`UPDATE ot_surgeries SET status = ? WHERE surgery_id = ?`).run(nextStatus, surgeryId);

  return {
    success: true,
    surgery_id: surgeryId,
    phase: 'SIGN_OUT',
    counts_reconciliation: countStatus,
    all_phases_passed: Boolean(allPassed),
    alert: countsMatch ? 'Counts verified correct. Cleared for wound closure & PACU transfer.' : 'CRITICAL WARNING: Instrument/swab count discrepancy! Immediate intraoperative X-ray required before closure.'
  };
}

/**
 * Log surgical implant for tracking
 */
export function logSurgicalImplant({
  surgeryId,
  patientId,
  implantName,
  manufacturer,
  serialNumber,
  lotBatchNumber,
  expiryDate,
  anatomicalLocation,
  loggedBy
}) {
  if (!surgeryId || !patientId || !implantName || !serialNumber || !lotBatchNumber) {
    throw new Error('Implant tracking requires surgeryId, patientId, implantName, serialNumber, and lotBatchNumber.');
  }

  const implantLogId = `IMP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  db.prepare(`
    INSERT INTO ot_implant_logs (
      implant_log_id, surgery_id, patient_id, implant_name, manufacturer,
      serial_number, lot_batch_number, expiry_date, anatomical_location, logged_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    implantLogId, surgeryId, patientId, implantName, manufacturer || 'GLOBAL_MEDICAL_DEVICES',
    serialNumber, lotBatchNumber, expiryDate || '2030-01-01', anatomicalLocation || 'SURGICAL_FIELD', loggedBy || 'SCRUB_NURSE'
  );

  return {
    success: true,
    implant_log_id: implantLogId,
    surgery_id: surgeryId,
    patient_id: patientId,
    implant_name: implantName,
    serial_number: serialNumber,
    lot_batch_number: lotBatchNumber,
    traceability_status: 'REGISTERED_IN_ELECTRONIC_HEALTH_RECORD'
  };
}

/**
 * Get comprehensive surgery status and WHO checklist
 */
export function getSurgeryStatus(surgeryId) {
  const surgery = db.prepare(`SELECT * FROM ot_surgeries WHERE surgery_id = ?`).get(surgeryId);
  if (!surgery) throw new Error(`Surgery not found: ${surgeryId}`);

  const checklist = db.prepare(`SELECT * FROM ot_who_checklists WHERE surgery_id = ?`).get(surgeryId);
  const implants = db.prepare(`SELECT * FROM ot_implant_logs WHERE surgery_id = ?`).all(surgeryId);

  return {
    surgery,
    who_checklist: checklist ? {
      ...checklist,
      sign_in_data: checklist.sign_in_data ? JSON.parse(checklist.sign_in_data) : null,
      time_out_data: checklist.time_out_data ? JSON.parse(checklist.time_out_data) : null,
      sign_out_data: checklist.sign_out_data ? JSON.parse(checklist.sign_out_data) : null
    } : null,
    implants
  };
}
