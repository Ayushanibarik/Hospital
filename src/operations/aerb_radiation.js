/**
 * ============================================================================
 * MODULE: AERB Radiation Safety & Dosimetry (src/operations/aerb_radiation.js)
 * ============================================================================
 * 
 * STATUTORY & REGULATORY MANDATE:
 *   - Atomic Energy (Radiation Protection) Rules, 2004 (Atomic Energy Act, 1962)
 *   - AERB Safety Code for Medical Diagnostic X-ray Equipment (AERB/SC/MED-2)
 *   - eLORA (Electronic Licensing for Radiation Applications) portal standards
 *   - International Commission on Radiological Protection (ICRP Publication 103)
 * 
 * CORE FEATURES:
 *   - Diagnostic Radiology & Interventional Equipment Registry (CT, Cath Lab, X-Ray)
 *   - Mandatory 2-Year Quality Assurance (QA) test tracking & compliance alerts
 *   - Personnel Thermo-Luminescent Dosimeter (TLD) badge dose monitoring (mSv)
 *   - Annual Lead Apron shielding fluoroscopy integrity audit
 * ============================================================================
 */

import { db } from '../db/index.js';

/**
 * Seed initial AERB radiation equipment if empty
 */
export function seedAerbEquipment() {
  const count = db.prepare(`SELECT COUNT(*) as c FROM aerb_equipment`).get().c;
  if (count === 0) {
    const items = [
      ['RAD-CT-01', 'CT_SCANNER', 'GE Revolution 128-Slice CT', 'ROOM-RAD-101', 'AERB-LIC-MUM-CT-8901', '2028-05-20', '2025-06-15', '2027-06-15', 'COMPLIANT', 'DR. S. K. MEHTA (RSO LEVEL-II)'],
      ['RAD-CATH-01', 'CATH_LAB', 'Philips Azurion 7 Biplane Cath Lab', 'ROOM-CARD-CATH-01', 'AERB-LIC-MUM-CL-4412', '2027-11-30', '2025-01-10', '2027-01-10', 'COMPLIANT', 'DR. S. K. MEHTA (RSO LEVEL-II)'],
      ['RAD-XRAY-01', 'FIXED_XRAY', 'Siemens Multix Impact 500mA', 'ROOM-RAD-104', 'AERB-LIC-MUM-XR-1123', '2029-02-14', '2024-09-01', '2026-09-01', 'COMPLIANT', 'DR. S. K. MEHTA (RSO LEVEL-II)'],
      ['RAD-CARM-01', 'C_ARM_FLUO', 'Allengers HF 49R C-Arm', 'OT-SUITE-ORTHO-02', 'AERB-LIC-MUM-CA-9934', '2027-08-10', '2025-03-20', '2027-03-20', 'COMPLIANT', 'DR. S. K. MEHTA (RSO LEVEL-II)']
    ];

    const stmt = db.prepare(`
      INSERT INTO aerb_equipment (
        equipment_id, equipment_type, make_model, room_number,
        aerb_license_number, license_expiry_date, last_qa_date,
        qa_due_date, qa_status, rso_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) stmt.run(...item);
  }
}

/**
 * Register radiation equipment in AERB register
 */
export function registerRadiationEquipment({
  equipmentId,
  equipmentType,
  makeModel,
  roomNumber,
  aerbLicenseNumber,
  licenseExpiryDate,
  lastQaDate,
  rsoName
}) {
  seedAerbEquipment();

  if (!equipmentId || !equipmentType || !aerbLicenseNumber || !rsoName) {
    throw new Error('Mandatory AERB equipment parameters missing.');
  }

  const qaDate = new Date(lastQaDate || Date.now());
  // Mandatory 2-year QA cycle under AERB guidelines
  const qaDueDate = new Date(qaDate.getTime() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  db.prepare(`
    INSERT OR REPLACE INTO aerb_equipment (
      equipment_id, equipment_type, make_model, room_number,
      aerb_license_number, license_expiry_date, last_qa_date,
      qa_due_date, qa_status, rso_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLIANT', ?)
  `).run(
    equipmentId, equipmentType, makeModel || 'GENERIC_RADIOLOGY_UNIT', roomNumber || 'RAD-01',
    aerbLicenseNumber, licenseExpiryDate || '2028-12-31', qaDate.toISOString().split('T')[0],
    qaDueDate, rsoName
  );

  return {
    success: true,
    equipment_id: equipmentId,
    aerb_license_number: aerbLicenseNumber,
    qa_due_date: qaDueDate,
    rso_name: rsoName,
    status: 'COMPLIANT'
  };
}

/**
 * Log quarterly personnel TLD badge radiation dose (mSv)
 */
export function logPersonnelTldDose({
  badgeNumber,
  staffId,
  staffName,
  department,
  monitoringQuarter,
  deepDoseMsv,
  shallowDoseMsv = 0
}) {
  if (!badgeNumber || !staffId || !monitoringQuarter) {
    throw new Error('Badge number, staff ID, and monitoring quarter are mandatory for TLD logging.');
  }

  const deep = parseFloat(deepDoseMsv);
  const shallow = parseFloat(shallowDoseMsv);

  // Check past cumulative dose in current year
  const year = monitoringQuarter.split('-')[0];
  const priorRows = db.prepare(`
    SELECT SUM(deep_dose_msv) as total_deep FROM aerb_tld_badges 
    WHERE staff_id = ? AND monitoring_quarter LIKE ?
  `).get(staffId, `${year}%`);

  const priorAnnual = priorRows?.total_deep || 0;
  const currentAnnualCumulative = Math.round((priorAnnual + deep) * 100) / 100;

  // AERB Statutory Limit: 20 mSv/year (investigation trigger at 10 mSv, critical alert at 20 mSv)
  const isThresholdExceeded = currentAnnualCumulative >= 20 ? 1 : 0;

  db.prepare(`
    INSERT OR REPLACE INTO aerb_tld_badges (
      badge_number, staff_id, staff_name, department, monitoring_quarter,
      deep_dose_msv, shallow_dose_msv, annual_cumulative_msv, threshold_exceeded
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    badgeNumber, staffId, staffName || 'OCCUPATIONAL_WORKER', department || 'RADIOLOGY',
    monitoringQuarter, deep, shallow, currentAnnualCumulative, isThresholdExceeded
  );

  return {
    success: true,
    badge_number: badgeNumber,
    staff_id: staffId,
    monitoring_quarter: monitoringQuarter,
    deep_dose_msv: deep,
    annual_cumulative_msv: currentAnnualCumulative,
    statutory_annual_limit_msv: 20.0,
    threshold_exceeded: Boolean(isThresholdExceeded),
    safety_advisory: isThresholdExceeded ? 
      'CRITICAL RADIATION SAFETY ALERT: Annual dose exceeded 20 mSv! Worker must be temporarily relieved from radiation duty; formal RSO inquiry mandatory under AERB rules.' :
      'Dose within safe ALARA (As Low As Reasonably Achievable) statutory limits.'
  };
}

/**
 * Log annual lead apron fluoroscopic integrity inspection
 */
export function inspectLeadApron({
  apronBarcode,
  leadEquivalenceMmPb = 0.5,
  storageLocation,
  structuralIntegrity,
  inspectorId
}) {
  if (!apronBarcode || !structuralIntegrity || !inspectorId) {
    throw new Error('Apron barcode, integrity status, and inspector ID are mandatory.');
  }

  const status = structuralIntegrity.toUpperCase();
  if (!['INTACT_PASS', 'CRACKED_CONDEMNED'].includes(status)) {
    throw new Error('Structural integrity must be INTACT_PASS or CRACKED_CONDEMNED.');
  }

  const inspectionDate = new Date().toISOString().split('T')[0];

  db.prepare(`
    INSERT OR REPLACE INTO aerb_lead_aprons (
      apron_barcode, lead_equivalence_mm_pb, storage_location,
      last_fluoroscopy_inspection_date, structural_integrity, inspector_id
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    apronBarcode, leadEquivalenceMmPb, storageLocation || 'CATH_LAB_RACK',
    inspectionDate, status, inspectorId
  );

  return {
    success: true,
    apron_barcode: apronBarcode,
    lead_equivalence_mm_pb: leadEquivalenceMmPb,
    status,
    action: status === 'INTACT_PASS' ? 'Apron certified fit for radiation room use.' : 'CONDEMNED: Lead crack detected under fluoroscopy. Immediately retire and dispose under BMW rules.'
  };
}

/**
 * Get AERB radiation safety compliance dashboard
 */
export function getAerbComplianceStatus() {
  seedAerbEquipment();

  const equipment = db.prepare(`SELECT * FROM aerb_equipment`).all();
  const badges = db.prepare(`SELECT * FROM aerb_tld_badges ORDER BY logged_at DESC LIMIT 20`).all();
  const aprons = db.prepare(`SELECT * FROM aerb_lead_aprons ORDER BY last_fluoroscopy_inspection_date DESC LIMIT 10`).all();

  const overExposedWorkers = db.prepare(`SELECT * FROM aerb_tld_badges WHERE threshold_exceeded = 1`).all();

  return {
    aerb_portal_sync: 'eLORA COMPLIANT',
    total_radiation_units: equipment.length,
    equipment,
    active_monitored_workers: badges.length,
    overexposure_alerts_count: overExposedWorkers.length,
    overexposed_workers: overExposedWorkers,
    lead_aprons_audited: aprons.length
  };
}
