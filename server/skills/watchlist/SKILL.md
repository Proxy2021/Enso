---
name: watchlist
description: "Discover, track, and rate movies and TV series with a personal watchlist and AI-powered recommendations"
---

# Watchlist

Discover, track, and rate movies and TV series with a personal watchlist and AI-powered recommendations

## Available Tools

### enso_watchlist_browse (primary)

Browse your watchlist with filtering by status, genre, or rating

Parameters:
- `status` (string): Filter by status: all, to-watch, watching, completed (default: all)
- `sortBy` (string): Sort by: title, rating, dateAdded (default: dateAdded)

### enso_watchlist_search

Search for movies and TV series by title to add to your watchlist

Parameters:
- `query` (string): Movie or TV series title to search for

### enso_watchlist_add

Add a movie or TV series to your watchlist

Parameters:
- `title` (string): Title of the movie/series
- `year` (number): Release year
- `type` (string): movie or tv
- `genre` (string): Genre
- `status` (string): to-watch, watching, or completed (default: to-watch)
- `notes` (string): Personal notes

### enso_watchlist_update

Update a watchlist item's status, rating, or notes

Parameters:
- `itemId` (string): ID of the watchlist item
- `status` (string): New status: to-watch, watching, completed
- `rating` (number): Rating 1-5 (0 to clear)
- `notes` (string): Updated notes

### enso_watchlist_recommend

Get AI-powered movie/TV recommendations based on your watch history and ratings

Parameters:
- `mood` (string): Optional mood or preference (e.g. 'something light', 'mind-bending sci-fi')

### enso_watchlist_remove

Remove an item from your watchlist

Parameters:
- `itemId` (string): ID of the item to remove
