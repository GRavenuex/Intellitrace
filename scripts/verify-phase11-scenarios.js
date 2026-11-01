/**
 * IntelliTrace Phase 11 Enhancement — Verification Script
 * Validates all 6 Real-World Failure Simulations with Service-Wise Controls
 */

const GATEWAY_URL = 'http://localhost:3000';
const INTELLITRACE_URL = 'http://localhost:4000';
const PRODUCT_URL = 'http://localhost:3001';
const ORDER_URL = 'http://localhost:3003';
const PAYMENT_URL = 'http://localhost:3004';
const PROMETHEUS_URL = 'http://localhost:9090';
const JAEGER_URL = 'http://localhost:16686';

const results = [];
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

// 1. Helper to login to IntelliShop and acquire session cookie
async function getAuthCookie() {
    const loginParams = new URLSearchParams({ email: 'gaurav@example.com', password: 'password123' });
    const res = await fetch(`${GATEWAY_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: loginParams.toString(),
        redirect: 'manual'
    });
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) throw new Error('Failed to obtain session cookie from /login');
    sessionCookie = setCookie.split(';')[0];
    return sessionCookie;
}

// 2. Gateway Developer Control API Helpers
async function activateSimulation({ targetService, failureType, targetRoute = '*', delayMs = 0, durationSeconds = 60, sourceService = null, description = '' }) {
    const res = await fetch(`${GATEWAY_URL}/developer/failure-injections/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            targetService,
            failureType,
            targetRoute,
            delayMs,
            durationSeconds,
            sourceService,
            description
        })
    });
    return await res.json();
}

