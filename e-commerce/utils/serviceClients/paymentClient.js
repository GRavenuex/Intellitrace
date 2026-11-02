const fetch = require('node-fetch');
const logger = require('../../middleware/logger');

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3004';

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

exports.processPayment = async (paymentData, requestId) => {
    try {
        const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments`, {
            method: 'POST',
            headers: getHeaders(requestId),
            body: JSON.stringify(paymentData)
        });
        if (!res.ok) {
            let errorBody = {};
            try { errorBody = await res.json(); } catch (_) {}
            const originalMsg = errorBody.error || errorBody.message || `Payment service responded with ${res.status}`;
            const err = new Error(originalMsg);
            err.statusCode = res.status;
            err.name = errorBody.errorType || 'PaymentServiceError';
            err.originatingService = errorBody.service || 'payment-service';
            err.reportingService = 'intellishop-gateway';
            err.downstreamError = originalMsg;
            throw err;
        }
        return await res.json();
    } catch (err) {
        logger.error(`Failed to call payment service processPayment: ${err.message}`, {
            service: 'intellishop-gateway',
            originatingService: err.originatingService || 'payment-service',
            reportingService: 'intellishop-gateway',
            route: '/api/payments',
            method: 'POST',
            statusCode: err.statusCode || 500,
            requestId,
            error: {
                name: err.name || 'PaymentClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack
        });
        throw err;
    }
};

exports.getPaymentById = async (id, requestId) => {
    try {
        const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/${id}`, { headers: getHeaders(requestId) });
        if (!res.ok) {
            let errorBody = {};
            try { errorBody = await res.json(); } catch (_) {}
            const originalMsg = errorBody.error || errorBody.message || `Payment service responded with ${res.status}`;
            const err = new Error(originalMsg);
            err.statusCode = res.status;
            err.name = errorBody.errorType || 'PaymentServiceError';
            err.originatingService = errorBody.service || 'payment-service';
            err.reportingService = 'intellishop-gateway';
            throw err;
        }
        return await res.json();
    } catch (err) {
        logger.error(`Failed to call payment service getPaymentById: ${err.message}`, {
            service: 'intellishop-gateway',
            originatingService: err.originatingService || 'payment-service',
            reportingService: 'intellishop-gateway',
            route: `/api/payments/${id}`,
            method: 'GET',
            statusCode: err.statusCode || 500,
            requestId,
            paymentId: id,
            error: {
                name: err.name || 'PaymentClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack
        });
        throw err;
    }
};
