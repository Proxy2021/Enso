---
name: market_intelligence
description: "Market intelligence dashboard for researching market size, segments, regional breakdown, top players, and trends for any industry"
---

# Market Intelligence

Market intelligence dashboard for researching market size, segments, regional breakdown, top players, and trends for any industry

## Available Tools

### enso_market_intelligence_overview (primary)

Get a high-level market overview with key metrics, regional preview chart, and highlights for any market or industry

Parameters:
- `query` (string): The market or industry to research (e.g., 'global e-commerce', 'AI chips', 'electric vehicles')

### enso_market_intelligence_regions

Get detailed regional market breakdown with market size, growth rates, share percentages, and key markets per region

Parameters:
- `query` (string): The market or industry to analyze regionally

### enso_market_intelligence_segments

Analyze market segments with size, share, and growth rates including pie chart visualization

Parameters:
- `query` (string): The market or industry to segment

### enso_market_intelligence_players

Research top companies and players in a market with revenue, GMV, market share, and growth data

Parameters:
- `query` (string): The market or industry to find top players for
- `limit` (number): Maximum number of players to return (default: 15)

### enso_market_intelligence_trends

Identify key growth drivers, headwinds, and emerging trends for a market or industry

Parameters:
- `query` (string): The market or industry to analyze trends for

### enso_market_intelligence_search

Search across market data for specific companies, regions, segments, or trends

Parameters:
- `query` (string): Search query for market intelligence
