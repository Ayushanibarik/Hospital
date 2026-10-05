/**
 * ============================================================================
 * TEST SUITE: Doctor & Nursing Clinical Workstation
 * FILE: test/test_clinical_workstation.js
 * ============================================================================
 */

import assert from 'node:assert/strict';
import { initDB } from '../src/db/index.js';
import {
  recordClinicalEncounter,
  recordVitalSigns,
  recordFluidBalance,
  recordEmergencyTriage,
  recordISBARHandover,
  generateDischargeSummary,
  getClinicalWorkstationDashboard
} from '../src/clinical/clinical_workstation.js';

console.log('🧪 Starting Doctor & Nursing Clinical Workstation Test Suite...\n');

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

// 1. Doctor Clinical Encounter & SOAP Notes
runTest('1. Clinical SOAP Encounter & ICD-10 Codification', () => {
  const enc = recordClinicalEncounter({
    patient_id: 'PAT-CLIN-001',
    doctor_id: 'DOC-CARDIO-01',
    department: 'Cardiology',
    encounter_type: 'OPD_CONSULTATION',
    chief_complaints: 'Acute retrosternal chest tightness x 2 hours radiating to left shoulder',
    history_present_illness: 'Patient experienced sudden squeezing chest discomfort while climbing stairs. Associated with cold sweating.',
    subjective_notes: 'Known hypertensive x 5 years on Telmisartan 40mg. Non-smoker. No known drug allergies.',
    objective_findings: 'BP 160/95 mmHg, Pulse 92 bpm, SpO2 97% on room air. S1 S2 heard, no murmurs. Bilateral vesicular breath sounds.',
    physical_exam_picle: 'PICLE negative. No pedal edema.',
    assessment_provisional: 'Acute Coronary Syndrome - NSTEMI',
    final_icd10_code: 'I21.4',
    plan_treatment: 'Stat ECG, Troponin I, Aspirin 300mg + Clopidogrel 300mg + Atorvastatin 80mg. Shift to CCU for urgent CAG.',
    follow_up_advice: 'Urgent Coronary Angiogram recommended within 24 hours.'
  });

  assert.equal(enc.success, true);
  assert.equal(enc.final_icd10_code, 'I21.4');
  assert.equal(enc.encounter_type, 'OPD_CONSULTATION');
});

// 2. Vital Signs TPR Charting & MEWS Alert
runTest('2. Vital Signs Charting & MEWS Critical Early Warning Alert', () => {
  // Normal vitals
  const normalVitals = recordVitalSigns({
    patient_id: 'PAT-CLIN-001',
    bp_systolic: 120,
    bp_diastolic: 80,
    pulse_bpm: 74,
    respiratory_rate: 16,
    temp_fahrenheit: 98.4,
    spo2_pct: 99,
    recorded_by_nurse: 'NURSE-TRIAGE-01'
  });
  assert.equal(normalVitals.success, true);
  assert.equal(normalVitals.critical_alert, false);
  assert.equal(normalVitals.mews_score, 0);

  // Critical decompensating vitals (hypotension, hypoxia, tachypnea)
  const criticalVitals = recordVitalSigns({
    patient_id: 'PAT-CLIN-002',
    bp_systolic: 80, // < 90
    bp_diastolic: 50,
    pulse_bpm: 130, // > 120
    respiratory_rate: 28, // > 24
    temp_fahrenheit: 103.2, // > 102
    spo2_pct: 88, // < 92
    gcs_score: 11, // < 13
    recorded_by_nurse: 'NURSE-ICU-04'
  });
  assert.equal(criticalVitals.success, true);
  assert.equal(criticalVitals.critical_alert, true);
  assert.ok(criticalVitals.mews_score >= 8);
  assert.ok(criticalVitals.clinical_flags.length >= 4);
});

// 3. Fluid Balance (Intake / Output TPR)
runTest('3. Inpatient Nursing Fluid Balance (Intake/Output Shift Chart)', () => {
  const balance = recordFluidBalance({
    patient_id: 'PAT-CLIN-001',
    admission_id: 'ADM-IPD-8821',
    shift: 'MORNING',
    intake_oral_ml: 400,
    intake_iv_ml: 1000,
    output_urine_ml: 650,
    output_drain_ml: 50,
    recorded_by: 'NURSE-WARD-B'
  });

  assert.equal(balance.success, true);
  assert.equal(balance.total_intake_ml, 1400);
  assert.equal(balance.total_output_ml, 700);
  assert.equal(balance.net_balance_ml, 700);
});

