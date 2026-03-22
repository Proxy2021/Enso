var timeRange = (params.timeRange || "").trim() || "24h";
var metric = (params.metric || "").trim() || "all";

var latencyChart = [
  { time: "Mar 21 15:00", p50: 78, p95: 195, p99: 380 },
  { time: "Mar 21 16:00", p50: 82, p95: 210, p99: 420 },
  { time: "Mar 21 17:00", p50: 85, p95: 220, p99: 450 },
  { time: "Mar 21 18:00", p50: 80, p95: 200, p99: 400 },
  { time: "Mar 21 19:00", p50: 72, p95: 185, p99: 360 },
  { time: "Mar 21 20:00", p50: 68, p95: 170, p99: 330 },
  { time: "Mar 21 21:00", p50: 65, p95: 160, p99: 310 },
  { time: "Mar 21 22:00", p50: 60, p95: 150, p99: 290 },
  { time: "Mar 21 23:00", p50: 55, p95: 140, p99: 270 },
  { time: "Mar 22 00:00", p50: 52, p95: 135, p99: 260 },
  { time: "Mar 22 01:00", p50: 48, p95: 125, p99: 240 },
  { time: "Mar 22 02:00", p50: 45, p95: 118, p99: 230 },
  { time: "Mar 22 03:00", p50: 42, p95: 112, p99: 220 },
  { time: "Mar 22 04:00", p50: 40, p95: 108, p99: 210 },
  { time: "Mar 22 05:00", p50: 44, p95: 115, p99: 225 },
  { time: "Mar 22 06:00", p50: 52, p95: 135, p99: 260 },
  { time: "Mar 22 07:00", p50: 65, p95: 165, p99: 320 },
  { time: "Mar 22 08:00", p50: 82, p95: 210, p99: 420 },
  { time: "Mar 22 09:00", p50: 95, p95: 240, p99: 490 },
  { time: "Mar 22 10:00", p50: 102, p95: 255, p99: 520 },
  { time: "Mar 22 11:00", p50: 108, p95: 270, p99: 550 },
  { time: "Mar 22 12:00", p50: 115, p95: 290, p99: 600 },
  { time: "Mar 22 13:00", p50: 110, p95: 280, p99: 570 },
  { time: "Mar 22 14:00", p50: 120, p95: 310, p99: 680 }
];

var errorRateChart = [
  { time: "Mar 21 15:00", total: 0.34, rate_4xx: 0.0, rate_5xx: 0.34 },
  { time: "Mar 21 16:00", total: 0.43, rate_4xx: 0.0, rate_5xx: 0.43 },
  { time: "Mar 21 17:00", total: 0.46, rate_4xx: 0.0, rate_5xx: 0.46 },
  { time: "Mar 21 18:00", total: 0.33, rate_4xx: 0.0, rate_5xx: 0.33 },
  { time: "Mar 21 19:00", total: 0.26, rate_4xx: 0.0, rate_5xx: 0.26 },
  { time: "Mar 21 20:00", total: 0.31, rate_4xx: 0.0, rate_5xx: 0.31 },
  { time: "Mar 21 21:00", total: 0.19, rate_4xx: 0.0, rate_5xx: 0.19 },
  { time: "Mar 21 22:00", total: 0.26, rate_4xx: 0.0, rate_5xx: 0.26 },
  { time: "Mar 21 23:00", total: 0.0, rate_4xx: 0.0, rate_5xx: 0.0 },
  { time: "Mar 22 00:00", total: 0.0, rate_4xx: 0.0, rate_5xx: 0.0 },
  { time: "Mar 22 01:00", total: 0.0, rate_4xx: 0.0, rate_5xx: 0.0 },
  { time: "Mar 22 02:00", total: 0.0, rate_4xx: 0.0, rate_5xx: 0.0 },
  { time: "Mar 22 03:00", total: 0.0, rate_4xx: 0.0, rate_5xx: 0.0 },
  { time: "Mar 22 04:00", total: 0.0, rate_4xx: 0.0, rate_5xx: 0.0 },
  { time: "Mar 22 05:00", total: 0.0, rate_4xx: 0.0, rate_5xx: 0.0 },
  { time: "Mar 22 06:00", total: 0.26, rate_4xx: 0.0, rate_5xx: 0.26 },
  { time: "Mar 22 07:00", total: 0.32, rate_4xx: 0.0, rate_5xx: 0.32 },
  { time: "Mar 22 08:00", total: 0.45, rate_4xx: 0.0, rate_5xx: 0.45 },
  { time: "Mar 22 09:00", total: 0.57, rate_4xx: 0.0, rate_5xx: 0.57 },
  { time: "Mar 22 10:00", total: 0.68, rate_4xx: 0.0, rate_5xx: 0.68 },
  { time: "Mar 22 11:00", total: 0.80, rate_4xx: 0.0, rate_5xx: 0.80 },
  { time: "Mar 22 12:00", total: 1.07, rate_4xx: 0.0, rate_5xx: 1.07 },
  { time: "Mar 22 13:00", total: 1.02, rate_4xx: 0.0, rate_5xx: 1.02 },
  { time: "Mar 22 14:00", total: 1.76, rate_4xx: 0.0, rate_5xx: 1.76 }
];

var incidents = [
  { id: "inc-100", title: "High error rate on order processing", severity: "critical", status: "investigating", startedAt: new Date(Date.now() - 720000).toISOString(), resolvedAt: null, duration: "12 min (ongoing)", affected: "/api/v1/orders POST" },
  { id: "inc-101", title: "Database connection pool exhausted", severity: "critical", status: "resolved", startedAt: new Date(Date.now() - 86400000).toISOString(), resolvedAt: new Date(Date.now() - 84780000).toISOString(), duration: "27 min", affected: "/api/v1/orders, /api/v1/users" },
  { id: "inc-102", title: "Search service latency spike", severity: "warning", status: "resolved", startedAt: new Date(Date.now() - 172800000).toISOString(), resolvedAt: new Date(Date.now() - 170700000).toISOString(), duration: "35 min", affected: "/api/v1/search" }
];

var annotations = [
  { time: "Mar 22 13:50", label: "Deploy v2.4.1", type: "deployment" },
  { time: "Mar 21 10:00", label: "Deploy v2.4.0", type: "deployment" },
  { time: "Mar 21 09:15", label: "DB Pool Incident", type: "incident" }
];

var result = {
  tool: "enso_api_monitor_history",
  timeRange: timeRange,
  metric: metric,
  resolution: "1h",
  availableRanges: ["1h", "6h", "24h", "7d", "30d"],
  latencyChart: latencyChart,
  errorRateChart: errorRateChart,
  incidents: incidents,
  annotations: annotations
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
