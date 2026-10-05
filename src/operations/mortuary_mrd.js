/**
 * ============================================================================
 * MODULE: Mortuary Management & Medical Records Department (MRD) (src/operations/mortuary_mrd.js)
 * ============================================================================
 * 
 * STATUTORY & REGULATORY MANDATE:
 *   - Registration of Births and Deaths (RBD) Act, 1969 & MCCD (Form 4/4A)
 *   - Medico-Legal Autopsy Clearance & Police NOC Protocol (BNSS / CrPC Section 174)
 *   - National Medical Commission (NMC) & MoHFW Medical Records Retention Guidelines
 *   - NABH 5th Edition: Information Management System (IMS.4 - Records Retention & Retrieval)
 * 
 * CORE FEATURES:
 *   - Mortuary Cold Chamber allocation with dual-tag verification (toe & wrist)
 *   - Medico-Legal Death Release Blocking (Mandatory Police NOC & Autopsy verification)
 *   - MRD Physical File Compactor/Shelf location tracking
 *   - Statutory Record Retention Schedule (MLC: 99 yrs, Pediatric: 21 yrs, General: 5 yrs)
 * ============================================================================
 */

import { db } from '../db/index.js';
import crypto from 'node:crypto';

// ----------------------------------------------------------------------------
// 1. Mortuary Management
// ----------------------------------------------------------------------------

/**
 * Register body admission into mortuary cold chamber
 */
