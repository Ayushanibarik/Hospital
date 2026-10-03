import { db } from '../db/index.js';
import { generateCorrelationId, handleAppointmentReschedule, handlePatientFeedback } from './engine.js';
import { dispatchWhatsApp } from '../whatsapp/qr_bridge.js';

/**
 * Handle Inbound WhatsApp Patient Message Replies
 * Two-way Conversational Lifecycle Loop
 */
export async function handleInboundPatientMessage({ fromPhone, messageBody }) {
  const correlationId = generateCorrelationId();
  const timestamp = new Date().toISOString();
  const text = (messageBody || '').trim();
  const lower = text.toLowerCase();

  // Find patient by phone
  const cleanPhone = fromPhone.replace(/\D/g, '');
  const patient = db.prepare(`
    SELECT * FROM patients WHERE phone LIKE ? OR phone LIKE ?
  `).get(`%${cleanPhone.slice(-10)}%`, cleanPhone);

  if (!patient) {
    console.log(`[Inbound Message] Message from unknown phone: ${fromPhone}. Creating lead.`);
    return {
      status: 'UNKNOWN_PATIENT',
      message: 'Logged message from unregistered patient.'
    };
  }

  // 1. Check for Emergency Keywords
  const emergencyKeywords = ['emergency', 'chest pain', 'heart attack', 'severe bleeding', 'breathing', 'unconscious', 'dying', 'suicide'];
  if (emergencyKeywords.some(kw => lower.includes(kw))) {
    const excId = `EXC-EMERG-${Date.now().toString().slice(-6)}`;
    db.prepare(`
      INSERT INTO exceptions (exception_id, workflow_name, record_id, error_type, severity, owner, resolution_note)
      VALUES (?, 'INBOUND_PATIENT_REPLY', ?, 'CLINICAL_EMERGENCY_IN_WHATSAPP_REPLY', 'high', 'ER Triage Lead', ?)
    `).run(excId, patient.patient_id, `Patient replied with urgent medical symptoms: "${text}". Contact immediately!`);

    const autoAlert = `EMERGENCY ALERT: We have flagged your message to our Emergency Triage team. If this is an immediate life-threatening emergency, please visit DemoCare Emergency Ward or call 112 / 108 immediately.`;
    await dispatchWhatsApp({ toPhone: patient.phone, messageText: autoAlert });

    return {
      status: 'EMERGENCY_ESCALATED',
      correlation_id: correlationId,
      patient_id: patient.patient_id
    };
  }

  // 2. Check for Confirmation Reply ('1', 'YES', 'CONFIRM')
  if (lower === '1' || lower === 'yes' || lower === 'confirm' || lower.includes('confirmed')) {
    // Find active upcoming appointment
    const activeAppt = db.prepare(`
      SELECT * FROM appointments 
      WHERE patient_id = ? AND status IN ('CONFIRMED', 'RESCHEDULED') AND attendance_status = 'scheduled'
      ORDER BY slot_start ASC LIMIT 1
    `).get(patient.patient_id);

    if (activeAppt) {
      db.prepare(`
        UPDATE communication_logs 
        SET response_status = 'REPLIED' 
        WHERE patient_id = ? AND template_name LIKE 'APPT_%'
      `).run(patient.patient_id);

      const confirmReply = `Thank you, ${patient.full_name}! Your appointment on ${activeAppt.slot_start} is re-confirmed. We look forward to seeing you at DemoCare Hospital.`;
      await dispatchWhatsApp({ toPhone: patient.phone, messageText: confirmReply });

      return {
        status: 'APPOINTMENT_CONFIRMED',
        appointment_id: activeAppt.appointment_id,
        reply_sent: confirmReply
      };
    }
  }

  // 3. Check for Reschedule Request ('2', 'RESCHEDULE')
  if (lower === '2' || lower.includes('reschedule') || lower.includes('change date')) {
    const activeAppt = db.prepare(`
      SELECT * FROM appointments 
      WHERE patient_id = ? AND attendance_status = 'scheduled'
      ORDER BY slot_start ASC LIMIT 1
    `).get(patient.patient_id);

    if (activeAppt) {
      const reschedResult = await handleAppointmentReschedule({ appointment_id: activeAppt.appointment_id });
      return {
        status: 'RESCHEDULE_PROCESSED',
        ...reschedResult
      };
    }
  }

  // 4. Check for Numeric Feedback Rating (1 to 5)
  if (/^[1-5]$/.test(text)) {
    const rating = parseInt(text, 10);
    const feedbackResult = handlePatientFeedback({
      patient_id: patient.patient_id,
      rating,
      comment: `Direct WhatsApp rating reply: ${rating}/5`
    });

    const replyMsg = rating >= 4
      ? `Thank you for the wonderful ${rating}-star feedback, ${patient.full_name}! We are delighted to care for you. If you have 30 seconds, please share your experience on Google: https://democare.hospital/review`
      : `Thank you for your feedback, ${patient.full_name}. We regret your experience did not meet expectations. Our Patient Relations Manager has been notified and will reach out to you shortly.`;

    await dispatchWhatsApp({ toPhone: patient.phone, messageText: replyMsg });

    return {
      status: 'FEEDBACK_PROCESSED',
      rating,
      service_recovery: feedbackResult.service_recovery_escalation
    };
  }

  // General Inquiry Fallback
  const defaultReply = `Hello ${patient.full_name}, thank you for contacting DemoCare Multispeciality Hospital. For OPD consultations or appointments, reply '1' to confirm, '2' to reschedule, or contact our helpdesk at +91 22 5550 1234.`;
  await dispatchWhatsApp({ toPhone: patient.phone, messageText: defaultReply });

  return {
    status: 'GENERAL_REPLY_SENT',
    message: defaultReply
  };
}
