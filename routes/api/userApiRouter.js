const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../../models/user');
const { isAuth } = require('../../middleware/authMiddleware');
const logger = require('../../middleware/logger');

// POST /api/users/register
router.post('/register', async (req, res, next) => {
    try {
        const { firstName, lastName, email, password, userType } = req.body;
        if (!email || !password || !firstName) {
            return res.status(400).json({
                success: false,
                error: 'First name, email, and password are required',
                service: 'user-service'
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'User already exists',
                service: 'user-service'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = new User({
            firstName,
            lastName: lastName || '',
            email,
            password: hashedPassword,
            userType: userType || 'customer'
        });

        await user.save();
        logger.info(`API User registered: ${email}`);

        res.status(201).json({
            success: true,
            data: {
                id: user._id,
                name: `${user.firstName} ${user.lastName}`.trim(),
                email: user.email,
                role: user.userType
            },
            service: 'user-service'
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/users/login
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials',
                service: 'user-service'
            });
        }

        req.session.isLoggedIn = true;
        req.session.user = {
            id: user._id.toString(),
            name: `${user.firstName} ${user.lastName}`.trim(),
            email: user.email,
            userType: user.userType
        };

        logger.info(`API User login: ${email}`);

        res.status(200).json({
            success: true,
            data: {
                id: user._id,
                name: `${user.firstName} ${user.lastName}`.trim(),
                email: user.email,
                role: user.userType
            },
            service: 'user-service'
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/users/logout
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.status(200).json({
            success: true,
            message: 'Logged out successfully',
            service: 'user-service'
        });
    });
});

// GET /api/users/profile
router.get('/profile', isAuth, async (req, res, next) => {
    try {
        const user = await User.findById(req.session.user.id).select('-password');
        res.status(200).json({
            success: true,
            data: user,
            service: 'user-service'
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
