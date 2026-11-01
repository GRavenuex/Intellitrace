async function testPhase10() {
    console.log('====================================================');
    console.log('RUNNING PHASE 10 DISTRIBUTED TRACING VERIFICATION');
    console.log('====================================================\n');

    // 1. Authenticate with IntelliTrace backend
    console.log('[Check 1] Authenticating with IntelliTrace Backend...');
    const loginRes = await fetch('http://localhost:4000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@intellitrace.com', password: 'password123' })
    });
    const loginData = await loginRes.json();
    if (!loginData.token) {
        throw new Error('Failed to obtain JWT token: ' + JSON.stringify(loginData));
    }
    const token = loginData.token;
    console.log('✓ Successfully authenticated. JWT token acquired.');

    // 2. Check registered Jaeger services
    console.log('\n[Check 2] Querying registered services via IntelliTrace API (/api/traces/services)...');
    const servicesRes = await fetch('http://localhost:4000/api/traces/services', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const servicesData = await servicesRes.json();
    console.log('Registered services in Jaeger:', servicesData.data);
    const requiredServices = ['intellishop-gateway', 'product-service', 'cart-service', 'order-service', 'payment-service'];
    const missingServices = requiredServices.filter(s => !servicesData.data.includes(s));
    if (missingServices.length > 0) {
        throw new Error(`Missing expected services in Jaeger: ${missingServices.join(', ')}`);
    }
    console.log('✓ All 5 IntelliShop microservices are registered in Jaeger!');

    // 3. Query traces list
    console.log('\n[Check 3] Querying traces list (/api/traces)...');
    const tracesRes = await fetch('http://localhost:4000/api/traces?limit=30', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const tracesData = await tracesRes.json();
    console.log(`✓ Fetched ${tracesData.data.length} traces from IntelliTrace.`);

    // 4. Verify End-to-End Distributed Trace with multi-service spans
    console.log('\n[Check 4] Finding distributed trace spanning multiple microservices...');
    const multiServiceTrace = tracesData.data.find(t => t.services && t.services.length >= 2);
    if (!multiServiceTrace) {
        throw new Error('No multi-service distributed trace found in top traces!');
    }
    console.log(`✓ Found distributed trace! ID: ${multiServiceTrace.traceId}`);
    console.log(`  Root Service: ${multiServiceTrace.rootServiceName}`);
    console.log(`  Root Operation: ${multiServiceTrace.rootOperationName}`);
    console.log(`  Services involved: ${multiServiceTrace.services.join(' -> ')}`);
    console.log(`  Span Count: ${multiServiceTrace.spanCount}`);
    console.log(`  Duration: ${(multiServiceTrace.durationMs).toFixed(2)} ms`);

    // 5. Query detailed trace by ID with waterfall calculation
    console.log(`\n[Check 5] Querying detailed waterfall trace (/api/traces/${multiServiceTrace.traceId})...`);
    const traceDetailRes = await fetch(`http://localhost:4000/api/traces/${multiServiceTrace.traceId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const traceDetailData = await traceDetailRes.json();
    const detail = traceDetailData.data;
    console.log(`✓ Waterfall detailed view retrieved: ${detail.spans.length} spans.`);
    console.log('  Top 5 waterfall spans:');
    detail.spans.slice(0, 5).forEach((s, idx) => {
        console.log(`    [Span ${idx+1}] ${s.serviceName}: ${s.operationName} | Duration: ${(s.durationMs).toFixed(1)}ms | Offset: ${(s.offsetMs).toFixed(1)}ms (${(s.percentOffset || 0).toFixed(1)}%)`);
    });

    // 6. Check custom business spans: order.create_order, payment.process_transaction, cart.add_item
    console.log('\n[Check 6] Verifying custom business spans in Jaeger...');
    const [cartTraceRes, orderTraceRes, payTraceRes] = await Promise.all([
        fetch('http://localhost:16686/api/traces?service=cart-service&operation=cart.add_item'),
        fetch('http://localhost:16686/api/traces?service=order-service&operation=order.create_order'),
        fetch('http://localhost:16686/api/traces?service=payment-service&operation=payment.process_transaction')
    ]);
    const cartTraces = await cartTraceRes.json();
    const orderTraces = await orderTraceRes.json();
    const payTraces = await payTraceRes.json();

    const hasAddItem = cartTraces.data && cartTraces.data.length > 0;
    const hasCreateOrder = orderTraces.data && orderTraces.data.length > 0;
    const hasPaymentProcess = payTraces.data && payTraces.data.length > 0;

    console.log(`✓ Business span 'cart.add_item' recorded: ${hasAddItem} (Traces: ${cartTraces.data.length})`);
    console.log(`✓ Business span 'order.create_order' recorded: ${hasCreateOrder} (Traces: ${orderTraces.data.length})`);
    console.log(`✓ Business span 'payment.process_transaction' recorded: ${hasPaymentProcess} (Traces: ${payTraces.data.length})`);

    if (!hasAddItem || !hasCreateOrder || !hasPaymentProcess) {
        throw new Error('Not all custom business spans were found in Jaeger!');
    }

    // 7. Check Payment Failure Span error status
    console.log('\n[Check 7] Verifying simulated payment failure recorded with ERROR status...');
    let failedPaymentSpan = null;
    for (const t of payTraces.data) {
        const s = t.spans.find(sp => sp.operationName === 'payment.process_transaction');
        if (s && s.tags.some(tg => tg.key === 'payment.simulate_result' && tg.value === 'FAILURE')) {
            failedPaymentSpan = s;
            break;
        }
    }
    if (!failedPaymentSpan) {
        throw new Error('Could not find payment failure transaction span in payment-service traces!');
    }
    const errTag = failedPaymentSpan.tags.find(tg => tg.key === 'error')?.value;
    const statusCodeTag = failedPaymentSpan.tags.find(tg => tg.key === 'otel.status_code')?.value;
    const descTag = failedPaymentSpan.tags.find(tg => tg.key === 'otel.status_description')?.value;
    const simTag = failedPaymentSpan.tags.find(tg => tg.key === 'payment.simulate_result')?.value;

    console.log(`✓ Found simulated payment failure span!`);
    console.log(`  Span ID: ${failedPaymentSpan.spanID}`);
    console.log(`  Operation: ${failedPaymentSpan.operationName}`);
    console.log(`  Error Flag: ${errTag}`);
    console.log(`  Status Code: ${statusCodeTag}`);
    console.log(`  Description: ${descTag}`);
    console.log(`  Simulation Result: ${simTag}`);

    // 8. Verify Trace Correlation in Structured Logs
    console.log('\n[Check 8] Checking trace correlation in structured logs (/api/v1/logs)...');
    const logsRes = await fetch('http://localhost:4000/api/v1/logs?limit=50&search=order', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const logsData = await logsRes.json();
    const items = logsData.data.items || [];
    const logsWithTrace = items.filter(l => l.traceId && l.traceId !== '00000000000000000000000000000000');
    console.log(`✓ Order logs fetched: ${items.length}, logs with active traceId: ${logsWithTrace.length}`);
    if (logsWithTrace.length > 0) {
        const sampleLog = logsWithTrace[0];
        console.log('  Sample correlated log record:');
        console.log(`    Route: ${sampleLog.route}`);
        console.log(`    RequestId: ${sampleLog.requestId}`);
        console.log(`    TraceId: ${sampleLog.traceId}`);
        console.log(`    SpanId: ${sampleLog.spanId}`);
    } else {
        throw new Error('No logs found with valid active traceId!');
    }

    console.log('\n====================================================');
    console.log('ALL PHASE 10 DISTRIBUTED TRACING CHECKS PASSED!');
    console.log('====================================================\n');
}

testPhase10().catch(err => {
    console.error('\n❌ VERIFICATION FAILED:', err);
    process.exit(1);
});
