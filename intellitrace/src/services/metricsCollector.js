const fetch = require('node-fetch');
const Application = require('../models/Application');
const MetricSnapshot = require('../models/MetricSnapshot');

const startMetricsCollector = () => {
    const POLL_INTERVAL = parseInt(process.env.METRICS_POLL_INTERVAL_MS || '15000', 10);
    
    setInterval(async () => {
        try {
            const apps = await Application.find({ baseUrl: { $exists: true, $ne: '' } });
            for (const app of apps) {
                try {
                    const res = await fetch(`${app.baseUrl}/metrics`);
                    if (!res.ok) continue;
                    
                    const text = await res.text();
                    
                    // Simple Regex Parsing for the specific metrics we need
                    // Helper to sum all labeled metrics
                    const sumMetric = (name) => {
                        let sum = 0;
                        const regex = new RegExp(`^${name}(?:{[^}]*})?\\s+([0-9.]+)`, 'gm');
                        let match;
                        while ((match = regex.exec(text)) !== null) {
                            sum += parseFloat(match[1]);
                        }
                        return sum;
                    };

                    let requestsTotal = sumMetric('intellishop_http_requests_total');
                    let errorsTotal = sumMetric('intellishop_http_errors_total');
                    let durationSum = sumMetric('intellishop_http_request_duration_seconds_sum');
                    let durationCount = sumMetric('intellishop_http_request_duration_seconds_count');
                    
                    let ordersCreatedTotal = sumMetric('intellishop_orders_created_total');
                    let paymentsStartedTotal = sumMetric('intellishop_payments_started_total');
                    let paymentsSuccessTotal = sumMetric('intellishop_payments_success_total');
                    let paymentsFailedTotal = sumMetric('intellishop_payments_failed_total');
                    let cartOperationsTotal = sumMetric('intellishop_cart_operations_total');

                    const snapshot = new MetricSnapshot({
                        application: app.slug,
                        environment: app.environment,
                        timestamp: new Date(),
                        requestsTotal,
                        errorsTotal,
                        durationSum,
                        durationCount,
                        ordersCreatedTotal,
                        paymentsStartedTotal,
                        paymentsSuccessTotal,
                        paymentsFailedTotal,
                        cartOperationsTotal
                    });

                    await snapshot.save();
                } catch (err) {
                    // Fail silently for unavailable apps, don't crash IntelliTrace
                    console.error(`[MetricsCollector] Failed to collect from ${app.slug}:`, err.message);
                }
            }
        } catch (err) {
            console.error('[MetricsCollector] Error fetching applications:', err.message);
        }
    }, POLL_INTERVAL);
};

module.exports = startMetricsCollector;
