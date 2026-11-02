const fs = require('fs');
const path = require('path');
const rootDir = require('../utils/pathutil');
const asyncLocalStorage = require('../utils/asyncContext');

const logsDir = path.join(rootDir, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const appLogStream = fs.createWriteStream(path.join(logsDir, 'app.log'), { flags: 'a' });
const errorLogStream = fs.createWriteStream(path.join(logsDir, 'error.log'), { flags: 'a' });

const SENSITIVE_FIELDS = [
    'password', 'passwordHash', 'token', 'accessToken', 'refreshToken',
    'cookie', 'sessionSecret', 'cardNumber', 'cvv', 'bankAccount',
    'payment credentials'
];

const sanitizeString = (str) => {
    if (!str || typeof str !== 'string') return str;
    return str
        .replace(/(?:password|passwordHash|secret|token|apiKey|api_key|auth|authorization)\s*[:=]\s*["']?([^"',\s]+)["']?/gi, (m, val) => m.replace(val, '[REDACTED]'))
        .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
        .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}/g, '[REDACTED_JWT]');
};

const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return typeof obj === 'string' ? sanitizeString(obj) : obj;
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_FIELDS.includes(key) || key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
            sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'string') {
            sanitized[key] = sanitizeString(value);
        } else if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                sanitized[key] = value.map(item => typeof item === 'object' ? sanitize(item) : sanitizeString(item));
            } else {
                sanitized[key] = sanitize(value);
            }
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
};

const formatLog = (level, message, meta = {}) => {
    const timestamp = new Date().toISOString();
    
    let finalMeta = { ...meta };
    const store = asyncLocalStorage.getStore();
    if (store && store.has('requestId') && !finalMeta.requestId) {
        finalMeta.requestId = store.get('requestId');
    }

    try {
        const { trace } = require('@opentelemetry/api');
        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
            const spanCtx = activeSpan.spanContext();
            if (spanCtx && spanCtx.traceId) {
                finalMeta.traceId = spanCtx.traceId;
                finalMeta.spanId = spanCtx.spanId;
            }
        }
    } catch (_) {}

    let logMessage = message;
    if (message instanceof Error) {
        if (!finalMeta.error) finalMeta.error = message;
        logMessage = message.message;
    }

    // Explicitly preserve non-enumerable Error properties
    if (finalMeta.error) {
        const errObj = finalMeta.error;
        finalMeta.error = {
            name: errObj.name || (errObj.constructor ? errObj.constructor.name : 'Error'),
            message: errObj.message || (typeof errObj === 'string' ? errObj : ''),
            stack: errObj.stack || finalMeta.stack || null
        };
        if (!finalMeta.stack && finalMeta.error.stack) {
            finalMeta.stack = finalMeta.error.stack;
        }
    } else if (finalMeta.stack) {
        finalMeta.error = {
            name: finalMeta.errorName || 'Error',
            message: typeof logMessage === 'string' ? logMessage : 'Error occurred',
            stack: finalMeta.stack
        };
    }

    const sanitizedMeta = sanitize(finalMeta);
    const serviceName = process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'intellishop-gateway';

    const logEntry = {
        timestamp,
        level,
        service: serviceName,
        environment: process.env.NODE_ENV || 'development',
        message: sanitizeString(logMessage),
        ...sanitizedMeta
    };

    return JSON.stringify(logEntry);
};

// Forward to IntelliTrace backend if available (Phase 5)
const intellitraceIntegration = require('../utils/intellitrace-integration');

const writeLog = (level, message, meta = {}) => {
    const logString = formatLog(level, message, meta);
    
    if (level === 'ERROR') {
        errorLogStream.write(logString + '\n');
        console.error(logString);
    } else if (level === 'WARN') {
        appLogStream.write(logString + '\n');
        console.warn(logString);
    } else {
        appLogStream.write(logString + '\n');
        console.log(logString);
    }
    
    // Asynchronously send to IntelliTrace without blocking
    intellitraceIntegration.sendLog(logString);
};

const logger = {
    info: (message, meta) => writeLog('INFO', message, meta),
    warn: (message, meta) => writeLog('WARN', message, meta),
    error: (message, meta) => writeLog('ERROR', message, meta)
};

module.exports = logger;