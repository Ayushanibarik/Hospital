/**
 * ============================================================================
 * MODULE: AI Prompts & Guardrails Specification (src/ai/prompts.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Contains the exact verbatim Master System Prompt (Section H) and structured prompt
 *   templates for Prompts 1 through 6. Enforces non-clinical administrative boundaries,
 *   emergency human review escalation, and deterministic JSON schemas.
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Blueprint V3: Section G (AI Guardrails)
 *   - Blueprint V3: Section H (Master System Prompt - Verbatim)
 *   - Blueprint V3: Section I (Prompt 1 — Lead Qualification)
 *   - Blueprint V3: Section J (Prompt 2 — Appointment Message)
 *   - Blueprint V3: Section K (Prompt 3 — No-Show Recovery)
 *   - Blueprint V3: Section L (Prompt 4 — Follow-Up Task)
 *   - Blueprint V3: Section M (Prompt 5 — Daily Management Summary)
 *   - Blueprint V3: Section N (Prompt 6 — Error / Exception Classifier)
 *
 * PACKAGES & DEPENDENCIES:
 *   - Pure ES Module (zero external dependencies)
 *
 * KEY EXPORTS:
 *   - MASTER_SYSTEM_PROMPT                 : Canonical administrative system prompt
 *   - PROMPTS                              : Object containing Prompts 1 through 6
 *
 * SYSTEM USAGE & INTEGRATION:
 *   - Imported by src/ai/claude.js to build system and user prompts.
 * ============================================================================
 */

export const MASTER_SYSTEM_PROMPT = `You are an administrative automation assistant for a hospital or clinic.
MISSION
Process approved administrative workflows accurately and safely.
YOU MAY
- classify patient enquiries into an administrative department/category
- extract structured fields from supplied text
- draft approved administrative messages
- summarize operational metrics
- create or recommend administrative follow-up tasks
- select an approved tool when the workflow explicitly allows tool use
YOU MUST NOT
- diagnose a patient
- recommend treatment
- change medication
- interpret clinical results
- make clinical triage decisions
- invent appointment slots
- invent patient facts
- expose information that is not necessary for the requested action
DATA RULES
1. Use only facts present in the input or returned by approved tools.
2. If information is missing, return NEEDS_HUMAN_REVIEW.
3. If a request is clinical, return NEEDS_HUMAN_REVIEW.
4. Never create an appointment unless the scheduling system confirms the slot.
5. Log the workflow name and correlation_id when provided.
OUTPUT
Return only the JSON schema requested by the workflow. No markdown. No extra commentary.`;

export const PROMPTS = {
  LEAD_QUALIFICATION: {
    name: 'PROMPT_LEAD_01',
    build: ({ full_name, phone, department, enquiry_text, source }) => `
TASK
Classify this incoming hospital enquiry.

INPUT
name: ${full_name || ''}
phone: ${phone || ''}
department_selected: ${department || ''}
enquiry_text: ${enquiry_text || ''}
source: ${source || ''}

RETURN JSON
{
  "department": "",
  "enquiry_type": "",
  "patient_status": "new|existing|unknown",
  "priority_for_human_review": "normal|review",
  "missing_information": [],
  "reason": ""
}

RULES
- Do not diagnose.
- Do not recommend treatment.
- If the enquiry contains a clinical emergency or clinical question, set priority_for_human_review=review.
- Do not invent a department. If uncertain, use "NEEDS_HUMAN_REVIEW".
`
  },

  APPOINTMENT_MESSAGE: {
    name: 'APPT_CONFIRM_01',
    build: ({ patient_name, department, doctor_name, confirmed_slot, hospital_name, hospital_contact }) => `
TASK
Draft a short administrative appointment confirmation.

FACTS
patient_name: ${patient_name || ''}
department: ${department || ''}
doctor_name: ${doctor_name || ''}
confirmed_slot: ${confirmed_slot || ''}
hospital_name: ${hospital_name || 'DemoCare Multispeciality Hospital'}
hospital_contact: ${hospital_contact || '+91 22 5550 1234'}

RULES
- Use only the supplied facts.
- Do not add clinical advice.
- Do not change the date/time.
- Keep it concise.
- Return JSON:
{
  "status": "READY|NEEDS_HUMAN_REVIEW",
  "message": ""
}
`
  },

  NOSHOW_RECOVERY: {
    name: 'NOSHOW_RECOVERY_01',
    build: ({ patient_name, appointment_date, hospital_name, reschedule_link_or_options }) => `
TASK
Draft an administrative rescheduling message.

FACTS
patient_name: ${patient_name || ''}
appointment_date: ${appointment_date || ''}
hospital_name: ${hospital_name || 'DemoCare Multispeciality Hospital'}
reschedule_link_or_options: ${reschedule_link_or_options || 'https://democare.hospital/reschedule'}

RULES
- Do not mention medical reasons.
- Do not pressure the patient.
- Do not invent availability.
- Ask whether they would like to reschedule.
- Return JSON with status and message.
{
  "status": "READY|NEEDS_HUMAN_REVIEW",
  "message": ""
}
`
  },

  FOLLOWUP_TASK: {
    name: 'PROMPT_FOLLOWUP_01',
    build: ({ patient_id, approved_followup_date, category, owner }) => `
TASK
Create an administrative follow-up task from an approved hospital instruction.

FACTS
patient_id: ${patient_id || ''}
approved_followup_date: ${approved_followup_date || ''}
category: ${category || ''}
owner: ${owner || 'Patient Care Coordinator'}

RETURN JSON
{
  "task_title": "",
  "due_date": "",
  "owner": "",
  "status": "READY|NEEDS_HUMAN_REVIEW"
}

RULES
- Do not infer a medical schedule.
`
  },

  DAILY_SUMMARY: {
    name: 'PROMPT_SUMMARY_01',
    build: ({ metrics_json }) => `
TASK
Summarize only the supplied operational metrics.

INPUT
${JSON.stringify(metrics_json, null, 2)}

RETURN JSON
{
  "headline": "",
  "wins": [],
  "exceptions": [],
  "overdue_items": [],
  "questions_for_management": []
}

RULES
- Do not infer clinical conclusions.
- Do not invent metrics.
`
  },

  EXCEPTION_CLASSIFIER: {
    name: 'PROMPT_EXCEPTION_01',
    build: ({ workflow, failed_step, error, record_id }) => `
TASK
Classify an automation failure.

INPUT
workflow: ${workflow || ''}
failed_step: ${failed_step || ''}
error: ${error || ''}
record_id: ${record_id || ''}

RETURN JSON
{
  "severity": "low|medium|high",
  "safe_to_retry": true,
  "human_review_required": false,
  "reason": "",
  "recommended_action": ""
}

RULES
- Never recommend an automatic retry for an action that could duplicate a patient message, appointment, payment or other high-impact action unless idempotency is confirmed.
`
  }
};
