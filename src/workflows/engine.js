import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { callClaude } from '../ai/claude.js';
import { dispatchWhatsApp } from '../whatsapp/qr_bridge.js';

/**
 * Generate Correlation ID adhering to Section F: HOSP-YYYYMMDD-XXXXXX
 */
export function generateCorrelationId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `HOSP-${dateStr}-${randomHex}`;
}

/**
 * Generate unique random collision-proof entity/event ID
 */
export function generateUniqueId(prefix = 'ID') {
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${Date.now().toString().slice(-6)}-${rand}`;
}

/**
 * WORKFLOW 1: HOSPITAL | 01 Lead Intake
 * Sections O & P
 */
export async function handleLeadIntake(payload) {
  const correlationId = payload.correlation_id || generateCorrelationId();
  const timestamp = new Date().toISOString();

  // Audit entry for inbound event
  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, correlation_id)
    VALUES (?, 'HOSPITAL | 01 Lead Intake', 'v3.0', 'SYSTEM', 'INBOUND_WEBHOOK_RECEIVED', ?)
  `).run(generateUniqueId('EVT'), correlationId);

  // 1. AI Lead Qualification
  const qualification = await callClaude('LEAD_QUALIFICATION', payload);

  // 2. Human Review Escalation Check (Emergency / Clinical inquiry)
  if (qualification.priority_for_human_review === 'review') {
    const excId = `EXC-${Date.now()}`;
    db.prepare(`
      INSERT INTO exceptions (exception_id, workflow_name, record_id, error_type, severity, owner, resolution_note)
      VALUES (?, 'HOSPITAL | 01 Lead Intake', ?, 'CLINICAL_OR_EMERGENCY_ESCALATION', 'high', 'ER / Triage Nurse', ?)
    `).run(excId, payload.phone || 'UNKNOWN', qualification.reason);

    return {
      status: 'ESCALATED_TO_HUMAN',
      correlation_id: correlationId,
      reason: qualification.reason,
      qualification
    };
  }

  const assignedDepartment = qualification.department || payload.department || 'General Medicine';

  // 3. Upsert Patient
  let patient = db.prepare(`SELECT * FROM patients WHERE phone = ?`).get(payload.phone);
  let patientId = patient?.patient_id;

  if (!patient) {
    patientId = `PAT-${Date.now().toString().slice(-6)}`;
    db.prepare(`
      INSERT INTO patients (patient_id, full_name, phone, city, source, consent_status)
      VALUES (?, ?, ?, ?, ?, 'CONSENTED')
    `).run(
      patientId,
      payload.full_name || 'Anonymous Patient',
      payload.phone,
      payload.city || 'Mumbai',
      payload.source || 'Website'
    );
  }

  // 4. Create Lead Record
  const leadId = `LEAD-${Date.now().toString().slice(-6)}`;
  db.prepare(`
    INSERT INTO leads (lead_id, patient_id, source, campaign, enquiry_text, department, priority, status, first_response_at)
    VALUES (?, ?, ?, ?, ?, ?, 'normal', 'qualified', ?)
  `).run(
    leadId,
    patientId,
    payload.source || 'Website',
    payload.campaign || 'Direct',
    payload.enquiry_text,
    assignedDepartment,
    timestamp
  );

  // 5. Check Appointment Availability
  let slot = db.prepare(`
    SELECT s.*, d.name as doctor_name
    FROM available_slots s
    JOIN doctors d ON s.doctor_id = d.doctor_id
    WHERE s.department = ? AND s.is_booked = 0
    ORDER BY s.slot_start ASC
    LIMIT 1
  `).get(assignedDepartment);

  if (!slot) {
    // If no slot in requested department, find any future slot in General Medicine
    slot = db.prepare(`
      SELECT s.*, d.name as doctor_name
      FROM available_slots s
      JOIN doctors d ON s.doctor_id = d.doctor_id
      WHERE s.is_booked = 0
      ORDER BY s.slot_start ASC
      LIMIT 1
    `).get();
  }

  if (!slot) {
    // No slots available anywhere - log exception
    const excId = `EXC-${Date.now()}`;
    db.prepare(`
      INSERT INTO exceptions (exception_id, workflow_name, record_id, error_type, severity, owner, resolution_note)
      VALUES (?, 'HOSPITAL | 01 Lead Intake', ?, 'NO_SLOTS_AVAILABLE', 'medium', 'Reception Desk', 'No open slots found for department')
    `).run(excId, leadId);

    return {
      status: 'SLOT_UNAVAILABLE',
      correlation_id: correlationId,
      lead_id: leadId,
      message: 'Lead qualified but no slots currently open. Routed to reception queue.'
    };
  }

  // 6. Lock slot and Book Appointment
  db.prepare(`UPDATE available_slots SET is_booked = 1 WHERE slot_id = ?`).run(slot.slot_id);

  const appointmentId = `APPT-${Date.now().toString().slice(-6)}`;
  db.prepare(`
    INSERT INTO appointments (appointment_id, patient_id, department, doctor_id, slot_start, slot_end, status, attendance_status)
    VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', 'scheduled')
  `).run(
    appointmentId,
    patientId,
    assignedDepartment,
    slot.doctor_id,
    slot.slot_start,
    slot.slot_end
  );

  db.prepare(`UPDATE leads SET appointment_id = ?, status = 'booked' WHERE lead_id = ?`).run(appointmentId, leadId);

  // 7. AI Confirmation Message Generation (Prompt 2)
  const messageData = await callClaude('APPOINTMENT_MESSAGE', {
    patient_name: payload.full_name,
    department: assignedDepartment,
    doctor_name: slot.doctor_name,
    confirmed_slot: slot.slot_start,
    hospital_name: 'DemoCare Multispeciality Hospital',
    hospital_contact: '+91 22 5550 1234'
  });

  // 8. Communication Log (Simulated WhatsApp send)
  const msgId = `MSG-${Date.now().toString().slice(-6)}`;
  db.prepare(`
    INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
    VALUES (?, ?, 'WhatsApp', 'APPT_CONFIRM_01', 'HOSPITAL | 01 Lead Intake', ?, 'DELIVERED', 'AWAITING_REPLY', ?)
  `).run(msgId, patientId, timestamp, correlationId);

  // Dispatch via live WhatsApp Web QR Bridge (or safe simulation)
  await dispatchWhatsApp({ toPhone: payload.phone, messageText: messageData.message });

  return {
    status: 'SUCCESS',
    correlation_id: correlationId,
    patient_id: patientId,
    lead_id: leadId,
    appointment_id: appointmentId,
    department: assignedDepartment,
    doctor: slot.doctor_name,
    slot: slot.slot_start,
    message_sent: messageData.message
  };
}

