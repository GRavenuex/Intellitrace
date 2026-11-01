const express = require('express');
const router = express.Router();
const traceController = require('../controllers/traceController');
const authMiddleware = require('../middleware/authMiddleware');

// Traces endpoints (Protected by developer auth)
router.get('/services', authMiddleware, traceController.getServices);
router.get('/', authMiddleware, traceController.getTraces);
router.get('/:traceId', authMiddleware, traceController.getTraceById);

module.exports = router;
