const express = require('express');
const router = express.Router();
const Notification = require('../../models/notification');
const { isAuth } = require('../../middleware/authMiddleware');

// GET /api/notifications
router.get('/', isAuth, async (req, res, next) => {
    try {
        const notifications = await Notification.find({ userId: req.session.user.id }).sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: notifications.length,
            data: notifications,
            service: 'notification-service'
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
