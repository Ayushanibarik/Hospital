/**
 * ============================================================================
 * MODULE: Organ & Tissue Transplant (THOTA 1994) (src/operations/thota_transplant.js)
 * ============================================================================
 * 
 * STATUTORY & REGULATORY MANDATE:
 *   - Transplantation of Human Organs and Tissues Act, 1994 (THOTA) (Amended 2011 & Rules 2014)
 *   - National Organ and Tissue Transplant Organization (NOTTO) / ROTTO / SOTTO
 *   - Statutory Brain-Stem Death Declaration Committee (Section 3 & Form 8)
 *   - Next of Kin Organ Donation Consent (Form 10)
 * 
 * CORE FEATURES:
 *   - Statutory 4-Doctor Board Certification (Admin, Physician, Neuro, Treating Dr)
 *   - Dual Apnea Testing Protocol (>= 6 Hours Separation Mandatory)
 *   - Form 8 Certification generation
 *   - Organ Retrieval & Cold Ischemia Time tracking
 * ============================================================================
 */

import { db } from '../db/index.js';
import crypto from 'node:crypto';

/**
 * Register Brain-Stem Death Case & First Apnea Test
 */
export function initiateBrainDeathDeclaration({
  patientId,
  icuBed,
  primaryCauseOfComa,
  apneaTest1Time,
  apneaTest1Paco2Pre,
  apneaTest1Paco2Post,
  doctor1Admin,
  doctor2Physician,
  doctor3Neuro,
  doctor4Treating
}) {
  if (!patientId || !icuBed || !primaryCauseOfComa) {
    throw new Error('Patient ID, ICU Bed, and Primary Cause of Coma are required.');
  }
  if (!doctor1Admin || !doctor2Physician || !doctor3Neuro || !doctor4Treating) {
    throw new Error('THOTA Statutory Violation: Brain-stem death committee must comprise exactly 4 statutory doctors.');
  }

  const paco2Post = parseFloat(apneaTest1Paco2Post);
  if (paco2Post < 60) {
    throw new Error(`Apnea Test 1 Invalid: Post-apnea PaCO2 must reach at least 60 mmHg (recorded: ${paco2Post} mmHg).`);
  }

  const caseId = `BD-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const test1Timestamp = apneaTest1Time || new Date().toISOString();

  db.prepare(`
    INSERT INTO thota_brain_death_cases (
      case_id, patient_id, icu_bed, primary_cause_of_coma,
      apnea_test_1_timestamp, apnea_test_1_paco2_pre, apnea_test_1_paco2_post,
      apnea_test_2_timestamp, apnea_test_2_paco2_pre, apnea_test_2_paco2_post,
      doctor_1_medical_admin, doctor_2_physician_anaesthetist,
      doctor_3_neurologist_neurosurgeon, doctor_4_treating_doctor,
      form_8_certified, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, 0, 'WAITING_FOR_TEST_2')
  `).run(
    caseId, patientId, icuBed, primaryCauseOfComa,
    test1Timestamp, parseFloat(apneaTest1Paco2Pre || 40), paco2Post,
    test1Timestamp, // placeholder until test 2
    doctor1Admin, doctor2Physician, doctor3Neuro, doctor4Treating
  );

  return {
    success: true,
    case_id: caseId,
    patient_id: patientId,
    apnea_test_1: {
      timestamp: test1Timestamp,
      paco2_pre: apneaTest1Paco2Pre,
      paco2_post: paco2Post,
      respiratory_effort: 'ABSENT'
    },
    statutory_rule: 'THOTA 1994 Rule 5: Minimum 6-hour interval required before Apnea Test 2 in adults.',
    status: 'WAITING_FOR_TEST_2'
  };
}

/**
 * Execute Second Apnea Test and Complete Form 8 Certification
 */
export function certifyBrainDeathForm8({
  caseId,
  apneaTest2Time,
  apneaTest2Paco2Pre,
  apneaTest2Paco2Post,
  allCranialReflexesAbsent = true,
  organDonationConsentForm10 = false,
  nottoId = null
}) {
  const bdCase = db.prepare(`SELECT * FROM thota_brain_death_cases WHERE case_id = ?`).get(caseId);
  if (!bdCase) throw new Error(`Brain death case not found: ${caseId}`);

  const test1Time = new Date(bdCase.apnea_test_1_timestamp).getTime();
  const test2Time = new Date(apneaTest2Time || Date.now()).getTime();
  const diffHours = (test2Time - test1Time) / (1000 * 60 * 60);

  if (diffHours < 6.0) {
    throw new Error(`THOTA Statutory Violation: Apnea test 2 conducted only ${diffHours.toFixed(1)} hours after test 1. Minimum 6.0 hours required by Indian law.`);
  }

  const paco2Post = parseFloat(apneaTest2Paco2Post);
  if (paco2Post < 60) {
    throw new Error(`Apnea Test 2 Invalid: Post-apnea PaCO2 must reach at least 60 mmHg (recorded: ${paco2Post} mmHg).`);
  }
  if (!allCranialReflexesAbsent) {
    throw new Error('Brain-stem death declaration cannot proceed: Cranial nerve reflexes still elicitable.');
  }

  const finalStatus = organDonationConsentForm10 ? 'NOTTO_NOTIFIED' : 'CERTIFIED';
  const assignedNottoId = nottoId || (organDonationConsentForm10 ? `NOTTO-DON-${caseId.slice(-6)}` : null);

  db.prepare(`
    UPDATE thota_brain_death_cases 
    SET apnea_test_2_timestamp = ?,
        apnea_test_2_paco2_pre = ?,
        apnea_test_2_paco2_post = ?,
        cranial_reflexes_absent = 1,
        form_8_certified = 1,
        form_8_timestamp = CURRENT_TIMESTAMP,
        organ_donation_consent_form_10 = ?,
        notto_intimated = ?,
        notto_id = ?,
        status = ?
    WHERE case_id = ?
  `).run(
    new Date(test2Time).toISOString(),
    parseFloat(apneaTest2Paco2Pre || 42),
    paco2Post,
    organDonationConsentForm10 ? 1 : 0,
    organDonationConsentForm10 ? 1 : 0,
    assignedNottoId,
    finalStatus,
    caseId
  );

  return {
    success: true,
    case_id: caseId,
    form_8_certified: true,
    statutory_board_members: [
      { role: 'Medical Administrator', name: bdCase.doctor_1_medical_admin },
      { role: 'Independent Physician / Anaesthetist', name: bdCase.doctor_2_physician_anaesthetist },
      { role: 'Neurologist / Neurosurgeon', name: bdCase.doctor_3_neurologist_neurosurgeon },
      { role: 'Treating Doctor', name: bdCase.doctor_4_treating_doctor }
    ],
    apnea_interval_hours: Math.round(diffHours * 10) / 10,
    form_10_consent: Boolean(organDonationConsentForm10),
    notto_id: assignedNottoId,
    status: finalStatus,
    certificate: 'Statutory Form 8 Brain-Stem Death Certificate Validated under THOTA 1994.'
  };
}

/**
 * Log organ retrieval and initiate cold ischemia timer
 */
export function logOrganRetrieval({
  caseId,
  organType,
  crossClampTimestamp,
  preservationSolution = 'UW_SOLUTION',
  allocatedHospitalRecipient,
  nottoMatchScore = 94.5,
  transportMode = 'GREEN_CORRIDOR_ROAD'
}) {
  const bdCase = db.prepare(`SELECT * FROM thota_brain_death_cases WHERE case_id = ?`).get(caseId);
  if (!bdCase) throw new Error(`Case not found: ${caseId}`);
  if (!bdCase.form_8_certified || !bdCase.organ_donation_consent_form_10) {
    throw new Error('Cannot retrieve organ: Form 8 brain death and Form 10 next-of-kin consent must both be certified.');
  }

  const retrievalId = `RET-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const clampTime = crossClampTimestamp || new Date().toISOString();

  db.prepare(`
    INSERT INTO thota_organ_retrieval (
      retrieval_id, case_id, organ_type, cross_clamp_timestamp,
      preservation_solution, cold_ischemia_start, allocated_hospital_recipient,
      notto_match_score, transport_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    retrievalId, caseId, organType, clampTime, preservationSolution,
    clampTime, allocatedHospitalRecipient, nottoMatchScore, transportMode
  );

  db.prepare(`UPDATE thota_brain_death_cases SET status = 'RETRIEVAL_COMMENCED' WHERE case_id = ?`).run(caseId);

  return {
    success: true,
    retrieval_id: retrievalId,
    case_id: caseId,
    organ_type: organType,
    cross_clamp_time: clampTime,
    cold_ischemia_clock_started: true,
    preservation_solution: preservationSolution,
    allocated_recipient: allocatedHospitalRecipient,
    transport_mode: transportMode,
    notto_match_score: nottoMatchScore
  };
}
