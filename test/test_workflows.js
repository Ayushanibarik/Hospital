import { seed } from '../src/db/seed.js';
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
} from '../src/workflows/engine.js';
import { handleInboundPatientMessage } from '../src/workflows/inbound_reply.js';
import { runAppointmentReminders } from '../src/workflows/scheduler.js';
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

  // TEST 8: Appointment Rescheduling (Module 8)
  console.log('\n--- [Test 8] Appointment Rescheduling ---');
  const reschedResult = await handleAppointmentReschedule({ appointment_id: 'APPT-DEMO-002' });
  console.log('Reschedule Result:', JSON.stringify(reschedResult, null, 2));
  if (reschedResult.status !== 'RESCHEDULED_SUCCESS') throw new Error('Test 8 Failed: Reschedule failed');
  console.log('✅ Test 8 Passed: Patient rescheduled to new slot and confirmation message dispatched.');

  // TEST 9: Diagnostic Ready Administrative Notification (Module 11)
  console.log('\n--- [Test 9] Diagnostic Ready Notification ---');
  const diagResult = await handleDiagnosticReady({ patient_id: 'DEMO-001', test_category: 'Cardiology ECG & Lipid Profile' });
  console.log('Diagnostic Result:', JSON.stringify(diagResult, null, 2));
  if (diagResult.status !== 'DIAGNOSTIC_NOTIFICATION_SENT') throw new Error('Test 9 Failed: Diagnostic notification failed');
  console.log('✅ Test 9 Passed: Non-clinical administrative diagnostic alert dispatched.');

  // TEST 10: Inbound WhatsApp Patient Reply ('1' to Confirm)
  console.log('\n--- [Test 10] Two-Way WhatsApp Inbound Reply (Confirm) ---');
  const confirmReplyResult = await handleInboundPatientMessage({
    fromPhone: '+919999999992', // DEMO-002
    messageBody: '1'
  });
  console.log('Inbound Confirm Result:', JSON.stringify(confirmReplyResult, null, 2));
  if (confirmReplyResult.status !== 'APPOINTMENT_CONFIRMED') throw new Error('Test 10 Failed: Inbound confirmation failed');
  console.log('✅ Test 10 Passed: Patient replied "1", appointment re-confirmed automatically.');

  // TEST 11: Inbound WhatsApp Rating ('5' Star Positive Feedback)
  console.log('\n--- [Test 11] Two-Way WhatsApp Inbound Rating (5 Stars) ---');
  const ratingReplyResult = await handleInboundPatientMessage({
    fromPhone: '+919999999993', // DEMO-003
    messageBody: '5'
  });
  console.log('Inbound Rating Result:', JSON.stringify(ratingReplyResult, null, 2));
  if (ratingReplyResult.status !== 'FEEDBACK_PROCESSED') throw new Error('Test 11 Failed: Inbound rating failed');
  console.log('✅ Test 11 Passed: 5-star rating captured, Google review booster dispatched.');

  // TEST 12: Inbound WhatsApp Emergency Guardrail
  console.log('\n--- [Test 12] Inbound Emergency Symptom Guardrail ---');
  const emergencyReplyResult = await handleInboundPatientMessage({
    fromPhone: '+919999999991', // DEMO-001
    messageBody: 'Experiencing sudden severe chest pain and breathlessness'
  });
  console.log('Emergency Inbound Result:', JSON.stringify(emergencyReplyResult, null, 2));
  if (emergencyReplyResult.status !== 'EMERGENCY_ESCALATED') throw new Error('Test 12 Failed: Inbound emergency not escalated');
  console.log('✅ Test 12 Passed: Inbound medical emergency safely escalated to ER triage.');

  // TEST 13: Scheduled Appointment Reminder Runner
  console.log('\n--- [Test 13] Scheduled Reminder Runner ---');
  const reminderResult = await runAppointmentReminders();
  console.log('Scheduler Run Result:', JSON.stringify(reminderResult, null, 2));
  console.log('✅ Test 13 Passed: Background reminder runner executed cleanly.');

  // TEST 14: Module 3 Pre-Consultation Intake Form
  console.log('\n--- [Test 14] Pre-Consultation Intake Form ---');
  const intakeResult = await handlePreConsultationIntake({
    patient_id: 'DEMO-001',
    appointment_id: 'APPT-DEMO-002',
    chief_complaint: 'Routine follow-up for blood pressure check',
    symptoms_duration: 'Ongoing',
    current_meds: 'Amlodipine 5mg',
    allergies: 'Penicillin'
  });
  console.log('Intake Result:', JSON.stringify(intakeResult, null, 2));
  if (intakeResult.status !== 'INTAKE_SUBMITTED') throw new Error('Test 14 Failed: Intake submission failed');
  console.log('✅ Test 14 Passed: Pre-consultation clinical intake details recorded.');

  // TEST 15: Module 4 Insurance Pre-Verification
  console.log('\n--- [Test 15] Insurance Pre-Verification / TPA ---');
  const insuranceResult = await handleInsurancePreVerification({
    patient_id: 'DEMO-001',
    policy_number: 'STAR-POL-77112',
    insurer_name: 'Star Health',
    tpa_name: 'MediAssist',
    copay_estimate: 250
  });
  console.log('Insurance Result:', JSON.stringify(insuranceResult, null, 2));
  if (insuranceResult.status !== 'INSURANCE_PRE_VERIFIED') throw new Error('Test 15 Failed: Insurance pre-verification failed');
  console.log('✅ Test 15 Passed: Insurance pre-verification processed with cashless pre-approval.');

  // TEST 16: Module 10 OPD Queue Token Generation & Calling
  console.log('\n--- [Test 16] OPD Queue Token System ---');
  const tokenGenResult = await handleGenerateQueueToken({
    patient_id: 'DEMO-001',
    department: 'Cardiology'
  });
  console.log('Token Generation Result:', JSON.stringify(tokenGenResult, null, 2));
  if (tokenGenResult.status !== 'TOKEN_GENERATED') throw new Error('Test 16 Failed: Token generation failed');

  const tokenCallResult = await handleCallNextQueueToken({ department: 'Cardiology' });
  console.log('Token Call Result:', JSON.stringify(tokenCallResult, null, 2));
  if (tokenCallResult.status !== 'TOKEN_CALLED') throw new Error('Test 16 Failed: Token call failed');
  console.log('✅ Test 16 Passed: OPD live token generated, queued, and called to consultation room.');

  // TEST 17: Module 12 Inpatient Admission Pre-Clearance
  console.log('\n--- [Test 17] Inpatient Admission Pre-Clearance ---');
  const admissionResult = await handleAdmissionPreClearance({
    patient_id: 'DEMO-002',
    department: 'Orthopedics',
    room_preference: 'PRIVATE',
    attendant_name: 'Ramesh Kulkarni',
    attendant_phone: '+919999999998'
  });
  console.log('Admission Result:', JSON.stringify(admissionResult, null, 2));
  if (admissionResult.status !== 'ADMISSION_PRE_CLEARED') throw new Error('Test 17 Failed: Admission pre-clearance failed');
  console.log('✅ Test 17 Passed: Inpatient admission pre-clearance logged with room allocation.');

  // TEST 18: Module 16 Chronic Disease Recall
  console.log('\n--- [Test 18] Chronic Care Recall Engine ---');
  const chronicResult = await handleChronicRevisitCheck();
  console.log('Chronic Recall Result:', JSON.stringify(chronicResult, null, 2));
  if (chronicResult.status !== 'CHRONIC_RECALL_EXECUTED') throw new Error('Test 18 Failed: Chronic recall failed');
  console.log('✅ Test 18 Passed: Quarterly chronic review checks identified and recalled.');

  // TEST 19: Module 17 Inactive Patient Reactivation Campaign
  console.log('\n--- [Test 19] Inactive Patient Reactivation Campaign ---');
  const reactResult = await handleInactiveReactivation();
  console.log('Reactivation Result:', JSON.stringify(reactResult, null, 2));
  if (reactResult.status !== 'REACTIVATION_DISPATCHED') throw new Error('Test 19 Failed: Reactivation failed');
  console.log('✅ Test 19 Passed: Inactive patient preventative screening campaign dispatched.');

  // TEST 20: Module 18 Doctor Availability & Slot Management
  console.log('\n--- [Test 20] Doctor Availability Management ---');
  const docResult = await handleDoctorAvailability({ doctor_id: 'DOC-CARD-01', is_available: 0 });
  console.log('Doctor Availability Result:', JSON.stringify(docResult, null, 2));
  if (docResult.status !== 'AVAILABILITY_UPDATED' || docResult.is_available !== false) throw new Error('Test 20 Failed: Availability update failed');
  console.log('✅ Test 20 Passed: Doctor emergency leave / availability toggled and slots blocked.');

  // TEST 21: MCP Tool get_opd_queue_status
  console.log('\n--- [Test 21] MCP Tool get_opd_queue_status ---');
  const opdToolResult = await executeMcpTool('get_opd_queue_status', { department: 'Cardiology' });
  console.log('MCP OPD Status Result:', JSON.stringify(opdToolResult, null, 2));
  if (!opdToolResult.department) throw new Error('Test 21 Failed: MCP tool get_opd_queue_status failed');
  console.log('✅ Test 21 Passed: Live OPD queue metrics returned via Model Context Protocol.');

  console.log('\n=============================================');
  console.log('🎉 ALL 21 TEST SUITES PASSED FLAWLESSLY!');
  console.log('=============================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