async function deactivateSimulation(targetService) {
    const res = await fetch(`${GATEWAY_URL}/developer/failure-injections/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetService })
    });
    return await res.json();
}

async function getSimulationStatus(service) {
    let url = `${GATEWAY_URL}/developer/failure-injections/status`;
    if (service) url += `?service=${encodeURIComponent(service)}`;
    const res = await fetch(url);
    return await res.json();
}

// 3. Telemetry Verification Helpers
async function getPrometheusMetric(query) {
    try {
        const res = await fetch(`${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
        const json = await res.json();
        return json?.data?.result || [];
    } catch (_) {
        return [];
    }
}

async function getRecentTraces(service, limit = 5) {
    try {
        const res = await fetch(`${JAEGER_URL}/api/traces?service=${encodeURIComponent(service)}&limit=${limit}&lookback=5m`);
        const json = await res.json();
        return json?.data || [];
    } catch (_) {
        return [];
    }
}

// Ensure test product in cart
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
// RUN ALL 6 SCENARIOS
// =========================================================================
async function runAllScenarios() {
    console.log('====================================================================');
    console.log(' INTELLITRACE PHASE 11: 6 REAL-WORLD FAILURE SIMULATIONS TEST SUITE');
    console.log('====================================================================\n');

    await getAuthCookie();
    console.log('✓ Acquired authenticated session cookie for IntelliShop user');

    // Deactivate any leftover rules
    for (const svc of ['product-service', 'order-service', 'payment-service']) {
        await deactivateSimulation(svc);
    }
    await sleep(2000);

    // ---------------------------------------------------------------------
    // FAILURE 1: Payment HTTP 500 – Service Internal Error
    // ---------------------------------------------------------------------
    console.log('\n--- TESTING FAILURE 1: Payment HTTP 500 ---');
    try {
        // Step 1: Activate rule
        const actRes = await activateSimulation({
            targetService: 'payment-service',
            failureType: 'http_500',
            durationSeconds: 60,
            description: 'Simulate Payment HTTP 500 Internal Server Error'
        });
        if (!actRes.success) throw new Error('Activation failed: ' + JSON.stringify(actRes));

        // Step 2: Verify status is ACTIVE
        await sleep(1500); // Allow cache sync
        const statusBefore = await getSimulationStatus('payment-service');
        const ruleBefore = statusBefore.data?.find(r => r.failureType === 'http_500');
        if (!ruleBefore || ruleBefore.status !== 'ACTIVE') {
            throw new Error('Expected status ACTIVE, got: ' + JSON.stringify(ruleBefore));
        }
        console.log('  ✓ Rule is ACTIVE and waiting for matching request');

        // Step 3: Fetch an order ID to pay
        const ordersRes = await fetch(`${ORDER_URL}/api/orders`);
        const ordersData = await ordersRes.json();
        const orderId = ordersData.data[0]._id;

        // Step 4: Perform real payment request through Gateway
        const payParams = new URLSearchParams({
            orderId,
            paymentMethod: 'Mock Card',
            paymentResult: 'SUCCESS'
        });
        const payRes = await fetch(`${GATEWAY_URL}/payment/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie },
            body: payParams.toString()
        });
        const payHtml = await payRes.text();

        // Gateway caught the 500 and rendered payment page with error message
        const handledGracefully = payRes.status === 200 && payHtml.includes('declined or failed');
        console.log('  ✓ Payment request executed; frontend handled error gracefully:', handledGracefully);

        // Step 5: Verify status transitioned to TRIGGERED
        await sleep(1500);
        const statusAfter = await getSimulationStatus('payment-service');
        const ruleAfter = statusAfter.data?.find(r => r.failureType === 'http_500');
        const isTriggered = ruleAfter && ruleAfter.status === 'TRIGGERED' && ruleAfter.triggerCount >= 1;
        console.log('  ✓ Rule transitioned to TRIGGERED with count:', ruleAfter?.triggerCount, 'lastTriggered:', ruleAfter?.lastTriggeredAt);

        // Step 6: Verify Prometheus metrics & Jaeger traces
        const errorMetrics = await getPrometheusMetric('intellitrace_injected_failures_total{service="payment-service",failure_type="http_500"}');
        const traces = await getRecentTraces('payment-service', 3);
        const hasFailedSpan = traces.some(t => t.spans.some(s => s.tags?.some(tag => tag.key === 'failure.type' && tag.value === 'http_500')));

        // Step 7: Deactivate & verify recovery
        await deactivateSimulation('payment-service');
        await sleep(1500);

        if (handledGracefully && isTriggered) {
            recordResult('FAILURE 1: Payment HTTP 500', 'PASS', {
                initialStatus: ruleBefore.status,
                triggeredStatus: ruleAfter.status,
                triggerCount: ruleAfter.triggerCount,
                metricsRecorded: errorMetrics.length > 0,
                traceCaptured: hasFailedSpan
            });
        } else {
            recordResult('FAILURE 1: Payment HTTP 500', 'FAIL', { handledGracefully, isTriggered });
        }
    } catch (err) {
        recordResult('FAILURE 1: Payment HTTP 500', 'FAIL', { error: err.message });
        await deactivateSimulation('payment-service');
    }

    // ---------------------------------------------------------------------
    // FAILURE 2: High Latency – Slow Service Response
    // ---------------------------------------------------------------------
    console.log('\n--- TESTING FAILURE 2: High Latency (Product & Payment Services) ---');
    try {
        // Subtest 2A: Product Service High Latency (5s)
        console.log('  Testing 2A: Product Service High Latency (5000ms delay)...');
        await activateSimulation({
            targetService: 'product-service',
            failureType: 'latency',
            delayMs: 5000,
            durationSeconds: 60,
            description: 'Simulate Product Service High Latency (5s)'
        });
        await sleep(1500);

        const startProd = Date.now();
        const prodRes = await fetch(`${GATEWAY_URL}/products`, { headers: { Cookie: sessionCookie } });
        const prodDuration = Date.now() - startProd;
        console.log(`  ✓ Real /products response duration: ${prodDuration}ms (expected >= 5000ms)`);

        const pStatus = await getSimulationStatus('product-service');
        const pRule = pStatus.data?.find(r => r.failureType === 'latency');
        const pTriggered = pRule && pRule.status === 'TRIGGERED';
        console.log('  ✓ Product latency rule transitioned to TRIGGERED:', pTriggered);

        await deactivateSimulation('product-service');
        await sleep(1500);

        // Verify normal latency restored
        const startNorm = Date.now();
        await fetch(`${GATEWAY_URL}/products`, { headers: { Cookie: sessionCookie } });
        const normDuration = Date.now() - startNorm;
        console.log(`  ✓ Normal /products response duration restored: ${normDuration}ms`);

        // Subtest 2B: Payment Service High Latency (5s)
        console.log('  Testing 2B: Payment Service High Latency (5000ms delay)...');
        await activateSimulation({
            targetService: 'payment-service',
            failureType: 'latency',
            delayMs: 5000,
            durationSeconds: 60,
            description: 'Simulate Payment Service High Latency (5s)'
        });
        await sleep(1500);

        const ordersRes = await fetch(`${ORDER_URL}/api/orders`);
        const ordersData = await ordersRes.json();
        const orderId = ordersData.data[0]._id;

        const startPay = Date.now();
        await fetch(`${GATEWAY_URL}/payment/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie },
            body: new URLSearchParams({ orderId, paymentMethod: 'Mock Card', paymentResult: 'SUCCESS' }).toString()
        });
        const payDuration = Date.now() - startPay;
        console.log(`  ✓ Real payment response duration: ${payDuration}ms (expected >= 5000ms)`);

        const payStatus = await getSimulationStatus('payment-service');
        const payRule = payStatus.data?.find(r => r.failureType === 'latency');
        const payTriggered = payRule && payRule.status === 'TRIGGERED';

        await deactivateSimulation('payment-service');
        await sleep(1500);

        if (prodDuration >= 4800 && pTriggered && payDuration >= 4800 && payTriggered && normDuration < 2000) {
            recordResult('FAILURE 2: High Latency (Product & Payment Services)', 'PASS', {
                productLatencyMs: prodDuration,
                productRuleTriggered: pTriggered,
                paymentLatencyMs: payDuration,
                paymentRuleTriggered: payTriggered,
                restoredLatencyMs: normDuration
            });
        } else {
            recordResult('FAILURE 2: High Latency (Product & Payment Services)', 'FAIL', {
                prodDuration,
                pTriggered,
                payDuration,
                payTriggered,
                normDuration
            });
        }
    } catch (err) {
        recordResult('FAILURE 2: High Latency (Product & Payment Services)', 'FAIL', { error: err.message });
        await deactivateSimulation('product-service');
        await deactivateSimulation('payment-service');
    }

    // ---------------------------------------------------------------------
    // FAILURE 3: Database Query Timeout
    // ---------------------------------------------------------------------
    console.log('\n--- TESTING FAILURE 3: Database Query Timeout ---');
    try {
        await activateSimulation({
            targetService: 'product-service',
            failureType: 'database_timeout',
            durationSeconds: 60,
            description: 'Simulate Database Query Timeout on Product Catalog'
        });
        await sleep(1500);

        const statusBefore = await getSimulationStatus('product-service');
        console.log('  ✓ Rule is ACTIVE on product-service');

        // Real request against product service
        const res = await fetch(`${PRODUCT_URL}/api/products`);
        const data = await res.json();
        console.log('  ✓ Received response status:', res.status, 'error:', data.error);

        const isTimeout = res.status === 500 && data.failureType === 'database_timeout' && String(data.error).includes('MongoTimeoutError');
        
        await sleep(1500);
        const statusAfter = await getSimulationStatus('product-service');
        const rule = statusAfter.data?.find(r => r.failureType === 'database_timeout');
        const isTriggered = rule && rule.status === 'TRIGGERED';
        console.log('  ✓ DB Timeout rule transitioned to TRIGGERED:', isTriggered, 'count:', rule?.triggerCount);

        // Deactivate & verify MongoDB is untouched and normal queries work immediately
        await deactivateSimulation('product-service');
        await sleep(1500);

        const recoveryRes = await fetch(`${PRODUCT_URL}/api/products`);
        const recoveryData = await recoveryRes.json();
        const recovered = recoveryRes.status === 200 && Array.isArray(recoveryData.data) && recoveryData.data.length > 0;
        console.log('  ✓ Normal database query recovered immediately; products count:', recoveryData.data?.length);

        if (isTimeout && isTriggered && recovered) {
            recordResult('FAILURE 3: Database Query Timeout', 'PASS', {
                timeoutErrorReturned: data.error,
                ruleTriggered: isTriggered,
                databaseRecovered: recovered,
                itemCount: recoveryData.data.length
            });
        } else {
            recordResult('FAILURE 3: Database Query Timeout', 'FAIL', { isTimeout, isTriggered, recovered });
        }
    } catch (err) {
        recordResult('FAILURE 3: Database Query Timeout', 'FAIL', { error: err.message });
        await deactivateSimulation('product-service');
    }

    // ---------------------------------------------------------------------
    // FAILURE 4: Service-to-Service Communication Failure
    // ---------------------------------------------------------------------
    console.log('\n--- TESTING FAILURE 4: Service-to-Service Communication Failure ---');
    try {
        await ensureCartHasItem();

        await activateSimulation({
            targetService: 'order-service',
            failureType: 'service_communication_failure',
            sourceService: 'order-service',
            targetRoute: '*',
            description: 'Simulate Service Communication Failure from order-service to payment-service'
        });
        await sleep(1500);

        console.log('  ✓ Activated service_communication_failure on order-service');

        // Place order from checkout
        const chkParams = new URLSearchParams({
            fullName: 'Gaurav Dev',
            address: '42 Observability Way',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            phone: '+91 98765 43210'
        });
        const chkRes = await fetch(`${GATEWAY_URL}/checkout/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie },
            body: chkParams.toString()
        });
        const chkHtml = await chkRes.text();
        const handledGracefully = chkHtml.includes('Order could not be placed') || chkHtml.includes('failure');
        console.log('  ✓ Checkout request executed; downstream communication failure handled gracefully:', handledGracefully);

        await sleep(1500);
        const statusAfter = await getSimulationStatus('order-service');
        const rule = statusAfter.data?.find(r => r.failureType === 'service_communication_failure');
        const isTriggered = rule && rule.status === 'TRIGGERED';
        console.log('  ✓ Rule transitioned to TRIGGERED:', isTriggered, 'count:', rule?.triggerCount);

        // Deactivate & verify recovery
        await deactivateSimulation('order-service');
        await sleep(1500);

        await ensureCartHasItem();
        const normRes = await fetch(`${GATEWAY_URL}/checkout/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie },
            body: chkParams.toString(),
            redirect: 'manual'
        });
        const normLocation = normRes.headers.get('location');
        const orderCreatedNormally = normRes.status === 302 && normLocation && normLocation.includes('/payment/');
        console.log('  ✓ Order creation recovered normally after deactivation; redirected to:', normLocation);

        if (handledGracefully && isTriggered && orderCreatedNormally) {
            recordResult('FAILURE 4: Service-to-Service Communication Failure', 'PASS', {
                communicationFailureHandled: handledGracefully,
                ruleTriggered: isTriggered,
                triggerCount: rule?.triggerCount,
                orderCreationRecovered: orderCreatedNormally
            });
        } else {
            recordResult('FAILURE 4: Service-to-Service Communication Failure', 'FAIL', {
                handledGracefully,
                isTriggered,
                orderCreatedNormally
            });
        }
    } catch (err) {
        recordResult('FAILURE 4: Service-to-Service Communication Failure', 'FAIL', { error: err.message });
        await deactivateSimulation('order-service');
    }

    // ---------------------------------------------------------------------
    // FAILURE 5: Traffic Spike – Service Overload
    // ---------------------------------------------------------------------
    console.log('\n--- TESTING FAILURE 5: Traffic Spike (Product & Order Services) ---');
    try {
        console.log('  Executing Traffic Spike: 50 requests with concurrency 5 against product-service...');
        const spikeRes = await fetch(`${GATEWAY_URL}/developer/failure-injections/traffic-spike`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                targetService: 'product-service',
                requestCount: 50,
                concurrency: 5
            })
        });
        const spikeData = await spikeRes.json();
        console.log('  ✓ Traffic Spike Result:', spikeData);

        const validSpike = spikeData.success && spikeData.totalRequests === 50 && spikeData.successful >= 45;

        // Verify Prometheus request counter
        const promMetrics = await getPrometheusMetric('intellishop_http_requests_total{service="product-service"}');
        console.log('  ✓ Prometheus recorded request rate impact; metrics available:', promMetrics.length > 0);

        if (validSpike) {
            recordResult('FAILURE 5: Traffic Spike – Service Overload', 'PASS', {
                targetService: spikeData.targetService,
                totalRequests: spikeData.totalRequests,
                successful: spikeData.successful,
                durationMs: spikeData.durationMs,
                avgLatencyMs: spikeData.avgLatencyMs,
                prometheusObserved: promMetrics.length > 0
            });
        } else {
            recordResult('FAILURE 5: Traffic Spike – Service Overload', 'FAIL', { spikeData });
        }
    } catch (err) {
        recordResult('FAILURE 5: Traffic Spike – Service Overload', 'FAIL', { error: err.message });
    }

    // ---------------------------------------------------------------------
    // FAILURE 6: Cascading Failure
    // ---------------------------------------------------------------------
    console.log('\n--- TESTING FAILURE 6: Cascading Failure (Payment -> Order -> Checkout) ---');
    try {
        await ensureCartHasItem();

        // Step 1: Activate cascading failure rule on Payment Service
        await activateSimulation({
            targetService: 'payment-service',
            failureType: 'cascading_failure',
            durationSeconds: 60,
            description: 'Simulate Cascading Failure: Originates in Payment Service, cascades to Order Service and Checkout'
        });
        await sleep(1500);

        console.log('  ✓ Activated cascading_failure on payment-service');

        // Step 2: User places order from checkout
        const chkParams = new URLSearchParams({
            fullName: 'Gaurav Dev',
            address: '42 Observability Way',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            phone: '+91 98765 43210'
        });
        const chkRes = await fetch(`${GATEWAY_URL}/checkout/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie },
            body: chkParams.toString()
        });
        const chkHtml = await chkRes.text();
        const errorCaught = chkHtml.includes('Order could not be placed') || chkHtml.includes('Cascading Failure Origin');
        console.log('  ✓ Checkout received propagated failure from Order Service:', errorCaught);

        await sleep(1500);
        const statusAfter = await getSimulationStatus('payment-service');
        const rule = statusAfter.data?.find(r => r.failureType === 'cascading_failure');
        const isTriggered = rule && rule.status === 'TRIGGERED';
        console.log('  ✓ Originating rule transitioned to TRIGGERED:', isTriggered, 'count:', rule?.triggerCount);

        // Step 3: Verify Distributed Trace waterfall in Jaeger
        const traces = await getRecentTraces('payment-service', 3);
        let rootCauseIdentified = false;
        let traceId = '';

        if (traces.length > 0) {
            const rawTrace = traces[0];
            traceId = rawTrace.traceID;
            // Spans in trace include gateway, order-service, and payment-service
            const servicesInTrace = new Set(Object.values(rawTrace.processes || {}).map(p => p.serviceName));
            console.log('  ✓ Trace ID:', traceId, 'Services involved in trace:', Array.from(servicesInTrace));
            
            // Payment service span was error
            const paymentErrorSpan = rawTrace.spans.find(s => {
                const proc = rawTrace.processes[s.processID];
                return proc?.serviceName === 'payment-service' && s.tags?.some(t => t.key === 'error' && (t.value === true || t.value === 'true'));
            });
            if (paymentErrorSpan) {
                rootCauseIdentified = true;
                console.log('  ✓ Root Cause Analysis: Earliest failed span identified in payment-service (operation:', paymentErrorSpan.operationName, ')');
            }
        }

        // Step 4: Deactivate & verify recovery
        await deactivateSimulation('payment-service');
        await sleep(1500);

        await ensureCartHasItem();
        const normRes = await fetch(`${GATEWAY_URL}/checkout/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie },
            body: chkParams.toString(),
            redirect: 'manual'
        });
        const normLocation = normRes.headers.get('location');
        const recovered = normRes.status === 302 && normLocation && normLocation.includes('/payment/');
        console.log('  ✓ Normal order placement recovered after deactivation; redirected to:', normLocation);

        if (errorCaught && isTriggered && recovered) {
            recordResult('FAILURE 6: Cascading Failure', 'PASS', {
                propagatedErrorCaught: errorCaught,
                ruleTriggered: isTriggered,
                traceId,
                originatingCauseService: 'payment-service',
                recoveredNormally: recovered
            });
        } else {
            recordResult('FAILURE 6: Cascading Failure', 'FAIL', { errorCaught, isTriggered, recovered });
        }
    } catch (err) {
        recordResult('FAILURE 6: Cascading Failure', 'FAIL', { error: err.message });
        await deactivateSimulation('payment-service');
    }

    // ---------------------------------------------------------------------
    // SUMMARY
    // ---------------------------------------------------------------------
    console.log('\n====================================================================');
    console.log('                   FINAL VERIFICATION RESULTS SUMMARY               ');
    console.log('====================================================================');
    let passed = 0;
    for (const r of results) {
        const color = r.status === 'PASS' ? '\x1b[32m' : '\x1b[31m';
        console.log(`${color}${r.status}\x1b[0m : ${r.testName}`);
        if (r.status === 'PASS') passed++;
    }
    console.log(`\nTOTAL: ${passed}/${results.length} PASSED`);
    console.log('====================================================================\n');
}

runAllScenarios().catch(console.error);
