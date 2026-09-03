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

const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_FIELDS.includes(key) || key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
            sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                 sanitized[key] = value.map(item => typeof item === 'object' ? sanitize(item) : item);
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

    const sanitizedMeta = sanitize(finalMeta);

    const logEntry = {
        timestamp,
        level,
        service: "intellishop",
        environment: process.env.NODE_ENV || "development",
        message,
        ...sanitizedMeta
    };

    return JSON.stringify(logEntry);
};

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
};

const logger = {
    info: (message, meta) => writeLog('INFO', message, meta),
    warn: (message, meta) => writeLog('WARN', message, meta),
    error: (message, meta) => writeLog('ERROR', message, meta)
};

module.exports = logger;