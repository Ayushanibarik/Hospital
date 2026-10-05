-- ============================================================================
-- SCHEMA: Doctor & Nursing Clinical Workstation (EMR / EHR Daily Operations)
-- ============================================================================
-- Standards:
--   - Medical Council of India / NMC Clinical Record Standards
--   - NABH COP (Care of Patients) & JCI Standards
--   - Emergency Severity Index (ESI) Triage 5-Level Scale
--   - Clinical SOAP Encounter Documentation & ICD-10 Coding
--   - Bedside TPR & Intake/Output (I/O) Fluid Balance Charting
--   - Nursing ISBAR Handover (Identity, Situation, Background, Assessment, Recommendation)
--   - Comprehensive Inpatient Clinical Discharge Summary (LAMA, DAMA, Recovery, SOS Red Flags)
-- ============================================================================

-- 1. Doctor Clinical Encounter & SOAP Notes
CREATE TABLE IF NOT EXISTS clinical_encounters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  encounter_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  doctor_id TEXT NOT NULL,
  department TEXT NOT NULL,
  encounter_type TEXT CHECK(encounter_type IN ('OPD_CONSULTATION', 'IPD_ROUND', 'EMERGENCY_CASUALTY', 'TELEMEDICINE')) NOT NULL,
  chief_complaints TEXT NOT NULL,
  history_present_illness TEXT,
  subjective_notes TEXT NOT NULL,
  objective_findings TEXT NOT NULL,
  physical_exam_picle TEXT, -- Pallor, Icterus, Cyanosis, Clubbing, Lymphadenopathy, Edema
  assessment_provisional TEXT NOT NULL,
  final_icd10_code TEXT,
  plan_treatment TEXT NOT NULL,
  follow_up_advice TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'COMPLETED' CHECK(status IN ('IN_PROGRESS', 'COMPLETED', 'REFERRED', 'ADMISSION_RECOMMENDED'))
);

-- 2. Vital Signs (TPR) Charting
CREATE TABLE IF NOT EXISTS clinical_vitals_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vitals_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT,
  bp_systolic INTEGER NOT NULL,
  bp_diastolic INTEGER NOT NULL,
  pulse_bpm INTEGER NOT NULL,
  respiratory_rate INTEGER NOT NULL,
  temp_fahrenheit REAL NOT NULL,
  spo2_pct INTEGER NOT NULL,
  blood_sugar_mg_dl INTEGER,
  pain_score_1_10 INTEGER DEFAULT 0,
  gcs_score INTEGER DEFAULT 15, -- Glasgow Coma Scale (3-15)
  recorded_by_nurse TEXT NOT NULL,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Inpatient Fluid Balance (Intake / Output TPR)
CREATE TABLE IF NOT EXISTS nursing_fluid_balance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  balance_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  admission_id TEXT,
  shift TEXT CHECK(shift IN ('MORNING', 'EVENING', 'NIGHT')) NOT NULL,
  intake_oral_ml REAL DEFAULT 0,
  intake_iv_ml REAL DEFAULT 0,
  output_urine_ml REAL DEFAULT 0,
  output_drain_ml REAL DEFAULT 0,
  net_balance_ml REAL NOT NULL,
  recorded_by TEXT NOT NULL,
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Emergency Severity Index (ESI) Triage
CREATE TABLE IF NOT EXISTS emergency_triage_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  triage_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  arrival_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
  esi_level TEXT CHECK(esi_level IN ('LEVEL_1_RESUSCITATION', 'LEVEL_2_EMERGENT', 'LEVEL_3_URGENT', 'LEVEL_4_LESS_URGENT', 'LEVEL_5_NON_URGENT')) NOT NULL,
  presenting_symptoms TEXT NOT NULL,
  assigned_bay TEXT NOT NULL, -- Resuscitation Bay, Red Bay, Yellow Bay, Green Bay
  triaged_by_nurse TEXT NOT NULL,
  status TEXT DEFAULT 'TRIAGED' CHECK(status IN ('TRIAGED', 'UNDER_DOCTOR_EVALUATION', 'TRANSFERRED_ICU', 'ADMITTED_WARD', 'DISCHARGED'))
);

-- 5. Nursing ISBAR Handover Notes
CREATE TABLE IF NOT EXISTS nursing_isbar_handovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handover_id TEXT UNIQUE NOT NULL,
  ward_id TEXT NOT NULL,
  shift TEXT CHECK(shift IN ('MORNING_TO_EVENING', 'EVENING_TO_NIGHT', 'NIGHT_TO_MORNING')) NOT NULL,
  outgoing_nurse TEXT NOT NULL,
  incoming_nurse TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  situation TEXT NOT NULL,
  background TEXT NOT NULL,
  assessment TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Clinical Inpatient Discharge Summaries
CREATE TABLE IF NOT EXISTS clinical_discharge_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  admission_id TEXT NOT NULL,
  attending_doctor_id TEXT NOT NULL,
  admission_date DATE NOT NULL,
  discharge_date DATE NOT NULL,
  primary_diagnosis_icd10 TEXT NOT NULL,
  secondary_diagnoses TEXT,
  hospital_course_summary TEXT NOT NULL,
  surgical_procedures_done TEXT,
  discharge_condition TEXT CHECK(discharge_condition IN ('CURED', 'STABLE_IMPROVED', 'LAMA_LEFT_AGAINST_MEDICAL_ADVICE', 'DAMA_DISCHARGE_AGAINST_MEDICAL_ADVICE', 'TRANSFERRED_HIGHER_CENTER', 'EXPIRED_DECEASED')) NOT NULL,
  discharge_medications TEXT NOT NULL,
  dietary_lifestyle_advice TEXT NOT NULL,
  red_flag_sos_symptoms TEXT NOT NULL,
  follow_up_schedule TEXT NOT NULL,
  final_signoff_doctor TEXT NOT NULL,
  signed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_enc_patient ON clinical_encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_vitals_patient ON clinical_vitals_logs(patient_id);
CREATE INDEX IF NOT EXISTS idx_triage_esi ON emergency_triage_assessments(esi_level, arrival_datetime);
CREATE INDEX IF NOT EXISTS idx_disch_patient ON clinical_discharge_summaries(patient_id, admission_id);
