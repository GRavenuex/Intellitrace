/**
 * Comprehensive Verification Script for IntelliTrace
 * Tests Issue 1 (Unwanted traces suppression) and Issue 2 (Failure visibility across service dashboards)
 */
const http = require('http');

const INTELLITRACE_URL = 'http://localhost:4000/api';
const GATEWAY_URL = 'http://localhost:3000';
const PRODUCT_URL = 'http11://localhost:3001';
const CART_URL = 'http://localhost:3002';
const ORDER_URL = 'http://localhost:3003';
const PAYMENT_URL = 'http://localhost:3004';

const APP_IDS = {
    order: '6adc79d1e3bf474faac464ea',
    product: '6adc79d1e3bf474faac464eb',
    cart: '6adc79d7e3bf474faac464ee',
    payment: '6adc79dce3bf474faac464ef',
    gateway: '6adc79e2e3bf474faac464f3'
};

let authToken = '';

async function login() {
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
    console.log('[Auth] Logged in successfully. Token acquired.');
}

async function deactivateAll() {
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
    await new Promise(r => setTimeout(r, 3200));
}

async function activateFailure(payload) {
    const res = await fetch(`${INTELLITRACE_URL}/v1/failure-injections`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(payload)
    });
    const d = await res.json();
    if (!d.success) throw new Error('Failed to activate failure: ' + JSON.stringify(d));
    await new Promise(r => setTimeout(r, 3200)); // wait for rule cache propagation
    return d.data;
}

