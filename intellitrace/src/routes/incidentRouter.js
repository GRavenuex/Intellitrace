const express = require('express');
const router = express.Router();
const incidentController = require('../controllers/incidentController');
const authMiddleware = require('../middleware/authMiddleware');

// Public/Internal health or evaluation routes if needed
router.post('/evaluate', authMiddleware, incidentController.evaluateNow);

// Stats & Rules
router.get('/stats', authMiddleware, incidentController.getIncidentStats);
router.get('/rules', authMiddleware, incidentController.getRules);
router.patch('/rules/:ruleId', authMiddleware, incidentController.updateRule);

// Incidents list & details
router.get('/', authMiddleware, incidentController.getIncidents);
router.get('/:id', authMiddleware, incidentController.getIncidentById);
router.patch('/:id/status', authMiddleware, incidentController.updateIncidentStatus);

// Phase 13 Evidence Correlation & Investigation endpoints
router.get('/:id/investigation', authMiddleware, incidentController.getIncidentInvestigation);
router.get('/:id/evidence', authMiddleware, incidentController.getIncidentEvidence);
router.get('/:id/dependencies', authMiddleware, incidentController.getIncidentDependencies);
router.post('/:id/correlate', authMiddleware, incidentController.correlateIncidentNow);

module.exports = router;

