/**
 * ============================================================================
 * ROUTER: Specialized Hospital Operations REST Gateway (src/operations/routes.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Exposes REST endpoints for all 13 specialized hospital operations and clinical
 *   statutory compliance subsystems:
 *   - Bio-Medical Waste (BMW Rules 2016)
 *   - NDPS Act Narcotics Register (Schedule X/H1, Dual-Key)
 *   - Medico-Legal Cases (MLC) & Police Intimation
 *   - Operation Theatre (OT) & WHO Surgical Safety Checklist
 *   - CSSD Autoclave & Spore Sterilization
 *   - Blood Center / Blood Bank (Schedule F Part XII-B, eRaktKosh)
 *   - AERB Radiation Safety & TLD Dosimetry
 *   - THOTA 1994 Brain-Stem Death & Organ Retrieval
 *   - Dietetics & Therapeutic Clinical Nutrition
 *   - Mortuary Management & MRD Record Retention
 *   - Linen & Laundry Par-Level Management
 *   - Emergency Ambulance Fleet & Critical Equipment Readiness
 * ============================================================================
 */

import { Router } from 'express';
import { logBioMedicalWaste, dispatchToCBWTF, getBmwDailyRegister, getBmwAnnualReport } from './bmw_management.js';
import { receiveNdpsStock, dispenseNdpsToPatient, getNdpsLedger } from './ndps_narcotics.js';
import { registerMlcCase, getMlcCaseDetails, listMlcCases } from './mlc_engine.js';
import { scheduleOtSurgery, executeWhoSignIn, executeWhoTimeOut, executeWhoSignOut, logSurgicalImplant, getSurgeryStatus } from './ot_surgical_safety.js';
import { logSterilizationBatch, createSterilePack, issuePackToSurgery, updateBiologicalIndicator, getCssdOverview } from './cssd_sterilization.js';
import { screenBloodDonor, collectBloodUnit, updateTtiResults, separateComponents, performCrossMatch, reportTransfusionReaction, getBloodBankInventory } from './blood_bank.js';
import { registerRadiationEquipment, logPersonnelTldDose, inspectLeadApron, getAerbComplianceStatus } from './aerb_radiation.js';
import { initiateBrainDeathDeclaration, certifyBrainDeathForm8, logOrganRetrieval } from './thota_transplant.js';
import { prescribeMealPlan, dispatchMealTray, confirmBedsideTrayDelivery, getKitchenWardRoster } from './dietetics_nutrition.js';
import { admitBodyToMortuary, releaseBodyFromMortuary, archivePatientRecord, checkoutMrdFile } from './mortuary_mrd.js';
import { logLaundryBatch, getLinenInventoryStatus, recordAmbulanceChecklist, dispatchAmbulanceMission, completeAmbulanceMission, getAmbulanceFleetStatus } from './linen_fleet.js';

export const operationsRouter = Router();

