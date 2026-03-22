---
name: data_analyzer
description: "Interactive data analysis: paste CSV/JSON, auto-detect columns, compute statistics, and generate charts"
---

# Data Analyzer

Interactive data analysis: paste CSV/JSON, auto-detect columns, compute statistics, and generate charts

## Available Tools

### enso_data_analyzer_analyze (primary)

Parse CSV or JSON data and compute column statistics (type, min, max, mean, median, nulls, unique count)

Parameters:
- `data` (string): Raw CSV or JSON data to analyze
- `format` (string): Data format. Defaults to auto-detect.

### enso_data_analyzer_chart

Generate chart configuration from analyzed data columns

Parameters:
- `chart_type` (string): Chart type to generate
- `x_column` (string): Column name for X axis / labels
- `y_column` (string): Column name for Y axis / values

### enso_data_analyzer_query

Filter, sort, or group the analyzed dataset

Parameters:
- `filter_column` (string): Column to filter on
- `filter_op` (string): Filter operator
- `filter_value` (string): Value to filter by
- `sort_column` (string): Column to sort by
- `sort_dir` (string): Sort direction
