---
name: bike_planner
description: "Plan and track cycling rides with weather checks, route discovery, ride logging, and performance stats"
---

# Bike Planner

Plan and track cycling rides with weather checks, route discovery, ride logging, and performance stats

## Available Tools

### enso_bike_dashboard (primary)

Show the ride dashboard with recent rides, stats summary, and weather for a location

Parameters:
- `location` (string): City or location for weather check (default: saved preference or 'San Francisco')

### enso_bike_log_ride

Log a completed bike ride with distance, duration, and notes

Parameters:
- `name` (string): Name or route of the ride
- `distance` (number): Distance in miles
- `duration` (string): Duration (e.g. '1h 30m')
- `notes` (string): Optional notes about the ride

### enso_bike_find_routes

Search for popular bike routes and trails near a location

Parameters:
- `location` (string): City or area to search for routes
- `difficulty` (string): Difficulty filter: easy, moderate, hard, or all (default: all)

### enso_bike_delete_ride

Delete a logged ride by its ID

Parameters:
- `rideId` (string): ID of the ride to delete
