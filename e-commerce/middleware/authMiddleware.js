const logger = require('./logger');

exports.isAuth = (req, res, next) => {
    if (!req.session || !req.session.isLoggedIn) {
        logger.warn('Unauthorized access attempt', { path: req.originalUrl });
        if (req.originalUrl.startsWith('/api')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required. Please log in.',
                service: 'auth-service'
            });
        }
        return res.redirect('/login');
    }
    next();
};

exports.isAdmin = (req, res, next) => {
    if (!req.session || !req.session.isLoggedIn) {
        if (req.originalUrl.startsWith('/api')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required. Please log in.',
                service: 'auth-service'
            });
        }
        return res.redirect('/login');
    }

    const userType = req.session.user ? req.session.user.userType : null;
    if (userType !== 'admin' && userType !== 'host') {
        logger.warn('Forbidden admin access attempt', { user: req.session.user });
        if (req.originalUrl.startsWith('/api')) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin privileges required.',
                service: 'auth-service'
            });
        }
        return res.status(403).render('404', {
            pageTitle: 'Access Denied',
            isLoggedIn: req.isLoggedIn,
            user: req.session.user,
            message: 'You do not have administrative permissions to view this page.'
        });
    }
    next();
};
