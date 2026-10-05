/**
 * ============================================================================
 * MODULE: Drug Safety & Clinical Decision Support (src/enterprise/drug_safety.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Comprehensive Patient Medication Safety Engine:
 *   - Drug-Drug Interaction (DDI) detection (Contraindicated, Major, Moderate)
 *   - Drug-Allergy Cross-reactivity screening
 *   - LASA (Look-Alike Sound-Alike) detection with Tall Man Lettering
 *   - High-Alert Medication flags (ISMP Guidelines: anticoagulants, insulin, opioids)
 *   - Drug master catalog search & seeding
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── Default Drug Master Seeds ────────────────────────────────────────────

const DEFAULT_DRUGS = [
  { drug_code: 'DRG-MET500', brand_name: 'Glycomet 500', generic_name: 'Metformin', strength: '500mg', dosage_form: 'Tablet', route: 'ORAL', lasa_group: null, lasa_flag: 0, high_alert: 0 },
  { drug_code: 'DRG-GLI5', brand_name: 'Amaryl 2mg', generic_name: 'Glimepiride', strength: '2mg', dosage_form: 'Tablet', route: 'ORAL', lasa_group: null, lasa_flag: 0, high_alert: 0 },
  { drug_code: 'DRG-ATOR10', brand_name: 'Atorva 10', generic_name: 'Atorvastatin', strength: '10mg', dosage_form: 'Tablet', route: 'ORAL', lasa_group: null, lasa_flag: 0, high_alert: 0 },
  { drug_code: 'DRG-ASP75', brand_name: 'Ecosprin 75', generic_name: 'Aspirin', strength: '75mg', dosage_form: 'Tablet', route: 'ORAL', lasa_group: null, lasa_flag: 0, high_alert: 0 },
  { drug_code: 'DRG-CLOP75', brand_name: 'Clopilet 75', generic_name: 'Clopidogrel', strength: '75mg', dosage_form: 'Tablet', route: 'ORAL', lasa_group: null, lasa_flag: 0, high_alert: 0 },
  { drug_code: 'DRG-WAR5', brand_name: 'Warf 5', generic_name: 'Warfarin', strength: '5mg', dosage_form: 'Tablet', route: 'ORAL', lasa_group: null, lasa_flag: 0, high_alert: 1 },
  { drug_code: 'DRG-HEP5000', brand_name: 'Heparin 5000 IU', generic_name: 'Heparin', strength: '5000 IU/ml', dosage_form: 'Injection', route: 'IV', lasa_group: null, lasa_flag: 0, high_alert: 1 },
  { drug_code: 'DRG-INS-R', brand_name: 'Actrapid', generic_name: 'Insulin Regular', strength: '100 IU/ml', dosage_form: 'Injection', route: 'SC', lasa_group: 'INSULIN', lasa_flag: 1, high_alert: 1 },
  { drug_code: 'DRG-INS-NPH', brand_name: 'Insulatard', generic_name: 'Insulin NPH', strength: '100 IU/ml', dosage_form: 'Injection', route: 'SC', lasa_group: 'INSULIN', lasa_flag: 1, high_alert: 1 },
  // LASA pairs
  { drug_code: 'DRG-DOP40', brand_name: 'DOPamine 40mg/ml', generic_name: 'Dopamine', strength: '40mg/ml', dosage_form: 'Injection', route: 'IV', lasa_group: 'DOP_DOB', lasa_flag: 1, high_alert: 1 },
  { drug_code: 'DRG-DOB50', brand_name: 'DoBUTamine 50mg/ml', generic_name: 'Dobutamine', strength: '50mg/ml', dosage_form: 'Injection', route: 'IV', lasa_group: 'DOP_DOB', lasa_flag: 1, high_alert: 1 },
  { drug_code: 'DRG-CEFTR1G', brand_name: 'Monocef 1g', generic_name: 'Ceftriaxone', strength: '1g', dosage_form: 'Injection', route: 'IV', lasa_group: 'CEF_ABX', lasa_flag: 1, high_alert: 0 },
  { drug_code: 'DRG-CEFTA1G', brand_name: 'Fortum 1g', generic_name: 'Ceftazidime', strength: '1g', dosage_form: 'Injection', route: 'IV', lasa_group: 'CEF_ABX', lasa_flag: 1, high_alert: 0 },
  // Antibiotics & Analgesics
  { drug_code: 'DRG-AMOX500', brand_name: 'Mox 500', generic_name: 'Amoxicillin', strength: '500mg', dosage_form: 'Capsule', route: 'ORAL', lasa_group: null, lasa_flag: 0, high_alert: 0 },
  { drug_code: 'DRG-AUG625', brand_name: 'Augmentin 625', generic_name: 'Amoxicillin + Clavulanate', strength: '625mg', dosage_form: 'Tablet', route: 'ORAL', lasa_group: null, lasa_flag: 0, high_alert: 0 },
  { drug_code: 'DRG-PCM650', brand_name: 'Dolo 650', generic_name: 'Paracetamol', strength: '650mg', dosage_form: 'Tablet', route: 'ORAL', lasa_group: null, lasa_flag: 0, high_alert: 0 },
  { drug_code: 'DRG-TRAM50', brand_name: 'Ultram 50mg', generic_name: 'Tramadol', strength: '50mg', dosage_form: 'Tablet', route: 'ORAL', lasa_group: null, lasa_flag: 0, high_alert: 1 }
];

export function seedDrugMaster() {
  const count = db.prepare(`SELECT COUNT(*) as c FROM drug_master`).get().c;
  if (count === 0) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO drug_master (
        drug_id, drug_code, brand_name, generic_name, strength, dosage_form, route, lasa_group, lasa_flag, high_alert
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const d of DEFAULT_DRUGS) {
      stmt.run(genId('DRUG'), d.drug_code, d.brand_name, d.generic_name, d.strength, d.dosage_form, d.route, d.lasa_group, d.lasa_flag, d.high_alert);
    }

    // Seed sample known drug-drug interactions
    seedKnownInteractions();
  }
}

function seedKnownInteractions() {
  const count = db.prepare(`SELECT COUNT(*) as c FROM drug_interactions`).get().c;
  if (count > 0) return;

  const getDrug = (name) => db.prepare(`SELECT drug_id FROM drug_master WHERE generic_name LIKE ?`).get(`%${name}%`);

  const warfarin = getDrug('Warfarin');
  const aspirin = getDrug('Aspirin');
  const clopidogrel = getDrug('Clopidogrel');
  const tramadol = getDrug('Tramadol');

  const insertInter = db.prepare(`
    INSERT INTO drug_interactions (interaction_id, drug_a_id, drug_b_id, severity, description, clinical_effect, management)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  if (warfarin && aspirin) {
    insertInter.run(genId('DDI'), warfarin.drug_id, aspirin.drug_id, 'SEVERE',
      'Concurrent use of Warfarin and Aspirin significantly increases risk of major gastrointestinal and systemic hemorrhage.',
      'Marked elevation of bleeding time and INR volatility.',
      'Avoid combination unless strictly indicated for prosthetic valve or acute coronary stenting. Monitor INR weekly.');
  }

  if (aspirin && clopidogrel) {
    insertInter.run(genId('DDI'), aspirin.drug_id, clopidogrel.drug_id, 'MODERATE',
      'Dual antiplatelet therapy increases bleeding risk.',
      'Enhanced antiplatelet effect, gastrointestinal mucosal bleeding.',
      'Prescribe proton pump inhibitor (PPI) co-therapy and observe for hematuria or melena.');
  }
}

try { seedDrugMaster(); } catch (e) {}

// ─── Safety Verification Engines ──────────────────────────────────────────

/**
 * Check drug-drug interactions for a new drug against a list of current medications
 */
