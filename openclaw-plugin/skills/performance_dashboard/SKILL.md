---
name: performance_dashboard
description: "Interactive KPI performance dashboard with quarterly metrics, trend charts, benchmark comparisons, and AI-generated insights"
---

# Performance Dashboard

Interactive KPI performance dashboard with quarterly metrics, trend charts, benchmark comparisons, and AI-generated insights

## Available Tools

### enso_performance_dashboard_overview (primary)

Show a performance dashboard with KPI stat cards, trend charts, data table, and insights for any set of business metrics across time periods

Parameters:
- `topic` (string): The business domain or topic for the dashboard (e.g., 'e-commerce', 'SaaS', 'marketing')
- `metrics` (string): Comma-separated list of metric names to track (e.g., 'Revenue,AOV,Conversion Rate,CAC')
- `periods` (string): Comma-separated period labels (e.g., 'Q1,Q2,Q3,Q4' or 'Jan,Feb,Mar')

### enso_performance_dashboard_detail

Show detailed performance data for a single metric with period-by-period breakdown, bar chart, and change tracking

Parameters:
- `metric` (string): The metric key to show detail for (e.g., 'revenue', 'aov', 'conversion', 'cac')

### enso_performance_dashboard_compare

Compare multiple metrics on a normalized 0-100 scale to visualize relative trend shapes across time periods

Parameters:
- `metricKeys` (string): Comma-separated metric keys to compare (e.g., 'revenue,aov,conversion,cac')

### enso_performance_dashboard_benchmark

Show industry benchmark reference data for comparison against your performance metrics

Parameters:
- `industry` (string): Industry vertical for benchmarks (e.g., 'e-commerce', 'SaaS', 'fintech')

### enso_performance_dashboard_export

Export dashboard data as a formatted text summary for sharing or reporting

Parameters:
- `format` (string): Export format: text, csv, or markdown (default: text)
