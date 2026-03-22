---
name: api_monitor
description: "Real-time API monitoring dashboard with endpoint health, latency tracking, alerting, incident management, and webhook integrations"
---

Real-time API monitoring dashboard with endpoint health, latency tracking, alerting, incident management, and webhook integrations

## Tool Reference

### enso_api_monitor_overview (primary)

Show the API health dashboard with system status, stat cards, active alerts, and endpoint summary. Use when the user says: 'show API dashboard', 'API status', 'system health', 'monitoring overview'.

Parameters:
- `timeRange` (string): Time range for metrics: 1h, 24h, 7d, 30d (default: 24h)

### enso_api_monitor_endpoint_detail

View detailed metrics for a specific API endpoint including latency percentiles, throughput, error breakdown, and time-series data. Use when the user says: 'show endpoint details', 'drill into /api/users', 'endpoint metrics'.

Parameters:
- `endpointId` (string): Endpoint ID to view details for
- `timeRange` (string): Time range: 1h, 24h, 7d, 30d (default: 24h)

### enso_api_monitor_alerts

View active alerts, resolved alerts, and alert rule configurations. Use when the user says: 'show alerts', 'alert rules', 'what alerts are firing', 'alert history'.

Parameters:
- `tab` (string): Tab to show: active, resolved, or rules (default: active)

### enso_api_monitor_webhooks

View and manage webhook configurations, delivery logs, and payload examples. Use when the user says: 'show webhooks', 'webhook status', 'webhook config', 'delivery log'.

Parameters:
- `action` (string): Action: list, create, edit, test, delete (default: list)
- `webhookId` (string): Webhook ID for edit/test/delete actions

### enso_api_monitor_history

View historical charts for latency, throughput, and error rates with selectable time ranges. Use when the user says: 'show history', 'latency trends', '7-day metrics', 'historical data'.

Parameters:
- `timeRange` (string): Time range: 1h, 6h, 24h, 7d, 30d (default: 24h)
- `metric` (string): Metric to chart: latency, errors, throughput, all (default: all)

### enso_api_monitor_incidents

View incident timeline, manage incidents (acknowledge, resolve), and view postmortem details. Use when the user says: 'show incidents', 'incident log', 'active incidents', 'acknowledge incident'.

Parameters:
- `action` (string): Action: list, view, acknowledge, resolve (default: list)
- `incidentId` (string): Incident ID for view/acknowledge/resolve actions
