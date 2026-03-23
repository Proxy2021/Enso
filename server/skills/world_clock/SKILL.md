---
name: world_clock
description: "World clock, timezone converter, countdown timers, and stopwatch utilities"
---

# World Clock

World clock, timezone converter, countdown timers, and stopwatch utilities

## Available Tools

### enso_world_clock_current_time (primary)

Get the current time in any timezone with additional world clock zones. Use when the user says: 'what time is it', 'current time', 'show me the time', 'time in Tokyo', 'what time is it in London'.

Parameters:
- `timezone` (string): IANA timezone (e.g. America/New_York, Asia/Tokyo). Defaults to system local timezone.

### enso_world_clock_convert

Convert a time between timezones. Use when the user says: 'convert time', 'what is 3pm EST in Tokyo', 'timezone conversion', 'time difference'.

Parameters:
- `time` (string): Time to convert (e.g. '3:30 PM' or '15:30'). Defaults to current time.
- `fromTimezone` (string): Source IANA timezone (e.g. America/New_York)
- `toTimezone` (string): Target IANA timezone (e.g. Asia/Tokyo). Can also be a comma-separated list.

### enso_world_clock_world_view

View multiple timezone clocks simultaneously. Add or remove timezones from your world clock. Use when the user says: 'world clock', 'show all timezones', 'time around the world', 'add timezone'.

Parameters:
- `addTimezone` (string): IANA timezone to add to the world clock
- `removeTimezone` (string): IANA timezone to remove from the world clock

### enso_world_clock_countdown

Create, view, or delete countdown timers to any target date/time. Use when the user says: 'set a timer', 'countdown to', 'how long until', 'timer for 30 minutes', 'delete timer'.

Parameters:
- `action` (string): Action: list, create, or delete
- `label` (string): Timer label (for create)
- `target` (string): Target time: ISO datetime (2026-12-31T00:00:00) or duration (30m, 2h, 1d)
- `id` (string): Timer ID (for delete)

### enso_world_clock_stopwatch

Open a client-side stopwatch with lap tracking. Use when the user says: 'stopwatch', 'start timer', 'start stopwatch', 'lap timer'.
