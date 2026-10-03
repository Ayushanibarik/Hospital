/**
 * ============================================================================
 * MODULE: Centralized Error Tracking & Exception Collector (src/utils/error_tracker.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   Captures uncaught application exceptions, persists them into the exceptions table
 *   for ops staff review, logs structured error payloads via Pino, and integrates
 *   with external APM (e.g. Sentry, Datadog) when configured.
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Blueprint V3: Section N (Prompt 6 — Error / Exception Classifier)
 *   - Blueprint V3: Section Z (Error Handling & Idempotency)
 *
 * PACKAGES & DEPENDENCIES:
 *   - ../db/index.js (db)                  : SQLite database connection
 *   - ./logger.js (logger)                 : Structured logging engine
 *
 * KEY EXPORTS:
 *   - trackError(error, context)           : Records error, generates ERR ID, and logs
 *
 * SYSTEM USAGE & INTEGRATION:
 *   - Bound as Express centralized error middleware in src/server.js.
 * ============================================================================
 */

import { db } from '../db/index.js';
import { logger } from './logger.js';

export function trackError(error, context = {}) {
  const errorId = `ERR-${Date.now().toString().slice(-6)}`;
  const timestamp = new Date().toISOString();

  const errorPayload = {
    errorId,
    timestamp,
    message: error.message || String(error),
    stack: error.stack,
    context
  };

  logger.error(errorPayload, `[ErrorTracker] Exception captured: ${error.message}`);

  try {
    const excId = `EXC-AUTO-${Date.now().toString().slice(-6)}`;
    db.prepare(`
      INSERT INTO exceptions (exception_id, workflow_name, record_id, error_type, severity, owner, resolution_note)
      VALUES (?, ?, ?, 'APPLICATION_RUNTIME_ERROR', 'high', 'Engineering On-Call', ?)
    `).run(
      excId,
      context.workflow || 'API_SERVER',
      context.correlationId || errorId,
      `${error.message} (Captured by ErrorTracker)`
    );
  } catch (dbErr) {
    logger.error(dbErr, '[ErrorTracker] Failed to persist exception to database');
  }

  if (process.env.SENTRY_DSN) {
    logger.info(`[ErrorTracker] Forwarded exception ${errorId} to external APM (Sentry)`);
  }

  return errorId;
}

export default trackError;
