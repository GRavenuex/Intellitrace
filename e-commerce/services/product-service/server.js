require('./tracer');
require('dotenv').config();
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

// Failure Injection Middleware
const createFailureInjector = require('./middleware/failureInjector');
app.use(createFailureInjector({ serviceName: 'product-service', metrics, logger }));

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

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        console.log('Connected to MongoDB');
    } catch (err) {
        console.warn('Atlas connection failed. Falling back to local MongoDB at mongodb://127.0.0.1:27017/ecommerce...');
        try {
            await mongoose.connect('mongodb://127.0.0.1:27017/ecommerce', { serverSelectionTimeoutMS: 3000 });
            console.log('Product Service connected to local MongoDB');
        } catch (localErr) {
            console.error('MongoDB connection error:', localErr);
        }
    }
    app.listen(PORT, () => console.log(`Product Service running on port ${PORT}`));
};
connectDB();
