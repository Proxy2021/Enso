var endpointId = (params.endpointId || "").trim();
var timeRange = (params.timeRange || "").trim() || "24h";

if (!endpointId) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_api_monitor_endpoint_detail", error: "endpointId is required" }) }] };
}

// Mock endpoint data keyed by ID
var endpointMap = {
  "ep-1": { id: "ep-1", path: "/api/v1/users", method: "GET", status: "healthy", uptime: 99.99, rps: 450, latency_p50: 45, latency_p95: 120, latency_p99: 280, errorRate: 0.1, tags: { service: "user-service", version: "3.1.0", environment: "production" } },
  "ep-2": { id: "ep-2", path: "/api/v1/users", method: "POST", status: "healthy", uptime: 99.98, rps: 120, latency_p50: 85, latency_p95: 210, latency_p99: 450, errorRate: 0.3, tags: { service: "user-service", version: "3.1.0", environment: "production" } },
  "ep-3": { id: "ep-3", path: "/api/v1/orders", method: "POST", status: "critical", uptime: 99.12, rps: 95, latency_p50: 120, latency_p95: 340, latency_p99: 890, errorRate: 8.7, tags: { service: "order-service", version: "2.4.1", environment: "production" } },
  "ep-4": { id: "ep-4", path: "/api/v1/orders", method: "GET", status: "healthy", uptime: 99.97, rps: 280, latency_p50: 55, latency_p95: 140, latency_p99: 310, errorRate: 0.2, tags: { service: "order-service", version: "2.4.1", environment: "production" } },
  "ep-5": { id: "ep-5", path: "/api/v1/products", method: "GET", status: "warning", uptime: 99.85, rps: 380, latency_p50: 68, latency_p95: 190, latency_p99: 520, errorRate: 1.2, tags: { service: "catalog-service", version: "1.8.2", environment: "production" } },
  "ep-6": { id: "ep-6", path: "/api/v1/search", method: "GET", status: "warning", uptime: 99.92, rps: 310, latency_p50: 180, latency_p95: 890, latency_p99: 3200, errorRate: 0.4, tags: { service: "search-service", version: "4.0.3", environment: "production" } },
  "ep-7": { id: "ep-7", path: "/api/v1/auth/login", method: "POST", status: "healthy", uptime: 99.96, rps: 85, latency_p50: 95, latency_p95: 250, latency_p99: 480, errorRate: 0.5, tags: { service: "auth-service", version: "2.0.1", environment: "production" } },
  "ep-8": { id: "ep-8", path: "/api/v1/payments", method: "POST", status: "healthy", uptime: 99.99, rps: 45, latency_p50: 210, latency_p95: 450, latency_p99: 780, errorRate: 0.2, tags: { service: "payment-service", version: "1.5.0", environment: "production" } }
};

var ep = endpointMap[endpointId];
if (!ep) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_api_monitor_endpoint_detail", error: "Endpoint not found: " + endpointId }) }] };
}

var latencyTimeSeries = [
  { time: "00:00", p50: Math.round(ep.latency_p50 * 0.7), p95: Math.round(ep.latency_p95 * 0.7), p99: Math.round(ep.latency_p99 * 0.7) },
  { time: "02:00", p50: Math.round(ep.latency_p50 * 0.6), p95: Math.round(ep.latency_p95 * 0.6), p99: Math.round(ep.latency_p99 * 0.6) },
  { time: "04:00", p50: Math.round(ep.latency_p50 * 0.6), p95: Math.round(ep.latency_p95 * 0.6), p99: Math.round(ep.latency_p99 * 0.55) },
  { time: "06:00", p50: Math.round(ep.latency_p50 * 0.7), p95: Math.round(ep.latency_p95 * 0.7), p99: Math.round(ep.latency_p99 * 0.65) },
  { time: "08:00", p50: Math.round(ep.latency_p50 * 0.8), p95: Math.round(ep.latency_p95 * 0.8), p99: Math.round(ep.latency_p99 * 0.75) },
  { time: "10:00", p50: Math.round(ep.latency_p50 * 0.85), p95: Math.round(ep.latency_p95 * 0.85), p99: Math.round(ep.latency_p99 * 0.85) },
  { time: "12:00", p50: Math.round(ep.latency_p50 * 0.95), p95: Math.round(ep.latency_p95 * 0.95), p99: Math.round(ep.latency_p99 * 0.95) },
  { time: "14:00", p50: ep.latency_p50, p95: ep.latency_p95, p99: ep.latency_p99 }
];

var errRate = ep.errorRate || 0;
var statusCodeBreakdown = [
  { code: "2xx", count: Math.round(ep.rps * 3600 * (1 - errRate / 100)), percentage: parseFloat((100 - errRate).toFixed(1)) },
  { code: "4xx", count: Math.round(ep.rps * 3600 * 0.005), percentage: 0.5 },
  { code: "5xx", count: Math.round(ep.rps * 3600 * errRate / 100), percentage: errRate }
];

var result = {
  tool: "enso_api_monitor_endpoint_detail",
  endpoint: ep,
  timeRange: timeRange,
  latencyTimeSeries: latencyTimeSeries,
  statusCodeBreakdown: statusCodeBreakdown,
  relatedAlerts: [],
  deployments: [
    { version: ep.tags.version, deployedAt: new Date(Date.now() - 3600000).toISOString(), note: "Latest deployment" }
  ]
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
