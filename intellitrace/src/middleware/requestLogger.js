const { v4: uuidv4 } = require('uuid');

const requestLogger = (req, res, next) => {
    req.requestId = uuidv4();
    const start = Date.now();
    
    res.on('finish', () => {
        const responseTime = Date.now() - start;
        console.log(`[IntelliTrace] ${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${responseTime}ms - ${req.requestId}`);
    });
    
    next();
};

module.exports = requestLogger;
