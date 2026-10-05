-- ============================================================================
-- ENTERPRISE SCHEMA: Hospital ERP Extension Tables
-- ============================================================================
-- Extends the base automation schema with full enterprise capabilities:
--   Phase 1: RBAC, MPI, Master Data, Multi-Site
--   Phase 2: ABDM, DPDP, EHR Standards, GST, NABH, Statutory
--   Phase 3: CPOE, eMAR, Drug Safety
--   Phase 4: SCM, Pharmacy, MRP, Tariff, TPA Claims
--   Phase 5: HL7 FHIR, LIS, PACS
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1: RBAC + MPI + MASTER DATA + MULTI-SITE
-- ═══════════════════════════════════════════════════════════════════════════

-- Multi-Site Branch Registry
CREATE TABLE IF NOT EXISTS sites (
    site_id TEXT PRIMARY KEY,
    site_name TEXT NOT NULL,
    site_code TEXT UNIQUE NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    phone TEXT,
    abdm_facility_id TEXT,
    license_number TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Roles & Permissions
CREATE TABLE IF NOT EXISTS roles (
    role_id TEXT PRIMARY KEY,
    role_name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_system_role INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    permission_id TEXT PRIMARY KEY,
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    UNIQUE(resource, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES roles(role_id),
    FOREIGN KEY (permission_id) REFERENCES permissions(permission_id)
);

-- Users / Staff Accounts
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role_id TEXT NOT NULL,
    site_id TEXT,
    department TEXT,
    designation TEXT,
    is_active INTEGER DEFAULT 1,
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(role_id),
    FOREIGN KEY (site_id) REFERENCES sites(site_id)
);

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    device_info TEXT,
    ip_address TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Master Patient Index — Merge/Dedup
CREATE TABLE IF NOT EXISTS patient_merge_log (
    merge_id TEXT PRIMARY KEY,
    surviving_patient_id TEXT NOT NULL,
    merged_patient_id TEXT NOT NULL,
    merged_by TEXT,
    merge_reason TEXT,
    rollback_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (surviving_patient_id) REFERENCES patients(patient_id)
);

-- Centralized Master Data
CREATE TABLE IF NOT EXISTS master_tariffs (
    tariff_id TEXT PRIMARY KEY,
    service_code TEXT NOT NULL,
    service_name TEXT NOT NULL,
    department TEXT,
    base_rate REAL NOT NULL DEFAULT 0,
    payer_type TEXT DEFAULT 'CASH',
    rate REAL NOT NULL DEFAULT 0,
    site_id TEXT,
    effective_from DATE,
    effective_to DATE,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(site_id)
);

CREATE TABLE IF NOT EXISTS master_items (
    item_id TEXT PRIMARY KEY,
    item_code TEXT UNIQUE NOT NULL,
    item_name TEXT NOT NULL,
    category TEXT NOT NULL,
    sub_category TEXT,
    uom TEXT DEFAULT 'EACH',
    hsn_sac_code TEXT,
    gst_slab REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 2: INDIAN REGULATORY COMPLIANCE
-- ═══════════════════════════════════════════════════════════════════════════

-- ABDM / ABHA
CREATE TABLE IF NOT EXISTS abdm_abha_records (
    abha_record_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    abha_number TEXT UNIQUE,
    abha_address TEXT,
    health_id TEXT,
    verification_status TEXT DEFAULT 'PENDING',
    kyc_type TEXT,
    linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS abdm_hpr_registry (
    hpr_id TEXT PRIMARY KEY,
    doctor_id TEXT,
    hpr_number TEXT UNIQUE NOT NULL,
    registration_council TEXT,
    registration_number TEXT,
    qualification TEXT,
    system_of_medicine TEXT DEFAULT 'ALLOPATHY',
    verified INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id)
);

CREATE TABLE IF NOT EXISTS abdm_hip_requests (
    hip_request_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    consent_artifact_id TEXT,
    requester_hiu_id TEXT,
    health_info_types TEXT,
    date_range_from DATE,
    date_range_to DATE,
    status TEXT DEFAULT 'REQUESTED',
    encryption_public_key TEXT,
    responded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS abdm_hiu_requests (
    hiu_request_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    target_hip_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    health_info_types TEXT,
    consent_artifact_id TEXT,
    status TEXT DEFAULT 'INITIATED',
    data_received_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

-- DPDP Act Compliance
CREATE TABLE IF NOT EXISTS consent_records (
    consent_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    purpose TEXT NOT NULL,
    consent_text TEXT NOT NULL,
    given_by TEXT NOT NULL,
    given_via TEXT DEFAULT 'DIGITAL',
    consented_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    withdrawn_at DATETIME,
    status TEXT DEFAULT 'ACTIVE',
    ip_address TEXT,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS data_access_logs (
    access_id TEXT PRIMARY KEY,
    user_id TEXT,
    patient_id TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    action TEXT NOT NULL,
    access_reason TEXT,
    ip_address TEXT,
    accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS data_erasure_requests (
    erasure_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'PENDING',
    data_categories TEXT,
    approved_by TEXT,
    executed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

-- EHR Standards — Clinical Coding
CREATE TABLE IF NOT EXISTS clinical_codes (
    code_id TEXT PRIMARY KEY,
    code_system TEXT NOT NULL,
    code TEXT NOT NULL,
    display_name TEXT NOT NULL,
    parent_code TEXT,
    category TEXT,
    is_active INTEGER DEFAULT 1,
    UNIQUE(code_system, code)
);

CREATE TABLE IF NOT EXISTS diagnosis_codes (
    diagnosis_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    encounter_id TEXT,
    code_system TEXT NOT NULL DEFAULT 'ICD-10',
    code TEXT NOT NULL,
    display_name TEXT,
    diagnosis_type TEXT DEFAULT 'PRIMARY',
    coded_by TEXT,
    coded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

-- GST Engine
CREATE TABLE IF NOT EXISTS gst_hsn_sac_master (
    hsn_sac_id TEXT PRIMARY KEY,
    hsn_sac_code TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    gst_rate REAL NOT NULL DEFAULT 0,
    cgst_rate REAL,
    sgst_rate REAL,
    igst_rate REAL,
    cess_rate REAL DEFAULT 0,
    effective_from DATE,
    category TEXT,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS gst_invoices (
    invoice_id TEXT PRIMARY KEY,
    bill_id TEXT,
    patient_id TEXT NOT NULL,
    invoice_number TEXT UNIQUE NOT NULL,
    invoice_date DATE NOT NULL,
    supply_type TEXT DEFAULT 'INTRA_STATE',
    place_of_supply TEXT,
    gstin_supplier TEXT,
    gstin_recipient TEXT,
    total_taxable REAL DEFAULT 0,
    total_cgst REAL DEFAULT 0,
    total_sgst REAL DEFAULT 0,
    total_igst REAL DEFAULT 0,
    total_cess REAL DEFAULT 0,
    grand_total REAL DEFAULT 0,
    irn_number TEXT,
    e_invoice_status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bill_id) REFERENCES billing_records(bill_id),
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS gst_invoice_lines (
    line_id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    item_description TEXT NOT NULL,
    hsn_sac_code TEXT NOT NULL,
    quantity REAL DEFAULT 1,
    unit_rate REAL NOT NULL,
    taxable_amount REAL NOT NULL,
    gst_rate REAL NOT NULL,
    cgst_amount REAL DEFAULT 0,
    sgst_amount REAL DEFAULT 0,
    igst_amount REAL DEFAULT 0,
    cess_amount REAL DEFAULT 0,
    total_amount REAL NOT NULL,
    FOREIGN KEY (invoice_id) REFERENCES gst_invoices(invoice_id)
);

-- NABH Quality & Accreditation
CREATE TABLE IF NOT EXISTS nabh_quality_indicators (
    indicator_id TEXT PRIMARY KEY,
    indicator_code TEXT NOT NULL,
    indicator_name TEXT NOT NULL,
    category TEXT NOT NULL,
    department TEXT,
    site_id TEXT,
    value REAL NOT NULL,
    unit TEXT,
    benchmark_value REAL,
    recording_period TEXT,
    recorded_by TEXT,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(site_id)
);

CREATE TABLE IF NOT EXISTS nabh_audit_reports (
    report_id TEXT PRIMARY KEY,
    report_type TEXT NOT NULL,
    period_from DATE NOT NULL,
    period_to DATE NOT NULL,
    department TEXT,
    site_id TEXT,
    total_indicators INTEGER DEFAULT 0,
    compliant_count INTEGER DEFAULT 0,
    non_compliant_count INTEGER DEFAULT 0,
    report_data TEXT,
    generated_by TEXT,
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(site_id)
);

CREATE TABLE IF NOT EXISTS equipment_calibrations (
    calibration_id TEXT PRIMARY KEY,
    equipment_id TEXT NOT NULL,
    equipment_name TEXT NOT NULL,
    department TEXT,
    site_id TEXT,
    calibration_date DATE NOT NULL,
    next_due_date DATE NOT NULL,
    calibrated_by TEXT,
    certificate_number TEXT,
    result TEXT DEFAULT 'PASS',
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(site_id)
);

-- Statutory Forms — MTP, PCPNDT, Birth/Death
CREATE TABLE IF NOT EXISTS statutory_pcpndt_forms (
    form_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    form_type TEXT DEFAULT 'FORM_F',
    referring_doctor TEXT NOT NULL,
    indication TEXT NOT NULL,
    gestational_age_weeks INTEGER,
    procedure_name TEXT NOT NULL,
    procedure_date DATE NOT NULL,
    declaration_signed INTEGER DEFAULT 0,
    patient_declaration_signed INTEGER DEFAULT 0,
    result_communicated_to TEXT,
    site_id TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (site_id) REFERENCES sites(site_id)
);

CREATE TABLE IF NOT EXISTS statutory_mtp_register (
    mtp_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    registration_number TEXT,
    age INTEGER,
    gestational_age_weeks INTEGER,
    indication TEXT NOT NULL,
    procedure_type TEXT,
    operating_doctor TEXT NOT NULL,
    opinion_doctor_2 TEXT,
    procedure_date DATE NOT NULL,
    complications TEXT,
    outcome TEXT,
    site_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (site_id) REFERENCES sites(site_id)
);

CREATE TABLE IF NOT EXISTS statutory_birth_death (
    record_id TEXT PRIMARY KEY,
    record_type TEXT NOT NULL,
    patient_id TEXT,
    registration_number TEXT,
    person_name TEXT NOT NULL,
    date_of_event DATE NOT NULL,
    time_of_event TEXT,
    place_of_event TEXT,
    cause TEXT,
    attending_doctor TEXT,
    father_mother_name TEXT,
    address TEXT,
    notification_sent INTEGER DEFAULT 0,
    notification_date DATE,
    registrar_office TEXT,
    site_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (site_id) REFERENCES sites(site_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 3: CLINICAL AUTOMATION (CPOE, eMAR, Drug Safety)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS drug_master (
    drug_id TEXT PRIMARY KEY,
    drug_code TEXT UNIQUE NOT NULL,
    brand_name TEXT NOT NULL,
    generic_name TEXT NOT NULL,
    strength TEXT,
    dosage_form TEXT,
    route TEXT DEFAULT 'ORAL',
    schedule TEXT,
    category TEXT,
    lasa_group TEXT,
    lasa_flag INTEGER DEFAULT 0,
    high_alert INTEGER DEFAULT 0,
    item_id TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES master_items(item_id)
);

CREATE TABLE IF NOT EXISTS drug_interactions (
    interaction_id TEXT PRIMARY KEY,
    drug_a_id TEXT NOT NULL,
    drug_b_id TEXT NOT NULL,
    severity TEXT NOT NULL,
    description TEXT NOT NULL,
    clinical_effect TEXT,
    management TEXT,
    source TEXT DEFAULT 'DRUGBANK',
    FOREIGN KEY (drug_a_id) REFERENCES drug_master(drug_id),
    FOREIGN KEY (drug_b_id) REFERENCES drug_master(drug_id)
);

CREATE TABLE IF NOT EXISTS patient_allergies (
    allergy_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    allergen_type TEXT NOT NULL,
    allergen_name TEXT NOT NULL,
    reaction TEXT,
    severity TEXT DEFAULT 'MODERATE',
    verified INTEGER DEFAULT 0,
    recorded_by TEXT,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS medication_orders (
    order_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    encounter_id TEXT,
    admission_id TEXT,
    drug_id TEXT NOT NULL,
    dose TEXT NOT NULL,
    dose_unit TEXT DEFAULT 'mg',
    frequency TEXT NOT NULL,
    route TEXT NOT NULL,
    duration_days INTEGER,
    start_date DATE NOT NULL,
    end_date DATE,
    instructions TEXT,
    status TEXT DEFAULT 'ACTIVE',
    ordered_by TEXT NOT NULL,
    verified_by TEXT,
    discontinued_reason TEXT,
    icd_code TEXT,
    snomed_code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (drug_id) REFERENCES drug_master(drug_id)
);

CREATE TABLE IF NOT EXISTS lab_orders (
    order_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    encounter_id TEXT,
    admission_id TEXT,
    test_code TEXT NOT NULL,
    test_name TEXT NOT NULL,
    loinc_code TEXT,
    priority TEXT DEFAULT 'ROUTINE',
    clinical_indication TEXT,
    specimen_type TEXT,
    status TEXT DEFAULT 'ORDERED',
    ordered_by TEXT NOT NULL,
    ordered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    collected_at DATETIME,
    reported_at DATETIME,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS imaging_orders (
    order_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    encounter_id TEXT,
    admission_id TEXT,
    modality TEXT NOT NULL,
    body_part TEXT NOT NULL,
    clinical_indication TEXT,
    priority TEXT DEFAULT 'ROUTINE',
    status TEXT DEFAULT 'ORDERED',
    ordered_by TEXT NOT NULL,
    ordered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    scheduled_at DATETIME,
    completed_at DATETIME,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS emar_records (
    emar_id TEXT PRIMARY KEY,
    medication_order_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    admission_id TEXT,
    scheduled_time DATETIME NOT NULL,
    administered_time DATETIME,
    dose_given TEXT,
    route TEXT,
    administered_by TEXT,
    witnessed_by TEXT,
    status TEXT DEFAULT 'SCHEDULED',
    patient_verified INTEGER DEFAULT 0,
    barcode_scanned INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (medication_order_id) REFERENCES medication_orders(order_id),
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS emar_safety_alerts (
    alert_id TEXT PRIMARY KEY,
    emar_id TEXT,
    medication_order_id TEXT,
    patient_id TEXT NOT NULL,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    description TEXT NOT NULL,
    drug_a TEXT,
    drug_b TEXT,
    overridden INTEGER DEFAULT 0,
    overridden_by TEXT,
    override_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS prescriptions (
    prescription_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    encounter_id TEXT,
    appointment_id TEXT,
    doctor_id TEXT NOT NULL,
    diagnosis_text TEXT,
    icd_code TEXT,
    notes TEXT,
    status TEXT DEFAULT 'ACTIVE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (doctor_id) REFERENCES doctors(doctor_id)
);

CREATE TABLE IF NOT EXISTS prescription_items (
    item_id TEXT PRIMARY KEY,
    prescription_id TEXT NOT NULL,
    drug_id TEXT,
    drug_name TEXT NOT NULL,
    dose TEXT NOT NULL,
    frequency TEXT NOT NULL,
    route TEXT DEFAULT 'ORAL',
    duration_days INTEGER,
    quantity INTEGER,
    instructions TEXT,
    FOREIGN KEY (prescription_id) REFERENCES prescriptions(prescription_id),
    FOREIGN KEY (drug_id) REFERENCES drug_master(drug_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 4: SCM, PHARMACY, MRP, TARIFF, TPA
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS warehouses (
    warehouse_id TEXT PRIMARY KEY,
    warehouse_name TEXT NOT NULL,
    warehouse_type TEXT DEFAULT 'CENTRAL',
    site_id TEXT,
    department TEXT,
    manager TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(site_id)
);

CREATE TABLE IF NOT EXISTS inventory_items (
    inventory_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL,
    batch_number TEXT,
    manufacturing_date DATE,
    expiry_date DATE,
    quantity_on_hand REAL DEFAULT 0,
    quantity_reserved REAL DEFAULT 0,
    unit_cost REAL DEFAULT 0,
    mrp REAL DEFAULT 0,
    rack_location TEXT,
    last_counted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES master_items(item_id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_transactions (
    transaction_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    quantity REAL NOT NULL,
    batch_number TEXT,
    reference_type TEXT,
    reference_id TEXT,
    from_warehouse_id TEXT,
    to_warehouse_id TEXT,
    unit_cost REAL,
    performed_by TEXT,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES master_items(item_id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    po_id TEXT PRIMARY KEY,
    po_number TEXT UNIQUE NOT NULL,
    supplier_name TEXT NOT NULL,
    supplier_gstin TEXT,
    warehouse_id TEXT NOT NULL,
    status TEXT DEFAULT 'DRAFT',
    total_amount REAL DEFAULT 0,
    gst_amount REAL DEFAULT 0,
    grand_total REAL DEFAULT 0,
    approved_by TEXT,
    approved_at DATETIME,
    received_at DATETIME,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id)
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
    line_id TEXT PRIMARY KEY,
    po_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    quantity_ordered REAL NOT NULL,
    quantity_received REAL DEFAULT 0,
    unit_cost REAL NOT NULL,
    gst_rate REAL DEFAULT 0,
    total_amount REAL NOT NULL,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id),
    FOREIGN KEY (item_id) REFERENCES master_items(item_id)
);

CREATE TABLE IF NOT EXISTS reorder_rules (
    rule_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL,
    reorder_point REAL NOT NULL,
    reorder_quantity REAL NOT NULL,
    safety_stock REAL DEFAULT 0,
    lead_time_days INTEGER DEFAULT 7,
    avg_daily_consumption REAL DEFAULT 0,
    last_calculated_at DATETIME,
    is_active INTEGER DEFAULT 1,
    FOREIGN KEY (item_id) REFERENCES master_items(item_id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id)
);

CREATE TABLE IF NOT EXISTS dispensing_records (
    dispensing_id TEXT PRIMARY KEY,
    prescription_id TEXT,
    patient_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    warehouse_id TEXT NOT NULL,
    batch_number TEXT,
    quantity_dispensed REAL NOT NULL,
    unit_price REAL DEFAULT 0,
    total_price REAL DEFAULT 0,
    dispensed_by TEXT,
    status TEXT DEFAULT 'DISPENSED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (prescription_id) REFERENCES prescriptions(prescription_id),
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (item_id) REFERENCES master_items(item_id),
    FOREIGN KEY (warehouse_id) REFERENCES warehouses(warehouse_id)
);

-- Tariff Engine
CREATE TABLE IF NOT EXISTS tariff_rules (
    rule_id TEXT PRIMARY KEY,
    service_code TEXT NOT NULL,
    service_name TEXT NOT NULL,
    department TEXT,
    payer_type TEXT NOT NULL,
    payer_name TEXT,
    rate REAL NOT NULL,
    discount_pct REAL DEFAULT 0,
    effective_from DATE,
    effective_to DATE,
    site_id TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES sites(site_id)
);

-- TPA & Cashless Claims
CREATE TABLE IF NOT EXISTS tpa_preauth_requests (
    preauth_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    admission_id TEXT,
    tpa_name TEXT NOT NULL,
    insurer_name TEXT NOT NULL,
    policy_number TEXT NOT NULL,
    requested_amount REAL NOT NULL,
    approved_amount REAL,
    co_pay_pct REAL DEFAULT 0,
    deductible REAL DEFAULT 0,
    status TEXT DEFAULT 'SUBMITTED',
    rejection_reason TEXT,
    preauth_number TEXT,
    validity_date DATE,
    submitted_by TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS tpa_claims (
    claim_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    admission_id TEXT,
    preauth_id TEXT,
    tpa_name TEXT NOT NULL,
    insurer_name TEXT NOT NULL,
    policy_number TEXT NOT NULL,
    claim_amount REAL NOT NULL,
    approved_amount REAL,
    deductions REAL DEFAULT 0,
    co_pay_amount REAL DEFAULT 0,
    patient_liability REAL DEFAULT 0,
    status TEXT DEFAULT 'DRAFT',
    claim_number TEXT,
    submitted_at DATETIME,
    processed_at DATETIME,
    remarks TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (preauth_id) REFERENCES tpa_preauth_requests(preauth_id)
);

CREATE TABLE IF NOT EXISTS tpa_settlements (
    settlement_id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL,
    settlement_amount REAL NOT NULL,
    utr_number TEXT,
    payment_date DATE,
    tds_amount REAL DEFAULT 0,
    net_received REAL NOT NULL,
    bank_reference TEXT,
    reconciled INTEGER DEFAULT 0,
    reconciled_by TEXT,
    reconciled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (claim_id) REFERENCES tpa_claims(claim_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 5: HL7 FHIR + LIS + PACS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fhir_resources (
    fhir_id TEXT PRIMARY KEY,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    patient_id TEXT,
    version INTEGER DEFAULT 1,
    resource_json TEXT NOT NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource_type, resource_id)
);

CREATE TABLE IF NOT EXISTS fhir_exchange_log (
    exchange_id TEXT PRIMARY KEY,
    direction TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    remote_endpoint TEXT,
    http_method TEXT,
    http_status INTEGER,
    request_body TEXT,
    response_body TEXT,
    correlation_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lis_results (
    result_id TEXT PRIMARY KEY,
    lab_order_id TEXT,
    patient_id TEXT NOT NULL,
    test_code TEXT NOT NULL,
    test_name TEXT NOT NULL,
    loinc_code TEXT,
    value TEXT NOT NULL,
    unit TEXT,
    reference_range TEXT,
    abnormal_flag TEXT,
    status TEXT DEFAULT 'FINAL',
    analyzer_id TEXT,
    analyzer_name TEXT,
    validated_by TEXT,
    validated_at DATETIME,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lab_order_id) REFERENCES lab_orders(order_id),
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS pacs_studies (
    study_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    imaging_order_id TEXT,
    accession_number TEXT UNIQUE,
    study_instance_uid TEXT UNIQUE,
    modality TEXT NOT NULL,
    body_part TEXT,
    study_date DATETIME,
    study_description TEXT,
    number_of_series INTEGER DEFAULT 0,
    number_of_instances INTEGER DEFAULT 0,
    referring_doctor TEXT,
    radiologist TEXT,
    report_status TEXT DEFAULT 'PENDING',
    report_text TEXT,
    report_impression TEXT,
    pacs_server TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (imaging_order_id) REFERENCES imaging_orders(order_id)
);
