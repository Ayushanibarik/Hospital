import { db } from '../db/index.js';
import { generateCorrelationId, checkAndEscalateLeadSla } from './engine.js';
import { dispatchWhatsApp } from '../whatsapp/qr_bridge.js';

/**
 * Hospital Automated Reminder & SLA Engine
 * Modules 7 (Reminder) & 20 (Lead SLA) of Master Blueprint V3
 */

/**
 * Scan for upcoming appointments and dispatch 24h & 3h reminders
 */
export async function runAppointmentReminders() {
  const now = new Date();
  const timestamp = now.toISOString();

  // 1. Check for 24-Hour Reminders (Appointments between 20h and 26h away)
  const appts24h = db.prepare(`
    SELECT a.*, p.full_name, p.phone, d.name as doctor_name
    FROM appointments a
    JOIN patients p ON a.patient_id = p.patient_id
    JOIN doctors d ON a.doctor_id = d.doctor_id
    WHERE a.status = 'CONFIRMED'
      AND a.attendance_status = 'scheduled'
      AND a.reminder_24h = 0
      AND datetime(a.slot_start) <= datetime('now', '+26 hours')
      AND datetime(a.slot_start) >= datetime('now', '+20 hours')
  `).all();

  for (const appt of appts24h) {
    const correlationId = generateCorrelationId();
    const msgId = `MSG-REM24-${Date.now().toString().slice(-6)}`;
    const messageText = `Reminder: Hello ${appt.full_name}, your consultation with ${appt.doctor_name} at DemoCare Hospital is scheduled for tomorrow at ${appt.slot_start}. Reply '1' to confirm or '2' to reschedule.`;

    db.prepare(`
      INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
      VALUES (?, ?, 'WhatsApp', 'APPT_REMINDER_24H', 'HOSPITAL | Appointment Reminder', ?, 'DELIVERED', 'AWAITING_REPLY', ?)
    `).run(msgId, appt.patient_id, timestamp, correlationId);

    db.prepare(`UPDATE appointments SET reminder_24h = 1 WHERE appointment_id = ?`).run(appt.appointment_id);
    await dispatchWhatsApp({ toPhone: appt.phone, messageText });
    console.log(`[Scheduler] 24h Reminder sent to ${appt.full_name} (${appt.phone})`);
  }

  // 2. Check for 3-Hour Reminders (Appointments between 2h and 4h away)
  const appts3h = db.prepare(`
    SELECT a.*, p.full_name, p.phone, d.name as doctor_name, d.room_number
    FROM appointments a
    JOIN patients p ON a.patient_id = p.patient_id
    JOIN doctors d ON a.doctor_id = d.doctor_id
    WHERE a.status = 'CONFIRMED'
      AND a.attendance_status = 'scheduled'
      AND a.reminder_3h = 0
      AND datetime(a.slot_start) <= datetime('now', '+4 hours')
      AND datetime(a.slot_start) >= datetime('now', '+2 hours')
  `).all();

  for (const appt of appts3h) {
    const correlationId = generateCorrelationId();
    const msgId = `MSG-REM3H-${Date.now().toString().slice(-6)}`;
    const messageText = `DemoCare Hospital: Hello ${appt.full_name}, your consultation starts in ~3 hours at ${appt.slot_start} with ${appt.doctor_name} in ${appt.room_number}. Please arrive 15 minutes early.`;

    db.prepare(`
      INSERT INTO communication_logs (message_id, patient_id, channel, template_name, workflow_name, sent_at, delivery_status, response_status, correlation_id)
      VALUES (?, ?, 'WhatsApp', 'APPT_REMINDER_3H', 'HOSPITAL | Appointment Reminder', ?, 'DELIVERED', 'AWAITING_REPLY', ?)
    `).run(msgId, appt.patient_id, timestamp, correlationId);

    db.prepare(`UPDATE appointments SET reminder_3h = 1 WHERE appointment_id = ?`).run(appt.appointment_id);
    await dispatchWhatsApp({ toPhone: appt.phone, messageText });
    console.log(`[Scheduler] 3h Reminder sent to ${appt.full_name} (${appt.phone})`);
  }

  return {
    reminders_24h_sent: appts24h.length,
    reminders_3h_sent: appts3h.length
  };
}

/**
 * Execute automated background tasks (reminders + Lead SLA escalation)
 */
export async function runAllBackgroundTasks() {
  const reminderRes = await runAppointmentReminders();
  const slaRes = await checkAndEscalateLeadSla(15);
  return {
    ...reminderRes,
    lead_sla_escalated: slaRes.escalated_count
  };
}

/**
 * Start the recurring background scheduler (runs every 60 seconds)
 */
export function startBackgroundScheduler(intervalMs = 60000) {
  console.log(`⏱️ Starting Hospital Background Scheduler (Interval: ${intervalMs / 1000}s)...`);
  runAllBackgroundTasks().catch(err => console.error('[Scheduler Error]:', err.message));
  
  const timer = setInterval(() => {
    runAllBackgroundTasks().catch(err => console.error('[Scheduler Error]:', err.message));
  }, intervalMs);

  return timer;
}

