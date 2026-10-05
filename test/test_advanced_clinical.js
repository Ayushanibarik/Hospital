/**
 * ============================================================================
 * TEST SUITE: Advanced Clinical, Engineering & Research Governance Subsystems
 * FILE: test/test_advanced_clinical.js
 * ============================================================================
 */

import assert from 'node:assert/strict';
import { initDB } from '../src/db/index.js';
import {
  recordHAISurveillance,
  conductAMSPAudit,
  getInfectionControlMetrics
} from '../src/advanced/infection_control.js';
import {
  activateEmergencyCode,
  resolveEmergencyCode,
  recordMockDrill,
  getEmergencyCodesDashboard
} from '../src/advanced/emergency_codes.js';
import {
  recordDialysisSession,
  reprocessDialyzer,
  recordROWaterTest,
  getDialysisUnitSummary
} from '../src/advanced/hemodialysis_unit.js';
import {
  calculateMostellerBSA,
  scheduleChemoCycle,
  dualVerifyChemoCycle,
  administerChemoCycle,
  reportExtravasation,
  getOncologyDashboardSummary
} from '../src/advanced/oncology_chemo.js';
import {
  recordCathlabProcedure,
  registerCardiacStent,
  getCathlabMetrics
} from '../src/advanced/cathlab_cardio.js';
import {
  registerBiomedicalAsset,
  raiseBreakdownWorkOrder,
  completeWorkOrder,
  logPPMCheck,
  getCMMSDashboard
} from '../src/advanced/biomedical_cmms.js';
import {
  registerTrialProtocol,
  reportSeriousAdverseEvent,
  submit14DayDetailedReport,
  getClinicalTrialsDashboard
} from '../src/advanced/clinical_trials.js';
import {
  recordNICUAssessment,
  logKMCSession,
  recordTelemedicineConsultation,
  getNICUAndTelemedSummary
} from '../src/advanced/nicu_telemedicine.js';
import { getAdvancedClinicalStatus } from '../src/workflows/engine.js';

console.log('🧪 Starting Advanced Clinical, Engineering & Governance Test Suite...\n');

