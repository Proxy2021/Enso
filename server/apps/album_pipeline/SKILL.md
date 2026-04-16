---
name: album_pipeline
description: "60-day photo album pipeline: interactive tracker for creating a gift-quality Printique layflat album from curation through print. Daily tasks, phase tracking, theme selection, 5-pass curation methodology, and Printique specifications."
---

60-day photo album pipeline: interactive tracker for creating a gift-quality Printique layflat album from curation through print. Daily tasks, phase tracking, theme selection, 5-pass curation methodology, and Printique specifications.

## Tool Reference

### enso_album_pipeline_pipeline_dashboard (primary)

Show the 60-day album pipeline dashboard with phase progress, daily task completion, photo counts, page estimates, and cost projection. Use this to see overall project status.

Parameters:
- `action` (string): Action: 'view' to see dashboard, 'start' to begin a new pipeline, 'reset' to start over, 'set_start_date' to change start date
- `startDate` (string): ISO date string for when the 60-day pipeline begins (YYYY-MM-DD)
- `albumTitle` (string): Title for the album project
- `recipient` (string): Who the album is a gift for

### enso_album_pipeline_daily_task

Show today's specific task based on the current pipeline day and phase. Each task has clear instructions, tips, and a completion button. Also allows completing or skipping tasks.

Parameters:
- `action` (string): Action: 'view' for today's task, 'complete' to mark done, 'skip' to skip, 'view_day' to see a specific day
- `day` (number): Specific day number (1-60) to view or complete
- `notes` (string): Optional notes when completing a task

### enso_album_pipeline_printique_guide

Show Printique layflat album specifications, pricing, paper options, cover materials, recommended specs, image resolution requirements, Lightroom export settings, and cost breakdown.

Parameters:
- `section` (string): Which section to view: 'overview' for all specs, 'pricing' for cost details, 'export' for Lightroom settings, 'recommended' for first-album recommendations

### enso_album_pipeline_album_theme_picker

Browse and select from 5 curated album theme concepts. Each theme includes concept description, recommended page count, layout style, mood guidance, and photo selection criteria. Picking a theme sets the creative direction for the entire pipeline.

Parameters:
- `action` (string): Action: 'browse' to see all themes, 'select' to pick a theme, 'custom' to define your own
- `themeId` (string): Theme ID to select: golden_hours, street_life, landscapes_light, year_in_photos, one_trip_one_story
- `customTheme` (string): Description of a custom theme if action is 'custom'

### enso_album_pipeline_curation_checklist

The 5-pass curation methodology for narrowing 124K photos to 40-50 album-ready images. Shows each pass with criteria, tips, common mistakes, time estimates, and progress tracking.

Parameters:
- `action` (string): Action: 'view' for the full checklist, 'update_pass' to record pass progress, 'tips' for a specific pass
- `passNumber` (number): Pass number (1-5) for update or tips
- `remainingCount` (number): Number of photos remaining after this pass
- `notes` (string): Notes about what was culled or kept
