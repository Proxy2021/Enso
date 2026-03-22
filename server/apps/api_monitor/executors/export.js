var format = (params.format || "").trim() || "text";
var timeRange = (params.timeRange || "").trim() || "24h";
var endpointId = (params.endpointId || "").trim();

// Gather endpoint data
var endpoints = [
  { id: "ep-1", path: "/api/v1/users", method: "GET", status: "healthy", rps: 450, latency_p50: 45, latency_p95: 120, latency_p99: 280, errorRate: 0.1, uptime: 99.99 },
  { id: "ep-2", path: "/api/v1/users", method: "POST", status: "healthy", rps: 120, latency_p50: 85, latency_p95: 210, latency_p99: 450, errorRate: 0.3, uptime: 99.98 },
  { id: "ep-3", path: "/api/v1/orders", method: "POST", status: "critical", rps: 95, latency_p50: 120, latency_p95: 340, latency_p99: 890, errorRate: 8.7, uptime: 99.12 },
  { id: "ep-4", path: "/api/v1/orders", method: "GET", status: "healthy", rps: 280, latency_p50: 55, latency_p95: 140, latency_p99: 310, errorRate: 0.2, uptime: 99.97 },
  { id: "ep-5", path: "/api/v1/products", method: "GET", status: "warning", rps: 380, latency_p50: 68, latency_p95: 190, latency_p99: 520, errorRate: 1.2, uptime: 99.85 },
  { id: "ep-6", path: "/api/v1/search", method: "GET", status: "warning", rps: 310, latency_p50: 180, latency_p95: 890, latency_p99: 3200, errorRate: 0.4, uptime: 99.92 },
  { id: "ep-7", path: "/api/v1/auth/login", method: "POST", status: "healthy", rps: 85, latency_p50: 95, latency_p95: 250, latency_p99: 480, errorRate: 0.5, uptime: 99.96 },
  { id: "ep-8", path: "/api/v1/payments", method: "POST", status: "healthy", rps: 45, latency_p50: 210, latency_p95: 450, latency_p99: 780, errorRate: 0.2, uptime: 99.99 }
];

var filtered = endpointId ? endpoints.filter(function(ep) { return ep.id === endpointId; }) : endpoints;

var lines = [];
lines.push("API Monitor Export — " + timeRange + " — " + new Date().toISOString());
lines.push("═".repeat(60));
lines.push("");

if (format === "csv") {
  lines.push("id,path,method,status,rps,p50_ms,p95_ms,p99_ms,error_rate_%,uptime_%");
  filtered.forEach(function(ep) {
    lines.push([ep.id, ep.path, ep.method, ep.status, ep.rps, ep.latency_p50, ep.latency_p95, ep.latency_p99, ep.errorRate, ep.uptime].join(","));
  });
} else {
  filtered.forEach(function(ep) {
    lines.push(ep.method + " " + ep.path + " [" + ep.status.toUpperCase() + "]");
    lines.push("  Throughput: " + ep.rps + " req/s");
    lines.push("  Latency:   p50=" + ep.latency_p50 + "ms  p95=" + ep.latency_p95 + "ms  p99=" + ep.latency_p99 + "ms");
    lines.push("  Error Rate: " + ep.errorRate + "%");
    lines.push("  Uptime:     " + ep.uptime + "%");
    lines.push("");
  });

  var totalRps = filtered.reduce(function(s, ep) { return s + ep.rps; }, 0);
  var avgUptime = filtered.reduce(function(s, ep) { return s + ep.uptime; }, 0) / Math.max(1, filtered.length);
  var avgLat = Math.round(filtered.reduce(function(s, ep) { return s + ep.latency_p50; }, 0) / Math.max(1, filtered.length));

  lines.push("═".repeat(60));
  lines.push("Summary: " + filtered.length + " endpoints, " + totalRps + " total req/s, avg p50=" + avgLat + "ms, avg uptime=" + avgUptime.toFixed(2) + "%");
}

var result = {
  tool: "enso_api_monitor_export",
  format: format,
  timeRange: timeRange,
  endpointCount: filtered.length,
  summary: lines.join("\n")
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
