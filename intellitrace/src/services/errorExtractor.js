/**
 * Error Extraction & Stack Trace Parser Service
 * Extracts real technical exception details from structured logs and failed spans.
 */

const { sanitizeString, sanitizeObject } = require('../utils/sanitizer');

/**
 * Parses raw stack trace to identify application source file and function name.
 * Never invents file names or line numbers.
 */
function parseStackTrace(rawStack) {
    if (!rawStack || typeof rawStack !== 'string') {
        return {
            sourceFile: 'Source file information unavailable.',
            sourceFunction: 'Function information unavailable.',
            lineNumber: null,
            cleanStack: null
        };
    }

    const sanitizedStack = sanitizeString(rawStack);
    const lines = sanitizedStack.split('\n');

    let sourceFile = 'Source file information unavailable.';
    let sourceFunction = 'Function information unavailable.';
    let lineNumber = null;

    // Regex to match typical Node/V8 stack frame:
    // at functionName (path/to/file.js:42:15) OR at path/to/file.js:42:15
    const stackRegex = /^\s*at\s+(?:([^\s(]+)\s+\((.+?):(\d+):(\d+)\)|(.+?):(\d+):(\d+))/;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(stackRegex);
        if (match) {
            const fn = match[1] || 'anonymous';
            const filePath = match[2] || match[5];
            const lineNum = parseInt(match[3] || match[6], 10);

            // Filter out node internals and node_modules
            if (filePath && !filePath.includes('node:internal') && !filePath.includes('node_modules')) {
                // Normalize Windows or POSIX path to readable relative path
                let normalizedPath = filePath.replace(/\\/g, '/');
                const projectRootIndex = normalizedPath.indexOf('/e-commerce/');
                if (projectRootIndex !== -1) {
                    normalizedPath = normalizedPath.substring(projectRootIndex + 1);
                } else {
                    const intellitraceIndex = normalizedPath.indexOf('/intellitrace/');
                    if (intellitraceIndex !== -1) {
                        normalizedPath = normalizedPath.substring(intellitraceIndex + 1);
                    }
                }

                sourceFile = normalizedPath;
                sourceFunction = fn;
                lineNumber = isNaN(lineNum) ? null : lineNum;
                break;
            }
        }
    }

    return {
        sourceFile,
        sourceFunction,
        lineNumber,
        cleanStack: sanitizedStack
    };
}

/**
 * Categorizes an error based on its type and message.
 */
function categorizeError(errorType, errorMessage) {
    const combined = `${errorType || ''} ${errorMessage || ''}`.toLowerCase();
    if (combined.includes('mongo') || combined.includes('timeout') && combined.includes('db') || combined.includes('query')) {
        return 'database';
    }
    if (combined.includes('econnrefused') || combined.includes('service_communication') || combined.includes('upstream') || combined.includes('downstream')) {
        return 'communication';
    }
    if (combined.includes('delay') || combined.includes('slow') || combined.includes('latency')) {
        return 'latency';
    }
    if (combined.includes('concurrency') || combined.includes('spike') || combined.includes('overload') || combined.includes('capacity')) {
        return 'capacity';
    }
    if (combined.includes('cascade') || combined.includes('cascading')) {
        return 'cascade';
    }
    return 'internal_error';
}

/**
 * Extracts error details from a log document or failed span.
 */
