/**
 * ============================================================================
 * MODULE: Enterprise ERP & Compliance API Routes (src/enterprise/routes.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Unified Express Router aggregating all enterprise and Indian regulatory
 *   compliance endpoints across Phases 1 through 5.
 * ============================================================================
 */

import express from 'express';
import { db } from '../db/index.js';

// Phase 1: RBAC, MPI, Multi-Site
import { login, logout, createUser, getRoles, requirePermission, authenticateToken } from './rbac.js';
import { searchDuplicatePatients, mergePatients, unmergePatients } from './mpi_service.js';
import { createSite, getSites, updateSite, createTariff, getTariffs, createItem, getItems } from './multi_site.js';

// Phase 2: Regulatory Compliances
import { generateAbhaOtp, verifyAbhaOtpAndCreate, verifyExistingAbha, registerHprDoctor, lookupHpr, initiateHiuRequest, handleHipShareRequest } from '../compliance/abdm_gateway.js';
import { recordConsent, withdrawConsent, getPatientConsents, requestDataErasure, executeDataErasure, getPatientAccessLogs } from '../compliance/dpdp_engine.js';
import { searchClinicalCodes, recordDiagnosis, getPatientDiagnoses } from '../compliance/ehr_coding.js';
import { calculateGst, generateGstInvoice, getGstInvoice } from '../compliance/gst_engine.js';
import { recordQualityIndicator, getQualityDashboard, recordEquipmentCalibration, getCalibrationStatus, generateAuditReport } from '../compliance/nabh_quality.js';
import { recordPcpndtFormF, getPcpndtRegister, recordMtpEntry, getMtpRegister, recordBirthOrDeathEvent, markEventNotificationSent, getBirthDeathRecords } from '../compliance/statutory_forms.js';

// Phase 3: Clinical Automation
import { searchDrugs, runComprehensiveSafetyCheck, addPatientAllergy } from './drug_safety.js';
import { orderMedication, getPatientOrders, orderLabTest, orderImaging, createPrescription, getPrescription } from './cpoe_service.js';
import { generateEmarScheduleForOrder, getEmarSchedule, administerMedication, withholdMedication } from './emar_service.js';

// Phase 4: SCM, Pharmacy, MRP, Tariff, TPA
import { getInventory, receiveGoods, transferStock, createPurchaseOrder } from './scm_engine.js';
import { getPendingPrescriptions, dispensePrescriptionItems, getPatientDispensingHistory } from './pharmacy.js';
import { setReorderRule, getReorderSuggestions } from './mrp_engine.js';
import { setTariffRule, resolveServiceRate, resolveBillCharges } from './tariff_engine.js';
import { submitPreauthRequest, recordPreauthDecision, submitFinalClaim, reconcileSettlement, getPatientTpaClaims } from './tpa_claims.js';

// Phase 5: Interoperability
import { buildFhirPatient, buildFhirObservation, buildFhirMedicationRequest, buildFhirBundle } from './fhir_gateway.js';
import { ingestLabResult, getPatientLabResults, registerPacsStudy, submitRadiologyReport, getPatientPacsStudies } from './lis_pacs.js';

export const enterpriseRouter = express.Router();

// ─── 1. Auth & Administration ─────────────────────────────────────────────

enterpriseRouter.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    const result = login(username, password, {
      deviceInfo: req.headers['user-agent'],
      ipAddress: req.ip
    });
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

