/**
 * ============================================================================
 * MODULE: Hospital Infection Control (HIC) & Antimicrobial Stewardship (AMSP)
 * FILE: src/advanced/infection_control.js
 * ============================================================================
 * 
 * STANDARDS & CLINICAL GUIDELINES:
 *   - NABH Hospital Infection Control (HIC) Standards (5th Edition)
 *   - CDC / NHSN Surveillance Definitions for Healthcare-Associated Infections (HAIs):
 *     * CAUTI: Catheter-Associated Urinary Tract Infection
 *     * CLABSI: Central Line-Associated Bloodstream Infection
 *     * VAP: Ventilator-Associated Pneumonia
 *     * SSI: Surgical Site Infection
 *   - ICMR Guidelines on Antimicrobial Stewardship Program (AMSP) in Indian Hospitals:
 *     * Pre-authorization for restricted antimicrobials (Meropenem, Colistin, Tigecycline)
 *     * Mandatory 48-72h Antimicrobial Time-Out / Review
 * ============================================================================
 */

import { db } from '../db/index.js';
import crypto from 'node:crypto';

// Restricted antimicrobials requiring pre-authorization under ICMR AMSP guidelines
export const RESTRICTED_ANTIBIOTICS = [
  'COLISTIN',
  'MEROPENEM',
  'IMIPENEM',
  'TIGECYCLINE',
  'POLYMYXIN_B',
  'LINEZOLID',
  'VANCOMYCIN',
  'DAPTOMYCIN',
  'CEFTAZIDIME_AVIBACTAM'
];

/**
 * Record a suspected or confirmed Healthcare-Associated Infection (HAI)
 */
export function recordHAISurveillance(data) {
  const {
    patient_id,
    ward_id,
    infection_type,
    device_days_at_onset = 1,
    culture_organism,
    antibiogram_sensitivity,
    bundle_compliance_passed = 1,
    infection_control_officer,
    status = 'CONFIRMED'
  } = data;

  if (!patient_id || !ward_id || !infection_type || !culture_organism || !infection_control_officer) {
    throw new Error('Missing required fields for HAI surveillance log');
  }

  const validTypes = ['CAUTI', 'CLABSI', 'VAP', 'SSI', 'C_DIFFICILE'];
  if (!validTypes.includes(infection_type)) {
    throw new Error(`Invalid infection type: ${infection_type}. Must be one of: ${validTypes.join(', ')}`);
  }

  const surveillance_id = `HAI-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO hai_surveillance_logs (
      surveillance_id, patient_id, ward_id, infection_type,
      device_days_at_onset, culture_organism, antibiogram_sensitivity,
      bundle_compliance_passed, infection_control_officer, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    surveillance_id,
    patient_id,
    ward_id,
    infection_type,
    Number(device_days_at_onset),
    culture_organism,
    antibiogram_sensitivity || 'PENDING',
    bundle_compliance_passed ? 1 : 0,
    infection_control_officer,
    status
  );

  return {
    success: true,
    surveillance_id,
    patient_id,
    infection_type,
    culture_organism,
    bundle_compliance_passed: Boolean(bundle_compliance_passed),
    message: `HAI Surveillance logged successfully: ${infection_type} (${culture_organism})`
  };
}

/**
 * List HAI surveillance records with optional filters
 */
export function listHAISurveillances(filter = {}) {
  let query = 'SELECT * FROM hai_surveillance_logs WHERE 1=1';
  const params = [];

  if (filter.ward_id) {
    query += ' AND ward_id = ?';
    params.push(filter.ward_id);
  }
  if (filter.infection_type) {
    query += ' AND infection_type = ?';
    params.push(filter.infection_type);
  }
  if (filter.status) {
    query += ' AND status = ?';
    params.push(filter.status);
  }

  query += ' ORDER BY identified_at DESC LIMIT 100';
  return db.prepare(query).all(...params);
}

/**
 * Conduct an AMSP restricted antibiotic audit / 48-72h time-out
 */
export function conductAMSPAudit(data) {
  const {
    patient_id,
    prescribed_by_doctor_id,
    restricted_antibiotic_name,
    indication,
    pre_auth_approved = 0,
    culture_guided = 1,
    review_72h_action = 'CONTINUE',
    pharmacist_reviewer
  } = data;

  if (!patient_id || !prescribed_by_doctor_id || !restricted_antibiotic_name || !indication || !pharmacist_reviewer) {
    throw new Error('Missing required fields for AMSP antibiotic audit');
  }

  const validActions = ['CONTINUE', 'DE_ESCALATE', 'DISCONTINUE', 'SWITCH_TO_ORAL'];
  if (!validActions.includes(review_72h_action)) {
    throw new Error(`Invalid 72h review action: ${review_72h_action}. Must be one of: ${validActions.join(', ')}`);
  }

  const isRestricted = RESTRICTED_ANTIBIOTICS.some(
    rx => restricted_antibiotic_name.toUpperCase().includes(rx)
  );

  const audit_id = `AMSP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO amsp_antibiotic_audits (
      audit_id, patient_id, prescribed_by_doctor_id, restricted_antibiotic_name,
      indication, pre_auth_approved, culture_guided, review_72h_action,
      pharmacist_reviewer
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    audit_id,
    patient_id,
    prescribed_by_doctor_id,
    restricted_antibiotic_name,
    indication,
    pre_auth_approved ? 1 : 0,
    culture_guided ? 1 : 0,
    review_72h_action,
    pharmacist_reviewer
  );

  return {
    success: true,
    audit_id,
    isRestricted,
    review_72h_action,
    pre_auth_approved: Boolean(pre_auth_approved),
    message: `AMSP 72-hour clinical time-out recorded. Recommendation: ${review_72h_action}`
  };
}

/**
 * Get summary of HAI & AMSP metrics for NABH Quality Dashboard
 */
export function getInfectionControlMetrics() {
  const haiCounts = db.prepare(`
    SELECT infection_type, COUNT(*) as count 
    FROM hai_surveillance_logs 
    GROUP BY infection_type
  `).all();

  const amspActions = db.prepare(`
    SELECT review_72h_action, COUNT(*) as count 
    FROM amsp_antibiotic_audits 
    GROUP BY review_72h_action
  `).all();

  const totalHAI = db.prepare('SELECT COUNT(*) as count FROM hai_surveillance_logs').get().count;
  const totalAMSPAudits = db.prepare('SELECT COUNT(*) as count FROM amsp_antibiotic_audits').get().count;

  return {
    total_hai_recorded: totalHAI,
    hai_by_type: haiCounts,
    total_amsp_audits: totalAMSPAudits,
    amsp_actions_breakdown: amspActions,
    restricted_drugs_monitored: RESTRICTED_ANTIBIOTICS.length
  };
}
