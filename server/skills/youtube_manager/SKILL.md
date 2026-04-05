---
name: youtube_manager
description: "YouTube Manager: subscription management, personalized feed, trending, AI-powered channel discovery, analytics, bulk cleanup"
---

# Youtube Manager

YouTube Manager: subscription management, personalized feed, trending, AI-powered channel discovery, analytics, bulk cleanup

## Available Tools

### enso_youtube_manager_manage (primary)

View and manage all YouTube subscriptions with auto-categorization, stats, health scores, and bulk actions

Parameters:
- `refresh` (boolean): Force refresh (bypass 10-min cache)

### enso_youtube_manager_feed

Personalized video feed from your subscribed channels, sorted by newest. Supports filtering by subscription category (resolves channel IDs from cached subscription data).

Parameters:
- `maxResults` (number): Number of videos (default 20)
- `category` (string): Filter by subscription category (e.g. "AI & Machine Learning", "Gaming")

### enso_youtube_manager_trending

Trending YouTube videos by region and category

Parameters:
- `regionCode` (string): Country code (default HK). Examples: US, GB, JP, KR
- `categoryId` (string): YouTube category: 10=Music, 20=Gaming, 28=Science
- `maxResults` (number): Number of videos (default 20)

### enso_youtube_manager_discover

AI-powered channel discovery based on your Enso profile interests. Runs search queries in parallel for faster results. Deduplicates against existing subscriptions.

Parameters:
- `topic` (string): Specific topic to search for (overrides profile-driven discovery)
- `maxResults` (number): Number of channels to discover (default 10)

### enso_youtube_manager_analytics

Subscription analytics: category distribution, channel size distribution, total/avg/median subscriber counts, engagement insights

### enso_youtube_manager_unsubscribe

Unsubscribe from one or more YouTube channels

Parameters:
- `channelIds` (array): Channel IDs to unsubscribe from
