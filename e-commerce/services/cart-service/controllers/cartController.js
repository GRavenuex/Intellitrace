const Cart = require('../models/cart');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');
const productClient = require('../utils/serviceClients/productClient');

exports.getCart = async (req, res, next) => {
    try {
        const userId = req.params.userId;
        let cart = await Cart.findOne({ userId });

        if (!cart) {
            cart = new Cart({ userId, items: [], totalAmount: 0 });
            await cart.save();
        }

        logger.info("Cart fetched", { requestId: req.headers['x-request-id'], userId });
        res.json({ success: true, data: cart });
    } catch (err) {
        next(err);
    }
};

exports.addToCart = async (req, res, next) => {
    let span;
    try {
        const { trace } = require('@opentelemetry/api');
        span = trace.getTracer('cart-service').startSpan('cart.add_item');
        span.setAttribute('cart.user_id', String(req.params.userId || ''));
        span.setAttribute('cart.product_id', String(req.body.productId || ''));
        span.setAttribute('cart.quantity', Number(req.body.quantity || 1));
    } catch (_) {}

    try {
        const userId = req.params.userId;
        const { productId, quantity } = req.body;
        const qty = parseInt(quantity) || 1;

        // Fetch product details from Product Service
        const productRes = await productClient.getProductById(productId, req.headers['x-request-id']);
        const product = productRes.data;

        if (!product) {
            if (span) {
                span.setStatus({ code: 2, message: 'Product not found' });
                span.end();
            }
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [], totalAmount: 0 });
        }

        const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
        if (itemIndex > -1) {
            cart.items[itemIndex].quantity += qty;
        } else {
            cart.items.push({ 
                productId: product._id, 
                quantity: qty, 
                price: product.price,
                productName: product.name,
                productImage: product.image 
            });
        }

        cart.calculateTotal();
        await cart.save();
        
        metrics.cartOperationsTotal.inc({ operation: 'add' });
        logger.info("Added to cart", { requestId: req.headers['x-request-id'], userId, productId });
        
        if (span) {
            span.setAttribute('cart.total_amount', cart.totalAmount);
            span.setStatus({ code: 1 }); // OK
            span.end();
        }

        res.json({ success: true, data: cart });
    } catch (err) {
        if (span) {
            span.recordException(err);
            span.setStatus({ code: 2, message: err.message });
            span.end();
        }
        next(err);
    }
};

exports.updateCartItem = async (req, res, next) => {
    try {
        const userId = req.params.userId;
        const productId = req.params.productId;
        const quantity = parseInt(req.body.quantity);

        let cart = await Cart.findOne({ userId });
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
        if (itemIndex > -1) {
            if (quantity <= 0) {
                cart.items.splice(itemIndex, 1);
            } else {
                cart.items[itemIndex].quantity = quantity;
            }
            cart.calculateTotal();
            await cart.save();
            metrics.cartOperationsTotal.inc({ operation: 'update' });
        }

        logger.info("Updated cart item", { requestId: req.headers['x-request-id'], userId, productId });
        res.json({ success: true, data: cart });
    } catch (err) {
        next(err);
    }
};

exports.removeCartItem = async (req, res, next) => {
    try {
        const userId = req.params.userId;
        const productId = req.params.productId;

        let cart = await Cart.findOne({ userId });
        if (cart) {
            cart.items = cart.items.filter(item => item.productId.toString() !== productId);
            cart.calculateTotal();
            await cart.save();
            metrics.cartOperationsTotal.inc({ operation: 'remove' });
        }

        logger.info("Removed cart item", { requestId: req.headers['x-request-id'], userId, productId });
        res.json({ success: true, data: cart });
    } catch (err) {
        next(err);
    }
};

exports.clearCart = async (req, res, next) => {
    try {
        const userId = req.params.userId;
        let cart = await Cart.findOne({ userId });
        if (cart) {
            cart.items = [];
            cart.totalAmount = 0;
            await cart.save();
        }
        
        logger.info("Cleared cart", { requestId: req.headers['x-request-id'], userId });
        res.json({ success: true, data: cart });
    } catch (err) {
        next(err);
    }
};
