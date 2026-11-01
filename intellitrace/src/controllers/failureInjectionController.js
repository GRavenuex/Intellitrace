const FailureInjection = require('../models/FailureInjection');
const Log = require('../models/Log');

const VALID_SERVICES = [
    'intellishop-gateway',
    'product-service',
    'cart-service',
    'order-service',
    'payment-service'
];

const VALID_TYPES = [
    'latency',
    'http_500',
    'service_unavailable',
    'database_timeout',
    'intermittent',
    'network_delay',
    'service_communication_failure',
    'traffic_spike',
    'cascading_failure'
];

// Helper to check environment safety
function isEnvironmentAllowed() {
    const currentEnv = (process.env.NODE_ENV || 'development').toLowerCase();
    const allowedEnvs = (process.env.FAILURE_INJECTION_ENVIRONMENTS || 'development,test')
        .split(',')
        .map(e => e.trim().toLowerCase());
    
    if (currentEnv === 'production' && !allowedEnvs.includes('production')) {
        return false;
    }
    return true;
}

// Helper to lazily update expired active injections
async function expireStaleInjections() {
    try {
        const now = new Date();
        const expired = await FailureInjection.find({
            status: { $in: ['ACTIVE', 'TRIGGERED'] },
            expiresAt: { $lte: now }
        });

        for (const item of expired) {
            item.status = 'EXPIRED';
            await item.save();

            // Log expiration event
            await Log.create({
                timestamp: now,
                level: 'INFO',
                service: item.targetService,
                environment: item.environment,
                message: `FAILURE_INJECTION_EXPIRED: Rule ${item._id} has expired`,
                failureId: item._id.toString(),
                failureType: item.failureType.toUpperCase(),
                targetOperation: item.targetRoute
            }).catch(() => {});
        }
    } catch (_) {}
}

