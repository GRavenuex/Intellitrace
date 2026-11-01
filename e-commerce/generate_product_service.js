const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, 'services', 'product-service');

// Ensure directories exist
['routes', 'controllers', 'models', 'utils'].forEach(dir => {
    fs.mkdirSync(path.join(baseDir, dir), { recursive: true });
});

// 1. .env
fs.writeFileSync(path.join(baseDir, '.env'), `PORT=3001
MONGO_URI=mongodb+srv://root:root@cluster1.mwwv0wt.mongodb.net/intellitrace?appName=Cluster1
NODE_ENV=development
INTELLITRACE_URL=http://localhost:4000/api/v1
`);

// 2. models/product.js (Copied from monolith)
fs.writeFileSync(path.join(baseDir, 'models', 'product.js'), `const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const productSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    stock: {
        type: Number,
        required: true,
        default: 0
    },
    rating: {
        type: Number,
        default: 0
    },
    numReviews: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
`);

// 3. utils/metrics.js
fs.writeFileSync(path.join(baseDir, 'utils', 'metrics.js'), `const promClient = require('prom-client');
promClient.collectDefaultMetrics({ prefix: 'intellishop_product_' });

const httpRequestsTotal = new promClient.Counter({
    name: 'intellishop_product_http_requests_total',
    help: 'Total number of HTTP requests to product service',
    labelNames: ['method', 'route', 'status_code']
});

const httpErrorsTotal = new promClient.Counter({
    name: 'intellishop_product_http_errors_total',
    help: 'Total number of HTTP errors in product service',
    labelNames: ['method', 'route', 'status_code']
});

const httpRequestDurationSeconds = new promClient.Histogram({
    name: 'intellishop_product_http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds in product service',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
});

const productRequestsTotal = new promClient.Counter({
    name: 'intellishop_product_requests_total',
    help: 'Total product API operations',
    labelNames: ['operation']
});

module.exports = {
    promClient,
    httpRequestsTotal,
    httpErrorsTotal,
    httpRequestDurationSeconds,
    productRequestsTotal
};
`);

// 4. utils/telemetry.js
fs.writeFileSync(path.join(baseDir, 'utils', 'telemetry.js'), `const http = require('http');

const INTELLITRACE_URL = process.env.INTELLITRACE_URL || 'http://localhost:4000/api/v1';
const API_KEY = process.env.INTELLITRACE_API_KEY || 'default_telemetry_key';
const SERVICE_NAME = 'intellishop-product-service';

const getHeaders = (dataLength) => ({
    'Content-Type': 'application/json',
    'Content-Length': dataLength,
    'x-api-key': API_KEY
});

// 1. Heartbeat
setInterval(() => {
    const data = JSON.stringify({
        application: SERVICE_NAME,
        environment: process.env.NODE_ENV || 'development',
        status: 'healthy',
        baseUrl: 'http://localhost:3001'
    });

    const req = http.request(\`\${INTELLITRACE_URL}/heartbeat\`, {
        method: 'POST',
        headers: getHeaders(Buffer.byteLength(data))
    });

    req.on('error', (e) => { });
    req.write(data);
    req.end();
}, 10000);

// 2. Batching Logs
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
        service: 'intellishop-product-service',
        environment: process.env.NODE_ENV || 'development',
        message: info.message,
        ...info
    };
    delete logObj.level; // cleanup
    logObj.level = info.level.toUpperCase();

    // Send to IntelliTrace
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

// 6. controllers/productController.js
fs.writeFileSync(path.join(baseDir, 'controllers', 'productController.js'), `const Product = require('../models/product');
const logger = require('../utils/logger');
const metrics = require('../utils/metrics');

exports.getProducts = async (req, res, next) => {
    try {
        const { search, category, minPrice, maxPrice, sort } = req.query;
        let query = {};

        if (search) query.name = { $regex: search, $options: 'i' };
        if (category) query.category = category;
        if (minPrice > 0 || maxPrice < Infinity) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        let sortOption = { createdAt: -1 };
        if (sort === 'price-asc') sortOption = { price: 1 };
        if (sort === 'price-desc') sortOption = { price: -1 };
        if (sort === 'rating') sortOption = { rating: -1 };

        const products = await Product.find(query).sort(sortOption);
        
        logger.info("Products fetched", { requestId: req.headers['x-request-id'], count: products.length });
        metrics.productRequestsTotal.inc({ operation: 'list' });
        
        res.json({ success: true, data: products });
    } catch (err) {
        next(err);
    }
};

exports.getProductById = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        
        logger.info("Product fetched", { requestId: req.headers['x-request-id'], productId: req.params.id });
        metrics.productRequestsTotal.inc({ operation: 'get' });
        
        res.json({ success: true, data: product });
    } catch (err) {
        next(err);
    }
};

exports.getRelatedProducts = async (req, res, next) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        
        const related = await Product.find({
            category: product.category,
            _id: { $ne: product._id }
        }).limit(4);
        
        res.json({ success: true, data: related });
    } catch (err) {
        next(err);
    }
};

exports.createProduct = async (req, res, next) => {
    try {
        const product = new Product(req.body);
        await product.save();
        
        logger.info("Product created", { requestId: req.headers['x-request-id'], productId: product._id });
        metrics.productRequestsTotal.inc({ operation: 'create' });
        
        res.status(201).json({ success: true, data: product });
    } catch (err) {
        next(err);
    }
};

exports.updateProduct = async (req, res, next) => {
    try {
        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        
        logger.info("Product updated", { requestId: req.headers['x-request-id'], productId: product._id });
        metrics.productRequestsTotal.inc({ operation: 'update' });
        
        res.json({ success: true, data: product });
    } catch (err) {
        next(err);
    }
};

exports.deleteProduct = async (req, res, next) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        
        logger.info("Product deleted", { requestId: req.headers['x-request-id'], productId: req.params.id });
        metrics.productRequestsTotal.inc({ operation: 'delete' });
        
        res.json({ success: true, message: 'Product deleted' });
    } catch (err) {
        next(err);
    }
};

exports.getFeaturedProducts = async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit) || 8;
        const products = await Product.find().sort({ rating: -1 }).limit(limit);
        res.json({ success: true, data: products });
    } catch (err) {
        next(err);
    }
};
`);

// 7. routes/productRoutes.js
fs.writeFileSync(path.join(baseDir, 'routes', 'productRoutes.js'), `const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

router.get('/', productController.getProducts);
router.get('/featured', productController.getFeaturedProducts);
router.get('/:id', productController.getProductById);
router.get('/:id/related', productController.getRelatedProducts);
router.post('/', productController.createProduct);
router.put('/:id', productController.updateProduct);
router.delete('/:id', productController.deleteProduct);

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
const productRoutes = require('./routes/productRoutes');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request tracking middleware
app.use((req, res, next) => {
    req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
    req.startTime = Date.now();
    next();
});

// Metrics middleware
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

// Health endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: 'intellishop-product-service' });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.promClient.register.contentType);
    res.send(await metrics.promClient.register.metrics());
});

// API Routes
app.use('/api/products', productRoutes);

// Error handling
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

const PORT = process.env.PORT || 3001;

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, () => console.log(\`Product Service running on port \${PORT}\`));
    })
    .catch(err => console.error('MongoDB connection error:', err));
`);

console.log("Product service created!");
