-- Hospital Revenue & Patient Lifecycle Automation Layer
-- Master Schema (Section E of Blueprint)

CREATE TABLE IF NOT EXISTS patients (
    patient_id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    city TEXT,
    source TEXT,
    consent_status TEXT DEFAULT 'CONSENTED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leads (
    lead_id TEXT PRIMARY KEY,
    patient_id TEXT,
    source TEXT,
    campaign TEXT,
    enquiry_text TEXT,
    department TEXT,
    priority TEXT DEFAULT 'normal',
    owner TEXT DEFAULT 'Reception Desk',
    status TEXT DEFAULT 'new',
    first_response_at DATETIME,
    appointment_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS appointments (
    appointment_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    department TEXT NOT NULL,
    doctor_id TEXT NOT NULL,
    slot_start DATETIME NOT NULL,
    slot_end DATETIME NOT NULL,
    status TEXT DEFAULT 'CONFIRMED', -- PENDING, CONFIRMED, CANCELLED, RESCHEDULED, COMPLETED
    reminder_24h INTEGER DEFAULT 0,
    reminder_3h INTEGER DEFAULT 0,
    attendance_status TEXT DEFAULT 'scheduled', -- scheduled, attended, no_show
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS follow_ups (
    followup_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    category TEXT NOT NULL, -- post_discharge, routine, diagnostic_review
    approved_date DATE NOT NULL,
    approved_window TEXT, -- e.g. 'morning 10am-12pm'
    owner TEXT DEFAULT 'Patient Care Coordinator',
    status TEXT DEFAULT 'PENDING', -- PENDING, SENT, COMPLETED, ESCALATED
    attempt_count INTEGER DEFAULT 0,
    next_action_at DATETIME,
    FOREIGN KEY(patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS diagnostic_tasks (
    diagnostic_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    encounter_id TEXT,
    test_category TEXT NOT NULL,
    ordered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    report_ready_at DATETIME,
    review_status TEXT DEFAULT 'PENDING_REVIEW', -- PENDING_REVIEW, REVIEWED_BY_DOCTOR
    notification_status TEXT DEFAULT 'UNSENT', -- UNSENT, SENT_TO_PATIENT
    owner TEXT DEFAULT 'Lab Coordinator',
    FOREIGN KEY(patient_id) REFERENCES patients(patient_id)
);

CREATE TABLE IF NOT EXISTS communication_logs (
    message_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    channel TEXT NOT NULL, -- WhatsApp, SMS, Email, Internal
    template_name TEXT NOT NULL,
    workflow_name TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivery_status TEXT DEFAULT 'DELIVERED', -- SENT, DELIVERED, READ, FAILED
    response_status TEXT DEFAULT 'AWAITING_REPLY', -- AWAITING_REPLY, REPLIED, EXPIRED
    correlation_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exceptions (
    exception_id TEXT PRIMARY KEY,
    workflow_name TEXT NOT NULL,
    record_id TEXT,
    error_type TEXT NOT NULL,
    severity TEXT NOT NULL, -- low, medium, high
    owner TEXT DEFAULT 'Ops Supervisor',
    due_at DATETIME,
    status TEXT DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, RESOLVED
    resolution_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    event_id TEXT PRIMARY KEY,
    workflow_name TEXT NOT NULL,
    workflow_version TEXT DEFAULT 'v3.0',
    actor_type TEXT NOT NULL, -- SYSTEM, AI_AGENT, STAFF
    action TEXT NOT NULL,
    record_id TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    correlation_id TEXT NOT NULL
);

-- Demo Setup Entities (Section D)
CREATE TABLE IF NOT EXISTS doctors (
    doctor_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    room_number TEXT NOT NULL,
    is_available INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS available_slots (
    slot_id TEXT PRIMARY KEY,
    doctor_id TEXT NOT NULL,
    department TEXT NOT NULL,
    slot_start DATETIME NOT NULL,
    slot_end DATETIME NOT NULL,
    is_booked INTEGER DEFAULT 0,
    FOREIGN KEY(doctor_id) REFERENCES doctors(doctor_id)
);

-- Module 3: Digital Pre-Consultation Intake Forms
CREATE TABLE IF NOT EXISTS intake_forms (
    form_id TEXT PRIMARY KEY,
    appointment_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    chief_complaint TEXT,
    symptoms_duration TEXT,
    current_meds TEXT,
    allergies TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(appointment_id) REFERENCES appointments(appointment_id),
    FOREIGN KEY(patient_id) REFERENCES patients(patient_id)
);

-- Module 4: Insurance Pre-Verification / TPA
CREATE TABLE IF NOT EXISTS insurance_preverifications (
    verification_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    policy_number TEXT NOT NULL,
    insurer_name TEXT NOT NULL,
    tpa_name TEXT,
    status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, QUERY_RAISED, REJECTED
    copay_estimate REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES patients(patient_id)
);

-- Module 10: In-Hospital OPD Flow & Token Queue
CREATE TABLE IF NOT EXISTS queue_tokens (
    token_id TEXT PRIMARY KEY,
    appointment_id TEXT,
    patient_id TEXT NOT NULL,
    department TEXT NOT NULL,
    token_number INTEGER NOT NULL,
    status TEXT DEFAULT 'WAITING', -- WAITING, CALLED, IN_CONSULTATION, COMPLETED, SKIPPED
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    called_at DATETIME,
    FOREIGN KEY(patient_id) REFERENCES patients(patient_id)
);

-- Module 12: Inpatient Admission Pre-Clearance
CREATE TABLE IF NOT EXISTS admission_preclearances (
    admission_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    department TEXT NOT NULL,
    room_preference TEXT DEFAULT 'SEMI_PRIVATE', -- GENERAL, SEMI_PRIVATE, PRIVATE, SUITE
    attendant_name TEXT,
    attendant_phone TEXT,
    estimate_acknowledged INTEGER DEFAULT 1,
    advance_deposit_status TEXT DEFAULT 'PENDING', -- PENDING, RECEIVED, WAIVED
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(patient_id) REFERENCES patients(patient_id)
);

-- Module 16: Chronic Disease Management & Revisit Scheduling
CREATE TABLE IF NOT EXISTS chronic_programs (
    program_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    condition_name TEXT NOT NULL, -- Hypertension, Diabetes Type 2, CAD, Dyslipidemia
    last_visit_date DATE NOT NULL,
    revisit_interval_days INTEGER DEFAULT 90,
    next_due_date DATE NOT NULL,
    status TEXT DEFAULT 'ACTIVE', -- ACTIVE, RECALLED, COMPLETED
    FOREIGN KEY(patient_id) REFERENCES patients(patient_id)
);