export function checkDrugInteractions(newDrugId, activeDrugIds = []) {
  if (!activeDrugIds || activeDrugIds.length === 0) return [];

  const alerts = [];
  const stmt = db.prepare(`
    SELECT di.*, d1.generic_name as name_a, d2.generic_name as name_b
    FROM drug_interactions di
    JOIN drug_master d1 ON di.drug_a_id = d1.drug_id
    JOIN drug_master d2 ON di.drug_b_id = d2.drug_id
    WHERE (di.drug_a_id = ? AND di.drug_b_id = ?)
       OR (di.drug_a_id = ? AND di.drug_b_id = ?)
  `);

  for (const existingDrugId of activeDrugIds) {
    if (existingDrugId === newDrugId) continue;
    const inter = stmt.get(newDrugId, existingDrugId, existingDrugId, newDrugId);
    if (inter) {
      alerts.push({
        type: 'DRUG_DRUG_INTERACTION',
        severity: inter.severity,
        drugA: inter.name_a,
        drugB: inter.name_b,
        description: inter.description,
        clinicalEffect: inter.clinical_effect,
        management: inter.management
      });
    }
  }

  return alerts;
}

/**
 * Check patient allergies against prescribed drug
 */
export function checkAllergies(patientId, drugId) {
  const drug = db.prepare(`SELECT * FROM drug_master WHERE drug_id = ?`).get(drugId);
  if (!drug) return [];

  const allergies = db.prepare(`SELECT * FROM patient_allergies WHERE patient_id = ?`).all(patientId);
  const alerts = [];

  const genericLower = drug.generic_name.toLowerCase();
  const brandLower = drug.brand_name.toLowerCase();

  for (const allergy of allergies) {
    const allergen = allergy.allergen_name.toLowerCase();
    
    // Exact or substring match (e.g. "Penicillin" matches "Amoxicillin", "Sulfa" matches "Sulfonamides")
    const isPenicillinMatch = (allergen.includes('penicillin') || allergen.includes('beta-lactam')) &&
      (genericLower.includes('amoxicillin') || genericLower.includes('ampicillin') || genericLower.includes('penicillin'));
    
    const isDirectMatch = genericLower.includes(allergen) || brandLower.includes(allergen) || allergen.includes(genericLower);

    if (isDirectMatch || isPenicillinMatch) {
      alerts.push({
        type: 'DRUG_ALLERGY_CONTRAINDICATION',
        severity: allergy.severity || 'SEVERE',
        allergen: allergy.allergen_name,
        drugName: drug.brand_name,
        reaction: allergy.reaction,
        description: `PATIENT ALLERGY ALERT: Patient has documented allergy to "${allergy.allergen_name}" (${allergy.reaction || 'Anaphylaxis risk'}). Prescribed drug "${drug.generic_name}" is strictly contraindicated.`
      });
    }
  }

  return alerts;
}

