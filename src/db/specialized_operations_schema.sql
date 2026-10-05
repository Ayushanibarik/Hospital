-- ============================================================================
-- SCHEMA: Specialized Hospital Operations & Statutory Compliance Subsystems
-- ============================================================================
-- Standards & Acts:
--   1. Bio-Medical Waste Management Rules, 2016 (CPCB / SPCB)
--   2. NDPS Act, 1985 & Rule 52A (Controlled Substances & Narcotics Register)
--   3. Medico-Legal Cases (MLC) & Police Intimation (BNSS / CrPC Evidence Chain)
--   4. Operation Theatre (OT) & WHO Surgical Safety Checklist (NABH COP.14)
--   5. CSSD (Central Sterile Supply Department) Autoclave & Spore Sterilization
--   6. Blood Center / Blood Bank (Schedule F Part XII-B Drugs & Cosmetics Act, eRaktKosh)
--   7. AERB (Atomic Energy Regulatory Board) Radiation Safety & TLD Dosimetry
--   8. THOTA 1994 (Transplantation of Human Organs Act) & Brain-Stem Death Protocol
--   9. Dietetics & Therapeutic Clinical Nutrition (Therapeutic Diets & Allergen Safety)
--  10. Mortuary & Post-Mortem Management (Cold Chamber Allocation & Police Clearance)
--  11. Medical Records Department (MRD) Physical File Archival & Statutory Retention
--  12. Linen, Laundry & Infection Control Ward Par-Level Tracking
--  13. Emergency Ambulance Fleet & Critical Equipment Readiness Checklist
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bio-Medical Waste (BMW) Management (Rules, 2016)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bmw_waste_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL,
  color_category TEXT CHECK(color_category IN ('YELLOW', 'RED', 'WHITE', 'BLUE')) NOT NULL,
  waste_type TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  barcode_tag TEXT UNIQUE NOT NULL,
  logged_by TEXT NOT NULL,
  logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'GENERATED' CHECK(status IN ('GENERATED', 'STORED', 'DISPATCHED_TO_CBWTF')),
  cbwtf_manifest_id TEXT
);

CREATE TABLE IF NOT EXISTS bmw_cbwtf_manifests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manifest_id TEXT UNIQUE NOT NULL,
  operator_name TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  driver_name TEXT NOT NULL,
  total_bags INTEGER NOT NULL,
  total_weight_kg REAL NOT NULL,
  yellow_weight_kg REAL NOT NULL,
  red_weight_kg REAL NOT NULL,
  white_weight_kg REAL NOT NULL,
  blue_weight_kg REAL NOT NULL,
  dispatched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'DISPATCHED' CHECK(status IN ('DISPATCHED', 'RECEIVED_AT_PLANT', 'TREATED'))
);

CREATE INDEX IF NOT EXISTS idx_bmw_color ON bmw_waste_logs(color_category);
CREATE INDEX IF NOT EXISTS idx_bmw_status ON bmw_waste_logs(status);
CREATE INDEX IF NOT EXISTS idx_bmw_barcode ON bmw_waste_logs(barcode_tag);

-- ----------------------------------------------------------------------------
-- 2. NDPS Act Narcotics & Controlled Substances Register
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ndps_substance_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  substance_code TEXT UNIQUE NOT NULL,
  drug_name TEXT NOT NULL,
  schedule_type TEXT DEFAULT 'SCHEDULE_X' CHECK(schedule_type IN ('SCHEDULE_X', 'SCHEDULE_H1', 'NDPS')),
  strength TEXT NOT NULL,
  dosage_form TEXT NOT NULL,
  current_balance REAL DEFAULT 0,
  unit_of_measure TEXT DEFAULT 'AMPOULES'
);

CREATE TABLE IF NOT EXISTS ndps_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT UNIQUE NOT NULL,
  substance_code TEXT NOT NULL,
  transaction_type TEXT CHECK(transaction_type IN ('STOCK_RECEIPT', 'DISPENSED_TO_PATIENT', 'WASTAGE_DESTROYED', 'PHYSICAL_AUDIT_ADJUSTMENT')) NOT NULL,
  patient_id TEXT,
  quantity REAL NOT NULL,
  batch_number TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  prescribing_doctor_id TEXT,
  primary_nurse_id TEXT NOT NULL,
  witness_clinician_id TEXT NOT NULL,
  wastage_quantity REAL DEFAULT 0,
  wastage_destruction_method TEXT,
  opening_balance REAL NOT NULL,
  closing_balance REAL NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ndps_substance ON ndps_transactions(substance_code);
