---
name: error_monitor
description: "Real-time error monitoring dashboard: error summary with severity breakdown, error trends over time, category analysis, recent error feed, fix tracking, system health score, circuit breaker states, error code analysis, recurring error pattern detection, and actionable recommendations. Reads from Enso's action log, error log, circuit breakers, and error rate monitor."
---

Real-time error monitoring dashboard: error summary with severity breakdown, error trends over time, category analysis, recent error feed, fix tracking, system health score, circuit breaker states, error code analysis, recurring error pattern detection, and actionable recommendations. Reads from Enso's action log, error log, circuit breakers, and error rate monitor.

## Tool Reference

### enso_error_monitor_overview (primary)

Get error monitoring overview: total errors, severity breakdown (critical/error/warning/info), top error categories, and recent errors for a given time window. Use when the user says: 'show error dashboard', 'error overview', 'system errors', 'error monitor', 'how many errors', 'error health'.

Parameters:
- `hours` (number): Time window in hours (1-168, default: 24)

### enso_error_monitor_errors

Get recent error entries with optional severity filter. Returns chronological error list with full details including category, message, severity, requestId, and timestamps. Use when the user says: 'show recent errors', 'error list', 'what errors happened', 'show critical errors', 'error log'.

Parameters:
- `count` (number): Number of errors to return (1-200, default: 50)
- `severity` (string): Filter by severity: 'all', 'critical', 'error', 'warning', 'info' (default: 'all')

### enso_error_monitor_trends

Get error trends over time — hourly error counts bucketed by severity for a given time window. Shows how error rates change over hours. Use when the user says: 'error trends', 'error rate', 'error frequency', 'error timeline', 'when do errors happen'.

Parameters:
- `hours` (number): Time window in hours (1-168, default: 24)

### enso_error_monitor_categories

Get error breakdown by category with counts, severity distribution, and last occurrence. Identifies which subsystems produce the most errors. Use when the user says: 'error categories', 'where are errors coming from', 'error sources', 'error breakdown', 'which module has errors'.

Parameters:
- `hours` (number): Time window in hours (1-168, default: 24)

### enso_error_monitor_fixes

Get bug fix records — tracked resolutions of past errors with description, original error, resolution applied, and acknowledgement status. Use when the user says: 'show fixes', 'bug fixes', 'what was fixed', 'fix history', 'acknowledged fixes'.

Parameters:
- `action` (string): Action: 'list' to view fixes, 'acknowledge' to mark fix as seen (default: 'list')
- `fixId` (string): Fix ID to acknowledge (required for acknowledge action)

### enso_error_monitor_activity

Get full action log feed — all backend operations (actions, errors, builds, system events, claude-code sessions) with optional type filter. Use when the user says: 'show activity log', 'action log', 'what happened', 'system activity', 'recent operations'.

Parameters:
- `count` (number): Number of entries to return (1-200, default: 50)
- `type` (string): Filter by type: 'all', 'action', 'error', 'fix', 'build', 'system', 'claude-code' (default: 'all')

### enso_error_monitor_circuit_breakers

Get circuit breaker states for all protected external services (LLM, Brave Search). Shows whether circuits are closed (healthy), open (failing), or half-open (recovering). Use when the user says: 'circuit breaker status', 'service health', 'are APIs working', 'external service status', 'circuit states'.

### enso_error_monitor_health_check

Comprehensive system health check with a 0-100 health score, circuit breaker status, error code analysis, recurring error clusters, and actionable recommendations. The Team Leader's primary tool for assessing platform health. Use when the user says: 'health check', 'system health', 'health score', 'platform status', 'how healthy is the system', 'TL health report'.

Parameters:
- `hours` (number): Time window in hours (1-168, default: 24)

### enso_error_monitor_error_codes

Analyze errors grouped by structured error code (LLM_CALL_FAILED, CORTEX_INGEST_FAILED, etc.). Shows which error types are most frequent and which subsystems they affect. Use when the user says: 'error codes', 'error types', 'what kind of errors', 'error classification', 'which errors are happening'.

Parameters:
- `hours` (number): Time window in hours (1-168, default: 24)
- `code` (string): Filter by specific error code (e.g., 'LLM_CALL_FAILED')

### enso_error_monitor_recurring

Detect recurring error patterns using fingerprint clustering. Groups identical errors, shows frequency and occurrence count. Helps identify persistent issues vs one-off failures. Use when the user says: 'recurring errors', 'repeated errors', 'error patterns', 'same error happening', 'persistent issues', 'error clusters'.

Parameters:
- `hours` (number): Time window in hours (1-168, default: 24)
- `minOccurrences` (number): Minimum occurrences to be considered recurring (default: 2)
