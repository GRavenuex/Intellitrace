require('./tracer');
require('dotenv').config();
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

// Failure Injection Middleware
const createFailureInjector = require('./middleware/failureInjector');
app.use(createFailureInjector({ serviceName: 'payment-service', metrics, logger }));

app.use('/api/payments', paymentRoutes);

app.use((err, req, res, next) => {
    const status = err.status || 500;
    logger.error("Internal Server Error", { requestId: req.headers['x-request-id'], status, error: err.message, stack: err.stack });
    res.status(status).json({ success: false, message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3004;

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        console.log('Connected to MongoDB');
    } catch (err) {
        console.warn('Atlas connection failed. Falling back to local MongoDB at mongodb://127.0.0.1:27017/ecommerce...');
        try {
            await mongoose.connect('mongodb://127.0.0.1:27017/ecommerce', { serverSelectionTimeoutMS: 3000 });
            console.log('Payment Service connected to local MongoDB');
        } catch (localErr) {
            console.error('MongoDB connection error:', localErr);
        }
    }
    app.listen(PORT, () => console.log(`Payment Service running on port ${PORT}`));
};
connectDB();
