/**
 * ============================================================================
 * MODULE: Background Appointment Reminder & SLA Scanner (src/workflows/scheduler.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Automated background cron and timer scheduler. Continuously scans for confirmed
 *   appointments requiring T-24h and T-3h reminders and dispatches WhatsApp notices.
 *   Also triggers recurring scans for overdue lead response SLAs (Module 20).
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Blueprint V3: Section C (Modules 7, 20), Section Z (Error Handling & Idempotency)
 *
 * PACKAGES & DEPENDENCIES:
 *   - ../db/index.js (db)                  : SQLite database connection
 *   - ./engine.js                          : generateCorrelationId, checkAndEscalateLeadSla
 *   - ../whatsapp/qr_bridge.js             : dispatchWhatsApp
 *
 * KEY EXPORTED FUNCTIONS:
 *   - runAppointmentReminders()
 *   - runAllBackgroundTasks()
 *   - startBackgroundScheduler(intervalMs)
 *
 * SYSTEM USAGE & INTEGRATION:
 *   - Initialized in src/server.js upon server startup (default 60s tick).
 *   - Triggered on demand via POST /api/scheduler/run-reminders.
 * ============================================================================
 */

import { db } from '../db/index.js';
import { generateCorrelationId, checkAndEscalateLeadSla } from './engine.js';
import { dispatchWhatsApp } from '../whatsapp/qr_bridge.js';

export async function runAppointmentReminders() {
  const now = new Date();
  const timestamp = now.toISOString();

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

export async function runAllBackgroundTasks() {
  const reminderRes = await runAppointmentReminders();
  const slaRes = await checkAndEscalateLeadSla(15);
  return {
    ...reminderRes,
    lead_sla_escalated: slaRes.escalated_count
  };
}

export function startBackgroundScheduler(intervalMs = 60000) {
  console.log(`⏱️ Starting Hospital Background Scheduler (Interval: ${intervalMs / 1000}s)...`);
  runAllBackgroundTasks().catch(err => console.error('[Scheduler Error]:', err.message));
  
  const timer = setInterval(() => {
    runAllBackgroundTasks().catch(err => console.error('[Scheduler Error]:', err.message));
  }, intervalMs);

  return timer;
}
