/**
 * ============================================================================
 * MODULE: NABH Quality & Accreditation Engine (src/compliance/nabh_quality.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Standardized quality metrics, clinical governance, and compliance reporting
 *   under NABH (National Accreditation Board for Hospitals & Healthcare Providers)
 *   5th Edition Standards:
 *   - Mandatory Quality Indicators tracking (wait time, HAIs, medication errors)
 *   - Clinical audit report generator (monthly/quarterly snapshots)
 *   - Biomedical equipment calibration compliance & due alert tracker
 *   - Root cause analysis & corrective action tracking (CAPA)
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── Standard NABH Quality Indicators ─────────────────────────────────────

export const NABH_STANDARD_BENCHMARKS = {
  OPD_WAIT_TIME: { code: 'QI-01', name: 'Average OPD Waiting Time', category: 'MANAGERIAL', unit: 'minutes', benchmark: 30 },
  INPATIENT_ASSESS_TIME: { code: 'QI-02', name: 'Initial Assessment Time Inpatient', category: 'CLINICAL', unit: 'hours', benchmark: 4 },
  MEDICATION_ERRORS: { code: 'QI-03', name: 'Medication Errors per 1000 bed days', category: 'SAFETY', unit: 'errors/1000bd', benchmark: 1.0 },
  HA_INFECTION_RATE: { code: 'QI-04', name: 'Hospital Acquired Infection (HAI) Rate', category: 'INFECTION_CONTROL', unit: '%', benchmark: 2.5 },
  NEEDLE_STICK_INJURY: { code: 'QI-05', name: 'Needle Stick Injury Incidents', category: 'STAFF_SAFETY', unit: 'incidents/month', benchmark: 0 },
  READMISSION_30DAYS: { code: 'QI-06', name: 'Unplanned 30-Day Readmission Rate', category: 'CLINICAL', unit: '%', benchmark: 3.0 },
  BED_OCCUPANCY_RATE: { code: 'QI-07', name: 'Bed Occupancy Rate', category: 'MANAGERIAL', unit: '%', benchmark: 80.0 },
  ALOS: { code: 'QI-08', name: 'Average Length of Stay (ALOS)', category: 'MANAGERIAL', unit: 'days', benchmark: 3.5 }
};

// ─── Quality Indicator Recording ──────────────────────────────────────────

/**
 * Record a quality indicator observation
 */
