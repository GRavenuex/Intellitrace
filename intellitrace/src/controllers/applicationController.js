const Application = require('../models/Application');
const Log = require('../models/Log');
const MetricSnapshot = require('../models/MetricSnapshot');
const FailureInjection = require('../models/FailureInjection');

// Helper to convert range to milliseconds
const getRangeMs = (rangeStr) => {
    switch (rangeStr) {
        case '15m': return 15 * 60 * 1000;
        case '1h': return 60 * 60 * 1000;
        case '6h': return 6 * 60 * 60 * 1000;
        case '24h': return 24 * 60 * 60 * 1000;
        default: return 15 * 60 * 1000; // default 15m
    }
};

exports.getAll = async (req, res, next) => {
    try {
        const apps = await Application.find().sort('-createdAt');
        res.json({ success: true, data: apps });
    } catch (err) {
        next(err);
    }
};

exports.getById = async (req, res, next) => {
    try {
        const app = await Application.findById(req.params.id);
        if (!app) return res.status(404).json({ success: false, message: 'Application not found' });
        res.json({ success: true, data: app });
    } catch (err) {
        next(err);
    }
};

exports.getSummary = async (req, res, next) => {
    try {
        const { range = '15m' } = req.query;
        const app = await Application.findById(req.params.id);
        if (!app) return res.status(404).json({ success: false, message: 'Application not found' });

        const rangeMs = getRangeMs(range);
        const startTime = new Date(Date.now() - rangeMs);
        
        // Match both prefixed and bare service names for logs and metric snapshots
        const bareName = app.slug.replace('intellishop-', '');
        const serviceNames = Array.from(new Set([
            app.slug,
            bareName,
            app.slug.replace('-service', ''),
            bareName.replace('-service', '')
        ]));
        const serviceFilter = { $in: serviceNames };

        // Find all metric snapshots in the time window, sorted ascending for time-series chart
        const snapshots = await MetricSnapshot.find({ 
            application: { $in: [app.slug, bareName] }, 
            timestamp: { $gte: startTime } 
        }).sort('timestamp');

        // Also fetch the snapshot strictly right BEFORE the time window to correctly calculate the delta for the very first point
        const pastMetric = await MetricSnapshot.findOne({
            application: { $in: [app.slug, bareName] },
            timestamp: { $lt: startTime }
        }).sort('-timestamp');
        
        let requests = 0, errors = 0, latencyMs = 0;
        let orders = 0, paymentsStarted = 0, paymentsSuccess = 0, paymentsFailed = 0, cartOps = 0;
        let hasData = snapshots.length > 0;
        
        let requestsSeries = [];
        let errorsSeries = [];
        let latencySeries = [];

        if (hasData) {
            const latestMetric = snapshots[snapshots.length - 1];
            // If pastMetric exists, use it; if multiple snapshots exist, use the oldest in window; otherwise zero baseline
            const oldestMetric = pastMetric || (snapshots.length > 1 ? snapshots[0] : {
                requestsTotal: 0,
                errorsTotal: 0,
                durationSum: 0,
                durationCount: 0,
                ordersCreatedTotal: 0,
                paymentsStartedTotal: 0,
                paymentsSuccessTotal: 0,
                paymentsFailedTotal: 0,
                cartOperationsTotal: 0
            });
            
            // Calculate Global Deltas
            requests = latestMetric.requestsTotal >= oldestMetric.requestsTotal ? latestMetric.requestsTotal - oldestMetric.requestsTotal : latestMetric.requestsTotal;
            errors = latestMetric.errorsTotal >= oldestMetric.errorsTotal ? latestMetric.errorsTotal - oldestMetric.errorsTotal : latestMetric.errorsTotal;
            
            const durationDelta = latestMetric.durationSum >= oldestMetric.durationSum ? latestMetric.durationSum - oldestMetric.durationSum : latestMetric.durationSum;
            const countDelta = latestMetric.durationCount >= oldestMetric.durationCount ? latestMetric.durationCount - oldestMetric.durationCount : latestMetric.durationCount;
            if (countDelta > 0) latencyMs = Math.round((durationDelta / countDelta) * 1000);
            
            orders = latestMetric.ordersCreatedTotal >= oldestMetric.ordersCreatedTotal ? latestMetric.ordersCreatedTotal - oldestMetric.ordersCreatedTotal : latestMetric.ordersCreatedTotal;
            paymentsStarted = latestMetric.paymentsStartedTotal >= oldestMetric.paymentsStartedTotal ? latestMetric.paymentsStartedTotal - oldestMetric.paymentsStartedTotal : latestMetric.paymentsStartedTotal;
            paymentsSuccess = latestMetric.paymentsSuccessTotal >= oldestMetric.paymentsSuccessTotal ? latestMetric.paymentsSuccessTotal - oldestMetric.paymentsSuccessTotal : latestMetric.paymentsSuccessTotal;
            paymentsFailed = latestMetric.paymentsFailedTotal >= oldestMetric.paymentsFailedTotal ? latestMetric.paymentsFailedTotal - oldestMetric.paymentsFailedTotal : latestMetric.paymentsFailedTotal;
            cartOps = latestMetric.cartOperationsTotal >= oldestMetric.cartOperationsTotal ? latestMetric.cartOperationsTotal - oldestMetric.cartOperationsTotal : latestMetric.cartOperationsTotal;

            // Generate Series Data
            let previousSnap = pastMetric || snapshots[0];
            for (let i = 0; i < snapshots.length; i++) {
                const snap = snapshots[i];
                const timestampStr = snap.timestamp.toISOString();
                
                let reqDelta = snap.requestsTotal >= previousSnap.requestsTotal ? snap.requestsTotal - previousSnap.requestsTotal : snap.requestsTotal;
                let errDelta = snap.errorsTotal >= previousSnap.errorsTotal ? snap.errorsTotal - previousSnap.errorsTotal : snap.errorsTotal;
                let durDelta = snap.durationSum >= previousSnap.durationSum ? snap.durationSum - previousSnap.durationSum : snap.durationSum;
                let cDelta = snap.durationCount >= previousSnap.durationCount ? snap.durationCount - previousSnap.durationCount : snap.durationCount;
                
                let latMs = 0;
                if (cDelta > 0) latMs = Math.round((durDelta / cDelta) * 1000);
                
                requestsSeries.push({ timestamp: timestampStr, value: reqDelta });
                errorsSeries.push({ timestamp: timestampStr, value: errDelta });
                latencySeries.push({ timestamp: timestampStr, value: latMs });
                
                previousSnap = snap;
            }
        }

        // Get recent logs and errors matching serviceFilter
        const recentLogs = await Log.find({ service: serviceFilter }).sort('-timestamp').limit(20);
        const recentErrors = await Log.find({ service: serviceFilter, level: 'ERROR' }).sort('-timestamp').limit(20);

        // Account for error logs occurring in this time window
        const errorLogCount = await Log.countDocuments({ service: serviceFilter, level: 'ERROR', timestamp: { $gte: startTime } });
        if (errorLogCount > errors) {
            errors = errorLogCount;
        }
        if (requests < errors) {
            requests = errors;
        }

        let errorRate = 0;
        if (requests > 0) {
            errorRate = ((errors / requests) * 100).toFixed(1);
        }

        // Find active failure injections targeting this service (or cascading impact)
        const now = new Date();
        const isOrderService = bareName === 'order-service' || app.slug === 'intellishop-order-service';
        const isPaymentService = bareName === 'payment-service' || app.slug === 'intellishop-payment-service';

        const activeFailures = await FailureInjection.find({
            $or: [
                { targetService: { $in: [app.slug, bareName] } },
                isOrderService ? { failureType: 'cascading_failure', status: { $in: ['ACTIVE', 'TRIGGERED'] } } : { _id: null }
            ],
            status: { $in: ['ACTIVE', 'TRIGGERED'] },
            expiresAt: { $gt: now }
        }).sort('-createdAt');

        let activeFailure = null;
        if (activeFailures.length > 0) {
            const primary = activeFailures[0];
            let role = 'origin';
            let description = primary.description || '';
            if (primary.failureType === 'cascading_failure') {
                if (isOrderService) {
                    role = 'downstream';
                    description = 'Cascading Downstream Failure: Order checkout impacted by downstream Payment Service outage';
                } else if (isPaymentService) {
                    role = 'origin';
                    description = 'Cascading Failure Origin: Payment Service error causing upstream checkout failures';
                }
            }

            // Find related traceId from recent error logs
            const correlatedLog = recentErrors.find(e => e.traceId || e.requestId);
            const relatedTraceId = correlatedLog ? (correlatedLog.traceId || null) : null;

            activeFailure = {
                id: primary._id,
                failureType: primary.failureType,
                targetRoute: primary.targetRoute,
                delayMs: primary.delayMs,
                status: primary.status,
                triggerCount: primary.triggerCount || 0,
                lastTriggeredAt: primary.lastTriggeredAt,
                role,
                description,
                relatedTraceId
            };
        }

        // Service Health Status Calculation
        let calculatedStatus = 'healthy';
        const lastHbMs = app.lastHeartbeat ? new Date(app.lastHeartbeat).getTime() : 0;
        const msSinceHb = Date.now() - lastHbMs;

        if (!lastHbMs || msSinceHb > 60000) {
            calculatedStatus = 'down';
        } else {
            const hasTriggered = activeFailures.some(f => f.status === 'TRIGGERED' || (f.triggerCount && f.triggerCount > 0));
            const highErrorRate = parseFloat(errorRate) > 15 && errors >= 2;
            const highLatency = latencyMs > 2000;
            const recentErrorsIn2m = recentErrors.filter(e => (Date.now() - new Date(e.timestamp).getTime()) < 120000).length;

            if (hasTriggered || highErrorRate || recentErrorsIn2m >= 2 || highLatency) {
                calculatedStatus = 'degraded';
            } else if (activeFailures.length > 0) {
                calculatedStatus = 'degraded';
            } else {
                calculatedStatus = 'healthy';
            }
        }

        // Database monitoring status (detect application query timeout without marking MongoDB container down)
        const dbTimeoutLogs = recentErrors.filter(e => 
            e.failureType === 'DATABASE_TIMEOUT' || 
            String(e.message).includes('MongoTimeout') ||
            String(e.message).includes('database_timeout')
        );
        const hasDbTimeout = dbTimeoutLogs.length > 0;
        const dbStatus = {
            service: 'mongodb',
            containerStatus: 'RUNNING',
            hasQueryTimeout: hasDbTimeout,
            timeoutCount: dbTimeoutLogs.length,
            affectedOperation: hasDbTimeout ? (dbTimeoutLogs[0].targetOperation || 'find / insert') : null,
            latestTraceId: hasDbTimeout && dbTimeoutLogs[0].traceId ? dbTimeoutLogs[0].traceId : null
        };

        res.json({
            success: true,
            data: {
                hasData,
                application: app.slug,
                status: calculatedStatus,
                environment: app.environment,
                baseUrl: app.baseUrl,
                lastHeartbeat: app.lastHeartbeat,
                range,
                metrics: {
                    requests: Math.max(0, requests),
                    errors: Math.max(0, errors),
                    errorRate: errorRate,
                    latencyMs: Math.max(0, latencyMs),
                    incidents: activeFailure ? 1 : 0,
                    business: {
                        orders,
                        paymentsStarted,
                        paymentsSuccess,
                        paymentsFailed,
                        cartOps
                    }
                },
                series: {
                    requests: requestsSeries,
                    errors: errorsSeries,
                    latency: latencySeries
                },
                activeFailure,
                dbStatus,
                recentLogs,
                recentErrors
            }
        });
    } catch (err) {
        next(err);
    }
};

exports.create = async (req, res, next) => {
    try {
        const { name, slug, environment, baseUrl } = req.body;
        const existing = await Application.findOne({ slug });
        if (existing) return res.status(400).json({ success: false, message: 'Slug already exists' });
        
        const app = new Application({ name, slug, environment, baseUrl });
        await app.save();
        res.status(201).json({ success: true, data: app });
    } catch (err) {
        next(err);
    }
};

exports.update = async (req, res, next) => {
    try {
        const app = await Application.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!app) return res.status(404).json({ success: false, message: 'Application not found' });
        res.json({ success: true, data: app });
    } catch (err) {
        next(err);
    }
};

exports.delete = async (req, res, next) => {
    try {
        const app = await Application.findByIdAndDelete(req.params.id);
        if (!app) return res.status(404).json({ success: false, message: 'Application not found' });
        res.json({ success: true, message: 'Application deleted' });
    } catch (err) {
        next(err);
    }
};
