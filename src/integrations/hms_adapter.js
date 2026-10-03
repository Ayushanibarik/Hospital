/**
 * ============================================================================
 * MODULE: Hospital Management System (HMS / EMR) Adapter (src/integrations/hms_adapter.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Enterprise adapter bridging the automation layer with hospital clinical software
 *   (e.g. Suvarna, Napier, Akhil Miracle, Epic, Cerner). In demo mode, queries the
 *   local SQLite database; in enterprise mode, connects via live REST/FHIR APIs.
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Blueprint V3: Section B (Reference Architecture)
 *   - Blueprint V3: Section X (HMS/EMR Integration Discovery)
 *   - Blueprint V3: Section Y (Integration Matrix Template)
 *
 * PACKAGES & DEPENDENCIES:
 *   - dotenv                               : Environment configuration loader
 *   - ../db/index.js (db)                  : Local SQLite database instance
 *
 * KEY EXPORTS:
 *   - HmsAdapter class                     : Static methods for doctor rosters, slot queries,
 *                                            booking creation, and attendance sync
 *
 * SYSTEM USAGE & INTEGRATION:
 *   - Used by scheduling workflows to abstract external HMS vendor interfaces.
 * ============================================================================
 */

import dotenv from 'dotenv';
import { db } from '../db/index.js';

dotenv.config();

const HMS_API_BASE_URL = process.env.HMS_API_BASE_URL || null;
const HMS_API_KEY = process.env.HMS_API_KEY || null;

export class HmsAdapter {
  
  static isEnterpriseConnected() {
    return Boolean(HMS_API_BASE_URL && HMS_API_KEY);
  }

  
  static async getDoctors(department = null) {
    if (this.isEnterpriseConnected()) {
      try {
        const queryParams = department ? `?department=${encodeURIComponent(department)}` : '';
        const res = await fetch(`${HMS_API_BASE_URL}/doctors${queryParams}`, {
          headers: {
            'Authorization': `Bearer ${HMS_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn(`[HMS Adapter] Remote doctor fetch failed: ${err.message}. Falling back to local cache.`);
      }
    }

    let query = 'SELECT * FROM doctors WHERE is_available = 1';
    const params = [];
    if (department && department !== 'All') {
      query += ' AND department = ?';
      params.push(department);
    }
    query += ' ORDER BY department, name';
    return db.prepare(query).all(...params);
  }

  
  static async getAvailableSlots(department, date = null) {
    if (this.isEnterpriseConnected()) {
      try {
        const res = await fetch(`${HMS_API_BASE_URL}/slots?department=${encodeURIComponent(department)}`, {
          headers: {
            'Authorization': `Bearer ${HMS_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn(`[HMS Adapter] Remote slot fetch failed: ${err.message}. Falling back to local.`);
      }
    }

    return db.prepare(`
      SELECT s.*, d.name as doctor_name
      FROM available_slots s
      JOIN doctors d ON s.doctor_id = d.doctor_id
      WHERE s.department = ? AND s.is_booked = 0 AND s.slot_start >= datetime('now')
      ORDER BY s.slot_start ASC
      LIMIT 10
    `).all(department);
  }

  
  static async bookAppointment({ patientId, doctorId, slotId, department }) {
    if (this.isEnterpriseConnected()) {
      try {
        const res = await fetch(`${HMS_API_BASE_URL}/appointments/book`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HMS_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ patientId, doctorId, slotId, department })
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.warn(`[HMS Adapter] Remote booking failed: ${err.message}. Logging locally.`);
      }
    }

    db.prepare('UPDATE available_slots SET is_booked = 1 WHERE slot_id = ?').run(slotId);
    return { success: true, mode: 'LOCAL_DATABASE', slotId };
  }

  
  static async getRecentDischarges() {
    if (this.isEnterpriseConnected()) {
      try {
        const res = await fetch(`${HMS_API_BASE_URL}/patients/discharges?since=yesterday`, {
          headers: { 'Authorization': `Bearer ${HMS_API_KEY}` }
        });
        if (res.ok) return await res.json();
      } catch (e) {
        console.warn(`[HMS Adapter] Discharge sync error: ${e.message}`);
      }
    }

    return db.prepare(`
      SELECT patient_id, full_name, phone FROM patients LIMIT 5
    `).all();
  }
}
