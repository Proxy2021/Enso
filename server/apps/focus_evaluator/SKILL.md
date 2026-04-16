---
name: focus_evaluator
description: "Focus area evaluation dashboard: assessment trends, behavioral engagement signals, drift detection, structured evaluation findings, and cross-area comparison for the Team Leader."
---

Focus area evaluation dashboard: assessment trends, behavioral engagement signals, drift detection, structured evaluation findings, and cross-area comparison for the Team Leader.

## Tool Reference

### enso_focus_evaluator_dashboard (primary)

Load the focus evaluation dashboard showing all focus areas with assessment scores, trends, drift status, and engagement signals. Use when the user says: 'show focus dashboard', 'evaluation overview', 'how are my focus areas doing', 'focus area status', 'assessment dashboard'.

### enso_focus_evaluator_trend_analysis

Show assessment trend analysis for a specific focus area: historical scores chart, velocity, acceleration, projected progress, and cycle statistics. Use when the user says: 'show trends for', 'assessment history', 'how is progress trending', 'score trajectory'.

Parameters:
- `focusId` (string): Focus area ID to analyze trends for

### enso_focus_evaluator_signal_scan

Collect and display behavioral engagement signals for a focus area: cortex growth, app engagement, git velocity, content creation, conversation depth, and deliverable activation scores. Use when the user says: 'check engagement signals', 'behavioral signals', 'how engaged am I with', 'activity signals'.

Parameters:
- `focusId` (string): Focus area ID to scan signals for
- `periodDays` (number): Number of days to look back (default: 14)

### enso_focus_evaluator_drift_scan

Run drift detection across all focus areas. Identifies stalling, regressing, disengaged, accelerating, or confidence-drop patterns. Returns alerts with severity and suggested actions. Use when the user says: 'check for drift', 'any focus areas stalling', 'drift detection', 'are any areas stuck', 'focus area health check'.

### enso_focus_evaluator_evaluation_report

Generate a structured evaluation report for a focus area: key findings categorized as strengths/gaps/risks/opportunities, quantitative metrics, and delta from previous evaluation. Use when the user says: 'evaluate focus area', 'focus evaluation report', 'assessment report for', 'structured evaluation'.

Parameters:
- `focusId` (string): Focus area ID to generate evaluation report for

### enso_focus_evaluator_compare

Compare two or more focus areas side-by-side on key metrics: assessment scores, engagement, velocity, drift status, and sprint output. Use when the user says: 'compare focus areas', 'side by side comparison', 'which focus area is doing better', 'cross-area comparison'.

Parameters:
- `focusIds` (string): Comma-separated focus area IDs to compare. If omitted, compares all active areas.
