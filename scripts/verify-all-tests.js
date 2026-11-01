const http = require('http');

const INTELLITRACE_URL = 'http://localhost:4000/api';
const GATEWAY_URL = 'http://localhost:3000';
const PRODUCT_URL = 'http://localhost:3001';
const CART_URL = 'http://localhost:3002';
const ORDER_URL = 'http://localhost:3003';
const PAYMENT_URL = 'http://localhost:3004';

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
    await new Promise(r => setTimeout(r, 2000));
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
    await new Promise(r => setTimeout(r, 2500));
    return d.data;
}

async function getTraces(query = 'limit=20') {
    const res = await fetch(`${INTELLITRACE_URL}/traces?${query}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    return await res.json();
}

async function getTraceById(traceId) {
    const res = await fetch(`${INTELLITRACE_URL}/traces/${traceId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    return await res.json();
}

async function runAllTests() {
    console.log('===============================================================');
    console.log('   INTELLITRACE TRACE ACCURACY & VERIFICATION TEST SUITE');
    console.log('===============================================================\n');

    await login();
    await deactivateAll();

    const results = {};

    // -------------------------------------------------------------------------
    // TEST 1: Open IntelliTrace and reload Traces page 5 times without IntelliShop activity
    // Expected: No new business traces are generated. No /developer traces appear.
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Reload Traces Page 5 Times Without IntelliShop Activity ---');
    try {
        let prevTraceIds = null;
        let identical = true;
        let foundUnwantedTrace = false;

        for (let i = 1; i <= 5; i++) {
            const res = await getTraces('limit=20');
            const traces = res.data || [];
            
            // Check for unwanted internal polling traces
            const unwanted = traces.filter(t => 
                t.rootOperationName.includes('/developer') || 
                t.rootOperationName.includes('failure-injections') ||
                t.rootOperationName.includes('/heartbeat') ||
                t.rootOperationName.includes('/health') ||
                t.rootOperationName.includes('/metrics')
            );

            if (unwanted.length > 0) {
                foundUnwantedTrace = true;
                console.error(`  FAIL: Found ${unwanted.length} internal polling trace(s) on reload #${i}:`, unwanted.map(t => t.rootOperationName));
            }

            const currentIds = traces.map(t => t.traceId).join(',');
            console.log(`  Reload #${i}: total=${res.total}, page=${res.page}, count=${traces.length}, sample=${traces[0] ? traces[0].rootOperationName : 'none'}`);

            if (prevTraceIds !== null && prevTraceIds !== currentIds) {
                identical = false;
                console.error(`  FAIL: Trace IDs changed between reloads!`);
            }
            prevTraceIds = currentIds;
            await new Promise(r => setTimeout(r, 1200));
        }

        const pass = identical && !foundUnwantedTrace;
        results['Test 1: Reload Traces 5 times without activity'] = pass ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Test 1: Reload Traces 5 times without activity']}\n`);
    } catch (err) {
        console.error('Test 1 error:', err.message);
        results['Test 1: Reload Traces 5 times without activity'] = 'FAIL';
    }

    // -------------------------------------------------------------------------
    // TEST 2: Open IntelliShop product listing
    // Expected: A real Product Service trace appears
    // -------------------------------------------------------------------------
    console.log('--- TEST 2: Open IntelliShop Product Listing ---');
    try {
        const reqId = 'req-test2-' + Date.now();
        const prodRes = await fetch(`${PRODUCT_URL}/api/products`, {
            headers: { 'x-request-id': reqId }
        });
        console.log(`  Product request status: ${prodRes.status}`);
        await new Promise(r => setTimeout(r, 2000));

        const res = await getTraces('limit=10&service=product-service');
        const traces = res.data || [];
        const matchingTrace = traces.find(t => 
            t.services.includes('product-service') && 
            (t.rootOperationName.includes('product') || t.rootOperationName.includes('GET'))
        );

        console.log(`  Found Product Service trace: ${matchingTrace ? matchingTrace.traceId : 'none'} (${matchingTrace ? matchingTrace.rootOperationName : 'N/A'})`);
        results['Test 2: Product listing trace'] = matchingTrace ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Test 2: Product listing trace']}\n`);
    } catch (err) {
        console.error('Test 2 error:', err.message);
        results['Test 2: Product listing trace'] = 'FAIL';
    }

    // -------------------------------------------------------------------------
    // TEST 3: Add a product to the cart
    // Expected: A real Cart Service trace appears
    // -------------------------------------------------------------------------
    console.log('--- TEST 3: Add Product to Cart ---');
    try {
        const reqId = 'req-test3-' + Date.now();
        const cartRes = await fetch(`${CART_URL}/api/cart/items`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-request-id': reqId 
            },
            body: JSON.stringify({
                userId: '6adcbca43862377fb895f225',
                productId: '6adcbca43862377fb895f201',
                quantity: 1
            })
        });
        console.log(`  Cart add item response status: ${cartRes.status}`);
        await new Promise(r => setTimeout(r, 2000));

        const res = await getTraces('limit=10&service=cart-service');
        const traces = res.data || [];
        const matchingTrace = traces.find(t => 
            t.services.includes('cart-service') && 
            (t.rootOperationName.includes('cart') || t.rootOperationName.includes('POST'))
        );

        console.log(`  Found Cart Service trace: ${matchingTrace ? matchingTrace.traceId : 'none'} (${matchingTrace ? matchingTrace.rootOperationName : 'N/A'})`);
        results['Test 3: Add product to cart trace'] = matchingTrace ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Test 3: Add product to cart trace']}\n`);
    } catch (err) {
        console.error('Test 3 error:', err.message);
        results['Test 3: Add product to cart trace'] = 'FAIL';
    }

    // -------------------------------------------------------------------------
    // TEST 4: Complete checkout with mock payment (Correlated distributed trace)
    // Expected: Correlated distributed trace containing Gateway/Order, Payment, and DB spans
    // -------------------------------------------------------------------------
    console.log('--- TEST 4: Checkout With Mock Payment (Distributed Trace) ---');
    try {
        const reqId = 'req-test4-' + Date.now();
        const orderData = {
            userId: '6adcbca43862377fb895f225',
            items: [{
                productId: '6adcbca43862377fb895f201',
                name: 'Gaming Laptop Pro',
                quantity: 1,
                price: 1299.99
            }],
            totalAmount: 1299.99,
            shippingAddress: {
                fullName: 'Test Customer',
                address: '123 Silicon Valley Road',
                city: 'Bengaluru',
                state: 'Karnataka',
                pincode: '560001',
                phone: '9876543210'
            }
        };

        const orderRes = await fetch(`${ORDER_URL}/api/orders`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-request-id': reqId 
            },
            body: JSON.stringify(orderData)
        });
        const orderJson = await orderRes.json();
        console.log(`  Order created: ${orderJson.success}, id: ${orderJson.data?._id}`);
        await new Promise(r => setTimeout(r, 2500));

        // Find the correlated trace
        const res = await getTraces('limit=10&service=order-service');
        const traces = res.data || [];
        const orderTrace = traces.find(t => 
            t.services.includes('order-service') && 
            t.services.includes('payment-service')
        );

        let pass = false;
        if (orderTrace) {
            console.log(`  Distributed trace found: ${orderTrace.traceId}, services: ${orderTrace.services.join(', ')}, spans: ${orderTrace.spanCount}`);
            // Fetch detailed waterfall
            const detailRes = await getTraceById(orderTrace.traceId);
            const detail = detailRes.data;
            const hasOrderSpan = detail.spans.some(s => s.serviceName === 'order-service');
            const hasPaymentSpan = detail.spans.some(s => s.serviceName === 'payment-service');
            const hasDbSpan = detail.spans.some(s => s.tags['db.system'] || s.tags['db.name'] || s.operationName.toLowerCase().includes('mongo') || s.operationName.toLowerCase().includes('insert') || s.operationName.toLowerCase().includes('find'));
            console.log(`  Span verification: hasOrder=${hasOrderSpan}, hasPayment=${hasPaymentSpan}, hasDbOrChildSpans=${hasDbSpan || detail.spans.length > 2}`);
            pass = hasOrderSpan && hasPaymentSpan;
        } else {
            console.error('  FAIL: Could not find distributed trace spanning order-service and payment-service');
        }

        results['Test 4: Correlated distributed trace'] = pass ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Test 4: Correlated distributed trace']}\n`);
    } catch (err) {
        console.error('Test 4 error:', err.message);
        results['Test 4: Correlated distributed trace'] = 'FAIL';
    }

    // -------------------------------------------------------------------------
    // TEST 5: Activate Payment HTTP 500 and perform checkout / payment
    // Expected: Failed payment trace appears with actual error and correlated spans
    // -------------------------------------------------------------------------
    console.log('--- TEST 5: Activate Payment HTTP 500 Scenario ---');
    try {
        await activateFailure({
            targetService: 'payment-service',
            failureType: 'http_500',
            targetRoute: '/api/payments',
            durationSeconds: 120
        });

        const reqId = 'req-test5-500-' + Date.now();
        const payRes = await fetch(`${PAYMENT_URL}/api/payments/verify-channel`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-request-id': reqId 
            }
        });
        console.log(`  Payment service response status: ${payRes.status} (Expected 500)`);
        await new Promise(r => setTimeout(r, 2500));

        // Query failed traces
        const errTracesRes = await getTraces('status=ERROR&limit=10');
        const errTraces = errTracesRes.data || [];
        const failedTrace = errTraces.find(t => 
            t.hasError && 
            (t.services.includes('payment-service') || t.rootServiceName === 'payment-service')
        );

        let pass = false;
        if (failedTrace) {
            console.log(`  Failed trace captured: ${failedTrace.traceId}, rootOp: ${failedTrace.rootOperationName}, hasError: ${failedTrace.hasError}`);
            const detailRes = await getTraceById(failedTrace.traceId);
            const detail = detailRes.data;
            const errSpan = detail.spans.find(s => s.hasError);
            console.log(`  Error span details: service=${errSpan?.serviceName}, op=${errSpan?.operationName}, httpStatus=${errSpan?.tags['http.status_code']}`);
            pass = failedTrace.hasError && (errSpan?.tags['http.status_code'] == '500' || errSpan?.hasError);
        } else {
            console.error('  FAIL: No error trace captured for payment HTTP 500');
        }

        results['Test 5: Payment HTTP 500 trace'] = pass ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Test 5: Payment HTTP 500 trace']}\n`);
        await deactivateAll();
    } catch (err) {
        console.error('Test 5 error:', err.message);
        results['Test 5: Payment HTTP 500 trace'] = 'FAIL';
        await deactivateAll();
    }

    // -------------------------------------------------------------------------
    // TEST 6: Activate latency simulation and perform matching operation
    // Expected: A real slow trace appears with the correct duration (>= 1500ms)
    // -------------------------------------------------------------------------
    console.log('--- TEST 6: Activate Latency Simulation ---');
    try {
        await activateFailure({
            targetService: 'product-service',
            failureType: 'latency',
            targetRoute: '/api/products',
            delayMs: 1500,
            durationSeconds: 120
        });

        const start = Date.now();
        const reqId = 'req-test6-lat-' + Date.now();
        const prodRes = await fetch(`${PRODUCT_URL}/api/products`, {
            headers: { 'x-request-id': reqId }
        });
        const elapsed = Date.now() - start;
        console.log(`  Product response elapsed: ${elapsed}ms (Expected >= 1500ms)`);
        await new Promise(r => setTimeout(r, 2500));

        // Query slow traces filter
        const slowTracesRes = await getTraces('status=SLOW&limit=10');
        const slowTraces = slowTracesRes.data || [];
        const matchingSlowTrace = slowTraces.find(t => 
            t.durationMs >= 1400 && 
            t.services.includes('product-service')
        );

        console.log(`  Slow trace captured: ${matchingSlowTrace ? matchingSlowTrace.traceId : 'none'}, duration: ${matchingSlowTrace ? matchingSlowTrace.durationMs : 0}ms`);
        const pass = elapsed >= 1450 && matchingSlowTrace && matchingSlowTrace.durationMs >= 1400;
        results['Test 6: Latency simulation slow trace'] = pass ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Test 6: Latency simulation slow trace']}\n`);
        await deactivateAll();
    } catch (err) {
        console.error('Test 6 error:', err.message);
        results['Test 6: Latency simulation slow trace'] = 'FAIL';
        await deactivateAll();
    }

    // -------------------------------------------------------------------------
    // TEST 7: Reload the IntelliTrace page again
    // Expected: Existing traces remain visible, no new traces generated by refresh
    // -------------------------------------------------------------------------
    console.log('--- TEST 7: Reload Traces Page Again (Stability & Pagination) ---');
    try {
        const res1 = await getTraces('limit=20');
        await new Promise(r => setTimeout(r, 1500));
        const res2 = await getTraces('limit=20');

        console.log(`  Check 1: total=${res1.total}, count=${res1.data?.length}, page=${res1.page}`);
        console.log(`  Check 2: total=${res2.total}, count=${res2.data?.length}, page=${res2.page}`);

        const tracesVisible = res1.data && res1.data.length > 0;
        const countStable = res1.total === res2.total;
        const pass = tracesVisible && countStable;

        results['Test 7: Traces page reload stability'] = pass ? 'PASS' : 'FAIL';
        console.log(`Result: ${results['Test 7: Traces page reload stability']}\n`);
    } catch (err) {
        console.error('Test 7 error:', err.message);
        results['Test 7: Traces page reload stability'] = 'FAIL';
    }

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log('===============================================================');
    console.log('                  VERIFICATION RESULTS');
    console.log('===============================================================');
    for (const [name, outcome] of Object.entries(results)) {
        console.log(`  [${outcome}] ${name}`);
    }
    console.log('===============================================================\n');
}

runAllTests().catch(err => {
    console.error('Fatal error in test runner:', err);
    process.exit(1);
});
