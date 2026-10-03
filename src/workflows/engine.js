import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { callClaude } from '../ai/claude.js';

/**
 * Generate Correlation ID adhering to Section F: HOSP-YYYYMMDD-XXXXXX
 */
export function generateCorrelationId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `HOSP-${dateStr}-${randomHex}`;
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
  `).run(`EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`, correlationId);

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
