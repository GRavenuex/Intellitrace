const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'services', 'cart-service');

// Ensure directories exist
['routes', 'controllers', 'models', 'utils', 'utils/serviceClients'].forEach(dir => {
    fs.mkdirSync(path.join(baseDir, dir), { recursive: true });
});

// 1. .env
fs.writeFileSync(path.join(baseDir, '.env'), `PORT=3002
MONGO_URI=mongodb+srv://root:root@cluster1.mwwv0wt.mongodb.net/intellitrace?appName=Cluster1
NODE_ENV=development
INTELLITRACE_URL=http://localhost:4000/api/v1
PRODUCT_SERVICE_URL=http://localhost:3001
`);

// 2. models/cart.js
fs.writeFileSync(path.join(baseDir, 'models', 'cart.js'), `const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const cartItemSchema = new Schema({
    productId: {
        type: Schema.Types.ObjectId,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    price: {
        type: Number,
        required: true
    },
    // We can denormalize product details here to avoid constantly populating from product service
    productName: { type: String },
    productImage: { type: String }
});

const cartSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        required: true,
        unique: true
    },
    items: [cartItemSchema],
    totalAmount: {
        type: Number,
        required: true,
        default: 0
    }
}, { timestamps: true });

cartSchema.methods.calculateTotal = function() {
    this.totalAmount = this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
};

module.exports = mongoose.model('Cart', cartSchema);
`);

// 3. utils/metrics.js
fs.writeFileSync(path.join(baseDir, 'utils', 'metrics.js'), `const promClient = require('prom-client');
promClient.collectDefaultMetrics({ prefix: 'intellishop_cart_' });

const httpRequestsTotal = new promClient.Counter({
    name: 'intellishop_cart_http_requests_total',
    help: 'Total number of HTTP requests to cart service',
    labelNames: ['method', 'route', 'status_code']
});

const httpErrorsTotal = new promClient.Counter({
    name: 'intellishop_cart_http_errors_total',
    help: 'Total number of HTTP errors in cart service',
    labelNames: ['method', 'route', 'status_code']
});

const httpRequestDurationSeconds = new promClient.Histogram({
    name: 'intellishop_cart_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds in cart service',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
});

const cartOperationsTotal = new promClient.Counter({
    name: 'intellishop_cart_operations_total',
    help: 'Total cart operations (add, remove, update)',
    labelNames: ['operation']
});

module.exports = {
    promClient,
    httpRequestsTotal,
    httpErrorsTotal,
    httpRequestDurationSeconds,
    cartOperationsTotal
};
`);

// 4. utils/telemetry.js
fs.writeFileSync(path.join(baseDir, 'utils', 'telemetry.js'), `const http = require('http');

const INTELLITRACE_URL = process.env.INTELLITRACE_URL || 'http://localhost:4000/api/v1';
const API_KEY = process.env.INTELLITRACE_API_KEY || 'default_telemetry_key';
const SERVICE_NAME = 'intellishop-cart-service';

const getHeaders = (dataLength) => ({
    'Content-Type': 'application/json',
    'Content-Length': dataLength,
    'x-api-key': API_KEY
});

// Heartbeat
setInterval(() => {
    const data = JSON.stringify({
        application: SERVICE_NAME,
        environment: process.env.NODE_ENV || 'development',
        status: 'healthy',
        baseUrl: 'http://localhost:3002'
    });

    const req = http.request(\`\${INTELLITRACE_URL}/heartbeat\`, {
        method: 'POST',
        headers: getHeaders(Buffer.byteLength(data))
    });

    req.on('error', (e) => { });
    req.write(data);
    req.end();
}, 10000);

// Batching Logs
let logBuffer = [];
const BATCH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 100;

setInterval(() => {
    if (logBuffer.length === 0) return;

    const logsToSend = [...logBuffer];
    logBuffer = [];

    const data = JSON.stringify({
        application: SERVICE_NAME,
        environment: process.env.NODE_ENV || 'development',
        logs: logsToSend
    });

    try {
        const req = http.request(\`\${INTELLITRACE_URL}/logs\`, {
            method: 'POST',
            headers: getHeaders(Buffer.byteLength(data))
        });
        req.on('error', () => { });
        req.write(data);
        req.end();
    } catch (err) {}
}, BATCH_INTERVAL_MS);

exports.sendLog = (logString) => {
    try {
        const parsed = JSON.parse(logString);
        logBuffer.push(parsed);
        if (logBuffer.length > MAX_BUFFER_SIZE) {
            logBuffer.shift(); 
        }
    } catch (err) {
        logBuffer.push({ message: logString });
    }
};
`);

// 5. utils/logger.js
fs.writeFileSync(path.join(baseDir, 'utils', 'logger.js'), `const winston = require('winston');
const telemetry = require('./telemetry');

const myFormat = winston.format.printf((info) => {
    const logObj = {
        timestamp: new Date().toISOString(),
        level: info.level.toUpperCase(),
        service: 'intellishop-cart-service',
        environment: process.env.NODE_ENV || 'development',
        message: info.message,
        ...info
    };
    delete logObj.level;
    logObj.level = info.level.toUpperCase();

    telemetry.sendLog(JSON.stringify(logObj));
    return JSON.stringify(logObj);
});

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        myFormat
    ),
    transports: [
        new winston.transports.Console()
    ]
});

module.exports = logger;
`);

