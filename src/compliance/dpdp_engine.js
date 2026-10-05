/**
 * ============================================================================
 * MODULE: DPDP Act Compliance Engine (src/compliance/dpdp_engine.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Enforces statutory compliance with the Digital Personal Data Protection
 *   Act (DPDP), 2023:
 *   - Explicit, revocable, purpose-specific consent management
 *   - Comprehensive data access logging (every clinical/demographic view/export)
 *   - Right-to-Erasure ("Right to be Forgotten") workflow with clinical retention safeguards
 *   - Data minimization & purpose-limitation verification
 *   - Sensitive personal data masking (PII/Aadhaar)
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── Consent Management ───────────────────────────────────────────────────

/**
 * Record explicit patient consent
 */
export function recordConsent({ patientId, purpose, consentText, givenBy, givenVia = 'DIGITAL', expiresAt = null, ipAddress = null }) {
  const consentId = genId('CSNT');
  
  db.prepare(`
    INSERT INTO consent_records (
      consent_id, patient_id, purpose, consent_text, given_by, given_via,
      consented_at, expires_at, status, ip_address
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'ACTIVE', ?)
  `).run(
    consentId,
    patientId,
    purpose,
    consentText || `Consent granted for ${purpose} under DPDP Act 2023 guidelines.`,
    givenBy || 'PATIENT',
    givenVia,
    expiresAt,
    ipAddress
  );

  logDataAccess({
    userId: givenBy,
    patientId,
    resourceType: 'CONSENT',
    resourceId: consentId,
    action: 'GRANT_CONSENT',
    accessReason: `Consent granted for purpose: ${purpose}`,
    ipAddress
  });

  return {
    consentId,
    patientId,
    purpose,
    status: 'ACTIVE',
    consentedAt: new Date().toISOString()
  };
}

/**
 * Revoke/withdraw consent
 */
export function withdrawConsent({ consentId, patientId, withdrawnBy, reason, ipAddress = null }) {
  const info = db.prepare(`
    UPDATE consent_records
    SET status = 'WITHDRAWN', withdrawn_at = CURRENT_TIMESTAMP
    WHERE (consent_id = ? OR (patient_id = ? AND purpose = ?)) AND status = 'ACTIVE'
  `).run(consentId, patientId, reason);

  logDataAccess({
    userId: withdrawnBy,
    patientId,
    resourceType: 'CONSENT',
    resourceId: consentId,
    action: 'WITHDRAW_CONSENT',
    accessReason: `Consent revoked: ${reason || 'Patient request'}`,
    ipAddress
  });

  return {
    success: info.changes > 0,
    consentId,
    status: 'WITHDRAWN'
  };
}

/**
 * Get active consents for patient
 */
export function getPatientConsents(patientId) {
  return db.prepare(`
    SELECT * FROM consent_records
    WHERE patient_id = ?
    ORDER BY consented_at DESC
  `).all(patientId);
}

/**
 * Verify whether active consent exists for a specific processing purpose
 */
export function verifyPurposeConsent(patientId, purpose) {
  const row = db.prepare(`
    SELECT * FROM consent_records
    WHERE patient_id = ? AND purpose = ? AND status = 'ACTIVE'
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  `).get(patientId, purpose);

  return !!row;
}

// ─── Data Access Audit Logging ────────────────────────────────────────────

/**
 * Log access to patient demographic or clinical records (statutory audit trail)
 */
export function logDataAccess({ userId, patientId, resourceType, resourceId, action, accessReason, ipAddress }) {
  const accessId = genId('ACC');
  try {
    db.prepare(`
      INSERT INTO data_access_logs (
        access_id, user_id, patient_id, resource_type, resource_id,
        action, access_reason, ip_address, accessed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      accessId,
      userId || 'ANONYMOUS',
      patientId,
      resourceType,
      resourceId || null,
      action || 'VIEW',
      accessReason || 'Clinical care delivery',
      ipAddress || null
    );
  } catch (err) {
    // Non-blocking in case of audit log table transient issues
    console.error('[DPDP Audit Log Error]', err.message);
  }
  return accessId;
}

/**
 * Get access logs for a specific patient (Right to Information under DPDP)
 */
export function getPatientAccessLogs(patientId, limit = 100) {
  return db.prepare(`
    SELECT * FROM data_access_logs
    WHERE patient_id = ?
    ORDER BY accessed_at DESC
    LIMIT ?
  `).all(patientId, limit);
}

// ─── Right to Erasure / Right to be Forgotten ─────────────────────────────

/**
 * Request erasure of personal data under Section 12 of DPDP Act
 */
export function requestDataErasure({ patientId, requestedBy, reason, dataCategories }) {
  const erasureId = genId('DEL');
  const categories = Array.isArray(dataCategories) ? dataCategories.join(',') : (dataCategories || 'MARKETING,DEMOGRAPHICS');

  db.prepare(`
    INSERT INTO data_erasure_requests (
      erasure_id, patient_id, requested_by, reason, status, data_categories, created_at
    ) VALUES (?, ?, ?, ?, 'PENDING', ?, CURRENT_TIMESTAMP)
  `).run(erasureId, patientId, requestedBy, reason, categories);

  logDataAccess({
    userId: requestedBy,
    patientId,
    resourceType: 'ERASURE_REQUEST',
    resourceId: erasureId,
    action: 'REQUEST_ERASURE',
    accessReason: `Right to erasure requested for categories: ${categories}`
  });

  return {
    erasureId,
    patientId,
    status: 'PENDING',
    categories,
    note: 'Statutory medical records required under MCI / NMC regulations are preserved for legal duration (minimum 3 years).'
  };
}

/**
 * Process and execute approved data erasure with statutory clinical safeguards
 */
export function executeDataErasure({ erasureId, approvedBy }) {
  const req = db.prepare(`SELECT * FROM data_erasure_requests WHERE erasure_id = ?`).get(erasureId);
  if (!req) throw new Error('Erasure request not found.');

  // Mask non-statutory fields while preserving legally mandated clinical IDs
  db.prepare(`
    UPDATE patients
    SET phone = 'ANONYMIZED',
        address = 'ANONYMIZED',
        emergency_contact = NULL
    WHERE patient_id = ?
  `).run(req.patient_id);

  db.prepare(`
    UPDATE data_erasure_requests
    SET status = 'EXECUTED', approved_by = ?, executed_at = CURRENT_TIMESTAMP
    WHERE erasure_id = ?
  `).run(approvedBy, erasureId);

  logDataAccess({
    userId: approvedBy,
    patientId: req.patient_id,
    resourceType: 'PATIENT',
    resourceId: req.patient_id,
    action: 'ERASE_ANONYMIZE',
    accessReason: `Executed erasure request ${erasureId}`
  });

  return {
    erasureId,
    status: 'EXECUTED',
    patientId: req.patient_id,
    executedAt: new Date().toISOString()
  };
}

// ─── PII Masking Utilities ────────────────────────────────────────────────

export function maskAadhaar(aadhaar) {
  if (!aadhaar || aadhaar.length < 4) return aadhaar;
  return `XXXXXXXX${aadhaar.slice(-4)}`;
}

export function maskPhone(phone) {
  if (!phone || phone.length < 4) return phone;
  return `${phone.slice(0, 2)}XXXXXX${phone.slice(-2)}`;
}
