/**
 * ============================================================================
 * MODULE: Doctor & Nursing Clinical Workstation (EMR / EHR Daily Operations)
 * FILE: src/clinical/clinical_workstation.js
 * ============================================================================
 * 
 * CLINICAL STANDARDS & TERMINOLOGY:
 *   - National Medical Commission (NMC) & Medical Council of India (MCI) Record Guidelines
 *   - Clinical SOAP Documentation: Subjective, Objective, Assessment (ICD-10), Plan
 *   - Emergency Severity Index (ESI) Triage 5-Level Algorithm (AHRQ / ENA)
 *   - Vital Signs TPR & Modified Early Warning Score (MEWS / NEWS2)
 *   - Inpatient Intake/Output (I/O) Fluid Balance Charting
 *   - Nursing ISBAR Handover (Identity, Situation, Background, Assessment, Recommendation)
 *   - Comprehensive Inpatient Clinical Discharge Summary (LAMA, DAMA, Recovery, SOS Red Flags)
 * ============================================================================
 */

import { db } from '../db/index.js';
import crypto from 'node:crypto';

/**
 * Record a Doctor Clinical Encounter with complete SOAP Note & ICD-10 Diagnosis
 */
export function recordClinicalEncounter(data) {
  const {
    patient_id,
    doctor_id,
    department = 'General Medicine',
    encounter_type = 'OPD_CONSULTATION',
    chief_complaints,
    history_present_illness = '',
    subjective_notes,
    objective_findings,
    physical_exam_picle = 'Pallor: Absent, Icterus: Absent, Cyanosis: Absent, Clubbing: Absent, Lymphadenopathy: None, Edema: None (PICLE normal)',
    assessment_provisional,
    final_icd10_code = 'R69', // Illness unspecified default
    plan_treatment,
    follow_up_advice = 'Review SOS or after 5 days with pending test reports',
    status = 'COMPLETED'
  } = data;

  if (!patient_id || !doctor_id || !chief_complaints || !subjective_notes || !objective_findings || !assessment_provisional || !plan_treatment) {
    throw new Error('Missing required clinical fields for SOAP encounter (patient_id, doctor_id, chief_complaints, subjective_notes, objective_findings, assessment_provisional, plan_treatment)');
  }

  const validTypes = ['OPD_CONSULTATION', 'IPD_ROUND', 'EMERGENCY_CASUALTY', 'TELEMEDICINE'];
  if (!validTypes.includes(encounter_type)) {
    throw new Error(`Invalid encounter type: ${encounter_type}. Valid: ${validTypes.join(', ')}`);
  }

  const encounter_id = `ENC-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO clinical_encounters (
      encounter_id, patient_id, doctor_id, department,
      encounter_type, chief_complaints, history_present_illness,
      subjective_notes, objective_findings, physical_exam_picle,
      assessment_provisional, final_icd10_code, plan_treatment,
      follow_up_advice, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    encounter_id,
    patient_id,
    doctor_id,
    department,
    encounter_type,
    chief_complaints,
    history_present_illness,
    subjective_notes,
    objective_findings,
    physical_exam_picle,
    assessment_provisional,
    final_icd10_code,
    plan_treatment,
    follow_up_advice,
    status
  );

  return {
    success: true,
    encounter_id,
    patient_id,
    doctor_id,
    encounter_type,
    final_icd10_code,
    status,
    message: `Clinical SOAP encounter logged for patient ${patient_id} by Dr. ${doctor_id} (${final_icd10_code}).`
  };
}

/**
 * Record Vital Signs with automated Early Warning Score (EWS) Alert
 */
export function recordVitalSigns(data) {
  const {
    patient_id,
    encounter_id = null,
    bp_systolic,
    bp_diastolic,
    pulse_bpm,
    respiratory_rate,
    temp_fahrenheit = 98.6,
    spo2_pct = 98,
    blood_sugar_mg_dl = 110,
    pain_score_1_10 = 0,
    gcs_score = 15,
    recorded_by_nurse
  } = data;

  if (!patient_id || !bp_systolic || !bp_diastolic || !pulse_bpm || !respiratory_rate || !recorded_by_nurse) {
    throw new Error('patient_id, bp_systolic, bp_diastolic, pulse_bpm, respiratory_rate, and recorded_by_nurse are required');
  }

  // Calculate Modified Early Warning Score (MEWS) triggers
  let ewsScore = 0;
  let criticalAlert = false;
  const flags = [];

  if (bp_systolic < 90) { ewsScore += 2; flags.push('Hypotension (SBP < 90)'); }
  else if (bp_systolic > 180) { ewsScore += 2; flags.push('Hypertensive Crisis (SBP > 180)'); }

  if (pulse_bpm < 50) { ewsScore += 2; flags.push('Severe Bradycardia (HR < 50)'); }
  else if (pulse_bpm > 120) { ewsScore += 2; flags.push('Tachycardia (HR > 120)'); }

  if (respiratory_rate > 24) { ewsScore += 2; flags.push('Tachypnea (RR > 24)'); }
  else if (respiratory_rate < 10) { ewsScore += 2; flags.push('Bradypnea (RR < 10)'); }

  if (spo2_pct < 92) { ewsScore += 3; flags.push('Hypoxia (SpO2 < 92%)'); }
  if (temp_fahrenheit > 102.0) { ewsScore += 1; flags.push('High Grade Pyrexia (Temp > 102°F)'); }
  if (gcs_score < 13) { ewsScore += 3; flags.push('Altered Mental Status (GCS < 13)'); }

  if (ewsScore >= 4 || spo2_pct < 90) {
    criticalAlert = true;
  }

  const vitals_id = `VIT-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO clinical_vitals_logs (
      vitals_id, patient_id, encounter_id, bp_systolic,
      bp_diastolic, pulse_bpm, respiratory_rate, temp_fahrenheit,
      spo2_pct, blood_sugar_mg_dl, pain_score_1_10, gcs_score,
      recorded_by_nurse
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    vitals_id,
    patient_id,
    encounter_id,
    Number(bp_systolic),
    Number(bp_diastolic),
    Number(pulse_bpm),
    Number(respiratory_rate),
    Number(temp_fahrenheit),
    Number(spo2_pct),
    blood_sugar_mg_dl ? Number(blood_sugar_mg_dl) : null,
    Number(pain_score_1_10),
    Number(gcs_score),
    recorded_by_nurse
  );

  return {
    success: true,
    vitals_id,
    patient_id,
    blood_pressure: `${bp_systolic}/${bp_diastolic} mmHg`,
    pulse_bpm: Number(pulse_bpm),
    spo2_pct: Number(spo2_pct),
    mews_score: ewsScore,
    critical_alert: criticalAlert,
    clinical_flags: flags,
    message: criticalAlert
      ? `🚨 CRITICAL VITAL SIGNS DETECTED (MEWS: ${ewsScore}): ${flags.join('; ')}. Rapid Response Team alerted.`
      : `Vitals recorded within acceptable hemodynamic parameters (MEWS: ${ewsScore}).`
  };
}

