var tab = (params.tab || "").trim() || "active";

var activeAlerts = [
  { id: "alert-001", ruleId: "rule-1", severity: "critical", title: "High 5xx Error Rate \u2014 POST /api/v1/orders", description: "5xx error rate exceeded 5% threshold for 12 minutes", metric: "error_rate_5xx", currentValue: 8.7, threshold: 5.0, unit: "%", endpoint: "/api/v1/orders", method: "POST", status: "firing", firedAt: new Date(Date.now() - 720000).toISOString(), channels: ["slack-ops", "pagerduty-primary"], duration: "12 min" },
  { id: "alert-002", ruleId: "rule-3", severity: "warning", title: "Elevated p99 Latency \u2014 GET /api/v1/search", description: "p99 latency exceeded 2000ms for 25 minutes", metric: "latency_p99", currentValue: 3200, threshold: 2000, unit: "ms", endpoint: "/api/v1/search", method: "GET", status: "firing", firedAt: new Date(Date.now() - 1500000).toISOString(), channels: ["slack-ops"], duration: "25 min" },
  { id: "alert-003", ruleId: "rule-5", severity: "info", title: "Rate Limit Spike \u2014 GET /api/v1/products", description: "429 response rate exceeded 10% threshold for 8 minutes", metric: "rate_limit_429", currentValue: 12.0, threshold: 10.0, unit: "%", endpoint: "/api/v1/products", method: "GET", status: "firing", firedAt: new Date(Date.now() - 480000).toISOString(), channels: [], duration: "8 min" }
];

var resolvedAlerts = [
  { id: "alert-010", severity: "critical", title: "Endpoint Down \u2014 POST /api/v1/payments", status: "resolved", firedAt: new Date(Date.now() - 86400000).toISOString(), resolvedAt: new Date(Date.now() - 85380000).toISOString(), duration: "17 min" },
  { id: "alert-011", severity: "warning", title: "Low Throughput \u2014 GET /api/v1/users", status: "resolved", firedAt: new Date(Date.now() - 108000000).toISOString(), resolvedAt: new Date(Date.now() - 106500000).toISOString(), duration: "25 min" },
  { id: "alert-012", severity: "warning", title: "Elevated Error Rate \u2014 GET /api/v1/products", status: "resolved", firedAt: new Date(Date.now() - 172800000).toISOString(), resolvedAt: new Date(Date.now() - 170700000).toISOString(), duration: "35 min" }
];

var rules = [
  { id: "rule-1", name: "High 5xx Error Rate", metric: "error_rate_5xx", condition: ">", threshold: 5.0, unit: "%", window: "60s", severity: "critical", channels: ["slack-ops", "pagerduty-primary"], enabled: true },
  { id: "rule-2", name: "Extreme Error Rate", metric: "error_rate_5xx", condition: ">", threshold: 25.0, unit: "%", window: "60s", severity: "critical", channels: ["slack-ops", "pagerduty-primary", "slack-exec"], enabled: true },
  { id: "rule-3", name: "High p99 Latency", metric: "latency_p99", condition: ">", threshold: 2000, unit: "ms", window: "5min", severity: "warning", channels: ["slack-ops"], enabled: true },
  { id: "rule-4", name: "Low Throughput", metric: "request_rate", condition: "< baseline", threshold: 50, unit: "%", window: "10min", severity: "warning", channels: ["slack-ops"], enabled: true },
  { id: "rule-5", name: "Rate Limit Spike", metric: "rate_limit_429", condition: ">", threshold: 10.0, unit: "%", window: "5min", severity: "info", channels: [], enabled: true },
  { id: "rule-6", name: "Health Check Failure", metric: "consecutive_failures", condition: ">=", threshold: 3, unit: "count", window: "instant", severity: "critical", channels: ["slack-ops", "pagerduty-primary"], enabled: true },
  { id: "rule-7", name: "Latency Anomaly", metric: "latency_p99", condition: "anomaly", threshold: 2.5, unit: "sigma", window: "7d baseline", severity: "warning", channels: ["slack-ops"], enabled: false },
  { id: "rule-8", name: "Error + Latency Composite", metric: "composite", condition: "AND", threshold: null, unit: "", window: "60s", severity: "critical", channels: ["slack-ops", "pagerduty-primary"], enabled: true }
];

var result = {
  tool: "enso_api_monitor_alerts",
  tab: tab,
  summary: {
    firing: activeAlerts.filter(function(a) { return a.severity === "critical"; }).length,
    warning: activeAlerts.filter(function(a) { return a.severity === "warning"; }).length,
    resolved_24h: resolvedAlerts.length,
    total_rules: rules.length
  },
  activeAlerts: activeAlerts,
  resolvedAlerts: resolvedAlerts,
  rules: rules
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
