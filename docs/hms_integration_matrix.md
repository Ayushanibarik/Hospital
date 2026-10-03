# HMS / EMR Integration Discovery & Architecture Matrix
*Sections X & Y of Hospital AI Automation Master Blueprint V3*

Connecting to a hospital's Hospital Management System (HMS) or Electronic Medical Records (EMR) requires rigorous discovery. Never make assumptions about API availability.

---

## 1. Integration Discovery Protocol (Section X)

Before writing any integration code:
1. **Identify the HMS Product & Architecture:**
   * Product Name & Version (e.g. Practo Ray, KareXpert, MocDoc, Clinicea, Custom In-House).
   * Deployment Model: Cloud-hosted SaaS vs. On-Premise local server.
2. **Request Official Vendor Documentation:**
   * REST API / SOAP documentation.
   * Webhook event availability (Does the HMS emit events when an appointment is booked or marked `no_show`?).
   * Sandbox / staging environment credentials.
   * API rate limits and throttling thresholds.
3. **Determine Read / Write Permissions:**
   * Can we programmatically write appointments back, or only read open slots?
   * If only read-access exists, an assisted handoff (automated WhatsApp alert to reception desk to manually lock the slot) is preferred over fragile screen-scraping.
4. **Fallback for Legacy Systems Without APIs:**
   * Implement automated SFTP / CSV export-import scheduled every 30 minutes.
   * Or deploy a human-operated verification handoff queue.

---

## 2. Master Integration Matrix (Section Y)

| System | Trigger Event | Direction | Data Transmitted | Authentication | System Owner | Production Test Status |
| :--- | :--- | :---: | :--- | :--- | :--- | :---: |
| **HMS / EMR** | `Appointment Created` | `HMS ──► Automation` | `appointment_id`, `patient_id`, `slot_time`, `doctor_id` | Vendor API Key / Bearer Token | HMS Vendor / IT Lead | 🟡 Pending Vendor Access |
| **Hospital CRM** | `Lead Created / Qualified` | `Automation ──► CRM` | `lead_id`, `patient_id`, `source`, `department`, `priority` | REST API Key / Basic Auth | Hospital Marketing Lead | 🟡 Pending Staging Setup |
| **WhatsApp Provider** | `Send Message` | `Automation ──► Meta/BSP` | `phone_number`, `template_name`, `language`, `variables[]` | Bearer Token (Meta Cloud API / BSP) | Hospital Administrator | 🟢 Sandbox Tested |
| **Doctor Calendar** | `Slot Lookup & Hold` | `Automation ──► Calendar` | `doctor_id`, `department`, `date_range`, `duration` | OAuth 2.0 / HMS API Token | Clinic Ops Lead | 🟢 Local Mock Verified |
| **Billing / ERP** | `Payment Receipt Logged` | `Billing ──► Automation` | `invoice_id`, `patient_id`, `amount`, `payment_status` | Webhook Secret Key | Hospital Accounts Head | ⚪ Future Phase |

---

## 3. Security & Safety Invariants
* **Zero Credential Exposure:** Never hardcode vendor credentials in scenario descriptions or AI prompts. All keys live in secure platform key vaults.
* **Idempotency Requirement:** Every write event to the HMS must include a deduplication key (`appointment_id` or `phone + normalized_timestamp`) to prevent duplicate slot bookings.
