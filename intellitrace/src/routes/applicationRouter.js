const express = require('express');
const router = express.Router();
const applicationController = require('../controllers/applicationController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

router.post('/', applicationController.create);
router.get('/', applicationController.getAll);
router.get('/:id', applicationController.getById);
router.get('/:id/summary', applicationController.getSummary);
router.patch('/:id', applicationController.update);
router.delete('/:id', applicationController.delete);

module.exports = router;
