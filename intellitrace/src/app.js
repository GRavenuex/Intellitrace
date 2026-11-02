const express = require('express');
const cors = require('cors');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');

const authRouter = require('./routes/authRouter');
const applicationRouter = require('./routes/applicationRouter');
const telemetryRouter = require('./routes/telemetryRouter');
const traceRouter = require('./routes/traceRouter');

const app = express();

// CORS for local development frontend
app.use(cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// IntelliTrace request logging
app.use(requestLogger);

// Health check
const healthHandler = (req, res) => {
    res.status(200).json({
        status: 'healthy',
        service: 'intellitrace',
        timestamp: new Date().toISOString()
    });
};
app.get('/api/health', healthHandler);
app.get('/health', healthHandler);

// Routes
const failureInjectionRouter = require('./routes/failureInjectionRouter');
const incidentRouter = require('./routes/incidentRouter');
app.use('/api/auth', authRouter);
app.use('/api/applications', applicationRouter);
app.use('/api/traces', traceRouter);
app.use('/api/incidents', incidentRouter);
app.use('/api/v1/failure-injections', failureInjectionRouter);
app.use('/api/failure-injections', failureInjectionRouter);
app.use('/api/v1', telemetryRouter);

// Centralized error handling
app.use(errorHandler);

module.exports = app;
