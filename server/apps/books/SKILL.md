---
name: books
description: "Books: unified library across Kindle and WeRead (微信读书). Browse, search, scan from multiple sources, view enriched metadata, deep AI podcasts, and research from your reading."
---

Books: unified library across Kindle and WeRead (微信读书). Browse, search, scan from multiple sources, view enriched metadata, deep AI podcasts, and research from your reading.

## Tool Reference

### enso_books_browse (primary)

Browse your book collection from all sources (Kindle + WeRead). Supports tabs (all/kindle/weread), filtering by category, search, sorting, and pagination.

Parameters:
- `tab` (string): Source tab filter (default: all)
- `category` (string): Filter by book category (e.g., 'Evolution', 'Python Programming')
- `query` (string): Search by title or author
- `sortBy` (string): Sort order (default: publicationDate)
- `page` (number): Page number (1-based, default: 1)
- `pageSize` (number): Books per page (default: 20)

### enso_books_search

Search your book library across all sources by title, author, or keyword.

Parameters:
- `query` (string): Search query (matches title, author, description, categories)

### enso_books_scan_kindle

Scan your Amazon Kindle library via read.amazon.com. Requires Amazon login session.

### enso_books_scan_weread

Scan your WeRead (微信读书) library via weread.qq.com. Requires WeChat login — use /browser to log in first.

### enso_books_add

Search for a book by title, author, or ISBN across 4 sources (Google Books, WeRead, Douban, Amazon Kindle) and add it to your library.

Parameters:
- `query` (string): Book title, author name, or ISBN to search for

### enso_books_enrich

Fetch rich metadata (descriptions, ratings, categories, page counts) from Amazon product pages for Kindle books.

### enso_books_update

Incremental scan — check for new books across all sources and update the Cortex.
