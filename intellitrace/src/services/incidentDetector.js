/**
 * Automatic Incident Detection Engine for IntelliTrace
 * Continuously evaluates structured logs, Prometheus metrics, OpenTelemetry traces,
 * service health information, and failure injection events to automatically create,
 * deduplicate, update, and auto-resolve incidents.
 */

const Incident = require('../models/Incident');
const Log = require('../models/Log');
const MetricSnapshot = require('../models/MetricSnapshot');
const Application = require('../models/Application');
const FailureInjection = require('../models/FailureInjection');
const { getRules, getRuleById } = require('../config/incidentRules');

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus:9090';
const JAEGER_URL = process.env.JAEGER_URL || 'http://jaeger:16686';

// Standard service name normalization
function normalizeServiceName(raw) {
    if (!raw) return 'unknown-service';
    const s = String(raw).trim().toLowerCase();
    if (s === 'intellishop' || s === 'intellishop-gateway' || s === 'gateway') return 'intellishop-gateway';
    if (s.includes('product')) return 'product-service';
    if (s.includes('cart')) return 'cart-service';
    if (s.includes('order')) return 'order-service';
    if (s.includes('payment')) return 'payment-service';
    return s;
}

function getServiceDisplayName(slug) {
    const map = {
        'intellishop-gateway': 'IntelliShop Gateway',
        'product-service': 'Product Service',
        'cart-service': 'Cart Service',
        'order-service': 'Order Service',
        'payment-service': 'Payment Service'
    };
    return map[slug] || slug;
}

