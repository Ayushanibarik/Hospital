import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { db } from './db/index.js';
import { seed } from './db/seed.js';
import { 
  handleLeadIntake, 
  handleNoShowRecovery, 
  handleDischargeFollowup, 
  handlePatientFeedback,
  handleAppointmentReschedule,
  handleDiagnosticReady,
  handlePreConsultationIntake,
  handleInsurancePreVerification,
  handleGenerateQueueToken,
  handleCallNextQueueToken,
  handleAdmissionPreClearance,
  handleChronicRevisitCheck,
  handleInactiveReactivation,
  handleDoctorAvailability
} from './workflows/engine.js';
import { executeMcpTool, MCP_TOOLS_SCHEMA } from './mcp/tools.js';
import { callClaude } from './ai/claude.js';
import { initWhatsAppQR, getWhatsAppStatus } from './whatsapp/qr_bridge.js';
import { handleInboundPatientMessage } from './workflows/inbound_reply.js';
import { startBackgroundScheduler, runAppointmentReminders } from './workflows/scheduler.js';
import { appCache } from './utils/cache.js';
import { requestLogger, logger } from './utils/logger.js';
import { trackError } from './utils/error_tracker.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Structured Request Logging (Pino ELK/CloudWatch compatible)
app.use(requestLogger);

// Hardened HTTP Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Global Rate Limiter (Protection against brute-force / DDoS)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please retry after 15 minutes.' }
});
app.use(globalLimiter);

// Webhook Ingestion Limiter (Prevents lead spamming)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Webhook rate limit exceeded. Please throttle payload delivery.' }
});
app.use('/webhook/', webhookLimiter);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Edge CDN Caching for Static Frontend Assets (1 day cache)
app.use(express.static(path.resolve(__dirname, '../public'), {
  extensions: ['html'],
  maxAge: '1d',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));

// Production Health Check & Readiness Probe (Docker / K8s standard)
app.get('/health', (req, res) => {
  try {
    const dbCheck = db.prepare('SELECT 1 as alive').get();
    res.json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      database: dbCheck.alive === 1 ? 'HEALTHY' : 'DEGRADED',
      environment: process.env.NODE_ENV || 'development',
      memory: {
        rss_mb: (process.memoryUsage().rss / 1024 / 1024).toFixed(2),
        heap_used_mb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
      }
    });
  } catch (err) {
    res.status(503).json({ status: 'DOWN', error: err.message });
  }
});

// Explicit route for admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../public/admin.html'));
});

// -------------------------------------------------------------
// WEBHOOKS (Sections O, P, Q, R)
// -------------------------------------------------------------

