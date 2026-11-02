const fetch = require('node-fetch');
const logger = require('../logger');
const CART_SERVICE_URL = process.env.CART_SERVICE_URL || 'http://localhost:3002';
const getHeaders = (requestId) => {
    const headers = { 'Content-Type': 'application/json', 'x-request-id': requestId || 'unknown' };
    try {
        const { propagation, context } = require('@opentelemetry/api');
        propagation.inject(context.active(), headers);
    } catch (_) {}
    return headers;
};

exports.clearCart = async (userId, requestId) => {
    try {
        const res = await fetch(`${CART_SERVICE_URL}/api/cart/${userId}/clear`, { method: 'DELETE', headers: getHeaders(requestId) });
        if (!res.ok) {
            let errorBody = {};
            try { errorBody = await res.json(); } catch (_) {}
            const originalMsg = errorBody.error || errorBody.message || `Cart service responded with ${res.status}`;
            const err = new Error(originalMsg);
            err.statusCode = res.status;
            err.name = errorBody.errorType || 'CartServiceError';
            err.originatingService = errorBody.service || 'cart-service';
            err.reportingService = 'payment-service';
            throw err;
        }
        return await res.json();
    } catch (err) {
        logger.error(`Failed to call cart service clearCart: ${err.message}`, {
            service: 'payment-service',
            originatingService: err.originatingService || 'cart-service',
            reportingService: 'payment-service',
            route: `/api/cart/${userId}/clear`,
            method: 'DELETE',
            requestId,
            userId,
            statusCode: err.statusCode || 500,
            error: {
                name: err.name || 'CartClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack,
            category: 'dependency_error'
        });
        throw err;
    }
};
