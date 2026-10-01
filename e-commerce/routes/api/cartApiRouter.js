const express = require('express');
const router = express.Router();
const Cart = require('../../models/cart');
const Product = require('../../models/product');
const { isAuth } = require('../../middleware/authMiddleware');
const logger = require('../../middleware/logger');
const metrics = require('../../utils/metrics');

// GET /api/cart
router.get('/', isAuth, async (req, res, next) => {
    try {
        let cart = await Cart.findOne({ userId: req.session.user.id }).populate('items.productId');
        if (!cart) {
            cart = new Cart({ userId: req.session.user.id, items: [], totalAmount: 0 });
            await cart.save();
        }
        res.status(200).json({
            success: true,
            data: cart,
            service: 'cart-service'
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

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
                service: 'cart-service'
            });
        }

        let cart = await Cart.findOne({ userId: req.session.user.id });
        if (!cart) {
            cart = new Cart({ userId: req.session.user.id, items: [], totalAmount: 0 });
        }

        const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
        if (itemIndex > -1) {
            cart.items[itemIndex].quantity += qty;
        } else {
            cart.items.push({ productId: product._id, quantity: qty, price: product.price });
        }

        cart.calculateTotal();
        await cart.save();
        metrics.cartOperationsTotal.inc({ operation: 'add' });

        logger.info(`[API] Added product to cart`, { userId: req.session.user.id, productId });
        res.status(200).json({
            success: true,
            data: cart,
            service: 'cart-service'
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

        let cart = await Cart.findOne({ userId: req.session.user.id });
        if (!cart) {
            return res.status(404).json({
                success: false,
                error: 'Cart not found',
                service: 'cart-service'
            });
        }

        const itemIndex = cart.items.findIndex(item => item.productId.toString() === req.params.productId);
        if (itemIndex > -1) {
            if (qty <= 0) {
                cart.items.splice(itemIndex, 1);
            } else {
                cart.items[itemIndex].quantity = qty;
            }
            cart.calculateTotal();
            await cart.save();
            metrics.cartOperationsTotal.inc({ operation: 'update' });
        }

        res.status(200).json({
            success: true,
            data: cart,
            service: 'cart-service'
        });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/cart/:productId (Remove item)
router.delete('/:productId', isAuth, async (req, res, next) => {
    try {
        let cart = await Cart.findOne({ userId: req.session.user.id });
        if (cart) {
            cart.items = cart.items.filter(item => item.productId.toString() !== req.params.productId);
            cart.calculateTotal();
            await cart.save();
            metrics.cartOperationsTotal.inc({ operation: 'remove' });
        }

        res.status(200).json({
            success: true,
            data: cart,
            service: 'cart-service'
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
