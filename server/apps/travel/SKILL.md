---
name: travel
description: "Places & Travel: discover destinations, save travel wishlists, plan photography trips around golden hour timing, research locations with immersion checklists, plan shots by day and lighting window, and access quick photography technique references."
---

Places & Travel: discover destinations, save travel wishlists, plan photography trips around golden hour timing, research locations with immersion checklists, plan shots by day and lighting window, and access quick photography technique references.

## Tool Reference

### enso_travel_browse (primary)

Browse saved destinations and travel wishlists from your Cortex.

Parameters:
- `query` (string): Search within saved places
- `region` (string): Filter by region/country

### enso_travel_add

Search for a destination and add it to your travel wishlist with enriched travel information.

Parameters:
- `query` (string): Place name, city, or destination to search for

### enso_travel_discover

AI-powered destination discovery based on your interests and travel style.

Parameters:
- `style` (string): Travel style: adventure, culture, relaxation, photography, food, history
- `region` (string): Preferred region: asia, europe, americas, africa, oceania

### enso_travel_enrich

Enrich saved destinations with detailed travel information: highlights, neighborhoods, food, practical tips.

### enso_travel_golden_hour

Calculate sunrise, sunset, golden hour, and blue hour times for any destination. Plan photography trips around optimal lighting windows. Use when the user says: 'golden hour times', 'sunrise sunset for my trip', 'plan photo trip lighting', 'when is golden hour in [city]'.

Parameters:
- `city` (string): Destination city name
- `startDate` (string): Trip start date (YYYY-MM-DD)
- `endDate` (string): Trip end date (YYYY-MM-DD)

### enso_travel_research_checklist

Interactive location immersion research checklist for travel photographers. Covers historical research, cultural highlights, iconic spots, hidden gems, and visual character notes. Use when the user says: 'research checklist', 'prepare for trip research', 'location immersion guide'.

Parameters:
- `city` (string): Destination city name
- `action` (string): Action: load, toggle, update_notes, reset
- `itemId` (string): Checklist item ID for toggle/update actions
- `notes` (string): Notes text for update_notes action

### enso_travel_shot_planner

Plan and organize photography shots by day and time of day. Track locations, techniques, priority, and completion. Use when the user says: 'plan my shots', 'shot list', 'photography schedule', 'what to photograph'.

Parameters:
- `city` (string): Destination city name
- `action` (string): Action: load, add, toggle, delete, update_priority
- `location` (string): Shot location name (for add)
- `timeOfDay` (string): Time window: blue_hour_am, sunrise, golden_hour_am, midday, golden_hour_pm, sunset, blue_hour_pm, night
- `day` (number): Trip day number (for add)
- `subject` (string): Subject type: landscape, portrait, street, architecture, food, detail
- `technique` (string): Technique notes
- `reference` (string): Reference photographer or image
- `priority` (string): Priority: must_get or nice_to_have
- `notes` (string): Additional notes
- `shotId` (string): Shot ID for toggle/delete/update actions

### enso_travel_quick_ref

Quick reference card with scene-to-technique guides, camera settings for different lighting conditions, composition reminders, and gear checklist. Use when the user says: 'photography cheat sheet', 'camera settings for golden hour', 'composition tips', 'quick reference'.

### enso_travel_trip_overview

Dashboard showing overall trip planning progress: lighting schedule, research completion, shot planning status, and readiness score. Use when the user says: 'trip dashboard', 'planning progress', 'trip overview', 'how ready am I'.

Parameters:
- `city` (string): Destination city name