enterpriseRouter.post('/auth/logout', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const result = logout(token);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/auth/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const user = authenticateToken(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized or token expired' });
    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

enterpriseRouter.post('/admin/users', (req, res) => {
  try {
    const result = createUser(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/admin/roles', (req, res) => {
  res.json({ roles: getRoles() });
});

enterpriseRouter.get('/admin/sites', (req, res) => {
  res.json({ sites: getSites(req.query.activeOnly !== 'false') });
});

enterpriseRouter.post('/admin/sites', (req, res) => {
  try {
    res.json(createSite(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/admin/master-tariffs', (req, res) => {
  res.json({ tariffs: getTariffs(req.query) });
});

enterpriseRouter.post('/admin/master-tariffs', (req, res) => {
  try {
    res.json(createTariff(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/admin/master-items', (req, res) => {
  res.json({ items: getItems(req.query) });
});

enterpriseRouter.post('/admin/master-items', (req, res) => {
  try {
    res.json(createItem(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 2. Master Patient Index (MPI) ────────────────────────────────────────

enterpriseRouter.post('/mpi/search-duplicates', (req, res) => {
  try {
    res.json({ matches: searchDuplicatePatients(req.body) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/mpi/merge', (req, res) => {
  try {
    const { survivingPatientId, mergedPatientId, mergedBy, mergeReason } = req.body;
    res.json(mergePatients(survivingPatientId, mergedPatientId, mergedBy, mergeReason));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/mpi/unmerge', (req, res) => {
  try {
    res.json(unmergePatients(req.body.mergeId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 3. ABDM Gateway ──────────────────────────────────────────────────────

enterpriseRouter.post('/abdm/abha/create-otp', (req, res) => {
  try {
    res.json(generateAbhaOtp(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/abdm/abha/create', (req, res) => {
  try {
    res.json(verifyAbhaOtpAndCreate(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/abdm/abha/verify', (req, res) => {
  try {
    res.json(verifyExistingAbha(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/abdm/hpr/lookup/:registrationNumber', (req, res) => {
  try {
    const doc = lookupHpr({ registrationNumber: req.params.registrationNumber });
    res.json({ doctor: doc || null });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/abdm/hpr/register', (req, res) => {
  try {
    res.json(registerHprDoctor(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/abdm/hip/share', (req, res) => {
  try {
    res.json(handleHipShareRequest(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/abdm/hiu/request', (req, res) => {
  try {
    res.json(initiateHiuRequest(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 4. DPDP Act & Consent ────────────────────────────────────────────────

enterpriseRouter.post('/consent/record', (req, res) => {
  try {
    res.json(recordConsent({ ...req.body, ipAddress: req.ip }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/consent/:patientId', (req, res) => {
  try {
    res.json({ consents: getPatientConsents(req.params.patientId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/consent/withdraw', (req, res) => {
  try {
    res.json(withdrawConsent(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/dpdp/erasure-request', (req, res) => {
  try {
    res.json(requestDataErasure(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/dpdp/erasure-execute', (req, res) => {
  try {
    res.json(executeDataErasure(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/dpdp/access-log/:patientId', (req, res) => {
  try {
    res.json({ logs: getPatientAccessLogs(req.params.patientId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 5. Clinical Coding (EHR Standards) ───────────────────────────────────

enterpriseRouter.get('/coding/search', (req, res) => {
  try {
    res.json({ codes: searchClinicalCodes(req.query) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/coding/diagnosis', (req, res) => {
  try {
    res.json(recordDiagnosis(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/coding/diagnosis/:patientId', (req, res) => {
  try {
    res.json({ diagnoses: getPatientDiagnoses(req.params.patientId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 6. GST & Taxation ────────────────────────────────────────────────────

enterpriseRouter.post('/gst/calculate', (req, res) => {
  try {
    res.json(calculateGst(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/gst/invoice/create', (req, res) => {
  try {
    res.json(generateGstInvoice(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/gst/invoice/:id', (req, res) => {
  try {
    const inv = getGstInvoice(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    res.json(inv);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 7. NABH Quality ──────────────────────────────────────────────────────

enterpriseRouter.get('/nabh/quality-dashboard', (req, res) => {
  try {
    res.json(getQualityDashboard(req.query));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/nabh/record-indicator', (req, res) => {
  try {
    res.json(recordQualityIndicator(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/nabh/calibrations', (req, res) => {
  try {
    res.json(getCalibrationStatus(req.query.daysAhead ? Number(req.query.daysAhead) : 30));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/nabh/calibrations', (req, res) => {
  try {
    res.json(recordEquipmentCalibration(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/nabh/audit-report', (req, res) => {
  try {
    res.json(generateAuditReport(req.query));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 8. Statutory Forms ───────────────────────────────────────────────────

enterpriseRouter.post('/statutory/pcpndt/form-f', (req, res) => {
  try {
    res.json(recordPcpndtFormF(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/statutory/pcpndt/register', (req, res) => {
  try {
    res.json({ register: getPcpndtRegister(req.query) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/statutory/mtp/register', (req, res) => {
  try {
    res.json(recordMtpEntry(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/statutory/mtp/register', (req, res) => {
  try {
    res.json({ register: getMtpRegister(req.query) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/statutory/birth-death/notify', (req, res) => {
  try {
    res.json(recordBirthOrDeathEvent(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/statutory/birth-death/records', (req, res) => {
  try {
    res.json({ records: getBirthDeathRecords(req.query) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 9. Clinical CPOE, eMAR & Drug Safety ─────────────────────────────────

enterpriseRouter.get('/drugs/search', (req, res) => {
  try {
    res.json({ drugs: searchDrugs(req.query) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/cpoe/medication/order', (req, res) => {
  try {
    res.json(orderMedication(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/cpoe/orders/:patientId', (req, res) => {
  try {
    res.json({ orders: getPatientOrders(req.params.patientId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/cpoe/lab/order', (req, res) => {
  try {
    res.json(orderLabTest(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/cpoe/imaging/order', (req, res) => {
  try {
    res.json(orderImaging(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/emar/schedule', (req, res) => {
  try {
    res.json({ schedule: getEmarSchedule(req.query) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/emar/generate-schedule/:orderId', (req, res) => {
  try {
    res.json({ slots: generateEmarScheduleForOrder(req.params.orderId, req.body.date) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/emar/administer', (req, res) => {
  try {
    res.json(administerMedication(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/emar/withhold', (req, res) => {
  try {
    res.json(withholdMedication(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/emar/safety-check', (req, res) => {
  try {
    res.json(runComprehensiveSafetyCheck(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/prescriptions/create', (req, res) => {
  try {
    res.json(createPrescription(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/prescriptions/:id', (req, res) => {
  try {
    const rx = getPrescription(req.params.id);
    if (!rx) return res.status(404).json({ error: 'Prescription not found' });
    res.json(rx);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/patients/:id/allergies', (req, res) => {
  try {
    const rows = db.prepare(`SELECT * FROM patient_allergies WHERE patient_id = ?`).all(req.params.id);
    res.json({ allergies: rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/patients/:id/allergies', (req, res) => {
  try {
    res.json(addPatientAllergy({ ...req.body, patientId: req.params.id }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 10. SCM, Pharmacy & MRP ──────────────────────────────────────────────

enterpriseRouter.get('/scm/inventory', (req, res) => {
  try {
    res.json({ inventory: getInventory(req.query) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/scm/goods-receipt', (req, res) => {
  try {
    res.json(receiveGoods(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/scm/stock-transfer', (req, res) => {
  try {
    res.json(transferStock(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/scm/purchase-order', (req, res) => {
  try {
    res.json(createPurchaseOrder(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/pharmacy/pending', (req, res) => {
  try {
    res.json({ pending: getPendingPrescriptions(req.query) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/pharmacy/dispense', (req, res) => {
  try {
    res.json(dispensePrescriptionItems(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/pharmacy/history/:patientId', (req, res) => {
  try {
    res.json({ history: getPatientDispensingHistory(req.params.patientId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/mrp/reorder-suggestions', (req, res) => {
  try {
    res.json(getReorderSuggestions(req.query));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/mrp/reorder-rule', (req, res) => {
  try {
    res.json(setReorderRule(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 11. Tariff & TPA Claims ──────────────────────────────────────────────

enterpriseRouter.post('/tariff/resolve', (req, res) => {
  try {
    res.json(resolveServiceRate(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/tariff/bill-estimate', (req, res) => {
  try {
    res.json(resolveBillCharges(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/tpa/preauth', (req, res) => {
  try {
    res.json(submitPreauthRequest(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/tpa/preauth/decision', (req, res) => {
  try {
    res.json(recordPreauthDecision(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/tpa/claim/submit', (req, res) => {
  try {
    res.json(submitFinalClaim(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/tpa/settlement/reconcile', (req, res) => {
  try {
    res.json(reconcileSettlement(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/tpa/claims/:patientId', (req, res) => {
  try {
    res.json({ claims: getPatientTpaClaims(req.params.patientId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── 12. Interoperability (FHIR, LIS, PACS) ───────────────────────────────

enterpriseRouter.get('/fhir/Patient/:id', (req, res) => {
  try {
    res.json(buildFhirPatient(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

enterpriseRouter.get('/fhir/MedicationRequest/:orderId', (req, res) => {
  try {
    res.json(buildFhirMedicationRequest(req.params.orderId));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

enterpriseRouter.post('/fhir/Bundle', (req, res) => {
  try {
    res.json(buildFhirBundle(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/lis/result/ingest', (req, res) => {
  try {
    res.json(ingestLabResult(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/lis/results/:patientId', (req, res) => {
  try {
    res.json({ results: getPatientLabResults(req.params.patientId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/pacs/study/register', (req, res) => {
  try {
    res.json(registerPacsStudy(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.post('/pacs/report/submit', (req, res) => {
  try {
    res.json(submitRadiologyReport(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

enterpriseRouter.get('/pacs/studies/:patientId', (req, res) => {
  try {
    res.json({ studies: getPatientPacsStudies(req.params.patientId) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
