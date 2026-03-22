var action = (params.action || "").trim() || "list";
var incidentId = (params.incidentId || "").trim();

var incidents = [
  { id: "inc-100", title: "High error rate on order processing endpoint", severity: "critical", status: "investigating", startedAt: new Date(Date.now() - 720000).toISOString(), resolvedAt: null, duration: "12 min (ongoing)", affected: "/api/v1/orders POST", impact: "8.7% 5xx error rate", triggeredBy: "alert-001", assignee: null, notes: "" },
  { id: "inc-101", title: "Database connection pool exhausted", severity: "critical", status: "resolved", startedAt: new Date(Date.now() - 86400000).toISOString(), resolvedAt: new Date(Date.now() - 84780000).toISOString(), duration: "27 min", affected: "/api/v1/orders, /api/v1/users", impact: "Complete outage for write operations", triggeredBy: "alert-010", assignee: "ops-team", notes: "Root cause: connection leak in v2.4.0" },
  { id: "inc-102", title: "Search service latency spike", severity: "warning", status: "resolved", startedAt: new Date(Date.now() - 172800000).toISOString(), resolvedAt: new Date(Date.now() - 170700000).toISOString(), duration: "35 min", affected: "/api/v1/search", impact: "p99 > 5000ms", triggeredBy: "alert-002", assignee: "search-team", notes: "Elasticsearch index rebuild caused temporary degradation" },
  { id: "inc-103", title: "Payment gateway timeout", severity: "critical", status: "resolved", startedAt: new Date(Date.now() - 259200000).toISOString(), resolvedAt: new Date(Date.now() - 258120000).toISOString(), duration: "18 min", affected: "/api/v1/payments POST", impact: "100% failure on payment processing", triggeredBy: "alert-015", assignee: "payments-team", notes: "Third-party payment provider outage" },
  { id: "inc-104", title: "Authentication service degraded", severity: "warning", status: "resolved", startedAt: new Date(Date.now() - 345600000).toISOString(), resolvedAt: new Date(Date.now() - 342900000).toISOString(), duration: "45 min", affected: "/api/v1/auth/login", impact: "50% increase in login latency", triggeredBy: "alert-020", assignee: "auth-team", notes: "Redis cluster failover" },
  { id: "inc-105", title: "CDN cache miss storm", severity: "warning", status: "resolved", startedAt: new Date(Date.now() - 432000000).toISOString(), resolvedAt: new Date(Date.now() - 430200000).toISOString(), duration: "30 min", affected: "/api/v1/products", impact: "3x latency increase", triggeredBy: "alert-025", assignee: "infra-team", notes: "CDN config change cleared cache" },
  { id: "inc-106", title: "Rate limiting misconfiguration", severity: "info", status: "resolved", startedAt: new Date(Date.now() - 518400000).toISOString(), resolvedAt: new Date(Date.now() - 517500000).toISOString(), duration: "15 min", affected: "/api/v1/products", impact: "Legitimate traffic rate-limited", triggeredBy: "alert-030", assignee: "api-team", notes: "Rate limit threshold set too low" },
  { id: "inc-107", title: "SSL certificate renewal failure", severity: "critical", status: "resolved", startedAt: new Date(Date.now() - 604800000).toISOString(), resolvedAt: new Date(Date.now() - 602700000).toISOString(), duration: "35 min", affected: "All endpoints", impact: "HTTPS handshake failures", triggeredBy: "alert-035", assignee: "infra-team", notes: "Auto-renewal failed, manual cert rotation applied" }
];

var activeCount = incidents.filter(function(i) { return i.status !== "resolved"; }).length;
var resolvedRecent = incidents.filter(function(i) { return i.status === "resolved"; }).length;
var durations = incidents.filter(function(i) { return i.status === "resolved"; }).map(function(i) {
  var mins = parseInt(i.duration) || 0;
  return mins;
});
var mttr = durations.length > 0 ? (durations.reduce(function(s, d) { return s + d; }, 0) / durations.length / 60) : 0;

var result = {
  tool: "enso_api_monitor_incidents",
  action: action,
  summary: {
    active: activeCount,
    resolved_7d: resolvedRecent,
    mttr_hours: parseFloat(mttr.toFixed(2)),
    total_30d: incidents.length
  },
  incidents: incidents
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
