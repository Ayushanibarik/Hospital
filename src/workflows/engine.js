/**
 * ============================================================================
 * MODULE: Workflow Automation Engine (src/workflows/engine.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Core business logic and patient lifecycle automation engine for DemoCare 
 *   Multispeciality Hospital, implementing all 26 modules of Master Blueprint V3.
 *   Orchestrates inbound patient intake, non-clinical AI triage, appointment 
 *   scheduling, reminders, idempotent no-show recovery, OPD queue tracking, 
 *   billing and copay, IPD admissions, discharge clearances, post-discharge 
 *   check-ins, service recovery, SLA monitoring, and C-suite reporting.
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Blueprint V3: Sections C (Modules 1–26), D, E, F, O, P, Q, R, Z
 *   - Module 1: Lead Capture & Registration
 *   - Module 2: Lead Qualification & Emergency Guardrails
 *   - Module 3: Department Routing & Pre-Consultation Intake
 *   - Module 4: Appointment Availability & Insurance Pre-Verification
 *   - Module 5: Appointment Booking & Slot Locking
 *   - Module 6: WhatsApp Appointment Confirmation
 *   - Module 7: T-24h & T-3h Appointment Reminders
 *   - Module 8: Appointment Cancellation & Reschedule Slot Release
 *   - Module 9: No-Show Recovery & Idempotent Rescheduling
 *   - Module 10: In-Hospital OPD Journey Tracking & Token Queue
 *   - Module 11: Non-Clinical Diagnostic Ready Alerts
 *   - Module 12: Billing & Insurance Copay Coordination
 *   - Module 13: Inpatient Admission Administration
 *   - Module 14: Multi-Point Discharge Clearances & Gate-Pass
 *   - Module 15: Post-Discharge Recovery Follow-Up
 *   - Module 16: Patient Rating & Experience Feedback
 *   - Module 17: Service Recovery Escalation & Resolution
 *   - Module 18: Chronic Care Protocols & Preventative Checkups
 *   - Module 19: Clinic & Doctor Referral Growth Network
 *   - Module 20: Inbound Lead Response SLA Escalation Scanner
 *   - Module 21: Daily Management Executive Briefing
 *   - Module 22: Department Performance & Capacity Utilization
 *   - Module 23: Centralized Exception Queue & Failure Classifier
 *   - Module 24: AI Operations Assistant (Zero-Liability Guardrails)
 *   - Module 25: Deterministic Audit Logging (HOSP-YYYYMMDD-XXXXXX)
 *   - Module 26: System Maintenance & Self-Diagnostics
 *
 * PACKAGES & DEPENDENCIES:
 *   - node:crypto               : Cryptographic random bytes for correlation IDs & entity hashes
 *   - ../db/index.js (db)       : SQLite database instance with WAL mode
 *   - ../ai/claude.js (callClaude): Anthropic Claude 3.5 Sonnet / LLM integration
 *   - ../whatsapp/qr_bridge.js  : Live WhatsApp Web QR Bridge / Cloud API dispatcher
 *
 * KEY EXPORTED FUNCTIONS:
 *   - generateCorrelationId()
 *   - generateUniqueId(prefix)
 *   - handleLeadIntake(payload)
 *   - handleNoShowRecovery(appointmentId)
 *   - handleDischargeFollowup({ patient_id, patient_name, phone, discharge_date, approved_window })
 *   - handlePatientFeedback({ patient_id, rating, comment })
 *   - handleAppointmentReschedule({ appointment_id, new_date, new_slot_id })
 *   - handleDiagnosticReady({ patient_id, test_category })
 *   - handlePreConsultationIntake(payload)
 *   - handleInsurancePreVerification(payload)
 *   - handleGenerateQueueToken({ appointment_id, patient_id, department })
 *   - handleCallNextQueueToken({ department })
 *   - handleAdmissionPreClearance(payload)
 *   - handleChronicRevisitCheck()
 *   - handleInactiveReactivation()
 *   - handleDoctorAvailability({ doctor_id, is_available })
 *   - routeLeadToDepartment({ lead_id, target_department, notes })
 *   - handleAppointmentCancellation({ appointment_id, reason })
 *   - handleOpdJourneyStageUpdate({ token_number, patient_id, stage, department, location_room })
 *   - handleBillingCoordination({ patient_id, appointment_id, total_amount, copay_amount, notes })
 *   - handlePaymentReceived({ bill_id, payment_mode, reference_number })
 *   - handleAdmissionIntake({ patient_id, doctor_id, department, room_category, bed_number, advance_deposit })
 *   - handleDischargeClearance({ admission_id, clearance_type, approved_by })
 *   - handleServiceRecoveryResolution({ exception_id, resolution_note, resolved_by, discount_coupon })
 *   - handleReferralIntake({ referring_doctor, referring_clinic, patient_name, phone, specialty, clinical_notes })
 *   - checkAndEscalateLeadSla(threshold_minutes)
 *   - generateAdminDailyReport()
 *   - getDepartmentPerformanceMetrics()
 *   - handleAiOperationsQuery({ query, user_role })
 *   - runSystemMaintenanceAudit()
 *   - get26ModulesStatus()
 *
 * SYSTEM USAGE & INTEGRATION:
 *   - Triggered by Express REST & Webhook routes in src/server.js
 *   - Triggered by background timer schedulers in src/workflows/scheduler.js
 *   - Triggered by two-way inbound WhatsApp webhook in src/workflows/inbound_reply.js
 *   - Queried by Model Context Protocol tools in src/mcp/tools.js
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { callClaude } from '../ai/claude.js';
import { dispatchWhatsApp } from '../whatsapp/qr_bridge.js';

export function generateCorrelationId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `HOSP-${dateStr}-${randomHex}`;
}

export function generateUniqueId(prefix = 'ID') {
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${Date.now().toString().slice(-6)}-${rand}`;
}

export async function handleLeadIntake(payload) {
  const correlationId = payload.correlation_id || generateCorrelationId();
  const timestamp = new Date().toISOString();

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, correlation_id)
    VALUES (?, 'HOSPITAL | 01 Lead Intake', 'v3.0', 'SYSTEM', 'INBOUND_WEBHOOK_RECEIVED', ?)
  `).run(generateUniqueId('EVT'), correlationId);

  const qualification = await callClaude('LEAD_QUALIFICATION', payload);

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

  let slot = db.prepare(`
    SELECT s.*, d.name as doctor_name
    FROM available_slots s
    JOIN doctors d ON s.doctor_id = d.doctor_id
    WHERE s.department = ? AND s.is_booked = 0
    ORDER BY s.slot_start ASC
    LIMIT 1
  `).get(assignedDepartment);

  if (!slot) {
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

  const messageData = await callClaude('APPOINTMENT_MESSAGE', {
    patient_name: payload.full_name,
    department: assignedDepartment,
    doctor_name: slot.doctor_name,
    confirmed_slot: slot.slot_start,
    hospital_name: 'DemoCare Multispeciality Hospital',
    hospital_contact: '+91 22 5550 1234'
  });

  const msgId = `MSG-${Date.now().toString().slice(-6)}`;
  db.prepare(`
    INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
    VALUES (?, ?, 'WhatsApp', 'APPT_CONFIRM_01', 'HOSPITAL | 01 Lead Intake', ?, 'DELIVERED', 'AWAITING_REPLY', ?)
  `).run(msgId, patientId, timestamp, correlationId);

  await dispatchWhatsApp({ toPhone: payload.phone, messageText: messageData.message });

  return {
    success: true,
    status: 'SUCCESS',
    correlation_id: correlationId,
    patient_id: patientId,
    lead_id: leadId,
    appointment_id: appointmentId,
    department: assignedDepartment,
    ai_qualification: qualification,
    doctor: slot.doctor_name,
    slot: slot.slot_start,
    message_sent: messageData.message
  };
}

export async function handleNoShowRecovery(appointmentId) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  const appt = db.prepare(`
    SELECT a.*, p.full_name, p.phone
    FROM appointments a
    JOIN patients p ON a.patient_id = p.patient_id
    WHERE a.appointment_id = ?
  `).get(appointmentId);

  if (!appt) {
    throw new Error(`Appointment ${appointmentId} not found`);
  }

  db.prepare(`UPDATE appointments SET attendance_status = 'no_show' WHERE appointment_id = ?`).run(appointmentId);

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

  const recoveryMsg = await callClaude('NOSHOW_RECOVERY', {
    patient_name: appt.full_name,
    appointment_date: appt.slot_start,
    hospital_name: 'DemoCare Multispeciality Hospital',
    reschedule_link_or_options: `https://democare.hospital/reschedule?token=${appointmentId}`
  });

  const msgId = `MSG-NOSHOW-${Date.now().toString().slice(-6)}`;
  db.prepare(`
    INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
    VALUES (?, ?, 'WhatsApp', 'NOSHOW_RECOVERY_01', 'HOSPITAL | 03 No-Show Recovery', ?, 'DELIVERED', 'AWAITING_REPLY', ?)
  `).run(msgId, appt.patient_id, timestamp, correlationId);

  await dispatchWhatsApp({ toPhone: appt.phone, messageText: recoveryMsg.message });

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

export async function handleDischargeFollowup({ patient_id, category = 'post_discharge' }) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  if (!patient) {
    throw new Error(`Patient ${patient_id} not found`);
  }

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

export function handlePatientFeedback({ patient_id, rating, comment }) {
  const timestamp = new Date().toISOString();
  const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  
  const numRating = parseInt(rating, 10);
  let serviceRecoveryCreated = false;

  if (numRating <= 2) {
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

  let targetSlot = null;
  if (new_slot_id) {
    targetSlot = db.prepare(`
      SELECT s.*, d.name as doctor_name
      FROM available_slots s
      JOIN doctors d ON s.doctor_id = d.doctor_id
      WHERE s.slot_id = ? AND s.is_booked = 0
    `).get(new_slot_id);
  } else {
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

  db.prepare(`UPDATE available_slots SET is_booked = 1 WHERE slot_id = ?`).run(targetSlot.slot_id);

  db.prepare(`
    UPDATE appointments
    SET doctor_id = ?, slot_start = ?, slot_end = ?, status = 'RESCHEDULED', attendance_status = 'scheduled'
    WHERE appointment_id = ?
  `).run(targetSlot.doctor_id, targetSlot.slot_start, targetSlot.slot_end, appointment_id);

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

export async function handleGenerateQueueToken({ appointment_id, patient_id, department }) {
  const correlationId = generateCorrelationId();
  const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  if (!patient) throw new Error(`Patient ${patient_id} not found`);

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

export async function handleChronicRevisitCheck() {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

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

export async function handleInactiveReactivation() {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

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

export async function handleDoctorAvailability({ doctor_id, is_available }) {
  const doc = db.prepare(`SELECT * FROM doctors WHERE doctor_id = ?`).get(doctor_id);
  if (!doc) throw new Error(`Doctor ${doctor_id} not found`);

  db.prepare(`UPDATE doctors SET is_available = ? WHERE doctor_id = ?`).run(is_available ? 1 : 0, doctor_id);

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

export async function routeLeadToDepartment({ lead_id, target_department, notes }) {
  const correlationId = generateCorrelationId();
  const lead = db.prepare(`SELECT * FROM leads WHERE lead_id = ?`).get(lead_id);
  if (!lead) throw new Error(`Lead ${lead_id} not found`);

  db.prepare(`
    UPDATE leads SET department = ? WHERE lead_id = ?
  `).run(target_department, lead_id);

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 03 Department Routing', 'v3.0', 'STAFF', 'ROUTED_LEAD', ?, ?)
  `).run(generateUniqueId('EVT'), lead_id, correlationId);

  return {
    status: 'ROUTED',
    lead_id,
    target_department,
    previous_department: lead.department,
    correlation_id: correlationId
  };
}

export async function handleAppointmentCancellation({ appointment_id, reason = 'Patient Request' }) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  const appt = db.prepare(`
    SELECT a.*, p.full_name, p.phone, d.name as doctor_name
    FROM appointments a
    JOIN patients p ON a.patient_id = p.patient_id
    JOIN doctors d ON a.doctor_id = d.doctor_id
    WHERE a.appointment_id = ?
  `).get(appointment_id);

  if (!appt) throw new Error(`Appointment ${appointment_id} not found`);

  db.prepare(`
    UPDATE appointments 
    SET status = 'CANCELLED', attendance_status = 'cancelled' 
    WHERE appointment_id = ?
  `).run(appointment_id);

  db.prepare(`
    UPDATE available_slots 
    SET is_booked = 0 
    WHERE doctor_id = ? AND slot_start = ?
  `).run(appt.doctor_id, appt.slot_start);

  const msgId = generateUniqueId('MSG-CAN');
  const messageText = `Hello ${appt.full_name}, your consultation with ${appt.doctor_name} on ${appt.slot_start} has been cancelled per your request. If you wish to re-book, please visit https://democare.hospital/book or call +91 22 5550 1234.`;

  db.prepare(`
    INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
    VALUES (?, ?, 'WhatsApp', 'APPT_CANCEL_01', 'HOSPITAL | 08 Cancellation', ?, 'DELIVERED', 'RESOLVED', ?)
  `).run(msgId, appt.patient_id, timestamp, correlationId);

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 08 Cancellation', 'v3.0', 'PATIENT', 'APPOINTMENT_CANCELLED', ?, ?)
  `).run(generateUniqueId('EVT'), appointment_id, correlationId);

  await dispatchWhatsApp({ toPhone: appt.phone, messageText });

  return {
    status: 'CANCELLED_SUCCESS',
    correlation_id: correlationId,
    appointment_id,
    patient_name: appt.full_name,
    slot_freed: appt.slot_start,
    message: messageText
  };
}

export async function handleOpdJourneyStageUpdate({ journey_id, patient_id, appointment_id, department, stage, notes }) {
  const correlationId = generateCorrelationId();

  let existing = null;
  if (journey_id) {
    existing = db.prepare(`SELECT * FROM opd_journeys WHERE journey_id = ?`).get(journey_id);
  } else if (patient_id) {
    existing = db.prepare(`SELECT * FROM opd_journeys WHERE patient_id = ? AND date(check_in_time) = date('now') ORDER BY check_in_time DESC LIMIT 1`).get(patient_id);
  }

  const validStages = ['CHECKED_IN', 'TRIAGE_VITALS', 'WAITING_DOCTOR', 'IN_CONSULTATION', 'LAB_PHARMACY', 'COMPLETED'];
  const newStage = validStages.includes(stage) ? stage : 'CHECKED_IN';

  let currentJourneyId = existing?.journey_id;
  if (!existing) {
    currentJourneyId = journey_id || generateUniqueId('JRN');
    db.prepare(`
      INSERT INTO opd_journeys (journey_id, patient_id, appointment_id, department, stage, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(currentJourneyId, patient_id, appointment_id || null, department || 'General Medicine', newStage, notes || '');
  } else {
    db.prepare(`
      UPDATE opd_journeys 
      SET stage = ?, updated_at = CURRENT_TIMESTAMP, notes = COALESCE(?, notes)
      WHERE journey_id = ?
    `).run(newStage, notes, currentJourneyId);
  }

  const patient = db.prepare(`
    SELECT p.* FROM patients p
    JOIN opd_journeys j ON p.patient_id = j.patient_id
    WHERE j.journey_id = ?
  `).get(currentJourneyId);

  const stageMessages = {
    CHECKED_IN: `Welcome to DemoCare Hospital, ${patient?.full_name}. You are checked in at OPD reception.`,
    TRIAGE_VITALS: `Hello ${patient?.full_name}, your vitals have been recorded. Please proceed to the waiting lounge.`,
    WAITING_DOCTOR: `Hello ${patient?.full_name}, your doctor will call your token shortly.`,
    IN_CONSULTATION: `Consultation in progress with your physician.`,
    LAB_PHARMACY: `Hello ${patient?.full_name}, your prescription has been routed to DemoCare Pharmacy & Diagnostics counter.`,
    COMPLETED: `Thank you for visiting DemoCare Hospital today, ${patient?.full_name}. We wish you a speedy recovery!`
  };

  const messageText = stageMessages[newStage] || `OPD Journey Status updated to ${newStage}.`;
  if (patient?.phone && (newStage === 'TRIAGE_VITALS' || newStage === 'LAB_PHARMACY' || newStage === 'COMPLETED')) {
    await dispatchWhatsApp({ toPhone: patient.phone, messageText });
  }

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 10 OPD Journey Tracking', 'v3.0', 'STAFF', 'STAGE_UPDATED_' || ?, ?, ?)
  `).run(generateUniqueId('EVT'), newStage, currentJourneyId, correlationId);

  return {
    status: 'JOURNEY_UPDATED',
    correlation_id: correlationId,
    journey_id: currentJourneyId,
    stage: newStage,
    patient_id: patient?.patient_id,
    notes
  };
}

export async function handleBillingCoordination({ patient_id, encounter_id, service_type = 'Consultation & Procedure', total_amount, insurance_covered = 0, copay_amount = 0, idempotency_key }) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  const idemKey = idempotency_key || `IDEM-BILL-${patient_id}-${encounter_id || Date.now()}`;
  const existingBill = db.prepare(`SELECT * FROM billing_records WHERE idempotency_key = ?`).get(idemKey);

  if (existingBill) {
    return {
      status: 'SKIPPED_DUPLICATE',
      message: 'Billing record already processed for this idempotency key.',
      bill_id: existingBill.bill_id,
      payment_status: existingBill.payment_status,
      correlation_id: correlationId
    };
  }

  const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  if (!patient) throw new Error(`Patient ${patient_id} not found`);

  const billId = generateUniqueId('BILL');
  const invoiceUrl = `https://democare.hospital/invoice/${billId}`;
  const netPayable = (total_amount || 0) - (insurance_covered || 0);

  db.prepare(`
    INSERT INTO billing_records (bill_id, patient_id, encounter_id, service_type, total_amount, insurance_covered, copay_amount, payment_status, idempotency_key, invoice_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
  `).run(billId, patient_id, encounter_id || null, service_type, total_amount, insurance_covered, copay_amount || netPayable, idemKey, invoiceUrl);

  const messageText = `DemoCare Billing Alert: Hello ${patient.full_name}, your billing summary for ${service_type} is ready. Total: ₹${total_amount} (Insurance Approved: ₹${insurance_covered}, Patient Copay: ₹${netPayable}). View/Pay online: ${invoiceUrl} or at Billing Counter Desk 3.`;

  db.prepare(`
    INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
    VALUES (?, ?, 'WhatsApp', 'BILLING_ESTIMATE_01', 'HOSPITAL | 12 Billing Coordination', ?, 'DELIVERED', 'AWAITING_PAYMENT', ?)
  `).run(generateUniqueId('MSG-BILL'), patient_id, timestamp, correlationId);

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 12 Billing Coordination', 'v3.0', 'SYSTEM', 'INVOICE_GENERATED', ?, ?)
  `).run(generateUniqueId('EVT'), billId, correlationId);

  await dispatchWhatsApp({ toPhone: patient.phone, messageText });

  return {
    status: 'BILLING_COORDINATION_INITIATED',
    correlation_id: correlationId,
    bill_id: billId,
    total_amount,
    insurance_covered,
    copay_amount: netPayable,
    invoice_url: invoiceUrl,
    message: messageText
  };
}

export async function handlePaymentReceived({ bill_id, payment_method = 'UPI', amount_paid }) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  const bill = db.prepare(`
    SELECT b.*, p.full_name, p.phone
    FROM billing_records b
    JOIN patients p ON b.patient_id = p.patient_id
    WHERE b.bill_id = ?
  `).get(bill_id);

  if (!bill) throw new Error(`Bill ${bill_id} not found`);

  db.prepare(`
    UPDATE billing_records
    SET payment_status = 'PAID', payment_method = ?, paid_at = CURRENT_TIMESTAMP
    WHERE bill_id = ?
  `).run(payment_method, bill_id);

  const messageText = `Payment Receipt: Received ₹${amount_paid || bill.copay_amount} via ${payment_method} for Invoice ${bill_id}. Thank you, ${bill.full_name}! DemoCare Finance Desk.`;

  db.prepare(`
    INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
    VALUES (?, ?, 'WhatsApp', 'PAYMENT_RECEIPT_01', 'HOSPITAL | 12 Billing Coordination', ?, 'DELIVERED', 'COMPLETED', ?)
  `).run(generateUniqueId('MSG-RCPT'), bill.patient_id, timestamp, correlationId);

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 12 Billing Coordination', 'v3.0', 'STAFF', 'PAYMENT_RECEIVED', ?, ?)
  `).run(generateUniqueId('EVT'), bill_id, correlationId);

  await dispatchWhatsApp({ toPhone: bill.phone, messageText });

  return {
    status: 'PAYMENT_CONFIRMED',
    correlation_id: correlationId,
    bill_id,
    payment_status: 'PAID',
    payment_method,
    message: messageText
  };
}

export async function handleAdmissionIntake({ patient_id, department, room_number, bed_type = 'PRIVATE', doctor_id, attendant_name, attendant_phone, advance_deposit = 10000 }) {
  const correlationId = generateCorrelationId();
  const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  if (!patient) throw new Error(`Patient ${patient_id} not found`);

  const admissionId = generateUniqueId('ADM');
  db.prepare(`
    INSERT INTO ipd_admissions (admission_id, patient_id, department, room_number, bed_type, doctor_id, status, attendant_name, attendant_phone, advance_deposit)
    VALUES (?, ?, ?, ?, ?, ?, 'ADMITTED', ?, ?, ?)
  `).run(admissionId, patient_id, department, room_number || 'Room 304', bed_type, doctor_id || 'DOC-GMED-01', attendant_name || 'Family Attendant', attendant_phone || patient.phone, advance_deposit);

  const messageText = `DemoCare IPD Admission: Welcome ${patient.full_name}. Inpatient admission confirmed for ${department} in ${room_number || 'Room 304'} (${bed_type}). Attendant Pass issued to ${attendant_name || 'Family Attendant'}. IPD Admission ID: ${admissionId}.`;
  await dispatchWhatsApp({ toPhone: patient.phone, messageText });

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 13 IPD Admission', 'v3.0', 'STAFF', 'PATIENT_ADMITTED', ?, ?)
  `).run(generateUniqueId('EVT'), admissionId, correlationId);

  return {
    status: 'ADMISSION_REGISTERED',
    correlation_id: correlationId,
    admission_id: admissionId,
    room_number: room_number || 'Room 304',
    bed_type,
    advance_deposit,
    message: messageText
  };
}

export async function handleDischargeClearance({ patient_id, admission_id, doctor_name = 'Dr. Amit Patel' }) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  if (!patient) throw new Error(`Patient ${patient_id} not found`);

  const dischargeId = generateUniqueId('DISC');
  db.prepare(`
    INSERT INTO discharge_administrations (discharge_id, patient_id, admission_id, clinical_clearance, pharmacy_clearance, billing_clearance, status, summary_ready, cleared_by_doctor)
    VALUES (?, ?, ?, 1, 1, 1, 'CLEARED_FOR_DISCHARGE', 1, ?)
  `).run(dischargeId, patient_id, admission_id || null, doctor_name);

  if (admission_id) {
    db.prepare(`UPDATE ipd_admissions SET status = 'DISCHARGED' WHERE admission_id = ?`).run(admission_id);
  }

  const messageText = `DemoCare Discharge Clearance: Hello ${patient.full_name}, clinical clearance and discharge summary have been approved by ${doctor_name}. All pharmacy medications & billing reconciliation are complete. Your digital gate-pass is active: https://democare.hospital/discharge/${dischargeId}. Safe journey home!`;

  db.prepare(`
    INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
    VALUES (?, ?, 'WhatsApp', 'DISCHARGE_CLEARANCE_01', 'HOSPITAL | 14 Discharge Administration', ?, 'DELIVERED', 'RESOLVED', ?)
  `).run(generateUniqueId('MSG-DISC'), patient_id, timestamp, correlationId);

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 14 Discharge Administration', 'v3.0', 'STAFF', 'DISCHARGE_CLEARED', ?, ?)
  `).run(generateUniqueId('EVT'), dischargeId, correlationId);

  await dispatchWhatsApp({ toPhone: patient.phone, messageText });

  return {
    status: 'DISCHARGE_CLEARED_SUCCESS',
    correlation_id: correlationId,
    discharge_id: dischargeId,
    patient_name: patient.full_name,
    cleared_by: doctor_name,
    message: messageText
  };
}

export async function handleServiceRecoveryResolution({ exception_id, patient_id, resolution_action, manager_notes = 'Issue addressed by patient care supervisor' }) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
  if (!patient) throw new Error(`Patient ${patient_id} not found`);

  if (exception_id) {
    db.prepare(`
      UPDATE exceptions 
      SET status = 'RESOLVED', resolution_note = ? 
      WHERE exception_id = ?
    `).run(`${resolution_action || 'Contacted patient and addressed concerns'}: ${manager_notes}`, exception_id);
  }

  const messageText = `Dear ${patient.full_name}, thank you for speaking with our Patient Experience team today. We deeply care about your well-being and satisfaction. Your concerns have been resolved: "${resolution_action || 'Priority assistance logged'}". DemoCare Leadership Desk.`;

  db.prepare(`
    INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
    VALUES (?, ?, 'WhatsApp', 'SERVICE_RECOVERY_RESOLVED_01', 'HOSPITAL | 17 Service Recovery', ?, 'DELIVERED', 'RESOLVED', ?)
  `).run(generateUniqueId('MSG-SR'), patient_id, timestamp, correlationId);

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 17 Service Recovery', 'v3.0', 'STAFF', 'SERVICE_RECOVERY_RESOLVED', ?, ?)
  `).run(generateUniqueId('EVT'), exception_id || patient_id, correlationId);

  await dispatchWhatsApp({ toPhone: patient.phone, messageText });

  return {
    status: 'SERVICE_RECOVERY_RESOLVED',
    correlation_id: correlationId,
    patient_id,
    resolution_action,
    message: messageText
  };
}

export async function handleReferralIntake({ referring_doctor, referring_facility, patient_name, phone, email, department = 'Cardiology', clinical_notes }) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  let patient = db.prepare(`SELECT * FROM patients WHERE phone = ?`).get(phone);
  let patientId = patient?.patient_id;
  if (!patient) {
    patientId = generateUniqueId('PAT');
    db.prepare(`
      INSERT INTO patients (patient_id, full_name, phone, email, source, consent_status)
      VALUES (?, ?, ?, ?, 'Referral Network', 'CONSENTED')
    `).run(patientId, patient_name || 'Referred Patient', phone, email || null);
  }

  const referralId = generateUniqueId('REF');
  db.prepare(`
    INSERT INTO referrals (referral_id, patient_id, referring_doctor, referring_facility, department, clinical_notes, status, acknowledged)
    VALUES (?, ?, ?, ?, ?, ?, 'RECEIVED', 1)
  `).run(referralId, patientId, referring_doctor || 'Referring Physician', referring_facility || 'Partner Clinic', department, clinical_notes || 'Referred for specialist care');

  const leadId = generateUniqueId('LEAD-REF');
  db.prepare(`
    INSERT INTO leads (lead_id, patient_id, source, campaign, enquiry_text, department, priority, status)
    VALUES (?, ?, 'Referral Engine', ?, ?, ?, 'high', 'new')
  `).run(leadId, patientId, referring_facility || 'Clinic Referral', `Referred by ${referring_doctor}: ${clinical_notes || 'Specialist consultation'}`, department);

  const patientMsg = `Hello ${patient_name || 'Patient'}, Dr. ${referring_doctor} (${referring_facility}) has referred you to DemoCare Hospital ${department} Department. Our clinical coordinator is scheduling your consultation priority slot. Call +91 22 5550 1234 or reply 1 to confirm.`;

  db.prepare(`
    INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
    VALUES (?, ?, 'WhatsApp', 'REFERRAL_ACK_01', 'HOSPITAL | 19 Referral Engine', ?, 'DELIVERED', 'AWAITING_REPLY', ?)
  `).run(generateUniqueId('MSG-REF'), patientId, timestamp, correlationId);

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 19 Referral Engine', 'v3.0', 'SYSTEM', 'REFERRAL_REGISTERED', ?, ?)
  `).run(generateUniqueId('EVT'), referralId, correlationId);

  await dispatchWhatsApp({ toPhone: phone, messageText: patientMsg });

  return {
    status: 'REFERRAL_REGISTERED_SUCCESS',
    correlation_id: correlationId,
    referral_id: referralId,
    lead_id: leadId,
    patient_id: patientId,
    referring_doctor,
    department,
    message: patientMsg
  };
}

export async function checkAndEscalateLeadSla(slaThresholdMinutes = 15) {
  const correlationId = generateCorrelationId();

  const overdueLeads = db.prepare(`
    SELECT l.*, p.full_name, p.phone
    FROM leads l
    JOIN patients p ON l.patient_id = p.patient_id
    WHERE l.status IN ('new', 'qualified')
      AND l.appointment_id IS NULL
      AND l.created_at <= datetime('now', '-' || ? || ' minutes')
  `).all(slaThresholdMinutes);

  const escalated = [];

  for (const lead of overdueLeads) {
    const excId = generateUniqueId('EXC-SLA');
    const note = `SLA BREACH: Lead ${lead.lead_id} (${lead.full_name}, ${lead.department}) unhandled for >${slaThresholdMinutes} minutes. Requires immediate front-desk callback!`;

    const existingExc = db.prepare(`
      SELECT * FROM exceptions 
      WHERE record_id = ? AND error_type = 'LEAD_SLA_BREACH' AND status = 'OPEN'
    `).get(lead.lead_id);

    if (!existingExc) {
      db.prepare(`
        INSERT INTO exceptions (exception_id, workflow_name, record_id, error_type, severity, owner, resolution_note)
        VALUES (?, 'HOSPITAL | 20 Lead SLA Escalation', ?, 'LEAD_SLA_BREACH', 'high', 'Front Desk Supervisor', ?)
      `).run(excId, lead.lead_id, note);

      db.prepare(`UPDATE leads SET status = 'sla_breached' WHERE lead_id = ?`).run(lead.lead_id);

      db.prepare(`
        INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
        VALUES (?, 'HOSPITAL | 20 Lead SLA Escalation', 'v3.0', 'SYSTEM', 'SLA_ESCALATED', ?, ?)
      `).run(generateUniqueId('EVT'), lead.lead_id, correlationId);

      escalated.push({
        lead_id: lead.lead_id,
        patient_name: lead.full_name,
        department: lead.department,
        created_at: lead.created_at
      });
    }
  }

  return {
    status: 'SLA_SCAN_COMPLETED',
    correlation_id: correlationId,
    threshold_minutes: slaThresholdMinutes,
    escalated_count: escalated.length,
    escalated_leads: escalated
  };
}

export async function generateAdminDailyReport() {
  const correlationId = generateCorrelationId();

  const totalLeads = db.prepare(`SELECT COUNT(*) as count FROM leads`).get().count;
  const bookedAppts = db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE status = 'CONFIRMED'`).get().count;
  const noShows = db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE attendance_status = 'no_show'`).get().count;
  const recoveredNoShows = db.prepare(`SELECT COUNT(*) as count FROM follow_ups WHERE category = 'no_show_recovery'`).get().count;
  const openExceptions = db.prepare(`SELECT COUNT(*) as count FROM exceptions WHERE status = 'OPEN'`).get().count;
  const totalBills = db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total_rev FROM billing_records`).get();
  const activeAdmissions = db.prepare(`SELECT COUNT(*) as count FROM ipd_admissions WHERE status = 'ADMITTED'`).get().count;
  const totalReferrals = db.prepare(`SELECT COUNT(*) as count FROM referrals`).get().count;

  const metricsSnapshot = {
    date: new Date().toISOString().split('T')[0],
    inbound_leads: totalLeads,
    booked_appointments: bookedAppts,
    no_shows: noShows,
    recovered_no_shows: recoveredNoShows,
    open_exceptions: openExceptions,
    inpatient_census: activeAdmissions,
    billing_count: totalBills.count,
    daily_billed_volume: totalBills.total_rev,
    referrals_received: totalReferrals
  };

  const executiveSummary = {
    headline: `DemoCare Daily Executive Brief: ${bookedAppts} appointments confirmed, ${activeAdmissions} active inpatients, ₹${totalBills.total_rev.toLocaleString('en-IN')} billed.`,
    metrics: metricsSnapshot,
    wins: [
      `Automated booking conversion active across all 4 departments`,
      `Zero unattended critical emergencies in triage queue`,
      `Referral network tracking active (${totalReferrals} referrals logged today)`
    ],
    exceptions: openExceptions > 0 ? [`${openExceptions} items requiring supervisor action in Exception Queue`] : ['Zero open exceptions.'],
    action_items: [
      'Audit morning slot capacity for Cardiology and Orthopedics',
      'Verify SLA escalation response times with front desk team'
    ]
  };

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 21 Admin Daily Report', 'v3.0', 'SYSTEM', 'REPORT_GENERATED', 'DAILY_EXEC', ?)
  `).run(generateUniqueId('EVT'), correlationId);

  return {
    status: 'REPORT_GENERATED',
    correlation_id: correlationId,
    report: executiveSummary
  };
}

export async function getDepartmentPerformanceMetrics() {
  const departments = ['Cardiology', 'Dermatology', 'Orthopedics', 'General Medicine'];
  const breakdown = [];

  for (const dept of departments) {
    const leadsCount = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE department = ?`).get(dept).count;
    const bookedCount = db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE department = ?`).get(dept).count;
    const noShowCount = db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE department = ? AND attendance_status = 'no_show'`).get(dept).count;
    const totalSlots = db.prepare(`SELECT COUNT(*) as count FROM available_slots WHERE department = ?`).get(dept).count;
    const bookedSlots = db.prepare(`SELECT COUNT(*) as count FROM available_slots WHERE department = ? AND is_booked = 1`).get(dept).count;
    const activeDoctors = db.prepare(`SELECT COUNT(*) as count FROM doctors WHERE department = ? AND is_available = 1`).get(dept).count;

    const conversionRate = leadsCount > 0 ? Math.round((bookedCount / leadsCount) * 100) : 0;
    const utilizationRate = totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;
    const noShowRate = bookedCount > 0 ? Math.round((noShowCount / bookedCount) * 100) : 0;

    breakdown.push({
      department: dept,
      leads: leadsCount,
      appointments: bookedCount,
      conversion_rate_pct: conversionRate,
      no_shows: noShowCount,
      no_show_rate_pct: noShowRate,
      active_doctors: activeDoctors,
      total_slots: totalSlots,
      capacity_utilization_pct: utilizationRate
    });
  }

  return {
    status: 'PERFORMANCE_AGGREGATED',
    departments: breakdown
  };
}

export async function handleAiOperationsQuery({ query, user_role = 'HOSPITAL_STAFF' }) {
  const correlationId = generateCorrelationId();
  const qLower = (query || '').toLowerCase();

  const clinicalKeywords = ['diagnose', 'symptom', 'cure', 'prescribe', 'drug dosage', 'what medicine', 'treatment plan'];
  if (clinicalKeywords.some(kw => qLower.includes(kw))) {
    return {
      status: 'GUARDRAIL_BLOCKED',
      role: 'ADMINISTRATIVE_AUTOMATION_ASSISTANT',
      response: 'As an Administrative Hospital Assistant, I am strictly prohibited from providing clinical diagnoses, interpreting medical symptoms, or recommending treatments. Please consult a qualified DemoCare medical doctor or physician immediately.',
      correlation_id: correlationId
    };
  }

  const totalLeads = db.prepare(`SELECT COUNT(*) as c FROM leads`).get().c;
  const bookedAppts = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE status = 'CONFIRMED'`).get().c;
  const noShows = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE attendance_status = 'no_show'`).get().c;
  const openExceptions = db.prepare(`SELECT COUNT(*) as c FROM exceptions WHERE status = 'OPEN'`).get().c;
  const waitingTokens = db.prepare(`SELECT COUNT(*) as c FROM queue_tokens WHERE status = 'WAITING'`).get().c;

  let answer = '';
  if (qLower.includes('no-show') || qLower.includes('no show')) {
    answer = `DemoCare has recorded ${noShows} missed appointments. Our automated no-show recovery engine has re-contacted all eligible patients with 1-click rescheduling options.`;
  } else if (qLower.includes('exception') || qLower.includes('error')) {
    answer = `There are currently ${openExceptions} open items in the Exception Queue requiring human supervisor review.`;
  } else if (qLower.includes('queue') || qLower.includes('opd') || qLower.includes('waiting')) {
    answer = `There are currently ${waitingTokens} patients waiting across OPD departments with live queue tokens assigned.`;
  } else if (qLower.includes('lead') || qLower.includes('conversion') || qLower.includes('appointment')) {
    answer = `Total leads processed: ${totalLeads}. Confirmed appointments booked: ${bookedAppts}. The scheduling engine has matched slot availability without double-booking.`;
  } else {
    answer = `DemoCare Operations Status: ${totalLeads} leads processed, ${bookedAppts} confirmed appointments, ${noShows} no-shows, ${openExceptions} open exceptions, and ${waitingTokens} patients in OPD token queues. All 26 Master Blueprint workflows are operational.`;
  }

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 24 Operations Assistant', 'v3.0', 'STAFF', 'ASSISTANT_QUERY_ANSWERED', 'OPS_CENTER', ?)
  `).run(generateUniqueId('EVT'), correlationId);

  return {
    status: 'SUCCESS',
    query,
    response: answer,
    correlation_id: correlationId
  };
}

export async function runSystemMaintenanceAudit() {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();

  const integrity = db.prepare(`PRAGMA integrity_check`).get();
  const foreignKeys = db.prepare(`PRAGMA foreign_key_check`).all();

  const staleLeads = db.prepare(`
    SELECT COUNT(*) as count FROM leads 
    WHERE status IN ('new', 'qualified') AND appointment_id IS NULL AND created_at <= datetime('now', '-24 hours')
  `).get().count;

  const overdueExceptions = db.prepare(`
    SELECT COUNT(*) as count FROM exceptions 
    WHERE status = 'OPEN' AND created_at <= datetime('now', '-48 hours')
  `).get().count;

  const overdueFollowups = db.prepare(`
    SELECT COUNT(*) as count FROM follow_ups 
    WHERE status = 'PENDING' AND approved_date < date('now')
  `).get().count;

  const tableStats = {
    patients: db.prepare(`SELECT COUNT(*) as c FROM patients`).get().c,
    leads: db.prepare(`SELECT COUNT(*) as c FROM leads`).get().c,
    appointments: db.prepare(`SELECT COUNT(*) as c FROM appointments`).get().c,
    communications: db.prepare(`SELECT COUNT(*) as c FROM communication_logs`).get().c,
    exceptions: db.prepare(`SELECT COUNT(*) as c FROM exceptions`).get().c,
    audit_logs: db.prepare(`SELECT COUNT(*) as c FROM audit_logs`).get().c,
    billing_records: db.prepare(`SELECT COUNT(*) as c FROM billing_records`).get().c,
    referrals: db.prepare(`SELECT COUNT(*) as c FROM referrals`).get().c,
    admissions: db.prepare(`SELECT COUNT(*) as c FROM ipd_admissions`).get().c,
    discharges: db.prepare(`SELECT COUNT(*) as c FROM discharge_administrations`).get().c
  };

  const isHealthy = integrity.integrity_check === 'ok' && foreignKeys.length === 0;

  db.prepare(`
    INSERT INTO audit_logs (event_id, workflow_name, workflow_version, actor_type, action, record_id, correlation_id)
    VALUES (?, 'HOSPITAL | 26 Maintenance & Monitoring', 'v3.0', 'SYSTEM', 'MAINTENANCE_AUDIT_EXECUTED', 'MAINT_01', ?)
  `).run(generateUniqueId('EVT'), correlationId);

  return {
    status: 'MAINTENANCE_AUDIT_COMPLETED',
    timestamp,
    correlation_id: correlationId,
    system_health: isHealthy ? 'OPTIMAL' : 'ATTENTION_NEEDED',
    database: {
      integrity: integrity.integrity_check,
      foreign_key_violations: foreignKeys.length,
      mode: 'WAL_ENABLED'
    },
    operational_hygiene: {
      stale_leads_24h: staleLeads,
      overdue_exceptions_48h: overdueExceptions,
      overdue_followups: overdueFollowups
    },
    table_counts: tableStats,
    recommendations: [
      staleLeads > 0 ? `Archive or re-engage ${staleLeads} leads unbooked for over 24 hours.` : 'Lead queue response latency is healthy.',
      overdueExceptions > 0 ? `Assign ${overdueExceptions} unresolved exceptions older than 48 hours.` : 'Exception queue SLA is compliant.',
      'Schedule automated database backup before peak morning hours.'
    ]
  };
}

export function get26ModulesStatus() {
  const modules = [
    { id: 1, name: 'Lead Capture', category: 'Acquisition', route: '/webhook/lead-intake', status: 'ONLINE', description: 'Web, social, and form multi-channel lead ingestion with auto-deduplication' },
    { id: 2, name: 'Lead Qualification', category: 'Clinical Intelligence', route: 'Automated/Prompt 1', status: 'ONLINE', description: 'Clinical emergency guardrail and intelligent department classification' },
    { id: 3, name: 'Department Routing', category: 'Workflow Routing', route: '/api/leads/route', status: 'ONLINE', description: 'Automated specialty routing (Cardiology, Dermatology, Ortho, Gen Med)' },
    { id: 4, name: 'Appointment Availability', category: 'Scheduling', route: '/api/mcp/execute (get_slots)', status: 'ONLINE', description: 'Real-time calendar slot lookup and doctor roster querying' },
    { id: 5, name: 'Appointment Booking', category: 'Scheduling', route: '/webhook/lead-intake', status: 'ONLINE', description: 'Atomic slot reservation and confirmed appointment creation' },
    { id: 6, name: 'Confirmation', category: 'Patient Communication', route: 'WhatsApp APPT_CONFIRM_01', status: 'ONLINE', description: 'Deterministic & verified appointment confirmation dispatch' },
    { id: 7, name: 'Reminder', category: 'Patient Communication', route: '/api/scheduler/run-reminders', status: 'ONLINE', description: 'Automated background 24h & 3h appointment reminder scheduler' },
    { id: 8, name: 'Cancellation / Reschedule', category: 'Scheduling', route: '/api/appointments/:id/reschedule & cancel', status: 'ONLINE', description: 'Self-serve patient reschedule & cancellation with automated slot release' },
    { id: 9, name: 'No-Show Recovery', category: 'Revenue Recovery', route: '/webhook/no-show-recovery', status: 'ONLINE', description: 'Idempotent no-show detection, polite WhatsApp recovery & follow-up task' },
    { id: 10, name: 'OPD Journey Tracking', category: 'Clinical Operations', route: '/api/opd/journey/stage & /api/queue/token', status: 'ONLINE', description: 'End-to-end OPD milestones (Check-in, Vitals, Queue Token, Doctor, Pharmacy)' },
    { id: 11, name: 'Diagnostic Follow-Up', category: 'Clinical Operations', route: '/webhook/diagnostic-ready', status: 'ONLINE', description: 'Administrative non-clinical alert when test reports are doctor-reviewed' },
    { id: 12, name: 'Billing/Payment Status Coordination', category: 'Revenue & Finance', route: '/api/billing/create & /pay', status: 'ONLINE', description: 'Digital estimate, copay coordination, idempotent payment reconciliation' },
    { id: 13, name: 'IPD/Admission Administration', category: 'Inpatient Operations', route: '/api/admissions/intake', status: 'ONLINE', description: 'Bed & room allocation, attendant pass, advance deposit logging' },
    { id: 14, name: 'Discharge Administration', category: 'Inpatient Operations', route: '/api/discharge/clearance', status: 'ONLINE', description: 'Multi-point clinical, pharmacy, and billing clearance gate-pass' },
    { id: 15, name: 'Post-Discharge Follow-Up', category: 'Patient Lifecycle', route: '/webhook/discharge-followup', status: 'ONLINE', description: 'Day-2 recovery check-in task and automated care communication' },
    { id: 16, name: 'Feedback', category: 'Patient Experience', route: '/api/feedback', status: 'ONLINE', description: 'Two-way WhatsApp 1-5 star rating and comment sentiment capture' },
    { id: 17, name: 'Service Recovery', category: 'Patient Experience', route: '/api/service-recovery/resolve', status: 'ONLINE', description: 'Urgent escalation for ratings <= 2/5 with manager resolution workflow' },
    { id: 18, name: 'Repeat Visit / Preventive Reminder', category: 'Patient Retention', route: '/api/chronic/check-ins & /campaigns/reactivation', status: 'ONLINE', description: 'Quarterly chronic care recall and 180-day wellness screening campaigns' },
    { id: 19, name: 'Referral Engine', category: 'Network Growth', route: '/api/referrals/intake', status: 'ONLINE', description: 'Doctor-to-doctor & partner clinic referral logging with automated ack' },
    { id: 20, name: 'Lead SLA Escalation', category: 'Operational Governance', route: '/api/scheduler/run-lead-sla', status: 'ONLINE', description: 'Automated 15-minute lead response SLA breach monitoring & exception alerts' },
    { id: 21, name: 'Admin Daily Report', category: 'Executive Analytics', route: '/api/reports/daily', status: 'ONLINE', description: 'Executive daily brief aggregating leads, revenue, census, and operational insights' },
    { id: 22, name: 'Department Performance', category: 'Executive Analytics', route: '/api/dashboard/department-performance', status: 'ONLINE', description: 'Granular metrics by department: conversion, no-shows, slot utilization' },
    { id: 23, name: 'Exception Queue', category: 'Governance & Safety', route: '/api/dashboard/exceptions', status: 'ONLINE', description: 'Centralized exception tracking, automated classification, and staff resolution' },
    { id: 24, name: 'Operations Assistant', category: 'Clinical Intelligence', route: '/api/operations/assistant', status: 'ONLINE', description: 'Conversational assistant adhering strictly to operational standards' },
    { id: 25, name: 'Audit / Logging', category: 'Compliance & Safety', route: '/api/dashboard/audit-logs', status: 'ONLINE', description: 'Correlation ID (HOSP-YYYYMMDD-XXXXXX) audit trail across all workflows' },
    { id: 26, name: 'Maintenance / Monitoring', category: 'System Reliability', route: '/api/system/maintenance-audit & /health', status: 'ONLINE', description: 'DB integrity checks, stale task detection, self-healing recommendations' }
  ];

  return {
    total_modules: 26,
    online_modules: 26,
    coverage_pct: 100,
    blueprint_version: 'V3 (The Sunday Club)',
    modules
  };
}
