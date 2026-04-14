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

Rate a media entity on a 1-10 scale with optional notes. Use when the user says: 'rate this book', 'give it an 8', 'rate my movie'.

Parameters:
- `entityId` (string): The entity ID to rate
- `rating` (number): Rating from 1-10 (0 to clear)
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
