const express = require('express');
const cors = require('cors');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');

const authRouter = require('./routes/authRouter');
const applicationRouter = require('./routes/applicationRouter');
const telemetryRouter = require('./routes/telemetryRouter');

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
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        service: 'intellitrace',
        timestamp: new Date().toISOString()
    });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/applications', applicationRouter);
app.use('/api/v1', telemetryRouter);

// Centralized error handling
app.use(errorHandler);

module.exports = app;
