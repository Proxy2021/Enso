---
name: golden_hour_planner
description: "Golden Hour Planner: plan photography trips around golden/blue hour timing, create shot planning cards with lighting/lens/subject details, track shooting streaks and weekly progress, access camera settings cheat sheets and composition guides, and run One Lens Challenge sessions."
---

Golden Hour Planner: plan photography trips around golden/blue hour timing, create shot planning cards with lighting/lens/subject details, track shooting streaks and weekly progress, access camera settings cheat sheets and composition guides, and run One Lens Challenge sessions.

## Tool Reference

### enso_ghp_plan_trip (primary)

Calculate golden hour, blue hour, sunrise, and sunset windows for a travel destination across your trip dates. Shows a daily shooting schedule with pre-dawn scout time, morning/evening golden hours, blue hours, and midday rest periods. Use when the user says: 'plan golden hour trip', 'golden hour schedule for my trip', 'photography trip planner'.

Parameters:
- `city` (string): Destination city name
- `startDate` (string): Trip start date (YYYY-MM-DD)
- `endDate` (string): Trip end date (YYYY-MM-DD)
- `locations` (string): Comma-separated list of key locations to photograph

### enso_ghp_manage_shots

Create and manage shot planning cards for your trip. Each card tracks location, best time of day, focal length, subject type, light direction, and completion status (scouted/attempted/got the shot). Use when the user says: 'plan my shots', 'add shot card', 'shot planning', 'manage shot list'.

Parameters:
- `action` (string): Action: load, add, update, delete, toggle_scouted, toggle_attempted, toggle_got_it
- `city` (string): Destination city for this shot plan
- `shotId` (string): Shot ID for update/delete/toggle actions
- `location` (string): Location name for the shot
- `bestTime` (string): Best time: morning_golden, evening_golden, blue_hour, midday_ok
- `focalLength` (string): Planned focal length: 28mm, 35mm, 50mm, 85mm+
- `subjectType` (string): Subject: architecture, portrait, street, landscape, culture
- `lightDirection` (string): Light direction: front_lit, side_lit, back_lit, silhouette
- `notes` (string): Additional notes for this shot

### enso_ghp_weekly_review

Weekly review dashboard showing shots planned vs attempted vs completed, golden hour session streak, and motivational tips from elite photographers. Use when the user says: 'weekly review', 'shooting stats', 'how am I doing', 'golden hour streak'.

Parameters:
- `city` (string): City to review (uses current trip if omitted)
- `action` (string): Action: load, log_session, reset_streak
- `sessionDate` (string): Date of golden hour session (YYYY-MM-DD) for log_session action
- `sessionType` (string): Type: morning, evening, both

### enso_ghp_quick_ref

Camera settings cheat sheet for golden hour photography, composition reminders (rule of thirds, leading lines, frame within frame, light as subject), and gear checklist. Use when the user says: 'camera settings', 'cheat sheet', 'composition tips', 'golden hour settings'.

### enso_ghp_lens_challenge

Track your One Lens Challenge — commit to shooting with only one focal length for an entire day or trip. Log daily entries, track your streak, and review what you learned. Use when the user says: 'one lens challenge', 'lens challenge', 'single lens day', 'track my lens challenge'.

Parameters:
- `action` (string): Action: load, start, log_day, end_challenge
- `focalLength` (string): Chosen focal length: 28mm, 35mm, 50mm, 85mm
- `date` (string): Date (YYYY-MM-DD) for log_day action
- `shotCount` (number): Number of shots taken that day
- `bestShot` (string): Description of your best shot of the day
- `lesson` (string): What you learned shooting with this one lens
