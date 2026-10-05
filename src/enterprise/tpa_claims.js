/**
 * ============================================================================
 * MODULE: TPA & Cashless Claims Management (src/enterprise/tpa_claims.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   End-to-End Health Insurance & Cashless Hospitalization Management:
 *   - IRDAI-compliant cashless Pre-Authorization workflow (Initial Approval)
 *   - Enhanced Pre-Authorization / Interim top-up requests
 *   - Final Claim Dossier Submission with Disallowance & Co-pay calculation
 *   - Settlement Reconciliation with Bank UTR and Section 194J TDS deductions
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { logDataAccess } from '../compliance/dpdp_engine.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── Cashless Pre-Authorization ───────────────────────────────────────────

/**
 * Submit Cashless Pre-Authorization Request to TPA / Insurer
 */
export function submitPreauthRequest({
  patientId,
  admissionId = null,
  tpaName, // e.g., 'Medi Assist', 'Vidal Health', 'MDIndia', 'Star Health'
  insurerName,
  policyNumber,
  requestedAmount,
  submittedBy
}) {
  const preauthId = genId('PREAUTH');

  db.prepare(`
    INSERT INTO tpa_preauth_requests (
      preauth_id, patient_id, admission_id, tpa_name, insurer_name, policy_number,
      requested_amount, status, submitted_by, submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, CURRENT_TIMESTAMP)
  `).run(
    preauthId,
    patientId,
    admissionId,
    tpaName,
    insurerName,
    policyNumber,
    requestedAmount,
    submittedBy || 'TPA_DESK_OFFICER'
  );

  logDataAccess({
    userId: submittedBy,
    patientId,
    resourceType: 'TPA_PREAUTH',
    resourceId: preauthId,
    action: 'SUBMIT_PREAUTH',
    accessReason: `Cashless preauth for Rs ${requestedAmount} with ${tpaName}`
  });

  return {
    preauthId,
    patientId,
    tpaName,
    requestedAmount,
    status: 'SUBMITTED',
    message: 'Pre-authorization request dispatched to TPA portal.'
  };
}

/**
 * Record TPA Decision (Approved / Rejected / Query)
 */
export function recordPreauthDecision({
  preauthId,
  status, // 'APPROVED', 'REJECTED', 'QUERY_RAISED'
  approvedAmount = 0,
  coPayPct = 0,
  deductible = 0,
  preauthNumber = null,
  validityDays = 7,
  rejectionReason = null
}) {
  const preauth = db.prepare(`SELECT * FROM tpa_preauth_requests WHERE preauth_id = ?`).get(preauthId);
  if (!preauth) throw new Error('Preauth record not found.');

  const validityDate = new Date(Date.now() + validityDays * 86400000).toISOString().slice(0, 10);
  const finalPreauthNo = preauthNumber || `PA-${Date.now().toString().slice(-6)}`;

  db.prepare(`
    UPDATE tpa_preauth_requests
    SET status = ?,
        approved_amount = ?,
        co_pay_pct = ?,
        deductible = ?,
        preauth_number = ?,
        validity_date = ?,
        rejection_reason = ?,
        responded_at = CURRENT_TIMESTAMP
    WHERE preauth_id = ?
  `).run(
    status,
    approvedAmount,
    coPayPct,
    deductible,
    status === 'APPROVED' ? finalPreauthNo : null,
    status === 'APPROVED' ? validityDate : null,
    rejectionReason,
    preauthId
  );

  return {
    preauthId,
    status,
    approvedAmount,
    coPayPct,
    preauthNumber: finalPreauthNo,
    validityDate
  };
}

// ─── Final Claim Submission ───────────────────────────────────────────────

/**
 * Submit Final Cashless Claim upon Patient Discharge
 */
export function submitFinalClaim({
  patientId,
  admissionId = null,
  preauthId = null,
  tpaName,
  insurerName,
  policyNumber,
  claimAmount,
  deductions = 0,
  coPayPct = 0
}) {
  const claimId = genId('CLAIM');
  const claimNumber = `CLM/${new Date().getFullYear()}/${Date.now().toString().slice(-5)}`;

  // Calculate liability breakdown
  const approvedEstimate = Math.max(0, claimAmount - deductions);
  const coPayAmount = Math.round(approvedEstimate * (coPayPct / 100) * 100) / 100;
  const tpaPayable = Math.round((approvedEstimate - coPayAmount) * 100) / 100;
  const patientLiability = Math.round((deductions + coPayAmount) * 100) / 100;

  db.prepare(`
    INSERT INTO tpa_claims (
      claim_id, patient_id, admission_id, preauth_id, tpa_name, insurer_name,
      policy_number, claim_amount, approved_amount, deductions, co_pay_amount,
      patient_liability, status, claim_number, submitted_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    claimId,
    patientId,
    admissionId,
    preauthId,
    tpaName,
    insurerName,
    policyNumber,
    claimAmount,
    tpaPayable,
    deductions,
    coPayAmount,
    patientLiability,
    claimNumber
  );

  return {
    claimId,
    claimNumber,
    totalBillAmount: claimAmount,
    tpaApprovedPayable: tpaPayable,
    coPayAmount,
    deductions,
    patientPayableAtCounter: patientLiability,
    status: 'SUBMITTED'
  };
}

/**
 * Reconcile Bank Settlement for Claim
 */
export function reconcileSettlement({
  claimId,
  settlementAmount,
  utrNumber,
  paymentDate = new Date().toISOString().slice(0, 10),
  tdsPct = 10, // Section 194J TDS rate on professional healthcare payments
  bankReference = null,
  reconciledBy
}) {
  const claim = db.prepare(`SELECT * FROM tpa_claims WHERE claim_id = ?`).get(claimId);
  if (!claim) throw new Error('Claim not found.');

  const tdsAmount = Math.round(settlementAmount * (tdsPct / 100) * 100) / 100;
  const netReceived = Math.round((settlementAmount - tdsAmount) * 100) / 100;
  const settlementId = genId('SETTL');

  db.prepare(`
    INSERT INTO tpa_settlements (
      settlement_id, claim_id, settlement_amount, utr_number, payment_date,
      tds_amount, net_received, bank_reference, reconciled, reconciled_by, reconciled_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    settlementId,
    claimId,
    settlementAmount,
    utrNumber,
    paymentDate,
    tdsAmount,
    netReceived,
    bankReference,
    reconciledBy || 'FINANCE_CONTROLLER'
  );

  db.prepare(`UPDATE tpa_claims SET status = 'SETTLED', processed_at = CURRENT_TIMESTAMP WHERE claim_id = ?`).run(claimId);

  return {
    settlementId,
    claimId,
    grossSettlement: settlementAmount,
    tdsDeducted: tdsAmount,
    netReceivedInBank: netReceived,
    utrNumber,
    status: 'SETTLED_AND_RECONCILED'
  };
}

/**
 * Get all TPA claims for a patient
 */
export function getPatientTpaClaims(patientId) {
  return db.prepare(`
    SELECT c.*, s.utr_number, s.net_received, s.payment_date
    FROM tpa_claims c
    LEFT JOIN tpa_settlements s ON c.claim_id = s.claim_id
    WHERE c.patient_id = ?
    ORDER BY c.created_at DESC
  `).all(patientId);
}
