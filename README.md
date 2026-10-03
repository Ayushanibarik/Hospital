# 🏥 Healthcare Revenue & Patient Lifecycle Automation Layer

An intelligent, non-clinical automation system designed to eliminate patient leakage, reduce appointment no-shows, optimize in-hospital flow, and streamline communication between patients and hospital departments.

---

## 🌟 Key Capabilities

### 1. Inbound Patient Intake & Intelligent Triage (Modules 1 & 2)
- Multi-channel capture (Meta Ads, Google, Website, Inbound WhatsApp).
- Administrative triage and department routing (Cardiology, Dermatology, Orthopedics, General Medicine).
- Real-time slot availability check and instant booking confirmation.

### 2. Clinical Safety Guardrails (Zero-Liability Architecture)
- **Strictly Administrative:** No autonomous clinical diagnosis, medication advice, or medical triage.
- **Emergency Escalation:** Medical emergency keywords (e.g. chest pain, breathing difficulty, acute trauma) automatically trigger immediate escalation to emergency staff and route to the Centralized Exception Queue.

### 3. Two-Way Interactive WhatsApp Communication (Modules 5 & 6)
- Instant booking confirmations with calendar details.
- Conversational reply handling:
  - `1` / `YES`: Automatically re-confirms scheduled appointments.
  - `2` / `RESCHEDULE`: Instantly re-allocates next available calendar slot.
  - `1-5`: Captures post-consultation CSAT rating.

### 4. Automated Reminders & Idempotent No-Show Recovery (Modules 7, 8 & 9)
- Automated T-24h and T-3h appointment reminders.
- Automatic no-show detection and polite rebooking loop with deduplication protection.

### 5. In-Hospital OPD Flow & Token Queue Management (Module 10)
- Live OPD queue token generation for waiting room displays.
- WhatsApp token notifications with real-time patient count ahead and estimated wait times.
- 1-click consultation room calling for doctors and nursing stations.

### 6. Diagnostics, Admissions & Post-Discharge Care (Modules 11, 12, 13 & 15)
- Non-clinical diagnostic ready alerts (alerting patients when lab reports are reviewed).
- Inpatient admission pre-clearance and room preference registration.
- Day 1 / Day 3 post-discharge check-ins and recovery feedback.
- Automated Service Recovery: Low CSAT ratings ($\le 2/5$) immediately route to Patient Relations and Head Nurses.

### 7. Chronic Disease Management & Revisit Scheduling (Module 16)
- Automated quarterly tracking for hypertension, diabetes, and cardiovascular care.
- Automated recall notifications to encourage routine reviews and prevent treatment discontinuation.

### 8. Executive Operations Intelligence & MCP Support (Module 20)
- Real-time KPI operations dashboard displaying lead-to-booking conversion, attendance, and message delivery.
- Automated AI Daily Management Briefing summarizing daily wins, exceptions, and revenue impact.
- Standardized Model Context Protocol (MCP) server endpoints.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18.0.0 or higher
- npm 9.0.0 or higher

### Installation & Launch
```bash
# 1. Install dependencies
npm install

# 2. Initialize and seed DemoCare hospital facility database
npm run seed

# 3. Execute the automated workflow test suite (21 test suites)
npm run test:workflows

# 4. Start the server
npm start
```

### Live Portals
- **Patient Portal & Inbound Booking:** [http://localhost:3000/](http://localhost:3000/)
- **Operations & Control Dashboard:** [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 🛠️ API & Webhook Endpoints

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/webhook/lead-intake` | `POST` | Inbound commercial enquiry qualification and auto-booking |
| `/webhook/whatsapp` | `POST` | Meta WhatsApp Cloud API two-way inbound patient messaging |
| `/webhook/no-show-recovery` | `POST` | Idempotent no-show detection and re-engagement trigger |
| `/webhook/diagnostic-ready`| `POST` | Administrative notification dispatch for completed lab tests |
| `/api/intake/pre-consultation` | `POST` | Pre-consultation symptom and medical history submission |
| `/api/insurance/pre-verify` | `POST` | Cashless TPA insurance pre-clearance intake |
| `/api/queue/token` | `POST` | Generate real-time OPD token and dispatch WhatsApp slip |
| `/api/queue/call-next` | `POST` | Call next waiting patient to doctor consultation chamber |
| `/api/admission/pre-clearance` | `POST` | Inpatient admission pre-clearance registration |
| `/api/chronic/check-ins` | `POST` | Trigger quarterly chronic disease review recall engine |
| `/api/scheduler/run-reminders` | `POST` | Background T-24h & T-3h automated reminder scanner |
| `/api/dashboard/metrics` | `GET` | Aggregated operational KPIs and recovery statistics |
| `/api/dashboard/ai-summary` | `GET` | AI-generated executive daily operations briefing |
| `/api/mcp/tools` | `GET` | Model Context Protocol tool schema discovery |

---

## 🔒 Security, Consent & Data Governance
- Strict consent verification (`CONSENTED` requirement before outbound contact).
- Correlation ID tracing (`HOSP-YYYYMMDD-XXXXXX`) across all communication and audit logs.
- Immutable audit logging for system, AI, and staff actions.
- Administrative isolation ensuring clinical health records remain protected within the hospital's primary HMS/EMR.

---

## 📄 License
MIT License.
