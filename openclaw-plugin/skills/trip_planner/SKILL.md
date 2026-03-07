---
name: trip_planner
description: "Plan and organize trips with destination research, itineraries, budgets, packing lists, and preparation checklists"
---

# Trip Planner

Plan and organize trips with destination research, itineraries, budgets, packing lists, and preparation checklists

## Available Tools

### enso_trip_planner_list_trips (primary)

List all saved trips with status, dates, and budget summaries

Parameters:
- `status` (string): Filter by status: all, planning, booked, completed (default: all)

### enso_trip_planner_research

Research a destination with weather, costs, attractions, visa info, and travel tips

Parameters:
- `destination` (string): Destination city or region to research
- `travelMonth` (string): Month or season of planned travel (e.g. 'July', 'winter')
- `interests` (string): Traveler interests for personalized tips (e.g. 'food, history, hiking')

### enso_trip_planner_itinerary

View or generate a day-by-day itinerary for a trip with activities, times, and locations

Parameters:
- `tripId` (string): ID of an existing trip to load itinerary for
- `destination` (string): Destination for the itinerary
- `startDate` (string): Trip start date (YYYY-MM-DD)
- `endDate` (string): Trip end date (YYYY-MM-DD)
- `interests` (string): Activities and interests to prioritize
- `action` (string): Action: view, generate, or create

### enso_trip_planner_budget

View or set up a trip budget with category breakdown, spending tracking, and expense log

Parameters:
- `tripId` (string): ID of an existing trip
- `destination` (string): Trip destination
- `totalBudget` (number): Total trip budget amount
- `currency` (string): Currency code (default: USD)
- `travelers` (number): Number of travelers (default: 1)
- `duration` (number): Trip duration in days

### enso_trip_planner_packing

Generate or view a categorized packing list based on destination, weather, and trip type

Parameters:
- `tripId` (string): ID of an existing trip
- `destination` (string): Trip destination
- `duration` (number): Trip duration in days
- `climate` (string): Expected climate (e.g. 'hot and humid', 'cold', 'tropical')
- `activities` (string): Planned activities that need special gear (e.g. 'hiking, beach, formal dinner')
- `action` (string): Action: view or generate

### enso_trip_planner_checklist

Generate or view a pre-trip preparation checklist with tasks, deadlines, and priority levels

Parameters:
- `tripId` (string): ID of an existing trip
- `destination` (string): Trip destination
- `startDate` (string): Trip start date (YYYY-MM-DD) for calculating deadlines
- `action` (string): Action: view or generate

### enso_trip_planner_search_dest

Search for travel destinations by query, interests, budget, or climate preference

Parameters:
- `query` (string): Search query (e.g. 'beach destinations in Asia', 'cities under $100/day')
- `budget` (string): Budget level: budget, mid-range, or luxury
- `climate` (string): Preferred climate: tropical, temperate, cold, desert, etc.
