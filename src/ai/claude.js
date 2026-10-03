import dotenv from 'dotenv';
import { MASTER_SYSTEM_PROMPT, PROMPTS } from './prompts.js';

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AI_PROVIDER = process.env.AI_PROVIDER || 'AUTO';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

/**
 * Universal AI Caller supporting 100% Free Tiers (Gemini Free, Ollama Local, and Fallback)
 */
export async function callClaude(promptType, variables) {
  const promptConfig = PROMPTS[promptType];
  if (!promptConfig) {
    throw new Error(`Unknown prompt type: ${promptType}`);
  }

  const promptText = promptConfig.build(variables);

  // 1. Google Gemini 1.5 Flash (100% Free Tier on Google AI Studio)
  if ((AI_PROVIDER === 'GEMINI' || (!ANTHROPIC_API_KEY && GEMINI_API_KEY)) && GEMINI_API_KEY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: MASTER_SYSTEM_PROMPT }]
          },
          contents: [
            { role: 'user', parts: [{ text: promptText }] }
          ],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.1
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const clean = rawText.replace(/```json\s*|\s*```/g, '').trim();
        return JSON.parse(clean);
      } else {
        const errText = await response.text();
        console.warn(`⚠️ Gemini API error (${response.status}): ${errText}. Using fallback.`);
      }
    } catch (err) {
      console.warn(`⚠️ Gemini call error: ${err.message}. Using fallback.`);
    }
  }

  // 2. Ollama Local LLM (100% Free, Offline, Infinite Tokens)
  if (AI_PROVIDER === 'OLLAMA') {
    try {
      const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          system: MASTER_SYSTEM_PROMPT,
          prompt: promptText,
          format: 'json',
          stream: false
        })
      });

      if (response.ok) {
        const data = await response.json();
        return JSON.parse(data.response);
      }
    } catch (err) {
      console.warn(`⚠️ Ollama not reachable at ${OLLAMA_HOST}: ${err.message}. Using fallback.`);
    }
  }

  // 3. Anthropic Claude API (If key configured)
  if (ANTHROPIC_API_KEY && ANTHROPIC_API_KEY.startsWith('sk-ant')) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
          max_tokens: 1000,
          system: MASTER_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: promptText }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.content?.[0]?.text || '{}';
        const cleanJson = content.replace(/```json\s*|\s*```/g, '').trim();
        return JSON.parse(cleanJson);
      }
    } catch (err) {
      console.warn(`⚠️ Claude API error: ${err.message}. Using fallback.`);
    }
  }

  // 4. Built-in Deterministic Simulation Engine (100% Free, 0 keys needed)
  return runFallbackEngine(promptType, variables);
}

/**
 * Deterministic Rule-Based Engine implementing Blueprint invariants
 */
function runFallbackEngine(promptType, vars) {
  switch (promptType) {
    case 'LEAD_QUALIFICATION': {
      const text = (vars.enquiry_text || '').toLowerCase();
      const explicitDept = vars.department || '';

      const emergencyKeywords = ['emergency', 'chest pain', 'heart attack', 'severe bleeding', 'breathing', 'unconscious', 'dying', 'suicide'];
      const isEmergency = emergencyKeywords.some(kw => text.includes(kw));

      let department = explicitDept;
      if (!department || department === 'NEEDS_HUMAN_REVIEW') {
        if (text.includes('skin') || text.includes('rash') || text.includes('acne') || text.includes('hair') || text.includes('derma')) {
          department = 'Dermatology';
        } else if (text.includes('heart') || text.includes('chest') || text.includes('ecg') || text.includes('bp') || text.includes('cardio')) {
          department = 'Cardiology';
        } else if (text.includes('bone') || text.includes('fracture') || text.includes('joint') || text.includes('knee') || text.includes('ortho')) {
          department = 'Orthopedics';
        } else {
          department = 'General Medicine';
        }
      }

      const missing = [];
      if (!vars.full_name) missing.push('full_name');
      if (!vars.phone) missing.push('phone');

      return {
        department: isEmergency ? 'NEEDS_HUMAN_REVIEW' : department,
        enquiry_type: isEmergency ? 'EMERGENCY_ESCALATION' : 'consultation_booking',
        patient_status: 'new',
        priority_for_human_review: isEmergency ? 'review' : 'normal',
        missing_information: missing,
        reason: isEmergency 
          ? 'Clinical emergency or high-risk keywords detected in enquiry text.'
          : `Classified as ${department} based on inquiry text and selected department.`
      };
    }

    case 'APPOINTMENT_MESSAGE': {
      const hospital = vars.hospital_name || 'DemoCare Multispeciality Hospital';
      const contact = vars.hospital_contact || '+91 22 5550 1234';
      return {
        status: 'READY',
        message: `Hello ${vars.patient_name}, your appointment with ${vars.doctor_name} (${vars.department}) at ${hospital} is confirmed for ${vars.confirmed_slot}. For assistance or rescheduling, contact ${contact}.`
      };
    }

    case 'NOSHOW_RECOVERY': {
      const hospital = vars.hospital_name || 'DemoCare Multispeciality Hospital';
      const link = vars.reschedule_link_or_options || 'https://democare.hospital/reschedule';
      return {
        status: 'READY',
        message: `Hello ${vars.patient_name}, we missed you today for your scheduled consultation at ${hospital}. We hope everything is well. If you would like to reschedule your consultation, please pick a convenient slot here: ${link}`
      };
    }

    case 'FOLLOWUP_TASK': {
      return {
        task_title: `Post-Care Administrative Check-in: ${vars.category || 'Discharge follow-up'}`,
        due_date: vars.approved_followup_date || new Date(Date.now() + 86400000).toISOString().split('T')[0],
        owner: vars.owner || 'Patient Care Coordinator',
        status: 'READY'
      };
    }

    case 'DAILY_SUMMARY': {
      const metrics = vars.metrics_json || {};
      const newLeads = metrics.new_leads || 0;
      const booked = metrics.booked_appointments || 0;
      const noShows = metrics.no_shows || 0;
      const recovered = metrics.recovered_no_shows || 0;
      const exceptions = metrics.open_exceptions || 0;

      return {
        headline: `Daily Operations: ${newLeads} leads processed, ${booked} appointments confirmed, ${recovered}/${noShows} no-shows recovered.`,
        wins: [
          `Lead-to-booking conversion rate at ${newLeads > 0 ? Math.round((booked / newLeads) * 100) : 0}%`,
          `Recovered ${recovered} missed patient slots without manual staff calls`
        ],
        exceptions: exceptions > 0 ? [`${exceptions} items pending manual review in Exception Queue`] : ['Zero unhandled exceptions'],
        overdue_items: [],
        questions_for_management: [
          'Review peak morning slot allocation for Cardiology and Dermatology.'
        ]
      };
    }

    case 'EXCEPTION_CLASSIFIER': {
      const isDuplicateRisk = vars.failed_step?.includes('message') || vars.failed_step?.includes('booking');
      return {
        severity: isDuplicateRisk ? 'high' : 'medium',
        safe_to_retry: !isDuplicateRisk,
        human_review_required: isDuplicateRisk,
        reason: isDuplicateRisk 
          ? 'Action could send duplicate patient messages or double-book slot without manual confirmation.'
          : 'Transient failure or missing metadata.',
        recommended_action: isDuplicateRisk 
          ? 'Inspect communication log and manually confirm status before retry.'
          : 'Retry step after verifying network/endpoint availability.'
      };
    }

    default:
      return { status: 'NEEDS_HUMAN_REVIEW', reason: 'Unrecognized prompt type' };
  }
}
