const Payment = require('../models/payment');
const Notification = require('../models/notification');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');
const orderClient = require('../utils/serviceClients/orderClient');
const cartClient = require('../utils/serviceClients/cartClient');

exports.processPayment = async (req, res, next) => {
    let span;
    try {
        const { trace } = require('@opentelemetry/api');
        span = trace.getTracer('payment-service').startSpan('payment.process_transaction');
        span.setAttribute('payment.order_id', String(req.body.orderId || ''));
        span.setAttribute('payment.method', String(req.body.paymentMethod || 'Mock Card'));
        span.setAttribute('payment.simulate_result', String(req.body.simulateResult || 'SUCCESS'));
    } catch (_) {}

    try {
        const { orderId, simulateResult, paymentMethod, userId } = req.body;
        const requestId = req.headers['x-request-id'];

        const orderRes = await orderClient.getOrderById(orderId, requestId);
        const order = orderRes.data;
        if (!order) {
            if (span) {
                span.setStatus({ code: 2, message: 'Order not found' });
                span.end();
            }
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (span) {
            span.setAttribute('payment.amount', Number(order.totalAmount || 0));
        }

        const transactionId = 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        logger.info(`Payment initiated`, { orderId, amount: order.totalAmount, simulateResult, requestId });
        metrics.paymentsStartedTotal.inc();

        if (simulateResult === 'FAILURE') {
            const payment = new Payment({ orderId: order._id, userId, amount: order.totalAmount, status: 'failed', transactionId, paymentMethod: paymentMethod || 'Mock Card' });
            await payment.save();
            metrics.paymentsFailedTotal.inc();

            await orderClient.updateOrder(order._id, { paymentStatus: 'failed' }, requestId);

            logger.error(`Payment failed`, { orderId, requestId });

            if (span) {
                span.setAttribute('payment.status', 'failed');
                span.setStatus({ code: 2, message: 'Payment transaction failed (simulated decline)' });
                span.end();
            }

            return res.status(400).json({ success: false, error: 'Payment transaction failed', data: payment });
        }

        const payment = new Payment({ orderId: order._id, userId, amount: order.totalAmount, status: 'success', transactionId, paymentMethod: paymentMethod || 'Mock Card' });
        await payment.save();
        metrics.paymentsSuccessTotal.inc();

        await orderClient.updateOrder(order._id, { paymentStatus: 'success', orderStatus: 'confirmed' }, requestId);
        await cartClient.clearCart(userId, requestId);

        const notification = new Notification({
            userId, orderId: order._id,
            message: `Payment received for order #${order._id.toString().slice(-6)}.`,
            type: 'payment', status: 'unread'
        });
        await notification.save();

        logger.info(`Payment successful`, { orderId, transactionId, requestId });

        if (span) {
            span.setAttribute('payment.status', 'success');
            span.setAttribute('payment.transaction_id', transactionId);
            span.setStatus({ code: 1 }); // OK
            span.end();
        }

        res.status(200).json({ success: true, data: payment });
    } catch (err) {
        if (span) {
            span.recordException(err);
            span.setStatus({ code: 2, message: err.message });
            span.end();
        }
        next(err);
    }
};

exports.getPaymentById = async (req, res, next) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
        res.json({ success: true, data: payment });
    } catch (err) { next(err); }
};

exports.verifyPaymentChannel = async (req, res, next) => {
    let span;
    try {
        const { trace } = require('@opentelemetry/api');
        span = trace.getTracer('payment-service').startSpan('payment.verify_channel');
    } catch (_) {}

    try {
        logger.info("Payment channel verification requested", {
            requestId: req.headers['x-request-id']
        });
        if (span) {
            span.setStatus({ code: 1 }); // OK
            span.end();
        }
        res.json({ success: true, status: 'payment_ready' });
    } catch (err) {
        if (span) {
            span.recordException(err);
            span.setStatus({ code: 2, message: err.message });
            span.end();
        }
        next(err);
    }
};
