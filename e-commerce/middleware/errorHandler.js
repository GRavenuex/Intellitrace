
const logger = require('./logger');

const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const originatingService = err.originatingService || err.service || 'intellishop-gateway';
    const message = err.message || 'An unexpected error occurred';
    const errorName = err.name || (err.constructor ? err.constructor.name : 'Error');

    const userId = (req.session && req.session.user && (req.session.user.id || req.session.user._id)) || null;
    const routePath = (req.route && req.route.path) ? req.route.path : (req.originalUrl || req.path || 'unknown');

    logger.error(message, {
        service: 'intellishop-gateway',
        originatingService,
        reportingService: 'intellishop-gateway',
        method: req.method || 'GET',
        route: routePath,
        statusCode,
        userId: userId,
        error: {
            name: errorName,
            message: message,
            stack: err.stack || null
        },
        stack: err.stack || null,
        database: err.database || (errorName.includes('Mongo') || message.includes('Mongo') ? 'MongoDB' : 'Not involved'),
        category: err.category || (errorName.includes('Mongo') ? 'database_query_error' : (statusCode === 400 ? 'validation_error' : 'internal_error'))
    });

    if (req.originalUrl && req.originalUrl.startsWith('/api')) {
        return res.status(statusCode).json({
            success: false,
            error: message,
            errorType: errorName,
            service: originatingService
        });
    }

    res.status(statusCode).render('404', {
        pageTitle: 'Error',
        isLoggedIn: req.isLoggedIn || false,
        user: req.session ? req.session.user : null,
        message: process.env.NODE_ENV === 'production' ? message : `${message} - ${err.message}`
    });
};

module.exports = errorHandler;
