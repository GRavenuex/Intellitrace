const express = require('express');
const router = express.Router();
const logger = require('../middleware/logger');

// Ensure these are only available in non-production
router.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).send('Not Found');
    }
    next();
});

// GET /debug/failure/payment
router.get('/failure/payment', (req, res, next) => {
    logger.error("Payment failed", {
        requestId: req.requestId,
        error: "Simulated payment failure from debug endpoint",
        orderId: "test-order-123"
    });
    res.status(500).json({ error: "Simulated payment failure" });
});

// GET /debug/failure/database
router.get('/failure/database', (req, res, next) => {
    logger.error("Database connection failed", {
        requestId: req.requestId,
        error: "Simulated database failure"
    });
    res.status(500).json({ error: "Simulated database failure" });
});

// GET /debug/failure/latency
router.get('/failure/latency', (req, res, next) => {
    logger.info("Simulating latency", { requestId: req.requestId, duration: 5000 });
    setTimeout(() => {
        res.json({ message: "Completed after 5000ms delay" });
    }, 5000);
});

// GET /debug/failure/error
router.get('/failure/error', (req, res, next) => {
    const error = new Error("Simulated HTTP 500 Error");
    logger.error("Simulated error", {
        requestId: req.requestId,
        error: error.message,
        stack: error.stack
    });
    next(error); // Passes to error handler
});

module.exports = router;
