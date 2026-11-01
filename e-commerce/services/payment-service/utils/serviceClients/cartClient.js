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
        if (!res.ok) throw new Error(`Cart service responded with ${res.status}`);
        return await res.json();
    } catch (err) { logger.error("Failed to call cart service clearCart", { requestId, userId, error: err.message }); throw err; }
};
