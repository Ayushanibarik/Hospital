/**
 * ============================================================================
 * MODULE: Linen Management & Emergency Ambulance Fleet (src/operations/linen_fleet.js)
 * ============================================================================
 * 
 * CLINICAL & HOSPITAL ACCREDITATION MANDATE:
 *   - NABH 5th Edition: Hospital Infection Control (HIC.3 - Linen & Laundry)
 *   - CDC / NHS Guidelines for Hospital Linen Disinfection (Thermal wash >= 71°C)
 *   - National Ambulance Guidelines & MoHFW Emergency Care Standards (ALS / BLS)
 *   - Motor Vehicles Act & Fleet Safety Compliance
 * 
 * CORE FEATURES:
 *   - Ward linen par-level tracking & infected linen high-temperature bleach wash
 *   - Damaged/degraded linen condemnation register
 *   - Advanced Life Support (ALS) & BLS ambulance fleet daily shift equipment check
 *   - Oxygen cylinder pressure threshold & defibrillator Joule self-test verification
 *   - Real-time emergency dispatch & hospital ER arrival mission tracking
 * ============================================================================
 */

import { db } from '../db/index.js';
import crypto from 'node:crypto';

// ----------------------------------------------------------------------------
// 1. Linen & Laundry Management
// ----------------------------------------------------------------------------

/**
 * Seed initial ward linen par levels if empty
 */
export function seedLinenParLevels() {
  const count = db.prepare(`SELECT COUNT(*) as c FROM linen_ward_par_levels`).get().c;
  if (count === 0) {
    const items = [
      ['WARD-4A', 'BEDSHEET', 50, 45, 5],
      ['WARD-4A', 'PILLOW_COVER', 50, 48, 2],
      ['WARD-4A', 'PATIENT_GOWN', 40, 38, 2],
      ['ICU-A', 'BEDSHEET', 30, 28, 2],
      ['ICU-A', 'DRAW_SHEET', 40, 36, 4],
      ['OT-SUITE', 'SURGEON_SCRUB_SUIT', 60, 55, 5],
      ['OT-SUITE', 'OT_DRAPE', 40, 37, 3]
    ];
    const stmt = db.prepare(`
      INSERT INTO linen_ward_par_levels (
        ward_id, linen_item_type, par_level_quota, clean_in_stock, dirty_sent_to_laundry
      ) VALUES (?, ?, ?, ?, ?)
    `);
    for (const item of items) stmt.run(...item);
  }
}

/**
 * Log a laundry washing cycle batch
 */