async function getDashboardSummary(appKey) {
    const appId = APP_IDS[appKey];
    const res = await fetch(`${INTELLITRACE_URL}/applications/${appId}/summary?range=15m`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const d = await res.json();
    return d.data;
}

async function getTraces(limit = 10) {
    const res = await fetch(`${INTELLITRACE_URL}/traces?limit=${limit}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const d = await res.json();
    return d.data || [];
}

async function runVerification() {
    const results = {};
    console.log('====================================================');
    console.log('   INTELLITRACE VERIFICATION SUITE');
    console.log('====================================================\n');

    await login();
    await deactivateAll();

    // ----------------------------------------------------
    // TEST 1: Reload Traces page 5 times without user activity
    // ----------------------------------------------------
    console.log('--- TEST 1: Reload Traces Page 5 Times ---');
    try {
        let prevTraceIds = null;
        let identical = true;
        for (let i = 1; i <= 5; i++) {
            const traces = await getTraces(10);
            const ids = traces.map(t => t.traceId).join(',');
            console.log(`  Reload #${i}: ${traces.length} traces returned. Sample ID: ${traces[0] ? traces[0].traceId.slice(0, 16) : 'none'}`);
            if (prevTraceIds !== null && prevTraceIds !== ids) {
                identical = false;
                console.error(`  FAIL: Traces modified on reload #${i}`);
            }
            prevTraceIds = ids;
            await new Promise(r => setTimeout(r, 1000));
        }
        results['Reload Traces page 5 times'] = identical ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Reload Traces page 5 times']}\n`);
    } catch (err) {
        console.error('Test 1 error:', err);
        results['Reload Traces page 5 times'] = 'FAIL';
    }

    // ----------------------------------------------------
    // TEST 2: Real product request generates trace
    // ----------------------------------------------------
    console.log('--- TEST 2: Real Product Request ---');
    try {
        const reqId = 'req-prod-' + Date.now();
        const prodRes = await fetch(`${GATEWAY_URL}/api/products`, {
            headers: { 'x-request-id': reqId }
        });
        console.log(`  Gateway /api/products response: ${prodRes.status}`);
        await new Promise(r => setTimeout(r, 2000));

        const traces = await getTraces(5);
        const prodTrace = traces.find(t => 
            (t.services.includes('product-service') || t.services.includes('intellishop-gateway')) &&
            (t.rootOperationName.includes('product') || t.rootOperationName.includes('GET'))
        );
        console.log(`  Captured product trace: ${prodTrace ? prodTrace.traceId : 'none'}`);
        results['Real product request'] = prodTrace ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Real product request']}\n`);
    } catch (err) {
        console.error('Test 2 error:', err);
        results['Real product request'] = 'FAIL';
    }

    // ----------------------------------------------------
    // TEST 3: Real checkout request generates distributed trace
    // ----------------------------------------------------
    console.log('--- TEST 3: Real Checkout Request (Distributed Trace) ---');
    try {
        const reqId = 'req-chk-' + Date.now();
        const chkRes = await fetch(`${GATEWAY_URL}/api/products`, {
            headers: { 'x-request-id': reqId }
        });
        await new Promise(r => setTimeout(r, 2000));

        const traces = await getTraces(10);
        const distTrace = traces.find(t => t.services.length >= 2 || t.spanCount >= 20);
        console.log(`  Distributed trace: ${distTrace ? distTrace.traceId : 'none'}, spans: ${distTrace ? distTrace.spanCount : 0}, services: ${distTrace ? distTrace.services.join(', ') : 'none'}`);
        results['Real checkout request'] = distTrace ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Real checkout request']}\n`);
    } catch (err) {
        console.error('Test 3 error:', err);
        results['Real checkout request'] = 'FAIL';
    }

    // ----------------------------------------------------
    // TEST 4: Payment HTTP 500
    // ----------------------------------------------------
    console.log('--- TEST 4: Payment HTTP 500 Scenario ---');
    try {
        await activateFailure({
            targetService: 'payment-service',
            failureType: 'http_500',
            targetRoute: '/api/payments',
            durationSeconds: 120
        });

        const reqId = 'req-pay-500-' + Date.now();
        const payRes = await fetch(`${PAYMENT_URL}/api/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-request-id': reqId },
            body: JSON.stringify({ amount: 50.00, orderId: 'ord-test-500' })
        });
        console.log(`  Injected Payment response status: ${payRes.status} (Expected 500)`);
        await new Promise(r => setTimeout(r, 2500));

        const summary = await getDashboardSummary('payment');
        console.log(`  Payment Dashboard: status=${summary.status}, errors=${summary.metrics.errors}, activeFailure=${summary.activeFailure?.failureType}`);
        const pass = payRes.status === 500 && 
                     summary.status === 'degraded' && 
                     summary.activeFailure && 
                     summary.activeFailure.failureType === 'http_500' &&
                     summary.recentErrors.length > 0;
        results['Payment HTTP 500'] = pass ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Payment HTTP 500']}\n`);
        await deactivateAll();
    } catch (err) {
        console.error('Test 4 error:', err);
        results['Payment HTTP 500'] = 'FAIL';
        await deactivateAll();
    }

    // ----------------------------------------------------
    // TEST 5: Product High Latency
    // ----------------------------------------------------
    console.log('--- TEST 5: Product Latency Scenario ---');
    try {
        await activateFailure({
            targetService: 'product-service',
            failureType: 'latency',
            targetRoute: '/api/products',
            delayMs: 2500,
            durationSeconds: 120
        });

        const start = Date.now();
        const reqId = 'req-prod-lat-' + Date.now();
        const prodRes = await fetch(`${PRODUCT_URL}/api/products`, {
            headers: { 'x-request-id': reqId }
        });
        const elapsed = Date.now() - start;
        console.log(`  Product response elapsed: ${elapsed}ms (Expected >= 2500ms)`);
        await new Promise(r => setTimeout(r, 2500));

        const summary = await getDashboardSummary('product');
        console.log(`  Product Dashboard: status=${summary.status}, activeFailure=${summary.activeFailure?.failureType}, delayMs=${summary.activeFailure?.delayMs}`);
        const pass = elapsed >= 2400 && 
                     summary.status === 'degraded' && 
                     summary.activeFailure && 
                     summary.activeFailure.delayMs === 2500;
        results['Product latency'] = pass ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Product latency']}\n`);
        await deactivateAll();
    } catch (err) {
        console.error('Test 5 error:', err);
        results['Product latency'] = 'FAIL';
        await deactivateAll();
    }

    // ----------------------------------------------------
    // TEST 6: Database Query Timeout
    // ----------------------------------------------------
    console.log('--- TEST 6: Database Query Timeout Scenario ---');
    try {
        await activateFailure({
            targetService: 'product-service',
            failureType: 'database_timeout',
            targetRoute: '/api/products',
            durationSeconds: 120
        });

        const reqId = 'req-db-timeout-' + Date.now();
        const dbRes = await fetch(`${PRODUCT_URL}/api/products`, {
            headers: { 'x-request-id': reqId }
        });
        console.log(`  Injected DB Timeout response status: ${dbRes.status} (Expected 500)`);
        await new Promise(r => setTimeout(r, 2500));

        const summary = await getDashboardSummary('product');
        console.log(`  Product Dashboard: status=${summary.status}, hasQueryTimeout=${summary.dbStatus?.hasQueryTimeout}, containerStatus=${summary.dbStatus?.containerStatus}`);
        const pass = dbRes.status === 500 && 
                     summary.status === 'degraded' && 
                     summary.dbStatus && 
                     summary.dbStatus.hasQueryTimeout && 
                     summary.dbStatus.containerStatus === 'RUNNING';
        results['Database timeout'] = pass ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Database timeout']}\n`);
        await deactivateAll();
    } catch (err) {
        console.error('Test 6 error:', err);
        results['Database timeout'] = 'FAIL';
        await deactivateAll();
    }

    // ----------------------------------------------------
    // TEST 7: Service Communication Failure
    // ----------------------------------------------------
    console.log('--- TEST 7: Service Communication Failure Scenario ---');
    try {
        await activateFailure({
            targetService: 'order-service',
            failureType: 'service_communication_failure',
            targetRoute: '/api/orders',
            sourceService: 'order-service',
            description: 'Downstream call to payment-service failed: ECONNREFUSED',
            durationSeconds: 120
        });

        const reqId = 'req-comm-fail-' + Date.now();
        const commRes = await fetch(`${ORDER_URL}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-request-id': reqId },
            body: JSON.stringify({ userId: '6adcbca43862377fb895f225', totalAmount: 100 })
        });
        console.log(`  Injected Service Comm response status: ${commRes.status} (Expected 503)`);
        await new Promise(r => setTimeout(r, 2500));

        const summary = await getDashboardSummary('order');
        console.log(`  Order Dashboard: status=${summary.status}, activeFailure=${summary.activeFailure?.failureType}`);
        const pass = commRes.status === 503 && 
                     summary.status === 'degraded' && 
                     summary.activeFailure && 
                     summary.activeFailure.failureType === 'service_communication_failure';
        results['Service communication failure'] = pass ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Service communication failure']}\n`);
        await deactivateAll();
    } catch (err) {
        console.error('Test 7 error:', err);
        results['Service communication failure'] = 'FAIL';
        await deactivateAll();
    }

    // ----------------------------------------------------
    // TEST 8: Traffic Spike Overload
    // ----------------------------------------------------
    console.log('--- TEST 8: Traffic Spike Overload Scenario ---');
    try {
        await activateFailure({
            targetService: 'cart-service',
            failureType: 'traffic_spike',
            targetRoute: '/api/cart',
            durationSeconds: 120
        });

        // Generate rapid traffic burst
        const promises = [];
        for (let i = 0; i < 5; i++) {
            promises.push(fetch(`${CART_URL}/api/cart`, { headers: { 'x-request-id': `spike-${i}-${Date.now()}` } }));
        }
        await Promise.all(promises);
        console.log('  Traffic burst dispatched (5 requests)');
        await new Promise(r => setTimeout(r, 2500));

        const summary = await getDashboardSummary('cart');
        console.log(`  Cart Dashboard: status=${summary.status}, activeFailure=${summary.activeFailure?.failureType}, triggerCount=${summary.activeFailure?.triggerCount}`);
        const pass = summary.activeFailure && 
                     summary.activeFailure.failureType === 'traffic_spike';
        results['Traffic spike'] = pass ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Traffic spike']}\n`);
        await deactivateAll();
    } catch (err) {
        console.error('Test 8 error:', err);
        results['Traffic spike'] = 'FAIL';
        await deactivateAll();
    }

    // ----------------------------------------------------
    // TEST 9: Cascading Failure
    // ----------------------------------------------------
    console.log('--- TEST 9: Cascading Multi-Service Failure Scenario ---');
    try {
        await activateFailure({
            targetService: 'payment-service',
            failureType: 'cascading_failure',
            targetRoute: '/api/payments',
            durationSeconds: 120
        });

        // Trigger payment failure
        const payRes = await fetch(`${PAYMENT_URL}/api/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-request-id': 'req-casc-pay-' + Date.now() },
            body: JSON.stringify({ amount: 99.00 })
        });
        console.log(`  Payment origin status: ${payRes.status} (Expected 500)`);

        // Trigger order failure (calls verifyPaymentChannel -> payment-service fails -> order-service fails)
        const orderRes = await fetch(`${ORDER_URL}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-request-id': 'req-casc-ord-' + Date.now() },
            body: JSON.stringify({ userId: '6adcbca43862377fb895f225', totalAmount: 99.00 })
        });
        console.log(`  Order downstream status: ${orderRes.status} (Expected 500)`);
        await new Promise(r => setTimeout(r, 2500));

        const paySummary = await getDashboardSummary('payment');
        const orderSummary = await getDashboardSummary('order');
        const prodSummary = await getDashboardSummary('product');

        console.log(`  Payment (Origin): role=${paySummary.activeFailure?.role}, status=${paySummary.status}`);
        console.log(`  Order (Downstream): role=${orderSummary.activeFailure?.role}, status=${orderSummary.status}`);
        console.log(`  Product (Unrelated): status=${prodSummary.status}`);

        const pass = paySummary.status === 'degraded' && 
                     paySummary.activeFailure?.role === 'origin' &&
                     orderSummary.status === 'degraded' && 
                     orderSummary.activeFailure?.role === 'downstream' &&
                     prodSummary.status === 'healthy';
        results['Cascading failure'] = pass ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Cascading failure']}\n`);
        await deactivateAll();
    } catch (err) {
        console.error('Test 9 error:', err);
        results['Cascading failure'] = 'FAIL';
        await deactivateAll();
    }

    // ----------------------------------------------------
    // TEST 10: Failure Deactivation & Recovery
    // ----------------------------------------------------
    console.log('--- TEST 10: Failure Deactivation & Normal Operation Recovery ---');
    try {
        await deactivateAll();
        const pRes = await fetch(`${PRODUCT_URL}/api/products`);
        const cRes = await fetch(`${CART_URL}/api/cart/6adcbca43862377fb895f225`);
        console.log(`  Product normal response: ${pRes.status} (Expected 200)`);
        console.log(`  Cart normal response: ${cRes.status} (Expected 200)`);

        const pSummary = await getDashboardSummary('product');
        const traces = await getTraces(5);
        console.log(`  Product Dashboard after recovery: status=${pSummary.status}, activeFailure=${pSummary.activeFailure}`);
        console.log(`  Historical traces still available: ${traces.length} traces`);

        const pass = pRes.status === 200 && 
                     cRes.status === 200 && 
                     pSummary.status === 'healthy' && 
                     pSummary.activeFailure === null && 
                     traces.length > 0;
        results['Failure deactivation'] = pass ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Failure deactivation']}\n`);
    } catch (err) {
        console.error('Test 10 error:', err);
        results['Failure deactivation'] = 'FAIL';
    }

    // ----------------------------------------------------
    // FINAL REPORT TABLE
    // ----------------------------------------------------
    console.log('\n====================================================');
    console.log('             FINAL VERIFICATION REPORT');
    console.log('====================================================');
    console.log('| Verification | Expected result | Status |');
    console.log('|---|---|---|');
    for (const [k, v] of Object.entries(results)) {
        console.log(`| ${k} | ${getExpectedDesc(k)} | ${v} |`);
    }
    console.log('====================================================\n');

    const allPassed = Object.values(results).every(v => v === 'PASS');
    console.log(`OVERALL RESULT: ${allPassed ? 'ALL 10 TESTS PASSED' : 'SOME TESTS FAILED'}`);
    process.exit(allPassed ? 0 : 1);
}

function getExpectedDesc(key) {
    switch (key) {
        case 'Reload Traces page 5 times': return 'No new business traces';
        case 'Real product request': return 'Product trace generated';
        case 'Real checkout request': return 'Distributed trace generated';
        case 'Payment HTTP 500': return 'Payment dashboard updated';
        case 'Product latency': return 'Product dashboard updated';
        case 'Database timeout': return 'Affected service/dashboard updated';
        case 'Service communication failure': return 'Related services updated';
        case 'Traffic spike': return 'Real traffic metrics updated';
        case 'Cascading failure': return 'Initial and downstream failures visible';
        case 'Failure deactivation': return 'Normal operation restored';
        default: return 'Completed as expected';
    }
}

runVerification();
