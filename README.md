# 🏥 Hospital AI Automation Master Blueprint — V3

A complete implementation of the **Hospital Revenue & Patient Lifecycle Automation Layer** based on the architecture by *The Sunday Club* (`@imthatyogii`).

This system connects inbound patient channels, AI qualification, appointment booking, WhatsApp notifications, no-show recovery, and discharge follow-ups around an existing Hospital Management System (HMS/EMR).

---

## ⚡ Quick Start

### 1. Run the System
```bash
# Seed the DemoCare Multispeciality Hospital database
npm run seed

# Run the full automated test suite (Tests all 3 workflows, guardrails & MCP tools)
npm run test:workflows

# Start the live web server
npm start
```

### 2. Access the Live Interfaces
* **Patient Inbound Booking Portal:** [http://localhost:3000/](http://localhost:3000/)
* **Hospital Operations & KPI Dashboard:** [http://localhost:3000/admin](http://localhost:3000/admin)
* **Lead Intake Webhook:** `POST http://localhost:3000/webhook/lead-intake`

---

## 📁 System Architecture & Directory Structure

```
├── Hospital AI Automation.pdf   # Original 16-page Master Blueprint V3
├── package.json                 # Node.js ESM configuration
├── hospital.db                  # Local SQLite database with all 8 entities
├── src/
│   ├── db/
│   │   ├── schema.sql           # Schema for all 8 entities + DemoCare facility
│   │   ├── index.js             # Native node:sqlite database engine
│   │   └── seed.js              # 12 doctors, 10 slots, test patients DEMO-001..003
│   ├── ai/
│   │   ├── prompts.js           # Master System Prompt + Prompts 1 through 6
│   │   └── claude.js            # Claude 3.5 Sonnet client + Fallback Simulator
│   ├── workflows/
│   │   └── engine.js            # Workflows 1 (Lead), 2 (No-Show), 3 (Discharge)
│   ├── mcp/
│   │   └── tools.js             # 3 Model Context Protocol tools (Section V)
│   └── server.js                # Express API & Webhook server
├── public/
│   ├── index.html               # Public patient consultation intake form
│   ├── admin.html               # Operational KPI & Action Center dashboard
│   └── styles.css               # Glassmorphic, modern healthcare UI
├── integrations/
│   └── n8n-workflow-lead-intake.json # Ready-to-import n8n workflow
└── sales-kit/
    ├── demo_video_shotlist.md   # 11-shot public demo video script
    ├── cold_outreach_and_scripts.md # DMs, cold emails, discovery & objection scripts
    ├── hospital_automation_audit_scorecard.md # 11-point paid audit scorecard
    ├── client_proposal_template.md # 17-section hospital client proposal
    └── prospect_list_50_template.csv # 50-prospect tracking sheet
```

---

## 🛡️ Invariant AI Guardrails (Section G)
* **Strictly Administrative:** No autonomous diagnosis, medication changes, or clinical triage.
* **Clinical Safety Escalation:** Any emergency symptoms (e.g. chest pain, breathing difficulty) automatically escalate to the human review exception queue (`status: ESCALATED_TO_HUMAN`).
* **Idempotency Protection:** Prevents duplicate WhatsApp recovery messages or double-booking of doctor slots.

---

## 👤 Division of Responsibilities

### What is Already Built (Automated):
1. Complete database with all 8 entities & synthetic DemoCare hospital data.
2. End-to-end workflows for Lead Intake, No-Show Recovery, and Discharge Follow-up.
3. Strict medical AI guardrails with pure JSON outputs.
4. Interactive public patient intake form and real-time operations dashboard.
5. All sales assets, audit scorecards, proposal templates, and video scripts.

### What You Must Do Manually:
1. **API Keys (Optional for live Claude):** Add your `ANTHROPIC_API_KEY` to `.env` if you want live Claude API calls (otherwise the built-in fallback simulator handles all prompts seamlessly).
2. **Meta WhatsApp Business Setup:** Register a Meta Developer App and submit message templates (`APPT_CONFIRM_01`, `NOSHOW_RECOVERY_01`) when deploying to a real hospital.
3. **Record the Public Demo Video:** Follow `sales-kit/demo_video_shotlist.md` to record the 11-shot walkthrough on camera.
4. **Outreach & Discovery:** Use `sales-kit/prospect_list_50_template.csv` and `sales-kit/cold_outreach_and_scripts.md` to contact 50 local clinics and book discovery calls.
