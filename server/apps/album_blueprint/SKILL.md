---
name: album_blueprint
description: "First album blueprint: step-by-step guide to creating your first gift-quality photo book from a large photo library. Theme selection, 5-pass curation walkthrough, layout templates, printer comparison, and 30-day action plan."
---

First album blueprint: step-by-step guide to creating your first gift-quality photo book from a large photo library. Theme selection, 5-pass curation walkthrough, layout templates, printer comparison, and 30-day action plan.

## Tool Reference

### enso_album_blueprint_choose_theme (primary)

Present 5 compelling album theme options for a first photo book. Each theme includes recommended photo count, chapter structure, emotional arc, ideal printer, estimated cost, and timeline. Use when the user wants to start planning their first album or explore album concepts.

Parameters:
- `theme` (string): Optional: select a specific theme to see detailed breakdown. Options: city_at_dawn, faces_of_journey, quiet_landscape, one_trip_one_story, year_in_light

### enso_album_blueprint_curation_guide

Interactive 5-pass curation walkthrough for photo book selection. Maps to the album_designer passes with specific guidance, checklists, and criteria for each pass. Pass numbers: 1=Technical Kill, 2=Print Test, 3=Thematic Grouping, 4=Narrative Arc, 5=Album Cut.

Parameters:
- `pass` (number): Which curation pass to view (1-5). Omit to see overview of all passes.
- `startingCount` (number): How many candidate photos you're starting with (default: 500)

### enso_album_blueprint_layout_templates

Show 8 proven spread layout patterns for photo books with visual diagrams, when to use each, and example pairings. Use when planning how to arrange photos on spreads.

Parameters:
- `layout` (string): Optional: view a specific layout in detail. Options: full_bleed, diptych, triptych, scale_contrast, white_space, grid, text_image, panoramic

### enso_album_blueprint_printer_comparison

Detailed comparison of 3 premium photo book printers: Printique (US), Saal Digital (EU), and WhiteWall (premium). Shows pricing, paper options, binding types, turnaround times, and recommendations.

Parameters:
- `printer` (string): Optional: view a specific printer in detail. Options: printique, saal_digital, whitewall
- `pageCount` (number): Number of pages/spreads for price estimate (default: 40)

### enso_album_blueprint_thirty_day_plan

A 30-day action plan for completing your first photo album, broken into daily tasks across 6 phases. Tracks progress with checkboxes and milestone celebrations. Use to get a structured timeline from theme selection to print order.

Parameters:
- `theme` (string): Which album theme to build the plan around (default: one_trip_one_story)
- `startDate` (string): When to start (ISO date string, default: today)