CREATE INDEX IF NOT EXISTS idx_ndps_patient ON ndps_transactions(patient_id);

-- ----------------------------------------------------------------------------
-- 3. Medico-Legal Case (MLC) & Police Intimation Management
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mlc_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mlc_number TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  admission_id TEXT,
  incident_type TEXT CHECK(incident_type IN ('ROAD_TRAFFIC_ACCIDENT', 'PHYSICAL_ASSAULT', 'BURNS', 'POISONING', 'GUNSHOT', 'STAB_WOUND', 'FALL_FROM_HEIGHT', 'HANGING_ATTEMPT', 'SEXUAL_ASSAULT', 'BROUGHT_DEAD_UNNATURAL', 'WORKPLACE_HAZARD', 'OTHER')) NOT NULL,
  incident_datetime DATETIME,
  incident_location TEXT,
  brought_by_name TEXT NOT NULL,
  brought_by_relationship TEXT NOT NULL,
  brought_by_contact TEXT,
  police_station TEXT NOT NULL,
  investigating_officer_name TEXT,
  investigating_officer_buckle_no TEXT,
  examining_doctor_id TEXT NOT NULL,
  examining_doctor_name TEXT NOT NULL,
  examination_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
  smell_of_alcohol INTEGER DEFAULT 0,
  consciousness_level TEXT,
  general_condition TEXT,
  opinion_nature_of_injury TEXT CHECK(opinion_nature_of_injury IN ('SIMPLE', 'GRIEVOUS', 'DANGEROUS_TO_LIFE', 'PENDING_INVESTIGATION')) NOT NULL,
  police_intimated INTEGER DEFAULT 1,
  police_intimation_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  police_ack_number TEXT,
  magistrate_intimated INTEGER DEFAULT 0,
  dying_declaration_recorded INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mlc_injuries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mlc_number TEXT NOT NULL,
  injury_number INTEGER NOT NULL,
  injury_type TEXT CHECK(injury_type IN ('ABRASION', 'BRUISE_CONTUSION', 'LACERATION', 'INCISED_WOUND', 'STAB_WOUND', 'GUNSHOT_ENTRY', 'GUNSHOT_EXIT', 'BURN_THERMAL', 'BURN_CHEMICAL', 'FRACTURE')) NOT NULL,
  anatomical_site TEXT NOT NULL,
  dimensions_cm TEXT NOT NULL,
  age_of_injury TEXT NOT NULL,
  weapon_inferred TEXT
);

