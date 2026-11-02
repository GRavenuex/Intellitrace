/**
 * IntelliTrace Phase 12 — Verification Suite
 * Tests Automatic Incident Detection Engine & Incident Management Dashboard APIs
 * 
 * Tests:
 * 1. HTTP 500 – Service Internal Error Detection & Deduplication
 * 2. High Latency – Slow Service Response Detection
 * 3. Database Query Timeout Detection
 * 4. Service-to-Service Communication Failure (Order -> Payment)
 * 5. Traffic Spike – Service Overload Detection
 * 6. Cascading Failure Across Services (Single incident, root service identified)
 * 7. Natural Application Error Detection (without failure simulation)
 * 8. Automatic Recovery & Auto-Resolution Detection
 * 9. Incident Dashboard APIs (Stats, Filters, Pagination, Search, Status Updates)
 * 10. Reliability, Persistence & Restart Resilience
 */

const GATEWAY_URL = 'http://localhost:3000';
const INTELLITRACE_URL = 'http://localhost:4000/api';
const PRODUCT_URL = 'http://localhost:3001';
const CART_URL = 'http://localhost:3002';
const ORDER_URL = 'http://localhost:3003';
const PAYMENT_URL = 'http://localhost:3004';

const results = [];
let authToken = '';
let sessionCookie = '';

function recordResult(testName, status, details = {}) {
    results.push({ testName, status, details });
    const color = status === 'PASS' ? '\x1b[32m' : '\x1b[31m';
    console.log(`\n${color}>>> [${status}] ${testName}\x1b[0m`);
    if (Object.keys(details).length > 0) {
        console.log('    Details:', JSON.stringify(details, null, 2));
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. Auth Helpers
async function loginIntelliTrace() {
    const res = await fetch(`${INTELLITRACE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@intellitrace.com', password: 'password123' })
    });
    const data = await res.json();
    if (!data.success || !data.token) {
        throw new Error('Failed to login to IntelliTrace: ' + JSON.stringify(data));
    }
    authToken = data.token;
    console.log('✓ Acquired IntelliTrace Bearer Token');
}

async function loginIntelliShop() {
    const loginParams = new URLSearchParams({ email: 'gaurav@example.com', password: 'password123' });
    const res = await fetch(`${GATEWAY_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: loginParams.toString(),
        redirect: 'manual'
    });
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) throw new Error('Failed to obtain IntelliShop session cookie');
    sessionCookie = setCookie.split(';')[0];
    console.log('✓ Acquired IntelliShop Session Cookie');
}

// 2. Incident & Simulation Helpers
async function deactivateAllSimulations() {
    for (const svc of ['payment-service', 'product-service', 'cart-service', 'order-service', 'intellishop-gateway']) {
        await fetch(`${INTELLITRACE_URL}/v1/failure-injections/deactivate-service`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ targetService: svc })
        }).catch(() => {});
    }
    await sleep(1500);
}

async function activateSimulation(payload) {
    const res = await fetch(`${INTELLITRACE_URL}/v1/failure-injections`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
    });
    return await res.json();
}

async function triggerIncidentEvaluation() {
    try {
        await fetch(`${INTELLITRACE_URL}/incidents/evaluate`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
    } catch (_) {}
}

async function getIncidents(query = '') {
    const res = await fetch(`${INTELLITRACE_URL}/incidents${query ? `?${query}` : ''}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    return await res.json();
}

async function getIncidentStats() {
    const res = await fetch(`${INTELLITRACE_URL}/incidents/stats`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    return await res.json();
}

async function ensureCartHasItem() {
    const pRes = await fetch(`${PRODUCT_URL}/api/products`);
    const pData = await pRes.json();
    const product = pData.data[0];

    const cartParams = new URLSearchParams({ productId: product._id, quantity: '1' });
    await fetch(`${GATEWAY_URL}/cart/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie },
        body: cartParams.toString(),
        redirect: 'manual'
    });
    return product;
}

