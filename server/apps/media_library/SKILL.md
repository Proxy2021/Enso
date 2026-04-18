---
name: media_library
description: "Cross-media library for browsing, searching, rating, tracking, and discovering books, movies, TV series, games, music, and photos from your Knowledge Cortex entity index"
---

Cross-media library for browsing, searching, rating, tracking, and discovering books, movies, TV series, games, music, and photos from your Knowledge Cortex entity index

## Tool Reference

### enso_media_library_browse (primary)

Browse all media entities with filters. Supports filtering by media type (books, movies, games, music, photos, tv, documentaries), consumption status, favorites, minimum rating, collection membership, and sorting/grouping options. Use when the user says: 'show my media library', 'browse my books', 'show all movies', 'list my games', 'what have I completed'.

Parameters:
- `mediaType` (string): Filter by media type: all, books, movies, tv, documentaries, games, music, photos (default: all)
- `status` (string): Filter by consumption status: not_started, in_progress, completed, dropped, on_hold
- `favorite` (boolean): Filter to favorites only
- `minRating` (number): Minimum user rating (1-10)
- `collectionId` (string): Filter to items in a specific collection
- `sortBy` (string): Sort by: title, rating, updatedAt, dateCompleted (default: title)
- `groupBy` (string): Group results by: mediaType, status, rating (default: none)
- `limit` (number): Max results per page (default: 50)
- `offset` (number): Pagination offset (default: 0)

### enso_media_library_search

Full-text search across all indexed media entities. Searches titles, tags, semantic tags, and metadata. Returns ranked results with match reasons. Use when the user says: 'search for sci-fi books', 'find martial arts movies', 'search strategy games'.

Parameters:
- `query` (string): Search query string
- `mediaType` (string): Limit search to a media type: books, movies, tv, documentaries, games, music, photos
- `limit` (number): Max results (default: 30)

### enso_media_library_rate

Rate a media entity on the 10-point half-star scale (1–10 integer, where 2 points = 1 star). Accepts both integer points (1–10) and star notation (e.g. 4.5 stars = 9/10). Returns a `starsDisplay` like "★★★★½". Use rating=0 to clear. Use when the user says: 'rate this book', 'give it an 8', '4.5 stars', '9 out of 10'.

Parameters:
- `entityId` (string): The entity ID to rate
- `rating` (number): Rating 1–10 (0 to clear); or star notation 0.5–5.0
- `notes` (string): Optional notes about the rating

### enso_media_library_status

Update consumption status and progress for a media entity. Use when the user says: 'I started reading this', 'mark as completed', 'I dropped this show', 'update my progress'.

Parameters:
- `entityId` (string): The entity ID to update
- `status` (string): Status: not_started, in_progress, completed, dropped, on_hold
- `progress` (string): Progress description (e.g., 'Chapter 5', '45%', 'Episode 3')

### enso_media_library_favorite

Toggle or set the favorite flag on a media entity. Use when the user says: 'favorite this', 'add to favorites', 'unfavorite this book'.

Parameters:
- `entityId` (string): The entity ID to toggle favorite
- `favorite` (boolean): Set true/false, or omit to toggle

### enso_media_library_collection

Manage media collections: create, list, view (with resolved entities), add/remove items, or delete collections. Use when the user says: 'create a collection', 'add to reading list', 'show my collections', 'view watch later list'.

Parameters:
- `action` (string): Action: create, list, view, add_item, remove_item, delete
- `collectionId` (string): Collection ID (for view, add_item, remove_item, delete)
- `name` (string): Collection name (for create)
- `description` (string): Collection description (for create)
- `entityId` (string): Entity ID to add/remove

### enso_media_library_stats

Cross-media statistics and insights from your entire library. Shows totals by type, rating distributions, completion rates, top-rated items, recent activity, and more. Use when the user says: 'show my library stats', 'how many books have I read', 'media statistics', 'library overview'.

Parameters:
- `mediaType` (string): Limit stats to a specific media type (optional)

### enso_media_library_add

Manually add a new media entity to the library. Use when the user says: 'add a book', 'add movie to library', 'register new game'.

Parameters:
- `type` (string): Entity type: book, movie, tv-series, documentary, game, album, artist
- `title` (string): Title of the entity
- `imageUrl` (string): Cover image URL (optional)
- `tags` (string): Comma-separated tags
- `semanticTags` (string): Comma-separated semantic tags

### enso_media_library_discover

AI-powered cross-media discovery suggestions based on your ratings, favorites, and consumption patterns. Analyzes taste clusters from semantic tags to recommend items you might enjoy. Use when the user says: 'suggest something to watch', 'recommend books', 'what should I play next', 'discover new media'.

Parameters:
- `mediaType` (string): Limit suggestions to a media type (optional)
- `limit` (number): Max suggestions per category (default: 5)

