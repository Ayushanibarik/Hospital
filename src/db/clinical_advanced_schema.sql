-- ============================================================================
-- SCHEMA: Advanced Clinical, Engineering & Governance Hospital Subsystems
-- ============================================================================
-- Standards & Frameworks:
--   1. NABH HIC & AMSP (Infection Control & Healthcare-Associated Infections - HAIs)
--   2. NABH FMS (Facility Management & Emergency Codes: Blue, Red, Pink, Orange)
--   3. Hemodialysis & ISO 23500 Water Quality & Dialyzer Reprocessing Protocol
--   4. Oncology Chemotherapy Daycare (BSA Mosteller Calculation & Cytotoxic Safety)
--   5. Cath Lab & Interventional Cardiology (STEMI Door-to-Balloon & Stent Registry)
--   6. Biomedical Engineering CMMS (Asset Master, Breakdown Work Orders, PPM, MTTR/MTBF)
--   7. Clinical Trials & CDSCO NDCT Rules 2019 (SUGAM 24-Hour SAE Reporting & Ethics)
--   8. NICU & Telemedicine Suite (APGAR, KMC & MoHFW Telemedicine Practice Guidelines 2020)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Hospital Infection Control (HIC) & Antimicrobial Stewardship (AMSP)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hai_surveillance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  surveillance_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  ward_id TEXT NOT NULL,
  infection_type TEXT CHECK(infection_type IN ('CAUTI', 'CLABSI', 'VAP', 'SSI', 'C_DIFFICILE')) NOT NULL,
  device_days_at_onset INTEGER NOT NULL,
  culture_organism TEXT NOT NULL,
  antibiogram_sensitivity TEXT NOT NULL,
  bundle_compliance_passed INTEGER DEFAULT 1,
  identified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  infection_control_officer TEXT NOT NULL,
  status TEXT DEFAULT 'CONFIRMED' CHECK(status IN ('SUSPECTED', 'CONFIRMED', 'RESOLVED'))
);

CREATE TABLE IF NOT EXISTS amsp_antibiotic_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  prescribed_by_doctor_id TEXT NOT NULL,
  restricted_antibiotic_name TEXT NOT NULL,
  indication TEXT NOT NULL,
  pre_auth_approved INTEGER DEFAULT 0,
  culture_guided INTEGER DEFAULT 1,
  review_72h_action TEXT CHECK(review_72h_action IN ('CONTINUE', 'DE_ESCALATE', 'DISCONTINUE', 'SWITCH_TO_ORAL')) NOT NULL,
  pharmacist_reviewer TEXT NOT NULL,
  audited_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hai_type ON hai_surveillance_logs(infection_type, ward_id);
CREATE INDEX IF NOT EXISTS idx_amsp_patient ON amsp_antibiotic_audits(patient_id);

