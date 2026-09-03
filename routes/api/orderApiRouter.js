const express = require('express');
const router = express.Router();
const Order = require('../../models/order');
const Cart = require('../../models/cart');
const { isAuth, isAdmin } = require('../../middleware/authMiddleware');
const logger = require('../../middleware/logger');

// POST /api/orders
router.post('/', isAuth, async (req, res, next) => {
    try {
        const { shippingAddress } = req.body;
        const cart = await Cart.findOne({ userId: req.session.user.id }).populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Cart is empty',
                service: 'order-service'
            });
        }

        const orderItems = cart.items.map(item => ({
            productId: item.productId._id,
            name: item.productId.name,
            image: item.productId.image,
            quantity: item.quantity,
            price: item.price
        }));

        const order = new Order({
            userId: req.session.user.id,
            items: orderItems,
            totalAmount: cart.totalAmount,
            shippingAddress,
            paymentStatus: 'pending',
            orderStatus: 'pending'
        });

        await order.save();
        logger.info(`[API] Order created: ${order._id}`);

        res.status(201).json({
            success: true,
            data: order,
            service: 'order-service'
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/orders
router.get('/', isAuth, async (req, res, next) => {
    try {
        const query = (req.session.user.userType === 'admin' || req.session.user.userType === 'host')
            ? {}
            : { userId: req.session.user.id };

        const orders = await Order.find(query).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: orders.length,
            data: orders,
            service: 'order-service'
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/orders/:id
router.get('/:id', isAuth, async (req, res, next) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found',
                service: 'order-service'
            });
        }

        res.status(200).json({
            success: true,
            data: order,
            service: 'order-service'
        });
    } catch (err) {
        next(err);
    }
});

// PUT /api/orders/:id/status (Admin)
router.put('/:id/status', isAuth, isAdmin, async (req, res, next) => {
    try {
        const { orderStatus } = req.body;
        const order = await Order.findByIdAndUpdate(req.params.id, { orderStatus }, { new: true });

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found',
                service: 'order-service'
            });
        }

        logger.info(`[API] Order status updated: ${order._id} -> ${orderStatus}`);

        res.status(200).json({
            success: true,
            data: order,
            service: 'order-service'
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