/**
 * WORKFLOW 2: HOSPITAL | 03 No-Show Recovery
 * Section Q
 */
export async function handleNoShowRecovery(appointmentId) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  // 1. Lookup appointment
  const appt = db.prepare(`
    SELECT a.*, p.full_name, p.phone
    FROM appointments a
    JOIN patients p ON a.patient_id = p.patient_id
    WHERE a.appointment_id = ?
  `).get(appointmentId);

  if (!appt) {
    throw new Error(`Appointment ${appointmentId} not found`);
  }

  // 2. Mark attendance as no_show
  db.prepare(`UPDATE appointments SET attendance_status = 'no_show' WHERE appointment_id = ?`).run(appointmentId);

  // 3. Idempotency Check: Check if recovery message already sent
  const existingMsg = db.prepare(`
    SELECT * FROM communication_logs 
    WHERE patient_id = ? AND template_name = 'NOSHOW_RECOVERY_01'
  `).get(appt.patient_id);

  if (existingMsg) {
    console.log(`[Idempotency] No-show recovery already sent for patient ${appt.patient_id}. Skipping duplicate send.`);
    return {
      status: 'SKIPPED_DUPLICATE',
      message: 'Recovery message already sent previously.',
      correlation_id: correlationId
    };
  }

  // 4. Generate Recovery Message (Prompt 3)
  const recoveryMsg = await callClaude('NOSHOW_RECOVERY', {
    patient_name: appt.full_name,
    appointment_date: appt.slot_start,
    hospital_name: 'DemoCare Multispeciality Hospital',
    reschedule_link_or_options: `https://democare.hospital/reschedule?token=${appointmentId}`
  });

  // 5. Send & Log WhatsApp Message
  const msgId = `MSG-NOSHOW-${Date.now().toString().slice(-6)}`;
  db.prepare(`
    INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
    VALUES (?, ?, 'WhatsApp', 'NOSHOW_RECOVERY_01', 'HOSPITAL | 03 No-Show Recovery', ?, 'DELIVERED', 'AWAITING_REPLY', ?)
  `).run(msgId, appt.patient_id, timestamp, correlationId);

  await dispatchWhatsApp({ toPhone: appt.phone, messageText: recoveryMsg.message });

  // 6. Create Follow-Up Task
  const followupId = `FOL-NOSHOW-${Date.now().toString().slice(-6)}`;
  db.prepare(`
    INSERT INTO follow_ups (followup_id, patient_id, category, approved_date, approved_window, owner, status)
    VALUES (?, ?, 'no_show_recovery', date('now', '+1 day'), 'Morning 10:00 AM - 1:00 PM', 'Front Desk Lead', 'PENDING')
  `).run(followupId, appt.patient_id);

  return {
    status: 'RECOVERY_SENT',
    correlation_id: correlationId,
    appointment_id: appointmentId,
    patient_name: appt.full_name,
    followup_task_id: followupId,
    message_sent: recoveryMsg.message
  };
}