-- ----------------------------------------------------------------------------
-- 2. Hospital Emergency Codes & Disaster Management (NABH FMS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emergency_code_activations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activation_id TEXT UNIQUE NOT NULL,
  code_type TEXT CHECK(code_type IN ('CODE_BLUE', 'CODE_RED', 'CODE_PINK', 'CODE_ORANGE', 'CODE_YELLOW', 'CODE_BLACK', 'CODE_WHITE')) NOT NULL,
  location_detail TEXT NOT NULL,
  activated_by TEXT NOT NULL,
  activation_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  team_arrival_time DATETIME,
  response_time_seconds INTEGER,
  cpr_initiated INTEGER DEFAULT 0,
  defibrillation_delivered INTEGER DEFAULT 0,
  outcome TEXT CHECK(outcome IN ('ROSC_ACHIEVED_TRANSFERRED_ICU', 'PATIENT_DECEASED', 'DRILL_SUCCESS', 'FALSE_ALARM', 'CONTAINED_EVACUATED', 'SEARCH_RECOVERED', 'THREAT_NEUTRALIZED')) NOT NULL,
  team_leader_signature TEXT NOT NULL,
  status TEXT DEFAULT 'CLOSED' CHECK(status IN ('ACTIVE_PAGING', 'TEAM_ON_SITE', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS emergency_mock_drills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drill_id TEXT UNIQUE NOT NULL,
  code_type TEXT NOT NULL,
  location TEXT NOT NULL,
  drill_date DATE NOT NULL,
  response_time_seconds INTEGER NOT NULL,
  competency_rating_pct INTEGER NOT NULL,
  corrective_actions TEXT,
  safety_officer_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emerg_code ON emergency_code_activations(code_type, activation_time);

-- ----------------------------------------------------------------------------
-- 3. Hemodialysis Unit & ISO 23500 Water Quality
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hemodialysis_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  station_number TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  serology_status TEXT CHECK(serology_status IN ('NON_REACTIVE', 'HEPATITIS_B_POSITIVE', 'HEPATITIS_C_POSITIVE', 'HIV_POSITIVE')) NOT NULL,
  pre_weight_kg REAL NOT NULL,
  post_weight_kg REAL NOT NULL,
  ultrafiltration_volume_ml REAL NOT NULL,
  blood_flow_rate_ml_min REAL NOT NULL,
  dialysate_flow_rate_ml_min REAL NOT NULL,
  heparin_dose_units INTEGER NOT NULL,
  session_duration_hours REAL NOT NULL,
  start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  primary_technician_id TEXT NOT NULL,
  nephrologist_id TEXT NOT NULL,
  status TEXT DEFAULT 'COMPLETED' CHECK(status IN ('IN_PROGRESS', 'COMPLETED', 'ABORTED_COMPLICATION'))
);

CREATE TABLE IF NOT EXISTS dialyzer_reuse_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dialyzer_barcode TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  reuse_cycle_count INTEGER NOT NULL,
  bundle_volume_pct REAL NOT NULL,
  pressure_leak_test_passed INTEGER DEFAULT 1,
  chemical_disinfectant TEXT DEFAULT 'PERACETIC_ACID_4PCT',
  reprocessed_by TEXT NOT NULL,
  reprocessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_eligible_for_use INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ro_plant_water_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id TEXT UNIQUE NOT NULL,
  sampling_point TEXT NOT NULL,
  microbial_cfu_ml REAL NOT NULL,
  endotoxin_eu_ml REAL NOT NULL,
  conductivity_us_cm REAL NOT NULL,
  is_iso23500_compliant INTEGER DEFAULT 1,
  tested_by TEXT NOT NULL,
  tested_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dialysis_patient ON hemodialysis_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_dialyzer_barcode ON dialyzer_reuse_logs(dialyzer_barcode, patient_id);

-- ----------------------------------------------------------------------------
-- 4. Oncology Chemotherapy Daycare & Cytotoxic Safety
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chemotherapy_cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  protocol_name TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  total_cycles INTEGER NOT NULL,
  height_cm REAL NOT NULL,
  weight_kg REAL NOT NULL,
  calculated_bsa_m2 REAL NOT NULL,
  oncologist_signature TEXT NOT NULL,
  pharmacist_signature TEXT NOT NULL,
  administering_nurse_signature TEXT NOT NULL,
  pre_medications TEXT NOT NULL,
  cytotoxic_drugs TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  status TEXT DEFAULT 'ADMINISTERED' CHECK(status IN ('PRESCRIBED', 'PREPARED_LAMINAR_HOOD', 'VERIFIED_DUAL', 'ADMINISTERED', 'EXTRAVASATION_STOPPED'))
);

CREATE TABLE IF NOT EXISTS chemo_extravasation_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT UNIQUE NOT NULL,
  cycle_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  drug_name TEXT NOT NULL,
  extravasation_grade TEXT CHECK(extravasation_grade IN ('GRADE_1_PAIN_NO_VESICANT', 'GRADE_2_VESICANT_ULCERATION', 'GRADE_3_EXTENSIVE_TISSUE_NECROSIS')) NOT NULL,
  infusion_stopped_immediately INTEGER DEFAULT 1,
  cannula_retained_for_aspiration INTEGER DEFAULT 1,
  antidote_administered TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  reported_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chemo_patient ON chemotherapy_cycles(patient_id);

-- ----------------------------------------------------------------------------
-- 5. Cath Lab & Interventional Cardiology (NABH COP.15)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cathlab_procedures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  procedure_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  procedure_type TEXT CHECK(procedure_type IN ('CORONARY_ANGIOGRAPHY_CAG', 'PRIMARY_PCI_STEMI', 'ELECTIVE_PTCA', 'PACEMAKER_IMPLANTATION', 'TAVR_STRUCTURAL')) NOT NULL,
  is_stemi_case INTEGER DEFAULT 0,
  er_arrival_time DATETIME,
  balloon_cross_time DATETIME,
  door_to_balloon_minutes INTEGER,
  vascular_access TEXT CHECK(vascular_access IN ('RIGHT_RADIAL', 'LEFT_RADIAL', 'RIGHT_FEMORAL', 'LEFT_FEMORAL')) NOT NULL,
  contrast_volume_ml REAL NOT NULL,
  fluoroscopy_time_minutes REAL NOT NULL,
  cumulative_air_kerma_mgy REAL NOT NULL,
  interventional_cardiologist_id TEXT NOT NULL,
  status TEXT DEFAULT 'COMPLETED' CHECK(status IN ('SCHEDULED', 'IN_CATH_LAB', 'COMPLETED', 'TRANSFERRED_CCU'))
);

