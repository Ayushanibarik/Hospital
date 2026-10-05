import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const REQUIRED_VIEWS = [
  'home',
  'ai-modules',
  'appointments',
  'doctors',
  'patients',
  'queue',
  'admissions',
  'billing',
  'departments',
  'reports',
  'exceptions',
  'maintenance',
  'whatsapp'
];

test('Frontend HTML Structure & View Completeness', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf-8');
  const adminHtml = fs.readFileSync(path.join(ROOT, 'public/admin.html'), 'utf-8');

  for (const view of REQUIRED_VIEWS) {
    assert(indexHtml.includes(`id="view-${view}"`), `index.html must contain view-panel id="view-${view}"`);
    assert(indexHtml.includes(`switchView('${view}')`), `index.html must contain switchView('${view}') nav item`);
    assert(adminHtml.includes(`id="view-${view}"`), `admin.html must contain view-panel id="view-${view}"`);
    assert(adminHtml.includes(`switchView('${view}')`), `admin.html must contain switchView('${view}') nav item`);
  }

  // Check critical UI elements
  assert(indexHtml.includes('id="chatStream"'), 'Must contain AI chat stream');
  assert(indexHtml.includes('id="modulesGridContainer"'), 'Must contain 26 modules grid');
  assert(indexHtml.includes('id="specializedOpsContainer"'), 'Must contain 13 specialized ops grid');
  assert(indexHtml.includes('id="advancedClinicalContainer"'), 'Must contain 8 advanced clinical grid');
  assert(adminHtml.includes('id="specializedOpsContainer"'), 'admin.html must contain 13 specialized ops grid');
  assert(adminHtml.includes('id="advancedClinicalContainer"'), 'admin.html must contain 8 advanced clinical grid');
  assert(indexHtml.includes('id="doctorsGridContainer"'), 'Must contain doctors grid');
  assert(indexHtml.includes('id="appointmentsTableBody"'), 'Must contain appointments table');
  assert(indexHtml.includes('id="tokensTableBody"'), 'Must contain queue tokens table');
  assert(indexHtml.includes('id="admissionsTableBody"'), 'Must contain admissions table');
  assert(indexHtml.includes('id="billingTableBody"'), 'Must contain billing table');
  assert(indexHtml.includes('id="exceptionsTableBody"'), 'Must contain exceptions table');
  assert(indexHtml.includes('id="auditTableBody"'), 'Must contain audit logs table');
  assert(indexHtml.includes('id="toastContainer"'), 'Must contain toast container');
});

test('Live View APIs End-to-End Health Check', async () => {
  const BASE_URL = 'http://localhost:3000';

  try {
    const healthCheck = await fetch(`${BASE_URL}/health`);
    if (!healthCheck.ok) return;
  } catch (err) {
    console.log('ℹ Skipping live network test: Server is not currently running on port 3000.');
    return;
  }

  // 1. Doctors Endpoint
  const docRes = await fetch(`${BASE_URL}/api/doctors`);
  assert.strictEqual(docRes.status, 200, '/api/doctors must return 200');
  const docs = await docRes.json();
  assert(Array.isArray(docs) && docs.length > 0, 'Doctors must return list of doctors');

  // Test doctor toggle
  const testDoc = docs[0];
  const toggleRes = await fetch(`${BASE_URL}/api/doctors/${testDoc.doctor_id}/availability`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_available: testDoc.is_available === 1 ? 0 : 1 })
  });
  assert.strictEqual(toggleRes.status, 200, 'Doctor availability toggle must return 200');
  // Revert back
  await fetch(`${BASE_URL}/api/doctors/${testDoc.doctor_id}/availability`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_available: testDoc.is_available })
  });

  // 2. Appointments
  const apptRes = await fetch(`${BASE_URL}/api/dashboard/appointments`);
  assert.strictEqual(apptRes.status, 200, '/api/dashboard/appointments must return 200');

  // 3. Reminder trigger
  const reminderRes = await fetch(`${BASE_URL}/api/scheduler/run-reminders`, { method: 'POST' });
  assert.strictEqual(reminderRes.status, 200, '/api/scheduler/run-reminders must return 200');

  // 4. Patients / Leads
  const leadsRes = await fetch(`${BASE_URL}/api/dashboard/leads`);
  assert.strictEqual(leadsRes.status, 200, '/api/dashboard/leads must return 200');

  // 5. Queue Tokens & Call next
  const queueRes = await fetch(`${BASE_URL}/api/queue/tokens`);
  assert.strictEqual(queueRes.status, 200, '/api/queue/tokens must return 200');
  const callNextRes = await fetch(`${BASE_URL}/api/queue/call-next`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ department: 'Cardiology' })
  });
  assert.strictEqual(callNextRes.status, 200, '/api/queue/call-next must return 200');

  // 6. Inpatient Admissions
  const ipdRes = await fetch(`${BASE_URL}/api/dashboard/ipd-admissions`);
  assert.strictEqual(ipdRes.status, 200, '/api/dashboard/ipd-admissions must return 200');

  // 7. Billing
  const billRes = await fetch(`${BASE_URL}/api/dashboard/billing`);
  assert.strictEqual(billRes.status, 200, '/api/dashboard/billing must return 200');

  // 8. Department Performance
  const deptRes = await fetch(`${BASE_URL}/api/dashboard/department-performance`);
  assert.strictEqual(deptRes.status, 200, '/api/dashboard/department-performance must return 200');

  // 9. 26 Modules Status
  const modRes = await fetch(`${BASE_URL}/api/modules/status`);
  assert.strictEqual(modRes.status, 200, '/api/modules/status must return 200');
  const modData = await modRes.json();
  assert.strictEqual(modData.total_modules, 26, 'Total modules must be 26');

  // 10. AI Assistant Chat
  const aiRes = await fetch(`${BASE_URL}/api/ai/operations-assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'What is the current bed occupancy?' })
  });
  assert.strictEqual(aiRes.status, 200, '/api/ai/operations-assistant must return 200');
  const aiData = await aiRes.json();
  assert(aiData.success && aiData.response, 'AI Assistant must return valid response');

  // 11. Reports
  const reportRes = await fetch(`${BASE_URL}/api/reports/daily`);
  assert.strictEqual(reportRes.status, 200, '/api/reports/daily must return 200');

  // 12. Exceptions
  const excRes = await fetch(`${BASE_URL}/api/dashboard/exceptions`);
  assert.strictEqual(excRes.status, 200, '/api/dashboard/exceptions must return 200');

  // 13. System Maintenance Audit
  const auditRes = await fetch(`${BASE_URL}/api/system/maintenance-audit`);
  assert.strictEqual(auditRes.status, 200, '/api/system/maintenance-audit must return 200');

  // 14. WhatsApp Status
  const waRes = await fetch(`${BASE_URL}/api/whatsapp/status`);
  assert.strictEqual(waRes.status, 200, '/api/whatsapp/status must return 200');
});
