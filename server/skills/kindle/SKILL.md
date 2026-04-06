---
name: kindle
description: "Kindle Library: browse, search, and manage your Amazon Kindle book collection. Scan your library, search by title/author/category, view enriched metadata, and research topics from your reading."
---

# Kindle

Kindle Library: browse, search, and manage your Amazon Kindle book collection. Scan your library, search by title/author/category, view enriched metadata, and research topics from your reading.

## Available Tools

### enso_kindlebrowse (primary)

Browse your Kindle book collection with covers, ratings, categories, and descriptions. Supports filtering by category and search.

Parameters:
- `category` (string): Filter by book category (e.g., 'Evolution', 'Python Programming')
- `query` (string): Search by title or author
- `sortBy` (string): Sort order (default: title)

### enso_kindlesearch

Search your Kindle library by title, author, or keyword. Returns matching books with full metadata.

Parameters:
- `query` (string): Search query (matches title, author, description, categories)

### enso_kindlescan

Scan your Amazon Kindle library via read.amazon.com. Requires Amazon login session. Creates/updates the local book cache.

### enso_kindleenrich

Fetch rich metadata (descriptions, ratings, categories, page counts) from Amazon product pages for books that haven't been enriched yet.
