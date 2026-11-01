const Order = require('../models/order');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');
const paymentClient = require('../utils/serviceClients/paymentClient');

exports.createOrder = async (req, res, next) => {
    let span;
    try {
        const { trace, SpanStatusCode } = require('@opentelemetry/api');
        span = trace.getTracer('order-service').startSpan('order.create_order');
        span.setAttribute('order.user_id', String(req.body.userId || ''));
        span.setAttribute('order.total_amount', Number(req.body.totalAmount || 0));
    } catch (_) {}

    try {
        const { userId, totalAmount } = req.body;

        // Downstream check with Payment Service (supports Cascading Failure & Service Communication verification)
        await paymentClient.verifyPaymentChannel(req.headers['x-request-id']);

        // Prevent duplicate orders if an identical pending order was placed recently
        if (userId) {
            const recentDuplicate = await Order.findOne({
                userId,
                paymentStatus: 'pending',
                totalAmount,
                createdAt: { $gte: new Date(Date.now() - 30 * 1000) }
            });
            if (recentDuplicate) {
                logger.info("Duplicate order prevented, returning existing pending order", {
                    requestId: req.headers['x-request-id'],
                    orderId: recentDuplicate._id,
                    userId
                });
                if (span) {
                    span.setAttribute('order.id', String(recentDuplicate._id));
                    span.setAttribute('order.duplicate_prevented', true);
                    span.end();
                }
                return res.status(200).json({ success: true, data: recentDuplicate });
            }
        }

        const order = new Order(req.body);
        await order.save();
        
        metrics.ordersCreatedTotal.inc();
        logger.info("Order created", { requestId: req.headers['x-request-id'], orderId: order._id, userId: order.userId });
        
        if (span) {
            span.setAttribute('order.id', String(order._id));
            span.setStatus({ code: 1 }); // OK
            span.end();
        }

        res.status(201).json({ success: true, data: order });
    } catch (err) {
        if (span) {
            span.recordException(err);
            span.setStatus({ code: 2, message: err.message }); // ERROR
            span.end();
        }
        next(err);
    }
};

exports.getOrders = async (req, res, next) => {
    try {
        const query = req.query.userId ? { userId: req.query.userId } : {};
        const orders = await Order.find(query).sort({ createdAt: -1 });
        res.json({ success: true, count: orders.length, data: orders });
    } catch (err) { next(err); }
};

exports.getOrderById = async (req, res, next) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.json({ success: true, data: order });
    } catch (err) { next(err); }
};

exports.updateOrderStatus = async (req, res, next) => {
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        
        logger.info("Order updated", { requestId: req.headers['x-request-id'], orderId: order._id });
        res.json({ success: true, data: order });
    } catch (err) { next(err); }
};

exports.deleteOrder = async (req, res, next) => {
    try {
        await Order.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Order deleted' });
    } catch (err) { next(err); }
};

exports.countOrders = async (req, res, next) => {
    try {
        const count = await Order.countDocuments();
        res.json({ success: true, data: count });
    } catch (err) { next(err); }
};

exports.getRecentOrders = async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        const orders = await Order.find().sort({ createdAt: -1 }).limit(limit);
        res.json({ success: true, data: orders });
    } catch (err) { next(err); }
};
