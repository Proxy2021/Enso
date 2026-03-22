var action = (params.action || "").trim() || "list";
var webhookId = (params.webhookId || "").trim();

var webhooks = [
  { id: "wh-1", name: "Slack \u2014 #api-alerts", type: "slack", url: "https://hooks.slack.com/services/T00000/B00000/XXXXX", events: ["alert.firing", "alert.resolved"], severityFilter: ["critical", "warning"], enabled: true, lastTriggered: new Date(Date.now() - 720000).toISOString(), delivered: 142, failed: 3, total: 145, successRate: 97.9 },
  { id: "wh-2", name: "PagerDuty \u2014 Primary", type: "pagerduty", url: "https://events.pagerduty.com/v2/enqueue", events: ["alert.firing", "alert.resolved"], severityFilter: ["critical"], enabled: true, lastTriggered: new Date(Date.now() - 717000).toISOString(), delivered: 28, failed: 1, total: 29, successRate: 96.6 },
  { id: "wh-3", name: "Slack \u2014 #exec-alerts", type: "slack", url: "https://hooks.slack.com/services/T00000/B11111/YYYYY", events: ["alert.firing"], severityFilter: ["critical"], enabled: true, lastTriggered: new Date(Date.now() - 86400000).toISOString(), delivered: 12, failed: 0, total: 12, successRate: 100.0 },
  { id: "wh-4", name: "Custom \u2014 Incident Tracker", type: "http", url: "https://incidents.example.com/api/webhook", events: ["alert.firing", "alert.resolved", "incident.created"], severityFilter: ["critical", "warning", "info"], enabled: false, lastTriggered: new Date(Date.now() - 259200000).toISOString(), delivered: 85, failed: 12, total: 97, successRate: 87.6 }
];

var webhookPayloadExample = {
  event_type: "alert.firing",
  alert: {
    id: "alert-001",
    name: "High 5xx Error Rate \u2014 POST /api/v1/orders",
    severity: "critical",
    status: "firing",
    metric: "error_rate_5xx",
    currentValue: 8.7,
    threshold: 5.0,
    unit: "%",
    endpoint: "/api/v1/orders",
    method: "POST",
    firedAt: new Date().toISOString(),
    description: "5xx error rate exceeded 5% threshold for 2 minutes"
  },
  metadata: {
    source: "api-monitor",
    version: "1.0"
  }
};

var result = {
  tool: "enso_api_monitor_webhooks",
  action: action,
  webhooks: webhooks,
  webhookPayloadExample: webhookPayloadExample
};

return { content: [{ type: "text", text: JSON.stringify(result) }] };
