/**
 * ============================================================================
 * MODULE: GST & Taxation Engine (src/compliance/gst_engine.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Comprehensive Indian Goods & Services Tax (GST) engine for Healthcare:
 *   - Healthcare services exemption handling (Notification 12/2017)
 *   - Room rent taxation rule (> ₹5,000/day non-ICU room slab: 5% GST)
 *   - Pharma & consumable multi-slab calculation (0%, 5%, 12%, 18%, 28%)
 *   - Intra-state (CGST + SGST 50/50 split) vs Inter-state (IGST 100%)
 *   - HSN/SAC master classification
 *   - E-Invoice IRN (Invoice Reference Number) generation
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── Default HSN/SAC Code Master ──────────────────────────────────────────

const DEFAULT_HSN_SAC = [
  // Healthcare Services (SAC 9993)
  { code: '999311', description: 'Inpatient healthcare services by clinical establishment', gst_rate: 0, category: 'SERVICE_EXEMPT' },
  { code: '999312', description: 'Medical and dental consultation / outpatient services', gst_rate: 0, category: 'SERVICE_EXEMPT' },
  { code: '999313', description: 'Cosmetic / aesthetic surgery services (taxable)', gst_rate: 18, category: 'SERVICE_TAXABLE' },
  { code: '999314', description: 'Ambulance transport services', gst_rate: 0, category: 'SERVICE_EXEMPT' },
  { code: '999315', description: 'Hospital room rent exceeding Rs 5,000 per day (non-ICU)', gst_rate: 5, category: 'SERVICE_ROOM_RENT' },

  // Pharmaceutical Products & Consumables (HSN 3004 / 9018 / 3005)
  { code: '3004', description: 'Medicaments consisting of mixed or unmixed products for therapeutic uses', gst_rate: 12, category: 'PHARMA_STANDARD' },
  { code: '3002', description: 'Vaccines, blood products, diagnostic kits', gst_rate: 5, category: 'PHARMA_CONCESSIONAL' },
  { code: '3006', description: 'Pharmaceutical goods (sterile surgical catgut, dental cements)', gst_rate: 12, category: 'CONSUMABLES' },
  { code: '9018', description: 'Medical, surgical, dental or veterinary instruments and appliances', gst_rate: 12, category: 'EQUIPMENT' },
  { code: '9021', description: 'Orthopaedic appliances, splints, artificial limbs, pacemakers', gst_rate: 5, category: 'IMPLANTS' },
  { code: '4015', description: 'Surgical rubber gloves and disposable medical wear', gst_rate: 18, category: 'DISPOSABLES' }
];

export function seedGstMaster() {
  const count = db.prepare(`SELECT COUNT(*) as c FROM gst_hsn_sac_master`).get().c;
  if (count === 0) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO gst_hsn_sac_master (
        hsn_sac_id, hsn_sac_code, description, gst_rate, cgst_rate, sgst_rate, igst_rate, category
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of DEFAULT_HSN_SAC) {
      const halfRate = item.gst_rate / 2;
      stmt.run(
        genId('HSN'),
        item.code,
        item.description,
        item.gst_rate,
        halfRate,
        halfRate,
        item.gst_rate,
        item.category
      );
    }
  }
}

// Auto-seed on load
try { seedGstMaster(); } catch (e) {}

// ─── GST Calculation Engine ───────────────────────────────────────────────

/**
 * Calculate line-level and summary GST for hospital items/services
 */
