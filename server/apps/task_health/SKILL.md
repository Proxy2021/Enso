---
name: task_health
description: "Scheduled task health dashboard: monitor task statuses, failure rates, execution history, error classification, circuit breaker states, and drill into specific task run logs. The Team Leader's command center for scheduled task reliability."
---

Scheduled task health dashboard: monitor task statuses, failure rates, execution history, error classification, circuit breaker states, and drill into specific task run logs. The Team Leader's command center for scheduled task reliability.

## Tool Reference

### enso_task_health_overview (primary)

Get scheduled task health overview: total tasks, enabled/disabled counts, health score, failure summary, upcoming tasks, and circuit-broken tasks. Use when the user says: 'task health', 'scheduled task dashboard', 'task overview', 'how are tasks doing', 'task status'.

### enso_task_health_task_list

List all scheduled tasks with status, schedule, failure counts, and next fire time. Sortable and filterable. Use when the user says: 'list tasks', 'show all tasks', 'scheduled tasks', 'task list', 'what tasks are running'.

Parameters:
- `filter` (string): Filter: 'all', 'enabled', 'disabled', 'failing', 'circuit-broken' (default: 'all')

### enso_task_health_task_runs

Get execution history for a specific task — run-by-run timeline with status, duration, errors, and error classification. Use when the user says: 'task history', 'task runs', 'show runs for', 'task execution log', 'drill into task'.

Parameters:
- `taskId` (string): The task ID to get runs for
- `count` (number): Number of runs to return (1-100, default: 20)

### enso_task_health_failure_analysis

Analyze failures across all scheduled tasks: breakdown by error category, severity distribution, most-failing tasks, failure trends over time. Use when the user says: 'task failures', 'why are tasks failing', 'failure analysis', 'task error breakdown', 'failure trends'.

Parameters:
- `days` (number): Time window in days (1-30, default: 7)

### enso_task_health_timeline

Get a chronological timeline of recent task executions across all tasks — shows what ran, when, and whether it succeeded. Use when the user says: 'task timeline', 'recent executions', 'what ran today', 'execution history', 'task activity'.

Parameters:
- `hours` (number): Time window in hours (1-168, default: 24)

### enso_task_health_health_report

Comprehensive health report for the Team Leader: task reliability scores, recommendations, risk assessment, and actionable items. Use when the user says: 'task health report', 'TL task report', 'task recommendations', 'task risk assessment', 'full task health'.
