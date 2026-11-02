const fetch = require('node-fetch');
const logger = require('../../middleware/logger');

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';

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

async function handleDownstreamResponse(res, serviceName) {
    if (res.ok) return await res.json();
    let errorBody = {};
    try { errorBody = await res.json(); } catch (_) {}
    const originalMsg = errorBody.error || errorBody.message || `${serviceName} responded with status ${res.status}`;
    const err = new Error(originalMsg);
    err.statusCode = res.status;
    err.name = errorBody.errorType || 'OrderServiceError';
    err.originatingService = errorBody.service || serviceName;
    err.reportingService = 'intellishop-gateway';
    err.downstreamError = originalMsg;
    throw err;
}

exports.createOrder = async (orderData, requestId) => {
    try {
        const res = await fetch(`${ORDER_SERVICE_URL}/api/orders`, {
            method: 'POST',
            headers: getHeaders(requestId),
            body: JSON.stringify(orderData)
        });
        return await handleDownstreamResponse(res, 'order-service');
    } catch (err) {
        logger.error(`Failed to call order service createOrder: ${err.message}`, {
            service: 'intellishop-gateway',
            originatingService: err.originatingService || 'order-service',
            reportingService: 'intellishop-gateway',
            route: '/api/orders',
            method: 'POST',
            statusCode: err.statusCode || 500,
            requestId,
            error: {
                name: err.name || 'OrderClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack
        });
        throw err;
    }
};

exports.getOrders = async (userId, requestId) => {
    try {
        const url = userId ? `${ORDER_SERVICE_URL}/api/orders?userId=${userId}` : `${ORDER_SERVICE_URL}/api/orders`;
        const res = await fetch(url, { headers: getHeaders(requestId) });
        return await handleDownstreamResponse(res, 'order-service');
    } catch (err) {
        logger.error(`Failed to call order service getOrders: ${err.message}`, {
            service: 'intellishop-gateway',
            originatingService: err.originatingService || 'order-service',
            reportingService: 'intellishop-gateway',
            route: '/api/orders',
            method: 'GET',
            statusCode: err.statusCode || 500,
            requestId,
            error: {
                name: err.name || 'OrderClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack
        });
        throw err;
    }
};

exports.getOrderById = async (id, requestId) => {
    try {
        const res = await fetch(`${ORDER_SERVICE_URL}/api/orders/${id}`, { headers: getHeaders(requestId) });
        return await handleDownstreamResponse(res, 'order-service');
    } catch (err) {
        logger.error(`Failed to call order service getOrderById: ${err.message}`, {
            service: 'intellishop-gateway',
            originatingService: err.originatingService || 'order-service',
            reportingService: 'intellishop-gateway',
            route: `/api/orders/${id}`,
            method: 'GET',
            statusCode: err.statusCode || 500,
            requestId,
            orderId: id,
            error: {
                name: err.name || 'OrderClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack
        });
        throw err;
    }
};

exports.updateOrder = async (id, updateData, requestId) => {
    try {
        const res = await fetch(`${ORDER_SERVICE_URL}/api/orders/${id}`, {
            method: 'PUT',
            headers: getHeaders(requestId),
            body: JSON.stringify(updateData)
        });
        if (!res.ok) throw new Error(`Order service responded with ${res.status}`);
        return await res.json();
    } catch (err) {
        logger.error("Failed to call order service updateOrder", { requestId, orderId: id, error: err.message });
        throw err;
    }
};

exports.countOrders = async (requestId) => {
    try {
        const res = await fetch(`${ORDER_SERVICE_URL}/api/orders/count`, { headers: getHeaders(requestId) });
        if (!res.ok) throw new Error(`Order service responded with ${res.status}`);
        return await res.json();
    } catch (err) {
        logger.error("Failed to call order service countOrders", { requestId, error: err.message });
        throw err;
    }
};

exports.getRecentOrders = async (limit, requestId) => {
    try {
        const res = await fetch(`${ORDER_SERVICE_URL}/api/orders/recent?limit=${limit || 5}`, { headers: getHeaders(requestId) });
        if (!res.ok) throw new Error(`Order service responded with ${res.status}`);
        return await res.json();
    } catch (err) {
        logger.error("Failed to call order service getRecentOrders", { requestId, error: err.message });
        throw err;
    }
};