CREATE TABLE IF NOT EXISTS cardiac_stent_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stent_registry_id TEXT UNIQUE NOT NULL,
  procedure_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  vessel_location TEXT NOT NULL,
  stent_type TEXT CHECK(stent_type IN ('DRUG_ELUTING_STENT_DES', 'BIORESORBABLE_SCAFFOLD', 'BARE_METAL_STENT')) NOT NULL,
  brand_name TEXT NOT NULL,
  serial_number TEXT UNIQUE NOT NULL,
  diameter_mm REAL NOT NULL,
  length_mm REAL NOT NULL,
  deployment_pressure_atm REAL NOT NULL,
  final_timi_flow TEXT CHECK(final_timi_flow IN ('TIMI_0', 'TIMI_1', 'TIMI_2', 'TIMI_3')) NOT NULL,
  logged_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cathlab_patient ON cathlab_procedures(patient_id);
CREATE INDEX IF NOT EXISTS idx_stent_proc ON cardiac_stent_registry(procedure_id);

-- ----------------------------------------------------------------------------
-- 6. Biomedical Engineering CMMS & Equipment Reliability (NABH FMS)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS biomedical_equipment_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_tag TEXT UNIQUE NOT NULL,
  equipment_name TEXT NOT NULL,
  category TEXT CHECK(category IN ('CRITICAL_LIFE_SUPPORT', 'DIAGNOSTIC_IMAGING', 'LABORATORY', 'THERAPEUTIC', 'GENERAL_WARD')) NOT NULL,
  department TEXT NOT NULL,
  make_model TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  warranty_amc_expiry DATE NOT NULL,
  calibration_due_date DATE NOT NULL,
  status TEXT DEFAULT 'OPERATIONAL' CHECK(status IN ('OPERATIONAL', 'BREAKDOWN_STANDBY', 'UNDER_MAINTENANCE', 'CONDEMNED')),
  total_breakdowns INTEGER DEFAULT 0,
  total_downtime_hours REAL DEFAULT 0,
  uptime_pct REAL DEFAULT 100.0
);

CREATE TABLE IF NOT EXISTS biomedical_work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id TEXT UNIQUE NOT NULL,
  asset_tag TEXT NOT NULL,
  work_type TEXT CHECK(work_type IN ('BREAKDOWN_CORRECTIVE', 'PREVENTIVE_PPM', 'CALIBRATION', 'SAFETY_AUDIT')) NOT NULL,
  complaint_description TEXT NOT NULL,
  reported_by_staff TEXT NOT NULL,
  reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  assigned_engineer TEXT NOT NULL,
  repaired_at DATETIME,
  downtime_hours REAL,
  parts_replaced TEXT,
  cost_inr REAL DEFAULT 0,
  post_maintenance_calibration_passed INTEGER DEFAULT 1,
  status TEXT DEFAULT 'CLOSED' CHECK(status IN ('OPEN_ASSIGNED', 'IN_REPAIR', 'PARTS_AWAITING', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS biomedical_ppm_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ppm_schedule_id TEXT UNIQUE NOT NULL,
  asset_tag TEXT NOT NULL,
  periodicity TEXT CHECK(periodicity IN ('MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL')) NOT NULL,
  last_done_date DATE NOT NULL,
  next_due_date DATE NOT NULL,
  technician_id TEXT NOT NULL,
  compliance_status TEXT DEFAULT 'UP_TO_DATE' CHECK(compliance_status IN ('UP_TO_DATE', 'DUE_SOON', 'OVERDUE'))
);

CREATE INDEX IF NOT EXISTS idx_bme_asset ON biomedical_equipment_master(asset_tag);
CREATE INDEX IF NOT EXISTS idx_bme_work_asset ON biomedical_work_orders(asset_tag);

-- ----------------------------------------------------------------------------
-- 7. Clinical Trials & Institutional Ethics (CDSCO NDCT Rules 2019)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_trial_protocols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id TEXT UNIQUE NOT NULL,
  ctri_number TEXT UNIQUE NOT NULL,
  cdsco_permission_number TEXT NOT NULL,
  study_title TEXT NOT NULL,
  principal_investigator_id TEXT NOT NULL,
  ethics_committee_reg_number TEXT NOT NULL,
  iec_approval_date DATE NOT NULL,
  total_subjects_enrolled INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ACTIVE_RECRUITING' CHECK(status IN ('APPROVED_PENDING_INITIATION', 'ACTIVE_RECRUITING', 'TRIAL_COMPLETED', 'SUSPENDED_SAFETY'))
);

