/**
 * Telemetry and Error Sanitization Utility
 * Redacts passwords, API keys, tokens, session secrets, and payment credentials.
 */

const SENSITIVE_PATTERNS = [
    // Bearer / Authorization tokens
    { regex: /bearer\s+([a-zA-Z0-9_\-\.]{15,})/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
    // JWT tokens
    { regex: /eyJ[a-zA-Z0-9_\-]{10,}\.eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}/g, replacement: '[REDACTED_JWT]' },
    // Key/Password pairs in JSON or query strings
    { regex: /(password|secret|apiKey|api_key|token|auth_token|access_token|private_key|creditCard|cvv|card_number)["']?\s*[:=]\s*["']?([^"',\s&]+)["']?/gi, replacement: '$1: "[REDACTED]"' },
    // Credit card number patterns (13-16 digits with optional hyphens/spaces)
    { regex: /\b(?:\d{4}[ -]?){3}\d{4}\b/g, replacement: '[REDACTED_CARD]' },
    // MongoDB connection strings containing passwords
    { regex: /mongodb(\+srv)?:\/\/([^:]+):([^@]+)@/gi, replacement: 'mongodb$1://$2:[REDACTED_PASSWORD]@' }
];

function sanitizeString(str) {
    if (!str || typeof str !== 'string') return str;
    let sanitized = str;
    for (const { regex, replacement } of SENSITIVE_PATTERNS) {
        sanitized = sanitized.replace(regex, replacement);
    }
    return sanitized;
}

function sanitizeObject(obj, seen = new WeakSet()) {
    if (!obj || typeof obj !== 'object') {
        return typeof obj === 'string' ? sanitizeString(obj) : obj;
    }

    if (seen.has(obj)) {
        return '[Circular Reference]';
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item, seen));
    }

    const SENSITIVE_KEYS = new Set([
        'password', 'secret', 'apikey', 'api_key', 'token', 'authtoken',
        'auth_token', 'accesstoken', 'access_token', 'privatekey', 'private_key',
        'creditcard', 'credit_card', 'cvv', 'cardnumber', 'card_number'
    ]);

    const sanitized = {};
    for (const [key, val] of Object.entries(obj)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''))) {
            sanitized[key] = '[REDACTED]';
        } else if (typeof val === 'string') {
            sanitized[key] = sanitizeString(val);
        } else if (typeof val === 'object' && val !== null) {
            sanitized[key] = sanitizeObject(val, seen);
        } else {
            sanitized[key] = val;
        }
    }
    return sanitized;
}

module.exports = {
    sanitizeString,
    sanitizeObject
};

