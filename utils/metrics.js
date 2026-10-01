const promClient = require('prom-client');

// Create a Registry
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register, prefix: 'intellishop_' });

// Define HTTP request metrics
const httpRequestsTotal = new promClient.Counter({
    name: 'intellishop_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});
register.registerMetric(httpRequestsTotal);

const httpErrorsTotal = new promClient.Counter({
    name: 'intellishop_http_errors_total',
    help: 'Total number of HTTP errors',
    labelNames: ['method', 'route', 'status_code']
});
register.registerMetric(httpErrorsTotal);

const httpRequestDurationSeconds = new promClient.Histogram({
    name: 'intellishop_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
});
register.registerMetric(httpRequestDurationSeconds);

const httpRequestsInFlight = new promClient.Gauge({
    name: 'intellishop_http_requests_in_flight',
    help: 'Number of HTTP requests in progress'
});
register.registerMetric(httpRequestsInFlight);

// Business Metrics: Orders
const ordersCreatedTotal = new promClient.Counter({
    name: 'intellishop_orders_created_total',
    help: 'Total number of successfully created orders'
});
register.registerMetric(ordersCreatedTotal);

// Business Metrics: Payments
const paymentsStartedTotal = new promClient.Counter({
    name: 'intellishop_payments_started_total',
    help: 'Total number of started payments'
});
register.registerMetric(paymentsStartedTotal);

const paymentsSuccessTotal = new promClient.Counter({
    name: 'intellishop_payments_success_total',
    help: 'Total number of successful payments'
});
register.registerMetric(paymentsSuccessTotal);

const paymentsFailedTotal = new promClient.Counter({
    name: 'intellishop_payments_failed_total',
    help: 'Total number of failed payments'
});
register.registerMetric(paymentsFailedTotal);

// Business Metrics: Cart
const cartOperationsTotal = new promClient.Counter({
    name: 'intellishop_cart_operations_total',
    help: 'Total number of cart operations',
    labelNames: ['operation'] // e.g., 'add', 'update', 'remove'
});
register.registerMetric(cartOperationsTotal);

// Business Metrics: Authentication
const authSuccessTotal = new promClient.Counter({
    name: 'intellishop_auth_success_total',
    help: 'Total number of successful authentication operations',
    labelNames: ['operation'] // e.g., 'login', 'register', 'logout'
});
register.registerMetric(authSuccessTotal);

const authFailureTotal = new promClient.Counter({
    name: 'intellishop_auth_failure_total',
    help: 'Total number of failed authentication operations',
    labelNames: ['operation'] // e.g., 'login', 'register'
});
register.registerMetric(authFailureTotal);

// Health Status
const healthStatus = new promClient.Gauge({
    name: 'intellishop_health_status',
    help: 'Current health status of the application (1 = healthy, 0 = unhealthy)'
});
register.registerMetric(healthStatus);

module.exports = {
    register,
    httpRequestsTotal,
    httpErrorsTotal,
    httpRequestDurationSeconds,
    httpRequestsInFlight,
    ordersCreatedTotal,
    paymentsStartedTotal,
    paymentsSuccessTotal,
    paymentsFailedTotal,
    cartOperationsTotal,
    authSuccessTotal,
    authFailureTotal,
    healthStatus
};