// ----------------------------------------------------------------------------
// Master Status Endpoint
// ----------------------------------------------------------------------------
operationsRouter.get('/operations/status', (req, res) => {
  const operationsModules = [
    { id: 'O1', name: 'Bio-Medical Waste (BMW Rules 2016)', standard: 'CPCB / SPCB', status: 'ONLINE', description: 'Color-coded barcoded bag segregation, CBWTF manifests, Form IV returns' },
    { id: 'O2', name: 'NDPS Narcotics & Controlled Drugs', standard: 'NDPS Act 1985 & Rule 52A', status: 'ONLINE', description: 'Dual-key digital custody, Schedule X/H1, administration and wastage destruction' },
    { id: 'O3', name: 'Medico-Legal Cases (MLC)', standard: 'BNSS 2023 / CrPC Evidence Chain', status: 'ONLINE', description: 'Mandatory police station intimation, injury classification, forensic chain of custody' },
    { id: 'O4', name: 'OT & WHO Surgical Safety Checklist', standard: 'WHO Safe Surgery & NABH COP.14', status: 'ONLINE', description: 'Sign In, Time Out, Sign Out, swab/needle counter, implant traceability' },
    { id: 'O5', name: 'CSSD Sterilization Tracking', standard: 'NABH HIC & CDC Guidelines', status: 'ONLINE', description: 'Autoclave batches, Bowie-Dick tests, biological spore incubation, pack recall' },
    { id: 'O6', name: 'Blood Bank / Center Management', standard: 'Schedule F Part XII-B & eRaktKosh', status: 'ONLINE', description: 'Donor screening, 5 TTI tests, component separation, cross-match, HvPI reactions' },
    { id: 'O7', name: 'AERB Radiation Safety & Dosimetry', standard: 'AERB/SC/MED-2 & eLORA', status: 'ONLINE', description: 'Diagnostic equipment licensing, 2-yr QA, TLD badge dose monitoring, lead aprons' },
    { id: 'O8', name: 'Organ & Tissue Transplant (THOTA)', standard: 'THOTA 1994 & NOTTO', status: 'ONLINE', description: '4-doctor brain death committee, dual apnea tests 6h apart, Form 8/10, cold ischemia' },
    { id: 'O9', name: 'Dietetics & Therapeutic Nutrition', standard: 'NABH COP.7 & ESPEN/ASPEN', status: 'ONLINE', description: 'Diabetic/renal/cardiac/liquid diets, strict NPO blocking, allergen safety' },
    { id: 'O10', name: 'Mortuary & Post-Mortem Management', standard: 'RBD Act & Medico-Legal Protocols', status: 'ONLINE', description: 'Cold chamber allocation, police NOC verification for MLC, corpse release' },
    { id: 'O11', name: 'Medical Records Department (MRD)', standard: 'NMC & MoHFW Retention Guidelines', status: 'ONLINE', description: 'Physical compactor shelf tracking, completeness audit, statutory retention schedule' },
    { id: 'O12', name: 'Linen, Laundry & Infection Control', standard: 'NABH HIC.3 & Thermal Disinfection', status: 'ONLINE', description: 'Ward par levels, infected linen 71°C thermal wash, condemnation register' },
    { id: 'O13', name: 'Emergency Ambulance Fleet (ALS/BLS)', standard: 'MoHFW Emergency Care Standards', status: 'ONLINE', description: 'Daily defibrillator & O2 pressure checklist, emergency dispatch and ER handover' }
  ];

  res.json({
    total_specialized_operations: 13,
    online_specialized_operations: 13,
    coverage_pct: 100,
    accreditation_compliance: ['NABH 5th Edition', 'JCI 8th Edition', 'MoHFW Indian Standards'],
    modules: operationsModules
  });
});

