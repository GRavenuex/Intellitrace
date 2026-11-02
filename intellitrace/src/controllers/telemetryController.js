const Application = require('../models/Application');
const Log = require('../models/Log');
const { sanitizeObject } = require('../utils/sanitizer');

exports.heartbeat = async (req, res, next) => {
    try {
        const { application, environment, status, baseUrl } = req.body;
        const nameMap = {
            'intellishop': 'IntelliShop',
            'intellishop-product-service': 'Product Service',
            'intellishop-cart-service': 'Cart Service',
            'intellishop-order-service': 'Order Service',
            'intellishop-payment-service': 'Payment Service'
        };
        const appName = nameMap[application] || application;

        const app = await Application.findOne({ slug: application });
        
        if (app) {
            app.lastHeartbeat = new Date();
            if (status) app.status = status;
            if (baseUrl) app.baseUrl = baseUrl;
            if (environment) app.environment = environment;
            if (appName && (app.name === application || !app.name)) app.name = appName;
            await app.save();
        } else {
            // Automatically register application from incoming heartbeat
            const newApp = new Application({
                name: appName,
                slug: application,
                environment: environment || 'development',
                status: status || 'unknown',
                baseUrl: baseUrl || '',
                lastHeartbeat: new Date()
            });
            await newApp.save();
        }

        res.json({ success: true, message: 'Heartbeat received' });
    } catch (err) {
        next(err);
    }
};

function normalizeServiceName(name) {
    if (!name) return name;
    const map = {
        'intellishop-payment-service': 'payment-service',
        'intellishop-order-service': 'order-service',
        'intellishop-cart-service': 'cart-service',
        'intellishop-product-service': 'product-service',
        'intellishop': 'intellishop-gateway'
    };
    return map[name] || name;
}

exports.ingestLogs = async (req, res, next) => {
    try {
        const { application, environment, logs } = req.body;
        let rawList = logs && Array.isArray(logs) ? logs : [req.body];
        
        const logsToInsert = rawList.map(raw => {
            const l = sanitizeObject(raw);
            const service = normalizeServiceName(l.service || application);
            const originatingService = l.originatingService ? normalizeServiceName(l.originatingService) : undefined;
            const reportingService = l.reportingService ? normalizeServiceName(l.reportingService) : undefined;

            return {
                ...l,
                service,
                ...(originatingService ? { originatingService } : {}),
                ...(reportingService ? { reportingService } : {}),
                environment: l.environment || environment || 'development',
                timestamp: l.timestamp ? new Date(l.timestamp) : new Date()
            };
        });
        
        if (logsToInsert.length > 0) {
            await Log.insertMany(logsToInsert);
        }
        res.json({ success: true, message: 'Logs ingested' });
    } catch (err) {
        next(err);
    }
};

exports.getLogs = async (req, res, next) => {
    try {
        const { application, level, environment, search, page = 1, limit = 50, range = '24h' } = req.query;
        let query = {};
        if (application) {
            const bare = application.replace('intellishop-', '');
            const prefixed = application.startsWith('intellishop-') ? application : `intellishop-${application}`;
            query.service = { $in: [application, bare, prefixed] };
        }
        if (level && level !== 'ALL') query.level = level;
        if (environment) query.environment = environment;
        
        if (search) {
            query.$or = [
                { message: { $regex: search, $options: 'i' } },
                { route: { $regex: search, $options: 'i' } },
                { requestId: { $regex: search, $options: 'i' } },
                { failureType: { $regex: search, $options: 'i' } },
                { 'error.name': { $regex: search, $options: 'i' } },
                { 'error.message': { $regex: search, $options: 'i' } }
            ];
        }

        // Handle time range
        let rangeMs;
        switch (range) {
            case '15m': rangeMs = 15 * 60 * 1000; break;
            case '1h': rangeMs = 60 * 60 * 1000; break;
            case '6h': rangeMs = 6 * 60 * 60 * 1000; break;
            case '24h': rangeMs = 24 * 60 * 60 * 1000; break;
            default: rangeMs = 24 * 60 * 60 * 1000;
        }
        if (rangeMs) {
            query.timestamp = { $gte: new Date(Date.now() - rangeMs) };
        }

        const pageNum = parseInt(page, 10);
        const limitNum = Math.min(parseInt(limit, 10), 500); // hard cap at 500
        const skip = (pageNum - 1) * limitNum;

        const total = await Log.countDocuments(query);
        const logs = await Log.find(query).sort('-timestamp').skip(skip).limit(limitNum);

        res.json({ 
            success: true, 
            data: {
                items: logs.map(l => sanitizeObject(l.toObject ? l.toObject() : l)),
                page: pageNum,
                limit: limitNum,
                total,
                hasNext: skip + logs.length < total
            }
        });
    } catch (err) {
        next(err);
    }
};

exports.ingestMetrics = async (req, res, next) => {
    // Foundation endpoint. Not storing in MongoDB natively right now.
    res.json({ success: true, message: 'Metrics ingestion endpoint ready (Foundation)' });
};