CREATE TABLE IF NOT EXISTS mlc_chain_of_custody (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mlc_number TEXT NOT NULL,
  item_description TEXT NOT NULL,
  container_type TEXT NOT NULL,
  seal_impression TEXT NOT NULL,
  handed_over_to_officer TEXT NOT NULL,
  officer_badge_number TEXT NOT NULL,
  police_station TEXT NOT NULL,
  handover_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  doctor_signature TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mlc_number ON mlc_cases(mlc_number);
CREATE INDEX IF NOT EXISTS idx_mlc_patient ON mlc_cases(patient_id);

-- ----------------------------------------------------------------------------
-- 4. Operation Theatre (OT) & WHO Surgical Safety Checklist
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ot_surgeries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  surgery_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  ot_room TEXT NOT NULL,
  procedure_name TEXT NOT NULL,
  scheduled_start DATETIME NOT NULL,
  chief_surgeon_id TEXT NOT NULL,
  anesthetist_id TEXT NOT NULL,
  scrub_nurse_id TEXT NOT NULL,
  circulating_nurse_id TEXT NOT NULL,
  anesthesia_type TEXT NOT NULL,
  status TEXT DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED', 'IN_PREOP', 'IN_THEATRE', 'SIGN_IN_COMPLETED', 'TIME_OUT_COMPLETED', 'SURGERY_IN_PROGRESS', 'SIGN_OUT_COMPLETED', 'IN_PACU', 'TRANSFERRED_TO_WARD', 'CANCELLED')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ot_who_checklists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  surgery_id TEXT UNIQUE NOT NULL,
  sign_in_completed INTEGER DEFAULT 0,
  sign_in_data TEXT,
  time_out_completed INTEGER DEFAULT 0,
  time_out_data TEXT,
  sign_out_completed INTEGER DEFAULT 0,
  sign_out_data TEXT,
  count_reconciliation_status TEXT DEFAULT 'NOT_STARTED' CHECK(count_reconciliation_status IN ('NOT_STARTED', 'VERIFIED_CORRECT', 'MISMATCH_XRAY_REQUIRED', 'RECONCILED')),
  all_phases_passed INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ot_implant_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  implant_log_id TEXT UNIQUE NOT NULL,
  surgery_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  implant_name TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  lot_batch_number TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  anatomical_location TEXT NOT NULL,
  logged_by TEXT NOT NULL,
  implant_sticker_verified INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ot_surgery_id ON ot_surgeries(surgery_id);
CREATE INDEX IF NOT EXISTS idx_ot_checklist_surg ON ot_who_checklists(surgery_id);

-- ----------------------------------------------------------------------------
-- 5. CSSD (Central Sterile Supply Department) Sterilization Tracking
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cssd_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  set_code TEXT UNIQUE NOT NULL,
  set_name TEXT NOT NULL,
  department_owner TEXT DEFAULT 'OT',
  total_instruments_count INTEGER NOT NULL,
  status TEXT DEFAULT 'READY_FOR_USE' CHECK(status IN ('DIRTY_DECONTAMINATION', 'PACKING_INSPECTION', 'IN_STERILIZATION', 'STERILE_STORAGE', 'DISPATCHED_TO_OT', 'IN_USE', 'QUARANTINED')),
  current_location TEXT DEFAULT 'CSSD_STERILE_HOLD'
);

CREATE TABLE IF NOT EXISTS cssd_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT UNIQUE NOT NULL,
  sterilizer_unit TEXT NOT NULL,
  cycle_number INTEGER NOT NULL,
  sterilization_type TEXT CHECK(sterilization_type IN ('STEAM_AUTOCLAVE', 'ETO_GAS', 'HYDROGEN_PEROXIDE_PLASMA')) NOT NULL,
  temp_celsius REAL NOT NULL,
  pressure_psi REAL NOT NULL,
  exposure_time_minutes INTEGER NOT NULL,
  bowie_dick_test_passed INTEGER DEFAULT 1,
  chemical_indicator_passed INTEGER DEFAULT 1,
  biological_indicator_status TEXT DEFAULT 'PENDING' CHECK(biological_indicator_status IN ('PENDING', 'PASS_NEGATIVE', 'FAIL_POSITIVE')),
  biological_indicator_reading_time DATETIME,
  status TEXT DEFAULT 'RELEASED' CHECK(status IN ('IN_CYCLE', 'RELEASED', 'RECALLED')),
  released_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cssd_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_barcode TEXT UNIQUE NOT NULL,
  set_code TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  packaging_type TEXT NOT NULL,
  sterilized_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expiry_date DATE NOT NULL,
  status TEXT DEFAULT 'STERILE' CHECK(status IN ('STERILE', 'ISSUED_TO_OT', 'USED', 'EXPIRED', 'RECALLED')),
  issued_to_surgery_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_cssd_batch ON cssd_batches(batch_id);
CREATE INDEX IF NOT EXISTS idx_cssd_pack_barcode ON cssd_packs(pack_barcode);