// Initialize database schema
initDB();

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}\n`);
    failed++;
  }
}

// 1. Infection Control & AMSP
runTest('1. HAI Surveillance & ICMR AMSP Audit', () => {
  const hai = recordHAISurveillance({
    patient_id: 'PAT-IC-001',
    ward_id: 'ICU-B',
    infection_type: 'CAUTI',
    device_days_at_onset: 7,
    culture_organism: 'Klebsiella pneumoniae (MDR)',
    antibiogram_sensitivity: 'Resistant to Ciprofloxacin, Sensitive to Colistin',
    bundle_compliance_passed: 1,
    infection_control_officer: 'DOC-ICO-441'
  });
  assert.equal(hai.success, true);
  assert.equal(hai.infection_type, 'CAUTI');

  const amsp = conductAMSPAudit({
    patient_id: 'PAT-IC-001',
    prescribed_by_doctor_id: 'DOC-INT-09',
    restricted_antibiotic_name: 'COLISTIN_IV',
    indication: 'Ventilator-associated sepsis with MDR Klebsiella',
    pre_auth_approved: 1,
    culture_guided: 1,
    review_72h_action: 'CONTINUE',
    pharmacist_reviewer: 'PHARM-AMSP-02'
  });
  assert.equal(amsp.success, true);
  assert.equal(amsp.isRestricted, true);
  assert.equal(amsp.review_72h_action, 'CONTINUE');

  const metrics = getInfectionControlMetrics();
  assert.ok(metrics.total_hai_recorded >= 1);
  assert.ok(metrics.total_amsp_audits >= 1);
});

// 2. Emergency Codes & Disaster Management
runTest('2. Emergency Codes (Code Blue, Code Red RACE/PASS, Mock Drills)', () => {
  const code = activateEmergencyCode({
    code_type: 'CODE_BLUE',
    location_detail: 'ICU Bed 4, 3rd Floor East Wing',
    activated_by: 'NURSE-ICU-08'
  });
  assert.equal(code.success, true);
  assert.equal(code.status, 'ACTIVE_PAGING');
  assert.equal(code.code_type, 'CODE_BLUE');

  const resolved = resolveEmergencyCode(code.activation_id, {
    team_arrival_time: new Date().toISOString(),
    response_time_seconds: 95,
    cpr_initiated: 1,
    defibrillation_delivered: 1,
    outcome: 'ROSC_ACHIEVED_TRANSFERRED_ICU',
    team_leader_signature: 'DR-ANESTHESIA-LEAD'
  });
  assert.equal(resolved.success, true);
  assert.equal(resolved.status, 'CLOSED');
  assert.equal(resolved.outcome, 'ROSC_ACHIEVED_TRANSFERRED_ICU');

  const drill = recordMockDrill({
    code_type: 'CODE_RED',
    location: 'Dietary Kitchen Floor 1',
    drill_date: '2026-10-01',
    response_time_seconds: 105,
    competency_rating_pct: 98,
    corrective_actions: 'RACE evacuation drill executed flawlessly by nursing staff.',
    safety_officer_id: 'SO-FMS-01'
  });
  assert.equal(drill.success, true);
  assert.equal(drill.competency_rating_pct, 98);

  const dash = getEmergencyCodesDashboard();
  assert.ok(dash.historical_summary.length >= 1);
});

// 3. Hemodialysis Unit & ISO 23500 Water Quality
runTest('3. Hemodialysis Unit & ISO 23500 Water Quality & Dialyzer Reprocessing', () => {
  const session = recordDialysisSession({
    patient_id: 'PAT-RENAL-101',
    station_number: 'ST-04-HEPATITIS-ISOLATION',
    machine_id: 'FRESENIUS-5008-04',
    serology_status: 'HEPATITIS_B_POSITIVE',
    pre_weight_kg: 68.5,
    post_weight_kg: 65.5,
    blood_flow_rate_ml_min: 350,
    dialysate_flow_rate_ml_min: 500,
    heparin_dose_units: 4000,
    primary_technician_id: 'TECH-DIAL-09',
    nephrologist_id: 'DOC-NEPHRO-01'
  });
  assert.equal(session.success, true);
  assert.equal(session.ultrafiltration_volume_ml, 3000);
  assert.equal(session.serology_status, 'HEPATITIS_B_POSITIVE');

  const dialyzerId = `DLZ-${Date.now()}`;
  const reprocess1 = reprocessDialyzer({
    dialyzer_barcode: dialyzerId,
    patient_id: 'PAT-RENAL-101',
    reuse_cycle_count: 2,
    bundle_volume_pct: 88.5,
    pressure_leak_test_passed: 1,
    reprocessed_by: 'TECH-DIAL-09'
  });
  assert.equal(reprocess1.success, true);
  assert.equal(reprocess1.is_eligible_for_use, true);

  // Cross-patient reuse rejection test (strictly illegal)
  assert.throws(() => {
    reprocessDialyzer({
      dialyzer_barcode: dialyzerId,
      patient_id: 'PAT-RENAL-OTHER-999',
      reuse_cycle_count: 3,
      bundle_volume_pct: 85.0,
      pressure_leak_test_passed: 1,
      reprocessed_by: 'TECH-DIAL-09'
    });
  }, /CRITICAL CLINICAL HAZARD: Dialyzer .* was previously used by patient/);

  // RO Water Test ISO 23500 Compliance Check
  const roTest = recordROWaterTest({
    sampling_point: 'LOOP-RETURN-DIALYSIS-A',
    microbial_cfu_ml: 12.0, // < 100 CFU/mL
    endotoxin_eu_ml: 0.04,  // < 0.25 EU/mL
    conductivity_us_cm: 11.2,
    tested_by: 'LAB-MICRO-05'
  });
  assert.equal(roTest.success, true);
  assert.equal(roTest.is_iso23500_compliant, true);

  const summary = getDialysisUnitSummary();
  assert.ok(summary.total_sessions_completed >= 1);
});

// 4. Oncology Chemotherapy Daycare & Cytotoxic Safety
runTest('4. Oncology Mosteller BSA, Dual-Signoff & Extravasation Protocol', () => {
  const bsa = calculateMostellerBSA(170, 70); // sqrt(170*70/3600) = sqrt(3.3055) = 1.82
  assert.equal(bsa, 1.82);

  const cycle = scheduleChemoCycle({
    patient_id: 'PAT-ONCO-88',
    protocol_name: 'AC-T (Doxorubicin + Cyclophosphamide)',
    cycle_number: 1,
    total_cycles: 4,
    height_cm: 170,
    weight_kg: 70,
    oncologist_signature: 'DR-ONCO-MED-99',
    cytotoxic_drugs: 'Doxorubicin 60mg/m2 (109.2mg), Cyclophosphamide 600mg/m2 (1092mg)'
  });
  assert.equal(cycle.success, true);
  assert.equal(cycle.status, 'PRESCRIBED');

  // Verify blocked if nurse tries to administer before pharmacist dual-verification
  assert.throws(() => {
    administerChemoCycle(cycle.cycle_id, 'NURSE-ONCO-01');
  }, /Cannot administer chemo cycle .* Dual pharmacist verification is mandatory/);

  // Oncology Pharmacist dual checks
  const verified = dualVerifyChemoCycle(cycle.cycle_id, 'PHARM-ONCO-SPECIALIST-04');
  assert.equal(verified.success, true);
  assert.equal(verified.status, 'VERIFIED_DUAL');

  // Now nurse can safely administer
  const administered = administerChemoCycle(cycle.cycle_id, 'NURSE-ONCO-01');
  assert.equal(administered.success, true);
  assert.equal(administered.status, 'ADMINISTERED');

  // Extravasation emergency incident handling
  const extrav = reportExtravasation({
    cycle_id: cycle.cycle_id,
    patient_id: 'PAT-ONCO-88',
    drug_name: 'Doxorubicin',
    extravasation_grade: 'GRADE_2_VESICANT_ULCERATION',
    infusion_stopped_immediately: 1,
    cannula_retained_for_aspiration: 1,
    antidote_administered: 'Dexrazoxane IV + Cold Pack Application',
    reported_by: 'NURSE-ONCO-01'
  });
  assert.equal(extrav.success, true);
  assert.equal(extrav.antidote_administered, 'Dexrazoxane IV + Cold Pack Application');

  const oncoSummary = getOncologyDashboardSummary();
  assert.ok(oncoSummary.total_chemo_cycles >= 1);
});

// 5. Cath Lab & Interventional Cardiology (STEMI D2B Benchmark)
runTest('5. Cath Lab STEMI Door-to-Balloon <=90 min & Stent Registry', () => {
  const erArrival = new Date(Date.now() - 52 * 60000).toISOString();
  const balloonCross = new Date().toISOString();

  const pci = recordCathlabProcedure({
    patient_id: 'PAT-CARDIO-55',
    procedure_type: 'PRIMARY_PCI_STEMI',
    is_stemi_case: 1,
    er_arrival_time: erArrival,
    balloon_cross_time: balloonCross,
    vascular_access: 'RIGHT_RADIAL',
    contrast_volume_ml: 65.0,
    fluoroscopy_time_minutes: 8.5,
    cumulative_air_kerma_mgy: 420.0,
    interventional_cardiologist_id: 'DR-CARDIO-LEAD'
  });
  assert.equal(pci.success, true);
  assert.equal(pci.d2b_benchmark_passed, true);
  assert.ok(pci.door_to_balloon_minutes <= 90);

  const stent = registerCardiacStent({
    procedure_id: pci.procedure_id,
    patient_id: 'PAT-CARDIO-55',
    vessel_location: 'LEFT_ANTERIOR_DESCENDING_PROXIMAL',
    stent_type: 'DRUG_ELUTING_STENT_DES',
    brand_name: 'Xience Sierra Everolimus-Eluting Stent',
    serial_number: `DES-SN-${Date.now()}`,
    diameter_mm: 3.5,
    length_mm: 28.0,
    deployment_pressure_atm: 16.0,
    final_timi_flow: 'TIMI_3'
  });
  assert.equal(stent.success, true);
  assert.equal(stent.final_timi_flow, 'TIMI_3');

  const metrics = getCathlabMetrics();
  assert.ok(metrics.total_procedures >= 1);
  assert.ok(metrics.total_stents_implanted >= 1);
});

// 6. Biomedical Engineering CMMS & Uptime
runTest('6. Biomedical Engineering CMMS Asset Lifecycle, Work Orders & PPM', () => {
  const assetTag = `VENT-${Date.now()}`;
  const asset = registerBiomedicalAsset({
    asset_tag: assetTag,
    equipment_name: 'Maquet Servo-u ICU Ventilator',
    category: 'CRITICAL_LIFE_SUPPORT',
    department: 'Medical ICU',
    make_model: 'Getinge Servo-u V4.2',
    serial_number: 'MKQ-99412-BME'
  });
  assert.equal(asset.success, true);
  assert.equal(asset.category, 'CRITICAL_LIFE_SUPPORT');

  const wo = raiseBreakdownWorkOrder({
    asset_tag: assetTag,
    work_type: 'BREAKDOWN_CORRECTIVE',
    complaint_description: 'Expiratory cassette leak alarm during pre-use self-check',
    reported_by_staff: 'NURSE-ICU-LEAD'
  });
  assert.equal(wo.success, true);
  assert.equal(wo.status, 'OPEN_ASSIGNED');

  const completed = completeWorkOrder(wo.work_order_id, {
    repaired_at: new Date().toISOString(),
    downtime_hours: 1.5,
    parts_replaced: 'Expiratory valve silicone diaphragm',
    cost_inr: 3200,
    post_maintenance_calibration_passed: 1
  });
  assert.equal(completed.success, true);
  assert.equal(completed.status, 'CLOSED');
  assert.equal(completed.calibration_verified, true);

  const ppm = logPPMCheck({
    asset_tag: assetTag,
    periodicity: 'QUARTERLY',
    technician_id: 'BME-TECH-03'
  });
  assert.equal(ppm.success, true);
  assert.equal(ppm.compliance_status, 'UP_TO_DATE');

  const cmms = getCMMSDashboard();
  assert.ok(cmms.total_assets_registered >= 1);
});

// 7. Clinical Trials & CDSCO 24h SAE Intimation
runTest('7. Clinical Trials CDSCO NDCT Rules 2019 & Statutory 24h SAE Reporting', () => {
  const trial = registerTrialProtocol({
    ctri_number: `CTRI/2026/04/${Date.now().toString().slice(-6)}`,
    cdsco_permission_number: 'CDSCO-CT-PERM-88912',
    study_title: 'Phase III Randomized Double-Blind Efficacy of Novel SGLT2i in T2DM',
    principal_investigator_id: 'DR-PI-ENDOCRINE',
    ethics_committee_reg_number: 'ECR/429/Inst/MH/2013/RR-20',
    total_subjects_enrolled: 150
  });
  assert.equal(trial.success, true);
  assert.equal(trial.status, 'ACTIVE_RECRUITING');

  // Report SAE occurring 2 hours ago (within 24h window)
  const onset2HoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
  const sae = reportSeriousAdverseEvent({
    trial_id: trial.trial_id,
    subject_screening_id: 'SUB-MH-042',
    event_description: 'Sudden onset acute ketoacidosis requiring emergency hospitalization',
    onset_datetime: onset2HoursAgo,
    investigator_signature: 'DR-PI-ENDOCRINE',
    causality_assessment: 'PROBABLE'
  });
  assert.equal(sae.success, true);
  assert.equal(sae.statutory_24h_compliant, true);

  const report14d = submit14DayDetailedReport(sae.sae_report_id);
  assert.equal(report14d.success, true);
  assert.equal(report14d.detailed_14d_report_submitted, true);

  const ctDash = getClinicalTrialsDashboard();
  assert.ok(ctDash.active_trials_count >= 1);
  assert.ok(ctDash.sae_24h_compliance_rate_pct >= 90);
});

// 8. NICU Care & Telemedicine Guidelines 2020 Prohibited Drug Safety
runTest('8. NICU APGAR/KMC & MoHFW Telemedicine Prohibited Drug Screening', () => {
  const neonateId = `NEO-${Date.now()}`;
  const nicu = recordNICUAssessment({
    mother_patient_id: 'PAT-MOTHER-20',
    neonate_id: neonateId,
    gestational_age_weeks: 34.5,
    birth_weight_grams: 1950,
    apgar_1_min: 7,
    apgar_5_min: 9,
    apgar_10_min: 10,
    kmc_sessions_total_hours: 4.0,
    pediatrician_id: 'DR-PEDIATRICIAN-02'
  });
  assert.equal(nicu.success, true);
  assert.equal(nicu.status, 'STABLE_IN_NICU');

  const kmc = logKMCSession(neonateId, 3.5);
  assert.equal(kmc.success, true);
  assert.equal(kmc.cumulative_kmc_hours, 7.5);

  // Compliant Telemedicine Consult
  const telemed = recordTelemedicineConsultation({
    patient_id: 'PAT-TELE-01',
    rmp_doctor_id: 'DOC-GEN-MED-12',
    rmp_registration_number: 'MCI-REG-2015-88412',
    mode: 'VIDEO',
    consent_type: 'IMPLIED_PATIENT_INITIATED',
    diagnosis_or_provisional: 'Acute Viral Pharyngitis',
    prescribed_medications: ['Paracetamol 650mg TDS', 'Cetirizine 10mg OD', 'Warm Saline Gargles']
  });
  assert.equal(telemed.success, true);
  assert.equal(telemed.prohibited_substance_screen_passed, true);

  // Prohibited Substance Rejection (e.g. Morphine or Ketamine prescribed via telemed)
  assert.throws(() => {
    recordTelemedicineConsultation({
      patient_id: 'PAT-TELE-02',
      rmp_doctor_id: 'DOC-GEN-MED-12',
      rmp_registration_number: 'MCI-REG-2015-88412',
      mode: 'VIDEO',
      consent_type: 'IMPLIED_PATIENT_INITIATED',
      diagnosis_or_provisional: 'Severe Back Pain',
      prescribed_medications: ['Paracetamol 500mg', 'MORPHINE 10mg']
    });
  }, /STATUTORY VIOLATION \(MoHFW Telemedicine Guidelines 2020\): MORPHINE is on the Prohibited List/);

  const nicuSummary = getNICUAndTelemedSummary();
  assert.ok(nicuSummary.nicu_total_infants >= 1);
  assert.ok(nicuSummary.telemedicine_total_consultations >= 1);
});

// 9. Master Advanced Status Verification
runTest('9. Advanced Clinical Status Endpoint Coverage', () => {
  const status = getAdvancedClinicalStatus();
  assert.equal(status.total_advanced_modules, 8);
  assert.equal(status.online_advanced_modules, 8);
  assert.equal(status.coverage_pct, 100);
  assert.equal(status.modules.length, 8);
});

console.log(`\n======================================================`);
console.log(`Advanced Clinical & Engineering Tests: ${passed} Passed, ${failed} Failed`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
}
