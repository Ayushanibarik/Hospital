/**
 * ============================================================================
 * TEST SUITE: Blueprint Section P Webhook Payload Test (test/test_section_p_payload.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Executes the exact Section P test payload (Rahul Sharma, Dermatology, 2026-09-05,
 *   HOSP-20260905-DEMO001) through the lead intake workflow, verifying database records,
 *   correlation ID tracing, and communication logs.
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Blueprint V3: Section P (Make.com — Webhook Test Payload)
 *
 * PACKAGES & DEPENDENCIES:
 *   - node:assert                          : Assertions library
 *   - ../src/workflows/engine.js           : handleLeadIntake
 *   - ../src/db/index.js (db)              : SQLite database verification
 *
 * USAGE:
 *   node test/test_section_p_payload.js
 * ============================================================================
 */

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

const lead = db.prepare('SELECT * FROM leads WHERE patient_id = ?').get(result.patient_id);
assert.ok(lead, 'Lead record must be created');
assert.strictEqual(lead.department, 'Dermatology');

const comm = db.prepare('SELECT * FROM communication_logs WHERE correlation_id = ?').get(result.correlation_id);
assert.ok(comm, 'Communication log must be recorded with correlation_id');
assert.strictEqual(comm.correlation_id, "HOSP-20260905-DEMO001");

console.log('✅ Section P exact webhook test passed with 100% compliance!');
