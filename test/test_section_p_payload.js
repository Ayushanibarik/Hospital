import { handleLeadIntake } from '../src/workflows/engine.js';
import { db } from '../src/db/index.js';
import assert from 'assert';

console.log('Testing Section P exact webhook payload...');

const sectionPPayload = {
  full_name: "Rahul Sharma",
  phone: "9999999999",
  department: "Dermatology",
  preferred_date: "2026-09-05",
  enquiry_text: "I want to book a consultation.",
  source: "Instagram",
  correlation_id: "HOSP-20260905-DEMO001"
};

const result = await handleLeadIntake(sectionPPayload);
console.log('Section P result:', result);

assert.strictEqual(result.success, true);
assert.strictEqual(result.correlation_id, "HOSP-20260905-DEMO001");
assert.strictEqual(result.ai_qualification.department, "Dermatology");

// Verify lead in DB
const lead = db.prepare('SELECT * FROM leads WHERE patient_id = ?').get(result.patient_id);
assert.ok(lead, 'Lead record must be created');
assert.strictEqual(lead.department, 'Dermatology');

// Verify communication log
const comm = db.prepare('SELECT * FROM communication_logs WHERE correlation_id = ?').get(result.correlation_id);
assert.ok(comm, 'Communication log must be recorded with correlation_id');
assert.strictEqual(comm.correlation_id, "HOSP-20260905-DEMO001");

console.log('✅ Section P exact webhook test passed with 100% compliance!');
