const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

router.post('/', paymentController.processPayment);
router.post('/verify-channel', paymentController.verifyPaymentChannel);
router.get('/verify', paymentController.verifyPaymentChannel);
router.get('/:id', paymentController.getPaymentById);

module.exports = router;
