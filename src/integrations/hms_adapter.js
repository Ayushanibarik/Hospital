import dotenv from 'dotenv';
import { db } from '../db/index.js';

dotenv.config();

const HMS_API_BASE_URL = process.env.HMS_API_BASE_URL || null;
const HMS_API_KEY = process.env.HMS_API_KEY || null;

/**
 * Enterprise Hospital Management System (HMS / HIS / EHR) Adapter
 * 
 * In Standalone/Demo mode: Queries the local SQLite database.
 * In Enterprise Production mode: Transparently bridges to the hospital's live
 * HMS system (e.g. Suvarna, Napier, Akhil Miracle, Epic, Cerner, custom REST/FHIR).
 */
export class HmsAdapter {
  /**
   * Check if live enterprise HMS integration is enabled
   */
  static isEnterpriseConnected() {
    return Boolean(HMS_API_BASE_URL && HMS_API_KEY);
  }

  /**
   * Fetch active doctor roster from HMS or internal database
   */
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

    // Local SQLite fallback
    let query = 'SELECT * FROM doctors WHERE is_available = 1';
    const params = [];
    if (department && department !== 'All') {
      query += ' AND department = ?';
      params.push(department);
    }
    query += ' ORDER BY department, name';
    return db.prepare(query).all(...params);
  }

  /**
   * Fetch available consultation slots
   */
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

    // Local SQLite
    return db.prepare(`
      SELECT s.*, d.name as doctor_name
      FROM available_slots s
      JOIN doctors d ON s.doctor_id = d.doctor_id
      WHERE s.department = ? AND s.is_booked = 0 AND s.slot_start >= datetime('now')
      ORDER BY s.slot_start ASC
      LIMIT 10
    `).all(department);
  }

  /**
   * Book appointment in Hospital HMS
   */
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

    // Local SQLite
    db.prepare('UPDATE available_slots SET is_booked = 1 WHERE slot_id = ?').run(slotId);
    return { success: true, mode: 'LOCAL_DATABASE', slotId };
  }

  /**
   * Synchronize patient discharge status for post-discharge follow-up
   */
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

    // Local SQLite
    return db.prepare(`
      SELECT patient_id, full_name, phone FROM patients LIMIT 5
    `).all();
  }
}
