const express = require('express');
const router = express.Router();
const { isAuth } = require('../../middleware/authMiddleware');
const logger = require('../../middleware/logger');
const cartClient = require('../../utils/serviceClients/cartClient');

// GET /api/cart
router.get('/', isAuth, async (req, res, next) => {
    try {
        const response = await cartClient.getCart(req.session.user.id, req.requestId);
        const cart = response.data;
        res.status(200).json({
            success: true,
            data: cart,
            service: 'cart-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/cart (Add item)
router.post('/', isAuth, async (req, res, next) => {
    try {
        const { productId, quantity } = req.body;
        const qty = parseInt(quantity) || 1;

        const response = await cartClient.addToCart(req.session.user.id, productId, qty, req.requestId);
        const cart = response.data;

        logger.info(`[API] Added product to cart via Gateway`, { userId: req.session.user.id, productId });
        res.status(200).json({
            success: true,
            data: cart,
            service: 'cart-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

// PUT /api/cart/:productId (Update quantity)
router.put('/:productId', isAuth, async (req, res, next) => {
    try {
        const { quantity } = req.body;
        const qty = parseInt(quantity);

        const response = await cartClient.updateCartItem(req.session.user.id, req.params.productId, qty, req.requestId);
        const cart = response.data;

        res.status(200).json({
            success: true,
            data: cart,
            service: 'cart-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/cart/:productId (Remove item)
router.delete('/:productId', isAuth, async (req, res, next) => {
    try {
        const response = await cartClient.removeCartItem(req.session.user.id, req.params.productId, req.requestId);
        const cart = response.data;

        res.status(200).json({
            success: true,
            data: cart,
            service: 'cart-service-gateway'
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