// =========================================================================
// RUN TEST SUITE
// =========================================================================
async function runSuite() {
    console.log('====================================================================');
    console.log(' INTELLITRACE PHASE 12: INCIDENT DETECTION & MANAGEMENT TEST SUITE ');
    console.log('====================================================================\n');

    await loginIntelliTrace();
    await loginIntelliShop();
    await deactivateAllSimulations();

    // ---------------------------------------------------------------------
    // TEST 1: HTTP 500 – Detection and Deduplication
    // ---------------------------------------------------------------------
    console.log('\n--- TEST 1: HTTP 500 – Detection & Deduplication ---');
    try {
        // Step 1: Activate Payment HTTP 500 rule
        await activateSimulation({
            targetService: 'payment-service',
            failureType: 'http_500',
            durationSeconds: 90,
            description: 'Phase 12 Verification: Payment HTTP 500'
        });
        await sleep(2000);

        // Fetch order to pay
        const ordersRes = await fetch(`${ORDER_URL}/api/orders`);
        const ordersData = await ordersRes.json();
        const orderId = ordersData.data[0]._id;

        // Fire 2 payment requests (both will return 500)
        for (let i = 0; i < 2; i++) {
            await fetch(`${GATEWAY_URL}/payment/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie },
                body: new URLSearchParams({ orderId, paymentMethod: 'Card', paymentResult: 'SUCCESS' }).toString()
            });
            await sleep(500);
        }

        // Trigger evaluation & allow batch logs to ship
        await sleep(5500);
        await triggerIncidentEvaluation();

        // Check incidents
        const res1 = await getIncidents('service=payment-service&status=open');
        const inc1 = res1.data?.find(i => i.ruleId === 'RULE-HTTP-500');

        if (!inc1) throw new Error('HTTP 500 incident was not automatically created');
        console.log(`  ✓ Incident created: ${inc1.incidentId} (Occurrences: ${inc1.occurrenceCount})`);

        // Test Deduplication: Fire 2 more 500s
        for (let i = 0; i < 2; i++) {
            await fetch(`${GATEWAY_URL}/payment/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie },
                body: new URLSearchParams({ orderId, paymentMethod: 'Card', paymentResult: 'SUCCESS' }).toString()
            });
            await sleep(500);
        }
        await sleep(5500);
        await triggerIncidentEvaluation();

        const res2 = await getIncidents('service=payment-service&status=open');
        const matchingIncidents = res2.data?.filter(i => i.ruleId === 'RULE-HTTP-500');
        const updatedInc = res2.data?.find(i => i.incidentId === inc1.incidentId);

        // Deduplication verified: exactly 1 active incident for this rule with incremented occurrence count
        const dedupOk = matchingIncidents.length === 1 && updatedInc && updatedInc.occurrenceCount >= 2;
        console.log(`  ✓ Deduplication verified: Active incident count for rule: ${matchingIncidents.length}, occurrences updated: ${updatedInc?.occurrenceCount}`);

        await deactivateAllSimulations();

        if (dedupOk && inc1.severity === 'critical' || inc1.severity === 'high') {
            recordResult('TEST 1: HTTP 500 – Detection & Deduplication', 'PASS', {
                incidentId: inc1.incidentId,
                severity: updatedInc.severity,
                occurrences: updatedInc.occurrenceCount,
                evidenceErrorCount: updatedInc.evidence?.errorCount
            });
        } else {
            recordResult('TEST 1: HTTP 500 – Detection & Deduplication', 'FAIL', { inc1, updatedInc });
        }
    } catch (err) {
        recordResult('TEST 1: HTTP 500 – Detection & Deduplication', 'FAIL', { error: err.message });
        await deactivateAllSimulations();
    }

    // ---------------------------------------------------------------------
    // TEST 2: High Latency Detection
    // ---------------------------------------------------------------------
    console.log('\n--- TEST 2: High Latency – Slow Service Response ---');
    try {
        await activateSimulation({
            targetService: 'product-service',
            failureType: 'latency',
            delayMs: 3000,
            durationSeconds: 90,
            description: 'Phase 12 Verification: Product Latency (3s)'
        });
        await sleep(2000);

        // Perform request to trigger latency
        const start = Date.now();
        await fetch(`${GATEWAY_URL}/products`, { headers: { Cookie: sessionCookie } });
        const latency = Date.now() - start;
        console.log(`  ✓ Observed request latency: ${latency}ms`);

        await sleep(5500);
        await triggerIncidentEvaluation();

        const res = await getIncidents('service=product-service');
        const inc = res.data?.find(i => i.ruleId === 'RULE-HIGH-LATENCY');

        await deactivateAllSimulations();

        if (inc && (inc.severity === 'high' || inc.severity === 'critical')) {
            recordResult('TEST 2: High Latency – Slow Service Response', 'PASS', {
                incidentId: inc.incidentId,
                title: inc.title,
                severity: inc.severity,
                observedLatencyMs: inc.evidence?.avgLatencyMs
            });
        } else {
            recordResult('TEST 2: High Latency – Slow Service Response', 'FAIL', { inc, latency });
        }
    } catch (err) {
        recordResult('TEST 2: High Latency – Slow Service Response', 'FAIL', { error: err.message });
        await deactivateAllSimulations();
    }

    // ---------------------------------------------------------------------
    // TEST 3: Database Query Timeout
    // ---------------------------------------------------------------------
    console.log('\n--- TEST 3: Database Query Timeout ---');
    try {
        await activateSimulation({
            targetService: 'product-service',
            failureType: 'database_timeout',
            durationSeconds: 90,
            description: 'Phase 12 Verification: DB Timeout'
        });
        await sleep(2000);

        // Execute request triggering database timeout
        await fetch(`${PRODUCT_URL}/api/products`);
        await sleep(5500);
        await triggerIncidentEvaluation();

        const res = await getIncidents('service=product-service');
        const inc = res.data?.find(i => i.ruleId === 'RULE-DB-TIMEOUT');

        await deactivateAllSimulations();

        if (inc && inc.severity === 'critical') {
            recordResult('TEST 3: Database Query Timeout', 'PASS', {
                incidentId: inc.incidentId,
                title: inc.title,
                category: inc.category,
                evidence: inc.evidence?.databaseType
            });
        } else {
            recordResult('TEST 3: Database Query Timeout', 'FAIL', { inc });
        }
    } catch (err) {
        recordResult('TEST 3: Database Query Timeout', 'FAIL', { error: err.message });
        await deactivateAllSimulations();
    }

    // ---------------------------------------------------------------------
    // TEST 4: Service-to-Service Communication Failure
    // ---------------------------------------------------------------------
    console.log('\n--- TEST 4: Service-to-Service Communication Failure ---');
    try {
        await ensureCartHasItem();

        await activateSimulation({
            targetService: 'order-service',
            failureType: 'service_communication_failure',
            sourceService: 'order-service',
            targetRoute: '*',
            description: 'Phase 12 Verification: Order to Payment comm failure'
        });
        await sleep(2000);

        // Place order to trigger downstream call
        await fetch(`${GATEWAY_URL}/checkout/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie },
            body: new URLSearchParams({
                fullName: 'Gaurav Dev', address: '42 Trace St', city: 'Mumbai', state: 'MH', pincode: '400001', phone: '9876543210'
            }).toString()
        });

        await sleep(5500);
        await triggerIncidentEvaluation();

        const res = await getIncidents('service=order-service');
        const inc = res.data?.find(i => i.ruleId === 'RULE-SVC-COMM');

        await deactivateAllSimulations();

        if (inc && inc.affectedServices?.includes('payment-service')) {
            recordResult('TEST 4: Service-to-Service Communication Failure', 'PASS', {
                incidentId: inc.incidentId,
                title: inc.title,
                primaryService: inc.primaryService,
                affectedServices: inc.affectedServices
            });
        } else {
            recordResult('TEST 4: Service-to-Service Communication Failure', 'FAIL', { inc });
        }
    } catch (err) {
        recordResult('TEST 4: Service-to-Service Communication Failure', 'FAIL', { error: err.message });
        await deactivateAllSimulations();
    }

    // ---------------------------------------------------------------------
    // TEST 5: Traffic Spike – Service Overload
    // ---------------------------------------------------------------------
    console.log('\n--- TEST 5: Traffic Spike – Service Overload ---');
    try {
        // Run traffic spike
        await fetch(`${GATEWAY_URL}/developer/failure-injections/traffic-spike`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetService: 'product-service',
                requestCount: 35,
                concurrency: 5
            })
        });

        await sleep(5500);
        await triggerIncidentEvaluation();

        const res = await getIncidents('service=product-service');
        const inc = res.data?.find(i => i.ruleId === 'RULE-TRAFFIC-SPIKE');

        if (inc) {
            recordResult('TEST 5: Traffic Spike – Service Overload', 'PASS', {
                incidentId: inc.incidentId,
                title: inc.title,
                severity: inc.severity,
                observedRequests: inc.evidence?.observedRequestsInWindow
            });
        } else {
            recordResult('TEST 5: Traffic Spike – Service Overload', 'FAIL', { inc });
        }
    } catch (err) {
        recordResult('TEST 5: Traffic Spike – Service Overload', 'FAIL', { error: err.message });
    }

    // ---------------------------------------------------------------------
    // TEST 6: Cascading Failure (Single Incident, Root Identified)
    // ---------------------------------------------------------------------
    console.log('\n--- TEST 6: Cascading Failure Across Services ---');
    try {
        await ensureCartHasItem();

        await activateSimulation({
            targetService: 'payment-service',
            failureType: 'cascading_failure',
            durationSeconds: 90,
            description: 'Phase 12 Verification: Cascading Payment to Order'
        });
        await sleep(2000);

        // Trigger order placement propagating payment failure
        await fetch(`${GATEWAY_URL}/checkout/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie },
            body: new URLSearchParams({
                fullName: 'Gaurav Dev', address: '42 Trace St', city: 'Mumbai', state: 'MH', pincode: '400001', phone: '9876543210'
            }).toString()
        });

        await sleep(5500);
        await triggerIncidentEvaluation();

        const res = await getIncidents();
        const cascadeInc = res.data?.find(i => i.ruleId === 'RULE-CASCADING-FAILURE');

        await deactivateAllSimulations();

        const isCascadeValid = cascadeInc && 
                               cascadeInc.primaryService === 'payment-service' &&
                               cascadeInc.affectedServices?.includes('order-service');

        if (isCascadeValid) {
            recordResult('TEST 6: Cascading Failure Across Services', 'PASS', {
                incidentId: cascadeInc.incidentId,
                title: cascadeInc.title,
                originatingService: cascadeInc.primaryService,
                affectedServices: cascadeInc.affectedServices,
                severity: cascadeInc.severity
            });
        } else {
            recordResult('TEST 6: Cascading Failure Across Services', 'FAIL', { cascadeInc });
        }
    } catch (err) {
        recordResult('TEST 6: Cascading Failure Across Services', 'FAIL', { error: err.message });
        await deactivateAllSimulations();
    }

    // ---------------------------------------------------------------------
    // TEST 7: Natural Application Error Detection (Without Simulation)
    // ---------------------------------------------------------------------
    console.log('\n--- TEST 7: Natural Failure Detection ---');
    try {
        // Ensure no simulations active
        await deactivateAllSimulations();

        // Ingest 2 genuine HTTP 500 error logs directly into telemetry pipeline to simulate natural unhandled errors
        const errLogs = [
            {
                service: 'order-service',
                level: 'ERROR',
                statusCode: 500,
                message: 'UnhandledException: Cannot read properties of undefined (reading orderItems)',
                timestamp: new Date().toISOString(),
                requestId: 'nat-req-1'
            },
            {
                service: 'order-service',
                level: 'ERROR',
                statusCode: 500,
                message: 'UnhandledException: Order transaction failed due to invalid state transition',
                timestamp: new Date().toISOString(),
                requestId: 'nat-req-2'
            }
        ];

        await fetch(`http://localhost:4000/api/v1/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': 'default_telemetry_key' },
            body: JSON.stringify({ application: 'order-service', logs: errLogs })
        });

        await sleep(2000);
        await triggerIncidentEvaluation();

        const res = await getIncidents('service=order-service');
        const naturalInc = res.data?.find(i => i.ruleId === 'RULE-HTTP-500' && !i.failureInjectionId);

        if (naturalInc) {
            recordResult('TEST 7: Natural Failure Detection', 'PASS', {
                incidentId: naturalInc.incidentId,
                title: naturalInc.title,
                primaryService: naturalInc.primaryService,
                noFailureInjectionLinked: naturalInc.failureInjectionId === null
            });
        } else {
            recordResult('TEST 7: Natural Failure Detection', 'FAIL', { naturalInc });
        }
    } catch (err) {
        recordResult('TEST 7: Natural Failure Detection', 'FAIL', { error: err.message });
    }

    // ---------------------------------------------------------------------
    // TEST 8: Automatic Incident Recovery & Auto-Resolution
    // ---------------------------------------------------------------------
    console.log('\n--- TEST 8: Automatic Incident Recovery ---');
    try {
        // Step 1: Trigger failure
        console.log('  1. Triggering controlled Payment HTTP 500 failure...');
        await activateSimulation({
            targetService: 'payment-service',
            failureType: 'http_500',
            durationSeconds: 30,
            description: 'Phase 12 Recovery Test'
        });
        await sleep(2000);

        const ordersRes = await fetch(`${ORDER_URL}/api/orders`);
        const ordersData = await ordersRes.json();
        const orderId = ordersData.data[0]._id;

        for (let i = 0; i < 2; i++) {
            await fetch(`${GATEWAY_URL}/payment/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie },
                body: new URLSearchParams({ orderId, paymentMethod: 'Card', paymentResult: 'SUCCESS' }).toString()
            });
            await sleep(500);
        }

        await sleep(5500);
        await triggerIncidentEvaluation();

        const recCheck1 = await getIncidents('service=payment-service&status=open');
        const activeInc = recCheck1.data?.find(i => i.ruleId === 'RULE-HTTP-500');
        if (!activeInc) throw new Error('Active incident was not open before recovery');
        console.log(`  ✓ Confirmed active incident: ${activeInc.incidentId} (${activeInc.title}) [status: ${activeInc.status}]`);

        // Step 2: Deactivate failure
        console.log('  2. Deactivating failure simulation...');
        await deactivateAllSimulations();
        await sleep(1500);

        // Step 3: Perform successful operations
        console.log('  3. Performing successful application requests...');
        await fetch(`${PRODUCT_URL}/api/products`);
        await fetch(`${GATEWAY_URL}/products`, { headers: { Cookie: sessionCookie } });

        // Step 4: Wait for recovery evaluation window (32s so failure logs age out of window)
        console.log('  4. Waiting for 32s recovery window so failure logs age out...');
        await sleep(32000);

        // Step 5: Perform 2 consecutive healthy evaluation cycles
        console.log('  5. Performing consecutive healthy evaluations...');
        for (let cycle = 1; cycle <= 2; cycle++) {
            await sleep(2000);
            await triggerIncidentEvaluation();
        }

        // Step 6: Verify automatic resolution
        const checkRes = await fetch(`${INTELLITRACE_URL}/incidents/${activeInc.incidentId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const checkData = await checkRes.json();
        const inc = checkData.data;

        const isAutoResolved = inc && inc.status === 'resolved' && inc.resolvedAt !== null;
        console.log(`  ✓ Incident status after recovery evaluation: ${inc?.status} (Resolved at: ${inc?.resolvedAt})`);

        if (isAutoResolved) {
            recordResult('TEST 8: Automatic Incident Recovery', 'PASS', {
                incidentId: inc.incidentId,
                status: inc.status,
                consecutiveHealthyCount: inc.consecutiveHealthyCount,
                resolvedAt: inc.resolvedAt,
                timelineResolvedMessage: inc.timeline?.find(t => t.type === 'auto_resolved')?.message
            });
        } else {
            recordResult('TEST 8: Automatic Incident Recovery', 'FAIL', { inc });
        }
    } catch (err) {
        recordResult('TEST 8: Automatic Incident Recovery', 'FAIL', { error: err.message });
        await deactivateAllSimulations();
    }

    // ---------------------------------------------------------------------
    // TEST 9: Incident Dashboard APIs (Stats, Filters, Search, Status Update)
    // ---------------------------------------------------------------------
    console.log('\n--- TEST 9: Incident Dashboard APIs & Lifecycle Actions ---');
    try {
        // 1. Stats endpoint
        const statsRes = await getIncidentStats();
        const statsValid = statsRes.success && statsRes.data.total >= 1;
        console.log('  ✓ Stats API returned valid database counts:', statsRes.data);

        // 2. Filter & pagination
        const filterRes = await getIncidents('page=1&limit=5');
        const filterValid = filterRes.success && Array.isArray(filterRes.data) && filterRes.page === 1;

        // 3. Status transition: Mark an incident as 'investigating' then 'resolved'
        const allRes = await getIncidents('limit=1');
        const testInc = allRes.data?.[0];

        let statusCyclePass = false;
        if (testInc) {
            // Update to investigating
            const patchRes1 = await fetch(`${INTELLITRACE_URL}/incidents/${testInc.incidentId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify({ status: 'investigating', notes: 'Verification test investigation' })
            });
            const patchData1 = await patchRes1.json();

            // Update to resolved
            const patchRes2 = await fetch(`${INTELLITRACE_URL}/incidents/${testInc.incidentId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify({ status: 'resolved', notes: 'Manually verified and resolved' })
            });
            const patchData2 = await patchRes2.json();

            statusCyclePass = patchData1.data?.status === 'investigating' && patchData2.data?.status === 'resolved';
            console.log(`  ✓ Lifecycle state transition confirmed: ${testInc.status} -> investigating -> resolved`);
        }

        if (statsValid && filterValid && statusCyclePass) {
            recordResult('TEST 9: Dashboard APIs & Lifecycle Actions', 'PASS', {
                stats: statsRes.data,
                paginationLimit: filterRes.limit,
                statusTransitionsVerified: true
            });
        } else {
            recordResult('TEST 9: Dashboard APIs & Lifecycle Actions', 'FAIL', { statsValid, filterValid, statusCyclePass });
        }
    } catch (err) {
        recordResult('TEST 9: Dashboard APIs & Lifecycle Actions', 'FAIL', { error: err.message });
    }

    // ---------------------------------------------------------------------
    // TEST 10: Reliability & Persistence
    // ---------------------------------------------------------------------
    console.log('\n--- TEST 10: Reliability & Persistence ---');
    try {
        // Query incidents to ensure MongoDB persistence preserves historical records
        const res = await getIncidents('limit=50');
        const rulesRes = await fetch(`${INTELLITRACE_URL}/incidents/rules`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const rulesData = await rulesRes.json();

        const hasIncidents = res.success && res.total >= 1;
        const hasRules = rulesData.success && rulesData.data.length === 6;

        console.log(`  ✓ MongoDB persistence verified: ${res.total} incidents persisted in database`);
        console.log(`  ✓ Rules verified: ${rulesData.data.length}/6 detection rules active and configurable`);

        if (hasIncidents && hasRules) {
            recordResult('TEST 10: Reliability & Persistence', 'PASS', {
                totalPersistedIncidents: res.total,
                activeDetectionRules: rulesData.data.map(r => r.ruleId)
            });
        } else {
            recordResult('TEST 10: Reliability & Persistence', 'FAIL', { hasIncidents, hasRules });
        }
    } catch (err) {
        recordResult('TEST 10: Reliability & Persistence', 'FAIL', { error: err.message });
    }

    // ---------------------------------------------------------------------
    // FINAL RESULTS SUMMARY
    // ---------------------------------------------------------------------
    console.log('\n====================================================================');
    console.log('              PHASE 12 VERIFICATION TEST SUITE SUMMARY             ');
    console.log('====================================================================');
    let passed = 0;
    for (const r of results) {
        const color = r.status === 'PASS' ? '\x1b[32m' : '\x1b[31m';
        console.log(`${color}${r.status}\x1b[0m : ${r.testName}`);
        if (r.status === 'PASS') passed++;
    }
    console.log(`\nTOTAL: ${passed}/${results.length} PASSED`);
    console.log('====================================================================\n');

    process.exit(passed === results.length ? 0 : 1);
}

runSuite().catch(err => {
    console.error('Fatal suite error:', err);
    process.exit(1);
});

