/**
 * ============================================================================
 * MODULE: Multi-Site & Master Data Management (src/enterprise/multi_site.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Manages multi-branch hospital network configuration, centralized master data
 *   (tariffs, item codes), and site-level administrative control.
 *
 * FEATURES:
 *   - Site/branch CRUD with ABDM facility ID tracking
 *   - Centralized tariff master with payer-specific rate sheets
 *   - Item code master with HSN/SAC and GST slab mapping
 *   - Cross-site data visibility controls
 * ============================================================================
 */

import crypto from 'node:crypto';
import { db } from '../db/index.js';

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ─── Site Management ────────────────────────────────────────────────────

export function createSite({ site_name, site_code, address, city, state, pincode, phone, abdm_facility_id, license_number }) {
  const siteId = genId('SITE');
  db.prepare(`
    INSERT INTO sites (site_id, site_name, site_code, address, city, state, pincode, phone, abdm_facility_id, license_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(siteId, site_name, site_code, address || null, city || null, state || null, pincode || null, phone || null, abdm_facility_id || null, license_number || null);
  return { site_id: siteId, site_name, site_code };
}

export function getSites(activeOnly = true) {
  if (activeOnly) return db.prepare(`SELECT * FROM sites WHERE is_active = 1 ORDER BY site_name`).all();
  return db.prepare(`SELECT * FROM sites ORDER BY site_name`).all();
}

export function updateSite(siteId, updates) {
  const allowed = ['site_name', 'address', 'city', 'state', 'pincode', 'phone', 'abdm_facility_id', 'license_number', 'is_active'];
  const sets = [];
  const params = [];
  for (const [k, v] of Object.entries(updates)) {
    if (allowed.includes(k)) { sets.push(`${k} = ?`); params.push(v); }
  }
  if (sets.length === 0) return { updated: false };
  params.push(siteId);
  db.prepare(`UPDATE sites SET ${sets.join(', ')} WHERE site_id = ?`).run(...params);
  return { updated: true, site_id: siteId };
}

// ─── Tariff Master ──────────────────────────────────────────────────────

export function createTariff({ service_code, service_name, department, base_rate, payer_type, rate, site_id, effective_from, effective_to }) {
  const tariffId = genId('TRF');
  db.prepare(`
    INSERT INTO master_tariffs (tariff_id, service_code, service_name, department, base_rate, payer_type, rate, site_id, effective_from, effective_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tariffId, service_code, service_name, department || null, base_rate || rate, payer_type || 'CASH', rate, site_id || null, effective_from || null, effective_to || null);
  return { tariff_id: tariffId, service_code, payer_type: payer_type || 'CASH', rate };
}

export function getTariffs({ service_code, payer_type, department, site_id } = {}) {
  let sql = `SELECT * FROM master_tariffs WHERE is_active = 1`;
  const params = [];
  if (service_code) { sql += ` AND service_code = ?`; params.push(service_code); }
  if (payer_type) { sql += ` AND payer_type = ?`; params.push(payer_type); }
  if (department) { sql += ` AND department = ?`; params.push(department); }
  if (site_id) { sql += ` AND (site_id = ? OR site_id IS NULL)`; params.push(site_id); }
  sql += ` ORDER BY service_code, payer_type`;
  return db.prepare(sql).all(...params);
}

export function updateTariff(tariffId, updates) {
  const allowed = ['service_name', 'base_rate', 'rate', 'effective_from', 'effective_to', 'is_active', 'department'];
  const sets = [];
  const params = [];
  for (const [k, v] of Object.entries(updates)) {
    if (allowed.includes(k)) { sets.push(`${k} = ?`); params.push(v); }
  }
  if (sets.length === 0) return { updated: false };
  params.push(tariffId);
  db.prepare(`UPDATE master_tariffs SET ${sets.join(', ')} WHERE tariff_id = ?`).run(...params);
  return { updated: true, tariff_id: tariffId };
}

// ─── Item Code Master ───────────────────────────────────────────────────

export function createItem({ item_code, item_name, category, sub_category, uom, hsn_sac_code, gst_slab }) {
  const itemId = genId('ITEM');
  db.prepare(`
    INSERT INTO master_items (item_id, item_code, item_name, category, sub_category, uom, hsn_sac_code, gst_slab)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(itemId, item_code, item_name, category, sub_category || null, uom || 'EACH', hsn_sac_code || null, gst_slab || 0);
  return { item_id: itemId, item_code, item_name, category };
}

export function getItems({ category, search, limit = 50 } = {}) {
  let sql = `SELECT * FROM master_items WHERE is_active = 1`;
  const params = [];
  if (category) { sql += ` AND category = ?`; params.push(category); }
  if (search) { sql += ` AND (item_name LIKE ? OR item_code LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  sql += ` ORDER BY item_name LIMIT ?`;
  params.push(limit);
  return db.prepare(sql).all(...params);
}

export function updateItem(itemId, updates) {
  const allowed = ['item_name', 'category', 'sub_category', 'uom', 'hsn_sac_code', 'gst_slab', 'is_active'];
  const sets = [];
  const params = [];
  for (const [k, v] of Object.entries(updates)) {
    if (allowed.includes(k)) { sets.push(`${k} = ?`); params.push(v); }
  }
  if (sets.length === 0) return { updated: false };
  params.push(itemId);
  db.prepare(`UPDATE master_items SET ${sets.join(', ')} WHERE item_id = ?`).run(...params);
  return { updated: true, item_id: itemId };
}
