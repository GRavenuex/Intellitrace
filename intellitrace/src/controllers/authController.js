const Developer = require('../models/Developer');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

exports.register = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const existing = await Developer.findOne({ email });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Developer already exists' });
        }
        const dev = new Developer({ email, password });
        await dev.save();
        res.status(201).json({ success: true, message: 'Developer registered successfully' });
    } catch (err) {
        next(err);
    }
};

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const dev = await Developer.findOne({ email });
        if (!dev || !(await dev.comparePassword(password))) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ id: dev._id, email: dev.email }, env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ success: true, token, user: { id: dev._id, email: dev.email } });
    } catch (err) {
        next(err);
    }
};

exports.me = async (req, res, next) => {
    try {
        const dev = await Developer.findById(req.user.id).select('-password');
        if (!dev) return res.status(404).json({ success: false, message: 'Developer not found' });
        res.json({ success: true, user: dev });
    } catch (err) {
        next(err);
    }
};

exports.logout = (req, res) => {
    res.json({ success: true, message: 'Logged out successfully' });
};