-- ----------------------------------------------------------------------------
-- 6. Blood Center / Blood Bank (Schedule F, Part XII-B)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blood_donors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donor_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  gender TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  blood_group TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  hemoglobin_g_dl REAL NOT NULL,
  systolic_bp INTEGER,
  diastolic_bp INTEGER,
  donation_type TEXT DEFAULT 'VOLUNTARY' CHECK(donation_type IN ('VOLUNTARY', 'REPLACEMENT', 'AUTOLOGOUS', 'APHERESIS')),
  screening_status TEXT CHECK(screening_status IN ('FIT_TO_DONATE', 'TEMPORARILY_DEFERRED', 'PERMANENTLY_DEFERRED')) NOT NULL,
  deferral_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blood_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_number TEXT UNIQUE NOT NULL,
  donor_id TEXT NOT NULL,
  component_type TEXT CHECK(component_type IN ('WHOLE_BLOOD', 'PRBC', 'FFP', 'PLATELET_CONCENTRATE', 'CRYOPRECIPITATE')) NOT NULL,
  blood_group TEXT NOT NULL,
  volume_ml REAL NOT NULL,
  collection_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  storage_location TEXT NOT NULL,
  tti_hiv TEXT DEFAULT 'TESTING' CHECK(tti_hiv IN ('TESTING', 'NON_REACTIVE', 'REACTIVE')),
  tti_hcv TEXT DEFAULT 'TESTING' CHECK(tti_hcv IN ('TESTING', 'NON_REACTIVE', 'REACTIVE')),
  tti_hbsag TEXT DEFAULT 'TESTING' CHECK(tti_hbsag IN ('TESTING', 'NON_REACTIVE', 'REACTIVE')),
  tti_syphilis TEXT DEFAULT 'TESTING' CHECK(tti_syphilis IN ('TESTING', 'NON_REACTIVE', 'REACTIVE')),
  tti_malaria TEXT DEFAULT 'TESTING' CHECK(tti_malaria IN ('TESTING', 'NON_REACTIVE', 'REACTIVE')),
  quarantine_status TEXT DEFAULT 'QUARANTINED' CHECK(quarantine_status IN ('QUARANTINED', 'CLEARED_TESTED', 'DISCARDED_REACTIVE')),
  eraktkosh_synced INTEGER DEFAULT 0,
  status TEXT DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE', 'RESERVED_CROSSMATCH', 'ISSUED', 'TRANSFUSED', 'DISCARDED', 'EXPIRED'))
);

