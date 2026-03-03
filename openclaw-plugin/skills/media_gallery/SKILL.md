---
name: media_gallery
description: "Comprehensive media gallery for browsing, viewing, organizing, and searching photos and videos"
---

# Media Gallery

Comprehensive media gallery for browsing, viewing, organizing, and searching photos and videos

## Available Tools

### enso_media_gallery_browse (primary)

Browse a folder for photos and videos with sorting, filtering, and subfolder navigation

Parameters:
- `path` (string): Directory path to browse (defaults to ~/Pictures)
- `filter` (string): Media type filter: all, image, or video (default: all)
- `sortBy` (string): Sort field: name, date, or size (default: name)
- `sortDir` (string): Sort direction: asc or desc (default: asc)

### enso_media_gallery_view

View a single photo or video with full EXIF metadata, AI description, and rating

Parameters:
- `path` (string): Full path to the photo or video file

### enso_media_gallery_favorite

Toggle the favorite status of a photo

Parameters:
- `path` (string): Path to the photo file
- `favorite` (boolean): Set true or false, or omit to toggle

### enso_media_gallery_rate

Set a 1-5 star rating on a photo (0 to clear the rating)

Parameters:
- `path` (string): Path to the photo file
- `rating` (number): Star rating from 0 to 5 (0 clears the rating)

### enso_media_gallery_collection

Manage photo collections: create, view, add/remove photos, rename, delete, or list all collections

Parameters:
- `action` (string): Action: create, add, remove, list, view, rename, or delete
- `collectionName` (string): Name of the collection
- `photoPath` (string): Photo path for add/remove operations
- `newName` (string): New name for rename operation

### enso_media_gallery_search

Search photos by natural language query against AI descriptions and tags

Parameters:
- `path` (string): Directory to search within
- `query` (string): Natural language search query
- `limit` (number): Maximum number of results (default: 30)

### enso_media_gallery_inspect

Inspect detailed file metadata including EXIF data for a media file

Parameters:
- `path` (string): Path to the file to inspect
