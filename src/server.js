import express from 'express';
import cors from 'cors';
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
  handleDiagnosticReady 
} from './workflows/engine.js';
import { executeMcpTool, MCP_TOOLS_SCHEMA } from './mcp/tools.js';
import { callClaude } from './ai/claude.js';
import { initWhatsAppQR, getWhatsAppStatus } from './whatsapp/qr_bridge.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.resolve(__dirname, '../public'), { extensions: ['html'] }));

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

// Start Server
app.listen(PORT, () => {
  console.log(`\n🏥 Hospital AI Automation Server running at: http://localhost:${PORT}`);
  console.log(`   - Public Demo Patient Form: http://localhost:${PORT}/`);
  console.log(`   - Operations & KPI Dashboard: http://localhost:${PORT}/admin`);
  console.log(`   - Webhook Lead Intake: http://localhost:${PORT}/webhook/lead-intake\n`);
});
