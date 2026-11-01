const promClient = require('prom-client');
promClient.collectDefaultMetrics({ prefix: 'intellishop_payment_' });

const httpRequestsTotal = new promClient.Counter({
    name: 'intellishop_payment_http_requests_total',
    help: 'Total number of HTTP requests to payment service',
    labelNames: ['method', 'route', 'status_code']
});

const httpErrorsTotal = new promClient.Counter({
    name: 'intellishop_payment_http_errors_total',
    help: 'Total number of HTTP errors in payment service',
    labelNames: ['method', 'route', 'status_code']
});

const httpRequestDurationSeconds = new promClient.Histogram({
    name: 'intellishop_payment_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds in payment service',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
});

const paymentsStartedTotal = new promClient.Counter({ name: 'intellishop_payments_started_total', help: 'Total number of payments initiated' });
const paymentsSuccessTotal = new promClient.Counter({ name: 'intellishop_payments_success_total', help: 'Total number of successful payments' });
const paymentsFailedTotal = new promClient.Counter({ name: 'intellishop_payments_failed_total', help: 'Total number of failed payments' });

const failureInjectionsTotal = new promClient.Counter({
    name: 'intellitrace_failure_injections_total',
    help: 'Total number of failure injection events recorded',
    labelNames: ['service', 'failure_type']
});

const failureInjectionsActive = new promClient.Gauge({
    name: 'intellitrace_failure_injections_active',
    help: 'Current active failure injection rules',
    labelNames: ['service']
});

const injectedFailuresTotal = new promClient.Counter({
    name: 'intellitrace_injected_failures_total',
    help: 'Total number of injected failure executions triggered',
    labelNames: ['service', 'failure_type', 'operation']
});

const injectedLatencySeconds = new promClient.Histogram({
    name: 'intellitrace_injected_latency_seconds',
    help: 'Injected artificial latency in seconds',
    labelNames: ['service', 'operation'],
    buckets: [0.5, 1, 2, 3, 5, 8, 10]
});

const failureInjectionErrorsTotal = new promClient.Counter({
    name: 'intellitrace_failure_injection_errors_total',
    help: 'Total errors encountered during failure injection',
    labelNames: ['service']
});

module.exports = {
    promClient, httpRequestsTotal, httpErrorsTotal, httpRequestDurationSeconds,
    paymentsStartedTotal, paymentsSuccessTotal, paymentsFailedTotal,
    failureInjectionsTotal, failureInjectionsActive, injectedFailuresTotal,
    injectedLatencySeconds, failureInjectionErrorsTotal
};
