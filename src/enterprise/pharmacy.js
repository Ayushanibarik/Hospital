/**
 * ============================================================================
 * MODULE: Pharmacy & Dispensing Operations (src/enterprise/pharmacy.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Clinical and Retail Pharmacy Operations Engine:
 *   - Prescription queue processing (OPD & Inpatient orders)
 *   - Automated FEFO (First-Expired-First-Out) batch allocation
 *   - Real-time inventory deduction from dispensing pharmacy warehouse
 *   - Patient medication label and dosage instruction verification
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { logDataAccess } from '../compliance/dpdp_engine.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── Prescription Queue & Pending Dispenses ───────────────────────────────

/**
 * Get pending prescriptions waiting for pharmacy dispensing
 */
export function getPendingPrescriptions({ limit = 50 } = {}) {
  return db.prepare(`
    SELECT p.*, pt.name as patient_name, pt.phone as patient_phone, d.name as doctor_name
    FROM prescriptions p
    JOIN patients pt ON p.patient_id = pt.patient_id
    JOIN doctors d ON p.doctor_id = d.doctor_id
    WHERE p.status = 'ACTIVE'
    ORDER BY p.created_at ASC
    LIMIT ?
  `).all(limit);
}

// ─── FEFO Dispensing Workflow ─────────────────────────────────────────────

/**
 * Dispense medication items for a prescription using FEFO batch selection
 */
export function dispensePrescriptionItems({
  prescriptionId,
  warehouseId = 'WH-PHARMA-MAIN',
  dispensedBy,
  itemsToDispense = [] // [{ itemId, quantity }]
}) {
  const rx = db.prepare(`SELECT * FROM prescriptions WHERE prescription_id = ?`).get(prescriptionId);
  if (!rx) throw new Error('Prescription not found.');

  const dispensedResults = [];

  for (const reqItem of itemsToDispense) {
    const requestedQty = Number(reqItem.quantity || 1);
    let remainingToFulfill = requestedQty;

    // Retrieve batches in FEFO order (earliest expiry first, with stock > 0)
    const availableBatches = db.prepare(`
      SELECT * FROM inventory_items
      WHERE item_id = ? AND warehouse_id = ? AND quantity_on_hand > 0
      ORDER BY expiry_date ASC
    `).all(reqItem.itemId, warehouseId);

    if (availableBatches.length === 0) {
      throw new Error(`Out of stock for item ID: ${reqItem.itemId} in warehouse: ${warehouseId}`);
    }

    for (const batch of availableBatches) {
      if (remainingToFulfill <= 0) break;

      const takeQty = Math.min(batch.quantity_on_hand, remainingToFulfill);
      const unitPrice = batch.mrp || batch.unit_cost || 0;
      const totalPrice = Math.round(takeQty * unitPrice * 100) / 100;

      // Deduct from inventory
      db.prepare(`
        UPDATE inventory_items
        SET quantity_on_hand = quantity_on_hand - ?
        WHERE inventory_id = ?
      `).run(takeQty, batch.inventory_id);

      // Record dispensing record
      const dispensingId = genId('DISP');
      db.prepare(`
        INSERT INTO dispensing_records (
          dispensing_id, prescription_id, patient_id, item_id, warehouse_id,
          batch_number, quantity_dispensed, unit_price, total_price, dispensed_by, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISPENSED', CURRENT_TIMESTAMP)
      `).run(
        dispensingId,
        prescriptionId,
        rx.patient_id,
        reqItem.itemId,
        warehouseId,
        batch.batch_number,
        takeQty,
        unitPrice,
        totalPrice,
        dispensedBy || 'PHARMACIST'
      );

      // Log stock ledger transaction
      db.prepare(`
        INSERT INTO stock_transactions (
          transaction_id, item_id, warehouse_id, transaction_type, quantity,
          batch_number, reference_type, reference_id, performed_by, remarks
        ) VALUES (?, ?, ?, 'DISPENSE', ?, ?, 'PRESCRIPTION', ?, ?, 'Prescription dispense')
      `).run(
        genId('TXN'),
        reqItem.itemId,
        warehouseId,
        takeQty,
        batch.batch_number,
        prescriptionId,
        dispensedBy
      );

      dispensedResults.push({
        dispensingId,
        itemId: reqItem.itemId,
        batchNumber: batch.batch_number,
        expiryDate: batch.expiry_date,
        quantityDispensed: takeQty,
        unitPrice,
        totalPrice
      });

      remainingToFulfill -= takeQty;
    }

    if (remainingToFulfill > 0) {
      throw new Error(`Insufficient stock to fulfill entire quantity for item ID: ${reqItem.itemId}. Missing: ${remainingToFulfill}`);
    }
  }

  // Update prescription status to DISPENSED
  db.prepare(`UPDATE prescriptions SET status = 'DISPENSED' WHERE prescription_id = ?`).run(prescriptionId);

  logDataAccess({
    userId: dispensedBy,
    patientId: rx.patient_id,
    resourceType: 'PHARMACY_DISPENSE',
    resourceId: prescriptionId,
    action: 'DISPENSE_PRESCRIPTION',
    accessReason: `Dispensed ${dispensedResults.length} batches`
  });

  return {
    success: true,
    prescriptionId,
    patientId: rx.patient_id,
    warehouseId,
    dispensedItems: dispensedResults,
    status: 'DISPENSED'
  };
}

/**
 * Get dispensing history for a patient
 */
export function getPatientDispensingHistory(patientId) {
  return db.prepare(`
    SELECT dr.*, mi.item_name, mi.item_code, mi.uom
    FROM dispensing_records dr
    JOIN master_items mi ON dr.item_id = mi.item_id
    WHERE dr.patient_id = ?
    ORDER BY dr.created_at DESC
  `).all(patientId);
}
