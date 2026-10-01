const express = require('express');
const router = express.Router();
const logger = require('../../middleware/logger');

// POST /api/payments/test/fail
router.post('/payments/test/fail', (req, res) => {
    logger.error("[CHAOS SIMULATION] Simulated payment service failure triggered");
    res.status(500).json({
        success: false,
        error: "Simulated payment service failure",
        service: "payment-service"
    });
});

// POST /api/payments/test/slow
router.post('/payments/test/slow', (req, res) => {
    logger.warn("[CHAOS SIMULATION] Simulated slow payment service triggered (5s delay)");
    setTimeout(() => {
        res.status(200).json({
            success: true,
            message: "Simulated slow payment completed after 5 seconds",
            service: "payment-service"
        });
    }, 5000);
});

// POST /api/products/test/slow
router.post('/products/test/slow', (req, res) => {
    logger.warn("[CHAOS SIMULATION] Simulated slow product service triggered (5s delay)");
    setTimeout(() => {
        res.status(200).json({
            success: true,
            message: "Simulated slow product fetch completed after 5 seconds",
            service: "product-service"
        });
    }, 5000);
});

// POST /api/orders/test/fail
router.post('/orders/test/fail', (req, res) => {
    logger.error("[CHAOS SIMULATION] Simulated order creation failure triggered");
    res.status(500).json({
        success: false,
        error: "Simulated order database timeout failure",
        service: "order-service"
    });
});

module.exports = router;
