const express = require('express');
const router = express.Router();
const cartClient = require('../../utils/serviceClients/cartClient');
const orderClient = require('../../utils/serviceClients/orderClient');
const { isAuth, isAdmin } = require('../../middleware/authMiddleware');
const logger = require('../../middleware/logger');

// POST /api/orders
router.post('/', isAuth, async (req, res, next) => {
    try {
        const { shippingAddress } = req.body;
        const response = await cartClient.getCart(req.session.user.id, req.requestId);
        const cart = response.data;

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Cart is empty',
                service: 'order-service'
            });
        }

        const orderItems = cart.items.map(item => ({
            productId: item.productId,
            name: item.productName || 'Unknown Product',
            image: item.productImage || '',
            quantity: item.quantity,
            price: item.price
        }));

        const orderData = {
            userId: req.session.user.id,
            items: orderItems,
            totalAmount: cart.totalAmount,
            shippingAddress,
            paymentStatus: 'pending',
            orderStatus: 'pending'
        };

        const responseOrder = await orderClient.createOrder(orderData, req.requestId);
        const order = responseOrder.data;

        logger.info(`[API] Order created via gateway: ${order._id}`);

        res.status(201).json({
            success: true,
            data: order,
            service: 'order-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/orders
router.get('/', isAuth, async (req, res, next) => {
    try {
        const userId = (req.session.user.userType === 'admin' || req.session.user.userType === 'host') ? null : req.session.user.id;
        const responseOrder = await orderClient.getOrders(userId, req.requestId);
        const orders = responseOrder.data;

        res.status(200).json({
            success: true,
            count: orders.length,
            data: orders,
            service: 'order-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/orders/:id
router.get('/:id', isAuth, async (req, res, next) => {
    try {
        const responseOrder = await orderClient.getOrderById(req.params.id, req.requestId);
        const order = responseOrder.data;
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found',
                service: 'order-service-gateway'
            });
        }

        res.status(200).json({
            success: true,
            data: order,
            service: 'order-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

// PUT /api/orders/:id/status (Admin)
router.put('/:id/status', isAuth, isAdmin, async (req, res, next) => {
    try {
        const { orderStatus } = req.body;
        
        const responseOrder = await orderClient.updateOrder(req.params.id, { orderStatus }, req.requestId);
        const order = responseOrder.data;

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found',
                service: 'order-service-gateway'
            });
        }

        logger.info(`[API] Order status updated via gateway: ${order._id} -> ${orderStatus}`);

        res.status(200).json({
            success: true,
            data: order,
            service: 'order-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
