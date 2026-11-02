const fetch = require('node-fetch');
const logger = require('../../middleware/logger');

const CART_SERVICE_URL = process.env.CART_SERVICE_URL || 'http://localhost:3002';

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
    err.name = errorBody.errorType || 'CartServiceError';
    err.originatingService = errorBody.service || serviceName;
    err.reportingService = 'intellishop-gateway';
    err.downstreamError = originalMsg;
    throw err;
}

exports.getCart = async (userId, requestId) => {
    try {
        const res = await fetch(`${CART_SERVICE_URL}/api/cart/${userId}`, {
            headers: getHeaders(requestId)
        });
        return await handleDownstreamResponse(res, 'cart-service');
    } catch (err) {
        logger.error(`Failed to call cart service getCart: ${err.message}`, {
            service: 'intellishop-gateway',
            originatingService: err.originatingService || 'cart-service',
            reportingService: 'intellishop-gateway',
            route: `/api/cart/${userId}`,
            method: 'GET',
            statusCode: err.statusCode || 500,
            requestId,
            userId,
            error: {
                name: err.name || 'CartClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack
        });
        throw err;
    }
};

exports.addToCart = async (userId, productId, quantity, requestId) => {
    try {
        const res = await fetch(`${CART_SERVICE_URL}/api/cart/${userId}/items`, {
            method: 'POST',
            headers: getHeaders(requestId),
            body: JSON.stringify({ productId, quantity })
        });
        return await handleDownstreamResponse(res, 'cart-service');
    } catch (err) {
        logger.error(`Failed to call cart service addToCart: ${err.message}`, {
            service: 'intellishop-gateway',
            originatingService: err.originatingService || 'cart-service',
            reportingService: 'intellishop-gateway',
            route: `/api/cart/${userId}/items`,
            method: 'POST',
            statusCode: err.statusCode || 500,
            requestId,
            userId,
            productId,
            error: {
                name: err.name || 'CartClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack
        });
        throw err;
    }
};

exports.updateCartItem = async (userId, productId, quantity, requestId) => {
    try {
        const res = await fetch(`${CART_SERVICE_URL}/api/cart/${userId}/items/${productId}`, {
            method: 'PUT',
            headers: getHeaders(requestId),
            body: JSON.stringify({ quantity })
        });
        return await handleDownstreamResponse(res, 'cart-service');
    } catch (err) {
        logger.error(`Failed to call cart service updateCartItem: ${err.message}`, {
            service: 'intellishop-gateway',
            originatingService: err.originatingService || 'cart-service',
            reportingService: 'intellishop-gateway',
            route: `/api/cart/${userId}/items/${productId}`,
            method: 'PUT',
            statusCode: err.statusCode || 500,
            requestId,
            userId,
            productId,
            error: {
                name: err.name || 'CartClientError',
                message: err.message,
                stack: err.stack
            },
            stack: err.stack
        });
        throw err;
    }
};

exports.removeCartItem = async (userId, productId, requestId) => {
    try {
        const res = await fetch(`${CART_SERVICE_URL}/api/cart/${userId}/items/${productId}`, {
            method: 'DELETE',
            headers: getHeaders(requestId)
        });
        if (!res.ok) throw new Error(`Cart service responded with ${res.status}`);
        return await res.json();
    } catch (err) {
        logger.error("Failed to call cart service removeCartItem", { requestId, userId, productId, error: err.message });
        throw err;
    }
};

exports.clearCart = async (userId, requestId) => {
    try {
        const res = await fetch(`${CART_SERVICE_URL}/api/cart/${userId}/clear`, {
            method: 'DELETE',
            headers: getHeaders(requestId)
        });
        if (!res.ok) throw new Error(`Cart service responded with ${res.status}`);
        return await res.json();
    } catch (err) {
        logger.error("Failed to call cart service clearCart", { requestId, userId, error: err.message });
        throw err;
    }
};