CREATE TABLE IF NOT EXISTS clinical_trial_sae_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sae_report_id TEXT UNIQUE NOT NULL,
  trial_id TEXT NOT NULL,
  subject_screening_id TEXT NOT NULL,
  event_description TEXT NOT NULL,
  onset_datetime DATETIME NOT NULL,
  initial_24h_intimation_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_within_24h_statutory_window INTEGER DEFAULT 1,
  cdsco_sugam_reference TEXT NOT NULL,
  sponsor_notified INTEGER DEFAULT 1,
  ethics_committee_notified INTEGER DEFAULT 1,
  detailed_14d_report_submitted INTEGER DEFAULT 0,
  investigator_signature TEXT NOT NULL,
  causality_assessment TEXT CHECK(causality_assessment IN ('CERTAIN_RELATED', 'PROBABLE', 'POSSIBLE', 'UNLIKELY', 'NOT_RELATED')) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trial_id ON clinical_trial_protocols(trial_id);
CREATE INDEX IF NOT EXISTS idx_sae_trial ON clinical_trial_sae_reports(trial_id);

-- ----------------------------------------------------------------------------
-- 8. NICU & Telemedicine Suite (APGAR / KMC & Telemedicine 2020)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nicu_neonatal_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id TEXT UNIQUE NOT NULL,
  mother_patient_id TEXT NOT NULL,
  neonate_id TEXT UNIQUE NOT NULL,
  birth_timestamp DATETIME NOT NULL,
  gestational_age_weeks REAL NOT NULL,
  birth_weight_grams REAL NOT NULL,
  apgar_1_min INTEGER NOT NULL,
  apgar_5_min INTEGER NOT NULL,
  apgar_10_min INTEGER,
  kmc_sessions_total_hours REAL DEFAULT 0,
  phototherapy_hours REAL DEFAULT 0,
  pediatrician_id TEXT NOT NULL,
  status TEXT DEFAULT 'STABLE_IN_NICU' CHECK(status IN ('CRITICAL_VENTILATED', 'STABLE_IN_NICU', 'STEP_DOWN_KMC', 'DISCHARGED_HEALTHY'))
);

CREATE TABLE IF NOT EXISTS telemedicine_consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consultation_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  rmp_doctor_id TEXT NOT NULL,
  rmp_registration_number TEXT NOT NULL,
  mode TEXT CHECK(mode IN ('VIDEO', 'AUDIO', 'TEXT_CHAT')) NOT NULL,
  consent_type TEXT CHECK(consent_type IN ('IMPLIED_PATIENT_INITIATED', 'EXPLICIT_VERBAL_RECORDED', 'EXPLICIT_SMS_EMAIL')) NOT NULL,
  diagnosis_or_provisional TEXT NOT NULL,
  prescribed_medications TEXT,
  prohibited_substance_screen_passed INTEGER DEFAULT 1,
  consultation_start DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'COMPLETED' CHECK(status IN ('SCHEDULED', 'IN_CALL', 'COMPLETED', 'ESCALATED_TO_IN_PERSON'))
);

CREATE INDEX IF NOT EXISTS idx_nicu_neonate ON nicu_neonatal_assessments(neonate_id);
CREATE INDEX IF NOT EXISTS idx_telemed_patient ON telemedicine_consultations(patient_id);
