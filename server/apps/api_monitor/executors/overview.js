var timeRange = (params.timeRange || "").trim() || "24h";

// Mock data — in production, replace with ctx.fetch() calls to monitoring APIs
var now = new Date().toISOString();

var endpoints = [
  { id: "ep-1", path: "/api/v1/users", method: "GET", status: "healthy", rps: 450, latency_p50: 45, latency_p95: 120, latency_p99: 280, errorRate: 0.1, uptime: 99.99, lastChecked: now, sparkline: [42, 44, 46, 43, 45, 48, 50, 47, 44, 42, 45, 45] },
  { id: "ep-2", path: "/api/v1/users", method: "POST", status: "healthy", rps: 120, latency_p50: 85, latency_p95: 210, latency_p99: 450, errorRate: 0.3, uptime: 99.98, lastChecked: now, sparkline: [80, 82, 88, 90, 86, 84, 82, 85, 87, 83, 84, 85] },
  { id: "ep-3", path: "/api/v1/orders", method: "POST", status: "critical", rps: 95, latency_p50: 120, latency_p95: 340, latency_p99: 890, errorRate: 8.7, uptime: 99.12, lastChecked: now, sparkline: [82, 78, 75, 80, 88, 95, 105, 110, 115, 120, 135, 120] },
  { id: "ep-4", path: "/api/v1/orders", method: "GET", status: "healthy", rps: 280, latency_p50: 55, latency_p95: 140, latency_p99: 310, errorRate: 0.2, uptime: 99.97, lastChecked: now, sparkline: [52, 54, 56, 53, 55, 58, 56, 54, 52, 55, 56, 55] },
  { id: "ep-5", path: "/api/v1/products", method: "GET", status: "warning", rps: 380, latency_p50: 68, latency_p95: 190, latency_p99: 520, errorRate: 1.2, uptime: 99.85, lastChecked: now, sparkline: [62, 64, 66, 70, 72, 68, 65, 63, 66, 69, 70, 68] },
  { id: "ep-6", path: "/api/v1/search", method: "GET", status: "warning", rps: 310, latency_p50: 180, latency_p95: 890, latency_p99: 3200, errorRate: 0.4, uptime: 99.92, lastChecked: now, sparkline: [120, 130, 145, 160, 175, 190, 210, 195, 180, 170, 185, 180] },
  { id: "ep-7", path: "/api/v1/auth/login", method: "POST", status: "healthy", rps: 85, latency_p50: 95, latency_p95: 250, latency_p99: 480, errorRate: 0.5, uptime: 99.96, lastChecked: now, sparkline: [90, 92, 95, 98, 96, 94, 92, 95, 97, 93, 94, 95] },
  { id: "ep-8", path: "/api/v1/payments", method: "POST", status: "healthy", rps: 45, latency_p50: 210, latency_p95: 450, latency_p99: 780, errorRate: 0.2, uptime: 99.99, lastChecked: now, sparkline: [200, 205, 215, 210, 208, 212, 218, 215, 210, 205, 208, 210] }
];

var hasCritical = endpoints.some(function(e) { return e.status === "critical"; });
var hasWarning = endpoints.some(function(e) { return e.status === "warning"; });
var systemStatus = hasCritical ? "critical" : hasWarning ? "degraded" : "healthy";

var totalUptime = endpoints.reduce(function(sum, e) { return sum + e.uptime; }, 0) / endpoints.length;
var avgLatency = Math.round(endpoints.reduce(function(sum, e) { return sum + e.latency_p50; }, 0) / endpoints.length);
var activeAlertCount = endpoints.filter(function(e) { return e.status !== "healthy"; }).length;

var result = {
  tool: "enso_api_monitor_overview",
  title: "API Health Dashboard",
  lastUpdated: now,
  timeRange: timeRange,
  systemStatus: systemStatus,
  statCards: [
    { key: "endpoints", label: "Endpoints Monitored", value: endpoints.length, format: "number", change: 0, changeLabel: "no change", status: "healthy", sparkline: [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8] },
    { key: "uptime", label: "Overall Uptime", value: parseFloat(totalUptime.toFixed(2)), format: "percent", change: -0.03, changeLabel: "vs yesterday", status: totalUptime >= 99.5 ? "healthy" : "warning", sparkline: [99.99, 99.99, 99.98, 99.97, 99.95, 99.94, 99.90, 99.85, 99.88, 99.92, 99.94, 99.94] },
    { key: "alerts", label: "Active Alerts", value: activeAlertCount, format: "number", change: 2, changeLabel: "vs yesterday", status: activeAlertCount > 2 ? "warning" : "healthy", sparkline: [0, 0, 1, 1, 0, 0, 0, 1, 2, 3, 3, 3] },
    { key: "latency", label: "Avg Latency", value: avgLatency, unit: "ms", format: "number", change: -12, changeLabel: "vs yesterday", status: avgLatency < 200 ? "healthy" : "warning", sparkline: [165, 158, 152, 148, 145, 142, 138, 140, 155, 160, 148, 142] }
  ],
  activeAlerts: [
    { id: "alert-001", severity: "critical", title: "High 5xx Error Rate", endpoint: "/api/v1/orders", method: "POST", value: "8.7%", threshold: "5%", duration: "12 min", firedAt: now },
    { id: "alert-002", severity: "warning", title: "Elevated p99 Latency", endpoint: "/api/v1/search", method: "GET", value: "3200ms", threshold: "2000ms", duration: "25 min", firedAt: now },
    { id: "alert-003", severity: "info", title: "Rate Limit Spike", endpoint: "/api/v1/products", method: "GET", value: "12%", threshold: "10%", duration: "8 min", firedAt: now }
  ],
  endpoints: endpoints
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
