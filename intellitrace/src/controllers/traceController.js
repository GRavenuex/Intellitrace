const JAEGER_URL = process.env.JAEGER_URL || 'http://jaeger:16686';

const KNOWN_SERVICES = [
    'intellishop-gateway',
    'product-service',
    'cart-service',
    'order-service',
    'payment-service'
];

// Helper to fetch JSON from Jaeger with timeout
async function fetchJaeger(endpoint) {
    const url = `${JAEGER_URL}${endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
            throw new Error(`Jaeger API returned ${res.status}: ${res.statusText}`);
        }
        return await res.json();
    } finally {
        clearTimeout(timeout);
    }
}

// Helper to identify internal observability or monitoring strings
function isInternalObservability(str) {
    if (!str) return false;
    const v = String(str).toLowerCase();
    return v.includes('/developer/failure-injections') ||
           v.includes('/failure-injections') ||
           v.startsWith('/developer') ||
           v.includes('/developer/') ||
           v.includes('/heartbeat') ||
           v.includes('/api/v1/failure-injections') ||
           v.includes('/api/v1/heartbeat') ||
           v.includes('/api/v1/applications') ||
           v.includes('/api/v1/dashboard') ||
           v.includes('/api/traces') ||
           v.includes('/api/logs') ||
           v.includes('/api/metrics') ||
           v.includes('/api/auth') ||
           v.includes('/v1/traces') ||
           v.includes('/v1/logs') ||
           v.includes('/v1/metrics') ||
           v.includes('/metrics') ||
           v.includes('/health') ||
           v.includes('/healthz') ||
           v.includes('prometheus') ||
           v.includes('jaeger') ||
           v.includes('favicon.ico');
}

// Transform raw Jaeger trace to clean trace summary
function summarizeTrace(rawTrace, allowInternal = false) {
    if (!rawTrace || !rawTrace.spans || rawTrace.spans.length === 0) return null;

    const traceId = rawTrace.traceID;
    const spans = rawTrace.spans;
    const processes = rawTrace.processes || {};

    // Find root span (no references or parentSpanId is missing)
    let rootSpan = spans.find(s => !s.references || s.references.length === 0);
    if (!rootSpan) {
        rootSpan = spans.reduce((earliest, cur) => cur.startTime < earliest.startTime ? cur : earliest, spans[0]);
    }

    const rootProcess = processes[rootSpan.processID] || {};
    const rootServiceName = rootProcess.serviceName || 'unknown-service';
    const rootOp = rootSpan.operationName || 'HTTP Request';

    // Helper to identify internal observability or monitoring spans
    const isInternalSpan = (span) => {
        if (!span) return false;
        if (isInternalObservability(span.operationName)) return true;
        if (!span.tags) return false;
        return span.tags.some(t => {
            const v = String(t.value || '').toLowerCase();
            const k = String(t.key || '').toLowerCase();
            if (k === 'url.full' || k === 'http.target' || k === 'http.url' || k === 'url.path') {
                return isInternalObservability(v) || v.includes(':4000') || v.includes('intellitrace-backend');
            }
            if (k === 'server.address' || k === 'net.peer.name' || k === 'peer.service') {
                return v.includes('intellitrace') || v.includes('jaeger') || v.includes('prometheus');
            }
            if (k === 'server.port' || k === 'net.peer.port') {
                return v === '4000' || v === '4318' || v === '4317' || v === '9090' || v === '13133';
            }
            return false;
        });
    };

    if (!allowInternal) {
        // Exclude if root span itself is internal monitoring/polling
        if (isInternalSpan(rootSpan)) return null;
        if (isInternalObservability(rootOp)) return null;

        // Ignore traces consisting only of internal observability traffic
        if (spans.length === 1 && isInternalSpan(rootSpan)) return null;
        if (spans.every(isInternalSpan)) return null;
    }

    // Calculate total duration and range
    let minStart = Infinity;
    let maxEnd = -Infinity;
    let hasError = false;
    const serviceSet = new Set();

    for (const span of spans) {
        const proc = processes[span.processID] || {};
        if (proc.serviceName) serviceSet.add(proc.serviceName);

        const startUs = span.startTime;
        const endUs = span.startTime + span.duration;
        if (startUs < minStart) minStart = startUs;
        if (endUs > maxEnd) maxEnd = endUs;

        // Check if any tag marks error
        const isErrTag = span.tags && span.tags.some(t => 
            (t.key === 'error' && (t.value === true || t.value === 'true')) ||
            (t.key === 'otel.status_code' && t.value === 'ERROR') ||
            (t.key === 'http.status_code' && Number(t.value) >= 400)
        );
        if (isErrTag) hasError = true;
    }

    const durationUs = maxEnd - minStart;
    const durationMs = Math.round((durationUs / 1000) * 10) / 10;
    const startTimeIso = new Date(Math.floor(minStart / 1000)).toISOString();

    return {
        traceId,
        rootServiceName,
        rootOperationName: rootOp,
        durationMs,
        spanCount: spans.length,
        hasError,
        startTime: startTimeIso,
        startTimeUnix: Math.floor(minStart / 1000),
        services: Array.from(serviceSet)
    };
}

// Format detailed trace for waterfall visualization
function formatTraceDetail(rawTrace) {
    if (!rawTrace || !rawTrace.spans || rawTrace.spans.length === 0) return null;

    const summary = summarizeTrace(rawTrace, true);
    const spans = rawTrace.spans;
    const processes = rawTrace.processes || {};

    let minStartUs = Infinity;
    for (const s of spans) {
        if (s.startTime < minStartUs) minStartUs = s.startTime;
    }
    const traceTotalDurationUs = Math.max(...spans.map(s => s.startTime + s.duration)) - minStartUs;

    // Build span ID to span mapping for parent-child tree
    const formattedSpans = spans.map(s => {
        const proc = processes[s.processID] || {};
        const serviceName = proc.serviceName || 'unknown-service';
        
        let parentSpanId = null;
        if (s.references && s.references.length > 0) {
            const childOf = s.references.find(r => r.refType === 'CHILD_OF') || s.references[0];
            parentSpanId = childOf.spanID;
        }

        const offsetUs = s.startTime - minStartUs;
        const durationUs = s.duration;
        const durationMs = Math.round((durationUs / 1000) * 10) / 10;
        const offsetMs = Math.round((offsetUs / 1000) * 10) / 10;

        const percentOffset = traceTotalDurationUs > 0 
            ? Math.max(0, Math.min(100, (offsetUs / traceTotalDurationUs) * 100)) 
            : 0;
        const percentWidth = traceTotalDurationUs > 0 
            ? Math.max(0.5, Math.min(100, (durationUs / traceTotalDurationUs) * 100)) 
            : 100;

        // Extract tags
        const tags = {};
        let isError = false;
        if (s.tags) {
            for (const t of s.tags) {
                tags[t.key] = t.value;
                if ((t.key === 'error' && (t.value === true || t.value === 'true')) ||
                    (t.key === 'otel.status_code' && t.value === 'ERROR') ||
                    (t.key === 'http.status_code' && Number(t.value) >= 400)) {
                    isError = true;
                }
            }
        }

        // Extract logs/events
        const events = (s.logs || []).map(l => ({
            timestamp: new Date(Math.floor(l.timestamp / 1000)).toISOString(),
            fields: (l.fields || []).reduce((acc, f) => ({ ...acc, [f.key]: f.value }), {})
        }));

        return {
            spanId: s.spanID,
            parentSpanId,
            serviceName,
            operationName: s.operationName,
            startTime: new Date(Math.floor(s.startTime / 1000)).toISOString(),
            durationMs,
            offsetMs,
            percentOffset: Math.round(percentOffset * 10) / 10,
            percentWidth: Math.round(percentWidth * 10) / 10,
            hasError: isError,
            tags,
            events
        };
    });

    // Sort by startTime
    formattedSpans.sort((a, b) => a.offsetMs - b.offsetMs);

    return {
        ...summary,
        spans: formattedSpans
    };
}

// GET /api/traces - list traces
exports.getTraces = async (req, res, next) => {
    try {
        const { service, limit = 20, lookback = '1h', error, status, filter, page = 1, search } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
        let tracesList = [];

        // Aggregate traces across known services
        const servicesToQuery = service ? [service] : KNOWN_SERVICES;
        const traceMap = new Map();

        for (const svc of servicesToQuery) {
            try {
                // Fetch up to 100 traces per service to have sufficient pool for filtering and pagination
                const jaegerRes = await fetchJaeger(`/api/traces?service=${encodeURIComponent(svc)}&limit=100&lookback=${lookback}`);
                if (jaegerRes && Array.isArray(jaegerRes.data)) {
                    for (const raw of jaegerRes.data) {
                        if (!traceMap.has(raw.traceID)) {
                            const sum = summarizeTrace(raw);
                            if (sum) traceMap.set(raw.traceID, sum);
                        }
                    }
                }
            } catch (err) {
                console.warn(`[TraceController] Could not fetch traces for service ${svc}: ${err.message}`);
            }
        }
        tracesList = Array.from(traceMap.values());

        // Apply service filter if queried across all services but user filtered
        if (service) {
            tracesList = tracesList.filter(t => t.services.includes(service) || t.rootServiceName === service);
        }

        // Apply status / filter:
        // 'ERROR' | 'SUCCESS' | 'SLOW' | 'ALL'
        const activeStatusFilter = (status || filter || '').toUpperCase();
        if (activeStatusFilter === 'ERROR' || error === 'true') {
            tracesList = tracesList.filter(t => t.hasError);
        } else if (activeStatusFilter === 'SUCCESS' || error === 'false') {
            tracesList = tracesList.filter(t => !t.hasError);
        } else if (activeStatusFilter === 'SLOW') {
            tracesList = tracesList.filter(t => t.durationMs >= 1000);
        }

        // Apply search keyword filter (traceId or rootOperationName)
        if (search && search.trim()) {
            const query = search.trim().toLowerCase();
            tracesList = tracesList.filter(t => 
                t.traceId.toLowerCase().includes(query) || 
                t.rootOperationName.toLowerCase().includes(query) ||
                t.rootServiceName.toLowerCase().includes(query)
            );
        }

        // Sort latest first (newest business traces first)
        tracesList.sort((a, b) => b.startTimeUnix - a.startTimeUnix);

        const total = tracesList.length;
        const totalPages = Math.ceil(total / limitNum) || 1;
        const adjustedPage = Math.min(pageNum, totalPages);
        const startIndex = (adjustedPage - 1) * limitNum;
        const paginatedData = tracesList.slice(startIndex, startIndex + limitNum);

        res.json({
            success: true,
            count: paginatedData.length,
            total,
            page: adjustedPage,
            totalPages,
            limit: limitNum,
            hasMore: adjustedPage < totalPages,
            data: paginatedData
        });
    } catch (err) {
        // Non-blocking fallback if Jaeger is down
        res.status(200).json({
            success: false,
            message: 'Trace storage currently unavailable: ' + err.message,
            total: 0,
            page: 1,
            totalPages: 1,
            count: 0,
            data: []
        });
    }
};

// GET /api/traces/services - get list of traced services
exports.getServices = async (req, res, next) => {
    try {
        const jaegerRes = await fetchJaeger('/api/services');
        const services = jaegerRes.data || [];
        // Ensure known services are included if found in Jaeger or as options
        const allServices = Array.from(new Set([...services, ...KNOWN_SERVICES]));
        res.json({ success: true, data: allServices });
    } catch (err) {
        res.json({ success: true, data: KNOWN_SERVICES });
    }
};

// GET /api/traces/:traceId - get full trace waterfall
exports.getTraceById = async (req, res, next) => {
    try {
        const { traceId } = req.params;
        const jaegerRes = await fetchJaeger(`/api/traces/${encodeURIComponent(traceId)}`);
        
        if (!jaegerRes || !jaegerRes.data || jaegerRes.data.length === 0) {
            return res.status(404).json({ success: false, message: 'Trace not found' });
        }

        const formatted = formatTraceDetail(jaegerRes.data[0]);
        res.json({ success: true, data: formatted });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve trace from backend: ' + err.message
        });
    }
};
