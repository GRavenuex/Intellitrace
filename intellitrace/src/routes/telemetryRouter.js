const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetryController');
const authMiddleware = require('../middleware/authMiddleware');
const telemetryAuth = require('../middleware/telemetryAuth');

// Ingestion endpoints (Protected by Telemetry API Key)
router.post('/heartbeat', telemetryAuth, telemetryController.heartbeat);
router.post('/logs', telemetryAuth, telemetryController.ingestLogs);
router.post('/metrics', telemetryAuth, telemetryController.ingestMetrics);

// Retrieval endpoints (Protected by developer auth)
router.get('/logs', authMiddleware, telemetryController.getLogs);

module.exports = router;
