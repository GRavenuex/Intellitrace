const express = require('express');
const userRouter = express.Router();
const shopController = require('../controllers/shopController');
const { isAuth } = require('../middleware/authMiddleware');

// Customer E-Commerce Routes
userRouter.get('/', shopController.getHome);
userRouter.get('/products', shopController.getProducts);
userRouter.get('/products/:id', shopController.getProductDetails);

// Cart & Checkout
userRouter.get('/cart', isAuth, shopController.getCart);
userRouter.post('/cart/add', isAuth, shopController.postAddToCart);
userRouter.post('/cart/update/:productId', isAuth, shopController.postUpdateCart);
userRouter.post('/cart/delete/:productId', isAuth, shopController.postRemoveFromCart);
userRouter.get('/checkout', isAuth, shopController.getCheckout);
userRouter.post('/checkout/create-order', isAuth, shopController.postCreateOrder);

// Payment & Confirmation
userRouter.get('/payment/:orderId', isAuth, shopController.getPayment);
userRouter.post('/payment/process', isAuth, shopController.postProcessPayment);
userRouter.get('/order-confirmation/:orderId', isAuth, shopController.getOrderConfirmation);

// My Orders
userRouter.get('/orders', isAuth, shopController.getMyOrders);
userRouter.get('/orders/:id', isAuth, shopController.getOrderDetail);

// Backward Compatibility Aliases for Airbnb URLs
userRouter.get('/index', shopController.getProducts);
userRouter.get('/booking', isAuth, shopController.getMyOrders);
userRouter.get('/favourite', isAuth, shopController.getCart);
userRouter.get('/homes/:homeId', shopController.getProductDetails);

module.exports = userRouter;