CREATE TABLE IF NOT EXISTS blood_crossmatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crossmatch_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  unit_number TEXT NOT NULL,
  requested_by_doctor_id TEXT NOT NULL,
  major_crossmatch_result TEXT CHECK(major_crossmatch_result IN ('COMPATIBLE', 'INCOMPATIBLE')) NOT NULL,
  minor_crossmatch_result TEXT CHECK(minor_crossmatch_result IN ('COMPATIBLE', 'INCOMPATIBLE')) NOT NULL,
  coombs_test_dat TEXT CHECK(coombs_test_dat IN ('NEGATIVE', 'POSITIVE')) NOT NULL,
  technician_id TEXT NOT NULL,
  status TEXT DEFAULT 'COMPATIBLE' CHECK(status IN ('COMPATIBLE', 'INCOMPATIBLE', 'ISSUED_TO_WARD')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blood_transfusion_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  unit_number TEXT NOT NULL,
  reaction_type TEXT CHECK(reaction_type IN ('FEBRILE_NON_HEMOLYTIC', 'ALLERGIC_URTICARIAL', 'ACUTE_HEMOLYTIC', 'ANAPHYLACTIC', 'TRALI', 'TACO', 'SEPTIC_BACTERIAL')) NOT NULL,
  time_onset_minutes_into_transfusion INTEGER NOT NULL,
  symptoms TEXT NOT NULL,
  transfusion_stopped_immediately INTEGER DEFAULT 1,
  iv_line_maintained_normal_saline INTEGER DEFAULT 1,
  clerk_error_check_done INTEGER DEFAULT 1,
  hvpi_reported INTEGER DEFAULT 1,
  reported_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blood_unit ON blood_units(unit_number);
CREATE INDEX IF NOT EXISTS idx_blood_group ON blood_units(blood_group, component_type, status);

-- ----------------------------------------------------------------------------
-- 7. AERB (Atomic Energy Regulatory Board) Radiation Safety & Dosimetry
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS aerb_equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id TEXT UNIQUE NOT NULL,
  equipment_type TEXT CHECK(equipment_type IN ('FIXED_XRAY', 'MOBILE_XRAY', 'CT_SCANNER', 'C_ARM_FLUO', 'CATH_LAB', 'MAMMOGRAPHY', 'DENTAL_CBCT', 'LINAC')) NOT NULL,
  make_model TEXT NOT NULL,
  room_number TEXT NOT NULL,
  aerb_license_number TEXT NOT NULL,
  license_expiry_date DATE NOT NULL,
  last_qa_date DATE NOT NULL,
  qa_due_date DATE NOT NULL,
  qa_status TEXT DEFAULT 'COMPLIANT' CHECK(qa_status IN ('COMPLIANT', 'DUE_SOON', 'OVERDUE_SUSPENDED')),
  rso_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aerb_tld_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  badge_number TEXT UNIQUE NOT NULL,
  staff_id TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  department TEXT NOT NULL,
  monitoring_quarter TEXT NOT NULL,
  deep_dose_msv REAL NOT NULL,
  shallow_dose_msv REAL NOT NULL,
  annual_cumulative_msv REAL NOT NULL,
  threshold_exceeded INTEGER DEFAULT 0,
  logged_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aerb_lead_aprons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  apron_barcode TEXT UNIQUE NOT NULL,
  lead_equivalence_mm_pb REAL DEFAULT 0.5,
  storage_location TEXT NOT NULL,
  last_fluoroscopy_inspection_date DATE NOT NULL,
  structural_integrity TEXT CHECK(structural_integrity IN ('INTACT_PASS', 'CRACKED_CONDEMNED')) NOT NULL,
  inspector_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aerb_equip ON aerb_equipment(equipment_id);
CREATE INDEX IF NOT EXISTS idx_aerb_badge ON aerb_tld_badges(badge_number, staff_id);

-- ----------------------------------------------------------------------------
-- 8. Organ & Tissue Transplant (THOTA 1994 & NOTTO)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS thota_brain_death_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  icu_bed TEXT NOT NULL,
  primary_cause_of_coma TEXT NOT NULL,
  irreversible_structural_brain_damage INTEGER DEFAULT 1,
  apnea_test_1_timestamp DATETIME NOT NULL,
  apnea_test_1_paco2_pre REAL NOT NULL,
  apnea_test_1_paco2_post REAL NOT NULL,
  apnea_test_1_respiratory_efforts_absent INTEGER DEFAULT 1,
  apnea_test_2_timestamp DATETIME NOT NULL,
  apnea_test_2_paco2_pre REAL NOT NULL,
  apnea_test_2_paco2_post REAL NOT NULL,
  apnea_test_2_respiratory_efforts_absent INTEGER DEFAULT 1,
  cranial_reflexes_absent INTEGER DEFAULT 1,
  doctor_1_medical_admin TEXT NOT NULL,
  doctor_2_physician_anaesthetist TEXT NOT NULL,
  doctor_3_neurologist_neurosurgeon TEXT NOT NULL,
  doctor_4_treating_doctor TEXT NOT NULL,
  form_8_certified INTEGER DEFAULT 1,
  form_8_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  organ_donation_consent_form_10 INTEGER DEFAULT 0,
  notto_intimated INTEGER DEFAULT 0,
  notto_id TEXT,
  status TEXT DEFAULT 'CERTIFIED' CHECK(status IN ('TEST_1_PENDING', 'WAITING_FOR_TEST_2', 'CERTIFIED', 'NOTTO_NOTIFIED', 'RETRIEVAL_COMMENCED'))
);

