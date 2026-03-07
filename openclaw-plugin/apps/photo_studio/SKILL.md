---
name: photo_studio
description: "Artistic photo processing studio for importing, styling, batch processing, and organizing photos into collections"
---

Build a reusable, general-purpose Trip Planner app with at least 6 tools, following the architecture from design-trip-planner. IMPORTANT: Read CLAUDE-REFERENCE.md first, then study openclaw-plugin/apps/media_gallery/ as the gold standard.

Create the app at openclaw-plugin/apps/trip_planner/ with:
- app.json: Full spec with toolFamily 'trip_planner', toolPrefix 'enso_trip_planner_', all tools with JSON Schema parameters, rich sampleParams and sampleData, requiredDataKeys for each tool
- template.jsx: Multi-view React template (600+ lines) with:
  - View switching based on data.tool field
  - Trips list view with filter/sort toolbar and summary cards
  - Destination research view with weather, costs, attractions sections
  - Itinerary timeline view with day headers, time slots, drag-friendly layout
  - Budget dashboard with category breakdown, progress bars, totals
  - Packing list with categorized checkboxes and progress indicators
  - Preparation checklist with status badges
  - Empty states for every view
  - Mobile-friendly responsive layout
  - Helper functions for date formatting, currency formatting, percentage calculations
- executors/: One JS file per tool following the gold standard pattern (extract → normalize → build params → call tool → error handle → tag with tool name → return JSON)

All tools must be fully parameterized with no hardcoded destinations, dates, currencies, or trip-specific data. The app should work for any trip to any destination.

## Tool Reference

### enso_photo_studio_import_photos (primary)

Import photos by URL or from device. Accepts single or multiple photo URLs, stores metadata including dimensions and import date.

Parameters:
- `urls` (string): One or more image URLs, comma-separated or newline-separated
- `collection` (string): Optional collection name to add imported photos to

### enso_photo_studio_apply_style

Apply an artistic style to a photo. Supports watercolor, oil_painting, sketch, pop_art, vintage, noir, impressionist, anime styles with adjustable intensity.

Parameters:
- `photoId` (string): ID of the photo to style
- `style` (string): Style name: watercolor, oil_painting, sketch, pop_art, vintage, noir, impressionist, anime
- `intensity` (number): Style intensity from 0-100 (default: 75)
- `colorPalette` (string): Optional color palette: warm, cool, muted, vibrant, monochrome

### enso_photo_studio_batch_process

Apply an artistic style to multiple photos at once from a collection or selection. Shows progress and results.

Parameters:
- `collection` (string): Collection name to process all photos from
- `photoIds` (string): Comma-separated photo IDs to process (alternative to collection)
- `style` (string): Style name to apply: watercolor, oil_painting, sketch, pop_art, vintage, noir, impressionist, anime
- `intensity` (number): Style intensity from 0-100 (default: 75)

### enso_photo_studio_manage_collection

Create, rename, delete, view, and list photo collections. Organize original and styled photos into named albums.

Parameters:
- `action` (string): Action: create, list, view, rename, delete, add, remove
- `name` (string): Collection name
- `newName` (string): New name for rename action
- `photoId` (string): Photo ID for add/remove actions

### enso_photo_studio_compare_versions

Show original photo alongside all styled versions for side-by-side comparison

Parameters:
- `photoId` (string): ID of the photo to compare versions for