// ----------------------------------------------------------------------------
// 1. Bio-Medical Waste (BMW)
// ----------------------------------------------------------------------------
operationsRouter.post('/operations/bmw/log', (req, res) => {
  try {
    const result = logBioMedicalWaste(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/bmw/dispatch-cbwtf', (req, res) => {
  try {
    const result = dispatchToCBWTF(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.get('/operations/bmw/daily-register', (req, res) => {
  try {
    const result = getBmwDailyRegister(req.query.date);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

operationsRouter.get('/operations/bmw/annual-report', (req, res) => {
  try {
    const result = getBmwAnnualReport(req.query.year);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 2. NDPS Narcotics Register
// ----------------------------------------------------------------------------
operationsRouter.get('/operations/ndps/ledger', (req, res) => {
  try {
    const result = getNdpsLedger(req.query.code);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

operationsRouter.post('/operations/ndps/receive', (req, res) => {
  try {
    const result = receiveNdpsStock(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/ndps/dispense', (req, res) => {
  try {
    const result = dispenseNdpsToPatient(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 3. Medico-Legal Cases (MLC)
// ----------------------------------------------------------------------------
operationsRouter.post('/operations/mlc/register', (req, res) => {
  try {
    const result = registerMlcCase(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.get('/operations/mlc/case/:mlcNumber', (req, res) => {
  try {
    const result = getMlcCaseDetails(req.params.mlcNumber);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

operationsRouter.get('/operations/mlc/list', (req, res) => {
  try {
    const result = listMlcCases(parseInt(req.query.limit || 50, 10));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 4. Operation Theatre (OT) & WHO Surgical Safety
// ----------------------------------------------------------------------------
operationsRouter.post('/operations/ot/schedule', (req, res) => {
  try {
    const result = scheduleOtSurgery(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/ot/:id/sign-in', (req, res) => {
  try {
    const result = executeWhoSignIn(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/ot/:id/time-out', (req, res) => {
  try {
    const result = executeWhoTimeOut(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/ot/:id/sign-out', (req, res) => {
  try {
    const result = executeWhoSignOut(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/ot/implant/log', (req, res) => {
  try {
    const result = logSurgicalImplant(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.get('/operations/ot/:id/status', (req, res) => {
  try {
    const result = getSurgeryStatus(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 5. CSSD Sterilization
// ----------------------------------------------------------------------------
operationsRouter.post('/operations/cssd/batch/log', (req, res) => {
  try {
    const result = logSterilizationBatch(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/cssd/pack/create', (req, res) => {
  try {
    const result = createSterilePack(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/cssd/pack/issue', (req, res) => {
  try {
    const result = issuePackToSurgery(req.body.packBarcode, req.body.surgeryId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/cssd/batch/:id/spore-test', (req, res) => {
  try {
    const result = updateBiologicalIndicator(req.params.id, req.body.result);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.get('/operations/cssd/overview', (req, res) => {
  try {
    const result = getCssdOverview();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 6. Blood Bank / Blood Center
// ----------------------------------------------------------------------------
operationsRouter.post('/operations/blood-bank/donor/screen', (req, res) => {
  try {
    const result = screenBloodDonor(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/blood-bank/unit/collect', (req, res) => {
  try {
    const result = collectBloodUnit(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/blood-bank/unit/:unitNumber/tti-results', (req, res) => {
  try {
    const result = updateTtiResults(req.params.unitNumber, req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/blood-bank/unit/:unitNumber/separate', (req, res) => {
  try {
    const result = separateComponents(req.params.unitNumber);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/blood-bank/crossmatch', (req, res) => {
  try {
    const result = performCrossMatch(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/blood-bank/transfusion-reaction', (req, res) => {
  try {
    const result = reportTransfusionReaction(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.get('/operations/blood-bank/inventory', (req, res) => {
  try {
    const result = getBloodBankInventory();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 7. AERB Radiation Safety
// ----------------------------------------------------------------------------
operationsRouter.post('/operations/aerb/equipment/register', (req, res) => {
  try {
    const result = registerRadiationEquipment(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/aerb/tld/log', (req, res) => {
  try {
    const result = logPersonnelTldDose(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/aerb/apron/inspect', (req, res) => {
  try {
    const result = inspectLeadApron(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.get('/operations/aerb/compliance', (req, res) => {
  try {
    const result = getAerbComplianceStatus();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 8. THOTA 1994 Organ Transplant
// ----------------------------------------------------------------------------
operationsRouter.post('/operations/thota/brain-death/initiate', (req, res) => {
  try {
    const result = initiateBrainDeathDeclaration(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/thota/brain-death/:caseId/certify-form8', (req, res) => {
  try {
    const result = certifyBrainDeathForm8({ caseId: req.params.caseId, ...req.body });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/thota/organ/retrieve', (req, res) => {
  try {
    const result = logOrganRetrieval(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 9. Dietetics & Therapeutic Nutrition
// ----------------------------------------------------------------------------
operationsRouter.post('/operations/dietetics/meal-plan', (req, res) => {
  try {
    const result = prescribeMealPlan(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/dietetics/tray/dispatch', (req, res) => {
  try {
    const result = dispatchMealTray(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/dietetics/tray/:id/deliver', (req, res) => {
  try {
    const result = confirmBedsideTrayDelivery(req.params.id, req.body.patientAcceptance);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.get('/operations/dietetics/kitchen-roster', (req, res) => {
  try {
    const result = getKitchenWardRoster();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 10. Mortuary & MRD
// ----------------------------------------------------------------------------
operationsRouter.post('/operations/mortuary/admit', (req, res) => {
  try {
    const result = admitBodyToMortuary(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/mortuary/release', (req, res) => {
  try {
    const result = releaseBodyFromMortuary(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/mrd/archive', (req, res) => {
  try {
    const result = archivePatientRecord(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/mrd/checkout', (req, res) => {
  try {
    const result = checkoutMrdFile(req.body.mrdFileId, req.body.doctorId, req.body.purpose, req.body.returnDays);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// 11. Linen & Ambulance Fleet
// ----------------------------------------------------------------------------
operationsRouter.post('/operations/linen/laundry-batch', (req, res) => {
  try {
    const result = logLaundryBatch(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.get('/operations/linen/status', (req, res) => {
  try {
    const result = getLinenInventoryStatus();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

operationsRouter.post('/operations/ambulance/checklist', (req, res) => {
  try {
    const result = recordAmbulanceChecklist(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/ambulance/dispatch', (req, res) => {
  try {
    const result = dispatchAmbulanceMission(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.post('/operations/ambulance/:id/complete', (req, res) => {
  try {
    const result = completeAmbulanceMission({ missionId: req.params.id, ...req.body });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

operationsRouter.get('/operations/ambulance/fleet-status', (req, res) => {
  try {
    const result = getAmbulanceFleetStatus();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
