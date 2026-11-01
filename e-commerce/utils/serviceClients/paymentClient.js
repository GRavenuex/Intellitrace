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
        if (!res.ok) throw new Error(`Payment service responded with ${res.status}`);
        return await res.json();
    } catch (err) {
        logger.error("Failed to call payment service processPayment", { requestId, error: err.message });
        throw err;
    }
};

exports.getPaymentById = async (id, requestId) => {
    try {
        const res = await fetch(`${PAYMENT_SERVICE_URL}/api/payments/${id}`, { headers: getHeaders(requestId) });
        if (!res.ok) throw new Error(`Payment service responded with ${res.status}`);
        return await res.json();
    } catch (err) {
        logger.error("Failed to call payment service getPaymentById", { requestId, paymentId: id, error: err.message });
        throw err;
    }
};
