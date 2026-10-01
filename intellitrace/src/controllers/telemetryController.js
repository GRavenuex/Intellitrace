const Application = require('../models/Application');
const Log = require('../models/Log');

exports.heartbeat = async (req, res, next) => {
    try {
        const { application, environment, status, baseUrl } = req.body;
        const app = await Application.findOne({ slug: application, environment });
        
        if (app) {
            app.lastHeartbeat = new Date();
            if (status) app.status = status;
            if (baseUrl) app.baseUrl = baseUrl;
            await app.save();
        } else {
            // For Phase 5, if it doesn't exist, we can create it or just log it
            // Let's create it automatically for ease of integration
            const newApp = new Application({
                name: application,
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

exports.ingestLogs = async (req, res, next) => {
    try {
        const { application, environment, logs } = req.body;
        let logsToInsert = [];
        
        if (logs && Array.isArray(logs)) {
            logsToInsert = logs.map(l => ({
                ...l,
                service: l.service || application,
                environment: l.environment || environment || 'development',
                timestamp: l.timestamp ? new Date(l.timestamp) : new Date()
            }));
        } else {
            const l = req.body;
            logsToInsert = [{
                ...l,
                service: l.service || application,
                environment: l.environment || environment || 'development',
                timestamp: l.timestamp ? new Date(l.timestamp) : new Date()
            }];
        }
        
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
        if (application) query.service = application;
        if (level && level !== 'ALL') query.level = level;
        if (environment) query.environment = environment;
        
        if (search) {
            query.$or = [
                { message: { $regex: search, $options: 'i' } },
                { route: { $regex: search, $options: 'i' } },
                { requestId: { $regex: search, $options: 'i' } }
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
                items: logs,
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
