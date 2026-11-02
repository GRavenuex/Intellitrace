const http = require('http');
const logger = require('../logger');

const PAYMENT_SERVICE_HOST = process.env.PAYMENT_SERVICE_HOST || 'payment-service';
const PAYMENT_SERVICE_PORT = parseInt(process.env.PAYMENT_SERVICE_PORT || '3004', 10);

const getHeaders = (requestId) => {
    const headers = {
        'Content-Type': 'application/json',
        'x-request-id': requestId || 'unknown'
    };
    try {
        const { propagation, context } = require('@opentelemetry/api');
        propagation.inject(context.active(), headers);
    } catch (_) {}
    return headers;
};

exports.verifyPaymentChannel = async (requestId) => {
    let clientSpan;
    try {
        const { trace } = require('@opentelemetry/api');
        clientSpan = trace.getTracer('order-service').startSpan('order.call_payment_service');
        clientSpan.setAttribute('peer.service', 'payment-service');
        clientSpan.setAttribute('http.url', `http://${PAYMENT_SERVICE_HOST}:${PAYMENT_SERVICE_PORT}/api/payments/verify-channel`);
    } catch (_) {}

    return new Promise((resolve, reject) => {
        const headers = getHeaders(requestId);
        const req = http.request({
            hostname: PAYMENT_SERVICE_HOST,
            port: PAYMENT_SERVICE_PORT,
            path: '/api/payments/verify-channel',
            method: 'POST',
            headers,
            timeout: 5000
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    if (clientSpan) {
                        clientSpan.setStatus({ code: 1 }); // OK
                        clientSpan.end();
                    }
                    resolve({ success: true, status: 'ready' });
                } else {
                    let parsedData = {};
                    try { parsedData = JSON.parse(data); } catch (_) {}
                    const originalMsg = parsedData.error || parsedData.message || `Payment service returned status ${res.statusCode}`;
                    const err = new Error(originalMsg);
                    err.statusCode = res.statusCode;
                    err.name = parsedData.errorType || 'PaymentServiceError';
                    err.originatingService = parsedData.service || 'payment-service';
                    err.reportingService = 'order-service';
                    err.downstreamError = originalMsg;
                    if (clientSpan) {
                        clientSpan.recordException(err);
                        clientSpan.setStatus({ code: 2, message: err.message });
                        clientSpan.end();
                    }
                    logger.error(`Downstream payment service verification failed: ${originalMsg}`, {
                        service: 'order-service',
                        originatingService: 'payment-service',
                        reportingService: 'order-service',
                        route: '/api/payments/verify-channel',
                        method: 'POST',
                        requestId,
                        statusCode: res.statusCode,
                        error: {
                            name: err.name,
                            message: originalMsg,
                            stack: err.stack
                        },
                        stack: err.stack,
                        category: 'dependency_error'
                    });
                    reject(err);
                }
            });
        });

        req.on('error', (err) => {
            err.originatingService = 'payment-service';
            err.reportingService = 'order-service';
            if (clientSpan) {
                clientSpan.recordException(err);
                clientSpan.setStatus({ code: 2, message: err.message });
                clientSpan.end();
            }
            logger.error(`Downstream payment service connection error: ${err.message}`, {
                service: 'order-service',
                originatingService: 'payment-service',
                reportingService: 'order-service',
                route: '/api/payments/verify-channel',
                method: 'POST',
                requestId,
                statusCode: 500,
                error: {
                    name: err.code || err.name || 'NetworkError',
                    message: err.message,
                    stack: err.stack
                },
                stack: err.stack,
                category: 'network_error'
            });
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy(new Error('Connection timed out to payment-service:3004'));
        });

        req.write(JSON.stringify({ action: 'verify_readiness' }));
        req.end();
    });
};
