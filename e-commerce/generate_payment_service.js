const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'services', 'payment-service');

['routes', 'controllers', 'models', 'utils', 'utils/serviceClients'].forEach(dir => {
    fs.mkdirSync(path.join(baseDir, dir), { recursive: true });
});

// 1. .env
fs.writeFileSync(path.join(baseDir, '.env'), `PORT=3004
MONGO_URI=mongodb+srv://root:root@cluster1.mwwv0wt.mongodb.net/intellitrace?appName=Cluster1
NODE_ENV=development
INTELLITRACE_URL=http://localhost:4000/api/v1
ORDER_SERVICE_URL=http://localhost:3003
CART_SERVICE_URL=http://localhost:3002
`);

// 2. models/payment.js
fs.writeFileSync(path.join(baseDir, 'models', 'payment.js'), `const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const paymentSchema = new Schema({
    orderId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['success', 'failed', 'pending'], required: true },
    transactionId: { type: String, required: true },
    paymentMethod: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
`);

// 3. models/notification.js (Payment service will handle creating payment/order notifications for now)
fs.writeFileSync(path.join(baseDir, 'models', 'notification.js'), `const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const notificationSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, required: true },
    orderId: { type: Schema.Types.ObjectId },
    message: { type: String, required: true },
    type: { type: String, enum: ['order', 'payment', 'system'], required: true },
    status: { type: String, enum: ['unread', 'read'], default: 'unread' }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
`);


// 4. utils/metrics.js
fs.writeFileSync(path.join(baseDir, 'utils', 'metrics.js'), `const promClient = require('prom-client');
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

module.exports = {
    promClient, httpRequestsTotal, httpErrorsTotal, httpRequestDurationSeconds,
    paymentsStartedTotal, paymentsSuccessTotal, paymentsFailedTotal
};
`);

// 5. utils/telemetry.js
fs.writeFileSync(path.join(baseDir, 'utils', 'telemetry.js'), `const http = require('http');
const INTELLITRACE_URL = process.env.INTELLITRACE_URL || 'http://localhost:4000/api/v1';
const SERVICE_NAME = 'intellishop-payment-service';

const getHeaders = (dataLength) => ({
    'Content-Type': 'application/json',
    'Content-Length': dataLength
});

setInterval(() => {
    const data = JSON.stringify({ application: SERVICE_NAME, environment: 'development', status: 'healthy', baseUrl: 'http://localhost:3004' });
    const req = http.request(\`\${INTELLITRACE_URL}/heartbeat\`, { method: 'POST', headers: getHeaders(Buffer.byteLength(data)) });
    req.on('error', () => {});
    req.write(data);
    req.end();
}, 10000);

let logBuffer = [];
setInterval(() => {
    if (logBuffer.length === 0) return;
    const logsToSend = [...logBuffer];
    logBuffer = [];
    const data = JSON.stringify({ application: SERVICE_NAME, environment: 'development', logs: logsToSend });
    try {
        const req = http.request(\`\${INTELLITRACE_URL}/logs\`, { method: 'POST', headers: getHeaders(Buffer.byteLength(data)) });
        req.on('error', () => {});
        req.write(data);
        req.end();
    } catch(e) {}
}, 5000);

exports.sendLog = (logString) => {
    try {
        logBuffer.push(JSON.parse(logString));
        if(logBuffer.length > 100) logBuffer.shift();
    } catch (e) {
        logBuffer.push({ message: logString });
    }
};
`);

// 6. utils/logger.js
fs.writeFileSync(path.join(baseDir, 'utils', 'logger.js'), `const winston = require('winston');
const telemetry = require('./telemetry');

const myFormat = winston.format.printf((info) => {
    const logObj = { timestamp: new Date().toISOString(), level: info.level.toUpperCase(), service: 'intellishop-payment-service', environment: 'development', message: info.message, ...info };
    delete logObj.level; logObj.level = info.level.toUpperCase();
    telemetry.sendLog(JSON.stringify(logObj));
    return JSON.stringify(logObj);
});

module.exports = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), myFormat),
    transports: [new winston.transports.Console()]
});
`);


// 7. utils/serviceClients/orderClient.js
fs.writeFileSync(path.join(baseDir, 'utils', 'serviceClients', 'orderClient.js'), `const fetch = require('node-fetch');
const logger = require('../logger');
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';
const getHeaders = (requestId) => ({ 'Content-Type': 'application/json', 'x-request-id': requestId || 'unknown' });

exports.getOrderById = async (id, requestId) => {
    try {
        const res = await fetch(\`\${ORDER_SERVICE_URL}/api/orders/\${id}\`, { headers: getHeaders(requestId) });
        if (!res.ok) throw new Error(\`Order service responded with \${res.status}\`);
        return await res.json();
    } catch (err) { logger.error("Failed to call order service getOrderById", { requestId, orderId: id, error: err.message }); throw err; }
};

exports.updateOrder = async (id, updateData, requestId) => {
    try {
        const res = await fetch(\`\${ORDER_SERVICE_URL}/api/orders/\${id}\`, { method: 'PUT', headers: getHeaders(requestId), body: JSON.stringify(updateData) });
        if (!res.ok) throw new Error(\`Order service responded with \${res.status}\`);
        return await res.json();
    } catch (err) { logger.error("Failed to call order service updateOrder", { requestId, orderId: id, error: err.message }); throw err; }
};
`);

