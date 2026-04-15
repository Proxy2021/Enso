---
name: alpharank_activation
description: "AlphaRank 30-day activation tracker: daily task planning, progress dashboard, check-ins, performance metrics, and blocker tracking for Phase 1 quant development"
---

AlphaRank 30-day activation tracker: daily task planning, progress dashboard, check-ins, performance metrics, and blocker tracking for Phase 1 quant development

## Tool Reference

### enso_alpharank_activation_today (primary)

Show today's activation task, prerequisites, estimated time, and progress. Use when the user says: 'what should I work on today', 'AlphaRank today', 'show today's task', 'daily plan', 'activation today'.

### enso_alpharank_activation_progress

Show the full 30-day activation plan with weekly groupings, task status, streak tracking, and completion estimates. Use when the user says: 'show progress', 'activation progress', '30-day plan', 'AlphaRank status', 'how am I doing'.

### enso_alpharank_activation_checkin

Complete a daily check-in: mark today's task as done/partial/blocked, add notes, record time spent. Use when the user says: 'check in', 'mark done', 'daily checkin', 'complete today', 'I finished today's task', 'log progress'.

Parameters:
- `status` (string): Task status: done, partial, or blocked
- `notes` (string): Notes about what was accomplished or issues encountered
- `hoursSpent` (number): Actual hours spent on today's task
- `day` (number): Specific day number to check in for (defaults to current active day)

### enso_alpharank_activation_metrics

View and update key performance metrics (IC, ICIR, Sharpe, max drawdown, PBO score) with GO/NO-GO gate status. Use when the user says: 'show metrics', 'update metrics', 'AlphaRank metrics', 'GO/NO-GO status', 'performance numbers', 'check gates'.

Parameters:
- `action` (string): Action: view (default) or update
- `metricId` (string): Metric to update: ic, icir, sharpe, max_dd, pbo, cagr, turnover
- `value` (number): New metric value
- `date` (string): Date for the metric reading (defaults to today)

### enso_alpharank_activation_blockers

Log, view, and manage technical blockers encountered during AlphaRank activation. Use when the user says: 'log blocker', 'show blockers', 'I'm stuck', 'add blocker', 'resolve blocker', 'blocker list'.

Parameters:
- `action` (string): Action: list (default), add, resolve
- `title` (string): Blocker title (for add action)
- `category` (string): Category: data_quality, package_compat, config, performance, api, other
- `description` (string): Detailed description of the blocker
- `solution` (string): Solution found (for resolve action)
- `blockerId` (string): Blocker ID (for resolve action)
- `hoursLost` (number): Hours lost to this blocker