export function calculateGst({ items, supplierState = 'Maharashtra', recipientState = 'Maharashtra', hospitalGstin = '27AAAAA0000A1Z5', recipientGstin = null }) {
  const isInterState = supplierState.toLowerCase() !== recipientState.toLowerCase();
  const supplyType = isInterState ? 'INTER_STATE' : 'INTRA_STATE';

  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;
  let grandTotal = 0;

  const processedLines = items.map((item, index) => {
    const qty = item.quantity || 1;
    const rate = Number(item.unitRate || item.rate || 0);
    const taxableAmount = Math.round(qty * rate * 100) / 100;
    
    // Resolve GST rate from HSN/SAC or explicit rate
    let gstRate = item.gstRate;
    if (gstRate === undefined || gstRate === null) {
      if (item.hsnSacCode) {
        const master = db.prepare(`SELECT gst_rate FROM gst_hsn_sac_master WHERE hsn_sac_code = ?`).get(item.hsnSacCode);
        gstRate = master ? master.gst_rate : 0;
      } else {
        // Default healthcare service is exempt (0%)
        gstRate = 0;
      }
    }

    // Check special rule: Non-ICU room rent > 5000/day has 5% GST
    if (item.isRoomRent && !item.isIcu && rate > 5000) {
      gstRate = 5;
    }

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (gstRate > 0) {
      if (isInterState) {
        igstAmount = Math.round(taxableAmount * (gstRate / 100) * 100) / 100;
      } else {
        cgstAmount = Math.round(taxableAmount * (gstRate / 200) * 100) / 100;
        sgstAmount = Math.round(taxableAmount * (gstRate / 200) * 100) / 100;
      }
    }

    const lineTotal = Math.round((taxableAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

    totalTaxable += taxableAmount;
    totalCgst += cgstAmount;
    totalSgst += sgstAmount;
    totalIgst += igstAmount;
    grandTotal += lineTotal;

    return {
      lineIndex: index + 1,
      itemDescription: item.description || item.itemName || 'Healthcare service',
      hsnSacCode: item.hsnSacCode || '999311',
      quantity: qty,
      unitRate: rate,
      taxableAmount,
      gstRate,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalAmount: lineTotal
    };
  });

  return {
    supplyType,
    supplierState,
    recipientState,
    hospitalGstin,
    recipientGstin,
    totalTaxable: Math.round(totalTaxable * 100) / 100,
    totalCgst: Math.round(totalCgst * 100) / 100,
    totalSgst: Math.round(totalSgst * 100) / 100,
    totalIgst: Math.round(totalIgst * 100) / 100,
    totalCess: 0,
    grandTotal: Math.round(grandTotal * 100) / 100,
    lines: processedLines
  };
}

/**
 * Generate and persist GST Tax Invoice
 */
export function generateGstInvoice({ billId, patientId, items, supplierState = 'Maharashtra', recipientState = 'Maharashtra', gstinSupplier, gstinRecipient }) {
  const calc = calculateGst({ items, supplierState, recipientState, hospitalGstin: gstinSupplier, recipientGstin: gstinRecipient });
  const invoiceId = genId('INV');
  const invoiceNumber = `GST/${new Date().getFullYear()}/${Date.now().toString().slice(-6)}`;

  // Generate IRN (Invoice Reference Number) SHA-256 standard
  const irnSeed = `${invoiceNumber}:${calc.hospitalGstin}:${calc.grandTotal}:${Date.now()}`;
  const irnNumber = crypto.createHash('sha256').update(irnSeed).digest('hex').toUpperCase();

  db.prepare(`
    INSERT INTO gst_invoices (
      invoice_id, bill_id, patient_id, invoice_number, invoice_date, supply_type, place_of_supply,
      gstin_supplier, gstin_recipient, total_taxable, total_cgst, total_sgst, total_igst,
      total_cess, grand_total, irn_number, e_invoice_status, created_at
    ) VALUES (?, ?, ?, ?, DATE('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'GENERATED', CURRENT_TIMESTAMP)
  `).run(
    invoiceId,
    billId || null,
    patientId,
    invoiceNumber,
    calc.supplyType,
    recipientState,
    calc.hospitalGstin,
    calc.recipientGstin,
    calc.totalTaxable,
    calc.totalCgst,
    calc.totalSgst,
    calc.totalIgst,
    calc.totalCess,
    calc.grandTotal,
    irnNumber
  );

  const lineStmt = db.prepare(`
    INSERT INTO gst_invoice_lines (
      line_id, invoice_id, item_description, hsn_sac_code, quantity, unit_rate,
      taxable_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, cess_amount, total_amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);

  for (const line of calc.lines) {
    lineStmt.run(
      genId('LINE'),
      invoiceId,
      line.itemDescription,
      line.hsnSacCode,
      line.quantity,
      line.unitRate,
      line.taxableAmount,
      line.gstRate,
      line.cgstAmount,
      line.sgstAmount,
      line.igstAmount,
      line.totalAmount
    );
  }

  return {
    invoiceId,
    invoiceNumber,
    irnNumber,
    grandTotal: calc.grandTotal,
    taxSummary: {
      taxable: calc.totalTaxable,
      cgst: calc.totalCgst,
      sgst: calc.totalSgst,
      igst: calc.totalIgst
    },
    lineCount: calc.lines.length
  };
}

/**
 * Fetch invoice details by bill ID or invoice ID
 */
export function getGstInvoice(invoiceOrBillId) {
  let invoice = db.prepare(`SELECT * FROM gst_invoices WHERE invoice_id = ? OR bill_id = ?`).get(invoiceOrBillId, invoiceOrBillId);
  if (!invoice) return null;

  const lines = db.prepare(`SELECT * FROM gst_invoice_lines WHERE invoice_id = ?`).all(invoice.invoice_id);
  return { ...invoice, lines };
}
