const env = require('../config/env');

const telemetryAuth = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey || apiKey !== env.TELEMETRY_API_KEY) {
        return res.status(401).json({ success: false, message: 'Invalid or missing Telemetry API Key' });
    }
    
    next();
};

module.exports = telemetryAuth;
