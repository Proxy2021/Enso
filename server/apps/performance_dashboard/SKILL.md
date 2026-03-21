---
name: performance_dashboard
description: "Interactive KPI performance dashboard with quarterly metrics, trend charts, benchmark comparisons, and AI-generated insights"
---

Build a BESPOKE ONE-OFF interactive dashboard. Write a single file named EXACTLY `.orchestration-ui.jsx` in the current working directory (D:/Github/Enso). All data must be embedded as `var` declarations at the top of the file — no imports, no app registration, no executors.

Embed realistic sample data for 4 quarters (Q1–Q4 of a single fiscal year) across four metrics:
- Revenue (e.g., $1.2M–$2.1M range with seasonal patterns)
- AOV / Average Order Value (e.g., $65–$95 range)
- Conversion Rate (e.g., 1.8%–3.4% range)
- Customer Acquisition Cost / CAC (e.g., $18–$42 range)

UI Requirements:
1. Header with title 'Quarterly Performance Dashboard' and subtitle 'E-Commerce KPIs'
2. Four KPI stat cards at the top showing the latest quarter value, QoQ change (with colored up/down arrow), and a sparkline or trend indicator
3. A tabbed section with tabs: 'Revenue', 'AOV', 'Conversion Rate', 'CAC' — each tab shows a bar chart comparing all 4 quarters with benchmark reference line
4. A combined line chart showing all 4 metrics normalized (0–100 scale) to compare trend shapes across quarters
5. A DataTable showing all raw quarterly data with columns: Quarter, Revenue, AOV, Conv. Rate, CAC, Revenue QoQ%, CAC Efficiency (Revenue/CAC)
6. An Insights panel listing 3–5 auto-generated observations about the data (e.g., 'Q3 showed highest conversion rate at 3.4%, coinciding with lowest CAC')
7. Use the Enso UI component library: StatCard, Tabs, DataTable, BarChart or LineChart as available. Fall back to inline SVG or CSS-based charts if needed.

NULL SAFETY: All data access must use optional chaining (?.) and nullish coalescing (??) throughout. Never call methods on potentially undefined values without guards.

Use the research findings from research-metrics to inform benchmark reference lines and insight copy.

## Tool Reference

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
