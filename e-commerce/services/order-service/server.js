require('./tracer');
require('dotenv').config();
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

// Failure Injection Middleware
const createFailureInjector = require('./middleware/failureInjector');
app.use(createFailureInjector({ serviceName: 'order-service', metrics, logger }));

app.use('/api/orders', orderRoutes);

app.use((err, req, res, next) => {
    const status = err.statusCode || err.status || 500;
    const service = process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'order-service';
    const route = (req.route && req.route.path) ? req.baseUrl + req.route.path : (req.originalUrl || req.path || '/api/orders');
    const method = req.method || 'POST';
    const errorName = err.name || 'Error';
    const errorMessage = err.message || 'Order service error occurred';
    const errorStack = err.stack || null;

    logger.error(errorMessage, {
        service,
        originatingService: err.originatingService || service,
        reportingService: err.reportingService || null,
        method,
        route,
        statusCode: status,
        requestId: req.headers['x-request-id'],
        error: {
            name: errorName,
            message: errorMessage,
            stack: errorStack
        },
        stack: errorStack,
        database: errorName.includes('Mongo') || errorMessage.includes('Mongo') ? 'MongoDB' : 'Not involved',
        category: err.category || (errorName.includes('Mongo') ? 'database_query_error' : (status === 400 ? 'validation_error' : 'internal_error'))
    });

    res.status(status).json({
        success: false,
        error: errorMessage,
        errorType: errorName,
        service
    });
});

const PORT = process.env.PORT || 3003;

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        console.log('Connected to MongoDB');
    } catch (err) {
        console.warn('Atlas connection failed. Falling back to local MongoDB at mongodb://127.0.0.1:27017/ecommerce...');
        try {
            await mongoose.connect('mongodb://127.0.0.1:27017/ecommerce', { serverSelectionTimeoutMS: 3000 });
            console.log('Order Service connected to local MongoDB');
        } catch (localErr) {
            console.error('MongoDB connection error:', localErr);
        }
    }
    app.listen(PORT, () => console.log(`Order Service running on port ${PORT}`));
};
connectDB();
