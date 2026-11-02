const winston = require('winston');
const telemetry = require('./telemetry');

const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'card', 'cvv', 'cookie'];
const sanitizeString = (str) => {
    if (!str || typeof str !== 'string') return str;
    return str
        .replace(/(?:password|secret|token|apiKey|api_key|auth|authorization)\s*[:=]\s*["']?([^"',\s]+)["']?/gi, (m, val) => m.replace(val, '[REDACTED]'))
        .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
        .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}/g, '[REDACTED_JWT]');
};

const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return typeof obj === 'string' ? sanitizeString(obj) : obj;
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f))) {
            sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'string') {
            sanitized[key] = sanitizeString(value);
        } else if (typeof value === 'object' && value !== null) {
            sanitized[key] = Array.isArray(value) ? value.map(sanitize) : sanitize(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
};

const myFormat = winston.format.printf((info) => {
    const serviceName = process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'product-service';
    const logObj = {
        timestamp: new Date().toISOString(),
        level: info.level.toUpperCase(),
        service: serviceName,
        originatingService: info.originatingService || serviceName,
        reportingService: info.reportingService || null,
        environment: process.env.NODE_ENV || 'development',
        message: sanitizeString(info.message),
        ...info
    };
    logObj.service = serviceName;
    delete logObj.level;
    logObj.level = info.level.toUpperCase();

    // Explicitly preserve non-enumerable Error properties
    if (info.error) {
        const err = info.error;
        logObj.error = {
            name: err.name || 'Error',
            message: err.message || (typeof err === 'string' ? err : ''),
            stack: err.stack || info.stack || null
        };
        if (logObj.error.stack && !logObj.stack) {
            logObj.stack = logObj.error.stack;
        }
    } else if (info.stack) {
        logObj.error = {
            name: info.errorName || 'Error',
            message: info.message || 'Error occurred',
            stack: info.stack
        };
    }

    try {
        const { trace } = require('@opentelemetry/api');
        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
            const spanCtx = activeSpan.spanContext();
            if (spanCtx && spanCtx.traceId) {
                logObj.traceId = spanCtx.traceId;
                logObj.spanId = spanCtx.spanId;
            }
        }
    } catch (_) {}

    const sanitizedLog = sanitize(logObj);
    telemetry.sendLog(JSON.stringify(sanitizedLog));
    return JSON.stringify(sanitizedLog);
});

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        myFormat
    ),
    transports: [
        new winston.transports.Console()
    ]
});

module.exports = logger;
