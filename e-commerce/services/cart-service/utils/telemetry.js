const http = require('http');

const INTELLITRACE_URL = process.env.INTELLITRACE_URL || 'http://localhost:4000/api/v1';
const API_KEY = process.env.INTELLITRACE_API_KEY || 'default_telemetry_key';
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || process.env.SERVICE_NAME || 'cart-service';

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
        baseUrl: process.env.SERVICE_BASE_URL || 'http://localhost:3002'
    });

    const req = http.request(`${INTELLITRACE_URL}/heartbeat`, {
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
        const req = http.request(`${INTELLITRACE_URL}/logs`, {
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