/**
 * WORKFLOW 3: Discharge & Service Recovery
 * Section R
 */
export async function handleDischargeFollowup({ patient_id, category = 'post_discharge' }) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  if (!patient) {
    throw new Error(`Patient ${patient_id} not found`);
  }

  // 1. Create Follow-Up Task (Prompt 4)
  const taskData = await callClaude('FOLLOWUP_TASK', {
    patient_id,
    approved_followup_date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    category,
    owner: 'Patient Care Coordinator'
  });

  const followupId = `FOL-DISC-${Date.now().toString().slice(-6)}`;
  db.prepare(`
    INSERT INTO follow_ups (followup_id, patient_id, category, approved_date, approved_window, owner, status)
    VALUES (?, ?, ?, ?, 'afternoon 2:00 PM - 5:00 PM', ?, 'SENT')
  `).run(followupId, patient_id, category, taskData.due_date, taskData.owner);

  // 2. Send Discharge Administrative Check-in
  const msgId = `MSG-DISC-${Date.now().toString().slice(-6)}`;
  const messageText = `Hello ${patient.full_name}, DemoCare Multispeciality Hospital checking in after your recent discharge. Please remember to take medications exactly as given in your discharge summary. How is your recovery feeling today? (Reply with rating 1-5)`;

  db.prepare(`
    INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
    VALUES (?, ?, 'WhatsApp', 'DISCHARGE_CHECKIN_01', 'HOSPITAL | Discharge Follow-Up', ?, 'DELIVERED', 'AWAITING_REPLY', ?)
  `).run(msgId, patient_id, timestamp, correlationId);

  await dispatchWhatsApp({ toPhone: patient.phone, messageText });

  return {
    status: 'DISCHARGE_FOLLOWUP_DISPATCHED',
    correlation_id: correlationId,
    patient_name: patient.full_name,
    task_id: followupId,
    message: messageText
  };
}

/**
 * Handle Patient Inbound Feedback & Trigger Service Recovery if Negative
 */
export function handlePatientFeedback({ patient_id, rating, comment }) {
  const timestamp = new Date().toISOString();
  const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  
  const numRating = parseInt(rating, 10);
  let serviceRecoveryCreated = false;

  if (numRating <= 2) {
    // Escalate negative feedback to Service Recovery Queue (Section R & C #17)
    const excId = `EXC-SR-${Date.now().toString().slice(-6)}`;
    db.prepare(`
      INSERT INTO exceptions (exception_id, workflow_name, record_id, error_type, severity, owner, resolution_note)
      VALUES (?, 'SERVICE_RECOVERY', ?, 'DISSATISFIED_PATIENT_FEEDBACK', 'high', 'Patient Experience Head', ?)
    `).run(excId, patient_id, `Patient gave rating ${numRating}/5. Feedback: "${comment || 'No text provided'}". Urgent callback required.`);
    serviceRecoveryCreated = true;
  }

  return {
    status: 'FEEDBACK_PROCESSED',
    rating: numRating,
    service_recovery_escalation: serviceRecoveryCreated
  };
}

