/**
 * ============================================================================
 * MODULE: Bio-Medical Waste (BMW) Management (src/operations/bmw_management.js)
 * ============================================================================
 * 
 * STATUTORY MANDATE:
 *   - Bio-Medical Waste Management Rules, 2016 (Ministry of Environment, Forest & Climate Change)
 *   - Central Pollution Control Board (CPCB) & State Pollution Control Board (SPCB) guidelines
 *   - Barcode system for bio-medical waste bags & containers (Rule 4(r) & Rule 5)
 * 
 * CORE FEATURES:
 *   - Color-coded segregation validation (Yellow, Red, White, Blue)
 *   - Barcode tag generation per bag with exact weight logging
 *   - Common Bio-Medical Waste Treatment Facility (CBWTF) handover manifest
 *   - Annual statutory return (Form IV) compliance metrics
 * ============================================================================
 */

import { db } from '../db/index.js';
import crypto from 'node:crypto';

export const BMW_CATEGORIES = {
  YELLOW: {
    name: 'Yellow (Incineration / Deep Burial)',
    types: ['HUMAN_ANATOMICAL', 'ANIMAL_ANATOMICAL', 'SOILED_COTTON_GAUZE', 'EXPIRED_CYTOTOXIC_DRUGS', 'CHEMICAL_LIQUID_WASTE'],
    color: '#FACC15',
    treatment: 'Incineration or plasma pyrolysis / deep burial'
  },
  RED: {
    name: 'Red (Autoclaving / Shredding / Recycling)',
    types: ['CONTAMINATED_PLASTICS', 'IV_TUBES', 'CATHETERS', 'URINE_BAGS', 'SYRINGES_WITHOUT_NEEDLE', 'VACUTAINERS'],
    color: '#EF4444',
    treatment: 'Autoclaving / microwaving / hydroclaving followed by shredding'
  },
  WHITE: {
    name: 'White / Translucent (Waste Sharps Puncture-Proof)',
    types: ['NEEDLES', 'SCALPELS', 'BLADES', 'CONTAMINATED_SHARPS', 'BURNED_NEEDLE_STUBS'],
    color: '#F8FAFC',
    treatment: 'Autoclaving / dry heat sterilization followed by shredding or mutilation'
  },
  BLUE: {
    name: 'Blue (Glassware & Metallic Implants)',
    types: ['BROKEN_GLASS_AMPOULES', 'VIALS', 'METALLIC_BODY_IMPLANTS', 'ORTHOPEDIC_PINS'],
    color: '#3B82F6',
    treatment: 'Disinfection (1% Sodium Hypochlorite) or autoclaving then recycling'
  }
};

/**
 * Log bio-medical waste bag generation at ward/OT level
 */
export function logBioMedicalWaste({ department, colorCategory, wasteType, weightKg, loggedBy }) {
  if (!department) throw new Error('Department/Ward is required for BMW logging.');
  const color = (colorCategory || '').toUpperCase();
  if (!BMW_CATEGORIES[color]) {
    throw new Error(`Invalid BMW color category: ${colorCategory}. Must be YELLOW, RED, WHITE, or BLUE.`);
  }
  const weight = parseFloat(weightKg);
  if (isNaN(weight) || weight <= 0) {
    throw new Error('Weight in kg must be a positive number.');
  }

  const logId = `BMW-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const barcodeTag = `BMW-${color.substring(0, 1)}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  db.prepare(`
    INSERT INTO bmw_waste_logs (
      log_id, department, color_category, waste_type, weight_kg, barcode_tag, logged_by, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'GENERATED')
  `).run(logId, department, color, wasteType || 'GENERAL_SEGREGATED', weight, barcodeTag, loggedBy || 'STAFF_NURSE');

  return {
    success: true,
    log_id: logId,
    barcode_tag: barcodeTag,
    department,
    color_category: color,
    waste_type: wasteType,
    weight_kg: weight,
    category_guidelines: BMW_CATEGORIES[color],
    status: 'GENERATED',
    logged_at: new Date().toISOString()
  };
}

/**
 * Dispatch waste bags to Common Bio-Medical Waste Treatment Facility (CBWTF)
 */