function extractErrorDetails(logOrSpan) {
    if (!logOrSpan) return null;

    let errorType = null;
    let errorMessage = null;
    let rawStack = null;
    let route = logOrSpan.route || logOrSpan.targetRoute || logOrSpan.targetOperation || null;
    let method = logOrSpan.method || null;
    let statusCode = logOrSpan.statusCode || logOrSpan.status || null;
    let service = logOrSpan.service || logOrSpan.serviceName || logOrSpan.sourceService || 'unknown-service';
    let requestId = logOrSpan.requestId || null;
    let traceId = logOrSpan.traceId || null;
    let spanId = logOrSpan.spanId || null;
    let database = logOrSpan.database || null;
    let timestamp = logOrSpan.timestamp || new Date();

    // Check if it's a log with error/stack fields
    if (logOrSpan.error) {
        if (typeof logOrSpan.error === 'string') {
            errorMessage = logOrSpan.error;
        } else if (typeof logOrSpan.error === 'object') {
            errorMessage = logOrSpan.error.message || JSON.stringify(logOrSpan.error);
            errorType = logOrSpan.error.name || null;
            rawStack = logOrSpan.error.stack || null;
        }
    }

    if (logOrSpan.errorMessage && !errorMessage) {
        errorMessage = logOrSpan.errorMessage;
    }

    if (logOrSpan.stack && !rawStack) {
        rawStack = logOrSpan.stack;
    }

    // Check message string for exception formatting
    if (!errorMessage && logOrSpan.message) {
        errorMessage = logOrSpan.message;
    }

    // If span has events or tags
    if (logOrSpan.events && Array.isArray(logOrSpan.events)) {
        for (const ev of logOrSpan.events) {
            if (ev.fields) {
                if (ev.fields['exception.message'] && !errorMessage) errorMessage = ev.fields['exception.message'];
                if (ev.fields['exception.type'] && !errorType) errorType = ev.fields['exception.type'];
                if (ev.fields['exception.stacktrace'] && !rawStack) rawStack = ev.fields['exception.stacktrace'];
            }
        }
    }

    // Try extracting errorType from errorMessage or rawStack
    if (rawStack && !errorType) {
        const firstLine = rawStack.split('\n')[0];
        const colonIdx = firstLine.indexOf(':');
        if (colonIdx > 0) {
            errorType = firstLine.substring(0, colonIdx).trim();
            if (!errorMessage) {
                errorMessage = firstLine.substring(colonIdx + 1).trim();
            }
        }
    }

    if (!errorType && errorMessage) {
        if (errorMessage.includes('MongoServerSelectionError')) errorType = 'MongoServerSelectionError';
        else if (errorMessage.includes('MongoTimeoutError')) errorType = 'MongoTimeoutError';
        else if (errorMessage.includes('ECONNREFUSED')) errorType = 'ECONNREFUSED';
        else if (errorMessage.includes('TypeError')) errorType = 'TypeError';
        else if (errorMessage.includes('AxiosError')) errorType = 'AxiosError';
        else if (errorMessage.includes('500') || statusCode === 500) errorType = 'HTTP 500 InternalServerError';
        else if (errorMessage.includes('503') || statusCode === 503) errorType = 'HTTP 503 ServiceUnavailable';
        else errorType = 'ApplicationError';
    }

    // Parse stack trace
    const stackInfo = parseStackTrace(rawStack);

    // Default fallbacks according to requirements
    const finalErrorMessage = errorMessage ? sanitizeString(errorMessage) : 'Exact error message not available. Review related logs and traces.';
    const finalErrorType = errorType ? sanitizeString(errorType) : 'Unspecified Application Error';

    if (finalErrorMessage.toLowerCase().includes('mongo') || (logOrSpan.message && logOrSpan.message.toLowerCase().includes('mongo'))) {
        database = database || 'mongodb';
    }

    return {
        errorType: finalErrorType,
        errorMessage: finalErrorMessage,
        stackTrace: stackInfo.cleanStack,
        sourceFile: stackInfo.sourceFile,
        sourceFunction: stackInfo.sourceFunction,
        lineNumber: stackInfo.lineNumber,
        route,
        method,
        statusCode: statusCode ? Number(statusCode) : null,
        service,
        requestId,
        traceId,
        spanId,
        database,
        category: categorizeError(finalErrorType, finalErrorMessage),
        timestamp
    };
}

module.exports = {
    parseStackTrace,
    categorizeError,
    extractErrorDetails
};

