# Hospital Delivery Checklist & Production SOPs
*Sections AK, AL, and AM of Hospital AI Automation Master Blueprint V3*

---

## 1. Delivery Checklist — Pre-Implementation (Section AK)

Before deploying the automation layer to a hospital or clinic client, verify each item:

- [ ] **1. Signed Scope:** Contract / Statement of Work signed with clear deliverables and exclusions.
- [ ] **2. Commercial Advance:** Advance payment (typically 50% for ₹50k/₹100k pilot) collected.
- [ ] **3. Stakeholder Contacts:** Hospital Owner / Medical Director and Designated Technical / Reception Contact assigned.
- [ ] **4. HMS / EMR Details:** Exact HMS product name, version, on-prem vs. cloud deployment identified.
- [ ] **5. API Documentation & Test Credentials:** Vendor API docs, webhook endpoints, sandbox tokens, and rate limits obtained.
- [ ] **6. Approved WhatsApp Provider:** Meta WhatsApp Cloud API or BSP (Wati, Gupshup, Twilio) registered under hospital's official Facebook Business Manager.
- [ ] **7. Meta Message Templates Approved:** Confirmation (`APPT_CONFIRM_01`), Reminder (`APPT_REMINDER_01`), Reschedule (`APPT_RESCHEDULE_01`), and No-Show (`NOSHOW_RECOVERY_01`) submitted and approved by Meta.
- [ ] **8. Test Patient Data:** Synthetic patient profiles agreed upon for pre-production verification.
- [ ] **9. Department / Doctor Mapping:** Exact department names, consultation room numbers, and doctor IDs mapped in database.
- [ ] **10. Calendar / Scheduling Access:** Calendar API permissions or HMS doctor roster access verified.
- [ ] **11. Exception Owner:** Hospital staff member designated to monitor and handle human review escalations.
- [ ] **12. Go-Live Date:** Agreed maintenance window for transition to live traffic.
- [ ] **13. Rollback Plan:** Fallback procedure documented in case of vendor API outage.
- [ ] **14. Staff Training Session:** 60-minute training session scheduled for front-desk and patient coordinators.
- [ ] **15. Maintenance Agreement:** Monthly monitoring and optimization retainer signed.

---

## 2. Production Go-Live Procedure (Section AL)

Follow this 12-step sequence sequentially on go-live day:

```
[Step 1] Freeze the tested workflow version in Make/n8n/Node engine.
   │
[Step 2] Export and back up all scenario configurations and database schemas.
   │
[Step 3] Replace synthetic demo credentials with hospital-approved production API keys.
   │
[Step 4] Confirm webhook URLs, SSL certificates, and security tokens.
   │
[Step 5] Execute 1 controlled test with an internal hospital staff phone number.
   │
[Step 6] Test 1 real-but-authorized patient transaction with staff observing in real time.
   │
[Step 7] Monitor live execution logs and correlation IDs in the operations console.
   │
[Step 8] Confirm WhatsApp message delivery on the recipient handset.
   │
[Step 9] Confirm slot status and lead record write-back into the hospital's HMS/CRM.
   │
[Step 10] Confirm exception alerts trigger if missing fields or emergencies occur.
   │
[Step 11] Formal go-live sign-off with the hospital managing director / owner.
   │
[Step 12] Enter 48-hour hyper-care monitoring period and log all edge cases.
```

---

## 3. Maintenance SOP — Post-Launch Operations (Section AM)

| Cadence | Operational Tasks | Responsible Role |
| :--- | :--- | :--- |
| **Daily (Automated)** | • Monitor error rates and automated failure alerts<br>• Verify webhook delivery health | Automation System / Lead Dev |
| **Weekly** | • Review failed runs and items in Exception Queue<br>• Inspect delivery failure rates and duplicate message blocks<br>• Verify database backup integrity | Ops Coordinator / Agency Lead |
| **Monthly** | • Monthly KPI performance review with hospital management<br>• Meta message template health review and copy adjustments<br>• Credential and API token expiration checks<br>• Prioritize improvement backlog and capacity bottlenecks | Account Lead / Hospital Admin |
| **Quarterly** | • Staff access review and RBAC credential rotation<br>• Workflow version upgrades<br>• Vendor/HMS integration updates review | Technical Architect |

> **Change Log Invariant:** Every single production modification must be recorded with a timestamp, author, reason, and tested rollback plan.
