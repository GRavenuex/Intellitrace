const http = require('http');

function createFailureInjector({ serviceName, metrics, logger }) {
    const INTELLITRACE_URL = process.env.INTELLITRACE_URL || 'http://intellitrace-backend:4000/api/v1';
    let cachedRules = [];
    let lastFetchTime = 0;
    const CACHE_TTL_MS = 3000;

    function reportTrigger(ruleId) {
        if (!ruleId || String(ruleId).startsWith('env-')) return;
        try {
            const urlObj = new URL(`${INTELLITRACE_URL}/failure-injections/${encodeURIComponent(ruleId)}/trigger`);
            const req = http.request({
                hostname: urlObj.hostname,
                port: urlObj.port || 4000,
                path: urlObj.pathname,
                method: 'POST',
                timeout: 600
            });
            req.on('error', () => {});
            req.on('timeout', () => { req.destroy(); });
            req.end();
        } catch (_) {}
    }

    function refreshRules() {
        if (Date.now() - lastFetchTime < CACHE_TTL_MS && cachedRules.length > 0) {
            return Promise.resolve(cachedRules);
        }
        lastFetchTime = Date.now();

        return new Promise((resolve) => {
            try {
                const urlObj = new URL(`${INTELLITRACE_URL}/failure-injections/active?service=${encodeURIComponent(serviceName)}`);
                const req = http.request({
                    hostname: urlObj.hostname,
                    port: urlObj.port || 4000,
                    path: `${urlObj.pathname}${urlObj.search}`,
                    method: 'GET',
                    timeout: 800
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => { data += chunk; });
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.success && Array.isArray(parsed.data)) {
                                    cachedRules = parsed.data;
                                    if (metrics && metrics.failureInjectionsActive) {
                                        metrics.failureInjectionsActive.set({ service: serviceName }, cachedRules.length);
                                    }
                                }
                            } catch (_) {}
                        }
                        resolve(cachedRules);
                    });
                });

                req.on('error', () => resolve(cachedRules));
                req.on('timeout', () => { req.destroy(); resolve(cachedRules); });
                req.end();
            } catch (_) {
                resolve(cachedRules);
            }
        });
    }

    // Proactive initial sync & periodic sync
    refreshRules().catch(() => {});
    const pollInterval = setInterval(refreshRules, 3000);
    if (pollInterval.unref) pollInterval.unref();

    function getEnvRule() {
        const enabled = process.env.FAILURE_INJECTION_ENABLED === 'true';
        const target = process.env.FAILURE_INJECTION_TARGET_SERVICE;
        if (!enabled || (target && target !== serviceName)) return null;

        return {
            _id: 'env-configured-rule',
            targetService: serviceName,
            failureType: process.env.FAILURE_INJECTION_TYPE || 'latency',
            targetRoute: process.env.FAILURE_INJECTION_TARGET_ROUTE || '*',
            delayMs: parseInt(process.env.FAILURE_INJECTION_DELAY_MS || '0', 10),
            percentage: parseInt(process.env.FAILURE_INJECTION_PERCENTAGE || '100', 10),
            durationSeconds: parseInt(process.env.FAILURE_INJECTION_DURATION_SECONDS || '300', 10),
            status: 'ACTIVE',
            expiresAt: new Date(Date.now() + 86400000).toISOString()
        };
    }

    return async (req, res, next) => {
        if (req.path === '/health' || req.path === '/metrics' || req.path === '/api/health') {
            return next();
        }

        if (Date.now() - lastFetchTime > CACHE_TTL_MS) {
            await refreshRules();
        }

        const envRule = getEnvRule();
        const now = Date.now();
        const activeRules = [...cachedRules.filter(r => (r.status === 'ACTIVE' || r.status === 'TRIGGERED') && new Date(r.expiresAt).getTime() > now)];
        if (envRule) activeRules.push(envRule);

        if (activeRules.length === 0) {
            return next();
        }

        const reqPath = (req.originalUrl || req.url || req.path).toLowerCase();
        const matchingRule = activeRules.find(rule => {
            if (!rule.targetRoute || rule.targetRoute === '*' || rule.targetRoute === 'all' || 
                rule.failureType === 'service_communication_failure' || rule.failureType === 'cascading_failure') return true;
            const target = rule.targetRoute.toLowerCase();
            return reqPath.includes(target) || target.includes(reqPath) ||
                   (target.includes('product') && reqPath.includes('product')) ||
                   (target.includes('payment') && reqPath.includes('payment')) ||
                   (target.includes('order') && reqPath.includes('order')) ||
                   (target.includes('cart') && reqPath.includes('cart'));
        });

        if (!matchingRule) {
            return next();
        }

        if (matchingRule.percentage && matchingRule.percentage < 100) {
            const roll = Math.random() * 100;
            if (roll > matchingRule.percentage) {
                return next();
            }
        }

        let activeSpan = null;
        let traceId = '';
        let spanId = '';
        try {
            const { trace } = require('@opentelemetry/api');
            activeSpan = trace.getActiveSpan();
            if (activeSpan) {
                const sCtx = activeSpan.spanContext();
                traceId = sCtx.traceId;
                spanId = sCtx.spanId;
            }
        } catch (_) {}

        const requestId = req.headers['x-request-id'] || req.requestId || 'unknown';
        const failureId = matchingRule._id || matchingRule.id || 'rule-active';
        const fType = (matchingRule.failureType || 'latency').toLowerCase();

        // Report trigger to IntelliTrace
        reportTrigger(matchingRule._id);

        if (fType === 'latency' || fType === 'network_delay') {
            const delay = Math.min(Math.max(matchingRule.delayMs || 1000, 100), 10000);

            if (activeSpan) {
                activeSpan.addEvent('failure_injected', {
                    'failure.id': failureId,
                    'failure.type': fType,
                    'failure.delay_ms': delay,
                    'failure.target_route': matchingRule.targetRoute
                });
                activeSpan.setAttribute('failure.injected', true);
                activeSpan.setAttribute('failure.type', fType);
                activeSpan.setAttribute('failure.delay_ms', delay);
            }

            if (metrics && metrics.injectedLatencySeconds) {
                metrics.injectedLatencySeconds.observe({ service: serviceName, operation: req.path }, delay / 1000);
            }
            if (metrics && metrics.injectedFailuresTotal) {
                metrics.injectedFailuresTotal.inc({ service: serviceName, failure_type: fType, operation: req.path });
            }

            if (logger) {
                logger.warn(`FAILURE_INJECTION_TRIGGERED: Injected ${fType} of ${delay}ms on ${req.path}`, {
                    service: serviceName,
                    failureId,
                    failureType: fType.toUpperCase(),
                    targetOperation: req.path,
                    requestId,
                    traceId,
                    spanId,
                    delayMs: delay,
                    environment: process.env.NODE_ENV || 'development'
                });
            }

            await new Promise(resolve => setTimeout(resolve, delay));
            return next();
        }

        if (fType === 'http_500' || fType === 'intermittent') {
            const injectedError = new Error(`Injected HTTP 500 on ${req.path}`);
            injectedError.name = 'HTTP 500 InternalServerError';

            if (activeSpan) {
                const { SpanStatusCode } = require('@opentelemetry/api');
                activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: injectedError.message });
                activeSpan.recordException(injectedError);
                activeSpan.setAttribute('failure.injected', true);
                activeSpan.setAttribute('failure.type', 'http_500');
            }

            if (metrics && metrics.injectedFailuresTotal) {
                metrics.injectedFailuresTotal.inc({ service: serviceName, failure_type: 'http_500', operation: req.path });
            }
            if (metrics && metrics.httpErrorsTotal) {
                metrics.httpErrorsTotal.inc({ method: req.method, route: req.path, status_code: 500 });
            }

            if (logger) {
                logger.error(`FAILURE_INJECTION_TRIGGERED: Injected HTTP 500 on ${req.path}`, {
                    service: serviceName,
                    originatingService: serviceName,
                    failureId,
                    failureType: 'HTTP_500',
                    targetOperation: req.path,
                    route: req.path,
                    method: req.method || 'POST',
                    statusCode: 500,
                    requestId,
                    traceId,
                    spanId,
                    error: {
                        name: injectedError.name,
                        message: injectedError.message,
                        stack: injectedError.stack
                    },
                    stack: injectedError.stack,
                    category: 'internal_error',
                    database: 'Not involved',
                    environment: process.env.NODE_ENV || 'development'
                });
            }

            return res.status(500).json({
                success: false,
                error: `FAILURE_INJECTION_TRIGGERED: Injected HTTP 500 on ${req.path}`,
                errorType: 'HTTP 500 InternalServerError',
                failureType: 'http_500',
                failureId,
                service: serviceName
            });
        }

        if (fType === 'service_unavailable') {
            if (activeSpan) {
                const { SpanStatusCode } = require('@opentelemetry/api');
                activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Injected Service Unavailable (503)' });
                activeSpan.setAttribute('failure.injected', true);
                activeSpan.setAttribute('failure.type', 'service_unavailable');
            }

            if (metrics && metrics.injectedFailuresTotal) {
                metrics.injectedFailuresTotal.inc({ service: serviceName, failure_type: 'service_unavailable', operation: req.path });
            }
            if (metrics && metrics.httpErrorsTotal) {
                metrics.httpErrorsTotal.inc({ method: req.method, route: req.path, status_code: 503 });
            }

            if (logger) {
                logger.warn(`FAILURE_INJECTION_TRIGGERED: Injected Service Unavailable 503 on ${req.path}`, {
                    service: serviceName,
                    failureId,
                    failureType: 'SERVICE_UNAVAILABLE',
                    targetOperation: req.path,
                    requestId,
                    traceId,
                    spanId,
                    environment: process.env.NODE_ENV || 'development'
                });
            }

            return res.status(503).json({
                success: false,
                error: 'Service Unavailable (Simulated Injected Failure)',
                failureType: 'service_unavailable',
                failureId,
                service: serviceName,
                retryAfter: 30
            });
        }

        if (fType === 'database_timeout') {
            const dbError = new Error('MongoTimeoutError: Operation exceeded application timeout limit of 5000ms (Simulated DB Timeout)');
            dbError.name = 'MongoTimeoutError';

            if (activeSpan) {
                const { SpanStatusCode } = require('@opentelemetry/api');
                activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: 'Simulated MongoDB Connection Timeout' });
                activeSpan.recordException(dbError);
                activeSpan.setAttribute('failure.injected', true);
                activeSpan.setAttribute('failure.type', 'database_timeout');
                activeSpan.setAttribute('db.system', 'mongodb');
                activeSpan.setAttribute('db.operation', req.method === 'GET' ? 'find' : 'insert');
            }

            if (metrics && metrics.injectedFailuresTotal) {
                metrics.injectedFailuresTotal.inc({ service: serviceName, failure_type: 'database_timeout', operation: req.path });
            }
            if (metrics && metrics.httpErrorsTotal) {
                metrics.httpErrorsTotal.inc({ method: req.method, route: req.path, status_code: 500 });
            }

            if (logger) {
                logger.error(`FAILURE_INJECTION_TRIGGERED: Injected Database Connection Timeout on ${req.path}`, {
                    service: serviceName,
                    originatingService: serviceName,
                    failureId,
                    failureType: 'DATABASE_TIMEOUT',
                    database: 'MongoDB',
                    category: 'database_query_error',
                    targetOperation: req.path,
                    route: req.path,
                    method: req.method || 'GET',
                    statusCode: 500,
                    requestId,
                    traceId,
                    spanId,
                    error: {
                        name: dbError.name,
                        message: dbError.message,
                        stack: dbError.stack
                    },
                    stack: dbError.stack,
                    environment: process.env.NODE_ENV || 'development'
                });
            }

            return res.status(500).json({
                success: false,
                error: 'MongoTimeoutError: Operation exceeded application timeout limit of 5000ms (Simulated DB Timeout)',
                errorType: 'MongoTimeoutError',
                failureType: 'database_timeout',
                failureId,
                service: serviceName
            });
        }

        if (fType === 'service_communication_failure') {
            const destService = matchingRule.sourceService === serviceName && matchingRule.targetOperation ? matchingRule.targetOperation : (serviceName === 'order-service' ? 'payment-service' : (serviceName === 'cart-service' ? 'product-service' : 'payment-service'));
            const destPort = destService === 'payment-service' ? '3004' : (destService === 'product-service' ? '3001' : (destService === 'cart-service' ? '3002' : '3003'));
            const commError = new Error(`connect ECONNREFUSED ${destService}:${destPort}`);
            commError.name = 'NetworkError';
            commError.code = 'ECONNREFUSED';

            if (activeSpan) {
                const { SpanStatusCode } = require('@opentelemetry/api');
                activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: `Downstream call to ${destService} failed: ECONNREFUSED` });
                activeSpan.recordException(commError);
                activeSpan.setAttribute('failure.injected', true);
                activeSpan.setAttribute('failure.type', 'service_communication_failure');
                activeSpan.setAttribute('peer.service', destService);
            }

            if (metrics && metrics.injectedFailuresTotal) {
                metrics.injectedFailuresTotal.inc({ service: serviceName, failure_type: 'service_communication_failure', operation: req.path });
            }
            if (metrics && metrics.httpErrorsTotal) {
                metrics.httpErrorsTotal.inc({ method: req.method, route: req.path, status_code: 503 });
            }

            if (logger) {
                logger.error(`FAILURE_INJECTION_TRIGGERED: Downstream service communication failure calling ${destService}`, {
                    service: serviceName,
                    originatingService: destService,
                    reportingService: serviceName,
                    destinationService: destService,
                    failureId,
                    failureType: 'SERVICE_COMMUNICATION_FAILURE',
                    targetOperation: req.path,
                    route: req.path,
                    method: req.method || 'POST',
                    statusCode: 503,
                    requestId,
                    traceId,
                    spanId,
                    error: {
                        name: commError.name,
                        message: commError.message,
                        stack: commError.stack
                    },
                    stack: commError.stack,
                    category: 'network_error',
                    database: 'Not involved',
                    environment: process.env.NODE_ENV || 'development'
                });
            }

            return res.status(503).json({
                success: false,
                error: `Service Communication Failure: Could not reach downstream ${destService} (ECONNREFUSED)`,
                errorType: 'NetworkError',
                failureType: 'service_communication_failure',
                failureId,
                sourceService: serviceName,
                destinationService: destService
            });
        }

        if (fType === 'cascading_failure') {
            const errName = serviceName === 'payment-service' ? 'PaymentServiceInternalError' : `${serviceName.replace(/-/g, '')}InternalError`;
            const cascErr = new Error(`${errName}: Transaction processing failed (Cascading Origin)`);
            cascErr.name = errName;

            if (activeSpan) {
                const { SpanStatusCode } = require('@opentelemetry/api');
                activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: `Injected initial ${serviceName} failure for cascading scenario` });
                activeSpan.recordException(cascErr);
                activeSpan.setAttribute('failure.injected', true);
                activeSpan.setAttribute('failure.type', 'cascading_failure');
                activeSpan.setAttribute('cascading.role', 'origin');
            }

            if (metrics && metrics.injectedFailuresTotal) {
                metrics.injectedFailuresTotal.inc({ service: serviceName, failure_type: 'cascading_failure', operation: req.path });
            }
            if (metrics && metrics.httpErrorsTotal) {
                metrics.httpErrorsTotal.inc({ method: req.method, route: req.path, status_code: 500 });
            }

            if (logger) {
                logger.error(`FAILURE_INJECTION_TRIGGERED: Injected Cascading Failure Origin on ${req.path}`, {
                    service: serviceName,
                    originatingService: serviceName,
                    failureId,
                    failureType: 'CASCADING_FAILURE',
                    role: 'origin',
                    targetOperation: req.path,
                    route: req.path,
                    method: req.method || 'POST',
                    statusCode: 500,
                    requestId,
                    traceId,
                    spanId,
                    error: {
                        name: cascErr.name,
                        message: cascErr.message,
                        stack: cascErr.stack
                    },
                    stack: cascErr.stack,
                    category: 'internal_error',
                    database: 'Not involved',
                    environment: process.env.NODE_ENV || 'development'
                });
            }

            return res.status(500).json({
                success: false,
                error: `${errName}: Transaction processing failed (Cascading Origin)`,
                errorType: errName,
                failureType: 'cascading_failure',
                failureId,
                service: serviceName
            });
        }

        next();
    };
}

module.exports = createFailureInjector;
