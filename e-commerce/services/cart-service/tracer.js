const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');

if (process.env.OTEL_DEBUG === 'true') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
}

const exporterUrl = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 
  (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces` : 'http://localhost:4318/v1/traces');

const traceExporter = new OTLPTraceExporter({
  url: exporterUrl,
  timeoutMillis: 3000,
});

const serviceName = process.env.OTEL_SERVICE_NAME || 'cart-service';

const isInternalUrl = (urlStr) => {
  if (!urlStr) return false;
  const lower = urlStr.toLowerCase();
  return lower.includes('/heartbeat') || 
         lower.includes('/api/v1/') || 
         lower.includes('/metrics') || 
         lower.includes('/health') ||
         lower.includes('/v1/traces') ||
         lower.includes('/v1/logs') ||
         lower.includes('/v1/metrics') ||
         lower.includes('/developer/failure-injections') ||
         lower.includes('/failure-injections') ||
         lower.includes('/developer') ||
         lower.includes('/api/traces') ||
         lower.includes('/api/logs') ||
         lower.includes('/api/metrics') ||
         lower.includes('/api/auth') ||
         lower.includes('/api/applications') ||
         lower.includes('/api/dashboard');
};

const isInternalRequest = (options) => {
  if (!options) return false;
  const port = options.port || (options.headers && options.headers.host && options.headers.host.split(':')[1]);
  const host = options.hostname || options.host || (options.headers && options.headers.host) || '';
  if (port == 4000 || port == 4318 || port == 4317 || port == 9090 || port == 16686 || port == 13133) return true;
  if (typeof host === 'string' && (host.includes('intellitrace') || host.includes('jaeger') || host.includes('prometheus'))) return true;
  const path = options.path || options.pathname || '';
  if (isInternalUrl(path)) return true;
  return false;
};

const sdk = new NodeSDK({
  serviceName,
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) => {
          const url = (req.url || '').toLowerCase();
          return url.startsWith('/health') || 
                 url.startsWith('/metrics') || 
                 url.startsWith('/api/health') || 
                 url.startsWith('/heartbeat') ||
                 url.startsWith('/developer') ||
                 url.startsWith('/failure-injections') ||
                 url.startsWith('/api/v1/failure-injections') ||
                 url.startsWith('/api/traces') ||
                 url.startsWith('/api/logs') ||
                 url.startsWith('/api/metrics') ||
                 url.startsWith('/api/auth') ||
                 url.startsWith('/api/applications') ||
                 url.startsWith('/api/dashboard') ||
                 url === '/favicon.ico';
        },
        ignoreOutgoingRequestHook: (request) => {
          return isInternalRequest(request);
        }
      }
    }),
  ],
});

try {
  sdk.start();
  console.log(`[OpenTelemetry] Tracing initialized for ${serviceName} -> ${exporterUrl}`);
} catch (err) {
  console.warn(`[OpenTelemetry] Warning: Failed to start OpenTelemetry SDK: ${err.message}`);
}

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('[OpenTelemetry] SDK terminated'))
    .catch((error) => console.log('[OpenTelemetry] Error terminating SDK', error));
});

module.exports = sdk;