CREATE TABLE IF NOT EXISTS thota_organ_retrieval (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  retrieval_id TEXT UNIQUE NOT NULL,
  case_id TEXT NOT NULL,
  organ_type TEXT CHECK(organ_type IN ('KIDNEY_LEFT', 'KIDNEY_RIGHT', 'LIVER', 'HEART', 'LUNGS', 'CORNEA_LEFT', 'CORNEA_RIGHT', 'PANCREAS')) NOT NULL,
  cross_clamp_timestamp DATETIME NOT NULL,
  preservation_solution TEXT NOT NULL,
  cold_ischemia_start DATETIME NOT NULL,
  allocated_hospital_recipient TEXT NOT NULL,
  notto_match_score REAL,
  transport_mode TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_thota_case ON thota_brain_death_cases(case_id);

-- ----------------------------------------------------------------------------
-- 9. Dietetics & Therapeutic Clinical Nutrition
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dietary_meal_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  bed_number TEXT NOT NULL,
  diet_type TEXT CHECK(diet_type IN ('REGULAR_VEG', 'REGULAR_NONVEG', 'DIABETIC', 'RENAL_LOW_POTASSIUM', 'CARDIAC_LOW_SALT', 'HEPATIC', 'HIGH_PROTEIN', 'SOFT_BLAND', 'CLEAR_LIQUID', 'FULL_LIQUID', 'NPO_FASTING', 'ENTERAL_TUBE_FEED', 'TPN_PARENTERAL')) NOT NULL,
  calorie_target_kcal INTEGER NOT NULL,
  protein_target_g REAL NOT NULL,
  sodium_restricted INTEGER DEFAULT 0,
  fluid_restriction_ml INTEGER,
  allergen_notes TEXT,
  prescribed_by_dietitian_id TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'DISCONTINUED', 'NPO_HOLD')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dietary_tray_dispatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dispatch_id TEXT UNIQUE NOT NULL,
  plan_id TEXT NOT NULL,
  meal_slot TEXT CHECK(meal_slot IN ('BREAKFAST', 'LUNCH', 'EVENING_SNACK', 'DINNER', 'NIGHT_FEED')) NOT NULL,
  tray_prepared_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  allergy_check_passed INTEGER DEFAULT 1,
  npo_override_blocked INTEGER DEFAULT 0,
  delivered_to_bed INTEGER DEFAULT 0,
  delivered_at DATETIME,
  patient_acceptance TEXT CHECK(patient_acceptance IN ('ACCEPTED_FULL', 'ACCEPTED_PARTIAL', 'REFUSED', 'PATIENT_UNAVAILABLE'))
);

CREATE INDEX IF NOT EXISTS idx_diet_plan ON dietary_meal_plans(plan_id, patient_id);

-- ----------------------------------------------------------------------------
-- 10. Mortuary & Post-Mortem Management
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mortuary_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mortuary_entry_id TEXT UNIQUE NOT NULL,
  deceased_patient_id TEXT NOT NULL,
  deceased_name TEXT NOT NULL,
  gender TEXT NOT NULL,
  time_of_death DATETIME NOT NULL,
  cause_of_death TEXT NOT NULL,
  is_mlc_death INTEGER DEFAULT 0,
  mlc_number TEXT,
  chamber_number TEXT NOT NULL,
  toe_tag_verified INTEGER DEFAULT 1,
  wrist_band_verified INTEGER DEFAULT 1,
  valuables_deposited TEXT,
  police_noc_verified INTEGER DEFAULT 0,
  post_mortem_completed INTEGER DEFAULT 0,
  handover_to_relative_name TEXT,
  relative_relationship TEXT,
  relative_id_proof TEXT,
  handover_officer_id TEXT,
  release_timestamp DATETIME,
  status TEXT DEFAULT 'IN_COLD_STORAGE' CHECK(status IN ('IN_COLD_STORAGE', 'AWAITING_POLICE_NOC', 'AUTOPSY_IN_PROGRESS', 'RELEASED_TO_FAMILY', 'RELEASED_TO_POLICE')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mortuary_patient ON mortuary_records(deceased_patient_id);
CREATE INDEX IF NOT EXISTS idx_mortuary_mlc ON mortuary_records(mlc_number);

-- ----------------------------------------------------------------------------
-- 11. Medical Records Department (MRD)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mrd_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mrd_file_id TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  admission_id TEXT NOT NULL,
  discharge_date DATE NOT NULL,
  primary_icd10_code TEXT NOT NULL,
  storage_location TEXT NOT NULL,
  file_completeness_score_pct INTEGER DEFAULT 100,
  discharge_summary_present INTEGER DEFAULT 1,
  consent_forms_present INTEGER DEFAULT 1,
  ot_notes_present INTEGER DEFAULT 1,
  nursing_records_present INTEGER DEFAULT 1,
  statutory_retention_years INTEGER NOT NULL,
  retention_expiry_date DATE NOT NULL,
  current_status TEXT DEFAULT 'ARCHIVED' CHECK(current_status IN ('ARCHIVED', 'CHECKED_OUT_LENT', 'DESTROYED_POST_RETENTION')),
  checked_out_to_doctor_id TEXT,
  checked_out_purpose TEXT,
  checked_out_due_date DATE
);

