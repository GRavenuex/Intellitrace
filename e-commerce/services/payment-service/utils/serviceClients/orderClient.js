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
        if (!res.ok) throw new Error(`Order service responded with ${res.status}`);
        return await res.json();
    } catch (err) { logger.error("Failed to call order service getOrderById", { requestId, orderId: id, error: err.message }); throw err; }
};

exports.updateOrder = async (id, updateData, requestId) => {
    try {
        const res = await fetch(`${ORDER_SERVICE_URL}/api/orders/${id}`, { method: 'PUT', headers: getHeaders(requestId), body: JSON.stringify(updateData) });
        if (!res.ok) throw new Error(`Order service responded with ${res.status}`);
        return await res.json();
    } catch (err) { logger.error("Failed to call order service updateOrder", { requestId, orderId: id, error: err.message }); throw err; }
};
