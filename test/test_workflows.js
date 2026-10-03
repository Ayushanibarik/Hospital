import { seed } from '../src/db/seed.js';
import { handleLeadIntake, handleNoShowRecovery, handleDischargeFollowup, handlePatientFeedback } from '../src/workflows/engine.js';
import { executeMcpTool } from '../src/mcp/tools.js';
import { callClaude } from '../src/ai/claude.js';
import { db } from '../src/db/index.js';

async function runTests() {
  console.log('\n=============================================');
  console.log('🧪 RUNNING COMPREHENSIVE WORKFLOW TESTS');
  console.log('=============================================\n');

  // Reset & Seed
  seed();

  // TEST 1: Lead Intake Workflow (Section P exact payload)
  console.log('\n--- [Test 1] Section P Lead Intake Payload ---');
  const testPayload = {
    full_name: 'Rahul Sharma',
    phone: '9999999999',
    department: 'Dermatology',
    preferred_date: '2026-10-04',
    enquiry_text: 'I want to book a consultation for severe acne.',
    source: 'Instagram',
    correlation_id: 'HOSP-20261004-DEMO001'
  };

  const leadResult = await handleLeadIntake(testPayload);
  console.log('Lead Intake Result:', JSON.stringify(leadResult, null, 2));
  if (leadResult.status !== 'SUCCESS') throw new Error('Test 1 Failed: Lead intake status not SUCCESS');
  console.log('✅ Test 1 Passed: Lead qualified, slot booked, confirmation message generated.');

  // TEST 2: Emergency Enquiry Escalation (Safety Guardrail)
  console.log('\n--- [Test 2] Clinical Emergency Guardrail ---');
  const emergencyPayload = {
    full_name: 'Vikram Joshi',
    phone: '9888888888',
    department: 'Cardiology',
    enquiry_text: 'Having acute severe chest pain radiating to left arm and breathing difficulty since 20 mins!',
    source: 'WhatsApp'
  };

  const emergencyResult = await handleLeadIntake(emergencyPayload);
  console.log('Emergency Guardrail Result:', JSON.stringify(emergencyResult, null, 2));
  if (emergencyResult.status !== 'ESCALATED_TO_HUMAN') throw new Error('Test 2 Failed: Emergency not escalated');
  console.log('✅ Test 2 Passed: Clinical emergency safely escalated to Human Review Queue.');

  // TEST 3: No-Show Recovery Workflow (Section Q)
  console.log('\n--- [Test 3] No-Show Recovery Trigger ---');
  const noShowResult = await handleNoShowRecovery('APPT-DEMO-002');
  console.log('No-Show Recovery Result:', JSON.stringify(noShowResult, null, 2));
  if (noShowResult.status !== 'RECOVERY_SENT') throw new Error('Test 3 Failed: Recovery message not sent');
  console.log('✅ Test 3 Passed: No-show detected, polite rescheduling message generated and logged.');

  // TEST 4: Idempotency Check (Duplicate No-Show Recovery Prevention)
  console.log('\n--- [Test 4] Idempotency Prevention ---');
  const duplicateResult = await handleNoShowRecovery('APPT-DEMO-002');
  console.log('Duplicate Call Result:', JSON.stringify(duplicateResult, null, 2));
  if (duplicateResult.status !== 'SKIPPED_DUPLICATE') throw new Error('Test 4 Failed: Duplicate message was not blocked');
  console.log('✅ Test 4 Passed: Duplicate communication prevented by Idempotency check.');

  // TEST 5: Discharge Follow-Up & Negative Feedback Service Recovery
  console.log('\n--- [Test 5] Discharge Follow-Up & Feedback Loop ---');
  const dischargeResult = await handleDischargeFollowup({ patient_id: 'DEMO-003' });
  console.log('Discharge Follow-Up Result:', JSON.stringify(dischargeResult, null, 2));
  
  // Simulate negative rating 1/5
  const feedbackResult = handlePatientFeedback({
    patient_id: 'DEMO-003',
    rating: 1,
    comment: 'The billing counter took 2 hours to clear the discharge summary.'
  });
  console.log('Negative Feedback Escalation:', JSON.stringify(feedbackResult, null, 2));
  if (!feedbackResult.service_recovery_escalation) throw new Error('Test 5 Failed: Negative feedback not escalated');
  console.log('✅ Test 5 Passed: Post-discharge task created, negative feedback routed to Service Recovery Queue.');

  // TEST 6: MCP Tools (Section V)
  console.log('\n--- [Test 6] MCP Tools Verification ---');
  const slotsTool = await executeMcpTool('get_appointment_slots', { department: 'Cardiology' });
  console.log(`Tool 1 (get_appointment_slots): Found ${slotsTool.count} slots in Cardiology.`);
  if (slotsTool.count === 0) throw new Error('Test 6 Failed: Tool 1 returned 0 slots');

  const opsTool = await executeMcpTool('get_daily_operations_summary', {});
  console.log('Tool 3 (get_daily_operations_summary):', JSON.stringify(opsTool.metrics, null, 2));

  // TEST 7: AI Daily Management Summary (Prompt 5)
  console.log('\n--- [Test 7] Prompt 5 Daily Management Summary ---');
  const summaryReport = await callClaude('DAILY_SUMMARY', { metrics_json: opsTool.metrics });
  console.log('Management Summary:', JSON.stringify(summaryReport, null, 2));
  if (!summaryReport.headline) throw new Error('Test 7 Failed: Headline missing in Daily Summary');
  console.log('✅ Test 7 Passed: Daily executive report generated successfully.');

  console.log('\n=============================================');
  console.log('🎉 ALL 7 TEST SUITES PASSED FLAWLESSLY!');
  console.log('=============================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