### enso_media_library_nl_search

Natural language hybrid search using SQLite FTS5 (keyword/BM25) + semantic tag similarity with RRF fusion. Understands concepts, genres, and themes — not just exact keywords. Auto-rebuilds the search index on first use. Use when the user says: 'find dystopian books', 'show me space movies', 'search for strategy games', 'find something like Dune', 'semantic search my library'.

Parameters:
- `query` (string): Natural language search query (e.g. 'dystopian sci-fi', 'mind-bending thrillers')
- `action` (string): Action: search (default), rebuild (sync FTS5 index), status (index stats)
- `mediaType` (string): Filter by media type: books, movies, tv, documentaries, games, music
- `limit` (number): Max results (default: 20, max: 100)
- `expand` (boolean): Enable semantic query expansion (default: true)

### enso_media_library_bulk_enrich

Bulk metadata enrichment orchestrator. Propagates cache enrichment to entity index and calls external APIs: TMDB (movies/TV/documentaries), Google Books (books), Steam Store (Steam games), IGDB via Twitch OAuth (console/non-Steam games). Use when the user says: 'enrich my library', 'bulk enrich', 'fill missing metadata', 'enrich movies with TMDB', 'enrich games with IGDB'.

Parameters:
- `action` (string): Action: status (show coverage), preview (dry run), enrich (execute)
- `mediaType` (string): Filter: all, books, movies, tv, games (default: all)
- `limit` (number): Max entities to API-enrich per run (default: 50)

### enso_media_library_batch_seed

Batch auto-seed engagement data (ratings, favorites, consumption status) from existing metadata in wiki pages. Converts Amazon stars, TMDB scores, and Metacritic ratings to the 1-10 user rating scale. Use when the user says: 'seed my ratings', 'auto-populate ratings', 'bootstrap engagement data'.

Parameters:
- `action` (string): Action: preview (dry run), seed (apply), status (show coverage)
- `skipExisting` (boolean): Skip entities that already have a user rating (default: true)

### enso_media_library_dashboard

Library health dashboard showing engagement coverage, discovery readiness, and an Engagement Health Score (0-100). Shows per-type breakdowns, gap alerts, and quick actions. Use when the user says: 'show library health', 'dashboard', 'library overview', 'engagement stats'.

### enso_media_library_stats

Cross-media statistics and insights. Shows totals by type, rating distributions, completion rates, top-rated items. Use when the user says: 'show my library stats', 'how many books have I read', 'media statistics'.

Parameters:
- `mediaType` (string): Limit stats to a specific media type (optional)

### enso_media_library_timeline

View media consumption timeline — started, completed, rated, favorited events over time grouped by month. Use when the user says: 'show my timeline', 'media consumption history', 'what did I read this month'.

Parameters:
- `period` (string): Time period: week, month, quarter, year, all (default: all)
- `mediaType` (string): Filter by media type

### enso_media_library_taste_profile

Analyze consumption patterns and generate a persistent taste profile: genre affinities, media preferences, cross-media connections, and a natural-language taste DNA summary. Use when the user says: 'show my taste profile', 'analyze my taste', 'what do I like'.

Parameters:
- `refresh` (boolean): Force regeneration (default: false)

### enso_media_library_smart_collections

Auto-generate thematic smart collections from semantic tag clusters. Actions: generate (propose collections), apply (save a proposal), refresh (update existing), list. Use when the user says: 'generate smart collections', 'auto-organize my library', 'find themes in my media'.

Parameters:
- `action` (string): Action: generate, apply, refresh, list
- `proposalId` (string): Proposal ID to apply

### enso_media_library_franchise

Detect and manage franchise/series groupings across books, movies, TV, and games. Actions: detect, list, view, merge. Use when the user says: 'find franchises', 'group related media', 'show series', 'what franchise is this part of'.

Parameters:
- `action` (string): Action: detect, list, view, merge
- `franchiseId` (string): Franchise ID (for view/merge)
- `entityId` (string): Entity ID to look up or merge

## Rating Scale

The media library uses a **10-point half-star scale** (1–10 integer) that displays as familiar 0.5–5.0 stars:

| Points | Stars | Label |
|--------|-------|-------|
| 10 | ★★★★★ | Masterpiece |
| 9 | ★★★★½ | Excellent |
| 8 | ★★★★ | Very Good |
| 7 | ★★★½ | Good |
| 6 | ★★★ | Above Average |
| 5 | ★★½ | Average |
| 4 | ★★ | Below Average |
| 3 | ★½ | Poor |
| 2 | ★ | Very Poor |
| 1 | ½ | Terrible |

Both integer (8) and star notation (4.0 stars = 8) are accepted. Use rating=0 to clear.