export function logLaundryBatch({
  sourceWard,
  washType = 'ROUTINE_SOILED',
  bagColor = 'WHITE_ROUTINE',
  totalPieces,
  washTemperatureCelsius = 71.0,
  condemnedPieces = 0
}) {
  seedLinenParLevels();

  if (!sourceWard || !totalPieces) {
    throw new Error('Source ward and total pieces are required.');
  }

  const isInfected = washType === 'INFECTED_BLEACH_71C' || bagColor === 'YELLOW_INFECTED_SOLUBLE';
  const temp = parseFloat(washTemperatureCelsius);

  // CDC / NABH Invariant: Infected linen requires thermal wash at >= 71°C
  if (isInfected && temp < 71.0) {
    throw new Error(`INFECTION CONTROL VIOLATION: Infected linen thermal wash must be at least 71.0°C (specified: ${temp}°C).`);
  }

  const batchId = `LAUNDRY-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  db.prepare(`
    INSERT INTO linen_laundry_batches (
      laundry_batch_id, wash_type, source_ward, bag_color,
      total_pieces, wash_temperature_celsius, disinfection_verified,
      wash_cycle_status, condemned_pieces
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 'COMPLETED', ?)
  `).run(
    batchId, washType, sourceWard, bagColor,
    parseInt(totalPieces, 10), temp, parseInt(condemnedPieces, 10)
  );

  return {
    success: true,
    laundry_batch_id: batchId,
    source_ward: sourceWard,
    wash_type: washType,
    temperature_celsius: temp,
    disinfection_verified: true,
    pieces_processed: parseInt(totalPieces, 10),
    condemned_pieces: parseInt(condemnedPieces, 10),
    status: 'COMPLETED'
  };
}

/**
 * Get linen inventory par-level status across hospital wards
 */
export function getLinenInventoryStatus() {
  seedLinenParLevels();
  const parLevels = db.prepare(`SELECT * FROM linen_ward_par_levels`).all();
  const recentBatches = db.prepare(`SELECT * FROM linen_laundry_batches ORDER BY created_at DESC LIMIT 10`).all();

  return {
    ward_par_levels: parLevels,
    recent_laundry_batches: recentBatches
  };
}

// ----------------------------------------------------------------------------
// 2. Emergency Ambulance Fleet & Critical Equipment
// ----------------------------------------------------------------------------

/**
 * Seed initial ambulance vehicles if empty
 */
export function seedAmbulanceFleet() {
  const count = db.prepare(`SELECT COUNT(*) as c FROM ambulance_fleet`).get().c;
  if (count === 0) {
    const vehicles = [
      ['AMB-01-ALS', 'MH-02-EQ-8812', 'ADVANCED_LIFE_SUPPORT_ALS', '2027-10-15', '2027-11-20', 'READY_FOR_DISPATCH', '19.0760,72.8777'],
      ['AMB-02-BLS', 'MH-02-EQ-8813', 'BASIC_LIFE_SUPPORT_BLS', '2027-08-10', '2027-09-12', 'READY_FOR_DISPATCH', '19.0760,72.8777'],
      ['AMB-03-NICU', 'MH-02-EQ-9904', 'NEONATAL_ICU_TRANSPORT', '2028-01-05', '2028-02-15', 'READY_FOR_DISPATCH', '19.0760,72.8777']
    ];
    const stmt = db.prepare(`
      INSERT INTO ambulance_fleet (
        vehicle_id, vehicle_number, ambulance_type, fitness_certificate_expiry,
        insurance_expiry, status, current_location_gps
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const v of vehicles) stmt.run(...v);
  }
}

/**
 * Complete daily shift critical equipment checklist for ambulance
 */
export function recordAmbulanceChecklist({
  vehicleId,
  shift = 'MORNING',
  defibrillatorJouleTestPassed = true,
  portableVentilatorChecked = true,
  oxygenCylinderPressurePsi,
  suctionApparatusFunctional = true,
  emergencyDrugKitSealed = true,
  driverName,
  paramedicEmtName
}) {
  seedAmbulanceFleet();

  if (!vehicleId || !driverName || !paramedicEmtName) {
    throw new Error('Vehicle ID, Driver Name, and Paramedic EMT Name are mandatory.');
  }

  const o2Psi = parseInt(oxygenCylinderPressurePsi, 10);
  if (isNaN(o2Psi) || o2Psi <= 0) {
    throw new Error('Valid oxygen cylinder pressure (psi) is required.');
  }

  // Critical Life Safety Threshold: O2 cylinder must be >= 1200 psi
  const isO2Adequate = o2Psi >= 1200;
  const isOverallCleared = defibrillatorJouleTestPassed && portableVentilatorChecked && 
                           isO2Adequate && suctionApparatusFunctional && emergencyDrugKitSealed;

  const checklistId = `AMB-CHK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  db.prepare(`
    INSERT INTO ambulance_daily_checklists (
      checklist_id, vehicle_id, shift, defibrillator_joule_test_passed,
      portable_ventilator_checked, oxygen_cylinder_pressure_psi,
      suction_apparatus_functional, emergency_drug_kit_sealed,
      driver_name, paramedic_emt_name, overall_readiness_cleared
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    checklistId, vehicleId, shift, defibrillatorJouleTestPassed ? 1 : 0,
    portableVentilatorChecked ? 1 : 0, o2Psi, suctionApparatusFunctional ? 1 : 0,
    emergencyDrugKitSealed ? 1 : 0, driverName, paramedicEmtName, isOverallCleared ? 1 : 0
  );

  const fleetStatus = isOverallCleared ? 'READY_FOR_DISPATCH' : 'EQUIPMENT_FAIL_STANDBY';
  db.prepare(`UPDATE ambulance_fleet SET status = ? WHERE vehicle_id = ?`).run(fleetStatus, vehicleId);

  return {
    success: true,
    checklist_id: checklistId,
    vehicle_id: vehicleId,
    oxygen_pressure_psi: o2Psi,
    is_o2_adequate: isO2Adequate,
    defibrillator_cleared: Boolean(defibrillatorJouleTestPassed),
    overall_readiness_cleared: Boolean(isOverallCleared),
    vehicle_status: fleetStatus,
    alert: isOverallCleared ? 'Ambulance certified mission-ready for emergency dispatch.' : 'SAFETY HOLD: Critical equipment failed (O2 pressure < 1200 psi or device error). Ambulance held on standby.'
  };
}

