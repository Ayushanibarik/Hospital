/**
 * ============================================================================
 * MODULE: Enterprise Structured Logging Engine (src/utils/logger.js)
 * ============================================================================
 * 
 * DESCRIPTION:
 *   High-throughput JSON logging engine built on Pino. Formats output for modern log
 *   aggregators (ELK, Datadog, CloudWatch) and provides Express middleware for request
 *   timing and correlation ID tracing.
 *
 * BLUEPRINT MODULES & SECTIONS:
 *   - Blueprint V3: Section F (Naming Conventions & Correlation IDs)
 *   - Blueprint V3: Section Z (Error Handling & Idempotency)
 *
 * PACKAGES & DEPENDENCIES:
 *   - pino                                 : Fast JSON logger
 *
 * KEY EXPORTS:
 *   - logger                               : Configured Pino logger instance
 *   - requestLogger(req, res, next)        : Express HTTP request logging middleware
 *
 * SYSTEM USAGE & INTEGRATION:
 *   - Attached to the Express app in src/server.js and used across utility modules.
 * ============================================================================
 */

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() })
  }
});

export function requestLogger(req, res, next) {
  const start = Date.now();
  const correlationId = req.headers['x-correlation-id'] || `REQ-${Date.now().toString().slice(-6)}`;
  req.correlationId = correlationId;

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      correlationId,
      ip: req.ip || req.socket.remoteAddress
    };

    if (res.statusCode >= 500) {
      logger.error(logData, `Server Error on ${req.method} ${req.url}`);
    } else if (res.statusCode >= 400) {
      logger.warn(logData, `Client Warning on ${req.method} ${req.url}`);
    } else {
      logger.info(logData, `Completed ${req.method} ${req.url}`);
    }
  });

  next();
}

export default logger;