/**
 * WORKFLOW: Module 8 - Appointment Rescheduling
 */
export async function handleAppointmentReschedule({ appointment_id, new_slot_id }) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  const appt = db.prepare(`
    SELECT a.*, p.full_name, p.phone
    FROM appointments a
    JOIN patients p ON a.patient_id = p.patient_id
    WHERE a.appointment_id = ?
  `).get(appointment_id);

  if (!appt) {
    throw new Error(`Appointment ${appointment_id} not found`);
  }

  // Find target new slot
  let targetSlot = null;
  if (new_slot_id) {
    targetSlot = db.prepare(`
      SELECT s.*, d.name as doctor_name
      FROM available_slots s
      JOIN doctors d ON s.doctor_id = d.doctor_id
      WHERE s.slot_id = ? AND s.is_booked = 0
    `).get(new_slot_id);
  } else {
    // Pick next available slot in same department
    targetSlot = db.prepare(`
      SELECT s.*, d.name as doctor_name
      FROM available_slots s
      JOIN doctors d ON s.doctor_id = d.doctor_id
      WHERE s.department = ? AND s.is_booked = 0
      ORDER BY s.slot_start ASC LIMIT 1
    `).get(appt.department);
  }

  if (!targetSlot) {
    throw new Error(`No available slot found to reschedule`);
  }

  // Lock new slot
  db.prepare(`UPDATE available_slots SET is_booked = 1 WHERE slot_id = ?`).run(targetSlot.slot_id);

  // Update appointment record
  db.prepare(`
    UPDATE appointments
    SET doctor_id = ?, slot_start = ?, slot_end = ?, status = 'RESCHEDULED', attendance_status = 'scheduled'
    WHERE appointment_id = ?
  `).run(targetSlot.doctor_id, targetSlot.slot_start, targetSlot.slot_end, appointment_id);

  // Send Rescheduled Confirmation
  const msgId = `MSG-RESCHED-${Date.now().toString().slice(-6)}`;
  const messageText = `Hello ${appt.full_name}, your appointment with ${targetSlot.doctor_name} has been successfully rescheduled to ${targetSlot.slot_start}. DemoCare Hospital: +91 22 5550 1234.`;

  db.prepare(`
    INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
    VALUES (?, ?, 'WhatsApp', 'APPT_RESCHEDULE_01', 'HOSPITAL | Appointment Reschedule', ?, 'DELIVERED', 'AWAITING_REPLY', ?)
  `).run(msgId, appt.patient_id, timestamp, correlationId);

  await dispatchWhatsApp({ toPhone: appt.phone, messageText });

  return {
    status: 'RESCHEDULED_SUCCESS',
    correlation_id: correlationId,
    appointment_id,
    new_slot: targetSlot.slot_start,
    doctor: targetSlot.doctor_name,
    message: messageText
  };
}

/**
 * WORKFLOW: Module 11 - Diagnostic Follow-Up
 */
export async function handleDiagnosticReady({ patient_id, test_category }) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  if (!patient) {
    throw new Error(`Patient ${patient_id} not found`);
  }

  const diagnosticId = `DIAG-${Date.now().toString().slice(-6)}`;
  db.prepare(`
    INSERT INTO diagnostic_tasks (diagnostic_id, patient_id, test_category, ordered_at, completed_at, report_ready_at, review_status, notification_status)
    VALUES (?, ?, ?, datetime('now', '-1 day'), datetime('now', '-2 hours'), ?, 'REVIEWED_BY_DOCTOR', 'SENT_TO_PATIENT')
  `).run(diagnosticId, patient_id, test_category || 'Routine Blood Panel & ECG', timestamp);

  // Send purely administrative notification (NO clinical details)
  const msgId = `MSG-DIAG-${Date.now().toString().slice(-6)}`;
  const messageText = `Hello ${patient.full_name}, your diagnostic test results for ${test_category || 'Routine Lab Work'} have been reviewed by your physician and are ready for consultation at DemoCare Hospital. Please book a follow-up consultation or view your digital slip: https://democare.hospital/reports`;

  db.prepare(`
    INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
    VALUES (?, ?, 'WhatsApp', 'DIAGNOSTIC_READY_01', 'HOSPITAL | Diagnostic Follow-Up', ?, 'DELIVERED', 'AWAITING_REPLY', ?)
  `).run(msgId, patient_id, timestamp, correlationId);

  await dispatchWhatsApp({ toPhone: patient.phone, messageText });

  return {
    status: 'DIAGNOSTIC_NOTIFICATION_SENT',
    correlation_id: correlationId,
    diagnostic_id: diagnosticId,
    patient_name: patient.full_name,
    message: messageText
  };
}

