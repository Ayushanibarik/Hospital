# ABDM & NABH Healthcare Compliance & Governance Guide
*Section AR & AS of Hospital AI Automation Master Blueprint V3*

When deploying this automation layer to Indian hospitals, multispeciality clinics, and healthcare enterprises, strict adherence to national digital health standards is mandatory.

---

## 1. Ayushman Bharat Digital Mission (ABDM) Integration Boundary

ABDM creates an open, interoperable digital health ecosystem across India. The automation layer connects to these building blocks as a specialized integration scope:

### The 5 Core Building Blocks:
1. **ABHA (Ayushman Bharat Health Account):**
   * 14-digit unique health identifier for patients.
   * *Automation Role:* Optional collection and validation of patient ABHA number during the digital intake or WhatsApp onboarding stage.
2. **HFR (Health Facility Registry):**
   * Verified digital identity of the hospital/clinic facility.
   * *Automation Role:* Ensures outbound communication templates and receipts carry the verified HFR identifier.
3. **HPR (Healthcare Professionals Registry):**
   * Verified identity of doctors and consultants.
   * *Automation Role:* Maps consultation slots in `available_slots` to verified HPR registration IDs.
4. **PHR (Personal Health Record App):**
   * Patient-facing records locker.
   * *Automation Role:* Transmitting appointment receipts or diagnostic readiness links via consent-based protocols.
5. **UHI (Unified Health Interface):**
   * Open network protocol (similar to UPI for payments) allowing patients to discover doctors and book appointments across different apps.

> [!IMPORTANT]
> **Consent-First Architecture:** ABDM requires consent-driven data sharing. Never query or transmit clinical records without an explicit OTP/consent artifact.

---

## 2. National Accreditation Board for Hospitals (NABH) Digital Standards

To maintain NABH hospital accreditation, this automation layer implements five operational guardrails:

1. **Strict Data Minimization:**
   * Only transmission of **operational metadata** (Patient Name, Phone, Doctor Name, Slot Time, Department).
   * **Zero clinical notes**, diagnostic report findings, or prescriptions are passed through public cloud webhooks or unencrypted third-party channels.
2. **Deterministic Audit Logs (Section E):**
   * Every automation execution logs to `audit_logs` with a unique `correlation_id` (`HOSP-YYYYMMDD-XXXXXX`), actor type (`SYSTEM`, `AI_AGENT`, `STAFF`), and exact timestamp.
3. **Clinical Safety Boundary & Human Fallback:**
   * AI agents are strictly forbidden from autonomous triage, drug recommendations, or diagnosis.
   * Inbound queries containing acute clinical or emergency keywords are immediately diverted to the human review exception queue.
4. **Role-Based Access Control (RBAC):**
   * Operations staff access only their assigned departmental queue (Cardiology, Dermatology, Orthopedics, General Medicine).
5. **Idempotent Communication:**
   * Prevents spamming patients with duplicate reminders or erroneous appointment alerts.
