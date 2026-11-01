const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const logger = require('../middleware/logger');

const INTELLITRACE_URL = process.env.INTELLITRACE_URL || 'http://localhost:4000/api/v1';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3001';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3004';

// Environment Safety Guard
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

// GET /developer/failure-injections/status
router.get('/status', async (req, res) => {
    try {
        const { service } = req.query;
        let url = `${INTELLITRACE_URL}/failure-injections/status`;
        if (service) url += `?service=${encodeURIComponent(service)}`;

        const response = await fetch(url, { timeout: 3000 });
        if (!response.ok) {
            return res.json({ success: true, count: 0, data: [] });
        }
        const data = await response.json();
        res.json(data);
    } catch (err) {
        res.json({ success: false, message: err.message, data: [] });
    }
});

// POST /developer/failure-injections/activate
router.post('/activate', async (req, res) => {
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
            durationSeconds = 60,
            sourceService = null,
            description = ''
        } = req.body;

        // Validation
        const delay = Math.min(Math.max(parseInt(delayMs, 10) || 0, 0), 10000);
        const duration = Math.min(Math.max(parseInt(durationSeconds, 10) || 60, 5), 300);

        const response = await fetch(`${INTELLITRACE_URL}/failure-injections/activate-direct`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetService,
                failureType,
                targetRoute,
                delayMs: delay,
                durationSeconds: duration,
                sourceService,
                description,
                percentage: 100
            }),
            timeout: 5000
        });

        const data = await response.json();
        logger.info("Developer activated failure simulation", {
            targetService,
            failureType,
            durationSeconds: duration,
            delayMs: delay
        });
        res.status(response.status).json(data);
    } catch (err) {
        logger.error("Failed to activate failure simulation", { error: err.message });
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /developer/failure-injections/deactivate
router.post('/deactivate', async (req, res) => {
    try {
        const { targetService, failureId } = req.body;

        if (failureId) {
            const response = await fetch(`${INTELLITRACE_URL}/failure-injections/${failureId}/stop-direct`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                timeout: 3000
            });
            const data = await response.json();
            return res.json(data);
        }

        if (targetService) {
            const response = await fetch(`${INTELLITRACE_URL}/failure-injections/deactivate-service`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetService }),
                timeout: 3000
            });
            const data = await response.json();
            return res.json(data);
        }

        res.status(400).json({ success: false, message: 'targetService or failureId is required' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /developer/failure-injections/traffic-spike
router.post('/traffic-spike', async (req, res) => {
    try {
        if (!isEnvironmentAllowed()) {
            return res.status(403).json({
                success: false,
                message: 'Traffic simulation is prohibited in this environment'
            });
        }

        const {
            targetService = 'product-service',
            requestCount = 50,
            concurrency = 5
        } = req.body;

        const count = Math.min(Math.max(parseInt(requestCount, 10) || 50, 1), 100);
        const poolSize = Math.min(Math.max(parseInt(concurrency, 10) || 5, 1), 10);

        // Resolve target URL
        let targetUrl;
        if (targetService === 'order-service') {
            targetUrl = `${ORDER_SERVICE_URL}/api/orders`;
        } else if (targetService === 'payment-service') {
            targetUrl = `${PAYMENT_SERVICE_URL}/api/payments/verify`;
        } else {
            targetUrl = `${PRODUCT_SERVICE_URL}/api/products`;
        }

        logger.warn(`TRAFFIC_SPIKE_STARTED: Generating ${count} requests against ${targetService} with concurrency ${poolSize}`, {
            targetService,
            targetUrl,
            requestCount: count,
            concurrency: poolSize
        });

        // Register experiment with IntelliTrace
        let experimentId = null;
        try {
            const expRes = await fetch(`${INTELLITRACE_URL}/failure-injections/activate-direct`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetService,
                    failureType: 'traffic_spike',
                    targetRoute: targetUrl,
                    durationSeconds: 120,
                    description: `Traffic Spike: ${count} requests, concurrency ${poolSize}`
                }),
                timeout: 3000
            });
            const expData = await expRes.json();
            if (expData.success && expData.data) {
                experimentId = expData.data._id;
            }
        } catch (_) {}

        const startTime = Date.now();
        let completed = 0;
        let successful = 0;
        let failed = 0;
        const latencies = [];

        // Concurrency worker queue
        let nextIndex = 0;
        async function worker() {
            while (nextIndex < count) {
                const i = nextIndex++;
                const reqStart = Date.now();
                const reqId = `traffic-spike-${Date.now()}-${i}`;
                try {
                    const headers = {
                        'x-request-id': reqId,
                        'x-traffic-spike': 'true'
                    };
                    try {
                        const { propagation, context } = require('@opentelemetry/api');
                        propagation.inject(context.active(), headers);
                    } catch (_) {}

                    const r = await fetch(targetUrl, {
                        method: 'GET',
                        headers,
                        timeout: 8000
                    });
                    const duration = Date.now() - reqStart;
                    latencies.push(duration);
                    if (r.ok) {
                        successful++;
                    } else {
                        failed++;
                    }
                } catch (err) {
                    failed++;
                } finally {
                    completed++;
                }
            }
        }

        const workers = [];
        for (let w = 0; w < poolSize; w++) {
            workers.push(worker());
        }
        await Promise.all(workers);

        const totalDuration = Date.now() - startTime;
        const avgLatency = latencies.length > 0 
            ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) 
            : 0;

        // Record trigger if experiment created
        if (experimentId) {
            try {
                await fetch(`${INTELLITRACE_URL}/failure-injections/${experimentId}/trigger`, {
                    method: 'POST',
                    timeout: 2000
                });
            } catch (_) {}
        }

        logger.info(`TRAFFIC_SPIKE_COMPLETED: Finished ${count} requests in ${totalDuration}ms`, {
            targetService,
            totalRequests: count,
            successful,
            failed,
            avgLatencyMs: avgLatency,
            totalDurationMs: totalDuration
        });

        res.json({
            success: true,
            status: 'COMPLETED',
            targetService,
            totalRequests: count,
            successful,
            failed,
            avgLatencyMs: avgLatency,
            durationMs: totalDuration,
            experimentId
        });
    } catch (err) {
        logger.error("Traffic spike execution failed", { error: err.message });
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
