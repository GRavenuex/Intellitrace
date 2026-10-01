const logger = require('./logger');
const metrics = require('../utils/metrics');

const requestLogger = (req, res, next) => {
    metrics.httpRequestsInFlight.inc();
    let isFinished = false;

    const onFinish = () => {
        if (isFinished) return;
        isFinished = true;
        metrics.httpRequestsInFlight.dec();

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
        let routePath = "unknown";
        if (req.route && req.route.path) {
            routePath = (req.baseUrl || "") + req.route.path;
        } else if (res.statusCode === 404) {
            routePath = "404_not_found";
        } else if (req.path.match(/\.(css|js|jpg|jpeg|png|gif|svg|ico|webp|woff|woff2|ttf)$/i)) {
            routePath = "static_asset";
        } else if (req.path) {
            // Keep cardinality low by stripping UUIDs/ObjectIDs if it falls back to req.path
            routePath = req.path.replace(/\/[0-9a-fA-F-]{8,}/g, '/:id');
        }
        
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

        // Record metrics
        metrics.httpRequestsTotal.inc({
            method: req.method,
            route: routePath,
            status_code: res.statusCode
        });
        
        if (res.statusCode >= 400) {
            metrics.httpErrorsTotal.inc({
                method: req.method,
                route: routePath,
                status_code: res.statusCode
            });
        }
        
        metrics.httpRequestDurationSeconds.observe({
            method: req.method,
            route: routePath,
            status_code: res.statusCode
        }, responseTime / 1000);
    };

    res.on("finish", onFinish);
    res.on("close", onFinish);
    
    next();
};

module.exports = requestLogger;



