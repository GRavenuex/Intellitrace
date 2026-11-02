const fetch = require('node-fetch');
const logger = require('../../middleware/logger');

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

async function handleDownstreamResponse(res, serviceName) {
    if (res.ok) return await res.json();
    let errorBody = {};
    try { errorBody = await res.json(); } catch (_) {}
    const originalMsg = errorBody.error || errorBody.message || `${serviceName} responded with status ${res.status}`;
    const err = new Error(originalMsg);
    err.statusCode = res.status;
    err.name = errorBody.errorType || 'ProductServiceError';
    err.originatingService = errorBody.service || serviceName;
    err.reportingService = 'intellishop-gateway';
    err.downstreamError = originalMsg;
    throw err;
}

exports.getProducts = async (queryParams, requestId) => {
    try {
        const query = new URLSearchParams(queryParams).toString();
        const res = await fetch(`${PRODUCT_SERVICE_URL}/api/products?${query}`, {
            headers: getHeaders(requestId)
        });
        return await handleDownstreamResponse(res, 'product-service');
    } catch (err) {
        logger.error(`Failed to call product service getProducts: ${err.message}`, {
            service: 'intellishop-gateway',
            originatingService: err.originatingService || 'product-service',
            reportingService: 'intellishop-gateway',
            route: '/api/products',
            method: 'GET',
            statusCode: err.statusCode || 500,
            requestId,
            error: {
                name: err.name || 'ProductClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack
        });
        throw err;
    }
};

exports.getFeaturedProducts = async (limit, requestId) => {
    try {
        const res = await fetch(`${PRODUCT_SERVICE_URL}/api/products/featured?limit=${limit || 8}`, {
            headers: getHeaders(requestId)
        });
        return await handleDownstreamResponse(res, 'product-service');
    } catch (err) {
        logger.error(`Failed to call product service getFeaturedProducts: ${err.message}`, {
            service: 'intellishop-gateway',
            originatingService: err.originatingService || 'product-service',
            reportingService: 'intellishop-gateway',
            route: '/api/products/featured',
            method: 'GET',
            statusCode: err.statusCode || 500,
            requestId,
            error: {
                name: err.name || 'ProductClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack
        });
        throw err;
    }
};

exports.getProductById = async (id, requestId) => {
    try {
        const res = await fetch(`${PRODUCT_SERVICE_URL}/api/products/${id}`, {
            headers: getHeaders(requestId)
        });
        return await handleDownstreamResponse(res, 'product-service');
    } catch (err) {
        logger.error(`Failed to call product service getProductById: ${err.message}`, {
            service: 'intellishop-gateway',
            originatingService: err.originatingService || 'product-service',
            reportingService: 'intellishop-gateway',
            route: `/api/products/${id}`,
            method: 'GET',
            statusCode: err.statusCode || 500,
            requestId,
            productId: id,
            error: {
                name: err.name || 'ProductClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack
        });
        throw err;
    }
};

exports.getRelatedProducts = async (id, requestId) => {
    try {
        const res = await fetch(`${PRODUCT_SERVICE_URL}/api/products/${id}/related`, {
            headers: getHeaders(requestId)
        });
        if (!res.ok) throw new Error(`Product service responded with ${res.status}`);
        return await res.json();
    } catch (err) {
        logger.error("Failed to call product service getRelatedProducts", { requestId, productId: id, error: err.message });
        throw err;
    }
};

exports.createProduct = async (productData, requestId) => {
    try {
        const res = await fetch(`${PRODUCT_SERVICE_URL}/api/products`, {
            method: 'POST',
            headers: getHeaders(requestId),
            body: JSON.stringify(productData)
        });
        if (!res.ok) throw new Error(`Product service responded with ${res.status}`);
        return await res.json();
    } catch (err) {
        logger.error("Failed to call product service createProduct", { requestId, error: err.message });
        throw err;
    }
};

exports.updateProduct = async (id, productData, requestId) => {
    try {
        const res = await fetch(`${PRODUCT_SERVICE_URL}/api/products/${id}`, {
            method: 'PUT',
            headers: getHeaders(requestId),
            body: JSON.stringify(productData)
        });
        if (!res.ok) throw new Error(`Product service responded with ${res.status}`);
        return await res.json();
    } catch (err) {
        logger.error("Failed to call product service updateProduct", { requestId, productId: id, error: err.message });
        throw err;
    }
};

exports.deleteProduct = async (id, requestId) => {
    try {
        const res = await fetch(`${PRODUCT_SERVICE_URL}/api/products/${id}`, {
            method: 'DELETE',
            headers: getHeaders(requestId)
        });
        if (!res.ok) throw new Error(`Product service responded with ${res.status}`);
        return await res.json();
    } catch (err) {
        logger.error("Failed to call product service deleteProduct", { requestId, productId: id, error: err.message });
        throw err;
    }
};
