/**
 * ============================================================================
 * MODULE: Supply Chain Management - SCM (src/enterprise/scm_engine.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Multi-Echelon Hospital Inventory & Supply Chain Engine:
 *   - Warehouse & Sub-store hierarchy (Central Store, OT Store, ICU, Pharmacy)
 *   - Stock ledger with immutable transaction logs (Receipt, Issue, Transfer)
 *   - FEFO (First-Expiry-First-Out) batch tracking & expiry alerts
 *   - Purchase Order (PO) creation, approval, and Goods Receipt Note (GRN)
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── Default Warehouses Seeding ───────────────────────────────────────────

export function seedWarehouses() {
  const count = db.prepare(`SELECT COUNT(*) as c FROM warehouses`).get().c;
  if (count === 0) {
    const list = [
      ['WH-CENTRAL', 'Central Medical Warehouse', 'CENTRAL', 'SITE-HQ', 'PROCUREMENT', 'Store Incharge'],
      ['WH-PHARMA-MAIN', 'Main IPD/OPD Pharmacy', 'PHARMACY', 'SITE-HQ', 'PHARMACY', 'Chief Pharmacist'],
      ['WH-OT', 'Operation Theatre Sub-Store', 'SUB_STORE', 'SITE-HQ', 'SURGERY', 'OT Nursing Supervisor'],
      ['WH-ICU', 'ICU Crash Cart & Sub-Store', 'SUB_STORE', 'SITE-HQ', 'CRITICAL_CARE', 'ICU Head Nurse']
    ];

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO warehouses (warehouse_id, warehouse_name, warehouse_type, site_id, department, manager)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const w of list) stmt.run(...w);
  }
}

try { seedWarehouses(); } catch (e) {}

// ─── Inventory Queries & Batch Tracking ────────────────────────────────────

/**
 * Get current stock levels with optional filtering
 */
