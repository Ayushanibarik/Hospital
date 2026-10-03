import pino from 'pino';

/**
 * Enterprise Structured Logging Engine
 * Outputs high-throughput, structured JSON logs compliant with ELK / Datadog / CloudWatch.
 */

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() })
  }
});

/**
 * Express HTTP Request Logging Middleware
 */
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
