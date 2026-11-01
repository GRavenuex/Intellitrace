const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

router.get('/count', orderController.countOrders);
router.get('/recent', orderController.getRecentOrders);
router.post('/', orderController.createOrder);
router.get('/', orderController.getOrders);
router.get('/:id', orderController.getOrderById);
router.put('/:id', orderController.updateOrderStatus);
router.delete('/:id', orderController.deleteOrder);

module.exports = router;
