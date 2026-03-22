---
name: note_keeper
description: "Persistent notes with search, tags, and organization"
---

# Note Keeper

Persistent notes with search, tags, and organization

## Available Tools

### enso_note_keeper_list_notes (primary)

List all saved notes with title, preview, tags, and timestamps

Parameters:
- `tag` (string): Filter by tag (optional)

### enso_note_keeper_save_note

Create or update a note with title, body, and optional tags

Parameters:
- `id` (string): Note ID (omit to create new, provide to update)
- `title` (string): Note title
- `body` (string): Note body content
- `tags` (string): Comma-separated tags

### enso_note_keeper_delete_note

Delete a note by ID

Parameters:
- `id` (string): Note ID to delete

### enso_note_keeper_search_notes

Full-text search across all notes

Parameters:
- `query` (string): Search query
