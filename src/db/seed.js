import { db, initDB } from './index.js';

export function seed() {
  console.log('🔄 Initializing database schema...');
  initDB();

  console.log('🌱 Seeding DemoCare Multispeciality Hospital data...');

  // Clear existing demo tables
  db.exec(`
    DELETE FROM available_slots;
    DELETE FROM doctors;
    DELETE FROM communication_logs;
    DELETE FROM exceptions;
    DELETE FROM audit_logs;
    DELETE FROM follow_ups;
    DELETE FROM diagnostic_tasks;
    DELETE FROM appointments;
    DELETE FROM leads;
    DELETE FROM patients;
  `);

  // 1. Doctors (3 per department across 4 departments)
  const insertDoctor = db.prepare(`
    INSERT INTO doctors (doctor_id, name, department, room_number)
    VALUES (?, ?, ?, ?)
  `);

  const doctors = [
    // Cardiology
    ['DOC-CARD-01', 'Dr. Rajesh Mehta', 'Cardiology', 'Room 101 (Cath Lab Block)'],
    ['DOC-CARD-02', 'Dr. Ananya Sen', 'Cardiology', 'Room 102'],
    ['DOC-CARD-03', 'Dr. Vikram Malhotra', 'Cardiology', 'Room 103'],
    // Dermatology
    ['DOC-DERM-01', 'Dr. Priya Sharma', 'Dermatology', 'Room 201 (Cosmetic Wing)'],
    ['DOC-DERM-02', 'Dr. Rohan Nair', 'Dermatology', 'Room 202'],
    ['DOC-DERM-03', 'Dr. Sunita Kapoor', 'Dermatology', 'Room 203'],
    // Orthopedics
    ['DOC-ORTH-01', 'Dr. Amit Patel', 'Orthopedics', 'Room 301 (Trauma & Joint)'],
    ['DOC-ORTH-02', 'Dr. Neha Verma', 'Orthopedics', 'Room 302'],
    ['DOC-ORTH-03', 'Dr. Kabir Das', 'Orthopedics', 'Room 303'],
    // General Medicine
    ['DOC-GMED-01', 'Dr. Suresh Rao', 'General Medicine', 'Room 401 (OPD Block)'],
    ['DOC-GMED-02', 'Dr. Kavita Reddy', 'General Medicine', 'Room 402'],
    ['DOC-GMED-03', 'Dr. Alok Gupta', 'General Medicine', 'Room 403']
  ];

  for (const doc of doctors) {
    insertDoctor.run(...doc);
  }

  // 2. Demo Calendar Slots (Future slots across upcoming days)
  const insertSlot = db.prepare(`
    INSERT INTO available_slots (slot_id, doctor_id, department, slot_start, slot_end, is_booked)
    VALUES (?, ?, ?, ?, ?, 0)
  `);

  const slots = [
    // Cardiology
    ['SLOT-001', 'DOC-CARD-01', 'Cardiology', '2026-10-04 10:00:00', '2026-10-04 10:30:00'],
    ['SLOT-002', 'DOC-CARD-01', 'Cardiology', '2026-10-04 11:00:00', '2026-10-04 11:30:00'],
    ['SLOT-003', 'DOC-CARD-02', 'Cardiology', '2026-10-05 14:00:00', '2026-10-05 14:30:00'],
    // Dermatology
    ['SLOT-004', 'DOC-DERM-01', 'Dermatology', '2026-10-04 10:30:00', '2026-10-04 11:00:00'],
    ['SLOT-005', 'DOC-DERM-01', 'Dermatology', '2026-10-04 16:00:00', '2026-10-04 16:30:00'],
    ['SLOT-006', 'DOC-DERM-02', 'Dermatology', '2026-10-05 11:30:00', '2026-10-05 12:00:00'],
    // Orthopedics
    ['SLOT-007', 'DOC-ORTH-01', 'Orthopedics', '2026-10-04 09:30:00', '2026-10-04 10:00:00'],
    ['SLOT-008', 'DOC-ORTH-02', 'Orthopedics', '2026-10-04 15:00:00', '2026-10-04 15:30:00'],
    // General Medicine
    ['SLOT-009', 'DOC-GMED-01', 'General Medicine', '2026-10-04 10:00:00', '2026-10-04 10:30:00'],
    ['SLOT-010', 'DOC-GMED-02', 'General Medicine', '2026-10-05 12:00:00', '2026-10-05 12:30:00']
  ];

  for (const slot of slots) {
    insertSlot.run(...slot);
  }

  // 3. Demo Patients (Section D test patient IDs)
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

  // 4. Sample Existing Appointment (for No-Show Recovery Demo)
  db.prepare(`
    INSERT INTO appointments (appointment_id, patient_id, department, doctor_id, slot_start, slot_end, status, attendance_status)
    VALUES ('APPT-DEMO-002', 'DEMO-002', 'Dermatology', 'DOC-DERM-01', '2026-10-02 11:00:00', '2026-10-02 11:30:00', 'CONFIRMED', 'scheduled')
  `).run();

  // 5. Sample Discharge Encounter (for Post-Discharge Follow-Up Demo)
  db.prepare(`
    INSERT INTO follow_ups (followup_id, patient_id, category, approved_date, approved_window, owner, status)
    VALUES ('FOL-DEMO-003', 'DEMO-003', 'post_discharge', '2026-10-05', 'morning 10:00 AM - 12:00 PM', 'Patient Care Coordinator', 'PENDING')
  `).run();

  // 6. Sample Audit & Exceptions
  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES ('EVT-INIT-001', 'SYSTEM_INIT', 'v3.0', 'SYSTEM', 'SEEDED_DEMOCARE_ENVIRONMENT', 'DemoCare', 'HOSP-20261003-INIT001')
  `).run();

  console.log('✅ Seeding complete!');
  console.log(`   - ${doctors.length} Doctors across 4 Departments`);
  console.log(`   - ${slots.length} Demo Calendar Slots`);
  console.log(`   - 3 Test Patients (DEMO-001, DEMO-002, DEMO-003)`);
}

// Run directly if invoked from CLI
seed();