/**
 * WORKFLOW: Module 3 - Pre-Consultation Intake Form
 */
export async function handlePreConsultationIntake({ appointment_id, patient_id, chief_complaint, symptoms_duration, current_meds, allergies }) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  let patient = null;
  if (patient_id) {
    patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  } else if (appointment_id) {
    patient = db.prepare(`
      SELECT p.* FROM patients p
      JOIN appointments a ON p.patient_id = a.patient_id
      WHERE a.appointment_id = ?
    `).get(appointment_id);
    patient_id = patient?.patient_id;
  }

  if (!patient) {
    throw new Error('Valid patient_id or appointment_id required for pre-consultation intake');
  }

  const formId = generateUniqueId('FORM');
  db.prepare(`
    INSERT INTO intake_forms (form_id, appointment_id, patient_id, chief_complaint, symptoms_duration, current_meds, allergies, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(formId, appointment_id || 'APPT-DIRECT', patient_id, chief_complaint || '', symptoms_duration || '', current_meds || 'None', allergies || 'None', timestamp);

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 03 Pre-Consultation Intake', 'v3.0', 'PATIENT', 'SUBMITTED_INTAKE_FORM', ?, ?)
  `).run(generateUniqueId('EVT'), formId, correlationId);

  const messageText = `Hello ${patient.full_name}, thank you for submitting your pre-consultation intake details. Your information has been shared securely with your doctor for review before your appointment.`;
  await dispatchWhatsApp({ toPhone: patient.phone, messageText });

  return {
    status: 'INTAKE_SUBMITTED',
    correlation_id: correlationId,
    form_id: formId,
    patient_id,
    message: messageText
  };
}

/**
 * WORKFLOW: Module 4 - Insurance Pre-Verification / TPA
 */
