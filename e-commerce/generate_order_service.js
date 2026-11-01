const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'services', 'order-service');

['routes', 'controllers', 'models', 'utils'].forEach(dir => {
    fs.mkdirSync(path.join(baseDir, dir), { recursive: true });
});

// 1. .env
fs.writeFileSync(path.join(baseDir, '.env'), `PORT=3003
MONGO_URI=mongodb+srv://root:root@cluster1.mwwv0wt.mongodb.net/intellitrace?appName=Cluster1
NODE_ENV=development
INTELLITRACE_URL=http://localhost:4000/api/v1
`);

// 2. models/order.js
fs.writeFileSync(path.join(baseDir, 'models', 'order.js'), `const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orderItemSchema = new Schema({
    productId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    image: { type: String },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true }
});

const orderSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true },
    shippingAddress: {
        fullName: { type: String, required: true },
        address: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        pincode: { type: String, required: true },
        phone: { type: String, required: true }
    },
    paymentStatus: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
    orderStatus: { type: String, enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'], default: 'pending' }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
`);

// 3. utils/metrics.js
fs.writeFileSync(path.join(baseDir, 'utils', 'metrics.js'), `const promClient = require('prom-client');
promClient.collectDefaultMetrics({ prefix: 'intellishop_order_' });

const httpRequestsTotal = new promClient.Counter({
    name: 'intellishop_order_http_requests_total',
    help: 'Total number of HTTP requests to order service',
    labelNames: ['method', 'route', 'status_code']
});

const httpErrorsTotal = new promClient.Counter({
    name: 'intellishop_order_http_errors_total',
    help: 'Total number of HTTP errors in order service',
    labelNames: ['method', 'route', 'status_code']
});

const httpRequestDurationSeconds = new promClient.Histogram({
    name: 'intellishop_order_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds in order service',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
});

const ordersCreatedTotal = new promClient.Counter({
    name: 'intellishop_orders_created_total',
    help: 'Total number of orders successfully placed'
});

module.exports = {
    promClient,
    httpRequestsTotal,
    httpErrorsTotal,
    httpRequestDurationSeconds,
    ordersCreatedTotal
};
`);

// 4. utils/telemetry.js
fs.writeFileSync(path.join(baseDir, 'utils', 'telemetry.js'), `const http = require('http');
const INTELLITRACE_URL = process.env.INTELLITRACE_URL || 'http://localhost:4000/api/v1';
const SERVICE_NAME = 'intellishop-order-service';

const getHeaders = (dataLength) => ({
    'Content-Type': 'application/json',
    'Content-Length': dataLength
});

setInterval(() => {
    const data = JSON.stringify({ application: SERVICE_NAME, environment: 'development', status: 'healthy', baseUrl: 'http://localhost:3003' });
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

// 5. utils/logger.js
fs.writeFileSync(path.join(baseDir, 'utils', 'logger.js'), `const winston = require('winston');
const telemetry = require('./telemetry');

const myFormat = winston.format.printf((info) => {
    const logObj = { timestamp: new Date().toISOString(), level: info.level.toUpperCase(), service: 'intellishop-order-service', environment: 'development', message: info.message, ...info };
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

// 6. controllers/orderController.js
fs.writeFileSync(path.join(baseDir, 'controllers', 'orderController.js'), `const Order = require('../models/order');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');

exports.createOrder = async (req, res, next) => {
    try {
        const order = new Order(req.body);
        await order.save();
        
        metrics.ordersCreatedTotal.inc();
        logger.info("Order created", { requestId: req.headers['x-request-id'], orderId: order._id, userId: order.userId });
        
        res.status(201).json({ success: true, data: order });
    } catch (err) { next(err); }
};

exports.getOrders = async (req, res, next) => {
    try {
        const query = req.query.userId ? { userId: req.query.userId } : {};
        const orders = await Order.find(query).sort({ createdAt: -1 }).populate('userId', 'email firstName lastName');
        res.json({ success: true, count: orders.length, data: orders });
    } catch (err) { next(err); }
};

exports.getOrderById = async (req, res, next) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.json({ success: true, data: order });
    } catch (err) { next(err); }
};

exports.updateOrderStatus = async (req, res, next) => {
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        
        logger.info("Order updated", { requestId: req.headers['x-request-id'], orderId: order._id });
        res.json({ success: true, data: order });
    } catch (err) { next(err); }
};

exports.deleteOrder = async (req, res, next) => {
    try {
        await Order.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Order deleted' });
    } catch (err) { next(err); }
};

exports.countOrders = async (req, res, next) => {
    try {
        const count = await Order.countDocuments();
        res.json({ success: true, data: count });
    } catch (err) { next(err); }
};

exports.getRecentOrders = async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        const orders = await Order.find().sort({ createdAt: -1 }).limit(limit).populate('userId', 'email firstName lastName');
        res.json({ success: true, data: orders });
    } catch (err) { next(err); }
};
`);

// 7. routes/orderRoutes.js
fs.writeFileSync(path.join(baseDir, 'routes', 'orderRoutes.js'), `const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

router.get('/count', orderController.countOrders);
router.get('/recent', orderController.getRecentOrders);
router.post('/', orderController.createOrder);
router.get('/', orderController.getOrders);
router.get('/:id', orderController.getOrderById);
router.put('/:id', orderController.updateOrderStatus);
router.delete('/:id', orderController.deleteOrder);

module.exports = router;
`);

// 8. server.js
fs.writeFileSync(path.join(baseDir, 'server.js'), `require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');
const metrics = require('./utils/metrics');
const orderRoutes = require('./routes/orderRoutes');

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

app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'intellishop-order-service' }));
app.get('/metrics', async (req, res) => { res.set('Content-Type', metrics.promClient.register.contentType); res.send(await metrics.promClient.register.metrics()); });
app.use('/api/orders', orderRoutes);

app.use((err, req, res, next) => {
    const status = err.status || 500;
    logger.error("Internal Server Error", { requestId: req.headers['x-request-id'], status, error: err.message, stack: err.stack });
    res.status(status).json({ success: false, message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3003;
mongoose.connect(process.env.MONGO_URI)
    .then(() => { console.log('Connected to MongoDB'); app.listen(PORT, () => console.log(\`Order Service running on port \${PORT}\`)); })
    .catch(err => console.error('MongoDB connection error:', err));
`);

console.log("Order service created!");
