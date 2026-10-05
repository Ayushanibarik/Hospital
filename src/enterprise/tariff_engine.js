/**
 * ============================================================================
 * MODULE: Dynamic Tariff & Payer Pricing Engine (src/enterprise/tariff_engine.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Multi-Payer Rate Resolution Engine:
 *   - Payer Category Resolution:
 *       1. CASH (Standard hospital walk-in tariff)
 *       2. CORPORATE (Negotiated employer rate contracts)
 *       3. TPA / PRIVATE_INSURANCE (Insurance agreed package tariffs)
 *       4. GOVT_SCHEME (CGHS, PMJAY / Ayushman Bharat, ECHS subsidized caps)
 *   - Service-level discount percentage & package caps
 *   - Multi-branch site rate overrides
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── Tariff Rule Management ───────────────────────────────────────────────

/**
 * Configure payer-specific tariff rule
 */
export function setTariffRule({
  serviceCode,
  serviceName,
  department = 'GENERAL',
  payerType, // 'CASH', 'CORPORATE', 'TPA', 'GOVT_SCHEME'
  payerName = null, // e.g. 'Star Health', 'CGHS', 'TCS Corporate'
  rate,
  discountPct = 0,
  siteId = 'SITE-HQ',
  effectiveFrom = new Date().toISOString().slice(0, 10),
  effectiveTo = null
}) {
  const ruleId = genId('TRULE');

  db.prepare(`
    INSERT INTO tariff_rules (
      rule_id, service_code, service_name, department, payer_type, payer_name,
      rate, discount_pct, effective_from, effective_to, site_id, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    ruleId,
    serviceCode,
    serviceName,
    department,
    payerType,
    payerName,
    rate,
    discountPct,
    effectiveFrom,
    effectiveTo,
    siteId
  );

  return { ruleId, serviceCode, payerType, rate, discountPct };
}

// ─── Dynamic Rate Resolution ──────────────────────────────────────────────

/**
 * Resolve effective chargeable rate for a service based on payer & site
 */
export function resolveServiceRate({ serviceCode, payerType = 'CASH', payerName = null, siteId = 'SITE-HQ' }) {
  // 1. Try matching exact payer rule (e.g. Star Health specific rate)
  let rule = null;
  if (payerName) {
    rule = db.prepare(`
      SELECT * FROM tariff_rules
      WHERE service_code = ? AND payer_name = ? AND is_active = 1
        AND (site_id = ? OR site_id IS NULL)
        AND (effective_to IS NULL OR effective_to >= DATE('now'))
      ORDER BY site_id DESC LIMIT 1
    `).get(serviceCode, payerName, siteId);
  }

  // 2. Try matching general payer category (e.g. any GOVT_SCHEME or TPA)
  if (!rule) {
    rule = db.prepare(`
      SELECT * FROM tariff_rules
      WHERE service_code = ? AND payer_type = ? AND is_active = 1
        AND (site_id = ? OR site_id IS NULL)
        AND (effective_to IS NULL OR effective_to >= DATE('now'))
      ORDER BY site_id DESC LIMIT 1
    `).get(serviceCode, payerType, siteId);
  }

  // 3. Fallback to master_tariffs base rate
  if (!rule) {
    const master = db.prepare(`
      SELECT * FROM master_tariffs
      WHERE service_code = ? AND is_active = 1
        AND (site_id = ? OR site_id IS NULL)
      ORDER BY site_id DESC LIMIT 1
    `).get(serviceCode, siteId);

    if (master) {
      return {
        serviceCode,
        serviceName: master.service_name,
        department: master.department,
        payerType: 'CASH_STANDARD',
        baseRate: master.base_rate,
        discountPct: 0,
        finalChargeableRate: master.base_rate,
        source: 'MASTER_TARIFF_BASE'
      };
    }

    // Default emergency fallback
    return {
      serviceCode,
      serviceName: serviceCode,
      payerType,
      baseRate: 500,
      discountPct: 0,
      finalChargeableRate: 500,
      source: 'DEFAULT_FALLBACK'
    };
  }

  const baseRate = rule.rate;
  const discountAmount = Math.round(baseRate * (rule.discount_pct / 100) * 100) / 100;
  const finalRate = Math.round((baseRate - discountAmount) * 100) / 100;

  return {
    serviceCode: rule.service_code,
    serviceName: rule.service_name,
    department: rule.department,
    payerType: rule.payer_type,
    payerName: rule.payer_name,
    baseRate,
    discountPct: rule.discount_pct,
    discountAmount,
    finalChargeableRate: finalRate,
    source: 'PAYER_TARIFF_RULE'
  };
}

/**
 * Bulk resolve rate sheet for patient admission / visit bill items
 */
export function resolveBillCharges({ items = [], payerType = 'CASH', payerName = null, siteId = 'SITE-HQ' }) {
  let subtotal = 0;
  let totalDiscount = 0;
  let finalTotal = 0;

  const resolvedItems = items.map(item => {
    const resolved = resolveServiceRate({
      serviceCode: item.serviceCode,
      payerType,
      payerName,
      siteId
    });

    const qty = item.quantity || 1;
    const lineTotal = Math.round(resolved.finalChargeableRate * qty * 100) / 100;

    subtotal += Math.round(resolved.baseRate * qty * 100) / 100;
    totalDiscount += Math.round(resolved.discountAmount * qty * 100) / 100;
    finalTotal += lineTotal;

    return {
      serviceCode: item.serviceCode,
      serviceName: resolved.serviceName,
      quantity: qty,
      unitRate: resolved.finalChargeableRate,
      baseRate: resolved.baseRate,
      discountPct: resolved.discountPct,
      lineTotal,
      pricingSource: resolved.source
    };
  });

  return {
    payerType,
    payerName,
    itemCount: resolvedItems.length,
    subtotal: Math.round(subtotal * 100) / 100,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    finalTotal: Math.round(finalTotal * 100) / 100,
    items: resolvedItems
  };
}
