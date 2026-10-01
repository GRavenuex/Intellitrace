
const logger = require('./logger');

const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const serviceName = err.service || 'intellishop';
    const message = err.message || 'An unexpected error occurred';

    const userId = (req.session && req.session.user && (req.session.user.id || req.session.user._id)) || null;
    const routePath = (req.route && req.route.path) ? req.route.path : req.originalUrl;

    logger.error(message, {
        method: req.method,
        route: routePath,
        statusCode,
        userId: userId,
        error: err.name || 'Error',
        stack: err.stack
    });

    if (req.originalUrl.startsWith('/api')) {
        return res.status(statusCode).json({
            success: false,
            error: message,
            service: serviceName
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
