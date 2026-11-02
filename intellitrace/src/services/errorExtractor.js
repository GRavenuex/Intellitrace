/**
 * Error Extraction & Stack Trace Parser Service
 * Extracts real technical exception details from structured logs and failed spans.
 */

const { sanitizeString, sanitizeObject } = require('../utils/sanitizer');

/**
 * Parses raw stack trace to identify application source file, function name, and line/col.
 * Never invents file names or line numbers.
 */
function parseStackTrace(rawStack) {
    if (!rawStack || typeof rawStack !== 'string') {
        return {
            sourceFile: 'Source file information unavailable.',
            sourceFunction: 'Function information unavailable.',
            lineNumber: null,
            columnNumber: null,
            cleanStack: null
        };
    }

    const sanitizedStack = sanitizeString(rawStack);
    const lines = sanitizedStack.split('\n');

    let sourceFile = 'Source file information unavailable.';
    let sourceFunction = 'Function information unavailable.';
    let lineNumber = null;
    let columnNumber = null;

    // Regex for Node / V8 stack frames:
    // 1) at (async )?functionName (path:line:col)
    // 2) at path:line:col
    const stackRegex = /^\s*at\s+(?:(?:async\s+)?([^\s(]+)\s+\((.+?):(\d+):(\d+)\)|(.+?):(\d+):(\d+))/;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(stackRegex);
        if (match) {
            const fn = match[1] || 'anonymous';
            const filePath = match[2] || match[5];
            const lineNum = parseInt(match[3] || match[6], 10);
            const colNum = parseInt(match[4] || match[7], 10);

            // Filter out node internals and node_modules
            if (filePath && !filePath.includes('node:internal') && !filePath.includes('node_modules')) {
                let normalizedPath = filePath.replace(/\\/g, '/');

                const projectRootIndex = normalizedPath.indexOf('/e-commerce/');
                if (projectRootIndex !== -1) {
                    normalizedPath = normalizedPath.substring(projectRootIndex + 1);
                } else {
                    const intellitraceIndex = normalizedPath.indexOf('/intellitrace/');
                    if (intellitraceIndex !== -1) {
                        normalizedPath = normalizedPath.substring(intellitraceIndex + 1);
                    } else if (normalizedPath.startsWith('/app/')) {
                        normalizedPath = normalizedPath.replace(/^\/app\//, '');
                    }
                }

                sourceFile = normalizedPath;
                sourceFunction = fn;
                lineNumber = isNaN(lineNum) ? null : lineNum;
                columnNumber = isNaN(colNum) ? null : colNum;
                break;
            }
        }
    }

    return {
        sourceFile,
        sourceFunction,
        lineNumber,
        columnNumber,
        cleanStack: sanitizedStack
    };
}

/**
 * Identifies database involvement: 'MongoDB', 'Not involved', or 'Unknown'.
 */
function identifyDatabase(logOrSpan, errorType, errorMessage) {
    if (logOrSpan && logOrSpan.database) {
        const dbLower = String(logOrSpan.database).toLowerCase();
        if (dbLower.includes('mongo')) return 'MongoDB';
        if (dbLower.includes('not involved')) return 'Not involved';
        if (dbLower.includes('unknown')) return 'Unknown';
    }

    const combined = `${errorType || ''} ${errorMessage || ''} ${logOrSpan?.message || ''}`.toLowerCase();
    if (combined.includes('mongo') || combined.includes('mongoose')) {
        return 'MongoDB';
    }
    if (combined.includes('econnrefused') || combined.includes('networkerror') || combined.includes('service_communication')) {
        return 'Not involved';
    }
    if (combined.includes('validation') || combined.includes('bad request')) {
        return 'Not involved';
    }

    return 'Not involved';
}

/**
 * Categorizes an error into one of the 8 required technical categories:
 * - database_connection_error
 * - database_query_error
 * - application_error
 * - validation_error
 * - dependency_error
 * - timeout_error
 * - network_error
 * - internal_error
 */
function categorizeError(errorType, errorMessage, logOrSpan = {}) {
    if (logOrSpan.category) {
        const cat = String(logOrSpan.category).toLowerCase();
        const validCategories = [
            'database_connection_error',
            'database_query_error',
            'application_error',
            'validation_error',
            'dependency_error',
            'timeout_error',
            'network_error',
            'internal_error'
        ];
        if (validCategories.includes(cat)) return cat;
    }

    const combined = `${errorType || ''} ${errorMessage || ''} ${logOrSpan.message || ''}`.toLowerCase();

    // Database connection errors
    if (
        combined.includes('mongoserverselectionerror') ||
        combined.includes('mongonetworkerror') ||
        (combined.includes('mongo') && (combined.includes('connect') || combined.includes('topology') || combined.includes('econnrefused')))
    ) {
        return 'database_connection_error';
    }

    // Database query errors
    if (
        combined.includes('mongotimeouterror') ||
        combined.includes('mongoerror') ||
        combined.includes('casterror') ||
        combined.includes('duplicate key') ||
        combined.includes('database_timeout') ||
        (combined.includes('mongo') && combined.includes('operation'))
    ) {
        return 'database_query_error';
    }

    // Network / Service communication errors
    if (
        combined.includes('econnrefused') ||
        combined.includes('enotfound') ||
        combined.includes('econnreset') ||
        combined.includes('networkerror') ||
        combined.includes('service_communication_failure')
    ) {
        return 'network_error';
    }

    // Timeout errors
    if (
        combined.includes('timeouterror') ||
        combined.includes('etimedout') ||
        combined.includes('gateway timeout') ||
        (combined.includes('timeout') && !combined.includes('mongo'))
    ) {
        return 'timeout_error';
    }

    // Validation errors
    if (
        combined.includes('validationerror') ||
        combined.includes('bad request') ||
        logOrSpan.statusCode === 400 ||
        logOrSpan.status === 400
    ) {
        return 'validation_error';
    }

    // Dependency errors
    if (
        combined.includes('dependency_error') ||
        combined.includes('badgateway') ||
        combined.includes('service_unavailable') ||
        logOrSpan.statusCode === 502 ||
        logOrSpan.statusCode === 503 ||
        logOrSpan.statusCode === 504 ||
        (combined.includes('responded with 50') && !combined.includes('internal'))
    ) {
        return 'dependency_error';
    }

    // Application programming errors
    if (
        combined.includes('typeerror') ||
        combined.includes('referenceerror') ||
        combined.includes('syntaxerror') ||
        combined.includes('rangeerror') ||
        combined.includes('cannot read property') ||
        combined.includes('is not a function')
    ) {
        return 'application_error';
    }

    // Internal server errors
    return 'internal_error';
}

/**
 * Extracts comprehensive technical error details from a log document or failed span.
 */
function extractErrorDetails(logOrSpan) {
    if (!logOrSpan) return null;

    let errorType = null;
    let errorMessage = null;
    let rawStack = null;
    let route = logOrSpan.route || logOrSpan.targetRoute || logOrSpan.targetOperation || null;
    let method = logOrSpan.method || null;
    let statusCode = logOrSpan.statusCode || logOrSpan.status || null;

    // Distinguish Originating, Reporting, and Affected services
    let service = logOrSpan.service || logOrSpan.serviceName || 'unknown-service';
    let originatingService = logOrSpan.originatingService || service;
    let reportingService = logOrSpan.reportingService || service;
    let affectedServices = Array.isArray(logOrSpan.affectedServices)
        ? logOrSpan.affectedServices
        : [service, originatingService].filter((v, i, a) => v && a.indexOf(v) === i);

    let requestId = logOrSpan.requestId || null;
    let traceId = logOrSpan.traceId || null;
    let spanId = logOrSpan.spanId || null;
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
        else if (errorMessage.includes('ReferenceError')) errorType = 'ReferenceError';
        else if (errorMessage.includes('ValidationError')) errorType = 'ValidationError';
        else if (errorMessage.includes('NetworkError')) errorType = 'NetworkError';
        else if (errorMessage.includes('500') || statusCode === 500) errorType = 'HTTP 500 InternalServerError';
        else if (errorMessage.includes('503') || statusCode === 503) errorType = 'HTTP 503 ServiceUnavailable';
        else errorType = 'ApplicationError';
    }

    // Parse stack trace
    const stackInfo = parseStackTrace(rawStack);

    // Default fallbacks according to requirements
    const finalErrorMessage = errorMessage ? sanitizeString(errorMessage) : 'Exact error message not available. Review related logs and traces.';
    const finalErrorType = errorType ? sanitizeString(errorType) : 'Unspecified Application Error';

    const database = identifyDatabase(logOrSpan, finalErrorType, finalErrorMessage);
    const category = categorizeError(finalErrorType, finalErrorMessage, logOrSpan);

    return {
        errorType: finalErrorType,
        errorMessage: finalErrorMessage,
        stackTrace: stackInfo.cleanStack,
        sourceFile: stackInfo.sourceFile,
        sourceFunction: stackInfo.sourceFunction,
        lineNumber: stackInfo.lineNumber,
        columnNumber: stackInfo.columnNumber,
        route,
        method,
        statusCode: statusCode ? Number(statusCode) : null,
        service,
        originatingService,
        reportingService,
        affectedServices,
        requestId,
        traceId,
        spanId,
        database,
        category,
        timestamp
    };
}

module.exports = {
    parseStackTrace,
    identifyDatabase,
    categorizeError,
    extractErrorDetails
};
