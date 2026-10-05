/**
 * ============================================================================
 * ROUTER: Advanced Clinical, Engineering & Governance Hospital API
 * FILE: src/advanced/routes.js
 * ============================================================================
 */

import express from 'express';
import {
  recordHAISurveillance,
  listHAISurveillances,
  conductAMSPAudit,
  getInfectionControlMetrics
} from './infection_control.js';
import {
  activateEmergencyCode,
  resolveEmergencyCode,
  recordMockDrill,
  getEmergencyCodesDashboard
} from './emergency_codes.js';
import {
  recordDialysisSession,
  reprocessDialyzer,
  recordROWaterTest,
  getDialysisUnitSummary
} from './hemodialysis_unit.js';
import {
  calculateMostellerBSA,
  scheduleChemoCycle,
  dualVerifyChemoCycle,
  administerChemoCycle,
  reportExtravasation,
  getOncologyDashboardSummary
} from './oncology_chemo.js';
import {
  recordCathlabProcedure,
  registerCardiacStent,
  getCathlabMetrics
} from './cathlab_cardio.js';
import {
  registerBiomedicalAsset,
  raiseBreakdownWorkOrder,
  completeWorkOrder,
  logPPMCheck,
  getCMMSDashboard
} from './biomedical_cmms.js';
import {
  registerTrialProtocol,
  reportSeriousAdverseEvent,
  submit14DayDetailedReport,
  getClinicalTrialsDashboard
} from './clinical_trials.js';
import {
  recordNICUAssessment,
  logKMCSession,
  recordTelemedicineConsultation,
  getNICUAndTelemedSummary
} from './nicu_telemedicine.js';

const router = express.Router();

// 1. Infection Control & AMSP
router.post('/infection-control/surveillance', (req, res) => {
  try {
    const result = recordHAISurveillance(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/infection-control/surveillance', (req, res) => {
  try {
    const records = listHAISurveillances(req.query);
    res.json({ count: records.length, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/infection-control/amsp-audit', (req, res) => {
  try {
    const result = conductAMSPAudit(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/infection-control/metrics', (req, res) => {
  try {
    res.json(getInfectionControlMetrics());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Emergency Codes & Disaster Management
router.post('/emergency-codes/activate', (req, res) => {
  try {
    const result = activateEmergencyCode(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/emergency-codes/resolve', (req, res) => {
  try {
    const { activation_id, ...debrief } = req.body;
    const result = resolveEmergencyCode(activation_id, debrief);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/emergency-codes/drill', (req, res) => {
  try {
    const result = recordMockDrill(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/emergency-codes/dashboard', (req, res) => {
  try {
    res.json(getEmergencyCodesDashboard());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Hemodialysis Unit & ISO 23500 RO Water
router.post('/hemodialysis/session', (req, res) => {
  try {
    const result = recordDialysisSession(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/hemodialysis/dialyzer-reprocess', (req, res) => {
  try {
    const result = reprocessDialyzer(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/hemodialysis/ro-water-test', (req, res) => {
  try {
    const result = recordROWaterTest(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/hemodialysis/summary', (req, res) => {
  try {
    res.json(getDialysisUnitSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Oncology & Chemotherapy Daycare
router.post('/oncology/bsa', (req, res) => {
  try {
    const { height_cm, weight_kg } = req.body;
    const bsa = calculateMostellerBSA(height_cm, weight_kg);
    res.json({ height_cm, weight_kg, bsa_m2: bsa, formula: 'Mosteller: sqrt(H*W/3600)' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/oncology/schedule', (req, res) => {
  try {
    const result = scheduleChemoCycle(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/oncology/dual-verify', (req, res) => {
  try {
    const { cycle_id, pharmacist_signature } = req.body;
    const result = dualVerifyChemoCycle(cycle_id, pharmacist_signature);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/oncology/administer', (req, res) => {
  try {
    const { cycle_id, nurse_signature } = req.body;
    const result = administerChemoCycle(cycle_id, nurse_signature);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/oncology/extravasation', (req, res) => {
  try {
    const result = reportExtravasation(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/oncology/summary', (req, res) => {
  try {
    res.json(getOncologyDashboardSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Cath Lab & Interventional Cardiology
router.post('/cathlab/procedure', (req, res) => {
  try {
    const result = recordCathlabProcedure(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/cathlab/stent', (req, res) => {
  try {
    const result = registerCardiacStent(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/cathlab/metrics', (req, res) => {
  try {
    res.json(getCathlabMetrics());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Biomedical CMMS
router.post('/biomedical/asset', (req, res) => {
  try {
    const result = registerBiomedicalAsset(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/biomedical/work-order', (req, res) => {
  try {
    const result = raiseBreakdownWorkOrder(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/biomedical/complete-work-order', (req, res) => {
  try {
    const { work_order_id, ...completionData } = req.body;
    const result = completeWorkOrder(work_order_id, completionData);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/biomedical/ppm', (req, res) => {
  try {
    const result = logPPMCheck(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/biomedical/dashboard', (req, res) => {
  try {
    res.json(getCMMSDashboard());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Clinical Trials & CDSCO NDCT Rules 2019
router.post('/clinical-trials/register', (req, res) => {
  try {
    const result = registerTrialProtocol(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/clinical-trials/sae', (req, res) => {
  try {
    const result = reportSeriousAdverseEvent(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/clinical-trials/sae-14d', (req, res) => {
  try {
    const { sae_report_id } = req.body;
    const result = submit14DayDetailedReport(sae_report_id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/clinical-trials/dashboard', (req, res) => {
  try {
    res.json(getClinicalTrialsDashboard());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. NICU & Telemedicine Suite
router.post('/nicu/assessment', (req, res) => {
  try {
    const result = recordNICUAssessment(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/nicu/kmc', (req, res) => {
  try {
    const { neonate_id, hours } = req.body;
    const result = logKMCSession(neonate_id, hours);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/telemedicine/consult', (req, res) => {
  try {
    const result = recordTelemedicineConsultation(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/nicu-telemed/summary', (req, res) => {
  try {
    res.json(getNICUAndTelemedSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Master Advanced Subsystems Status
router.get('/status', (req, res) => {
  try {
    res.json({
      status: 'OPERATIONAL',
      version: '3.0.0',
      wave: 'Advanced Clinical, Engineering & Research Governance',
      total_subsystems: 8,
      subsystems: {
        infection_control: getInfectionControlMetrics(),
        emergency_codes: getEmergencyCodesDashboard(),
        hemodialysis: getDialysisUnitSummary(),
        oncology: getOncologyDashboardSummary(),
        cathlab: getCathlabMetrics(),
        biomedical_cmms: getCMMSDashboard(),
        clinical_trials: getClinicalTrialsDashboard(),
        nicu_telemedicine: getNICUAndTelemedSummary()
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