// 8. utils/serviceClients/cartClient.js
fs.writeFileSync(path.join(baseDir, 'utils', 'serviceClients', 'cartClient.js'), `const fetch = require('node-fetch');
const logger = require('../logger');
const CART_SERVICE_URL = process.env.CART_SERVICE_URL || 'http://localhost:3002';
const getHeaders = (requestId) => ({ 'Content-Type': 'application/json', 'x-request-id': requestId || 'unknown' });

exports.clearCart = async (userId, requestId) => {
    try {
        const res = await fetch(\`\${CART_SERVICE_URL}/api/cart/\${userId}/clear\`, { method: 'DELETE', headers: getHeaders(requestId) });
        if (!res.ok) throw new Error(\`Cart service responded with \${res.status}\`);
        return await res.json();
    } catch (err) { logger.error("Failed to call cart service clearCart", { requestId, userId, error: err.message }); throw err; }
};
`);

// 9. controllers/paymentController.js
fs.writeFileSync(path.join(baseDir, 'controllers', 'paymentController.js'), `const Payment = require('../models/payment');
const Notification = require('../models/notification');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');
const orderClient = require('../utils/serviceClients/orderClient');
const cartClient = require('../utils/serviceClients/cartClient');

exports.processPayment = async (req, res, next) => {
    try {
        const { orderId, simulateResult, paymentMethod, userId } = req.body;
        const requestId = req.headers['x-request-id'];

        const orderRes = await orderClient.getOrderById(orderId, requestId);
        const order = orderRes.data;
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const transactionId = 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        logger.info(\`Payment initiated\`, { orderId, amount: order.totalAmount, simulateResult, requestId });
        metrics.paymentsStartedTotal.inc();

        if (simulateResult === 'FAILURE') {
            const payment = new Payment({ orderId: order._id, userId, amount: order.totalAmount, status: 'failed', transactionId, paymentMethod: paymentMethod || 'Mock Card' });
            await payment.save();
            metrics.paymentsFailedTotal.inc();

            await orderClient.updateOrder(order._id, { paymentStatus: 'failed' }, requestId);

            logger.error(\`Payment failed\`, { orderId, requestId });
            return res.status(400).json({ success: false, error: 'Payment transaction failed', data: payment });
        }

        const payment = new Payment({ orderId: order._id, userId, amount: order.totalAmount, status: 'success', transactionId, paymentMethod: paymentMethod || 'Mock Card' });
        await payment.save();
        metrics.paymentsSuccessTotal.inc();

        await orderClient.updateOrder(order._id, { paymentStatus: 'success', orderStatus: 'confirmed' }, requestId);
        await cartClient.clearCart(userId, requestId);

        const notification = new Notification({
            userId, orderId: order._id,
            message: \`Payment received for order #\${order._id.toString().slice(-6)}.\`,
            type: 'payment', status: 'unread'
        });
        await notification.save();

        logger.info(\`Payment successful\`, { orderId, transactionId, requestId });
        res.status(200).json({ success: true, data: payment });
    } catch (err) { next(err); }
};

exports.getPaymentById = async (req, res, next) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
        res.json({ success: true, data: payment });
    } catch (err) { next(err); }
};
`);

// 10. routes/paymentRoutes.js
fs.writeFileSync(path.join(baseDir, 'routes', 'paymentRoutes.js'), `const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

router.post('/', paymentController.processPayment);
router.get('/:id', paymentController.getPaymentById);

module.exports = router;
`);

// 11. server.js
fs.writeFileSync(path.join(baseDir, 'server.js'), `require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');
const metrics = require('./utils/metrics');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => { req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4(); req.startTime = Date.now(); next(); });
app.use((req, res, next) => {
    res.on('finish', () => {
        const duration = (Date.now() - req.startTime) / 1000;
        const route = req.route ? req.route.path : 'unknown_route';
        metrics.httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });
        metrics.httpRequestDurationSeconds.observe({ method: req.method, route, status_code: res.statusCode }, duration);
        if (res.statusCode >= 400) metrics.httpErrorsTotal.inc({ method: req.method, route, status_code: res.statusCode });
    });
    next();
});

app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'intellishop-payment-service' }));
app.get('/metrics', async (req, res) => { res.set('Content-Type', metrics.promClient.register.contentType); res.send(await metrics.promClient.register.metrics()); });
app.use('/api/payments', paymentRoutes);

app.use((err, req, res, next) => {
    const status = err.status || 500;
    logger.error("Internal Server Error", { requestId: req.headers['x-request-id'], status, error: err.message, stack: err.stack });
    res.status(status).json({ success: false, message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3004;
mongoose.connect(process.env.MONGO_URI)
    .then(() => { console.log('Connected to MongoDB'); app.listen(PORT, () => console.log(\`Payment Service running on port \${PORT}\`)); })
    .catch(err => console.error('MongoDB connection error:', err));
`);

console.log("Payment service created!");
