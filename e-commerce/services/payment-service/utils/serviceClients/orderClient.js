const fetch = require('node-fetch');
const logger = require('../logger');
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';
const getHeaders = (requestId) => {
    const headers = { 'Content-Type': 'application/json', 'x-request-id': requestId || 'unknown' };
    try {
        const { propagation, context } = require('@opentelemetry/api');
        propagation.inject(context.active(), headers);
    } catch (_) {}
    return headers;
};

exports.getOrderById = async (id, requestId) => {
    try {
        const res = await fetch(`${ORDER_SERVICE_URL}/api/orders/${id}`, { headers: getHeaders(requestId) });
        if (!res.ok) {
            let errorBody = {};
            try { errorBody = await res.json(); } catch (_) {}
            const originalMsg = errorBody.error || errorBody.message || `Order service responded with ${res.status}`;
            const err = new Error(originalMsg);
            err.statusCode = res.status;
            err.name = errorBody.errorType || 'OrderServiceError';
            err.originatingService = errorBody.service || 'order-service';
            err.reportingService = 'payment-service';
            throw err;
        }
        return await res.json();
    } catch (err) {
        logger.error(`Failed to call order service getOrderById: ${err.message}`, {
            service: 'payment-service',
            originatingService: err.originatingService || 'order-service',
            reportingService: 'payment-service',
            route: `/api/orders/${id}`,
            method: 'GET',
            requestId,
            orderId: id,
            statusCode: err.statusCode || 500,
            error: {
                name: err.name || 'OrderClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack,
            category: 'dependency_error'
        });
        throw err;
    }
};

exports.updateOrder = async (id, updateData, requestId) => {
    try {
        const res = await fetch(`${ORDER_SERVICE_URL}/api/orders/${id}`, { method: 'PUT', headers: getHeaders(requestId), body: JSON.stringify(updateData) });
        if (!res.ok) {
            let errorBody = {};
            try { errorBody = await res.json(); } catch (_) {}
            const originalMsg = errorBody.error || errorBody.message || `Order service responded with ${res.status}`;
            const err = new Error(originalMsg);
            err.statusCode = res.status;
            err.name = errorBody.errorType || 'OrderServiceError';
            err.originatingService = errorBody.service || 'order-service';
            err.reportingService = 'payment-service';
            throw err;
        }
        return await res.json();
    } catch (err) {
        logger.error(`Failed to call order service updateOrder: ${err.message}`, {
            service: 'payment-service',
            originatingService: err.originatingService || 'order-service',
            reportingService: 'payment-service',
            route: `/api/orders/${id}`,
            method: 'PUT',
            requestId,
            orderId: id,
            statusCode: err.statusCode || 500,
            error: {
                name: err.name || 'OrderClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack,
            category: 'dependency_error'
        });
        throw err;
    }
};
