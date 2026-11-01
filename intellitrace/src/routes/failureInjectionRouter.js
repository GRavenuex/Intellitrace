const express = require('express');
const router = express.Router();
const failureController = require('../controllers/failureInjectionController');
const authMiddleware = require('../middleware/authMiddleware');

// Public/Internal query for active rules (used by microservices without developer JWT)
router.get('/active', failureController.getActiveInjections);
router.get('/status', failureController.getSimulationStatus);
router.post('/:id/trigger', failureController.recordTrigger);
router.post('/activate-direct', failureController.createFailureInjection);
router.post('/deactivate-service', failureController.deactivateService);
router.patch('/:id/stop-direct', failureController.stopFailureInjection);

// Secured developer endpoints
router.post('/', authMiddleware, failureController.createFailureInjection);
router.get('/', authMiddleware, failureController.getFailureInjections);
router.get('/history', authMiddleware, failureController.getHistory);
router.get('/:id', authMiddleware, failureController.getFailureInjectionById);
router.patch('/:id/stop', authMiddleware, failureController.stopFailureInjection);

module.exports = router;