CREATE INDEX IF NOT EXISTS idx_mrd_file ON mrd_files(mrd_file_id, patient_id);

-- ----------------------------------------------------------------------------
-- 12. Linen, Laundry & Infection Control Inventory
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linen_ward_par_levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ward_id TEXT NOT NULL,
  linen_item_type TEXT CHECK(linen_item_type IN ('BEDSHEET', 'PILLOW_COVER', 'PATIENT_GOWN', 'SURGEON_SCRUB_SUIT', 'OT_DRAPE', 'BLANKET', 'DRAW_SHEET')) NOT NULL,
  par_level_quota INTEGER NOT NULL,
  clean_in_stock INTEGER NOT NULL,
  dirty_sent_to_laundry INTEGER NOT NULL,
  last_audit_date DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS linen_laundry_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laundry_batch_id TEXT UNIQUE NOT NULL,
  wash_type TEXT CHECK(wash_type IN ('ROUTINE_SOILED', 'INFECTED_BLEACH_71C')) NOT NULL,
  source_ward TEXT NOT NULL,
  bag_color TEXT CHECK(bag_color IN ('WHITE_ROUTINE', 'YELLOW_INFECTED_SOLUBLE')) NOT NULL,
  total_pieces INTEGER NOT NULL,
  wash_temperature_celsius REAL NOT NULL,
  disinfection_verified INTEGER DEFAULT 1,
  wash_cycle_status TEXT DEFAULT 'COMPLETED' CHECK(wash_cycle_status IN ('IN_WASH', 'DRYING_IRONING', 'COMPLETED', 'CONDEMNED')),
  condemned_pieces INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_linen_ward ON linen_ward_par_levels(ward_id);

-- ----------------------------------------------------------------------------
-- 13. Emergency Ambulance Fleet & Critical Equipment Readiness
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ambulance_fleet (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id TEXT UNIQUE NOT NULL,
  vehicle_number TEXT UNIQUE NOT NULL,
  ambulance_type TEXT CHECK(ambulance_type IN ('ADVANCED_LIFE_SUPPORT_ALS', 'BASIC_LIFE_SUPPORT_BLS', 'NEONATAL_ICU_TRANSPORT')) NOT NULL,
  fitness_certificate_expiry DATE NOT NULL,
  insurance_expiry DATE NOT NULL,
  status TEXT DEFAULT 'READY_FOR_DISPATCH' CHECK(status IN ('READY_FOR_DISPATCH', 'ON_MISSION', 'MAINTENANCE_DOWNTIME', 'EQUIPMENT_FAIL_STANDBY')),
  current_location_gps TEXT
);

CREATE TABLE IF NOT EXISTS ambulance_daily_checklists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checklist_id TEXT UNIQUE NOT NULL,
  vehicle_id TEXT NOT NULL,
  shift TEXT CHECK(shift IN ('MORNING', 'EVENING', 'NIGHT')) NOT NULL,
  defibrillator_joule_test_passed INTEGER DEFAULT 1,
  portable_ventilator_checked INTEGER DEFAULT 1,
  oxygen_cylinder_pressure_psi INTEGER NOT NULL,
  suction_apparatus_functional INTEGER DEFAULT 1,
  emergency_drug_kit_sealed INTEGER DEFAULT 1,
  driver_name TEXT NOT NULL,
  paramedic_emt_name TEXT NOT NULL,
  overall_readiness_cleared INTEGER DEFAULT 1,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ambulance_missions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT UNIQUE NOT NULL,
  vehicle_id TEXT NOT NULL,
  caller_phone TEXT NOT NULL,
  pickup_address TEXT NOT NULL,
  patient_condition TEXT,
  dispatch_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  arrival_at_scene_time DATETIME,
  departure_scene_time DATETIME,
  arrival_at_er_time DATETIME,
  total_km_travelled REAL,
  emt_handover_notes TEXT,
  status TEXT DEFAULT 'DISPATCHED' CHECK(status IN ('DISPATCHED', 'EN_ROUTE_TO_PATIENT', 'PATIENT_LOADED', 'ARRIVED_ER', 'COMPLETED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_ambulance_fleet ON ambulance_fleet(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_ambulance_mission ON ambulance_missions(mission_id);