export function dispatchToCBWTF({ logIds = [], operatorName, vehicleNumber, driverName }) {
  if (!operatorName || !vehicleNumber || !driverName) {
    throw new Error('Operator name, vehicle number, and driver name are required for CBWTF dispatch manifest.');
  }

  // Fetch target logs
  let bags;
  if (logIds.length > 0) {
    const placeholders = logIds.map(() => '?').join(',');
    bags = db.prepare(`SELECT * FROM bmw_waste_logs WHERE log_id IN (${placeholders}) AND status != 'DISPATCHED_TO_CBWTF'`).all(...logIds);
  } else {
    bags = db.prepare(`SELECT * FROM bmw_waste_logs WHERE status = 'GENERATED'`).all();
  }

  if (!bags || bags.length === 0) {
    throw new Error('No pending BMW bags available for CBWTF dispatch.');
  }

  let totalWeight = 0;
  let yellowWeight = 0;
  let redWeight = 0;
  let whiteWeight = 0;
  let blueWeight = 0;

  for (const b of bags) {
    totalWeight += b.weight_kg;
    if (b.color_category === 'YELLOW') yellowWeight += b.weight_kg;
    else if (b.color_category === 'RED') redWeight += b.weight_kg;
    else if (b.color_category === 'WHITE') whiteWeight += b.weight_kg;
    else if (b.color_category === 'BLUE') blueWeight += b.weight_kg;
  }

  const manifestId = `CBWTF-MNF-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  db.prepare(`
    INSERT INTO bmw_cbwtf_manifests (
      manifest_id, operator_name, vehicle_number, driver_name,
      total_bags, total_weight_kg, yellow_weight_kg, red_weight_kg, white_weight_kg, blue_weight_kg, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISPATCHED')
  `).run(
    manifestId, operatorName, vehicleNumber, driverName,
    bags.length, Math.round(totalWeight * 100) / 100,
    Math.round(yellowWeight * 100) / 100, Math.round(redWeight * 100) / 100,
    Math.round(whiteWeight * 100) / 100, Math.round(blueWeight * 100) / 100
  );

  const bagLogIds = bags.map(b => b.log_id);
  const updateStmt = db.prepare(`UPDATE bmw_waste_logs SET status = 'DISPATCHED_TO_CBWTF', cbwtf_manifest_id = ? WHERE log_id = ?`);
  for (const id of bagLogIds) {
    updateStmt.run(manifestId, id);
  }

  return {
    success: true,
    manifest_id: manifestId,
    operator_name: operatorName,
    vehicle_number: vehicleNumber,
    driver_name: driverName,
    total_bags_dispatched: bags.length,
    weights_kg: {
      total: Math.round(totalWeight * 100) / 100,
      yellow: Math.round(yellowWeight * 100) / 100,
      red: Math.round(redWeight * 100) / 100,
      white: Math.round(whiteWeight * 100) / 100,
      blue: Math.round(blueWeight * 100) / 100
    },
    statutory_rule: 'Bio-Medical Waste Management Rules 2016 - Rule 13 (Form IV Manifest)',
    dispatched_at: new Date().toISOString()
  };
}

/**
 * Fetch daily register and stats
 */
export function getBmwDailyRegister(filterDate = null) {
  const queryDate = filterDate || new Date().toISOString().split('T')[0];
  const logs = db.prepare(`
    SELECT * FROM bmw_waste_logs 
    WHERE DATE(logged_at) = ? 
    ORDER BY logged_at DESC
  `).all(queryDate);

  const manifests = db.prepare(`
    SELECT * FROM bmw_cbwtf_manifests 
    WHERE DATE(dispatched_at) = ? 
    ORDER BY dispatched_at DESC
  `).all(queryDate);

  const stats = db.prepare(`
    SELECT 
      color_category,
      COUNT(*) as bag_count,
      ROUND(SUM(weight_kg), 2) as total_weight_kg
    FROM bmw_waste_logs
    WHERE DATE(logged_at) = ?
    GROUP BY color_category
  `).all(queryDate);

  return {
    date: queryDate,
    logs_count: logs.length,
    manifests_count: manifests.length,
    category_breakdown: stats,
    logs,
    manifests
  };
}

/**
 * Generate Form IV Annual Report for SPCB/CPCB audit submission
 */
export function getBmwAnnualReport(year = null) {
  const queryYear = year || new Date().getFullYear().toString();
  const summary = db.prepare(`
    SELECT 
      color_category,
      COUNT(*) as total_bags,
      ROUND(SUM(weight_kg), 2) as total_weight_kg
    FROM bmw_waste_logs
    WHERE strftime('%Y', logged_at) = ?
    GROUP BY color_category
  `).all(queryYear);

  const manifestsCount = db.prepare(`
    SELECT COUNT(*) as c, ROUND(SUM(total_weight_kg), 2) as total_dispatched_kg 
    FROM bmw_cbwtf_manifests 
    WHERE strftime('%Y', dispatched_at) = ?
  `).get(queryYear);

  return {
    report: 'FORM-IV Annual Bio-Medical Waste Return',
    statutory_authority: 'State Pollution Control Board (SPCB) / Central Pollution Control Board (CPCB)',
    reporting_year: queryYear,
    summary,
    total_manifests: manifestsCount?.c || 0,
    total_dispatched_weight_kg: manifestsCount?.total_dispatched_kg || 0,
    compliance_status: 'COMPLIANT_BARCODED'
  };
}
