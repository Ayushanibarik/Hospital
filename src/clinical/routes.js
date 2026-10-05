/**
 * ============================================================================
 * ROUTER: Doctor & Nursing Clinical Workstation REST API
 * FILE: src/clinical/routes.js
 * ============================================================================
 */

import express from 'express';
import {
  recordClinicalEncounter,
  recordVitalSigns,
  recordFluidBalance,
  recordEmergencyTriage,
  recordISBARHandover,
  generateDischargeSummary,
  getClinicalWorkstationDashboard
} from './clinical_workstation.js';
import { db } from '../db/index.js';

const router = express.Router();

router.post('/encounter', (req, res) => {
  try {
    const result = recordClinicalEncounter(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/encounters', (req, res) => {
  try {
    const { patient_id, doctor_id } = req.query;
    let query = 'SELECT * FROM clinical_encounters WHERE 1=1';
    const params = [];
    if (patient_id) { query += ' AND patient_id = ?'; params.push(patient_id); }
    if (doctor_id) { query += ' AND doctor_id = ?'; params.push(doctor_id); }
    query += ' ORDER BY created_at DESC LIMIT 50';
    const rows = db.prepare(query).all(...params);
    res.json({ count: rows.length, encounters: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/vitals', (req, res) => {
  try {
    const result = recordVitalSigns(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/vitals', (req, res) => {
  try {
    const { patient_id } = req.query;
    let query = 'SELECT * FROM clinical_vitals_logs WHERE 1=1';
    const params = [];
    if (patient_id) { query += ' AND patient_id = ?'; params.push(patient_id); }
    query += ' ORDER BY recorded_at DESC LIMIT 50';
    const rows = db.prepare(query).all(...params);
    res.json({ count: rows.length, vitals: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/fluid-balance', (req, res) => {
  try {
    const result = recordFluidBalance(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/triage', (req, res) => {
  try {
    const result = recordEmergencyTriage(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/isbar-handover', (req, res) => {
  try {
    const result = recordISBARHandover(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/discharge-summary', (req, res) => {
  try {
    const result = generateDischargeSummary(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/dashboard', (req, res) => {
  try {
    res.json(getClinicalWorkstationDashboard());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
