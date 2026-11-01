const winston = require('winston');
const telemetry = require('./telemetry');

const myFormat = winston.format.printf((info) => {
    const logObj = { timestamp: new Date().toISOString(), level: info.level.toUpperCase(), service: 'intellishop-order-service', environment: 'development', message: info.message, ...info };
    delete logObj.level; logObj.level = info.level.toUpperCase();
    try {
        const { trace } = require('@opentelemetry/api');
        const activeSpan = trace.getActiveSpan();
        if (activeSpan) {
            const spanCtx = activeSpan.spanContext();
            if (spanCtx && spanCtx.traceId) {
                logObj.traceId = spanCtx.traceId;
                logObj.spanId = spanCtx.spanId;
            }
        }
    } catch (_) {}
    telemetry.sendLog(JSON.stringify(logObj));
    return JSON.stringify(logObj);
});

module.exports = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), myFormat),
    transports: [new winston.transports.Console()]
});