/**
 * Check LASA (Look-Alike Sound-Alike) warnings
 */
export function checkLasaWarning(drugId) {
  const drug = db.prepare(`SELECT * FROM drug_master WHERE drug_id = ?`).get(drugId);
  if (!drug || !drug.lasa_flag || !drug.lasa_group) return null;

  const pairedDrugs = db.prepare(`
    SELECT brand_name, generic_name FROM drug_master
    WHERE lasa_group = ? AND drug_id != ?
  `).all(drug.lasa_group, drugId);

  return {
    type: 'LASA_ALERT',
    severity: 'WARNING',
    drugName: drug.brand_name,
    lasaGroup: drug.lasa_group,
    confusedWith: pairedDrugs.map(d => d.brand_name),
    tallManNotice: `CRITICAL SAFETY: This is a Look-Alike Sound-Alike (LASA) drug. Verify concentration, dosage form, and route before administration.`
  };
}

/**
 * Run comprehensive multi-point safety check
 */
export function runComprehensiveSafetyCheck({ patientId, drugId, activeDrugIds = [] }) {
  const drug = db.prepare(`SELECT * FROM drug_master WHERE drug_id = ?`).get(drugId);
  if (!drug) throw new Error('Drug not found in master catalog.');

  const allergyAlerts = checkAllergies(patientId, drugId);
  const interactionAlerts = checkDrugInteractions(drugId, activeDrugIds);
  const lasaAlert = checkLasaWarning(drugId);

  const alerts = [...allergyAlerts, ...interactionAlerts];
  if (lasaAlert) alerts.push(lasaAlert);

  const hasSevere = alerts.some(a => a.severity === 'SEVERE' || a.severity === 'CONTRAINDICATED');

  return {
    isSafe: alerts.length === 0,
    hasSevereConflict: hasSevere,
    alertCount: alerts.length,
    drugInfo: {
      drugId: drug.drug_id,
      brandName: drug.brand_name,
      genericName: drug.generic_name,
      strength: drug.strength,
      isHighAlert: !!drug.high_alert
    },
    alerts
  };
}

/**
 * Register patient allergy
 */
export function addPatientAllergy({ patientId, allergenType = 'DRUG', allergenName, reaction, severity = 'SEVERE', recordedBy }) {
  const allergyId = genId('ALG');
  db.prepare(`
    INSERT INTO patient_allergies (
      allergy_id, patient_id, allergen_type, allergen_name, reaction, severity, verified, recorded_by, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
  `).run(allergyId, patientId, allergenType, allergenName, reaction, severity, recordedBy || 'NURSE_TRIAGE');

  return {
    allergyId,
    patientId,
    allergenName,
    severity,
    reaction
  };
}

/**
 * Search drugs in master
 */
export function searchDrugs({ query, limit = 20 }) {
  if (!query) return db.prepare(`SELECT * FROM drug_master WHERE is_active = 1 LIMIT ?`).all(limit);
  return db.prepare(`
    SELECT * FROM drug_master
    WHERE is_active = 1 AND (brand_name LIKE ? OR generic_name LIKE ? OR drug_code LIKE ?)
    LIMIT ?
  `).all(`%${query}%`, `%${query}%`, `%${query}%`, limit);
}
