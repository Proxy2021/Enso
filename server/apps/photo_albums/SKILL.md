---
name: photo_albums
description: "Photo Albums: collect iconic albums from the world's best photographers and build themed albums from your own library. Browse, search, daily discovery, research-seeded external albums, curated personal collections."
---

Photo Albums is a first-class Cortex citizen alongside books and movies. Each album is a `photo-album` entity with its own wiki page at `entities/album-<slug>.md`. Two kinds:

- **External** — iconic monographs from the world's great photographers (e.g., Henri Cartier-Bresson's *The Decisive Moment*, Fan Ho's *Hong Kong Yesterday*). Seeded via web research.
- **Personal** — themed collections curated from the user's own photo library (e.g., "Hong Kong Street 2025", "Mountain Portraits").

## Tool Reference

### enso_photo_albums_browse (primary)

Browse curated photo albums. Tabs: `all` / `external` / `personal`. Supports filters (photographer, style, theme), search, sort, pagination.

### enso_photo_albums_search

Text search across title, photographer, description, themes.

### enso_photo_albums_seed_external

Research and add an external photographer's album. Parameters: `photographer` (required), `albumTitle` (optional — LLM picks the most iconic if omitted), `style` (optional hint). Pipeline: web search → LLM extracts bio/plates/style/cover → writes cache + Cortex page.

### enso_photo_albums_curate_personal

Create a themed album from the user's photos. Parameters: `title` (required), `theme`, `description`, `photoEntityIds` or `photoPaths`, `coverPath`.

### enso_photo_albums_rate

Taste profile interactions (save / rate / dismiss / favorite / view). Feeds into daily discovery.

### enso_photo_albums_discover

Daily discovery with day-of-week themes:
- Sunday: Photojournalism
- Monday: Documentary
- Tuesday: Portrait
- Wednesday: Street
- Thursday: Fine Art
- Friday: Fashion
- Saturday: Landscape

Pulls candidates from Wikipedia (photographer bios) + Open Library (monographs) + web search. LLM curates against the user's taste profile.

### enso_photo_albums_update

Rebuild entity index + Cortex pages from cache. Run after manual edits.
