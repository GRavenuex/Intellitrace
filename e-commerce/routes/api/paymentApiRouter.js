const express = require('express');
const router = express.Router();
const paymentClient = require('../../utils/serviceClients/paymentClient');
const { isAuth } = require('../../middleware/authMiddleware');
const logger = require('../../middleware/logger');

// POST /api/payments
router.post('/', isAuth, async (req, res, next) => {
    try {
        const { orderId, simulateResult, paymentMethod } = req.body;
        const userId = req.session.user.id;

        try {
            const response = await paymentClient.processPayment({ orderId, simulateResult, paymentMethod, userId }, req.requestId);
            logger.info(`[API] Payment successful via gateway`, { orderId });
            res.status(200).json({
                success: true,
                data: response.data,
                service: 'payment-service-gateway'
            });
        } catch (paymentErr) {
            logger.error(`[API] Payment failed via gateway`, { orderId, error: paymentErr.message });
            res.status(400).json({
                success: false,
                error: 'Payment transaction failed',
                service: 'payment-service-gateway'
            });
        }
    } catch (err) {
        next(err);
    }
});

// GET /api/payments/:id
router.get('/:id', isAuth, async (req, res, next) => {
    try {
        const response = await paymentClient.getPaymentById(req.params.id, req.requestId);
        const payment = response.data;
        if (!payment) {
            return res.status(404).json({
                success: false,
                error: 'Payment record not found',
                service: 'payment-service-gateway'
            });
        }
        res.status(200).json({
            success: true,
            data: payment,
            service: 'payment-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
