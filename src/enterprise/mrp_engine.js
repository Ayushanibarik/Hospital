/**
 * ============================================================================
 * MODULE: Material Requirements Planning - MRP (src/enterprise/mrp_engine.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Automated Inventory Replenishment & Demand Forecasting:
 *   - Consumption-velocity analysis from historical stock issues & dispenses
 *   - Dynamic Reorder Point (ROP) & Safety Stock calculation:
 *       ROP = (Average Daily Consumption * Lead Time Days) + Safety Stock
 *   - Auto-generation of intelligent Purchase Requisitions
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── Reorder Rules Configuration ──────────────────────────────────────────

/**
 * Configure or update MRP reorder parameters for an item in a warehouse
 */
export function setReorderRule({
  itemId,
  warehouseId = 'WH-CENTRAL',
  reorderPoint,
  reorderQuantity,
  safetyStock = 10,
  leadTimeDays = 7
}) {
  const ruleId = genId('RULE');

  const existing = db.prepare(`SELECT * FROM reorder_rules WHERE item_id = ? AND warehouse_id = ?`).get(itemId, warehouseId);

  if (existing) {
    db.prepare(`
      UPDATE reorder_rules
      SET reorder_point = ?, reorder_quantity = ?, safety_stock = ?, lead_time_days = ?, is_active = 1
      WHERE rule_id = ?
    `).run(reorderPoint, reorderQuantity, safetyStock, leadTimeDays, existing.rule_id);
    return { ruleId: existing.rule_id, updated: true };
  }

  db.prepare(`
    INSERT INTO reorder_rules (
      rule_id, item_id, warehouse_id, reorder_point, reorder_quantity,
      safety_stock, lead_time_days, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(ruleId, itemId, warehouseId, reorderPoint, reorderQuantity, safetyStock, leadTimeDays);

  return { ruleId, created: true };
}

// ─── Automated Reorder Analysis & PO Suggestions ──────────────────────────

/**
 * Analyze consumption velocity and generate reorder recommendations
 */
export function getReorderSuggestions({ warehouseId = 'WH-CENTRAL' } = {}) {
  // Pull all active reorder rules along with current total stock on hand
  const rules = db.prepare(`
    SELECT rr.*, mi.item_name, mi.item_code, mi.uom, mi.gst_slab,
           COALESCE(SUM(inv.quantity_on_hand), 0) as current_stock
    FROM reorder_rules rr
    JOIN master_items mi ON rr.item_id = mi.item_id
    LEFT JOIN inventory_items inv ON rr.item_id = inv.item_id AND rr.warehouse_id = inv.warehouse_id
    WHERE rr.is_active = 1 AND (rr.warehouse_id = ? OR ? IS NULL)
    GROUP BY rr.rule_id
  `).all(warehouseId, warehouseId);

  const suggestions = [];

  for (const rule of rules) {
    // Calculate average daily consumption over past 30 days from stock_transactions
    const consumptionRow = db.prepare(`
      SELECT COALESCE(SUM(quantity), 0) as total_consumed
      FROM stock_transactions
      WHERE item_id = ? AND warehouse_id = ?
        AND transaction_type IN ('DISPENSE', 'ISSUE')
        AND created_at >= DATETIME('now', '-30 days')
    `).get(rule.item_id, rule.warehouse_id);

    const avgDaily = Math.round((consumptionRow.total_consumed / 30) * 100) / 100;
    
    // Dynamic ROP calculation
    const calculatedRop = Math.ceil((avgDaily * rule.lead_time_days) + rule.safety_stock);
    const effectiveRop = Math.max(rule.reorder_point, calculatedRop);

    const isBelowRop = rule.current_stock <= effectiveRop;
    const recommendedOrderQty = isBelowRop ? Math.max(rule.reorder_quantity, (effectiveRop - rule.current_stock) + rule.reorder_quantity) : 0;

    if (isBelowRop) {
      suggestions.push({
        ruleId: rule.rule_id,
        itemId: rule.item_id,
        itemCode: rule.item_code,
        itemName: rule.item_name,
        uom: rule.uom,
        warehouseId: rule.warehouse_id,
        currentStock: rule.current_stock,
        reorderPoint: effectiveRop,
        safetyStock: rule.safety_stock,
        avgDailyConsumption: avgDaily,
        leadTimeDays: rule.lead_time_days,
        recommendedOrderQuantity: recommendedOrderQty,
        urgency: rule.current_stock <= rule.safety_stock ? 'CRITICAL_STOCKOUT_RISK' : 'REORDER_NEEDED'
      });
    }
  }

  return {
    warehouseId,
    totalRulesEvaluated: rules.length,
    suggestionCount: suggestions.length,
    suggestions
  };
}
