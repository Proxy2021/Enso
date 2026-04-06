---
name: browser_data
description: "Browser Data: analyze your Chrome/Edge browsing patterns — history, bookmarks, top domains, recent searches, and saved sites."
---

# Browser Data

Browser Data: analyze your Chrome/Edge browsing patterns — history, bookmarks, top domains, recent searches, and saved sites.

## Available Tools

### enso_browser_databrowse (primary)

Browse your browser history and bookmarks — top domains, recent searches, saved bookmarks by folder.

Parameters:
- `view` (string): Which view to show (default: history)
- `query` (string): Filter by domain, search term, or bookmark title
- `folder` (string): Filter bookmarks by folder name

### enso_browser_datascan_history

Scan Chrome/Edge browsing history from the local SQLite database.

Parameters:
- `browser` (string): Browser to scan (default: all)
- `sinceDays` (number): Days of history to include (default: 30)

### enso_browser_datascan_bookmarks

Scan Chrome/Edge bookmark files.
