/**
 * ============================================================================
 * MODULE: Dietetics & Therapeutic Clinical Nutrition (src/operations/dietetics_nutrition.js)
 * ============================================================================
 * 
 * CLINICAL & HOSPITAL ACCREDITATION MANDATE:
 *   - NABH 5th Edition: Care of Patients (COP.7 - Nutritional Care & Food Services)
 *   - ESPEN / ASPEN Clinical Nutrition Guidelines
 *   - FSSAI Schedule 4 (General Hygiene and Sanitary Practices for Food Caterers)
 * 
 * CORE FEATURES:
 *   - Specialized therapeutic diets (Diabetic, Renal, Cardiac Low-Salt, Hepatic, Enteral, TPN)
 *   - Strict NPO (Nil Per Os) Blocking: Automatic hard stop on meal delivery for fasting/pre-op patients
 *   - Automated allergen cross-checking (Gluten, Lactose, Peanuts, Shellfish)
 *   - Inpatient tray dispatch & bedside delivery tracking
 * ============================================================================
 */

import { db } from '../db/index.js';
import crypto from 'node:crypto';

export const THERAPEUTIC_DIETS = {
  REGULAR_VEG: { name: 'Standard Balanced Vegetarian', defaultKcal: 2000, defaultProtein: 60 },
  REGULAR_NONVEG: { name: 'Standard Non-Vegetarian', defaultKcal: 2000, defaultProtein: 65 },
  DIABETIC: { name: 'Diabetic Controlled Carbohydrate (Low Glycemic)', defaultKcal: 1600, defaultProtein: 65 },
  RENAL_LOW_POTASSIUM: { name: 'Renal Diet (Low Potassium, Low Phosphorus, Controlled Protein)', defaultKcal: 1800, defaultProtein: 40 },
  CARDIAC_LOW_SALT: { name: 'Cardiac Low Sodium (<2g NaCl)', defaultKcal: 1800, defaultProtein: 60 },
  HEPATIC: { name: 'Hepatic Encephalopathy (Moderate BCAA Protein)', defaultKcal: 1900, defaultProtein: 45 },
  HIGH_PROTEIN: { name: 'Post-Surgical / Burn Healing (High Protein)', defaultKcal: 2400, defaultProtein: 95 },
  SOFT_BLAND: { name: 'Gastrointestinal Soft & Bland', defaultKcal: 1800, defaultProtein: 55 },
  CLEAR_LIQUID: { name: 'Clear Liquid (Electrolytes, Broth, Apple Juice)', defaultKcal: 600, defaultProtein: 10 },
  FULL_LIQUID: { name: 'Full Liquid (Milk, Custard, Strained Soups)', defaultKcal: 1200, defaultProtein: 35 },
  NPO_FASTING: { name: 'NPO (Nil Per Os - Strictly Nothing by Mouth)', defaultKcal: 0, defaultProtein: 0 },
  ENTERAL_TUBE_FEED: { name: 'Enteral Tube Feed (Ryles/PEG Continuous Formula)', defaultKcal: 1500, defaultProtein: 60 },
  TPN_PARENTERAL: { name: 'Total Parenteral Nutrition (Central Line Infusion)', defaultKcal: 1800, defaultProtein: 75 }
};

/**
 * Prescribe therapeutic diet plan for inpatient
 */
export function prescribeMealPlan({
  patientId,
  bedNumber,
  dietType,
  calorieTargetKcal,
  proteinTargetG,
  sodiumRestricted = 0,
  fluidRestrictionMl = null,
  allergenNotes = null,
  dietitianId
}) {
  if (!patientId || !bedNumber || !dietType) {
    throw new Error('Patient ID, Bed Number, and Diet Type are mandatory.');
  }

  const dietKey = dietType.toUpperCase();
  const config = THERAPEUTIC_DIETS[dietKey];
  if (!config) {
    throw new Error(`Invalid diet type: ${dietType}. Supported: ${Object.keys(THERAPEUTIC_DIETS).join(', ')}`);
  }

  // Deactivate any previous meal plan for this patient
  db.prepare(`UPDATE dietary_meal_plans SET status = 'DISCONTINUED' WHERE patient_id = ? AND status = 'ACTIVE'`).run(patientId);

  const planId = `DIET-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const status = dietKey === 'NPO_FASTING' ? 'NPO_HOLD' : 'ACTIVE';

  db.prepare(`
    INSERT INTO dietary_meal_plans (
      plan_id, patient_id, bed_number, diet_type, calorie_target_kcal,
      protein_target_g, sodium_restricted, fluid_restriction_ml, allergen_notes,
      prescribed_by_dietitian_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    planId, patientId, bedNumber, dietKey,
    calorieTargetKcal || config.defaultKcal,
    proteinTargetG || config.defaultProtein,
    sodiumRestricted ? 1 : 0, fluidRestrictionMl, allergenNotes,
    dietitianId || 'DIETITIAN-CHIEF', status
  );

  return {
    success: true,
    plan_id: planId,
    patient_id: patientId,
    bed_number: bedNumber,
    diet_name: config.name,
    calorie_target: calorieTargetKcal || config.defaultKcal,
    protein_target_g: proteinTargetG || config.defaultProtein,
    npo_status: dietKey === 'NPO_FASTING',
    status,
    created_at: new Date().toISOString()
  };
}

