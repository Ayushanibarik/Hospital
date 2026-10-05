/**
 * ============================================================================
 * MODULE: Statutory Forms & Legal Registers (src/compliance/statutory_forms.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Mandated Indian Statutory Acts & Clinical Governance:
 *   1. PCPNDT Act, 1994: Mandatory Form-F, ultrasound registry, anti-sex determination declarations
 *   2. MTP Act, 1971 (Amendment 2021): Confidential MTP register, 1/2 RMP opinions, procedure logs
 *   3. RBD Act, 1969: Form-1 (Birth) & Form-4 (MCCD - Medical Certification of Cause of Death)
 *   4. Clinical Establishments Act: Mandatory compliance disclosures & tariff transparency
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── PCPNDT Act (Form-F) ──────────────────────────────────────────────────

/**
 * Record a PCPNDT Form-F for obstetric ultrasound / prenatal diagnosis
 */
export function recordPcpndtFormF({
  patientId,
  referringDoctor,
  indication,
  gestationalAgeWeeks,
  procedureName = 'Ultrasound Obstetrics',
  procedureDate = new Date().toISOString().slice(0, 10),
  declarationSigned = 1,
  patientDeclarationSigned = 1,
  resultCommunicatedTo = 'REFERRING_DOCTOR',
  siteId = 'SITE-HQ',
  createdBy
}) {
  const formId = genId('PCPNDT');

  db.prepare(`
    INSERT INTO statutory_pcpndt_forms (
      form_id, patient_id, form_type, referring_doctor, indication, gestational_age_weeks,
      procedure_name, procedure_date, declaration_signed, patient_declaration_signed,
      result_communicated_to, site_id, created_by, created_at
    ) VALUES (?, ?, 'FORM_F', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    formId,
    patientId,
    referringDoctor,
    indication,
    gestationalAgeWeeks || null,
    procedureName,
    procedureDate,
    declarationSigned ? 1 : 0,
    patientDeclarationSigned ? 1 : 0,
    resultCommunicatedTo,
    siteId,
    createdBy || 'RADIOLOGIST'
  );

  return {
    formId,
    formType: 'FORM_F',
    patientId,
    statutoryNotice: 'STRICTLY PROHIBITED: Sex selection or prenatal sex disclosure is an offence punishable under PCPNDT Act, 1994.',
    declarationSigned: !!declarationSigned,
    patientDeclarationSigned: !!patientDeclarationSigned,
    procedureDate
  };
}

/**
 * Get PCPNDT Form-F registry records for statutory inspection
 */
export function getPcpndtRegister({ dateFrom, dateTo, siteId } = {}) {
  let sql = `
    SELECT f.*, p.name as patient_name, p.phone as patient_phone 
    FROM statutory_pcpndt_forms f
    JOIN patients p ON f.patient_id = p.patient_id
    WHERE 1=1
  `;
  const params = [];

  if (dateFrom && dateTo) {
    sql += ` AND f.procedure_date BETWEEN ? AND ?`;
    params.push(dateFrom, dateTo);
  }
  if (siteId) {
    sql += ` AND f.site_id = ?`;
    params.push(siteId);
  }

  sql += ` ORDER BY f.procedure_date DESC`;
  return db.prepare(sql).all(...params);
}

// ─── MTP Act (Medical Termination of Pregnancy Register) ──────────────────

/**
 * Record MTP entry in the confidential statutory register
 */
export function recordMtpEntry({
  patientId,
  registrationNumber,
  age,
  gestationalAgeWeeks,
  indication,
  procedureType = 'MEDICAL',
  operatingDoctor,
  opinionDoctor2 = null,
  procedureDate = new Date().toISOString().slice(0, 10),
  complications = 'None',
  outcome = 'SUCCESSFUL',
  siteId = 'SITE-HQ'
}) {
  const mtpId = genId('MTP');
  
  // Statutory rule check: > 20 weeks requires 2 Registered Medical Practitioner (RMP) opinions
  if (gestationalAgeWeeks > 20 && !opinionDoctor2) {
    throw new Error('MTP Act Requirement: Gestational age exceeding 20 weeks strictly mandates second RMP formal opinion.');
  }

  db.prepare(`
    INSERT INTO statutory_mtp_register (
      mtp_id, patient_id, registration_number, age, gestational_age_weeks,
      indication, procedure_type, operating_doctor, opinion_doctor_2,
      procedure_date, complications, outcome, site_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    mtpId,
    patientId,
    registrationNumber || `MTP-REG-${Date.now().toString().slice(-4)}`,
    age || null,
    gestationalAgeWeeks,
    indication,
    procedureType,
    operatingDoctor,
    opinionDoctor2,
    procedureDate,
    complications,
    outcome,
    siteId
  );

  return {
    mtpId,
    patientId,
    procedureDate,
    twoRmpOpinionsVerified: gestationalAgeWeeks > 20,
    status: 'RECORDED_CONFIDENTIAL'
  };
}

/**
 * Retrieve confidential MTP register
 */
export function getMtpRegister({ siteId } = {}) {
  let sql = `
    SELECT m.*, p.name as patient_name 
    FROM statutory_mtp_register m
    JOIN patients p ON m.patient_id = p.patient_id
  `;
  const params = [];
  if (siteId) {
    sql += ` WHERE m.site_id = ?`;
    params.push(siteId);
  }
  sql += ` ORDER BY m.procedure_date DESC`;
  return db.prepare(sql).all(...params);
}

// ─── Birth and Death Registration (RBD Act, 1969) ─────────────────────────

/**
 * Record Birth or Death institutional event
 */
export function recordBirthOrDeathEvent({
  recordType, // 'BIRTH' or 'DEATH'
  patientId = null,
  personName,
  dateOfEvent,
  timeOfEvent,
  placeOfEvent = 'HOSPITAL_INPATIENT',
  cause = null, // Mandatory for DEATH (MCCD Form-4)
  attendingDoctor,
  fatherMotherName,
  address,
  registrarOffice = 'Municipal Corporation Health Department',
  siteId = 'SITE-HQ'
}) {
  const recordId = genId(recordType === 'BIRTH' ? 'BRTH' : 'DTH');
  const regNumber = `${recordType.slice(0, 1)}/${new Date().getFullYear()}/${Date.now().toString().slice(-5)}`;

  if (recordType === 'DEATH' && !cause) {
    throw new Error('RBD Act & MCCD Requirement: Immediate and antecedent cause of death must be documented.');
  }

  db.prepare(`
    INSERT INTO statutory_birth_death (
      record_id, record_type, patient_id, registration_number, person_name,
      date_of_event, time_of_event, place_of_event, cause, attending_doctor,
      father_mother_name, address, notification_sent, registrar_office, site_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    recordId,
    recordType,
    patientId,
    regNumber,
    personName,
    dateOfEvent,
    timeOfEvent || null,
    placeOfEvent,
    cause,
    attendingDoctor,
    fatherMotherName || null,
    address || null,
    registrarOffice,
    siteId
  );

  return {
    recordId,
    recordType,
    registrationNumber: regNumber,
    personName,
    dateOfEvent,
    mccdCertified: recordType === 'DEATH',
    notificationStatus: 'PENDING_TRANSMISSION'
  };
}

/**
 * Mark notification sent to municipal registrar
 */
export function markEventNotificationSent(recordId) {
  db.prepare(`
    UPDATE statutory_birth_death
    SET notification_sent = 1, notification_date = DATE('now')
    WHERE record_id = ?
  `).run(recordId);

  return { recordId, notificationSent: true, notificationDate: new Date().toISOString().slice(0, 10) };
}

/**
 * Get birth and death records
 */
export function getBirthDeathRecords({ recordType, siteId } = {}) {
  let sql = `SELECT * FROM statutory_birth_death WHERE 1=1`;
  const params = [];
  if (recordType) {
    sql += ` AND record_type = ?`;
    params.push(recordType);
  }
  if (siteId) {
    sql += ` AND site_id = ?`;
    params.push(siteId);
  }
  sql += ` ORDER BY date_of_event DESC`;
  return db.prepare(sql).all(...params);
}
