/**
 * Comprehensive Verification Script for Phase 13: Technical Error Extraction & Propagation
 */

const http = require('http');
const jwt = require('./intellitrace/node_modules/jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'intellitrace_jwt_production_secret_key_2026';
const authToken = jwt.sign({ id: 'admin-tester', email: 'admin@intellitrace.io' }, JWT_SECRET, { expiresIn: '1d' });

async function httpRequest(url, method = 'GET', data = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const reqHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            ...headers
        };
        const req = http.request({
            hostname: u.hostname,
            port: u.port || 80,
            path: `${u.pathname}${u.search}`,
            method,
            headers: reqHeaders,
            timeout: 6000
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(body);
                } catch (_) {
                    parsed = body;
                }
                resolve({ statusCode: res.statusCode, headers: res.headers, data: parsed });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Timeout requesting ${url}`));
        });

        if (data) {
            req.write(typeof data === 'string' ? data : JSON.stringify(data));
        }
        req.end();
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('================================================================');
    console.log('   INTELLITRACE PHASE 13 — TECHNICAL ERROR EXTRACTION TESTS    ');
    console.log('================================================================\n');

    let passedTests = 0;
    let totalTests = 5;

    // -------------------------------------------------------------------------
    // TEST A: HTTP 500 Injected Failure
    // -------------------------------------------------------------------------
    console.log('[TEST A] Testing HTTP 500 Failure Extraction on payment-service...');
    try {
        const ruleRes = await httpRequest('http://localhost:4000/api/v1/failure-injections/activate-direct', 'POST', {
            targetService: 'payment-service',
            failureType: 'http_500',
            targetRoute: '/api/payments',
            percentage: 100,
            durationSeconds: 120,
            description: 'Automated Test A HTTP 500'
        });
        const ruleId = ruleRes.data?.data?._id;
        console.log(`  -> Active rule created: ${ruleId}`);

        await sleep(3500); // Allow pollers to sync

        const triggerRes = await httpRequest('http://localhost:3004/api/payments', 'POST', {
            orderId: 'test-order-500',
            amount: 50.00,
            paymentMethod: 'credit_card'
        }, { 'x-request-id': 'req-test-http-500' });

        console.log(`  -> Triggered payment service response code: ${triggerRes.statusCode}`);

        await sleep(2500); // Allow log ingestion & processing

        const logsRes = await httpRequest('http://localhost:4000/api/v1/logs?application=payment-service&search=req-test-http-500&limit=5');
        const logs = logsRes.data?.data?.items || [];
        const matchingLog = logs.find(l => l.requestId === 'req-test-http-500' || (l.error && l.error.name === 'HTTP 500 InternalServerError') || (l.message && l.message.includes('HTTP 500')));

        if (!matchingLog) {
            console.error('  [FAIL] Matching error log not found in IntelliTrace Log repository.');
        } else {
            const { extractErrorDetails } = require('./intellitrace/src/services/errorExtractor');
            const extracted = extractErrorDetails(matchingLog);

            console.log('  -> Extracted Error Properties:');
            console.log(`     Error Type:          ${extracted.errorType}`);
            console.log(`     Error Message:       ${extracted.errorMessage}`);
            console.log(`     Originating Service: ${extracted.originatingService}`);
            console.log(`     Affected Service:    ${extracted.service}`);
            console.log(`     Method & Route:      ${extracted.method} ${extracted.route}`);
            console.log(`     Source Location:     ${extracted.sourceFile}:${extracted.lineNumber}:${extracted.columnNumber}`);
            console.log(`     Category:            ${extracted.category}`);
            console.log(`     Database:            ${extracted.database}`);
            console.log(`     Stack Trace Present: ${Boolean(extracted.stackTrace)}`);

            const passA = (
                extracted.errorType === 'HTTP 500 InternalServerError' &&
                extracted.originatingService === 'payment-service' &&
                extracted.category === 'internal_error' &&
                extracted.database === 'Not involved' &&
                extracted.stackTrace &&
                extracted.lineNumber !== null
            );

            if (passA) {
                console.log('  [PASS] Test A Passed successfully!\n');
                passedTests++;
            } else {
                console.error('  [FAIL] Test A assertions failed.\n');
            }
        }

        // Clean up rule
        if (ruleId) await httpRequest(`http://localhost:4000/api/v1/failure-injections/${ruleId}/stop-direct`, 'PATCH').catch(() => {});
    } catch (err) {
        console.error(`  [FAIL] Test A exception: ${err.message}\n`);
    }

    // -------------------------------------------------------------------------
    // TEST B: Database Failure (MongoTimeoutError)
    // -------------------------------------------------------------------------
    console.log('[TEST B] Testing Database Timeout Failure Extraction...');
    try {
        const ruleRes = await httpRequest('http://localhost:4000/api/v1/failure-injections/activate-direct', 'POST', {
            targetService: 'payment-service',
            failureType: 'database_timeout',
            targetRoute: '/api/payments',
            percentage: 100,
            durationSeconds: 120,
            description: 'Automated Test B Database Timeout'
        });
        const ruleId = ruleRes.data?.data?._id;
        console.log(`  -> Active rule created: ${ruleId}`);

        await sleep(3500);

        const triggerRes = await httpRequest('http://localhost:3004/api/payments', 'POST', {
            orderId: 'test-order-db',
            amount: 75.00
        }, { 'x-request-id': 'req-test-db-timeout' });

        console.log(`  -> Triggered response code: ${triggerRes.statusCode}`);

        await sleep(2500);

        const logsRes = await httpRequest('http://localhost:4000/api/v1/logs?application=payment-service&search=req-test-db-timeout&limit=5');
        const logs = logsRes.data?.data?.items || [];
        const matchingLog = logs.find(l => l.requestId === 'req-test-db-timeout' || (l.error && l.error.name === 'MongoTimeoutError') || (l.message && l.message.includes('MongoTimeoutError')));

        if (!matchingLog) {
            console.error('  [FAIL] Matching database timeout log not found.');
        } else {
            const { extractErrorDetails } = require('./intellitrace/src/services/errorExtractor');
            const extracted = extractErrorDetails(matchingLog);

            console.log('  -> Extracted DB Error Properties:');
            console.log(`     Error Type:          ${extracted.errorType}`);
            console.log(`     Error Message:       ${extracted.errorMessage}`);
            console.log(`     Originating Service: ${extracted.originatingService}`);
            console.log(`     Database:            ${extracted.database}`);
            console.log(`     Category:            ${extracted.category}`);
            console.log(`     Source Location:     ${extracted.sourceFile}:${extracted.lineNumber}`);

            const passB = (
                extracted.errorType === 'MongoTimeoutError' &&
                extracted.originatingService === 'payment-service' &&
                extracted.database === 'MongoDB' &&
                extracted.category === 'database_query_error' &&
                Boolean(extracted.stackTrace)
            );

            if (passB) {
                console.log('  [PASS] Test B Passed successfully!\n');
                passedTests++;
            } else {
                console.error('  [FAIL] Test B assertions failed.\n');
            }
        }

        if (ruleId) await httpRequest(`http://localhost:4000/api/v1/failure-injections/${ruleId}/stop-direct`, 'PATCH').catch(() => {});
    } catch (err) {
        console.error(`  [FAIL] Test B exception: ${err.message}\n`);
    }

    // -------------------------------------------------------------------------
    // TEST C: Service Communication Failure
    // -------------------------------------------------------------------------
    console.log('[TEST C] Testing Downstream Communication Failure Extraction...');
    try {
        const ruleRes = await httpRequest('http://localhost:4000/api/v1/failure-injections/activate-direct', 'POST', {
            targetService: 'order-service',
            failureType: 'service_communication_failure',
            targetRoute: '/api/orders',
            percentage: 100,
            durationSeconds: 120,
            description: 'Automated Test C Service Comm Failure'
        });
        const ruleId = ruleRes.data?.data?._id;
        console.log(`  -> Active rule created: ${ruleId}`);

        await sleep(3500);

        const triggerRes = await httpRequest('http://localhost:3003/api/orders', 'POST', {
            userId: 'test-user',
            items: []
        }, { 'x-request-id': 'req-test-comm-fail' });

        console.log(`  -> Triggered response code: ${triggerRes.statusCode}`);

        await sleep(2500);

        const logsRes = await httpRequest('http://localhost:4000/api/v1/logs?application=order-service&search=req-test-comm-fail&limit=5');
        const logs = logsRes.data?.data?.items || [];
        const matchingLog = logs.find(l => l.requestId === 'req-test-comm-fail' || (l.error && l.error.name === 'NetworkError'));

        if (!matchingLog) {
            console.error('  [FAIL] Matching communication failure log not found.');
        } else {
            const { extractErrorDetails } = require('./intellitrace/src/services/errorExtractor');
            const extracted = extractErrorDetails(matchingLog);

            console.log('  -> Extracted Comm Error Properties:');
            console.log(`     Error Type:          ${extracted.errorType}`);
            console.log(`     Error Message:       ${extracted.errorMessage}`);
            console.log(`     Originating Service: ${extracted.originatingService}`);
            console.log(`     Reporting Service:   ${extracted.reportingService}`);
            console.log(`     Category:            ${extracted.category}`);
            console.log(`     Database:            ${extracted.database}`);

            const passC = (
                extracted.errorType === 'NetworkError' &&
                extracted.originatingService === 'payment-service' &&
                extracted.reportingService === 'order-service' &&
                extracted.category === 'network_error' &&
                extracted.database === 'Not involved'
            );

            if (passC) {
                console.log('  [PASS] Test C Passed successfully!\n');
                passedTests++;
            } else {
                console.error('  [FAIL] Test C assertions failed.\n');
            }
        }

        if (ruleId) await httpRequest(`http://localhost:4000/api/v1/failure-injections/${ruleId}/stop-direct`, 'PATCH').catch(() => {});
    } catch (err) {
        console.error(`  [FAIL] Test C exception: ${err.message}\n`);
    }

    // -------------------------------------------------------------------------
    // TEST D: Validation Error Extraction
    // -------------------------------------------------------------------------
    console.log('[TEST D] Testing Validation Error Extraction & Categorization...');
    try {
        const { extractErrorDetails } = require('./intellitrace/src/services/errorExtractor');
        const validationLog = {
            level: 'WARN',
            service: 'payment-service',
            originatingService: 'payment-service',
            method: 'POST',
            route: '/api/payments',
            statusCode: 400,
            message: 'ValidationError: amount must be greater than zero',
            error: {
                name: 'ValidationError',
                message: 'amount must be greater than zero',
                stack: 'ValidationError: amount must be greater than zero\n    at validatePaymentPayload (/app/services/payment-service/validators/payment.js:14:11)'
            }
        };

        const extracted = extractErrorDetails(validationLog);
        console.log(`     Error Type:      ${extracted.errorType}`);
        console.log(`     Error Message:   ${extracted.errorMessage}`);
        console.log(`     Category:        ${extracted.category}`);
        console.log(`     Database:        ${extracted.database}`);
        console.log(`     Source Location: ${extracted.sourceFile}:${extracted.lineNumber}:${extracted.columnNumber}`);

        const passD = (
            extracted.errorType === 'ValidationError' &&
            extracted.category === 'validation_error' &&
            extracted.database === 'Not involved' &&
            extracted.sourceFile === 'services/payment-service/validators/payment.js' &&
            extracted.lineNumber === 14 &&
            extracted.columnNumber === 11
        );

        if (passD) {
            console.log('  [PASS] Test D Passed successfully!\n');
            passedTests++;
        } else {
            console.error('  [FAIL] Test D assertions failed.\n');
        }
    } catch (err) {
        console.error(`  [FAIL] Test D exception: ${err.message}\n`);
    }

    // -------------------------------------------------------------------------
    // TEST E: Missing Metadata Graceful Degradation
    // -------------------------------------------------------------------------
    console.log('[TEST E] Testing Missing Metadata Fallbacks...');
    try {
        const { extractErrorDetails } = require('./intellitrace/src/services/errorExtractor');
        const bareLog = {
            level: 'ERROR',
            service: 'cart-service',
            statusCode: 500
        };

        const extracted = extractErrorDetails(bareLog);
        console.log(`     Error Type:      ${extracted.errorType}`);
        console.log(`     Error Message:   ${extracted.errorMessage}`);
        console.log(`     Source File:     ${extracted.sourceFile}`);
        console.log(`     Source Function: ${extracted.sourceFunction}`);
        console.log(`     Line Number:     ${extracted.lineNumber}`);
        console.log(`     Stack Trace:     ${extracted.stackTrace}`);
        console.log(`     Database:        ${extracted.database}`);

        const passE = (
            extracted.sourceFile === 'Source file information unavailable.' &&
            extracted.sourceFunction === 'Function information unavailable.' &&
            extracted.lineNumber === null &&
            extracted.stackTrace === null &&
            extracted.database === 'Not involved'
        );

        if (passE) {
            console.log('  [PASS] Test E Passed successfully!\n');
            passedTests++;
        } else {
            console.error('  [FAIL] Test E assertions failed.\n');
        }
    } catch (err) {
        console.error(`  [FAIL] Test E exception: ${err.message}\n`);
    }

    console.log('================================================================');
    console.log(`   TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log('================================================================');
    if (passedTests === totalTests) {
        console.log('>> ALL PHASE 13 TECHNICAL ERROR EXTRACTION CRITERIA SATISFIED! <<\n');
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
});