export function getInventory({ warehouseId, itemId, search, expiringDays } = {}) {
  let sql = `
    SELECT inv.*, mi.item_code, mi.item_name, mi.category, mi.uom, mi.gst_slab,
           w.warehouse_name, w.warehouse_type
    FROM inventory_items inv
    JOIN master_items mi ON inv.item_id = mi.item_id
    JOIN warehouses w ON inv.warehouse_id = w.warehouse_id
    WHERE 1=1
  `;
  const params = [];

  if (warehouseId) {
    sql += ` AND inv.warehouse_id = ?`;
    params.push(warehouseId);
  }
  if (itemId) {
    sql += ` AND inv.item_id = ?`;
    params.push(itemId);
  }
  if (search) {
    sql += ` AND (mi.item_name LIKE ? OR mi.item_code LIKE ? OR inv.batch_number LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (expiringDays) {
    sql += ` AND inv.expiry_date <= DATE('now', '+' || ? || ' days')`;
    params.push(expiringDays);
  }

  sql += ` ORDER BY inv.expiry_date ASC, mi.item_name ASC`;
  return db.prepare(sql).all(...params);
}

// ─── Stock Transactions (Receipt, Transfer, Issue) ────────────────────────

/**
 * Ingest incoming stock (Goods Receipt)
 */
export function receiveGoods({
  itemId,
  warehouseId,
  batchNumber,
  manufacturingDate,
  expiryDate,
  quantity,
  unitCost,
  mrp,
  referenceType = 'PURCHASE_ORDER',
  referenceId = null,
  performedBy = 'STORE_OFFICER',
  remarks = null
}) {
  const inventoryId = genId('INV-STK');
  const txnId = genId('TXN');

  // Check if identical batch exists in destination warehouse
  const existing = db.prepare(`
    SELECT * FROM inventory_items 
    WHERE item_id = ? AND warehouse_id = ? AND batch_number = ?
  `).get(itemId, warehouseId, batchNumber);

  if (existing) {
    db.prepare(`
      UPDATE inventory_items
      SET quantity_on_hand = quantity_on_hand + ?, unit_cost = ?, mrp = ?
      WHERE inventory_id = ?
    `).run(quantity, unitCost || existing.unit_cost, mrp || existing.mrp, existing.inventory_id);
  } else {
    db.prepare(`
      INSERT INTO inventory_items (
        inventory_id, item_id, warehouse_id, batch_number, manufacturing_date,
        expiry_date, quantity_on_hand, unit_cost, mrp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(inventoryId, itemId, warehouseId, batchNumber, manufacturingDate || null, expiryDate, quantity, unitCost || 0, mrp || 0);
  }

  // Record immutable transaction log
  db.prepare(`
    INSERT INTO stock_transactions (
      transaction_id, item_id, warehouse_id, transaction_type, quantity,
      batch_number, reference_type, reference_id, unit_cost, performed_by, remarks
    ) VALUES (?, ?, ?, 'RECEIPT', ?, ?, ?, ?, ?, ?, ?)
  `).run(txnId, itemId, warehouseId, quantity, batchNumber, referenceType, referenceId, unitCost || 0, performedBy, remarks);

  return {
    success: true,
    transactionId: txnId,
    itemId,
    warehouseId,
    batchNumber,
    quantityReceived: quantity
  };
}

/**
 * Transfer stock between echelons (e.g. Central Store -> OT Store / Pharmacy)
 */
export function transferStock({
  itemId,
  fromWarehouseId,
  toWarehouseId,
  batchNumber,
  quantity,
  performedBy = 'STORE_OFFICER',
  remarks = null
}) {
  // Check available stock in source
  const sourceStock = db.prepare(`
    SELECT * FROM inventory_items
    WHERE item_id = ? AND warehouse_id = ? AND batch_number = ?
  `).get(itemId, fromWarehouseId, batchNumber);

  if (!sourceStock || sourceStock.quantity_on_hand < quantity) {
    throw new Error(`Insufficient stock in source warehouse. Available: ${sourceStock ? sourceStock.quantity_on_hand : 0}, Requested: ${quantity}`);
  }

  // Deduct from source
  db.prepare(`
    UPDATE inventory_items
    SET quantity_on_hand = quantity_on_hand - ?
    WHERE inventory_id = ?
  `).run(quantity, sourceStock.inventory_id);

  // Add to destination
  const destStock = db.prepare(`
    SELECT * FROM inventory_items
    WHERE item_id = ? AND warehouse_id = ? AND batch_number = ?
  `).get(itemId, toWarehouseId, batchNumber);

  if (destStock) {
    db.prepare(`
      UPDATE inventory_items
      SET quantity_on_hand = quantity_on_hand + ?
      WHERE inventory_id = ?
    `).run(quantity, destStock.inventory_id);
  } else {
    db.prepare(`
      INSERT INTO inventory_items (
        inventory_id, item_id, warehouse_id, batch_number, manufacturing_date,
        expiry_date, quantity_on_hand, unit_cost, mrp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      genId('INV-STK'),
      itemId,
      toWarehouseId,
      batchNumber,
      sourceStock.manufacturing_date,
      sourceStock.expiry_date,
      quantity,
      sourceStock.unit_cost,
      sourceStock.mrp
    );
  }

  const txnId = genId('TXN');
  db.prepare(`
    INSERT INTO stock_transactions (
      transaction_id, item_id, warehouse_id, transaction_type, quantity,
      batch_number, from_warehouse_id, to_warehouse_id, performed_by, remarks
    ) VALUES (?, ?, ?, 'TRANSFER', ?, ?, ?, ?, ?, ?)
  `).run(txnId, itemId, toWarehouseId, quantity, batchNumber, fromWarehouseId, toWarehouseId, performedBy || 'STORE_OFFICER', remarks || null);

  return {
    success: true,
    transactionId: txnId,
    fromWarehouseId,
    toWarehouseId,
    quantityTransferred: quantity
  };
}

// ─── Purchase Orders ──────────────────────────────────────────────────────

/**
 * Create Purchase Order
 */
export function createPurchaseOrder({
  supplierName,
  supplierGstin,
  warehouseId = 'WH-CENTRAL',
  lines = [], // [{ itemId, quantityOrdered, unitCost, gstRate }]
  createdBy
}) {
  const poId = genId('PO');
  const poNumber = `PO/${new Date().getFullYear()}/${Date.now().toString().slice(-5)}`;

  let totalAmount = 0;
  let gstAmount = 0;

  for (const line of lines) {
    const subtotal = line.quantityOrdered * line.unitCost;
    const tax = subtotal * ((line.gstRate || 0) / 100);
    totalAmount += subtotal;
    gstAmount += tax;
  }

  const grandTotal = Math.round((totalAmount + gstAmount) * 100) / 100;

  db.prepare(`
    INSERT INTO purchase_orders (
      po_id, po_number, supplier_name, supplier_gstin, warehouse_id,
      status, total_amount, gst_amount, grand_total, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(poId, poNumber, supplierName, supplierGstin || null, warehouseId, totalAmount, gstAmount, grandTotal, createdBy || 'PURCHASE_MANAGER');

  const lineStmt = db.prepare(`
    INSERT INTO purchase_order_lines (
      line_id, po_id, item_id, quantity_ordered, unit_cost, gst_rate, total_amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const line of lines) {
    const lineTotal = line.quantityOrdered * line.unitCost * (1 + (line.gstRate || 0) / 100);
    lineStmt.run(genId('POL'), poId, line.itemId, line.quantityOrdered, line.unitCost, line.gstRate || 0, Math.round(lineTotal * 100) / 100);
  }

  return {
    poId,
    poNumber,
    supplierName,
    grandTotal,
    lineCount: lines.length,
    status: 'DRAFT'
  };
}
