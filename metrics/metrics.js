const metricsState = {
    totalRequests: 0,
    status2xx: 0,
    status3xx: 0,
    status4xx: 0,
    status5xx: 0,
    totalErrors: 0,
    totalResponseTime: 0,
    minimumResponseTime: null,
    maximumResponseTime: 0,
    endpoints: {},
    database: {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        totalDuration: 0,
        minimumDuration: null,
        maximumDuration: 0
    }
};

const recordRequest = (statusCode, responseTime, route) => {
    try {
        metricsState.totalRequests += 1;
        metricsState.totalResponseTime += responseTime;

        if (metricsState.minimumResponseTime === null || responseTime < metricsState.minimumResponseTime) {
            metricsState.minimumResponseTime = responseTime;
        }
        if (responseTime > metricsState.maximumResponseTime) {
            metricsState.maximumResponseTime = responseTime;
        }

        if (statusCode >= 200 && statusCode < 300) {
            metricsState.status2xx += 1;
        } else if (statusCode >= 300 && statusCode < 400) {
            metricsState.status3xx += 1;
        } else if (statusCode >= 400 && statusCode < 500) {
            metricsState.status4xx += 1;
            metricsState.totalErrors += 1;
        } else if (statusCode >= 500) {
            metricsState.status5xx += 1;
            metricsState.totalErrors += 1;
        }

        const endpointKey = route || "unknown";
        if (!metricsState.endpoints[endpointKey]) {
            metricsState.endpoints[endpointKey] = {
                requests: 0,
                errors: 0,
                totalResponseTime: 0,
                averageResponseTime: 0,
                minimumResponseTime: null,
                maximumResponseTime: 0
            };
        }

        const ep = metricsState.endpoints[endpointKey];
        ep.requests += 1;
        ep.totalResponseTime += responseTime;
        ep.averageResponseTime = Math.round(ep.totalResponseTime / ep.requests);
        
        if (ep.minimumResponseTime === null || responseTime < ep.minimumResponseTime) {
            ep.minimumResponseTime = responseTime;
        }
        if (responseTime > ep.maximumResponseTime) {
            ep.maximumResponseTime = responseTime;
        }

        if (statusCode >= 400) {
            ep.errors += 1;
        }
    } catch (err) {
        // Fail silently to prevent crashing the application
        console.error("Error recording metrics:", err);
    }
};



const recordDatabaseOperation = (operationName, duration, isSuccess) => {
    try {
        const db = metricsState.database;
        db.totalOperations += 1;
        db.totalDuration += duration;
        
        if (isSuccess) {
            db.successfulOperations += 1;
        } else {
            db.failedOperations += 1;
        }

        if (db.minimumDuration === null || duration < db.minimumDuration) {
            db.minimumDuration = duration;
        }
        if (duration > db.maximumDuration) {
            db.maximumDuration = duration;
        }
    } catch (err) {
        console.error("Error recording database metrics:", err);
    }
};

const getMetrics = () => {
    return {
        service: "intellishop",
        uptime: Math.round(process.uptime()),
        requests: {
            total: metricsState.totalRequests,
            successful: metricsState.status2xx + metricsState.status3xx, // Conceptually
            clientErrors: metricsState.status4xx,
            serverErrors: metricsState.status5xx,
            status2xx: metricsState.status2xx,
            status3xx: metricsState.status3xx,
            status4xx: metricsState.status4xx,
            status5xx: metricsState.status5xx
        },
        responseTime: {
            average: metricsState.totalRequests === 0 ? 0 : Math.round(metricsState.totalResponseTime / metricsState.totalRequests),
            minimum: metricsState.minimumResponseTime !== null ? metricsState.minimumResponseTime : 0,
            maximum: metricsState.maximumResponseTime,
            total: metricsState.totalResponseTime
        },
        endpoints: Object.keys(metricsState.endpoints).reduce((acc, key) => {
            const ep = metricsState.endpoints[key];
            acc[key] = {
                requests: ep.requests,
                errors: ep.errors,
                averageResponseTime: ep.averageResponseTime,
                minimumResponseTime: ep.minimumResponseTime !== null ? ep.minimumResponseTime : 0,
                maximumResponseTime: ep.maximumResponseTime
            };
            return acc;
        }, {}),
        database: {
            totalOperations: metricsState.database.totalOperations,
            successfulOperations: metricsState.database.successfulOperations,
            failedOperations: metricsState.database.failedOperations,
            averageDuration: metricsState.database.totalOperations === 0 ? 0 : Math.round(metricsState.database.totalDuration / metricsState.database.totalOperations),
            minimumDuration: metricsState.database.minimumDuration !== null ? metricsState.database.minimumDuration : 0,
            maximumDuration: metricsState.database.maximumDuration
        }
    };
};

const resetMetrics = () => {
    metricsState.totalRequests = 0;
    metricsState.status2xx = 0;
    metricsState.status3xx = 0;
    metricsState.status4xx = 0;
    metricsState.status5xx = 0;
    metricsState.totalErrors = 0;
    metricsState.totalResponseTime = 0;
    metricsState.minimumResponseTime = null;
    metricsState.maximumResponseTime = 0;
    metricsState.endpoints = {};
    metricsState.database = {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        totalDuration: 0,
        minimumDuration: null,
        maximumDuration: 0
    };
};

module.exports = {
    recordRequest,
    recordDatabaseOperation,
    getMetrics,
    resetMetrics
};
