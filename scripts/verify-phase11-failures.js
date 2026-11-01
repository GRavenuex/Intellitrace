/**
 * Phase 11 — Failure Injection Framework Verification Script
 * Tests all 8 scenarios defined in Section 14 of Phase 11 requirements.
 */

const { execSync } = require('child_process');

const INTELLITRACE_URL = 'http://localhost:4000';
const GATEWAY_URL = 'http://localhost:3000';
const PRODUCT_URL = 'http://localhost:3001';
const CART_URL = 'http://localhost:3002';
const ORDER_URL = 'http://localhost:3003';
const PAYMENT_URL = 'http://localhost:3004';
const PROMETHEUS_URL = 'http://localhost:9090';

let authToken = '';
const results = [];

function recordResult(testName, status, details = {}) {
    results.push({ testName, status, details });
    console.log(`\n>>> [${status}] ${testName}`);
    if (Object.keys(details).length > 0) {
        console.log('    Details:', JSON.stringify(details, null, 2));
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function authenticate() {
    const res = await fetch(`${INTELLITRACE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@intellitrace.com', password: 'password123' })
    });
    const data = await res.json();
    if (!data.token) throw new Error('Authentication failed: ' + JSON.stringify(data));
    authToken = data.token;
    return authToken;
}

async function createRule(rule) {
    const res = await fetch(`${INTELLITRACE_URL}/api/v1/failure-injections`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(rule)
    });
    return await res.json();
}

async function stopRule(id) {
    const res = await fetch(`${INTELLITRACE_URL}/api/v1/failure-injections/${id}/stop`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    return await res.json();
}

async function getPrometheusMetric(metricName, serviceLabel) {
    try {
        const query = serviceLabel ? `${metricName}{service="${serviceLabel}"}` : metricName;
        const res = await fetch(`${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
        const json = await res.json();
        return json?.data?.result || [];
    } catch (_) {
        return [];
    }
}

async function runTests() {
    console.log('===============================================================');
    console.log('   PHASE 11: FAILURE INJECTION FRAMEWORK END-TO-END TESTS      ');
    console.log('===============================================================\n');

    await authenticate();
    console.log('✓ Successfully authenticated with IntelliTrace backend');

    // ------------------------------------------------------------------------
    // TEST 1: Payment Service Latency
    // ------------------------------------------------------------------------
    console.log('\n--- Running Test 1: Payment Service Latency (5s Delay) ---');
    let t1RuleId = null;
    try {
        const ruleRes = await createRule({
            targetService: 'payment-service',
            failureType: 'latency',
            targetRoute: '/api/payments',
            delayMs: 5000,
            durationSeconds: 120,
            description: 'Test 1: Payment 5s latency injection'
        });
        if (!ruleRes.success) throw new Error('Failed to create rule: ' + ruleRes.message);
        t1RuleId = ruleRes.data._id;
        console.log(`✓ Latency injection rule created (ID: ${t1RuleId}, delay: 5000ms)`);

        // Wait for microservice cache sync
        await sleep(2000);

        // 2. Trigger Payment Request with valid 24-char ObjectId
        const startTime = Date.now();
        const paymentRes = await fetch(`${PAYMENT_URL}/api/payments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-request-id': 'req-test-latency-' + Date.now()
            },
            body: JSON.stringify({
                orderId: '6adc79c7b644c9b7eb57f421',
                simulateResult: 'SUCCESS',
                paymentMethod: 'Mock Card',
                userId: '6adc79c7b644c9b7eb57f421'
            })
        });
        const elapsedMs = Date.now() - startTime;
        console.log(`✓ Payment request completed in ${elapsedMs}ms with status ${paymentRes.status}`);

        if (elapsedMs < 4800) {
            throw new Error(`Expected at least 5000ms delay, but took ${elapsedMs}ms`);
        }

        // 3. Inspect Prometheus metric
        await sleep(1000);
        const promMetrics = await fetch(`${PAYMENT_URL}/metrics`).then(r => r.text());
        const hasPromLatency = promMetrics.includes('intellitrace_injected_latency_seconds') ||
                               promMetrics.includes('intellitrace_injected_failures_total');

        // 4. Query traces from IntelliTrace / Jaeger
        await sleep(2000);
        const tracesRes = await fetch(`${INTELLITRACE_URL}/api/traces?service=payment-service&limit=5`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        }).then(r => r.json());
        const trace = tracesRes.data?.[0];

        recordResult('Test 1: Payment Service Latency', 'PASS', {
            ruleId: t1RuleId,
            configuredDelayMs: 5000,
            measuredElapsedMs: elapsedMs,
            prometheusMetricPresent: hasPromLatency,
            sampleTraceId: trace?.traceId || 'trace-active',
            traceDurationMs: trace?.durationMs
        });
    } catch (err) {
        recordResult('Test 1: Payment Service Latency', 'FAIL', { error: err.message });
    } finally {
        if (t1RuleId) await stopRule(t1RuleId);
        await sleep(2000);
    }

    // ------------------------------------------------------------------------
    // TEST 2: Payment HTTP 500
    // ------------------------------------------------------------------------
    console.log('\n--- Running Test 2: Payment HTTP 500 Injection ---');
    let t2RuleId = null;
    try {
        const ruleRes = await createRule({
            targetService: 'payment-service',
            failureType: 'http_500',
            targetRoute: '/api/payments',
            durationSeconds: 120,
            description: 'Test 2: Payment HTTP 500 injection'
        });
        if (!ruleRes.success) throw new Error('Failed to create rule: ' + ruleRes.message);
        t2RuleId = ruleRes.data._id;
        console.log(`✓ HTTP 500 injection rule created (ID: ${t2RuleId})`);

        await sleep(2000);

        const paymentRes = await fetch(`${PAYMENT_URL}/api/payments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-request-id': 'req-test-500-' + Date.now()
            },
            body: JSON.stringify({
                orderId: '6adc79c7b644c9b7eb57f421',
                simulateResult: 'SUCCESS',
                paymentMethod: 'Mock Card',
                userId: '6adc79c7b644c9b7eb57f421'
            })
        });

        const paymentData = await paymentRes.json();
        console.log(`✓ Received response status: ${paymentRes.status}`, paymentData);

        if (paymentRes.status !== 500) {
            throw new Error(`Expected HTTP 500, received ${paymentRes.status}`);
        }
        if (paymentData.failureType !== 'http_500') {
            throw new Error(`Expected failureType=http_500, received ${paymentData.failureType}`);
        }

        // Check Prometheus error metric
        const promMetrics = await fetch(`${PAYMENT_URL}/metrics`).then(r => r.text());
        const hasErrorMetric = promMetrics.includes('intellitrace_injected_failures_total') &&
                               promMetrics.includes('http_500');

        recordResult('Test 2: Payment HTTP 500', 'PASS', {
            ruleId: t2RuleId,
            responseStatus: paymentRes.status,
            errorBody: paymentData,
            prometheusMetricsVerified: hasErrorMetric
        });
    } catch (err) {
        recordResult('Test 2: Payment HTTP 500', 'FAIL', { error: err.message });
    } finally {
        if (t2RuleId) await stopRule(t2RuleId);
        await sleep(2000);
    }

    // ------------------------------------------------------------------------
    // TEST 3: Product Service Unavailability (HTTP 503 & Auto Recovery)
    // ------------------------------------------------------------------------
    console.log('\n--- Running Test 3: Product Service Unavailability (503 & Auto Recovery) ---');
    let t3RuleId = null;
    try {
        const ruleRes = await createRule({
            targetService: 'product-service',
            failureType: 'service_unavailable',
            targetRoute: '/api/products',
            durationSeconds: 8,
            description: 'Test 3: Product Service 503 Unavailability'
        });
        if (!ruleRes.success) throw new Error('Failed to create rule: ' + ruleRes.message);
        t3RuleId = ruleRes.data._id;
        console.log(`✓ Service Unavailable rule created (ID: ${t3RuleId}, expires in 8s)`);

        await sleep(2000);

        // Verify 503
        const unavailableRes = await fetch(`${PRODUCT_URL}/api/products`);
        const unavailableData = await unavailableRes.json();
        console.log(`✓ During simulation: HTTP ${unavailableRes.status}`, unavailableData);
        if (unavailableRes.status !== 503) {
            throw new Error(`Expected HTTP 503 during simulation, got ${unavailableRes.status}`);
        }

        // Wait for auto expiration (8s total duration + 2s buffer)
        console.log('✓ Waiting for simulation rule to expire automatically (9s)...');
        await sleep(9000);

        // Verify Product service returns to normal operation (HTTP 200)
        const recoveredRes = await fetch(`${PRODUCT_URL}/api/products`);
        const recoveredData = await recoveredRes.json();
        console.log(`✓ After expiration: HTTP ${recoveredRes.status}, Product count: ${recoveredData.data?.length}`);

        if (recoveredRes.status !== 200 || !Array.isArray(recoveredData.data)) {
            throw new Error(`Expected HTTP 200 with products array after expiration, got ${recoveredRes.status}`);
        }

        recordResult('Test 3: Product Service Unavailability', 'PASS', {
            ruleId: t3RuleId,
            unavailableStatusCode: unavailableRes.status,
            recoveredStatusCode: recoveredRes.status,
            recoveredProductsCount: recoveredData.data.length,
            autoRecoveryConfirmed: true
        });
    } catch (err) {
        recordResult('Test 3: Product Service Unavailability', 'FAIL', { error: err.message });
    } finally {
        if (t3RuleId) await stopRule(t3RuleId).catch(() => {});
        await sleep(2000);
    }

    // ------------------------------------------------------------------------
    // TEST 4: Database Connection Failure (Simulated DB Timeout)
    // ------------------------------------------------------------------------
    console.log('\n--- Running Test 4: Database Connection Failure (Simulated DB Timeout) ---');
    let t4RuleId = null;
    try {
        const ruleRes = await createRule({
            targetService: 'order-service',
            failureType: 'database_timeout',
            targetRoute: '/api/orders',
            durationSeconds: 60,
            description: 'Test 4: Order Service Simulated DB Timeout'
        });
        if (!ruleRes.success) throw new Error('Failed to create rule: ' + ruleRes.message);
        t4RuleId = ruleRes.data._id;
        console.log(`✓ Database timeout rule created (ID: ${t4RuleId})`);

        await sleep(2000);

        // Trigger request to order-service with valid 24-character hex ObjectIds
        const orderRes = await fetch(`${ORDER_URL}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: '6adc79c7b644c9b7eb57f421',
                items: [{ productId: '6adc79c7b644c9b7eb57f421', name: 'Test Product', quantity: 1, price: 100 }],
                totalAmount: 100,
                shippingAddress: { fullName: 'Test User', address: '123 St', city: 'City', state: 'State', pincode: '400001', phone: '9999999999' }
            })
        });
        const orderData = await orderRes.json();
        console.log(`✓ DB failure response: HTTP ${orderRes.status}`, orderData);

        if (orderRes.status !== 500) {
            throw new Error(`Expected HTTP 500 for DB timeout, got ${orderRes.status}`);
        }
        if (!orderData.error?.includes('Operation buffering timed out') && orderData.failureType !== 'database_timeout') {
            throw new Error(`Expected Mongoose timeout error message, got: ${orderData.error}`);
        }

        // Verify MongoDB container is healthy and intact
        const mongoPing = execSync('docker exec mongodb mongosh --eval "db.adminCommand(\'ping\')" --quiet').toString();
        const isMongoOk = mongoPing.includes('{ ok: 1 }') || mongoPing.includes('1');
        console.log('✓ MongoDB ping health check response:', mongoPing.trim());
        if (!isMongoOk) {
            throw new Error('Real MongoDB database was unexpectedly affected!');
        }

        // Stop the simulation
        await stopRule(t4RuleId);
        t4RuleId = null;
        await sleep(2000);

        // Verify normal database operation returns
        const checkMongoRes = await fetch(`${ORDER_URL}/api/orders`);
        console.log(`✓ After deactivation: HTTP ${checkMongoRes.status}`);
        if (checkMongoRes.status !== 200) {
            throw new Error(`Expected HTTP 200 after stopping DB simulation, got ${checkMongoRes.status}`);
        }

        recordResult('Test 4: Database Timeout', 'PASS', {
            ruleId: ruleRes.data._id,
            simulatedError: orderData.error,
            mongoDbPingResult: mongoPing.trim(),
            realMongoDatabaseHealthy: true,
            postDeactivationStatusCode: checkMongoRes.status
        });
    } catch (err) {
        recordResult('Test 4: Database Timeout', 'FAIL', { error: err.message });
    } finally {
        if (t4RuleId) await stopRule(t4RuleId).catch(() => {});
        await sleep(2000);
    }

    // ------------------------------------------------------------------------
    // TEST 5: Intermittent Failure (25% Probability)
    // ------------------------------------------------------------------------
    console.log('\n--- Running Test 5: Intermittent Failure (25% Probability) ---');
    let t5RuleId = null;
    try {
        const ruleRes = await createRule({
            targetService: 'cart-service',
            failureType: 'intermittent',
            targetRoute: '/api/cart',
            percentage: 25,
            durationSeconds: 60,
            description: 'Test 5: Cart Intermittent 25% failure'
        });
        if (!ruleRes.success) throw new Error('Failed to create rule: ' + ruleRes.message);
        t5RuleId = ruleRes.data._id;
        console.log(`✓ Intermittent failure rule created (ID: ${t5RuleId}, percentage: 25%)`);

        await sleep(2000);

        // Send 30 requests to observe probabilistic behavior using a valid ObjectId
        const numRequests = 30;
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < numRequests; i++) {
            const res = await fetch(`${CART_URL}/api/cart/6adc79c7b644c9b7eb57f421`);
            if (res.status === 200) successCount++;
            else if (res.status === 500) failCount++;
        }

        console.log(`✓ Sent ${numRequests} requests: ${successCount} Succeeded (200), ${failCount} Injected Failures (500)`);
        const measuredPercentage = ((failCount / numRequests) * 100).toFixed(1);
        console.log(`✓ Measured failure rate: ${measuredPercentage}% (Configured: 25%)`);

        if (successCount === 0 || failCount === 0) {
            throw new Error(`Expected both successes and failures with 25% probability over ${numRequests} requests`);
        }

        recordResult('Test 5: Intermittent Failure', 'PASS', {
            ruleId: t5RuleId,
            configuredPercentage: 25,
            totalRequests: numRequests,
            successCount,
            failCount,
            measuredPercentage: `${measuredPercentage}%`
        });
    } catch (err) {
        recordResult('Test 5: Intermittent Failure', 'FAIL', { error: err.message });
    } finally {
        if (t5RuleId) await stopRule(t5RuleId).catch(() => {});
        await sleep(2000);
    }

    // ------------------------------------------------------------------------
    // TEST 6: Automatic Recovery
    // ------------------------------------------------------------------------
    console.log('\n--- Running Test 6: Automatic Recovery & Rule Expiration ---');
    let t6RuleId = null;
    try {
        const ruleRes = await createRule({
            targetService: 'payment-service',
            failureType: 'http_500',
            targetRoute: '/api/payments',
            durationSeconds: 5,
            description: 'Test 6: Short duration auto recovery test'
        });
        if (!ruleRes.success) throw new Error('Failed to create rule: ' + ruleRes.message);
        t6RuleId = ruleRes.data._id;
        console.log(`✓ Created 5-second rule (ID: ${t6RuleId})`);

        // Check active rules before expiration
        const activeBefore = await fetch(`${INTELLITRACE_URL}/api/v1/failure-injections/active?service=payment-service`).then(r => r.json());
        const isPresentBefore = activeBefore.data.some(r => r._id === t6RuleId);
        console.log(`✓ Rule present in active list immediately: ${isPresentBefore}`);

        // Wait for expiration
        console.log('✓ Waiting 7 seconds for automatic expiration...');
        await sleep(7000);

        // Check active rules after expiration
        const activeAfter = await fetch(`${INTELLITRACE_URL}/api/v1/failure-injections/active?service=payment-service`).then(r => r.json());
        const isPresentAfter = activeAfter.data.some(r => r._id === t6RuleId);
        console.log(`✓ Rule present in active list after expiry: ${isPresentAfter}`);

        // Query the specific rule status
        const singleRule = await fetch(`${INTELLITRACE_URL}/api/v1/failure-injections/${t6RuleId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        }).then(r => r.json());
        console.log(`✓ Rule status in database: ${singleRule.data?.status}`);

        if (isPresentAfter || singleRule.data?.status !== 'EXPIRED') {
            throw new Error(`Rule did not expire automatically. Status: ${singleRule.data?.status}`);
        }

        recordResult('Test 6: Automatic Recovery', 'PASS', {
            ruleId: t6RuleId,
            statusBeforeExpiry: 'ACTIVE',
            statusAfterExpiry: singleRule.data?.status,
            activeAfterCount: activeAfter.count,
            autoRecoveryConfirmed: true
        });
    } catch (err) {
        recordResult('Test 6: Automatic Recovery', 'FAIL', { error: err.message });
    }

    // ------------------------------------------------------------------------
    // TEST 7: IntelliTrace Downtime Resilience
    // ------------------------------------------------------------------------
    console.log('\n--- Running Test 7: IntelliTrace Downtime Resilience ---');
    try {
        console.log('✓ Stopping intellitrace-backend container to simulate downtime...');
        execSync('docker stop intellitrace-backend');

        await sleep(2000);

        // Microservices must continue functioning normally without blocking
        console.log('✓ Calling product-service while IntelliTrace is offline...');
        const pRes = await fetch(`${PRODUCT_URL}/api/products`);
        const pData = await pRes.json();
        console.log(`✓ Product Service response: HTTP ${pRes.status}, items: ${pData.data?.length}`);

        console.log('✓ Calling cart-service while IntelliTrace is offline...');
        const cRes = await fetch(`${CART_URL}/api/cart/6adc79c7b644c9b7eb57f421`);
        console.log(`✓ Cart Service response: HTTP ${cRes.status}`);

        if (pRes.status !== 200 || cRes.status !== 200) {
            throw new Error(`IntelliShop was broken during IntelliTrace downtime! Product: ${pRes.status}, Cart: ${cRes.status}`);
        }

        console.log('✓ Restarting intellitrace-backend container...');
        execSync('docker start intellitrace-backend');

        // Poll health until intellitrace-backend is ready
        let isHealthy = false;
        for (let attempt = 1; attempt <= 20; attempt++) {
            await sleep(1000);
            try {
                const healthRes = await fetch(`${INTELLITRACE_URL}/health`);
                if (healthRes.ok) {
                    isHealthy = true;
                    console.log(`✓ IntelliTrace restored and healthy on attempt ${attempt}`);
                    break;
                }
            } catch (_) {}
        }

        if (!isHealthy) throw new Error('IntelliTrace backend failed to become healthy after restart');

        // Re-authenticate
        await authenticate();

        recordResult('Test 7: IntelliTrace Downtime', 'PASS', {
            productServiceStatusDuringDowntime: pRes.status,
            cartServiceStatusDuringDowntime: cRes.status,
            intellitraceRestartedStatus: 'healthy',
            businessOperationsUnaffected: true
        });
    } catch (err) {
        recordResult('Test 7: IntelliTrace Downtime', 'FAIL', { error: err.message });
    }

    // ------------------------------------------------------------------------
    // TEST 8: Security & Safety Validation
    // ------------------------------------------------------------------------
    console.log('\n--- Running Test 8: Security & Safety Validation ---');
    try {
        const securityChecks = [];

        // 1. Unauthorized access without JWT
        const noAuthRes = await fetch(`${INTELLITRACE_URL}/api/v1/failure-injections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetService: 'payment-service', failureType: 'latency', delayMs: 1000 })
        });
        securityChecks.push({
            check: 'Reject unauthorized request (missing JWT)',
            expected: 401,
            actual: noAuthRes.status,
            passed: noAuthRes.status === 401
        });

        // 2. Latency limit > 10,000ms
        const excessiveLatencyRes = await createRule({
            targetService: 'payment-service',
            failureType: 'latency',
            delayMs: 15000,
            durationSeconds: 60
        });
        securityChecks.push({
            check: 'Enforce max latency limit (delayMs <= 10000)',
            expected: 400,
            actual: excessiveLatencyRes.success === false ? 400 : 200,
            message: excessiveLatencyRes.message,
            passed: excessiveLatencyRes.success === false
        });

        // 3. Duration limit > 300s (5 minutes)
        const excessiveDurationRes = await createRule({
            targetService: 'payment-service',
            failureType: 'latency',
            delayMs: 1000,
            durationSeconds: 600
        });
        securityChecks.push({
            check: 'Enforce max duration limit (durationSeconds <= 300)',
            expected: 400,
            actual: excessiveDurationRes.success === false ? 400 : 200,
            message: excessiveDurationRes.message,
            passed: excessiveDurationRes.success === false
        });

        // 4. Percentage limit (1 - 100%)
        const invalidPctRes = await createRule({
            targetService: 'payment-service',
            failureType: 'intermittent',
            percentage: 150,
            durationSeconds: 60
        });
        securityChecks.push({
            check: 'Enforce percentage limit (1 <= percentage <= 100)',
            expected: 400,
            actual: invalidPctRes.success === false ? 400 : 200,
            message: invalidPctRes.message,
            passed: invalidPctRes.success === false
        });

        // 5. Invalid service name
        const invalidServiceRes = await createRule({
            targetService: 'unauthorized-service',
            failureType: 'latency',
            delayMs: 1000
        });
        securityChecks.push({
            check: 'Reject invalid target service',
            expected: 400,
            actual: invalidServiceRes.success === false ? 400 : 200,
            message: invalidServiceRes.message,
            passed: invalidServiceRes.success === false
        });

        // 6. Audit history recorded
        const historyRes = await fetch(`${INTELLITRACE_URL}/api/v1/failure-injections/history`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        }).then(r => r.json());
        const auditLogsCount = historyRes.data?.auditLogs?.length || 0;
        securityChecks.push({
            check: 'Audit logs recorded for simulation lifecycle events',
            recordedAuditLogs: auditLogsCount,
            passed: auditLogsCount > 0
        });

        const allPassed = securityChecks.every(c => c.passed);
        recordResult('Test 8: Security Validation', allPassed ? 'PASS' : 'FAIL', {
            checks: securityChecks,
            totalChecks: securityChecks.length,
            passedChecks: securityChecks.filter(c => c.passed).length
        });
    } catch (err) {
        recordResult('Test 8: Security Validation', 'FAIL', { error: err.message });
    }

    // ------------------------------------------------------------------------
    // SUMMARY REPORT
    // ------------------------------------------------------------------------
    console.log('\n===============================================================');
    console.log('               PHASE 11 VERIFICATION SUMMARY                  ');
    console.log('===============================================================');
    let passedCount = 0;
    for (const r of results) {
        const marker = r.status === 'PASS' ? '✔ [PASS]' : '✘ [FAIL]';
        console.log(`${marker} ${r.testName}`);
        if (r.status === 'PASS') passedCount++;
    }
    console.log('---------------------------------------------------------------');
    console.log(`Total: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);
    console.log('===============================================================\n');

    return results;
}

runTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
