---
name: photobook
description: "Digital photobook creator and viewer — browse photos, create themed photobooks with 6 professional layout templates, view page-by-page with navigation, edit pages, rearrange content, change visual styles, and export"
---

# Photobook

Digital photobook creator and viewer — browse photos, create themed photobooks with 6 professional layout templates, view page-by-page with navigation, edit pages, rearrange content, change visual styles, and export

## Available Tools

### enso_photobook_browse (primary)

Browse existing photobooks or photo sources to create new books from

Parameters:
- `path` (string): Directory path to browse for photos (defaults to ~/Pictures)
- `sortBy` (string): Sort: name, date, size (default: date)

### enso_photobook_create

Create a new photobook from selected photos with title, style preset, accent color, and font pair

Parameters:
- `title` (string): Book title
- `subtitle` (string): Subtitle or date range
- `style` (string): Style preset: warm, pure, moody (default: warm)
- `accentColor` (string): Hex accent color (default: #C4785B)
- `fontPair` (string): Font pair: lato-opensans, inter-inter, playfair-lato, montserrat-opensans
- `photoPaths` (array): Array of photo file paths

### enso_photobook_view

View a photobook page-by-page with full layout rendering and navigation

Parameters:
- `bookId` (string): Photobook ID
- `page` (number): Starting page number (default: 0)

### enso_photobook_edit

Edit a photobook page — change layout template, swap photos, edit captions or text

Parameters:
- `bookId` (string): Photobook ID
- `page` (number): Page number to edit
- `templateId` (string): New template: cover, hero, centered, duo, trio, text
- `photoUpdates` (string): JSON: [{slotIndex, newPhotoPath}]
- `textUpdates` (string): JSON: {heading, subtitle, body}

### enso_photobook_arrange

Reorder, add, or remove pages in a photobook

Parameters:
- `bookId` (string): Photobook ID
- `action` (string): Action: move, add, remove, duplicate
- `fromPage` (number): Source page number
- `toPage` (number): Destination (for move)
- `templateId` (string): Template for new page (for add)

### enso_photobook_style

Change the visual style of a photobook — style preset, accent color, font pair

Parameters:
- `bookId` (string): Photobook ID
- `styleId` (string): Style preset: warm, pure, moody
- `accentColor` (string): Hex accent color
- `fontPair` (string): Font pair ID

### enso_photobook_export

Export a photobook as PDF or image sequence

Parameters:
- `bookId` (string): Photobook ID
- `format` (string): Export format: pdf or images
- `quality` (string): Quality: standard or high
