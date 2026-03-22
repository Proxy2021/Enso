---
name: system_monitor
description: "System health dashboard: CPU, memory, disk usage, and running processes"
---

# System Monitor

System health dashboard: CPU, memory, disk usage, and running processes

## Available Tools

### enso_system_monitor_overview (primary)

Get system overview: CPU usage, memory, uptime, platform info

### enso_system_monitor_processes

List top processes by CPU or memory usage

Parameters:
- `sort_by` (string): Sort by CPU or memory usage
- `limit` (number): Max processes to return (default 15)

### enso_system_monitor_disk_usage

Get disk partition usage statistics