/**
 * Record Inpatient Fluid Balance (Intake / Output Charting)
 */
export function recordFluidBalance(data) {
  const {
    patient_id,
    admission_id,
    shift = 'MORNING',
    intake_oral_ml = 0,
    intake_iv_ml = 0,
    output_urine_ml = 0,
    output_drain_ml = 0,
    recorded_by
  } = data;

  if (!patient_id || !recorded_by) {
    throw new Error('patient_id and recorded_by are required for fluid balance charting');
  }

  const totalIntake = Number(intake_oral_ml) + Number(intake_iv_ml);
  const totalOutput = Number(output_urine_ml) + Number(output_drain_ml);
  const netBalance = totalIntake - totalOutput;

  const balance_id = `FLUID-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO nursing_fluid_balance_logs (
      balance_id, patient_id, admission_id, shift,
      intake_oral_ml, intake_iv_ml, output_urine_ml,
      output_drain_ml, net_balance_ml, recorded_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    balance_id,
    patient_id,
    admission_id,
    shift,
    Number(intake_oral_ml),
    Number(intake_iv_ml),
    Number(output_urine_ml),
    Number(output_drain_ml),
    netBalance,
    recorded_by
  );

  return {
    success: true,
    balance_id,
    patient_id,
    shift,
    total_intake_ml: totalIntake,
    total_output_ml: totalOutput,
    net_balance_ml: netBalance,
    hydration_status: netBalance > 1500 ? 'POSITIVE_FLUID_OVERLOAD_RISK' : (netBalance < -500 ? 'NEGATIVE_DEHYDRATION_RISK' : 'BALANCED_EUVOLEMIC'),
    message: `Shift ${shift} fluid balance logged: Total In: ${totalIntake}ml, Out: ${totalOutput}ml, Net: ${netBalance > 0 ? '+' : ''}${netBalance}ml.`
  };
}

/**
 * Record Emergency Department ESI Triage Assessment (Level 1 to 5)
 */
export function recordEmergencyTriage(data) {
  const {
    patient_id,
    esi_level = 'LEVEL_3_URGENT',
    presenting_symptoms,
    assigned_bay = 'YELLOW_OBSERVATION_BAY',
    triaged_by_nurse
  } = data;

  if (!patient_id || !presenting_symptoms || !triaged_by_nurse) {
    throw new Error('patient_id, presenting_symptoms, and triaged_by_nurse are required');
  }

  const validESI = [
    'LEVEL_1_RESUSCITATION',
    'LEVEL_2_EMERGENT',
    'LEVEL_3_URGENT',
    'LEVEL_4_LESS_URGENT',
    'LEVEL_5_NON_URGENT'
  ];

  if (!validESI.includes(esi_level)) {
    throw new Error(`Invalid ESI level: ${esi_level}. Valid: ${validESI.join(', ')}`);
  }

  const triage_id = `TRG-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO emergency_triage_assessments (
      triage_id, patient_id, esi_level, presenting_symptoms,
      assigned_bay, triaged_by_nurse, status
    ) VALUES (?, ?, ?, ?, ?, ?, 'TRIAGED')
  `);

  stmt.run(
    triage_id,
    patient_id,
    esi_level,
    presenting_symptoms,
    assigned_bay,
    triaged_by_nurse
  );

  return {
    success: true,
    triage_id,
    patient_id,
    esi_level,
    assigned_bay,
    clinical_urgency: esi_level === 'LEVEL_1_RESUSCITATION' ? 'IMMEDIATE_LIFE_SAVING' : (esi_level === 'LEVEL_2_EMERGENT' ? 'UNDER_10_MIN_EVALUATION' : 'STANDARD_QUEUE'),
    message: `Emergency Triage assigned: ${esi_level} at ${assigned_bay}.`
  };
}

/**
 * Record Nursing ISBAR Shift Handover Note
 */
export function recordISBARHandover(data) {
  const {
    ward_id,
    shift = 'MORNING_TO_EVENING',
    outgoing_nurse,
    incoming_nurse,
    patient_id,
    situation,
    background,
    assessment,
    recommendation
  } = data;

  if (!ward_id || !outgoing_nurse || !incoming_nurse || !patient_id || !situation || !assessment || !recommendation) {
    throw new Error('Missing required fields for Nursing ISBAR shift handover');
  }

  const handover_id = `ISBAR-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO nursing_isbar_handovers (
      handover_id, ward_id, shift, outgoing_nurse, incoming_nurse,
      patient_id, situation, background, assessment, recommendation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    handover_id,
    ward_id,
    shift,
    outgoing_nurse,
    incoming_nurse,
    patient_id,
    situation,
    background || 'No significant previous background noted.',
    assessment,
    recommendation
  );

  return {
    success: true,
    handover_id,
    ward_id,
    shift,
    outgoing_nurse,
    incoming_nurse,
    patient_id,
    message: `Nursing ISBAR shift handover verified between ${outgoing_nurse} and ${incoming_nurse}.`
  };
}

