# 🏗️ Hospital AI Automation: Comprehensive Backend Master Plan
*Architectural Blueprint & Transition Guide (Master Blueprint V3)*

---

## 1. Why Did `Cannot GET /admin` Happen?

When an Express server serves a static directory (`public/`), it looks for exact file matches:
* If you go to `/`, Express automatically serves `public/index.html`.
* But when you requested `/admin`, Express looked for a folder named `public/admin/` with an `index.html` inside it. Because the file was named `public/admin.html`, Express didn't know how to map `/admin` without an explicit route alias, throwing a standard 404 `Cannot GET /admin`.
* **Fix Applied:** We added an explicit route `app.get('/admin', (req, res) => res.sendFile('public/admin.html'))` and enabled `{ extensions: ['html'] }`. It now returns **200 OK**.

---

## 2. Complete Backend Architecture (Master Document Spec)

According to the 16-page Master Blueprint, the backend is **not a monolithic hospital system (HMS)**, but a **High-Speed Patient Lifecycle & Revenue Automation Layer** wrapped around existing clinical software.

The backend consists of **6 Core Architectural Engines**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      1. CHANNEL INGESTION LAYER                        │
│  • POST /webhook/lead-intake         • POST /webhook/no-show-recovery  │
│  • POST /webhook/discharge-followup  • POST /webhook/diagnostic-ready  │
│  • POST /api/appointments/:id/reschedule • POST /api/feedback         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                    2. AI QUALIFICATION & GUARDRAILS                    │
│  • Master System Prompt (Strict Non-Clinical Administrative Assistant) │
│  • Clinical Emergency Escalation Guardrail (Chest pain, breathing, etc)│
│  • Structured JSON Output Parser (Prompts 1 to 6)                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                     3. DATA & IDEMPOTENCY LAYER                        │
│  • 8 Normalized Relational Tables (Patients, Leads, Appointments, etc) │
│  • Deduplication Keys (Prevents double messaging & slot collisions)    │
│  • Correlation ID Tracing: HOSP-YYYYMMDD-XXXXXX                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                  4. MESSAGING & NOTIFICATION ENGINE                    │
│  • Meta WhatsApp Cloud API / WhatsApp Web QR Bridge Engine             │
│  • Pre-approved Templates: APPT_CONFIRM_01, NOSHOW_RECOVERY_01, etc.   │
│  • Delivery Tracking & Communication Logs                              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                  5. CLOSED-LOOP RETENTION ENGINE                       │
│  • Automatic No-Show Recovery Engine                                   │
│  • Post-Discharge Scheduled Follow-up                                  │
│  • Automated Service Recovery (Escalates rating <= 2/5 to head nurse)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                   6. OPS INTELLIGENCE & AUDIT LAYER                    │
│  • Real-Time Operations REST API (/api/dashboard/...)                  │
│  • Centralized Exception Queue with 1-click Resolution                 │
│  • Automated Executive Daily Management Summary (Prompt 5)             │
│  • 3 Model Context Protocol (MCP) Tool Endpoints                       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. The 8 Required Database Schemas (Section E)

| Table | Purpose | Invariant Rules |
| :--- | :--- | :--- |
| `patients` | Master patient demographic registry | Normalized phone number, explicit consent status (`CONSENTED`). |
| `leads` | Inbound commercial inquiries | Tracks channel source (Meta/Google), campaign, priority, and first response time. |
| `appointments` | Booked consultation slots | Linked to doctor and department. Tracks attendance (`scheduled`, `attended`, `no_show`). |
| `follow_ups` | Scheduled check-in tasks | Category (`post_discharge`, `no_show_recovery`), approved window, attempt counter. |
| `diagnostic_tasks` | Lab / Radiology task tracker | Tracks order time, completion, doctor review status, and notification dispatch. |
| `communication_logs`| WhatsApp / SMS message history | Deduplication key (`appointment_id + template_name`), delivery status, correlation ID. |
| `exceptions` | Central operational queue | Any emergency symptoms, failed API calls, or 1-star patient ratings route here. |
| `audit_logs` | Immutable audit trail | Actor type (`SYSTEM`, `AI_AGENT`, `STAFF`), timestamp, correlation ID. Required for NABH. |

---

## 4. Paid vs. Free Transition Matrix

Here is the exact comparison of what we run **right now for ₹0** versus what is deployed **once a paying hospital client is closed**:

| Architectural Component | Free / Development Stack (Now) | Production Stack (When Client Pays) | Who Pays for What? |
| :--- | :--- | :--- | :--- |
| **Backend Runtime** | Node.js Express Server on Localhost (`http://localhost:3000`) | Containerized Docker container on AWS / DigitalOcean / Oracle Cloud | **Client covers** ₹500–₹1,500/mo server hosting. |
| **Database** | Embedded SQLite (`hospital.db`) | Hosted PostgreSQL (Supabase / AWS RDS) or direct hospital HMS database | **Client covers** managed DB or uses on-prem HMS. |
| **AI / LLM Layer** | Built-in Intelligent Simulator (Active, ₹0) or Google Gemini Free Tier | Anthropic Claude 3.5 Sonnet / Azure OpenAI HIPAA-compliant endpoint | **Client covers** API token costs (~₹500/mo for 1,000 inquiries). |
| **WhatsApp Gateway** | WhatsApp Web QR Bridge (Sends real messages from demo phone for ₹0) | Official Meta WhatsApp Business Cloud API under Hospital's Facebook Business Manager | **Client covers** Meta utility conversation charges (First 1,000 chats are free anyway). |
| **Public Webhooks** | Cloudflare Tunnel (`cloudflared`) | Dedicated Domain with Cloudflare SSL (`api.clienthospital.com`) | **Client covers** domain DNS or uses hospital subdomain. |
| **HMS Integration** | Mock DemoCare multispeciality doctor calendar & slot hold | Vendor REST API / Webhook integration (Practo Ray, KareXpert, MocDoc) | **Client IT** provides vendor API keys & access. |
| **Frontend Dashboard** | Glassmorphic Dark UI ([http://localhost:3000/admin](http://localhost:3000/admin)) | Hospital branded dashboard with Clinic Logo & Role-Based Access Control | **Included** in your ₹50,000 / ₹1,00,000 setup fee! |

---

## 5. Client Transition Workflow: How to Switch When Signed

When you sign a hospital client:
1. **Commercial:** Collect 50% advance (e.g. ₹25,000 of ₹50,000 pilot).
2. **HMS Credentials:** Ask hospital IT for their HMS vendor contact and API documentation (using [`docs/hms_integration_matrix.md`](file:///a:/blobs/HospitalAiAutomation/docs/hms_integration_matrix.md)).
3. **WhatsApp Business Account:** Guide hospital admin to verify their Facebook Business Manager and create a WhatsApp Cloud API phone number.
4. **Environment Variables:** Update `.env` with production keys:
   ```ini
   DATABASE_URL=postgres://...
   WHATSAPP_API_TOKEN=EAAG...
   WHATSAPP_PHONE_NUMBER_ID=1029384756...
   ```
5. **Go-Live:** Execute the 12-step go-live procedure in [`delivery/delivery_checklist_and_sop.md`](file:///a:/blobs/HospitalAiAutomation/delivery/delivery_checklist_and_sop.md).
6. **Handover:** Train reception staff (1 hour) and activate monthly ₹15,000 retainer.