export async function handleInsurancePreVerification({ patient_id, policy_number, insurer_name, tpa_name, copay_estimate = 0 }) {
  const correlationId = generateCorrelationId();
  const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  if (!patient) throw new Error(`Patient ${patient_id} not found`);

  const verificationId = generateUniqueId('INS');
  db.prepare(`
    INSERT INTO insurance_preverifications (verification_id, patient_id, policy_number, insurer_name, tpa_name, status, copay_estimate)
    VALUES (?, ?, ?, ?, ?, 'APPROVED', ?)
  `).run(verificationId, patient_id, policy_number, insurer_name, tpa_name || 'In-House TPA Desk', copay_estimate);

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 04 Insurance Pre-Verification', 'v3.0', 'STAFF', 'INSURANCE_PRE_VERIFIED', ?, ?)
  `).run(generateUniqueId('EVT'), verificationId, correlationId);

  const messageText = `Hello ${patient.full_name}, your insurance pre-verification for ${insurer_name} (Policy: ${policy_number}) has been pre-cleared by DemoCare TPA desk. Estimated Copay: ₹${copay_estimate}.`;
  await dispatchWhatsApp({ toPhone: patient.phone, messageText });

  return {
    status: 'INSURANCE_PRE_VERIFIED',
    correlation_id: correlationId,
    verification_id: verificationId,
    patient_id,
    policy_number,
    copay_estimate,
    message: messageText
  };
}

/**
 * WORKFLOW: Module 10 - In-Hospital OPD Flow & Token Queue Management
 */
export async function handleGenerateQueueToken({ appointment_id, patient_id, department }) {
  const correlationId = generateCorrelationId();
  const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  if (!patient) throw new Error(`Patient ${patient_id} not found`);

  // Calculate next token number for this department today
  const lastToken = db.prepare(`
    SELECT MAX(token_number) as max_token
    FROM queue_tokens
    WHERE department = ? AND date(created_at) = date('now')
  `).get(department);

  const tokenNumber = (lastToken?.max_token || 0) + 1;
  const tokenId = generateUniqueId('TKN');

  db.prepare(`
    INSERT INTO queue_tokens (token_id, appointment_id, patient_id, department, token_number, status)
    VALUES (?, ?, ?, ?, ?, 'WAITING')
  `).run(tokenId, appointment_id || null, patient_id, department, tokenNumber);

  // Count patients waiting ahead
  const ahead = db.prepare(`
    SELECT COUNT(*) as count
    FROM queue_tokens
    WHERE department = ? AND status = 'WAITING' AND token_number < ?
  `).get(department, tokenNumber).count;

  const estimatedWaitMins = ahead * 10;
  const messageText = `DemoCare OPD: Your live token for ${department} is #${tokenNumber}. Currently ${ahead} patient(s) ahead of you. Estimated wait: ~${estimatedWaitMins} minutes. Live token displays are active in the waiting lounge.`;

  await dispatchWhatsApp({ toPhone: patient.phone, messageText });

  return {
    status: 'TOKEN_GENERATED',
    correlation_id: correlationId,
    token_id: tokenId,
    token_number: tokenNumber,
    department,
    patients_ahead: ahead,
    estimated_wait_minutes: estimatedWaitMins,
    message: messageText
  };
}

export async function handleCallNextQueueToken({ department }) {
  const correlationId = generateCorrelationId();
  const nextToken = db.prepare(`
    SELECT q.*, p.full_name, p.phone
    FROM queue_tokens q
    JOIN patients p ON q.patient_id = p.patient_id
    WHERE q.department = ? AND q.status = 'WAITING'
    ORDER BY q.token_number ASC
    LIMIT 1
  `).get(department);

  if (!nextToken) {
    return { status: 'QUEUE_EMPTY', department, message: `No waiting patients in ${department}` };
  }

  db.prepare(`
    UPDATE queue_tokens
    SET status = 'CALLED', called_at = datetime('now')
    WHERE token_id = ?
  `).run(nextToken.token_id);

  const messageText = `Token Alert #${nextToken.token_number}: ${nextToken.full_name}, please proceed to the ${department} consultation room immediately. Your physician is ready.`;
  await dispatchWhatsApp({ toPhone: nextToken.phone, messageText });

  return {
    status: 'TOKEN_CALLED',
    correlation_id: correlationId,
    token_id: nextToken.token_id,
    token_number: nextToken.token_number,
    patient_name: nextToken.full_name,
    message: messageText
  };
}

/**
 * WORKFLOW: Module 12 - Inpatient Admission Pre-Clearance
 */
export async function handleAdmissionPreClearance({ patient_id, department, room_preference = 'SEMI_PRIVATE', attendant_name, attendant_phone }) {
  const correlationId = generateCorrelationId();
  const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  if (!patient) throw new Error(`Patient ${patient_id} not found`);

  const admissionId = generateUniqueId('ADM');
  db.prepare(`
    INSERT INTO admission_preclearances (admission_id, patient_id, department, room_preference, attendant_name, attendant_phone, estimate_acknowledged, advance_deposit_status)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'RECEIVED')
  `).run(admissionId, patient_id, department, room_preference, attendant_name || 'Family Attendant', attendant_phone || patient.phone);

  const messageText = `DemoCare Admissions: Pre-clearance complete for ${patient.full_name} in ${department}. Room Type: ${room_preference}. Attendant: ${attendant_name || 'Accompanying family'}. Please present your Admission ID (${admissionId}) at Desk B.`;
  await dispatchWhatsApp({ toPhone: patient.phone, messageText });

  return {
    status: 'ADMISSION_PRE_CLEARED',
    correlation_id: correlationId,
    admission_id: admissionId,
    room_preference,
    message: messageText
  };
}

