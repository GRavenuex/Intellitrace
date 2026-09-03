const express = require('express');
const hostRouter = express.Router();
const adminController = require('../controllers/adminController');
const { isAdmin } = require('../middleware/authMiddleware');

// Admin Panel Routes (protected with isAdmin middleware)
hostRouter.use(isAdmin);

hostRouter.get('/', adminController.getDashboard);
hostRouter.get('/dashboard', adminController.getDashboard);
hostRouter.get('/products', adminController.getProducts);
hostRouter.get('/add-product', adminController.getAddProduct);
hostRouter.post('/add-product', adminController.postAddProduct);
hostRouter.get('/edit-product/:id', adminController.getEditProduct);
hostRouter.post('/edit-product', adminController.postEditProduct);
hostRouter.post('/delete-product/:id', adminController.postDeleteProduct);
hostRouter.get('/orders', adminController.getOrders);
hostRouter.post('/orders/update-status', adminController.postUpdateOrderStatus);
hostRouter.get('/users', adminController.getUsers);

// Backward Compatibility Aliases for Host URLs
hostRouter.get('/add-home', adminController.getAddProduct);
hostRouter.post('/add-home', adminController.postAddProduct);
hostRouter.get('/host-home-list', adminController.getProducts);
hostRouter.get('/edit-home/:homeId', adminController.getEditProduct);
hostRouter.post('/edit-home', adminController.postEditProduct);
hostRouter.post('/delete-home/:homeId', adminController.postDeleteProduct);

module.exports = hostRouter;
module.exports.hostRouter = hostRouter;
