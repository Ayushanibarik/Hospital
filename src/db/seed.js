/**
 * ============================================================================
 * MODULE: DemoCare Hospital Synthetic Data Seeder (src/db/seed.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Initializes and populates DemoCare Multispeciality Hospital with synthetic demo
 *   data: 12 doctors across 4 departments, 10 future appointment slots, test patients
 *   (DEMO-001, DEMO-002, DEMO-003), OPD queue tokens, billing records, admissions,
 *   discharges, and chronic care programs.
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Blueprint V3: Section D (Build Demo Environment Before Connecting Hospital)
 *   - Blueprint V3: Section E (Data Model — Exact Fields)
 *
 * PACKAGES & DEPENDENCIES:
 *   - ./index.js (db, initDB)              : Database connection and schema runner
 *
 * KEY EXPORTS:
 *   - seed()                               : Resets and seeds all demo data
 *
 * SYSTEM USAGE & INTEGRATION:
 *   - Invoked via npm run seed, test setups, or POST /api/demo/reset.
 * ============================================================================
 */

import { db, initDB } from './index.js';

export function seed() {
  console.log('🔄 Initializing database schema...');
  initDB();

  console.log('🌱 Seeding DemoCare Multispeciality Hospital data...');

  db.exec(`
    DELETE FROM available_slots;
    DELETE FROM doctors;
    DELETE FROM communication_logs;
    DELETE FROM exceptions;
    DELETE FROM audit_logs;
    DELETE FROM follow_ups;
    DELETE FROM diagnostic_tasks;
    DELETE FROM intake_forms;
    DELETE FROM insurance_preverifications;
    DELETE FROM queue_tokens;
    DELETE FROM opd_journeys;
    DELETE FROM billing_records;
    DELETE FROM ipd_admissions;
    DELETE FROM discharge_administrations;
    DELETE FROM referrals;
    DELETE FROM admission_preclearances;
    DELETE FROM chronic_programs;
    DELETE FROM appointments;
    DELETE FROM leads;
    DELETE FROM patients;
  `);

  const insertDoctor = db.prepare(`
    INSERT INTO doctors (doctor_id, name, department, room_number)
    VALUES (?, ?, ?, ?)
  `);

  const doctors = [
    ['DOC-CARD-01', 'Dr. Rajesh Mehta', 'Cardiology', 'Room 101 (Cath Lab Block)'],
    ['DOC-CARD-02', 'Dr. Ananya Sen', 'Cardiology', 'Room 102'],
    ['DOC-CARD-03', 'Dr. Vikram Malhotra', 'Cardiology', 'Room 103'],
    ['DOC-DERM-01', 'Dr. Priya Sharma', 'Dermatology', 'Room 201 (Cosmetic Wing)'],
    ['DOC-DERM-02', 'Dr. Rohan Nair', 'Dermatology', 'Room 202'],
    ['DOC-DERM-03', 'Dr. Sunita Kapoor', 'Dermatology', 'Room 203'],
    ['DOC-ORTH-01', 'Dr. Amit Patel', 'Orthopedics', 'Room 301 (Trauma & Joint)'],
    ['DOC-ORTH-02', 'Dr. Neha Verma', 'Orthopedics', 'Room 302'],
    ['DOC-ORTH-03', 'Dr. Kabir Das', 'Orthopedics', 'Room 303'],
    ['DOC-GMED-01', 'Dr. Suresh Rao', 'General Medicine', 'Room 401 (OPD Block)'],
    ['DOC-GMED-02', 'Dr. Kavita Reddy', 'General Medicine', 'Room 402'],
    ['DOC-GMED-03', 'Dr. Alok Gupta', 'General Medicine', 'Room 403']
  ];

  for (const doc of doctors) {
    insertDoctor.run(...doc);
  }

  const insertSlot = db.prepare(`
    INSERT INTO available_slots (slot_id, doctor_id, department, slot_start, slot_end, is_booked)
    VALUES (?, ?, ?, ?, ?, 0)
  `);

  const slots = [
    ['SLOT-001', 'DOC-CARD-01', 'Cardiology', '2026-10-04 10:00:00', '2026-10-04 10:30:00'],
    ['SLOT-002', 'DOC-CARD-01', 'Cardiology', '2026-10-04 11:00:00', '2026-10-04 11:30:00'],
    ['SLOT-003', 'DOC-CARD-02', 'Cardiology', '2026-10-05 14:00:00', '2026-10-05 14:30:00'],
    ['SLOT-004', 'DOC-DERM-01', 'Dermatology', '2026-10-04 10:30:00', '2026-10-04 11:00:00'],
    ['SLOT-005', 'DOC-DERM-01', 'Dermatology', '2026-10-04 16:00:00', '2026-10-04 16:30:00'],
    ['SLOT-006', 'DOC-DERM-02', 'Dermatology', '2026-10-05 11:30:00', '2026-10-05 12:00:00'],
    ['SLOT-007', 'DOC-ORTH-01', 'Orthopedics', '2026-10-04 09:30:00', '2026-10-04 10:00:00'],
    ['SLOT-008', 'DOC-ORTH-02', 'Orthopedics', '2026-10-04 15:00:00', '2026-10-04 15:30:00'],
    ['SLOT-009', 'DOC-GMED-01', 'General Medicine', '2026-10-04 10:00:00', '2026-10-04 10:30:00'],
    ['SLOT-010', 'DOC-GMED-02', 'General Medicine', '2026-10-05 12:00:00', '2026-10-05 12:30:00']
  ];

  for (const slot of slots) {
    insertSlot.run(...slot);
  }

  const insertPatient = db.prepare(`
    INSERT INTO patients (patient_id, full_name, phone, email, city, source, consent_status)
    VALUES (?, ?, ?, ?, ?, ?, 'CONSENTED')
  `);

  const patients = [
    ['DEMO-001', 'Rahul Sharma', '+919999999991', 'rahul.sharma@example.com', 'Mumbai', 'Instagram'],
    ['DEMO-002', 'Sneha Kulkarni', '+919999999992', 'sneha.k@example.com', 'Pune', 'Google Ads'],
    ['DEMO-003', 'Arun Varma', '+919999999993', 'arun.v@example.com', 'Bengaluru', 'Website Form']
  ];

  for (const p of patients) {
    insertPatient.run(...p);
  }

  db.prepare(`
    INSERT INTO appointments (appointment_id, patient_id, department, doctor_id, slot_start, slot_end, status, attendance_status)
    VALUES ('APPT-DEMO-002', 'DEMO-002', 'Dermatology', 'DOC-DERM-01', '2026-10-02 11:00:00', '2026-10-02 11:30:00', 'CONFIRMED', 'scheduled')
  `).run();

  db.prepare(`
    INSERT INTO follow_ups (followup_id, patient_id, category, approved_date, approved_window, owner, status)
    VALUES ('FOL-DEMO-003', 'DEMO-003', 'post_discharge', '2026-10-05', 'morning 10:00 AM - 12:00 PM', 'Patient Care Coordinator', 'PENDING')
  `).run();

  db.prepare(`
    INSERT INTO intake_forms (form_id, appointment_id, patient_id, chief_complaint, symptoms_duration, current_meds, allergies)
    VALUES ('FORM-001', 'APPT-DEMO-002', 'DEMO-002', 'Severe skin rash and itching on forearms', '3 weeks', 'Antihistamines 10mg', 'None')
  `).run();

  db.prepare(`
    INSERT INTO insurance_preverifications (verification_id, patient_id, policy_number, insurer_name, tpa_name, status, copay_estimate)
    VALUES ('INS-001', 'DEMO-002', 'STAR-HEALTH-99482', 'Star Health Allied Insurance', 'MediAssist TPA', 'APPROVED', 500.0)
  `).run();

  db.prepare(`
    INSERT INTO queue_tokens (token_id, appointment_id, patient_id, department, token_number, status)
    VALUES ('TKN-001', 'APPT-DEMO-002', 'DEMO-002', 'Dermatology', 14, 'WAITING')
  `).run();

  db.prepare(`
    INSERT INTO chronic_programs (program_id, patient_id, condition_name, last_visit_date, revisit_interval_days, next_due_date, status)
    VALUES ('CHR-001', 'DEMO-001', 'Hypertension & Lipid Management', '2026-07-01', 90, '2026-09-29', 'ACTIVE')
  `).run();

  db.prepare(`
    INSERT INTO opd_journeys (journey_id, patient_id, appointment_id, department, stage, token_number, notes)
    VALUES ('JRN-001', 'DEMO-001', 'APPT-DEMO-002', 'Cardiology', 'TRIAGE_VITALS', 1, 'BP: 120/80, SpO2: 99%, Pulse: 72 bpm')
  `).run();

  db.prepare(`
    INSERT INTO billing_records (bill_id, patient_id, encounter_id, service_type, total_amount, insurance_covered, copay_amount, payment_status, idempotency_key, invoice_url)
    VALUES ('BILL-001', 'DEMO-002', 'APPT-DEMO-002', 'Outpatient Consultation & Allergy Panel', 2500.0, 2000.0, 500.0, 'PENDING', 'IDEM-BILL-DEMO-002-01', 'https://democare.hospital/invoice/BILL-001')
  `).run();

  db.prepare(`
    INSERT INTO ipd_admissions (admission_id, patient_id, department, room_number, bed_type, doctor_id, status, attendant_name, attendant_phone, advance_deposit)
    VALUES ('ADM-001', 'DEMO-003', 'Orthopedics', 'Room 308 (Post-Op Wing)', 'PRIVATE', 'DOC-ORTH-01', 'ADMITTED', 'Sunil Varma', '+919999999994', 15000.0)
  `).run();

  db.prepare(`
    INSERT INTO discharge_administrations (discharge_id, patient_id, admission_id, clinical_clearance, pharmacy_clearance, billing_clearance, status, summary_ready, cleared_by_doctor)
    VALUES ('DISC-001', 'DEMO-003', 'ADM-001', 1, 1, 1, 'CLEARED_FOR_DISCHARGE', 1, 'Dr. Amit Patel')
  `).run();

  db.prepare(`
    INSERT INTO referrals (referral_id, patient_id, referring_doctor, referring_facility, department, clinical_notes, status, acknowledged)
    VALUES ('REF-001', 'DEMO-001', 'Dr. Ramesh Joshi, MD', 'Apex City Clinic', 'Cardiology', 'Referred for specialist evaluation of borderline dyslipidemia and cardiac echo', 'RECEIVED', 0)
  `).run();

  db.prepare(`
    INSERT INTO leads (lead_id, patient_id, source, campaign, enquiry_text, department, priority, status, created_at)
    VALUES ('LEAD-SLA-TEST', 'DEMO-001', 'Meta Ads', 'Heart-Health-Camp', 'Inquiring for comprehensive full-body executive checkup', 'Cardiology', 'normal', 'new', datetime('now', '-45 minutes'))
  `).run();

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES ('EVT-INIT-001', 'SYSTEM_INIT', 'v3.0', 'SYSTEM', 'SEEDED_DEMOCARE_ENVIRONMENT', 'DemoCare', 'HOSP-20261003-INIT001')
  `).run();

  console.log('✅ Seeding complete!');
  console.log(`   - ${doctors.length} Doctors across 4 Departments`);
  console.log(`   - ${slots.length} Demo Calendar Slots`);
  console.log(`   - 3 Test Patients (DEMO-001, DEMO-002, DEMO-003)`);
  console.log(`   - Initialized 26 Master Modules: Billing, Admissions, Discharges, Referrals, SLA Leads`);
}

seed();
