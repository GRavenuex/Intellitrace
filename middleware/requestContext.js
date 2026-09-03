const crypto = require('crypto');
const asyncLocalStorage = require('../utils/asyncContext');

const requestContext = (req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = requestId;
    req.requestStartTime = Date.now();
    res.setHeader('X-Request-ID', requestId);
    
    asyncLocalStorage.run(new Map([['requestId', requestId]]), () => {
        next();
    });
};

module.exports = requestContext;
