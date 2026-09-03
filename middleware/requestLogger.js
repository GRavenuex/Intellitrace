const logger = require('./logger');

const requestLogger = (req, res, next) => {
    res.on("finish", () => {
        const responseTime = req.requestStartTime ? Date.now() - req.requestStartTime : 0;
        
        let level = 'INFO';
        let message = 'Request completed';
        
        if (res.statusCode >= 400 && res.statusCode < 500) {
            level = 'WARN';
            message = 'Request completed with client error';
        } else if (res.statusCode >= 500) {
            level = 'ERROR';
            message = 'Request completed with error';
        }

        const userId = (req.session && req.session.user && (req.session.user.id || req.session.user._id)) || null;
        const routePath = (req.route && req.route.path) ? req.route.path : req.originalUrl;
        
        const logMeta = {
            method: req.method,
            route: routePath,
            statusCode: res.statusCode,
            responseTime: responseTime,
            userId: userId,
            userAgent: req.get('user-agent')
        };

        if (level === 'ERROR') {
            logger.error(message, logMeta);
        } else if (level === 'WARN') {
            logger.warn(message, logMeta);
        } else {
            logger.info(message, logMeta);
        }
    });
    
    next();
};

module.exports = requestLogger;



