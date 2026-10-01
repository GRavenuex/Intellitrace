const Application = require('../models/Application');
const Log = require('../models/Log');
const MetricSnapshot = require('../models/MetricSnapshot');

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
        
        // Find all metric snapshots in the time window, sorted ascending for time-series chart
        const snapshots = await MetricSnapshot.find({ 
            application: app.slug, 
            timestamp: { $gte: startTime } 
        }).sort('timestamp');

        // Also fetch the snapshot strictly right BEFORE the time window to correctly calculate the delta for the very first point
        const pastMetric = await MetricSnapshot.findOne({
            application: app.slug,
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
            // Compare latest to the oldest available bound (either the one strictly before the window, or the very first in the window)
            const oldestMetric = pastMetric || snapshots[0];
            
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
                
                // Add rate per minute if we assume each snapshot covers interval (e.g. 15s)
                requestsSeries.push({ timestamp: timestampStr, value: reqDelta });
                errorsSeries.push({ timestamp: timestampStr, value: errDelta });
                latencySeries.push({ timestamp: timestampStr, value: latMs });
                
                previousSnap = snap;
            }
        }

        let errorRate = 0;
        if (requests > 0) {
            errorRate = ((errors / requests) * 100).toFixed(2);
        }

        // Get recent logs
        const recentLogs = await Log.find({ service: app.slug }).sort('-timestamp').limit(15);
        
        // Get recent errors
        const recentErrors = await Log.find({ service: app.slug, level: 'ERROR' }).sort('-timestamp').limit(15);

        res.json({
            success: true,
            data: {
                hasData,
                application: app.slug,
                status: app.status,
                environment: app.environment,
                baseUrl: app.baseUrl,
                lastHeartbeat: app.lastHeartbeat,
                range,
                metrics: {
                    requests: Math.max(0, requests),
                    errors: Math.max(0, errors),
                    errorRate: errorRate,
                    latencyMs: Math.max(0, latencyMs),
                    incidents: 0,
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
