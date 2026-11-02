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
router.get('/:id/evidence', authMiddleware, incidentController.getIncidentEvidence);

module.exports = router;