// 4. Emergency Severity Index (ESI) Triage Level 1 to 5
runTest('4. Emergency Severity Index (ESI) 5-Level Triage & Bay Allocation', () => {
  const triage = recordEmergencyTriage({
    patient_id: 'PAT-EMERG-99',
    esi_level: 'LEVEL_1_RESUSCITATION',
    presenting_symptoms: 'Cardiac arrest following road traffic accident, CPR ongoing',
    assigned_bay: 'RESUSCITATION_BAY_RED',
    triaged_by_nurse: 'NURSE-ED-CHARGE'
  });

  assert.equal(triage.success, true);
  assert.equal(triage.esi_level, 'LEVEL_1_RESUSCITATION');
  assert.equal(triage.clinical_urgency, 'IMMEDIATE_LIFE_SAVING');
});

// 5. Nursing ISBAR Shift Handover Note
runTest('5. Nursing ISBAR Structured Shift Handover', () => {
  const isbar = recordISBARHandover({
    ward_id: 'ICU-CARDIAC',
    shift: 'MORNING_TO_EVENING',
    outgoing_nurse: 'Sister Sunita (RN)',
    incoming_nurse: 'Sister Priya (RN)',
    patient_id: 'PAT-CLIN-001',
    situation: 'Post-primary PCI day 1, stable on dual antiplatelets and low-dose noradrenaline taper',
    background: '62M admitted with STEMI, successful DES stenting to proximal LAD at 10:30 AM',
    assessment: 'Vitals stable: BP 118/76, HR 70 sinus rhythm, radial puncture site clean with TR band released, urine output 45ml/hr',
    recommendation: 'Monitor radial access site for hematoma, check repeat KFT & Troponin at 6 PM, continue infusion pump protocol'
  });

  assert.equal(isbar.success, true);
  assert.equal(isbar.outgoing_nurse, 'Sister Sunita (RN)');
  assert.equal(isbar.incoming_nurse, 'Sister Priya (RN)');
});

// 6. Clinical Inpatient Discharge Summary
runTest('6. Comprehensive Clinical Discharge Summary (ICD-10, Condition & SOS Red Flags)', () => {
  const summary = generateDischargeSummary({
    patient_id: 'PAT-CLIN-001',
    admission_id: 'ADM-IPD-8821',
    attending_doctor_id: 'DOC-CARDIO-01',
    admission_date: '2026-10-01',
    discharge_date: '2026-10-05',
    primary_diagnosis_icd10: 'I21.0 - Acute transmural myocardial infarction of anterior wall',
    secondary_diagnoses: 'I10 - Essential hypertension; E11.9 - Type 2 diabetes mellitus',
    hospital_course_summary: 'Patient presented with acute anterior wall STEMI. Underwent emergency primary PCI with DES to LAD within 52 minutes of arrival (Door-to-Balloon passed). Post-procedure CCU course uneventful, mobilised on Day 3.',
    surgical_procedures_done: 'Emergency Primary PCI with Drug-Eluting Stent (Xience Sierra 3.5x28mm) to LAD under Right Radial Access',
    discharge_condition: 'STABLE_IMPROVED',
    discharge_medications: [
      'Tab Aspirin 75mg once daily after lunch',
      'Tab Ticagrelor 90mg twice daily',
      'Tab Atorvastatin 40mg once daily at bedtime',
      'Tab Metoprolol Succinate 25mg once daily'
    ],
    dietary_lifestyle_advice: 'Cardiac diet: low salt (<2g/day), low oil, diabetic diet, daily 30 min gentle walk, avoid strenuous heavy lifting',
    red_flag_sos_symptoms: 'Recurrent chest discomfort, breathlessness on lying down, excessive sweating, bleeding from any site - visit Emergency immediately',
    follow_up_schedule: 'Review in Cardiology OPD on 12-Oct-2026 with repeat ECG and fasting lipid profile',
    final_signoff_doctor: 'Dr. R. K. Sharma (MD, DM Cardiology, Reg: MCI-33891)'
  });

  assert.equal(summary.success, true);
  assert.equal(summary.discharge_condition, 'STABLE_IMPROVED');
  assert.equal(summary.discharge_type, 'ROUTINE_PLANNED_DISCHARGE');
});

// 7. Clinical Workstation Dashboard Summary
runTest('7. Clinical Workstation Real-Time Dashboard KPI Metrics', () => {
  const dash = getClinicalWorkstationDashboard();
  assert.ok(dash.total_clinical_encounters >= 1);
  assert.ok(dash.total_vitals_logged >= 1);
  assert.ok(dash.emergency_triage.total_triaged >= 1);
  assert.ok(dash.total_discharge_summaries >= 1);
});

console.log(`\n======================================================`);
console.log(`Clinical Workstation Tests: ${passed} Passed, ${failed} Failed`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
}
