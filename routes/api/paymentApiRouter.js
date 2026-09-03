const express = require('express');
const router = express.Router();
const Payment = require('../../models/payment');
const Order = require('../../models/order');
const Cart = require('../../models/cart');
const Notification = require('../../models/notification');
const { isAuth } = require('../../middleware/authMiddleware');
const logger = require('../../middleware/logger');

// POST /api/payments
router.post('/', isAuth, async (req, res, next) => {
    try {
        const { orderId, simulateResult, paymentMethod } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found',
                service: 'payment-service'
            });
        }

        const transactionId = 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        logger.info(`[API] Payment initiated`, { orderId, amount: order.totalAmount, simulateResult });

        if (simulateResult === 'FAILURE') {
            const payment = new Payment({
                orderId: order._id,
                userId: req.session.user.id,
                amount: order.totalAmount,
                status: 'failed',
                transactionId,
                paymentMethod: paymentMethod || 'Mock Card'
            });
            await payment.save();

            order.paymentStatus = 'failed';
            await order.save();

            logger.error(`[API] Payment failed`, { orderId });

            return res.status(400).json({
                success: false,
                error: 'Payment transaction failed',
                data: payment,
                service: 'payment-service'
            });
        }

        const payment = new Payment({
            orderId: order._id,
            userId: req.session.user.id,
            amount: order.totalAmount,
            status: 'success',
            transactionId,
            paymentMethod: paymentMethod || 'Mock Card'
        });
        await payment.save();

        order.paymentStatus = 'success';
        order.orderStatus = 'confirmed';
        await order.save();

        // Clear user cart
        await Cart.findOneAndUpdate({ userId: req.session.user.id }, { items: [], totalAmount: 0 });

        // Create Notification
        const notification = new Notification({
            userId: req.session.user.id,
            orderId: order._id,
            message: `Payment received for order #${order._id.toString().slice(-6)}.`,
            type: 'payment',
            status: 'unread'
        });
        await notification.save();

        logger.info(`[API] Payment successful`, { orderId, transactionId });

        res.status(200).json({
            success: true,
            data: payment,
            service: 'payment-service'
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/payments/:id
router.get('/:id', isAuth, async (req, res, next) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment) {
            return res.status(404).json({
                success: false,
                error: 'Payment record not found',
                service: 'payment-service'
            });
        }
        res.status(200).json({
            success: true,
            data: payment,
            service: 'payment-service'
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
