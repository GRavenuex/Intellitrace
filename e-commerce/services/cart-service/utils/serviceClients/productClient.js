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
        if (!res.ok) {
            let errorBody = {};
            try { errorBody = await res.json(); } catch (_) {}
            const originalMsg = errorBody.error || errorBody.message || `Product service responded with ${res.status}`;
            const err = new Error(originalMsg);
            err.statusCode = res.status;
            err.name = errorBody.errorType || 'ProductServiceError';
            err.originatingService = errorBody.service || 'product-service';
            err.reportingService = 'cart-service';
            throw err;
        }
        return await res.json();
    } catch (err) {
        logger.error(`Failed to call product service getProductById: ${err.message}`, {
            service: 'cart-service',
            originatingService: err.originatingService || 'product-service',
            reportingService: 'cart-service',
            route: `/api/products/${id}`,
            method: 'GET',
            requestId,
            productId: id,
            statusCode: err.statusCode || 500,
            error: {
                name: err.name || 'ProductClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack,
            category: 'dependency_error'
        });
        throw err;
    }
};
