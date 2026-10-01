# Phase 3: Metrics & Performance Observability Layer

## Overview
Phase 3 extends the IntelliTrace observability project by adding an in-memory **Metrics Collector** to IntelliShop. While Phase 2 implemented structured logs to record *what* happened in the application, Phase 3 introduces metrics to measure *how* the application is performing.

## Logs vs. Metrics
- **Logs (Phase 2):** Detailed records of discrete events (e.g., a single HTTP request with its `requestId`, user details, exact response time, and errors). Logs are primarily used for tracing and debugging specific issues.
- **Metrics (Phase 3):** Aggregated numerical data over time (e.g., total requests, error rates, average response times). Metrics are primarily used for monitoring the overall health, performance, and trends of the system.

## Metrics Architecture

```
Client
   ↓
Express
   ↓
Request Context
   ↓
Request Logger (Measures response time & updates metrics)
   ↓
Controller
   ↓
MongoDB (Mongoose Plugin measures DB duration)
   ↓
Response
   ↓
Metrics Collector
   ↓
/metrics
```
Logging and metrics are maintained as two separate observability outputs, deriving from the exact same request lifecycle.

## What is Tracked

### HTTP Status Categories
Responses are bucketed into standard HTTP status ranges:
- **2xx (Successful):** The request was successfully received, understood, and accepted.
- **3xx (Redirect):** Further action needs to be taken by the user agent in order to fulfill the request.
- **4xx (Client Errors):** The request contains bad syntax or cannot be fulfilled (e.g., 404 Not Found). This increases the `clientErrors` and `totalErrors` count.
- **5xx (Server Errors):** The server failed to fulfill an apparently valid request (e.g., 500 Internal Server Error). This increases the `serverErrors` and `totalErrors` count.

### Request Metrics
- **totalRequests:** The total number of HTTP requests processed by the server.
- **error count (totalErrors):** The total number of responses with status 4xx or 5xx.

### Response Time Metrics
- **totalResponseTime:** The cumulative response time of all requests.
- **averageResponseTime:** The average time taken to process a request (totalResponseTime / totalRequests).
- **minimumResponseTime & maximumResponseTime:** The fastest and slowest requests processed.

### Endpoint-Level Metrics
Performance is tracked per individual API endpoint/route (e.g., `GET /products`, `POST /cart/add`). This allows granular visibility into which specific routes are slow or failing.

### Database Performance Metrics
Lightweight measurements on Mongoose operations (like `find`, `save`, `updateOne`). Tracks the number of operations, their success/failure, and durations.

### Uptime
The number of seconds the server has been running since it was started.

## The `/metrics` Endpoint
You can fetch the current aggregated metrics by visiting `GET /metrics`.
It returns a JSON object containing the overall service stats, requests, response times, endpoint-level metrics, and database metrics.

## Limitations & Design Choices
- **In-Memory Store:** Metrics are currently stored in memory. This means **metrics reset** every time the Node.js application restarts. This is intentional for Phase 3 to keep the architecture simple.
- **No External Systems:** We are intentionally not using Prometheus, Grafana, or Redis yet. Those belong to future phases (Phase 4+).