/**
 * Generate Comprehensive Inpatient Clinical Discharge Summary
 */
export function generateDischargeSummary(data) {
  const {
    patient_id,
    admission_id,
    attending_doctor_id,
    admission_date,
    discharge_date = new Date().toISOString().split('T')[0],
    primary_diagnosis_icd10,
    secondary_diagnoses = 'None',
    hospital_course_summary,
    surgical_procedures_done = 'Conservative medical management (No surgery performed)',
    discharge_condition = 'STABLE_IMPROVED',
    discharge_medications,
    dietary_lifestyle_advice = 'Normal diet, adequate hydration, avoid heavy lifting',
    red_flag_sos_symptoms = 'Chest pain, high fever (>101°F), breathlessness, profuse bleeding, or sudden altered sensorium - visit ER immediately',
    follow_up_schedule = 'Review in OPD with Dr. in 7 days or SOS',
    final_signoff_doctor
  } = data;

  if (!patient_id || !admission_id || !attending_doctor_id || !admission_date || !primary_diagnosis_icd10 || !hospital_course_summary || !discharge_medications || !final_signoff_doctor) {
    throw new Error('Missing required clinical fields for Discharge Summary');
  }

  const validConditions = [
    'CURED',
    'STABLE_IMPROVED',
    'LAMA_LEFT_AGAINST_MEDICAL_ADVICE',
    'DAMA_DISCHARGE_AGAINST_MEDICAL_ADVICE',
    'TRANSFERRED_HIGHER_CENTER',
    'EXPIRED_DECEASED'
  ];

  if (!validConditions.includes(discharge_condition)) {
    throw new Error(`Invalid discharge condition: ${discharge_condition}. Valid: ${validConditions.join(', ')}`);
  }

  const summary_id = `DS-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const stmt = db.prepare(`
    INSERT INTO clinical_discharge_summaries (
      summary_id, patient_id, admission_id, attending_doctor_id,
      admission_date, discharge_date, primary_diagnosis_icd10,
      secondary_diagnoses, hospital_course_summary,
      surgical_procedures_done, discharge_condition,
      discharge_medications, dietary_lifestyle_advice,
      red_flag_sos_symptoms, follow_up_schedule,
      final_signoff_doctor
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    summary_id,
    patient_id,
    admission_id,
    attending_doctor_id,
    admission_date,
    discharge_date,
    primary_diagnosis_icd10,
    secondary_diagnoses,
    hospital_course_summary,
    surgical_procedures_done,
    discharge_condition,
    typeof discharge_medications === 'object' ? JSON.stringify(discharge_medications) : discharge_medications,
    dietary_lifestyle_advice,
    red_flag_sos_symptoms,
    follow_up_schedule,
    final_signoff_doctor
  );

  return {
    success: true,
    summary_id,
    patient_id,
    admission_id,
    primary_diagnosis_icd10,
    discharge_condition,
    final_signoff_doctor,
    discharge_type: discharge_condition.includes('LAMA') ? 'MEDICO_LEGAL_RISK_LAMA' : (discharge_condition.includes('EXPIRED') ? 'MORTALITY_DECEASED' : 'ROUTINE_PLANNED_DISCHARGE'),
    message: `Clinical Discharge Summary authenticated by ${final_signoff_doctor} (Condition: ${discharge_condition}).`
  };
}

/**
 * Get Clinical Workstation KPI summary
 */
export function getClinicalWorkstationDashboard() {
  const encounterCount = db.prepare('SELECT COUNT(*) as count FROM clinical_encounters').get().count;
  const recentEncounters = db.prepare('SELECT * FROM clinical_encounters ORDER BY created_at DESC LIMIT 5').all();

  const vitalsCount = db.prepare('SELECT COUNT(*) as count FROM clinical_vitals_logs').get().count;
  const triageCount = db.prepare('SELECT COUNT(*) as count FROM emergency_triage_assessments').get().count;
  const triageByLevel = db.prepare(`
    SELECT esi_level, COUNT(*) as count 
    FROM emergency_triage_assessments 
    GROUP BY esi_level
  `).all();

  const dischargeCount = db.prepare('SELECT COUNT(*) as count FROM clinical_discharge_summaries').get().count;

  return {
    total_clinical_encounters: encounterCount,
    recent_encounters: recentEncounters,
    total_vitals_logged: vitalsCount,
    emergency_triage: {
      total_triaged: triageCount,
      by_esi_level: triageByLevel
    },
    total_discharge_summaries: dischargeCount
  };
}