/**
 * WORKFLOW: Module 16 - Chronic Disease Recall Check
 */
export async function handleChronicRevisitCheck() {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  // Find active chronic care patients due for review
  const duePrograms = db.prepare(`
    SELECT c.*, p.full_name, p.phone
    FROM chronic_programs c
    JOIN patients p ON c.patient_id = p.patient_id
    WHERE c.status = 'ACTIVE' AND c.next_due_date <= date('now')
  `).all();

  const dispatched = [];

  for (const prog of duePrograms) {
    const msgId = generateUniqueId('MSG-CHR');
    const messageText = `Hello ${prog.full_name}, your quarterly ${prog.condition_name} review at DemoCare Hospital is due this week. Routine checks help ensure optimal health management. Reply 1 to book your consultation slot, or call +91 22 5550 1234.`;

    db.prepare(`
      INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
      VALUES (?, ?, 'WhatsApp', 'CHRONIC_REVISIT_01', 'HOSPITAL | Chronic Disease Recall', ?, 'DELIVERED', 'AWAITING_REPLY', ?)
    `).run(msgId, prog.patient_id, timestamp, correlationId);

    db.prepare(`
      UPDATE chronic_programs
      SET status = 'RECALLED'
      WHERE program_id = ?
    `).run(prog.program_id);

    await dispatchWhatsApp({ toPhone: prog.phone, messageText });

    dispatched.push({
      program_id: prog.program_id,
      patient_name: prog.full_name,
      condition: prog.condition_name
    });
  }

  return {
    status: 'CHRONIC_RECALL_EXECUTED',
    correlation_id: correlationId,
    recalled_count: dispatched.length,
    recalled_patients: dispatched
  };
}

/**
 * WORKFLOW: Module 17 - Inactive Patient Reactivation Campaign
 */
export async function handleInactiveReactivation() {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  // Identify patients with no appointment in the last 180 days
  const eligible = db.prepare(`
    SELECT p.* FROM patients p
    WHERE p.patient_id NOT IN (
      SELECT DISTINCT patient_id FROM appointments WHERE slot_start >= datetime('now', '-180 days')
    )
    LIMIT 10
  `).all();

  const contacted = [];
  for (const pat of eligible) {
    const msgId = generateUniqueId('MSG-REACT');
    const messageText = `Namaste ${pat.full_name}, it has been a while since your last health wellness check at DemoCare Hospital. Regular preventative screenings keep you healthy. Book a comprehensive health check this month: https://democare.hospital/checkup or reply 1 to schedule.`;

    db.prepare(`
      INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
      VALUES (?, ?, 'WhatsApp', 'PATIENT_REACTIVATION_01', 'HOSPITAL | Inactive Reactivation', ?, 'DELIVERED', 'AWAITING_REPLY', ?)
    `).run(msgId, pat.patient_id, timestamp, correlationId);

    await dispatchWhatsApp({ toPhone: pat.phone, messageText });
    contacted.push({ patient_id: pat.patient_id, name: pat.full_name });
  }

  return {
    status: 'REACTIVATION_DISPATCHED',
    correlation_id: correlationId,
    contacted_count: contacted.length,
    patients: contacted
  };
}

/**
 * WORKFLOW: Module 18 - Staff Operations & Doctor Availability
 */
export async function handleDoctorAvailability({ doctor_id, is_available }) {
  const doc = db.prepare(`SELECT * FROM doctors WHERE doctor_id = ?`).get(doctor_id);
  if (!doc) throw new Error(`Doctor ${doctor_id} not found`);

  db.prepare(`UPDATE doctors SET is_available = ? WHERE doctor_id = ?`).run(is_available ? 1 : 0, doctor_id);

  // If unavailable, unbook/block upcoming slots
  if (!is_available) {
    db.prepare(`UPDATE available_slots SET is_booked = 1 WHERE doctor_id = ? AND slot_start >= datetime('now')`).run(doctor_id);
  }

  return {
    status: 'AVAILABILITY_UPDATED',
    doctor_id,
    name: doc.name,
    is_available: Boolean(is_available)
  };
}


