---
name: enso-city-planner
description: City exploration with restaurants, photo spots, landmarks, video guides, and persistent research history.
metadata: { "openclaw": { "emoji": "🏙️", "requires": { "env": ["GEMINI_API_KEY"] } } }
---

# Enso City Planner

Discover and research cities — top restaurants, Instagram-worthy photo spots, iconic landmarks, and curated video travel guides. Results include web images, AI-generated summaries, and are persisted for fast revisits.

## When to use

Use the city planner tools when:

- The user wants to **explore a city** — restaurants, sightseeing, photography spots
- Planning a **trip** and needing curated recommendations
- Looking for the **best places** to eat, photograph, or visit in a specific city
- Requesting a **city overview** or travel research
- Wanting to **revisit** previously explored cities from their history

Do NOT use for:

- General web research not specific to a city (use `enso_researcher_search` instead)
- Booking flights, hotels, or transportation
- Real-time information like weather or event schedules

## Tools

### enso_city_explore (start here)

Primary entry point. Researches all three categories (restaurants, photo spots, landmarks) plus video guides in parallel using web search + AI synthesis.

```
enso_city_explore({ city: "Tokyo" })
```

- Pass empty string for `city` to get the welcome view with recent explorations
- Results are **cached** — revisiting a city returns instantly from history
- Use `force: true` to bypass cache and get fresh results
- Returns: sections with places, videos, summary, search sources

### enso_city_restaurants

Deep dive into restaurants for a specific city. Supports cuisine filtering.

```
enso_city_restaurants({ city: "Paris", cuisine: "French", limit: 8 })
```

- `cuisine`: Optional filter — "Italian", "Japanese", "French", "Mexican", "Indian", etc.
- `limit`: 2-12 results (default 6)

### enso_city_photo_spots

Discover scenic and Instagram-worthy photography locations.

```
enso_city_photo_spots({ city: "Santorini", limit: 8 })
```

### enso_city_landmarks

Research tourist landmarks — historical, iconic, and cultural sites.

```
enso_city_landmarks({ city: "Rome", limit: 8 })
```

### enso_city_send_email

Email a full city travel guide to a recipient. Pulls all data (sections, videos, sources) from the exploration cache automatically — just provide recipient and city.

```
enso_city_send_email({ recipient: "user@example.com", city: "Tokyo" })
```

- The city must have been explored first via `enso_city_explore`
- Sends via himalaya (local SMTP) — no external API key needed

### enso_city_delete_history

Remove saved city explorations from persistent history.

```
enso_city_delete_history({ city: "Paris" })        // delete one city
enso_city_delete_history({ city: "" })              // clear all history
```

## Workflow

1. **Start with `explore`** — always use `enso_city_explore` first for a full city overview
2. **Deep dive** — use `restaurants`, `photo_spots`, or `landmarks` to get more results in one category
3. **Revisit** — call `explore` again with the same city to load from cache; use `force: true` for fresh data
4. **Email** — pass structured data from explore results to `send_email`

## Notes

- City research results persist across sessions in the user's exploration library
- The tool returns structured JSON; on Enso's UI channel it renders as an interactive city research board with tabbed views, video grid, and place detail dialogs
- Gemini API key is required for AI synthesis; without it, raw search data or sample results are returned
- Brave Search API key (`BRAVE_API_KEY`) provides live web and image search; without it, falls back to LLM-only or sample data