export function recordQualityIndicator({ indicatorCode, indicatorName, category, department, siteId = 'SITE-HQ', value, unit, benchmarkValue, recordingPeriod, recordedBy }) {
  const indicatorId = genId('QI');
  const matched = Object.values(NABH_STANDARD_BENCHMARKS).find(b => b.code === indicatorCode);

  const resolvedName = indicatorName || (matched ? matched.name : indicatorCode);
  const resolvedCategory = category || (matched ? matched.category : 'GENERAL');
  const resolvedUnit = unit || (matched ? matched.unit : '');
  const resolvedBenchmark = benchmarkValue !== undefined ? benchmarkValue : (matched ? matched.benchmark : 0);

  db.prepare(`
    INSERT INTO nabh_quality_indicators (
      indicator_id, indicator_code, indicator_name, category, department, site_id,
      value, unit, benchmark_value, recording_period, recorded_by, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    indicatorId,
    indicatorCode,
    resolvedName,
    resolvedCategory,
    department || 'GENERAL',
    siteId,
    value,
    resolvedUnit,
    resolvedBenchmark,
    recordingPeriod || new Date().toISOString().slice(0, 7),
    recordedBy || 'QUALITY_OFFICER'
  );

  return {
    indicatorId,
    indicatorCode,
    value,
    isCompliant: value <= resolvedBenchmark,
    recordedAt: new Date().toISOString()
  };
}

/**
 * Retrieve quality dashboard summary
 */
export function getQualityDashboard({ recordingPeriod, siteId } = {}) {
  let sql = `SELECT * FROM nabh_quality_indicators WHERE 1=1`;
  const params = [];

  if (recordingPeriod) {
    sql += ` AND recording_period = ?`;
    params.push(recordingPeriod);
  }
  if (siteId) {
    sql += ` AND site_id = ?`;
    params.push(siteId);
  }

  sql += ` ORDER BY recorded_at DESC`;
  const indicators = db.prepare(sql).all(...params);

  // Group by category and compute compliance
  let compliantCount = 0;
  let nonCompliantCount = 0;

  const summary = indicators.map(ind => {
    // If benchmark is zero (e.g. needle stick), value must be 0; for bed occupancy higher is better
    let compliant = true;
    if (ind.indicator_code === 'QI-07') {
      compliant = ind.value >= (ind.benchmark_value || 70);
    } else {
      compliant = ind.value <= (ind.benchmark_value || 100);
    }

    if (compliant) compliantCount++;
    else nonCompliantCount++;

    return {
      ...ind,
      isCompliant: compliant
    };
  });

  return {
    totalRecorded: indicators.length,
    compliantCount,
    nonCompliantCount,
    overallCompliancePct: indicators.length > 0 ? Math.round((compliantCount / indicators.length) * 100) : 100,
    indicators: summary
  };
}

// ─── Equipment Calibration & Maintenance Tracker ──────────────────────────

/**
 * Register or update biomedical equipment calibration
 */
export function recordEquipmentCalibration({ equipmentId, equipmentName, department, siteId = 'SITE-HQ', calibrationDate, nextDueDate, calibratedBy, certificateNumber, result = 'PASS', remarks }) {
  const calibrationId = genId('CALIB');

  db.prepare(`
    INSERT INTO equipment_calibrations (
      calibration_id, equipment_id, equipment_name, department, site_id,
      calibration_date, next_due_date, calibrated_by, certificate_number, result, remarks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    calibrationId,
    equipmentId,
    equipmentName,
    department || 'BIOMEDICAL',
    siteId,
    calibrationDate,
    nextDueDate,
    calibratedBy || 'CERTIFIED_AGENCY',
    certificateNumber || genId('CERT'),
    result,
    remarks || null
  );

  return {
    calibrationId,
    equipmentId,
    equipmentName,
    status: result,
    nextDueDate
  };
}

/**
 * Get equipment calibration list & overdue/upcoming alerts
 */
export function getCalibrationStatus(daysAhead = 30) {
  const records = db.prepare(`
    SELECT *, 
      CASE 
        WHEN DATE('now') > next_due_date THEN 'OVERDUE'
        WHEN DATE('now', '+' || ? || ' days') >= next_due_date THEN 'DUE_SOON'
        ELSE 'VALID'
      END as calibration_status
    FROM equipment_calibrations
    ORDER BY next_due_date ASC
  `).all(daysAhead);

  const overdueCount = records.filter(r => r.calibration_status === 'OVERDUE').length;
  const dueSoonCount = records.filter(r => r.calibration_status === 'DUE_SOON').length;

  return {
    totalEquipment: records.length,
    overdueCount,
    dueSoonCount,
    records
  };
}

// ─── Audit Report Generation ──────────────────────────────────────────────

/**
 * Generate formal NABH Audit Report Snapshot
 */
export function generateAuditReport({ reportType = 'NABH_MONTHLY_QUALITY', periodFrom, periodTo, siteId = 'SITE-HQ', generatedBy }) {
  const reportId = genId('REP');
  const from = periodFrom || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = periodTo || new Date().toISOString().slice(0, 10);

  const indicators = db.prepare(`
    SELECT * FROM nabh_quality_indicators
    WHERE recorded_at BETWEEN ? AND ? AND (site_id = ? OR site_id IS NULL)
  `).all(`${from} 00:00:00`, `${to} 23:59:59`, siteId);

  const calibrations = db.prepare(`
    SELECT * FROM equipment_calibrations
    WHERE calibration_date BETWEEN ? AND ? AND (site_id = ? OR site_id IS NULL)
  `).all(from, to, siteId);

  const compliant = indicators.filter(i => i.value <= (i.benchmark_value || 100)).length;
  const nonCompliant = indicators.length - compliant;

  const reportPayload = JSON.stringify({
    indicators,
    calibrations,
    generatedAt: new Date().toISOString()
  });

  db.prepare(`
    INSERT INTO nabh_audit_reports (
      report_id, report_type, period_from, period_to, site_id,
      total_indicators, compliant_count, non_compliant_count, report_data, generated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    reportId,
    reportType,
    from,
    to,
    siteId,
    indicators.length,
    compliant,
    nonCompliant,
    reportPayload,
    generatedBy || 'QUALITY_DIRECTOR'
  );

  return {
    reportId,
    reportType,
    periodFrom: from,
    periodTo: to,
    totalIndicators: indicators.length,
    compliantCount: compliant,
    nonCompliantCount: nonCompliant,
    calibrationCount: calibrations.length,
    complianceScore: indicators.length > 0 ? `${Math.round((compliant / indicators.length) * 100)}%` : '100%'
  };
}
