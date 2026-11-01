const fetch = require('node-fetch');
const logger = require('../logger');

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3001';

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

exports.getProductById = async (id, requestId) => {
    try {
        const res = await fetch(`${PRODUCT_SERVICE_URL}/api/products/${id}`, {
            headers: getHeaders(requestId)
        });
        if (!res.ok) throw new Error(`Product service responded with ${res.status}`);
        return await res.json();
    } catch (err) {
        logger.error("Failed to call product service getProductById", { requestId, productId: id, error: err.message });
        throw err;
    }
};
