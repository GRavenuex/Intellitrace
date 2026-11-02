/**
 * Configurable Incident Detection Rules for IntelliTrace
 * Corresponding to Phase 11 failure scenarios and natural system errors
 */

const DEFAULT_RULES = [
    {
        ruleId: 'RULE-HTTP-500',
        name: 'HTTP 500 – Service Internal Error',
        description: 'Detects repeated HTTP 500 internal server errors across microservices.',
        category: 'availability',
        enabled: true,
        defaultSeverity: 'critical',
        targetServices: [
            'payment-service',
            'product-service',
            'order-service',
            'cart-service',
            'intellishop-gateway'
        ],
        thresholds: {
            minErrors: 2,           // Minimum 5xx errors in window to alert
            errorRatePercent: 20,   // Or error rate exceeding 20%
            criticalErrorCount: 3   // Error count >= 3 escalates to critical
        },
        sampleWindowSeconds: 30,
        evaluationIntervalSeconds: 15,
        requiredConsecutivePeriods: 1,
        recoveryCondition: {
            zeroErrorsRequired: true,
            requiredConsecutiveHealthyChecks: 2 // 2 consecutive checks with 0 errors
        }
    },
    {
        ruleId: 'RULE-HIGH-LATENCY',
        name: 'High Latency – Slow Service Response',
        description: 'Detects abnormal response latency on service endpoints.',
        category: 'latency',
        enabled: true,
        defaultSeverity: 'high',
        targetServices: [
            'payment-service',
            'product-service',
            'cart-service',
            'order-service',
            'intellishop-gateway'
        ],
        thresholds: {
            warningLatencyMs: 2000,   // Warning threshold: > 2000ms
            criticalLatencyMs: 4500,  // Critical threshold: > 4500ms
            minSlowRequests: 1        // Minimum 1 request exceeding threshold
        },
        sampleWindowSeconds: 30,
        evaluationIntervalSeconds: 15,
        requiredConsecutivePeriods: 1,
        recoveryCondition: {
            maxLatencyMs: 2000,
            requiredConsecutiveHealthyChecks: 2
        }
    },
    {
        ruleId: 'RULE-DB-TIMEOUT',
        name: 'Database Query Timeout',
        description: 'Detects database query execution timeouts and MongoDB operation failures.',
        category: 'database',
        enabled: true,
        defaultSeverity: 'critical',
        targetServices: [
            'product-service',
            'cart-service',
            'order-service',
            'payment-service',
            'intellishop-gateway'
        ],
        thresholds: {
            minTimeoutErrors: 1 // Single DB query timeout detected in application
        },
        sampleWindowSeconds: 30,
        evaluationIntervalSeconds: 15,
        requiredConsecutivePeriods: 1,
        recoveryCondition: {
            zeroDbErrorsRequired: true,
            requiredConsecutiveHealthyChecks: 2
        }
    },
    {
        ruleId: 'RULE-SVC-COMM',
        name: 'Service-to-Service Communication Failure',
        description: 'Detects downstream dependency communication failures and connection drops.',
        category: 'communication',
        enabled: true,
        defaultSeverity: 'critical',
        targetServices: [
            'order-service',
            'cart-service',
            'intellishop-gateway'
        ],
        targetDependencies: [
            'payment-service',
            'product-service',
            'order-service',
            'cart-service'
        ],
        thresholds: {
            minFailedCalls: 1
        },
        sampleWindowSeconds: 30,
        evaluationIntervalSeconds: 15,
        requiredConsecutivePeriods: 1,
        recoveryCondition: {
            zeroCommFailuresRequired: true,
            requiredConsecutiveHealthyChecks: 2
        }
    },
    {
        ruleId: 'RULE-TRAFFIC-SPIKE',
        name: 'Traffic Spike – Service Overload',
        description: 'Detects abnormal traffic surges accompanied by latency degradation or error spikes.',
        category: 'capacity',
        enabled: true,
        defaultSeverity: 'high',
        targetServices: [
            'product-service',
            'order-service',
            'cart-service'
        ],
        thresholds: {
            minRequestCount: 20,       // 20 requests within window
            minRps: 4,                 // Or >= 4 req/sec
            degradedLatencyMs: 150,    // Accompanied by latency > 150ms OR errors > 0
            minErrorsForOverload: 1
        },
        sampleWindowSeconds: 30,
        evaluationIntervalSeconds: 15,
        requiredConsecutivePeriods: 1,
        recoveryCondition: {
            maxRequestCount: 10,
            requiredConsecutiveHealthyChecks: 2
        }
    },
    {
        ruleId: 'RULE-CASCADING-FAILURE',
        name: 'Cascading Failure Across Services',
        description: 'Detects correlated multi-service failures propagating from an upstream dependency.',
        category: 'cascade',
        enabled: true,
        defaultSeverity: 'critical',
        targetServices: [
            'payment-service',
            'order-service',
            'intellishop-gateway'
        ],
        thresholds: {
            minPropagatedServices: 2 // Correlated errors across 2 or more distinct services
        },
        sampleWindowSeconds: 30,
        evaluationIntervalSeconds: 15,
        requiredConsecutivePeriods: 1,
        recoveryCondition: {
            allServicesHealthyRequired: true,
            requiredConsecutiveHealthyChecks: 2
        }
    }
];

// In-memory rules state allowing runtime updates without rewriting code
let activeRules = JSON.parse(JSON.stringify(DEFAULT_RULES));

module.exports = {
    getRules: () => activeRules,
    getRuleById: (ruleId) => activeRules.find(r => r.ruleId === ruleId),
    updateRule: (ruleId, updates) => {
        const idx = activeRules.findIndex(r => r.ruleId === ruleId);
        if (idx === -1) return null;
        activeRules[idx] = {
            ...activeRules[idx],
            ...updates,
            thresholds: {
                ...activeRules[idx].thresholds,
                ...(updates.thresholds || {})
            }
        };
        return activeRules[idx];
    },
    resetRules: () => {
        activeRules = JSON.parse(JSON.stringify(DEFAULT_RULES));
        return activeRules;
    }
};

