import { db } from '../db/index.js';

/**
 * Hospital AI Automation - MCP Tools Definition & Implementation
 * Section V of Blueprint V3
 */

export const MCP_TOOLS_SCHEMA = [
  {
    name: 'get_appointment_slots',
    description: 'Lookup available appointment slots for a hospital department and target date.',
    inputSchema: {
      type: 'object',
      properties: {
        department: { type: 'string', description: 'Department name (e.g. Cardiology, Dermatology, Orthopedics, General Medicine)' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (optional)' },
        duration_minutes: { type: 'number', description: 'Duration in minutes (default 30)' }
      },
      required: ['department']
    }
  },
  {
    name: 'create_followup_task',
    description: 'Create an administrative follow-up task for hospital staff.',
    inputSchema: {
      type: 'object',
      properties: {
        patient_id: { type: 'string', description: 'Patient ID (e.g. DEMO-001)' },
        category: { type: 'string', description: 'Follow-up category (post_discharge, routine, no_show_recovery)' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        owner: { type: 'string', description: 'Assigned staff owner / role' }
      },
      required: ['patient_id', 'category', 'due_date']
    }
  },
  {
    name: 'get_daily_operations_summary',
    description: 'Fetch aggregated operational metrics for hospital administration and daily reporting.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        department_optional: { type: 'string', description: 'Filter by department (optional)' }
      }
    }
  }
];

export async function executeMcpTool(toolName, args = {}) {
  switch (toolName) {
    case 'get_appointment_slots': {
      const { department, date } = args;
      let query = `
        SELECT s.slot_id, s.department, s.slot_start, s.slot_end, d.name as doctor_name, d.room_number
        FROM available_slots s
        JOIN doctors d ON s.doctor_id = d.doctor_id
        WHERE s.is_booked = 0
      `;
      const params = [];

      if (department) {
        query += ` AND s.department = ?`;
        params.push(department);
      }
      if (date) {
        query += ` AND s.slot_start LIKE ?`;
        params.push(`${date}%`);
      }

      query += ` ORDER BY s.slot_start ASC LIMIT 10`;

      const slots = db.prepare(query).all(...params);
      return {
        department: department || 'All',
        count: slots.length,
        available_slots: slots
      };
    }

    case 'create_followup_task': {
      const { patient_id, category, due_date, owner = 'Patient Care Coordinator' } = args;
      
      const patient = db.prepare(`SELECT * FROM patients WHERE patient_id = ?`).get(patient_id);
      if (!patient) {
        throw new Error(`Patient ${patient_id} does not exist`);
      }

      const taskId = `FOL-MCP-${Date.now().toString().slice(-6)}`;
      db.prepare(`
        INSERT INTO follow_ups (followup_id, patient_id, category, approved_date, owner, status)
        VALUES (?, ?, ?, ?, ?, 'PENDING')
      `).run(taskId, patient_id, category, due_date, owner);

      return {
        task_id: taskId,
        patient_id,
        category,
        due_date,
        owner,
        status: 'CREATED'
      };
    }

    case 'get_daily_operations_summary': {
      const { department_optional } = args;

      const totalLeads = db.prepare(`SELECT COUNT(*) as count FROM leads`).get().count;
      const bookedAppts = db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE status = 'CONFIRMED'`).get().count;
      const noShows = db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE attendance_status = 'no_show'`).get().count;
      const recoveredNoShows = db.prepare(`SELECT COUNT(*) as count FROM follow_ups WHERE category = 'no_show_recovery'`).get().count;
      const openExceptions = db.prepare(`SELECT COUNT(*) as count FROM exceptions WHERE status = 'OPEN'`).get().count;
      const messagesSent = db.prepare(`SELECT COUNT(*) as count FROM communication_logs`).get().count;

      return {
        metrics: {
          new_leads: totalLeads,
          qualified_leads: totalLeads,
          booked_appointments: bookedAppts,
          no_shows: noShows,
          recovered_no_shows: recoveredNoShows,
          open_exceptions: openExceptions,
          messages_delivered: messagesSent,
          department_filter: department_optional || 'All'
        }
      };
    }

    default:
      throw new Error(`Tool ${toolName} not supported`);
  }
}