// Webhook 1: Lead Intake (Section O & P)
app.post('/webhook/lead-intake', async (req, res) => {
  try {
    const result = await handleLeadIntake(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Lead intake webhook error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Webhook 2: No-Show Recovery (Section Q)
app.post('/webhook/no-show-recovery', async (req, res) => {
  try {
    const { appointment_id } = req.body;
    if (!appointment_id) {
      return res.status(400).json({ success: false, error: 'appointment_id is required' });
    }
    const result = await handleNoShowRecovery(appointment_id);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('No-show recovery error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Webhook 3: Discharge Follow-Up (Section R)
app.post('/webhook/discharge-followup', async (req, res) => {
  try {
    const { patient_id } = req.body;
    if (!patient_id) {
      return res.status(400).json({ success: false, error: 'patient_id is required' });
    }
    const result = await handleDischargeFollowup({ patient_id });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Discharge follow-up error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Inbound Patient Feedback (Service Recovery Loop)
app.post('/api/feedback', (req, res) => {
  try {
    const result = handlePatientFeedback(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Module 8: Appointment Rescheduling
app.post('/api/appointments/:id/reschedule', async (req, res) => {
  try {
    const { id } = req.params;
    const { new_slot_id } = req.body;
    const result = await handleAppointmentReschedule({ appointment_id: id, new_slot_id });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Module 11: Diagnostic Follow-Up Notification
app.post('/webhook/diagnostic-ready', async (req, res) => {
  try {
    const { patient_id, test_category } = req.body;
    if (!patient_id) {
      return res.status(400).json({ success: false, error: 'patient_id is required' });
    }
    const result = await handleDiagnosticReady({ patient_id, test_category });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Module 3: Digital Pre-Consultation Intake Form
app.post('/api/intake/pre-consultation', async (req, res) => {
  try {
    const result = await handlePreConsultationIntake(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Module 4: Insurance Pre-Verification / TPA
app.post('/api/insurance/pre-verify', async (req, res) => {
  try {
    const result = await handleInsurancePreVerification(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Module 10: OPD Flow & Queue Token Management
app.post('/api/queue/token', async (req, res) => {
  try {
    const { appointment_id, patient_id, department } = req.body;
    if (!patient_id || !department) {
      return res.status(400).json({ success: false, error: 'patient_id and department are required' });
    }
    const result = await handleGenerateQueueToken({ appointment_id, patient_id, department });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/queue/call-next', async (req, res) => {
  try {
    const { department } = req.body;
    if (!department) return res.status(400).json({ success: false, error: 'department is required' });
    const result = await handleCallNextQueueToken({ department });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/queue/tokens', (req, res) => {
  try {
    const { department } = req.query;
    let query = `
      SELECT q.*, p.full_name, p.phone
      FROM queue_tokens q
      JOIN patients p ON q.patient_id = p.patient_id
      WHERE date(q.created_at) = date('now')
    `;
    const params = [];
    if (department) {
      query += ` AND q.department = ?`;
      params.push(department);
    }
    query += ` ORDER BY q.token_number ASC`;
    const tokens = db.prepare(query).all(...params);
    res.json(tokens);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Module 12: Inpatient Admission Pre-Clearance
app.post('/api/admission/pre-clearance', async (req, res) => {
  try {
    const result = await handleAdmissionPreClearance(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Module 16: Chronic Disease Management & Revisit Scheduling
app.get('/api/chronic/programs', (req, res) => {
  try {
    const programs = db.prepare(`
      SELECT c.*, p.full_name, p.phone
      FROM chronic_programs c
      JOIN patients p ON c.patient_id = p.patient_id
      ORDER BY c.next_due_date ASC
    `).all();
    res.json(programs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chronic/check-ins', async (req, res) => {
  try {
    const result = await handleChronicRevisitCheck();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Module 17: Inactive Patient Reactivation Campaign
app.post('/api/campaigns/reactivation', async (req, res) => {
  try {
    const result = await handleInactiveReactivation();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Module 18: Staff Operations & Doctor Availability Management
app.get('/api/doctors', (req, res) => {
  try {
    const cached = appCache.get('all_doctors');
    if (cached) return res.json(cached);

    const docs = db.prepare(`SELECT * FROM doctors ORDER BY department, name`).all();
    appCache.set('all_doctors', docs, 120); // 2 minute cache
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/doctors/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_available } = req.body;
    const result = await handleDoctorAvailability({ doctor_id: id, is_available });
    appCache.del('all_doctors'); // Invalidate cache on roster update
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// -------------------------------------------------------------
// WHATSAPP WEB QR BRIDGE (100% Free - Section W Option B)
// -------------------------------------------------------------
app.get('/api/whatsapp/status', (req, res) => {
  res.json(getWhatsAppStatus());
});

app.post('/api/whatsapp/connect', async (req, res) => {
  try {
    initWhatsAppQR();
    res.json({ success: true, message: 'WhatsApp QR Bridge started. Check terminal to scan QR code.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Two-Way WhatsApp Inbound Webhook (Meta Cloud API / Test endpoint)
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN || 'democare_verify_token')) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/webhook/whatsapp', async (req, res) => {
  try {
    let phone = req.body.fromPhone;
    let text = req.body.messageBody;

    if (req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const msg = req.body.entry[0].changes[0].value.messages[0];
      phone = msg.from;
      text = msg.text?.body;
    }

    if (!phone || !text) {
      return res.status(400).json({ error: 'Missing phone or message text' });
    }

    const result = await handleInboundPatientMessage({ fromPhone: phone, messageBody: text });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Staff Operations: Update Appointment Status
app.patch('/api/appointments/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { attendance_status, status } = req.body;
    
    const updates = [];
    const params = [];
    if (attendance_status) { updates.push('attendance_status = ?'); params.push(attendance_status); }
    if (status) { updates.push('status = ?'); params.push(status); }
    
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    
    params.push(id);
    db.prepare(`UPDATE appointments SET ${updates.join(', ')} WHERE appointment_id = ?`).run(...params);
    res.json({ success: true, appointment_id: id, attendance_status, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Trigger Reminder Scheduler
app.post('/api/scheduler/run-reminders', async (req, res) => {
  try {
    const result = await runAppointmentReminders();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Audit Logs Endpoint
app.get('/api/dashboard/audit-logs', (req, res) => {
  try {
    const logs = db.prepare(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 30`).all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Follow-ups Endpoint
app.get('/api/dashboard/follow-ups', (req, res) => {
  try {
    const tasks = db.prepare(`
      SELECT f.*, p.full_name, p.phone
      FROM follow_ups f
      JOIN patients p ON f.patient_id = p.patient_id
      ORDER BY f.approved_date ASC LIMIT 30
    `).all();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Diagnostics Endpoint
app.get('/api/dashboard/diagnostics', (req, res) => {
  try {
    const tasks = db.prepare(`
      SELECT d.*, p.full_name, p.phone
      FROM diagnostic_tasks d
      JOIN patients p ON d.patient_id = p.patient_id
      ORDER BY d.ordered_at DESC LIMIT 30
    `).all();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Intake Forms Endpoint
app.get('/api/dashboard/intake-forms', (req, res) => {
  try {
    const forms = db.prepare(`
      SELECT f.*, p.full_name, p.phone
      FROM intake_forms f
      JOIN patients p ON f.patient_id = p.patient_id
      ORDER BY f.submitted_at DESC LIMIT 30
    `).all();
    res.json(forms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Insurance Pre-Verifications Endpoint
app.get('/api/dashboard/insurance', (req, res) => {
  try {
    const list = db.prepare(`
      SELECT i.*, p.full_name, p.phone
      FROM insurance_preverifications i
      JOIN patients p ON i.patient_id = p.patient_id
      ORDER BY i.created_at DESC LIMIT 30
    `).all();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Inpatient Pre-Clearance Endpoint
app.get('/api/dashboard/admissions', (req, res) => {
  try {
    const list = db.prepare(`
      SELECT a.*, p.full_name, p.phone
      FROM admission_preclearances a
      JOIN patients p ON a.patient_id = p.patient_id
      ORDER BY a.created_at DESC LIMIT 30
    `).all();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Chronic Care Tracking Endpoint
app.get('/api/dashboard/chronic', (req, res) => {
  try {
    const list = db.prepare(`
      SELECT c.*, p.full_name, p.phone
      FROM chronic_programs c
      JOIN patients p ON c.patient_id = p.patient_id
      ORDER BY c.next_due_date ASC LIMIT 30
    `).all();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// OPERATIONAL DASHBOARD APIS (Section AA)
// -------------------------------------------------------------

app.get('/api/dashboard/metrics', async (req, res) => {
  try {
    const opsSummary = await executeMcpTool('get_daily_operations_summary', {});
    res.json(opsSummary.metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/leads', (req, res) => {
  try {
    const leads = db.prepare(`
      SELECT l.*, p.full_name, p.phone
      FROM leads l
      JOIN patients p ON l.patient_id = p.patient_id
      ORDER BY l.created_at DESC LIMIT 20
    `).all();
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/appointments', (req, res) => {
  try {
    const appointments = db.prepare(`
      SELECT a.*, p.full_name, p.phone, d.name as doctor_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.patient_id
      JOIN doctors d ON a.doctor_id = d.doctor_id
      ORDER BY a.slot_start DESC LIMIT 20
    `).all();
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/communications', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT c.*, p.full_name
      FROM communication_logs c
      JOIN patients p ON c.patient_id = p.patient_id
      ORDER BY c.sent_at DESC LIMIT 25
    `).all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/exceptions', (req, res) => {
  try {
    const exceptions = db.prepare(`
      SELECT * FROM exceptions ORDER BY created_at DESC LIMIT 20
    `).all();
    res.json(exceptions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dashboard/exceptions/:id/resolve', (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    db.prepare(`
      UPDATE exceptions
      SET status = 'RESOLVED', resolution_note = ?
      WHERE exception_id = ?
    `).run(note || 'Resolved by ops coordinator', id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/ai-summary', async (req, res) => {
  try {
    const ops = await executeMcpTool('get_daily_operations_summary', {});
    const summary = await callClaude('DAILY_SUMMARY', { metrics_json: ops.metrics });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset / Re-seed endpoint for live video demo resets
app.post('/api/demo/reset', (req, res) => {
  try {
    seed();
    res.json({ success: true, message: 'DemoCare environment reset to initial state' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// MCP TOOL ENDPOINTS (Section V)
// -------------------------------------------------------------
app.get('/api/mcp/tools', (req, res) => {
  res.json({ tools: MCP_TOOLS_SCHEMA });
});

app.post('/api/mcp/execute', async (req, res) => {
  try {
    const { tool, arguments: args } = req.body;
    const result = await executeMcpTool(tool, args);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Centralized 404 handler for unmatched routes
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
  }
  res.status(404).json({ success: false, error: 'Endpoint not found', path: req.originalUrl });
});

// Centralized Error Handling Middleware (Never leak stack traces in production)
app.use((err, req, res, next) => {
  const errorId = trackError(err, {
    url: req.originalUrl || req.url,
    method: req.method,
    correlationId: req.correlationId
  });
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    success: false,
    error_id: errorId,
    error: isProd ? 'Internal server error occurred. Please contact IT support.' : err.message
  });
});

// Start Server
const server = app.listen(PORT, () => {
  console.log(`\n🏥 Hospital AI Automation Server running at: http://localhost:${PORT}`);
  console.log(`   - Public Demo Patient Form: http://localhost:${PORT}/`);
  console.log(`   - Operations & KPI Dashboard: http://localhost:${PORT}/admin`);
  console.log(`   - Health & Liveness Probe: http://localhost:${PORT}/health`);
  console.log(`   - Webhook Lead Intake: http://localhost:${PORT}/webhook/lead-intake\n`);

  // Start background 24h & 3h appointment reminder scheduler
  startBackgroundScheduler(60000);
});

// Graceful Shutdown Handler (Docker & Kubernetes standard)
function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Initiating graceful shutdown...`);
  server.close(() => {
    console.log('✅ HTTP server connections closed cleanly.');
    try {
      db.close?.();
      console.log('✅ Database connections closed.');
    } catch (e) {}
    process.exit(0);
  });

  setTimeout(() => {
    console.error('⚠️ Forcefully terminating process after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

