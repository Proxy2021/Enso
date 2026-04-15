---
name: micro_album
description: "Zero-decision album launcher: auto-selects your best 20 photos, simple keep/skip curation to 12, instant album preview with pre-made layout and ordering guide. Eliminates every decision from creating your first photo album."
---

Zero-decision album launcher: auto-selects your best 20 photos, simple keep/skip curation to 12, instant album preview with pre-made layout and ordering guide. Eliminates every decision from creating your first photo album.

## Tool Reference

### enso_micro_album_launch (primary)

Scan a photo folder (or default library), auto-select the 20 best candidates by rating, favorites, date diversity, and technical quality. All album decisions pre-made. Use when the user wants to create a quick album or says 'make me an album'.

Parameters:
- `folder` (string): Photo folder to scan. Defaults to the user's main photo library if not specified.
- `count` (number): Number of candidate photos to select. Default 20.

### enso_micro_album_curate

Simple keep/skip interface for album curation. Shows one photo at a time. Keep 12 photos to complete the album. Use when reviewing album candidates.

Parameters:
- `action` (string): Action to perform: 'keep', 'skip', 'start', or 'reconsider'. Default 'start'.
- `photoIndex` (number): Index of the photo being acted on.

### enso_micro_album_preview

Show the auto-generated album layout with 12 selected photos. Each gets a full-bleed spread, chronologically ordered. Shows cost estimate and ready-to-order prompt.

### enso_micro_album_order_guide

Step-by-step Printique ordering guide with pre-filled specifications, direct links, and a 5-minute ordering process.

### enso_micro_album_celebrate

Generate a congratulations card after ordering. Shows milestone stats, delivery estimate, and gift suggestion. Records the achievement.

Parameters:
- `recipientName` (string): Optional name of the person you plan to gift this album to.