// Resilient fetch helper with timeout
async function safeFetchJson(url, timeoutMs = 2000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        return await res.json();
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

// Generate unique incident ID
function generateIncidentId() {
    const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `INC-${datePart}-${randPart}`;
}

// Main incident creation & deduplication handler
async function reportDetectedCondition({
    ruleId,
    category,
    severity,
    title,
    description,
    primaryService,
    affectedServices = [],
    fingerprint,
    evidence = {},
    relatedRequestIds = [],
    relatedTraceIds = [],
    relatedLogReferences = [],
    relatedMetricInformation = {},
    failureInjectionId = null,
    failureInjectionDetails = null
}) {
    const now = new Date();
    const rule = getRuleById(ruleId);
    if (rule && rule.enabled === false) {
        return null; // Skip disabled rules
    }

    // Ensure primaryService is in affectedServices
    const serviceList = Array.from(new Set([primaryService, ...affectedServices]));

    // Check for existing active incident with matching fingerprint
    let existingIncident = await Incident.findOne({
        fingerprint,
        status: { $in: ['open', 'investigating'] }
    });

    if (existingIncident) {
        // Deduplication: Update existing incident
        existingIncident.occurrenceCount = (existingIncident.occurrenceCount || 1) + 1;
        existingIncident.lastDetectedAt = now;
        existingIncident.consecutiveHealthyCount = 0; // Reset recovery checks

        // Escalate severity if incoming severity is higher
        const severityRank = { warning: 1, high: 2, critical: 3 };
        if (severityRank[severity] > severityRank[existingIncident.severity]) {
            existingIncident.severity = severity;
        }

        // Merge affected services
        existingIncident.affectedServices = Array.from(new Set([
            ...existingIncident.affectedServices,
            ...serviceList
        ]));

        // Merge trace & request IDs
        const existingTraces = new Set(existingIncident.relatedTraceIds || []);
        relatedTraceIds.forEach(t => { if (t) existingTraces.add(t); });
        existingIncident.relatedTraceIds = Array.from(existingTraces).slice(-25);

        const existingReqs = new Set(existingIncident.relatedRequestIds || []);
        relatedRequestIds.forEach(r => { if (r) existingReqs.add(r); });
        existingIncident.relatedRequestIds = Array.from(existingReqs).slice(-25);

        // Update latest evidence
        existingIncident.evidence = {
            ...existingIncident.evidence,
            ...evidence,
            lastUpdatedAt: now.toISOString()
        };

        if (failureInjectionId) {
            existingIncident.failureInjectionId = failureInjectionId;
            existingIncident.failureInjectionDetails = failureInjectionDetails;
        }

        // Append reoccurrence event to timeline if at least 45 seconds elapsed since last timeline entry
        const lastTimeline = existingIncident.timeline[existingIncident.timeline.length - 1];
        const lastEventTime = lastTimeline ? new Date(lastTimeline.timestamp).getTime() : 0;
        if (now.getTime() - lastEventTime > 45000) {
            existingIncident.timeline.push({
                timestamp: now,
                type: 'reoccurrence',
                message: `Condition persisted/re-detected (${existingIncident.occurrenceCount} total occurrences).`,
                actor: 'system'
            });
        }

        await existingIncident.save();
        return existingIncident;
    } else {
        // Create brand new incident
        const incidentId = generateIncidentId();
        const newIncident = new Incident({
            incidentId,
            fingerprint,
            title,
            description,
            ruleId,
            category,
            severity,
            status: 'open',
            primaryService,
            affectedServices: serviceList,
            firstDetectedAt: now,
            lastDetectedAt: now,
            occurrenceCount: 1,
            consecutiveHealthyCount: 0,
            detectionSource: 'telemetry_engine',
            evidence: {
                ...evidence,
                detectedAt: now.toISOString()
            },
            relatedRequestIds: Array.from(new Set(relatedRequestIds.filter(Boolean))).slice(-25),
            relatedTraceIds: Array.from(new Set(relatedTraceIds.filter(Boolean))).slice(-25),
            relatedLogReferences: Array.from(new Set(relatedLogReferences.filter(Boolean))).slice(-25),
            relatedMetricInformation,
            failureInjectionId,
            failureInjectionDetails,
            timeline: [
                {
                    timestamp: now,
                    type: 'created',
                    message: `Incident automatically detected and created by Incident Detection Engine (${ruleId}).`,
                    actor: 'system'
                }
            ],
            environment: process.env.NODE_ENV || 'development'
        });

        await newIncident.save();
        console.log(`[IncidentEngine] Created new incident: ${incidentId} - ${title} [${severity.toUpperCase()}]`);
        return newIncident;
    }
}

/**
 * Evaluates all active telemetry against detection rules
 */
async function evaluateTelemetry() {
    const evaluatedFingerprintsThisRound = new Set();
    const now = new Date();
    const windowSeconds = 30;
    const windowStart = new Date(now.getTime() - windowSeconds * 1000);

    try {
        // 1. Fetch recent logs from MongoDB
        const recentLogs = await Log.find({
            timestamp: { $gte: windowStart }
        }).sort('-timestamp').limit(300);

        // Group logs by normalized service
        const logsByService = {};
        for (const l of recentLogs) {
            const svc = normalizeServiceName(l.service);
            if (!logsByService[svc]) logsByService[svc] = [];
            logsByService[svc].push(l);
        }

        // 2. Fetch active failure injections for context correlation
        let activeInjections = [];
        try {
            activeInjections = await FailureInjection.find({
                status: { $in: ['ACTIVE', 'TRIGGERED', 'EXPIRED', 'DEACTIVATED', 'STOPPED'] },
                updatedAt: { $gte: windowStart }
            });
        } catch (_) {}

        // Helper to find matching failure injection if one was active
        const findMatchingInjection = (svc, fType) => {
            return activeInjections.find(i => {
                const sameSvc = normalizeServiceName(i.targetService) === svc ||
                                (i.sourceService && normalizeServiceName(i.sourceService) === svc);
                const sameType = !fType || i.failureType.toLowerCase() === fType.toLowerCase();
                return sameSvc && sameType;
            });
        };

        // 3. Query Prometheus for metrics summary (if reachable)
        const promMetrics = {};
        const promRes = await safeFetchJson(`${PROMETHEUS_URL}/api/v1/query?query=rate(intellishop_http_requests_total[1m])`);
        if (promRes && promRes.data && Array.isArray(promRes.data.result)) {
            for (const item of promRes.data.result) {
                const svc = normalizeServiceName(item.metric?.service);
                promMetrics[svc] = {
                    rate: parseFloat(item.value?.[1] || 0)
                };
            }
        }

        // =====================================================================
        // RULE 6: Cascading Failure Detection
        // Originating in payment-service propagating to order-service / gateway
        // =====================================================================
        const ruleCascade = getRuleById('RULE-CASCADING-FAILURE');
        if (ruleCascade && ruleCascade.enabled !== false) {
            // Find cascading logs
            const cascadeLogs = recentLogs.filter(l => {
                const msg = (l.message || '').toLowerCase();
                return msg.includes('cascading_failure') ||
                       msg.includes('cascading failure') ||
                       msg.includes('cascading origin') ||
                       (l.failureType && l.failureType.toLowerCase() === 'cascading_failure');
            });

            // Check if both payment-service and order-service/gateway have errors in window
            const paymentErrors = (logsByService['payment-service'] || []).filter(l => 
                (l.statusCode >= 500) || (l.level && l.level.toUpperCase() === 'ERROR')
            );
            const orderErrors = (logsByService['order-service'] || []).filter(l => 
                (l.statusCode >= 500) || (l.level && l.level.toUpperCase() === 'ERROR') ||
                (l.message && (l.message.includes('Order could not be placed') || l.message.includes('failure')))
            );
            const gatewayErrors = (logsByService['intellishop-gateway'] || []).filter(l =>
                (l.message && l.message.includes('declined or failed')) ||
                (l.message && l.message.includes('Order could not be placed'))
            );

            const isCascadeDetected = cascadeLogs.length > 0 || (paymentErrors.length > 0 && (orderErrors.length > 0 || gatewayErrors.length > 0));

            if (isCascadeDetected) {
                const fp = 'RULE-CASCADING-FAILURE:payment-service->order-service';
                evaluatedFingerprintsThisRound.add(fp);

                const traceIds = Array.from(new Set([
                    ...cascadeLogs.map(l => l.traceId),
                    ...paymentErrors.map(l => l.traceId),
                    ...orderErrors.map(l => l.traceId)
                ])).filter(Boolean);

                const reqIds = Array.from(new Set([
                    ...cascadeLogs.map(l => l.requestId),
                    ...paymentErrors.map(l => l.requestId),
                    ...orderErrors.map(l => l.requestId)
                ])).filter(Boolean);

                const matchingInj = findMatchingInjection('payment-service', 'cascading_failure');

                await reportDetectedCondition({
                    ruleId: 'RULE-CASCADING-FAILURE',
                    category: 'cascade',
                    severity: 'critical',
                    title: 'Cascading Failure – Payment Service to Order Service',
                    description: 'Cascading failure detected originating in Payment Service and propagating to Order Service and Gateway checkout flow.',
                    primaryService: 'payment-service',
                    affectedServices: ['payment-service', 'order-service', 'intellishop-gateway'],
                    fingerprint: fp,
                    evidence: {
                        originatingService: 'payment-service',
                        downstreamServices: ['order-service', 'intellishop-gateway'],
                        originErrorCount: paymentErrors.length,
                        downstreamErrorCount: orderErrors.length + gatewayErrors.length,
                        recentLogs: [...cascadeLogs, ...paymentErrors.slice(0, 3), ...orderErrors.slice(0, 3)].slice(0, 5).map(l => ({
                            timestamp: l.timestamp,
                            service: l.service,
                            level: l.level,
                            message: l.message,
                            statusCode: l.statusCode,
                            traceId: l.traceId
                        })),
                        traceIds: traceIds.slice(0, 5)
                    },
                    relatedRequestIds: reqIds,
                    relatedTraceIds: traceIds,
                    failureInjectionId: matchingInj ? matchingInj._id.toString() : null,
                    failureInjectionDetails: matchingInj ? {
                        type: matchingInj.failureType,
                        durationSeconds: matchingInj.durationSeconds,
                        triggerCount: matchingInj.triggerCount
                    } : null
                });
            }
        }

        // =====================================================================
        // RULE 4: Service-to-Service Communication Failure Detection
        // Downstream dependency failure (e.g. Order Service -> Payment Service)
        // =====================================================================
        const ruleComm = getRuleById('RULE-SVC-COMM');
        if (ruleComm && ruleComm.enabled !== false) {
            const commErrorLogs = recentLogs.filter(l => {
                const msg = (l.message || '').toLowerCase();
                const errStr = (l.errorMessage || '').toLowerCase();
                return msg.includes('service_communication_failure') ||
                       msg.includes('econnrefused') ||
                       msg.includes('etimedout') ||
                       msg.includes('payment service unavailable') ||
                       msg.includes('could not reach downstream') ||
                       errStr.includes('econnrefused') ||
                       errStr.includes('etimedout');
            });

            if (commErrorLogs.length >= (ruleComm.thresholds.minFailedCalls || 1)) {
                const firstLog = commErrorLogs[0];
                const sourceService = normalizeServiceName(firstLog.sourceService || firstLog.service || 'order-service');
                const destService = normalizeServiceName(firstLog.destinationService || 'payment-service');

                const fp = `RULE-SVC-COMM:${sourceService}->${destService}`;
                evaluatedFingerprintsThisRound.add(fp);

                const traceIds = commErrorLogs.map(l => l.traceId).filter(Boolean);
                const reqIds = commErrorLogs.map(l => l.requestId).filter(Boolean);
                const matchingInj = findMatchingInjection(sourceService, 'service_communication_failure');

                await reportDetectedCondition({
                    ruleId: 'RULE-SVC-COMM',
                    category: 'communication',
                    severity: 'critical',
                    title: `${getServiceDisplayName(sourceService)} – ${getServiceDisplayName(destService)} Dependency Unavailable`,
                    description: `${getServiceDisplayName(sourceService)} is unable to communicate successfully with downstream dependency ${getServiceDisplayName(destService)}.`,
                    primaryService: sourceService,
                    affectedServices: [sourceService, destService],
                    fingerprint: fp,
                    evidence: {
                        sourceService,
                        destinationService: destService,
                        failedCallsCount: commErrorLogs.length,
                        recentLogs: commErrorLogs.slice(0, 5).map(l => ({
                            timestamp: l.timestamp,
                            service: l.service,
                            level: l.level,
                            message: l.message,
                            statusCode: l.statusCode,
                            traceId: l.traceId
                        })),
                        traceIds: traceIds.slice(0, 5)
                    },
                    relatedRequestIds: reqIds,
                    relatedTraceIds: traceIds,
                    failureInjectionId: matchingInj ? matchingInj._id.toString() : null,
                    failureInjectionDetails: matchingInj ? {
                        type: matchingInj.failureType,
                        durationSeconds: matchingInj.durationSeconds,
                        triggerCount: matchingInj.triggerCount
                    } : null
                });
            }
        }

        // =====================================================================
        // RULE 3: Database Query Timeout Detection
        // =====================================================================
        const ruleDb = getRuleById('RULE-DB-TIMEOUT');
        if (ruleDb && ruleDb.enabled !== false) {
            const dbTimeoutLogs = recentLogs.filter(l => {
                const msg = (l.message || '').toLowerCase();
                const errStr = (l.errorMessage || '').toLowerCase();
                return msg.includes('mongotimeouterror') ||
                       msg.includes('database_timeout') ||
                       msg.includes('operation exceeded application timeout') ||
                       msg.includes('database connection timeout') ||
                       errStr.includes('mongotimeouterror');
            });

            // Group DB timeouts by affected service
            const dbTimeoutsBySvc = {};
            for (const log of dbTimeoutLogs) {
                const svc = normalizeServiceName(log.service);
                if (!dbTimeoutsBySvc[svc]) dbTimeoutsBySvc[svc] = [];
                dbTimeoutsBySvc[svc].push(log);
            }

            for (const [svc, logs] of Object.entries(dbTimeoutsBySvc)) {
                if (logs.length >= (ruleDb.thresholds.minTimeoutErrors || 1)) {
                    const fp = `RULE-DB-TIMEOUT:${svc}`;
                    evaluatedFingerprintsThisRound.add(fp);

                    const traceIds = logs.map(l => l.traceId).filter(Boolean);
                    const reqIds = logs.map(l => l.requestId).filter(Boolean);
                    const matchingInj = findMatchingInjection(svc, 'database_timeout');

                    await reportDetectedCondition({
                        ruleId: 'RULE-DB-TIMEOUT',
                        category: 'database',
                        severity: 'critical',
                        title: `Database – Query Timeout Detected in ${getServiceDisplayName(svc)}`,
                        description: `Database operations are exceeding their configured execution timeout in ${getServiceDisplayName(svc)}.`,
                        primaryService: svc,
                        affectedServices: [svc],
                        fingerprint: fp,
                        evidence: {
                            service: svc,
                            databaseType: 'MongoDB',
                            timeoutCount: logs.length,
                            recentLogs: logs.slice(0, 5).map(l => ({
                                timestamp: l.timestamp,
                                service: l.service,
                                level: l.level,
                                message: l.message,
                                statusCode: l.statusCode,
                                traceId: l.traceId
                            })),
                            traceIds: traceIds.slice(0, 5)
                        },
                        relatedRequestIds: reqIds,
                        relatedTraceIds: traceIds,
                        failureInjectionId: matchingInj ? matchingInj._id.toString() : null,
                        failureInjectionDetails: matchingInj ? {
                            type: matchingInj.failureType,
                            durationSeconds: matchingInj.durationSeconds,
                            triggerCount: matchingInj.triggerCount
                        } : null
                    });
                }
            }
        }

        // =====================================================================
        // RULE 1: HTTP 500 – Service Internal Error Detection
        // =====================================================================
        const rule500 = getRuleById('RULE-HTTP-500');
        if (rule500 && rule500.enabled !== false) {
            for (const targetSvc of rule500.targetServices) {
                const svcLogs = logsByService[targetSvc] || [];
                // Look for 500 status codes, or level ERROR with 500 in message
                const errLogs = svcLogs.filter(l => 
                    l.statusCode === 500 || 
                    (l.level && l.level.toUpperCase() === 'ERROR' && (l.message || '').includes('500')) ||
                    (l.failureType && l.failureType.toLowerCase() === 'http_500')
                );

                const totalRequests = svcLogs.length;
                const errCount = errLogs.length;
                const errorRate = totalRequests > 0 ? (errCount / totalRequests) * 100 : 0;

                const isThresholdMet = errCount >= (rule500.thresholds.minErrors || 2) ||
                                       (errCount >= 1 && totalRequests >= 2 && errorRate >= (rule500.thresholds.errorRatePercent || 20));

                if (isThresholdMet) {
                    const fp = `RULE-HTTP-500:${targetSvc}`;
                    evaluatedFingerprintsThisRound.add(fp);

                    const severity = errCount >= (rule500.thresholds.criticalErrorCount || 3) ? 'critical' : 'high';
                    const traceIds = errLogs.map(l => l.traceId).filter(Boolean);
                    const reqIds = errLogs.map(l => l.requestId).filter(Boolean);
                    const matchingInj = findMatchingInjection(targetSvc, 'http_500');

                    await reportDetectedCondition({
                        ruleId: 'RULE-HTTP-500',
                        category: 'availability',
                        severity,
                        title: `${getServiceDisplayName(targetSvc)} – High HTTP 500 Error Rate`,
                        description: `${getServiceDisplayName(targetSvc)} is experiencing an abnormal increase in internal server errors (${errCount} errors observed).`,
                        primaryService: targetSvc,
                        affectedServices: [targetSvc],
                        fingerprint: fp,
                        evidence: {
                            service: targetSvc,
                            errorCount: errCount,
                            totalObservedRequests: totalRequests,
                            errorRatePercent: Math.round(errorRate * 10) / 10,
                            recentLogs: errLogs.slice(0, 5).map(l => ({
                                timestamp: l.timestamp,
                                service: l.service,
                                level: l.level,
                                message: l.message,
                                statusCode: l.statusCode,
                                traceId: l.traceId
                            })),
                            traceIds: traceIds.slice(0, 5)
                        },
                        relatedRequestIds: reqIds,
                        relatedTraceIds: traceIds,
                        failureInjectionId: matchingInj ? matchingInj._id.toString() : null,
                        failureInjectionDetails: matchingInj ? {
                            type: matchingInj.failureType,
                            durationSeconds: matchingInj.durationSeconds,
                            triggerCount: matchingInj.triggerCount
                        } : null
                    });
                }
            }
        }

        // =====================================================================
        // RULE 2: High Latency – Slow Service Response
        // =====================================================================
        const ruleLatency = getRuleById('RULE-HIGH-LATENCY');
        if (ruleLatency && ruleLatency.enabled !== false) {
            for (const targetSvc of ruleLatency.targetServices) {
                const svcLogs = logsByService[targetSvc] || [];
                const slowLogs = svcLogs.filter(l => 
                    (l.responseTime && l.responseTime >= ruleLatency.thresholds.warningLatencyMs) ||
                    (l.delayMs && l.delayMs >= ruleLatency.thresholds.warningLatencyMs) ||
                    (l.failureType && (l.failureType.toLowerCase() === 'latency' || l.failureType.toLowerCase() === 'network_delay'))
                );

                if (slowLogs.length >= (ruleLatency.thresholds.minSlowRequests || 1)) {
                    const latencies = slowLogs.map(l => l.responseTime || l.delayMs || 3000);
                    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
                    const maxLatency = Math.max(...latencies);

                    const severity = avgLatency >= (ruleLatency.thresholds.criticalLatencyMs || 4500) ? 'critical' : 'high';
                    const fp = `RULE-HIGH-LATENCY:${targetSvc}`;
                    evaluatedFingerprintsThisRound.add(fp);

                    const traceIds = slowLogs.map(l => l.traceId).filter(Boolean);
                    const reqIds = slowLogs.map(l => l.requestId).filter(Boolean);
                    const matchingInj = findMatchingInjection(targetSvc, 'latency');

                    await reportDetectedCondition({
                        ruleId: 'RULE-HIGH-LATENCY',
                        category: 'latency',
                        severity,
                        title: `${getServiceDisplayName(targetSvc)} – High Response Latency`,
                        description: `${getServiceDisplayName(targetSvc)} requests are taking significantly longer than normal (${avgLatency}ms avg observed).`,
                        primaryService: targetSvc,
                        affectedServices: [targetSvc],
                        fingerprint: fp,
                        evidence: {
                            service: targetSvc,
                            avgLatencyMs: avgLatency,
                            maxLatencyMs: maxLatency,
                            slowRequestCount: slowLogs.length,
                            thresholdMs: ruleLatency.thresholds.warningLatencyMs,
                            recentLogs: slowLogs.slice(0, 5).map(l => ({
                                timestamp: l.timestamp,
                                service: l.service,
                                level: l.level,
                                message: l.message,
                                responseTime: l.responseTime || l.delayMs,
                                traceId: l.traceId
                            })),
                            traceIds: traceIds.slice(0, 5)
                        },
                        relatedRequestIds: reqIds,
                        relatedTraceIds: traceIds,
                        failureInjectionId: matchingInj ? matchingInj._id.toString() : null,
                        failureInjectionDetails: matchingInj ? {
                            type: matchingInj.failureType,
                            durationSeconds: matchingInj.durationSeconds,
                            delayMs: matchingInj.delayMs
                        } : null
                    });
                }
            }
        }

        // =====================================================================
        // RULE 5: Traffic Spike – Service Overload
        // =====================================================================
        const ruleSpike = getRuleById('RULE-TRAFFIC-SPIKE');
        if (ruleSpike && ruleSpike.enabled !== false) {
            for (const targetSvc of ruleSpike.targetServices) {
                const svcLogs = logsByService[targetSvc] || [];
                const reqCount = svcLogs.length;

                // Check traffic spike simulation log or high request count
                const hasSpikeSimulationLog = svcLogs.some(l => 
                    (l.message || '').includes('TRAFFIC_SPIKE') || 
                    (l.failureType && l.failureType.toLowerCase() === 'traffic_spike')
                );

                const hasHighVolume = reqCount >= (ruleSpike.thresholds.minRequestCount || 20);

                if (hasSpikeSimulationLog || hasHighVolume) {
                    // Check supporting evidence: degraded latency OR errors
                    const slowCount = svcLogs.filter(l => (l.responseTime || 0) >= (ruleSpike.thresholds.degradedLatencyMs || 150)).length;
                    const errCount = svcLogs.filter(l => (l.statusCode || 0) >= 400).length;

                    // Condition: traffic surge AND supporting evidence of resource/latency pressure
                    if (hasSpikeSimulationLog || (slowCount > 0 || errCount > 0)) {
                        const fp = `RULE-TRAFFIC-SPIKE:${targetSvc}`;
                        evaluatedFingerprintsThisRound.add(fp);

                        const matchingInj = findMatchingInjection(targetSvc, 'traffic_spike');
                        const traceIds = svcLogs.map(l => l.traceId).filter(Boolean);

                        await reportDetectedCondition({
                            ruleId: 'RULE-TRAFFIC-SPIKE',
                            category: 'capacity',
                            severity: 'high',
                            title: `${getServiceDisplayName(targetSvc)} – Abnormal Traffic Spike & Overload`,
                            description: `${getServiceDisplayName(targetSvc)} received an abnormal surge in requests (${reqCount} requests) accompanied by latency degradation and service pressure.`,
                            primaryService: targetSvc,
                            affectedServices: [targetSvc],
                            fingerprint: fp,
                            evidence: {
                                service: targetSvc,
                                observedRequestsInWindow: reqCount,
                                elevatedLatencyRequests: slowCount,
                                errorCount: errCount,
                                rpsEstimate: Math.round((reqCount / windowSeconds) * 10) / 10
                            },
                            relatedTraceIds: traceIds.slice(0, 5),
                            failureInjectionId: matchingInj ? matchingInj._id.toString() : null,
                            failureInjectionDetails: matchingInj ? {
                                type: matchingInj.failureType,
                                durationSeconds: matchingInj.durationSeconds
                            } : null
                        });
                    }
                }
            }
        }

        // =====================================================================
        // AUTO-RECOVERY & AUTO-RESOLUTION
        // Evaluate active incidents not triggered in this evaluation cycle
        // =====================================================================
        const activeIncidents = await Incident.find({
            status: { $in: ['open', 'investigating'] }
        });

        for (const inc of activeIncidents) {
            if (!evaluatedFingerprintsThisRound.has(inc.fingerprint)) {
                // The condition was NOT detected in this healthy evaluation window
                inc.consecutiveHealthyCount = (inc.consecutiveHealthyCount || 0) + 1;

                const rule = getRuleById(inc.ruleId);
                const reqChecks = rule?.recoveryCondition?.requiredConsecutiveHealthyChecks || 2;

                if (inc.consecutiveHealthyCount >= reqChecks) {
                    // Problem has ceased and recovery is confirmed
                    inc.status = 'resolved';
                    inc.resolvedAt = now;
                    inc.timeline.push({
                        timestamp: now,
                        type: 'auto_resolved',
                        message: `Condition cleared. Incident automatically resolved after ${inc.consecutiveHealthyCount} consecutive healthy evaluation cycles.`,
                        actor: 'system'
                    });
                    await inc.save();
                    console.log(`[IncidentEngine] Auto-resolved incident: ${inc.incidentId} (${inc.title})`);
                } else {
                    await inc.save();
                }
            }
        }

    } catch (err) {
        console.error('[IncidentEngine] Evaluation error:', err.message);
    }
}

// Background scheduler
let engineInterval = null;

function startIncidentDetectionEngine(intervalMs = 15000) {
    if (engineInterval) {
        clearInterval(engineInterval);
    }

    console.log(`[IncidentEngine] Starting Automatic Incident Detection Engine (Interval: ${intervalMs}ms)...`);
    
    // Initial evaluation after 3 seconds
    setTimeout(() => {
        evaluateTelemetry().catch(err => console.error('[IncidentEngine] Initial run error:', err));
    }, 3000);

    // Periodic evaluation
    engineInterval = setInterval(() => {
        evaluateTelemetry().catch(err => console.error('[IncidentEngine] Scheduled run error:', err));
    }, intervalMs);

    if (engineInterval.unref) engineInterval.unref();
}

function stopIncidentDetectionEngine() {
    if (engineInterval) {
        clearInterval(engineInterval);
        engineInterval = null;
        console.log('[IncidentEngine] Incident Detection Engine stopped.');
    }
}

module.exports = {
    startIncidentDetectionEngine,
    stopIncidentDetectionEngine,
    evaluateIncidentsNow: evaluateTelemetry
};

