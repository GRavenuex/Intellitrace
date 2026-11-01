const http = require('http');
const INTELLITRACE_URL = process.env.INTELLITRACE_URL || 'http://localhost:4000/api/v1';
const API_KEY = process.env.INTELLITRACE_API_KEY || 'default_telemetry_key';
const SERVICE_NAME = 'intellishop-order-service';

const getHeaders = (dataLength) => ({
    'Content-Type': 'application/json',
    'Content-Length': dataLength,
    'x-api-key': API_KEY
});

setInterval(() => {
    const data = JSON.stringify({ application: SERVICE_NAME, environment: process.env.NODE_ENV || 'development', status: 'healthy', baseUrl: process.env.SERVICE_BASE_URL || 'http://localhost:3003' });
    const req = http.request(`${INTELLITRACE_URL}/heartbeat`, { method: 'POST', headers: getHeaders(Buffer.byteLength(data)) });
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
        const req = http.request(`${INTELLITRACE_URL}/logs`, { method: 'POST', headers: getHeaders(Buffer.byteLength(data)) });
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
