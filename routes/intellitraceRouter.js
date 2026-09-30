const express = require('express');
const router = express.Router();
const metrics = require('../metrics/metrics');
const { isAdmin } = require('../middleware/authMiddleware');

router.use(isAdmin);

router.get('/', (req, res) => {
    res.render('intellitrace/dashboard', {
        pageTitle: 'IntelliTrace Dashboard',
        isLoggedIn: req.isLoggedIn,
        user: req.user
    });
});

router.get('/api/metrics', (req, res) => {
    res.status(200).json(metrics.getMetrics());
});

router.get('/incidents/:id', (req, res) => {
    const incidentId = req.params.id;
    res.render('intellitrace/incident', {
        pageTitle: 'Incident Details - IntelliTrace',
        isLoggedIn: req.isLoggedIn,
        user: req.user,
        incidentId: incidentId
    });
});

module.exports = router;
