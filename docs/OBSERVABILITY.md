# Observability in IntelliShop

## 1. What observability means
Observability is the ability to measure the internal state of a system by examining its outputs. In software, this is achieved through logs, metrics, and traces. It allows developers to understand what is happening inside the application without needing to modify the code or attach a debugger.

## 2. Why IntelliShop needs observability
As IntelliShop grows, diagnosing issues such as payment failures, database timeouts, and slow requests becomes difficult in a monolithic architecture. Observability provides a standardized way to trace a user request from start to finish, ensuring that errors are correlated and root causes can be identified efficiently.

## 3. Current architecture
The current IntelliShop application is a **monolith**. All features (users, products, cart, orders, payment) run within a single Node.js/Express process.

## 4. Request context middleware
To correlate logs across a single request lifecycle, we use `AsyncLocalStorage` in our Request Context middleware. This allows us to implicitly pass request-specific data (like `requestId`) to any function or module that needs it, without passing it explicitly as a parameter through every function call.

## 5. Request ID
Every incoming HTTP request is assigned a unique `X-Request-ID` (a UUID v4). This ID is stored in the Request Context and attached to all subsequent logs generated during the processing of that request. If a client sends an `X-Request-ID` header, it is reused.

## 6. Structured JSON logging
Instead of plain text logs, we use structured JSON logs. This ensures logs are machine-readable and easy to parse, aggregate, and query in future logging platforms.

## 7. Request/response logging
Every completed HTTP request generates a final log entry containing the method, route, status code, response time, and user agent, allowing us to monitor traffic patterns and application latency.

## 8. Error logging
Errors are caught by a centralized error handler. The error message, stack trace, route, and method are logged to `error.log`. The `requestId` ensures we can trace the error back to the user's specific request.

## 9. Business event logging
Key business operations (e.g., adding to cart, completing checkout, payment success/failure) emit structured events. These are crucial for tracking business metrics and diagnosing issues at the logic level rather than just the network level.

## 10. Log file structure
Logs are written to the filesystem in `logs/`:
- `logs/app.log`: Contains all `INFO` and `WARN` level logs.
- `logs/error.log`: Contains all `ERROR` level logs and stack traces.

## 11. Sensitive-data protection
The logger includes a sanitizer function that recursively intercepts and redacts sensitive keys such as `password`, `token`, `cardNumber`, and `sessionSecret` before they are serialized to JSON. The values are replaced with `[REDACTED]`.

## 12. Health endpoint
A lightweight `GET /health` endpoint checks if the application is running and if the MongoDB database connection is active. It returns a `200 OK` if healthy and `503 Service Unavailable` if the database is disconnected.

## 13. Failure simulation
Development-only failure endpoints under `/debug/failure/*` and `/api/*` (chaos endpoints) allow developers to simulate latency, HTTP 500s, and database failures to test how the application and observability stack respond. These are disabled in production.

## 14. Log validation
We provide a script (`scripts/testLogs.js`) to parse `app.log` and `error.log` line-by-line, verifying that every entry is valid JSON.

## 15. Example INFO log
```json
{
  "timestamp": "2026-09-01T10:55:12.597Z",
  "level": "INFO",
  "service": "intellishop",
  "environment": "development",
  "message": "Products fetched",
  "count": 17,
  "requestId": "5ff79b92-b698-4c88-963b-3a391de71d45"
}
```

## 16. Example WARN log
```json
{
  "timestamp": "2026-09-01T10:48:48.766Z",
  "level": "WARN",
  "service": "intellishop",
  "environment": "development",
  "message": "Request completed with client error",
  "method": "GET",
  "route": "/favicon.ico",
  "statusCode": 404,
  "responseTime": 17,
  "requestId": "a50a4485-4454-414f-95ff-2331a584b6d6"
}
```

## 17. Example ERROR log
```json
{
  "timestamp": "2026-09-17T10:32:22.340Z",
  "level": "ERROR",
  "service": "intellishop",
  "environment": "development",
  "message": "Payment failed",
  "orderId": "test-order-123",
  "error": "Simulated payment failure from debug endpoint",
  "requestId": "2614e28b-d9a2-4294-923e-3ac849df772a"
}
```

## 18. Payment failure correlation
When a payment fails, the logs are explicitly correlated by the `requestId`:
```text
REQ-123 Payment started
REQ-123 Payment failed
REQ-123 Request completed
```

## 19. Future IntelliTrace architecture

```text
                    Client
                      |
                      v
              Request Context
                      |
                Request ID
                      |
                      v
              Request Logger
                      |
                      v
             Existing Express
                 Routes
                      |
                      v
               Controllers
                      |
                      v
                  MongoDB
                      |
                      v
             Structured Logger
                 /       \
                /         \
               v           v
          app.log      error.log
                \         /
                 \       /
                  IntelliTrace
                 Future Phase
```