// POST /api/v1/failure-injections
exports.createFailureInjection = async (req, res, next) => {
    try {
        if (!isEnvironmentAllowed()) {
            return res.status(403).json({
                success: false,
                message: 'Failure injection is prohibited in this environment'
            });
        }

        const {
            targetService,
            failureType,
            targetRoute = '*',
            delayMs = 0,
            percentage = 100,
            durationSeconds = 60,
            sourceService = null,
            description = ''
        } = req.body;

        // Validation
        if (!targetService || !VALID_SERVICES.includes(targetService)) {
            return res.status(400).json({
                success: false,
                message: `Invalid targetService. Allowed services: ${VALID_SERVICES.join(', ')}`
            });
        }

        if (!failureType || !VALID_TYPES.includes(failureType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid failureType. Allowed types: ${VALID_TYPES.join(', ')}`
            });
        }

        const delay = parseInt(delayMs, 10) || 0;
        if (delay < 0 || delay > 10000) {
            return res.status(400).json({
                success: false,
                message: 'delayMs must be between 0 and 10000 (max 10 seconds)'
            });
        }

        const duration = parseInt(durationSeconds, 10) || 60;
        if (duration < 1 || duration > 300) {
            return res.status(400).json({
                success: false,
                message: 'durationSeconds must be between 1 and 300 (max 5 minutes)'
            });
        }

        const pct = parseInt(percentage, 10);
        if (isNaN(pct) || pct < 1 || pct > 100) {
            return res.status(400).json({
                success: false,
                message: 'percentage must be an integer between 1 and 100'
            });
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + duration * 1000);
        const creator = req.user ? (req.user.email || req.user.username || 'developer') : 'developer';

        // Auto-expire stale injections first
        await expireStaleInjections();

        // Deactivate conflicting rules for this targetService
        await FailureInjection.updateMany(
            { targetService, status: { $in: ['ACTIVE', 'TRIGGERED'] } },
            { status: 'DEACTIVATED', stoppedAt: now, stoppedBy: creator }
        );

        const injection = new FailureInjection({
            targetService,
            failureType,
            targetRoute: targetRoute.trim(),
            delayMs: delay,
            percentage: pct,
            durationSeconds: duration,
            sourceService,
            description,
            status: 'ACTIVE',
            environment: process.env.NODE_ENV || 'development',
            startedAt: now,
            expiresAt,
            createdBy: creator
        });

        await injection.save();

        // Audit Log in MongoDB Log collection
        await Log.create({
            timestamp: now,
            level: 'WARN',
            service: targetService,
            environment: process.env.NODE_ENV || 'development',
            message: `FAILURE_INJECTION_CREATED: Activated ${failureType.toUpperCase()} on ${targetRoute} for ${duration}s`,
            failureId: injection._id.toString(),
            failureType: failureType.toUpperCase(),
            targetOperation: targetRoute,
            delayMs: delay,
            requestId: req.headers['x-request-id'] || 'system'
        }).catch(() => {});

        res.status(201).json({
            success: true,
            message: `Failure injection activated for ${targetService}`,
            data: injection
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/v1/failure-injections/active
exports.getActiveInjections = async (req, res, next) => {
    try {
        await expireStaleInjections();

        const query = {
            status: { $in: ['ACTIVE', 'TRIGGERED'] },
            expiresAt: { $gt: new Date() }
        };

        if (req.query.service) {
            query.targetService = req.query.service;
        }

        const activeRules = await FailureInjection.find(query).sort('-createdAt');
        res.json({
            success: true,
            count: activeRules.length,
            data: activeRules
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/v1/failure-injections
exports.getFailureInjections = async (req, res, next) => {
    try {
        await expireStaleInjections();

        const { service, type, status, page = 1, limit = 20 } = req.query;
        const query = {};

        if (service) query.targetService = service;
        if (type) query.failureType = type;
        if (status) query.status = status;

        const pageNum = parseInt(page, 10);
        const limitNum = Math.min(parseInt(limit, 10), 100);
        const skip = (pageNum - 1) * limitNum;

        const total = await FailureInjection.countDocuments(query);
        const items = await FailureInjection.find(query)
            .sort('-createdAt')
            .skip(skip)
            .limit(limitNum);

        res.json({
            success: true,
            total,
            page: pageNum,
            limit: limitNum,
            data: items
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/v1/failure-injections/:id
exports.getFailureInjectionById = async (req, res, next) => {
    try {
        await expireStaleInjections();
        const injection = await FailureInjection.findById(req.params.id);
        if (!injection) {
            return res.status(404).json({ success: false, message: 'Failure injection rule not found' });
        }
        res.json({ success: true, data: injection });
    } catch (err) {
        next(err);
    }
};

// PATCH /api/v1/failure-injections/:id/stop
exports.stopFailureInjection = async (req, res, next) => {
    try {
        const injection = await FailureInjection.findById(req.params.id);
        if (!injection) {
            return res.status(404).json({ success: false, message: 'Failure injection rule not found' });
        }

        if (injection.status === 'STOPPED' || injection.status === 'EXPIRED') {
            return res.json({
                success: true,
                message: `Failure injection rule was already ${injection.status}`,
                data: injection
            });
        }

        const now = new Date();
        const stopper = req.user ? (req.user.email || req.user.username || 'developer') : (req.body && req.body.stoppedBy ? req.body.stoppedBy : 'developer');

        injection.status = 'STOPPED';
        injection.stoppedAt = now;
        injection.stoppedBy = stopper;
        await injection.save();

        // Audit Log
        await Log.create({
            timestamp: now,
            level: 'INFO',
            service: injection.targetService,
            environment: injection.environment,
            message: `FAILURE_INJECTION_STOPPED: Deactivated ${injection.failureType.toUpperCase()} rule by ${stopper}`,
            failureId: injection._id.toString(),
            failureType: injection.failureType.toUpperCase(),
            targetOperation: injection.targetRoute
        }).catch(() => {});

        res.json({
            success: true,
            message: `Failure injection stopped for ${injection.targetService}`,
            data: injection
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/v1/failure-injections/status
exports.getSimulationStatus = async (req, res, next) => {
    try {
        await expireStaleInjections();
        const { service } = req.query;
        const query = {
            status: { $in: ['ACTIVE', 'TRIGGERED'] },
            expiresAt: { $gt: new Date() }
        };
        if (service) {
            query.targetService = service;
        }

        const activeInjections = await FailureInjection.find(query).sort('-createdAt');
        res.json({
            success: true,
            count: activeInjections.length,
            data: activeInjections
        });
    } catch (err) {
        next(err);
    }
};

// POST /api/v1/failure-injections/:id/trigger
exports.recordTrigger = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id || id.length !== 24) {
            return res.status(400).json({ success: false, message: 'Invalid failure injection ID' });
        }

        const injection = await FailureInjection.findById(id);
        if (!injection) {
            return res.status(404).json({ success: false, message: 'Failure injection rule not found' });
        }

        const now = new Date();
        if (injection.expiresAt <= now || ['STOPPED', 'EXPIRED', 'DEACTIVATED'].includes(injection.status)) {
            return res.status(400).json({ success: false, message: 'Failure injection rule is not active' });
        }

        injection.status = 'TRIGGERED';
        injection.triggerCount = (injection.triggerCount || 0) + 1;
        injection.lastTriggeredAt = now;
        await injection.save();

        res.json({
            success: true,
            message: `Recorded trigger for ${injection.failureType} on ${injection.targetService}`,
            data: injection
        });
    } catch (err) {
        next(err);
    }
};

// POST /api/v1/failure-injections/deactivate-service
exports.deactivateService = async (req, res, next) => {
    try {
        const { targetService } = req.body;
        if (!targetService) {
            return res.status(400).json({ success: false, message: 'targetService is required' });
        }

        const now = new Date();
        const stopper = req.user ? (req.user.email || req.user.username || 'developer') : (req.body && req.body.stoppedBy ? req.body.stoppedBy : 'developer');

        const result = await FailureInjection.updateMany(
            { targetService, status: { $in: ['ACTIVE', 'TRIGGERED'] } },
            { status: 'DEACTIVATED', stoppedAt: now, stoppedBy: stopper }
        );

        res.json({
            success: true,
            message: `Deactivated active rule(s) for ${targetService}`,
            modifiedCount: result.modifiedCount
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/v1/failure-injections/history
exports.getHistory = async (req, res, next) => {
    try {
        await expireStaleInjections();

        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const rules = await FailureInjection.find().sort('-createdAt').limit(limit);

        // Fetch related simulation logs
        const auditLogs = await Log.find({
            message: { $regex: '^FAILURE_INJECTION_', $options: 'i' }
        }).sort('-timestamp').limit(limit);

        res.json({
            success: true,
            data: {
                injections: rules,
                auditLogs
            }
        });
    } catch (err) {
        next(err);
    }
};