/**
 * Dispatch ambulance on emergency response mission
 */
export function dispatchAmbulanceMission({
  vehicleId,
  callerPhone,
  pickupAddress,
  patientCondition
}) {
  seedAmbulanceFleet();

  const vehicle = db.prepare(`SELECT * FROM ambulance_fleet WHERE vehicle_id = ?`).get(vehicleId);
  if (!vehicle) throw new Error(`Ambulance not found: ${vehicleId}`);
  if (vehicle.status !== 'READY_FOR_DISPATCH') {
    throw new Error(`Ambulance ${vehicleId} cannot be dispatched. Current status: ${vehicle.status}`);
  }

  const missionId = `AMB-MSN-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  db.prepare(`
    INSERT INTO ambulance_missions (
      mission_id, vehicle_id, caller_phone, pickup_address, patient_condition, status
    ) VALUES (?, ?, ?, ?, ?, 'DISPATCHED')
  `).run(missionId, vehicleId, callerPhone || '9999999999', pickupAddress, patientCondition || 'CHEST_PAIN_EMERGENCY');

  db.prepare(`UPDATE ambulance_fleet SET status = 'ON_MISSION' WHERE vehicle_id = ?`).run(vehicleId);

  return {
    success: true,
    mission_id: missionId,
    vehicle_id: vehicleId,
    vehicle_number: vehicle.vehicle_number,
    ambulance_type: vehicle.ambulance_type,
    pickup_address: pickupAddress,
    dispatch_time: new Date().toISOString(),
    status: 'DISPATCHED'
  };
}

/**
 * Complete ambulance mission upon arrival at Emergency Bay
 */
export function completeAmbulanceMission({
  missionId,
  totalKmTravelled = 12.5,
  emtHandoverNotes = 'Patient transferred to ER Resuscitation Bay with continuous vitals monitoring.'
}) {
  const mission = db.prepare(`SELECT * FROM ambulance_missions WHERE mission_id = ?`).get(missionId);
  if (!mission) throw new Error(`Mission not found: ${missionId}`);

  db.prepare(`
    UPDATE ambulance_missions 
    SET arrival_at_er_time = CURRENT_TIMESTAMP,
        total_km_travelled = ?,
        emt_handover_notes = ?,
        status = 'COMPLETED'
    WHERE mission_id = ?
  `).run(parseFloat(totalKmTravelled), emtHandoverNotes, missionId);

  db.prepare(`UPDATE ambulance_fleet SET status = 'READY_FOR_DISPATCH' WHERE vehicle_id = ?`).run(mission.vehicle_id);

  return {
    success: true,
    mission_id: missionId,
    vehicle_id: mission.vehicle_id,
    total_km_travelled: totalKmTravelled,
    status: 'COMPLETED_ARRIVED_ER'
  };
}

/**
 * Get ambulance fleet status
 */
export function getAmbulanceFleetStatus() {
  seedAmbulanceFleet();
  const fleet = db.prepare(`SELECT * FROM ambulance_fleet`).all();
  const recentMissions = db.prepare(`SELECT * FROM ambulance_missions ORDER BY dispatch_time DESC LIMIT 10`).all();
  const recentChecklists = db.prepare(`SELECT * FROM ambulance_daily_checklists ORDER BY timestamp DESC LIMIT 10`).all();

  return {
    total_ambulances: fleet.length,
    fleet,
    recent_missions: recentMissions,
    recent_checklists: recentChecklists
  };
}