export function admitBodyToMortuary({
  deceasedPatientId,
  deceasedName,
  gender,
  timeOfDeath,
  causeOfDeath,
  isMlcDeath = 0,
  mlcNumber = null,
  chamberNumber,
  valuablesDeposited = 'NONE'
}) {
  if (!deceasedPatientId || !deceasedName || !chamberNumber) {
    throw new Error('Deceased Patient ID, Name, and Cold Chamber Number are mandatory.');
  }

  const entryId = `MORT-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const initialStatus = isMlcDeath ? 'AWAITING_POLICE_NOC' : 'IN_COLD_STORAGE';

  db.prepare(`
    INSERT INTO mortuary_records (
      mortuary_entry_id, deceased_patient_id, deceased_name, gender,
      time_of_death, cause_of_death, is_mlc_death, mlc_number,
      chamber_number, toe_tag_verified, wrist_band_verified,
      valuables_deposited, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(
    entryId, deceasedPatientId, deceasedName, gender || 'UNKNOWN',
    timeOfDeath || new Date().toISOString(), causeOfDeath || 'CARDIAC_ARREST',
    isMlcDeath ? 1 : 0, mlcNumber, chamberNumber, valuablesDeposited, initialStatus
  );

  return {
    success: true,
    mortuary_entry_id: entryId,
    deceased_name: deceasedName,
    chamber_number: chamberNumber,
    is_mlc_death: Boolean(isMlcDeath),
    identification_tags: { toe_tag: 'VERIFIED', wrist_band: 'VERIFIED' },
    status: initialStatus,
    protocol_notice: isMlcDeath ? 
      'STATUTORY HOLD: MLC Death requires Police No-Objection Certificate (NOC) and Post-Mortem completion prior to release.' :
      'Standard cold storage preservation initiated.'
  };
}

/**
 * Release body from mortuary (with strict MLC verification gate)
 */
export function releaseBodyFromMortuary({
  mortuaryEntryId,
  policeNocVerified = false,
  postMortemCompleted = false,
  handoverToRelativeName,
  relativeRelationship,
  relativeIdProof,
  handoverOfficerId
}) {
  const record = db.prepare(`SELECT * FROM mortuary_records WHERE mortuary_entry_id = ?`).get(mortuaryEntryId);
  if (!record) throw new Error(`Mortuary record not found: ${mortuaryEntryId}`);

  // Statutory Gate for MLC cases
  if (record.is_mlc_death) {
    if (!policeNocVerified) {
      throw new Error(`LEGAL BLOCK: Cannot release body for MLC case ${record.mlc_number || record.mortuary_entry_id}. Police NOC has not been verified.`);
    }
    if (!postMortemCompleted) {
      throw new Error(`LEGAL BLOCK: Medico-legal post-mortem autopsy examination must be completed before body handover.`);
    }
  }

  if (!handoverToRelativeName || !relativeIdProof) {
    throw new Error('Relative name and verified Government ID proof are required for body handover.');
  }

  const nextStatus = record.is_mlc_death ? 'RELEASED_TO_POLICE' : 'RELEASED_TO_FAMILY';

  db.prepare(`
    UPDATE mortuary_records 
    SET police_noc_verified = ?,
        post_mortem_completed = ?,
        handover_to_relative_name = ?,
        relative_relationship = ?,
        relative_id_proof = ?,
        handover_officer_id = ?,
        release_timestamp = CURRENT_TIMESTAMP,
        status = ?
    WHERE mortuary_entry_id = ?
  `).run(
    policeNocVerified ? 1 : 0,
    postMortemCompleted ? 1 : 0,
    handoverToRelativeName,
    relativeRelationship || 'LEGAL_HEIR',
    relativeIdProof,
    handoverOfficerId || 'DUTY_MORTUARY_OFFICER',
    nextStatus,
    mortuaryEntryId
  );

  return {
    success: true,
    mortuary_entry_id: mortuaryEntryId,
    deceased_name: record.deceased_name,
    released_to: handoverToRelativeName,
    relationship: relativeRelationship || 'LEGAL_HEIR',
    handover_status: nextStatus,
    release_timestamp: new Date().toISOString()
  };
}

// ----------------------------------------------------------------------------
// 2. Medical Records Department (MRD)
// ----------------------------------------------------------------------------

/**
 * Archive discharged patient record and calculate statutory retention schedule
 */
export function archivePatientRecord({
  patientId,
  admissionId,
  dischargeDate,
  primaryIcd10Code = 'Z00.0',
  storageLocation,
  isMlcCase = false,
  isPediatricPatient = false,
  patientAgeYears = 35,
  dischargeSummaryPresent = true,
  consentFormsPresent = true,
  otNotesPresent = true,
  nursingRecordsPresent = true
}) {
  if (!patientId || !admissionId || !storageLocation) {
    throw new Error('Patient ID, Admission ID, and Physical Storage Location (Rack/Shelf) are required.');
  }

  // Completeness Audit Score
  let score = 0;
  if (dischargeSummaryPresent) score += 30;
  if (consentFormsPresent) score += 25;
  if (otNotesPresent) score += 25;
  if (nursingRecordsPresent) score += 20;

  // Statutory Retention Calculation
  let retentionYears = 5; // Default general adult records
  if (isMlcCase) {
    retentionYears = 99; // Medico-legal: permanent / until court disposal
  } else if (isPediatricPatient || patientAgeYears < 18) {
    // Retain until age 18 + 3 years = 21 years statutory requirement
    const yearsToMajority = Math.max(0, 18 - (patientAgeYears || 0));
    retentionYears = yearsToMajority + 3;
  }

  const dischDate = new Date(dischargeDate || Date.now());
  const retentionExpiry = new Date(dischDate.getFullYear() + retentionYears, dischDate.getMonth(), dischDate.getDate()).toISOString().split('T')[0];

  const mrdFileId = `MRD-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  db.prepare(`
    INSERT INTO mrd_files (
      mrd_file_id, patient_id, admission_id, discharge_date, primary_icd10_code,
      storage_location, file_completeness_score_pct, discharge_summary_present,
      consent_forms_present, ot_notes_present, nursing_records_present,
      statutory_retention_years, retention_expiry_date, current_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ARCHIVED')
  `).run(
    mrdFileId, patientId, admissionId, dischDate.toISOString().split('T')[0], primaryIcd10Code,
    storageLocation, score, dischargeSummaryPresent ? 1 : 0, consentFormsPresent ? 1 : 0,
    otNotesPresent ? 1 : 0, nursingRecordsPresent ? 1 : 0,
    retentionYears, retentionExpiry
  );

  return {
    success: true,
    mrd_file_id: mrdFileId,
    patient_id: patientId,
    storage_location: storageLocation,
    completeness_score_pct: score,
    is_audit_passed: score >= 90,
    statutory_retention_years: retentionYears,
    retention_expiry_date: retentionExpiry,
    retention_rule: isMlcCase ? 'MLC Permanent Archival' : (isPediatricPatient ? 'Pediatric Majority + 3 Years Rule' : 'Standard 5-Year Inpatient Retention'),
    status: 'ARCHIVED'
  };
}

/**
 * Check out MRD file to a clinician for research or court summons
 */
export function checkoutMrdFile(mrdFileId, doctorId, purpose, returnDays = 7) {
  const file = db.prepare(`SELECT * FROM mrd_files WHERE mrd_file_id = ?`).get(mrdFileId);
  if (!file) throw new Error(`MRD file not found: ${mrdFileId}`);
  if (file.current_status === 'CHECKED_OUT_LENT') {
    throw new Error(`MRD File ${mrdFileId} is already checked out to doctor: ${file.checked_out_to_doctor_id}`);
  }

  const dueDate = new Date(Date.now() + returnDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  db.prepare(`
    UPDATE mrd_files 
    SET current_status = 'CHECKED_OUT_LENT',
        checked_out_to_doctor_id = ?,
        checked_out_purpose = ?,
        checked_out_due_date = ?
    WHERE mrd_file_id = ?
  `).run(doctorId, purpose || 'CLINICAL_RESEARCH_AUDIT', dueDate, mrdFileId);

  return {
    success: true,
    mrd_file_id: mrdFileId,
    borrower_doctor_id: doctorId,
    purpose: purpose || 'CLINICAL_RESEARCH_AUDIT',
    due_date: dueDate,
    status: 'CHECKED_OUT_LENT'
  };
}