/**
 * Prepare and dispatch dietary tray with strict NPO and allergen checks
 */
export function dispatchMealTray({
  planId,
  mealSlot = 'LUNCH',
  trayIngredients = []
}) {
  const plan = db.prepare(`SELECT * FROM dietary_meal_plans WHERE plan_id = ?`).get(planId);
  if (!plan) throw new Error(`Dietary plan not found: ${planId}`);

  // Hard Blocking Gate: If patient is on NPO, block tray preparation!
  if (plan.status === 'NPO_HOLD' || plan.diet_type === 'NPO_FASTING') {
    return {
      success: false,
      blocked: true,
      reason: 'NPO_STRICT_FASTING',
      message: `MEAL DISPATCH BLOCKED: Patient in bed ${plan.bed_number} is strictly NPO (Nil Per Os) for surgery/procedure. No oral feed permitted.`
    };
  }

  // Allergen cross-check
  let allergenConflict = false;
  let detectedAllergen = null;
  if (plan.allergen_notes) {
    const allergyKeywords = plan.allergen_notes.toLowerCase().split(/[\s,;]+/).map(s => s.trim().replace(/s$/, '')).filter(Boolean);
    for (const ing of trayIngredients) {
      const lowerIng = ing.toLowerCase();
      for (const kw of allergyKeywords) {
        if (kw.length >= 3 && (lowerIng.includes(kw) || kw.includes(lowerIng))) {
          allergenConflict = true;
          detectedAllergen = ing;
          break;
        }
      }
      if (allergenConflict) break;
    }
  }

  if (allergenConflict) {
    return {
      success: false,
      blocked: true,
      reason: 'ALLERGEN_SAFETY_STOP',
      message: `ALLERGY ALERT: Tray contains ${detectedAllergen}, which patient is allergic to (${plan.allergen_notes}). Tray preparation stopped.`
    };
  }

  const dispatchId = `TRAY-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  db.prepare(`
    INSERT INTO dietary_tray_dispatches (
      dispatch_id, plan_id, meal_slot, allergy_check_passed, delivered_to_bed
    ) VALUES (?, ?, ?, 1, 0)
  `).run(dispatchId, planId, mealSlot.toUpperCase());

  return {
    success: true,
    dispatch_id: dispatchId,
    plan_id: planId,
    patient_id: plan.patient_id,
    bed_number: plan.bed_number,
    meal_slot: mealSlot.toUpperCase(),
    diet_type: plan.diet_type,
    allergy_check: 'PASSED',
    status: 'TRAY_DISPATCHED_TO_WARD'
  };
}

/**
 * Confirm bedside delivery of meal tray
 */
export function confirmBedsideTrayDelivery(dispatchId, patientAcceptance = 'ACCEPTED_FULL') {
  const tray = db.prepare(`SELECT * FROM dietary_tray_dispatches WHERE dispatch_id = ?`).get(dispatchId);
  if (!tray) throw new Error(`Tray dispatch not found: ${dispatchId}`);

  db.prepare(`
    UPDATE dietary_tray_dispatches 
    SET delivered_to_bed = 1, delivered_at = CURRENT_TIMESTAMP, patient_acceptance = ?
    WHERE dispatch_id = ?
  `).run(patientAcceptance, dispatchId);

  return {
    success: true,
    dispatch_id: dispatchId,
    delivered_to_bed: true,
    patient_acceptance: patientAcceptance,
    delivered_at: new Date().toISOString()
  };
}

/**
 * Fetch active diet roster for hospital ward kitchen
 */
export function getKitchenWardRoster() {
  const activePlans = db.prepare(`
    SELECT plan_id, patient_id, bed_number, diet_type, calorie_target_kcal,
           protein_target_g, allergen_notes, status
    FROM dietary_meal_plans 
    WHERE status IN ('ACTIVE', 'NPO_HOLD')
    ORDER BY bed_number ASC
  `).all();

  return {
    active_inpatient_count: activePlans.length,
    roster: activePlans
  };
}