// 6. utils/serviceClients/productClient.js
fs.writeFileSync(path.join(baseDir, 'utils', 'serviceClients', 'productClient.js'), `const fetch = require('node-fetch');
const logger = require('../logger');

const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3001';

const getHeaders = (requestId) => ({
    'Content-Type': 'application/json',
    'x-request-id': requestId || 'unknown'
});

exports.getProductById = async (id, requestId) => {
    try {
        const res = await fetch(\`\${PRODUCT_SERVICE_URL}/api/products/\${id}\`, {
            headers: getHeaders(requestId)
        });
        if (!res.ok) throw new Error(\`Product service responded with \${res.status}\`);
        return await res.json();
    } catch (err) {
        logger.error("Failed to call product service getProductById", { requestId, productId: id, error: err.message });
        throw err;
    }
};
`);

// 7. controllers/cartController.js
fs.writeFileSync(path.join(baseDir, 'controllers', 'cartController.js'), `const Cart = require('../models/cart');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');
const productClient = require('../utils/serviceClients/productClient');

exports.getCart = async (req, res, next) => {
    try {
        const userId = req.params.userId;
        let cart = await Cart.findOne({ userId });

        if (!cart) {
            cart = new Cart({ userId, items: [], totalAmount: 0 });
            await cart.save();
        }

        logger.info("Cart fetched", { requestId: req.headers['x-request-id'], userId });
        res.json({ success: true, data: cart });
    } catch (err) {
        next(err);
    }
};

exports.addToCart = async (req, res, next) => {
    try {
        const userId = req.params.userId;
        const { productId, quantity } = req.body;
        const qty = parseInt(quantity) || 1;

        // Fetch product details from Product Service
        const productRes = await productClient.getProductById(productId, req.headers['x-request-id']);
        const product = productRes.data;

        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [], totalAmount: 0 });
        }

        const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
        if (itemIndex > -1) {
            cart.items[itemIndex].quantity += qty;
        } else {
            cart.items.push({ 
                productId: product._id, 
                quantity: qty, 
                price: product.price,
                productName: product.name,
                productImage: product.image 
            });
        }

        cart.calculateTotal();
        await cart.save();
        
        metrics.cartOperationsTotal.inc({ operation: 'add' });
        logger.info("Added to cart", { requestId: req.headers['x-request-id'], userId, productId });
        
        res.json({ success: true, data: cart });
    } catch (err) {
        next(err);
    }
};

exports.updateCartItem = async (req, res, next) => {
    try {
        const userId = req.params.userId;
        const productId = req.params.productId;
        const quantity = parseInt(req.body.quantity);

        let cart = await Cart.findOne({ userId });
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId);
        if (itemIndex > -1) {
            if (quantity <= 0) {
                cart.items.splice(itemIndex, 1);
            } else {
                cart.items[itemIndex].quantity = quantity;
            }
            cart.calculateTotal();
            await cart.save();
            metrics.cartOperationsTotal.inc({ operation: 'update' });
        }

        logger.info("Updated cart item", { requestId: req.headers['x-request-id'], userId, productId });
        res.json({ success: true, data: cart });
    } catch (err) {
        next(err);
    }
};

exports.removeCartItem = async (req, res, next) => {
    try {
        const userId = req.params.userId;
        const productId = req.params.productId;

        let cart = await Cart.findOne({ userId });
        if (cart) {
            cart.items = cart.items.filter(item => item.productId.toString() !== productId);
            cart.calculateTotal();
            await cart.save();
            metrics.cartOperationsTotal.inc({ operation: 'remove' });
        }

        logger.info("Removed cart item", { requestId: req.headers['x-request-id'], userId, productId });
        res.json({ success: true, data: cart });
    } catch (err) {
        next(err);
    }
};

exports.clearCart = async (req, res, next) => {
    try {
        const userId = req.params.userId;
        let cart = await Cart.findOne({ userId });
        if (cart) {
            cart.items = [];
            cart.totalAmount = 0;
            await cart.save();
        }
        
        logger.info("Cleared cart", { requestId: req.headers['x-request-id'], userId });
        res.json({ success: true, data: cart });
    } catch (err) {
        next(err);
    }
};
`);

// 8. routes/cartRoutes.js
fs.writeFileSync(path.join(baseDir, 'routes', 'cartRoutes.js'), `const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');

router.get('/:userId', cartController.getCart);
router.post('/:userId/items', cartController.addToCart);
router.put('/:userId/items/:productId', cartController.updateCartItem);
router.delete('/:userId/items/:productId', cartController.removeCartItem);
router.delete('/:userId/clear', cartController.clearCart);

module.exports = router;
`);

// 9. server.js
fs.writeFileSync(path.join(baseDir, 'server.js'), `require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');
const metrics = require('./utils/metrics');
const cartRoutes = require('./routes/cartRoutes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request tracking
app.use((req, res, next) => {
    req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
    req.startTime = Date.now();
    next();
});

// Metrics
app.use((req, res, next) => {
    res.on('finish', () => {
        const duration = (Date.now() - req.startTime) / 1000;
        const route = req.route ? req.route.path : 'unknown_route';
        
        metrics.httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });
        metrics.httpRequestDurationSeconds.observe({ method: req.method, route, status_code: res.statusCode }, duration);
        
        if (res.statusCode >= 400) {
            metrics.httpErrorsTotal.inc({ method: req.method, route, status_code: res.statusCode });
        }
    });
    next();
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'intellishop-cart-service' });
});

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.promClient.register.contentType);
    res.send(await metrics.promClient.register.metrics());
});

app.use('/api/cart', cartRoutes);

app.use((err, req, res, next) => {
    const status = err.status || 500;
    logger.error("Internal Server Error", {
        requestId: req.headers['x-request-id'],
        method: req.method,
        route: req.url,
        status,
        error: err.message,
        stack: err.stack
    });
    res.status(status).json({ success: false, message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3002;

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, () => console.log(\`Cart Service running on port \${PORT}\`));
    })
    .catch(err => console.error('MongoDB connection error:', err));
`);

console.log("Cart service created!");
