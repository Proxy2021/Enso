# Knowledge Cortex — The Brain

> Enso's single source of truth. All knowledge, memory, profile, and data source content live as interlinked wiki pages. Based on Karpathy's "LLM Wiki" pattern: the LLM incrementally builds and maintains an interlinked markdown corpus instead of re-deriving knowledge via RAG on each query.

## Why Cortex Is the Only Brain

There is no separate memory store, profile DB, or RAG index. `buildEnsoContext()` reads only from Cortex. Every data source scan, research result, conversation memory, focus-area goal, sprint deliverable, and user-profile attribute lives as a markdown page in `~/.enso/wiki/`.

The benefit is compounding intelligence — each new scan or research call adds pages and cross-references that all subsequent agent turns can read. The agent literally edits its own knowledge base as it works.

## Storage Layout

```
~/.enso/wiki/
├── _index.md            # Machine-parseable catalog of every page (id, type, source, themes, tags, refs)
├── _log.md              # Append-only operation log (ingest, edit, lint, enrichment)
├── entities/            # External world — independent identity (ISBN, IMDB, Steam ID, channel ID)
│   ├── kindle-<title>.md
│   ├── steam-<game>.md
│   ├── youtube-<channel>.md
│   ├── project-<name>.md
│   └── ...
├── synthesis/           # System-created — everything Enso produced
│   ├── user-profile.md          # Protected — primary user identity for prompts
│   ├── conversation-memory.md   # Protected — persistent memory across conversations
│   ├── article-*.md             # Research outputs, deep-dive analyses
│   ├── idea-*.md                # Concepts, hypotheses
│   ├── app-*.md, project-*.md   # Created/managed by Enso
│   └── report-*.md              # Briefings, daily summaries
└── focuses/             # Focus area goals + per-focus expert wiki pages
    ├── <goal-slug>.md
    └── <focusId>/expert-<slug>.md
```

**The two-layer rule:**
- **Entities** = external identity. A book has an ISBN; a game has a Steam app ID; a channel has a YouTube ID. Cortex didn't invent these — they exist in the world.
- **Synthesis** = system-created. Ideas, articles, apps, projects, reports, profile, memory. Enso wrote it.

Cross-references are transparent across both layers: a book entity can connect to an idea synthesis; a Steam game to a project. Each entity type has an `appFamily` linking it to its home management app.

## Data Flow

```
                ┌──────────────────────────────┐
                │  13 DATA SOURCES (per-app)   │
                │  scan() returns structured   │
                │  items + summaries           │
                └──────────────┬───────────────┘
                               │
              ┌────────────────┼─────────────────┐
              ▼                                  ▼
   ┌─────────────────────┐         ┌─────────────────────────┐
   │ Direct Ingest       │         │ LLM Ingest              │
   │ (cortex-direct-     │         │ (cortex-tools.ts)       │
   │  ingest.ts)         │         │ For rich content:       │
   │                     │         │ research, manual notes  │
   │ Per-item .md pages  │         │ → AI-organized pages    │
   │ Zero LLM cost       │         │                         │
   └──────────┬──────────┘         └──────────┬──────────────┘
              │                                │
              └────────────────┬───────────────┘
                               ▼
              ┌────────────────────────────────┐
              │ Cross-Source Enrichment        │
              │ (cortex-enrichment.ts, scan-   │
              │  time, Gemini Flash)           │
              │                                │
              │ ① Semantic tags (3-5 universal │
              │    themes per entity)          │
              │ ② Cross-references (explicit   │
              │    relationships across sources)│
              └──────────────┬─────────────────┘
                             ▼
              ┌────────────────────────────────┐
              │ Cortex Index (_index.md)       │
              │ EntityIndexEntry: id, type,    │
              │ source, semanticTags, refs,    │
              │ themes                         │
              └──────────────┬─────────────────┘
                             ▼
              ┌────────────────────────────────┐
              │ Agent Context Injection        │
              │ (memory-bridge.ts)             │
              │ Every chat turn gets:          │
              │ - Data inventory counts        │
              │ - Theme-based summary (1500ch) │
              │ - Cross-reference instructions │
              └────────────────────────────────┘
```

**Two ingest paths** by design:
- **Direct ingest** for high-volume per-item content (every Kindle book, every Steam game) — zero LLM cost per item; metadata only.
- **LLM ingest** for rich, unstructured content (research output, user notes) — full pipeline organizes into entity/synthesis pages with proper structure.

## The Wiki Engine

Module: `server/src/cortex-tools.ts`. Exposes 7 agent tools that any conversation can call:

| Tool | Purpose |
|------|---------|
| `enso_wiki_search` | Full-text search with `source` and `theme` filters |
| `enso_wiki_read` | Read a specific page by id, with backlinks |
| `enso_wiki_ingest` | LLM ingest pipeline — turn rich content into entity/synthesis pages |
| `enso_wiki_list` | Browse pages by type / source / theme |
| `enso_wiki_lint` | Detect orphan pages, broken refs, duplicate entities |
| `enso_wiki_import_sources` | Trigger a data source rescan + re-ingest |
| `enso_cross_reference` | Find connections between two entities or themes |

The index (`_index.md`) is intentionally machine-parseable — each page entry carries `id`, `type`, `source`, `semanticTags`, `crossReferences`, and `themes`. Search filters operate on these fields without parsing page bodies.

## Cross-Source Enrichment

Module: `server/src/cortex-enrichment.ts`. Runs at scan time (not on the read path), so context injection stays cheap.

**Phase 1 — `enrichNewEntities()`** (Gemini Flash):
- Adds 3-5 **universal semantic tags** per entity that transcend source boundaries
- Examples: `coming-of-age`, `dystopia`, `survival`, `systems-thinking`, `craftsmanship`
- Goal: a Kindle book and a Steam game can share `survival` even though their source-specific tags ("post-apocalyptic-fiction" vs "survival-horror") would never overlap

**Phase 2 — `crossReferenceNewEntities()`**:
- Sends new entities + the full data inventory to the LLM
- LLM identifies explicit relationships ("This book inspired the design of this game", "These two YouTube channels cover the same field")
- Stores `{ targetId, reason }` cross-references on the source entity

Both phases populate `EntityIndexEntry.semanticTags` and `EntityIndexEntry.crossReferences`. Backfill any time via `POST /api/cortex-enrich`.

### 3-Tier Related Items

Module: `server/src/entity-model.ts`. Entity detail pages find related items in this order:

1. **Pre-computed cross-references** (LLM-generated reasons) — strongest signal
2. **Semantic tag overlap** (universal LLM-derived themes)
3. **Regular tag overlap with source-tag exclusion** — `kindle`, `steam`, `youtube`, etc. are excluded so a book doesn't just match every other book

This three-tier fallback prevents same-source bias and surfaces genuine cross-domain connections.

## Synthesis Engine

Module: `server/src/cortex-synthesis.ts`. LLM-first cross-source intelligence on the read path.

| Function | What |
|----------|------|
| `synthesize(topic)` | Send full data inventory to LLM, find semantic connections across all 13 sources |
| `findRelatedContent(topic)` | Fast keyword pre-filter — zero LLM cost |
| `generateThematicMap()` | Deep cross-cutting life-theme analysis |
| `buildDataInventory()` | Compile compact view of all 13 data sources for LLM context |

Used by: research result enrichment, the Cortex Explorer's "Synthesis" tab, daily morning briefing.

## Data Sources — The Input Pipeline

Consent-gated system that scans the user's desktop environment. All data stays local.

### Registry & Pipeline

- **`DATA_SOURCES` registry** (`data-source-registry.ts`): Centralized descriptor for each source. Each entry declares `id`, `scan()`, `formatForProfile()` (compact summary for user profile page), `formatForCortex()` (rich content for LLM ingest), and `getDirectIngestPages()` (per-item wiki pages).
- **Post-scan pipeline** (`data-source-pipeline.ts`): Auto-detects changes vs. previous scan, creates per-item Cortex pages via direct ingest, triggers LLM ingest for the profile/summary content.
- **Onboarding** (`onboarding.ts`): First-run flow guides users through enabling sources and runs initial scans.

### 13 Data Sources

| Source | App | Scan Method | Per-Item Pages |
|--------|-----|-------------|----------------|
| **Files** | `server/apps/projects/` | Project detection (package.json, .git) | Per-project pages |
| **Browser History** | `server/apps/browser/` | SQLite (Chrome/Edge) | Top sites |
| **Bookmarks** | `server/apps/browser/` | SQLite (Chrome/Edge) | Bookmark folders |
| **Email** | `server/apps/email_scanner/` | Outlook COM / Himalaya CLI | — |
| **System** | `server/apps/system_info/` | Installed apps + running processes | — |
| **Kindle** | `server/apps/kindle/` | My Clippings.txt parser | Per-book pages with highlights |
| **WeRead** | `server/apps/weread/` | API + browser session | Per-book pages |
| **YouTube** | `server/apps/youtube_manager/` | YouTube Data API v3 | Per-channel pages |
| **Steam** | `server/apps/steam/` | ACF manifest parsing | Per-game pages with genres, metacritic |
| **Movies/TV** | `server/apps/movies_tv/` | Filesystem scan + TMDB API | Per-movie/show pages with posters, cast |
| **Photos** | `server/apps/photo_library/` | Filesystem + EXIF parser | Per-album pages with date/camera |
| **Twitter/X** | `server/apps/twitter/` | Puppeteer (persistent session) | Per-account pages |
| **QQ Music** | `server/apps/qq_music/` | Puppeteer + local file scan | Per-artist pages |

### Data Source as App Pattern

Each data source is also a full Enso app with its own browsable UI (`server/apps/kindle/` is the canonical example):
- `app.json` — tool definitions (scan, browse, search, enrich)
- `template.jsx` — browsable UI with library/highlights/search tabs
- `executors/scan.js` — runs the scan, returns structured data
- `executors/browse.js` — paginated browsing
- `executors/search.js` — full-text search

**Adding a new data source** = create one app directory + add one entry to `DATA_SOURCES` in `data-source-registry.ts`.

### Profile Builder

Module: `server/src/user-context-builder.ts`. Runs all consented scanners → reduces via `formatForProfile()` → synthesizes into Cortex `synthesis/user-profile.md` via LLM. This page is the primary user identity surface for every agent prompt.

Storage: `~/.enso/data/user-context/` — `consent.json`, `profile.json`, `scan-log.json`, `cache/*.json`. Settings UI: Settings > Data Sources tab — per-source toggles.

## Cortex Explorer App

Shipped app at `server/apps/cortex/`. The user's window into Cortex.

| Executor | View |
|----------|------|
| `explore` | Dashboard — stats, top entities, gaps, recent ingests |
| `read` | Article viewer with backlinks |
| `search` | Full-text + filter search |
| `graph` | Treemap visualization of entity types and themes |
| `discover` | Web search + AI branch suggestions for blind spots |
| `ingest` | Manual content ingest (paste text, URL, file) |
| `digest` | AI-generated knowledge summary |
| `daily_discovery` | The scheduled task that produces the morning briefing |

## Auto-Persist App Cards

Module: `server/src/card-to-cortex.ts`. Significant app card results (research output, deep-dive analyses, sprint deliverables) are automatically persisted as Cortex wiki pages. The agent doesn't need to explicitly call `enso_wiki_ingest` — the rendering pipeline does it on completion for cards that meet the persistence criteria.

## Daily Discovery

Scheduled task ID: `cortex-daily-discovery`. Module: `server/apps/cortex/executors/daily_discovery.js`.

**Pipeline:**
1. Identify top Cortex topics (semantic tag frequency + recent activity)
2. Web search for each topic with personalized relevance filter
3. AI categorizes findings (breakthrough / context / noise) per topic
4. Ingest the breakthroughs into `entities/` + `synthesis/`
5. Email an HTML intelligence briefing

**Briefing structure (9 sections):**
1. Executive summary
2. Findings (the new external signal)
3. **On This Day** — photo memories from the photo library
4. **Fresh Videos** — new uploads from subscribed YouTube channels
5. **Library stats** — books read this week, games played, songs added
6. **Project Pulse** — git activity across detected projects
7. **Knowledge Growth** — new Cortex pages + cross-references this week
8. **From Your Brain** — cross-source synthesis the system found surprising
9. **Blind Spots** — themes the user hasn't engaged with recently

Every section is grounded in actual Cortex data; nothing is fabricated.

## Context Injection (How the Agent Sees Cortex)

Module: `server/src/memory-bridge.ts`. `buildEnsoContext()` runs on every agent conversation turn and injects:

1. **Data source inventory** — counts (book/movie/game/photo/etc.) so the agent knows what's available
2. **Theme-based Cortex summary** — 1500-char rolling summary of active themes
3. **Cross-reference instructions** — explicit prompt that the agent should call `enso_cross_reference` when relevant
4. **User profile** — pulled from `synthesis/user-profile.md`
5. **Conversation memory** — pulled from `synthesis/conversation-memory.md`

Cost: zero LLM. All injection content is pre-computed (semantic tags, profile page, memory page) — the agent reads index entries and protected pages directly.

## Active Intelligence

Module: `server/src/proactive-engine.ts`. Five cross-app suggestion types that surface in the UI without user prompting:

| Type | Trigger |
|------|---------|
| **Trending convergence** | Multiple new YouTube videos on a Cortex theme |
| **Knowledge gaps** | High-traffic theme with thin/stale entity pages |
| **Cross-source connections** | Newly enriched cross-reference between two long-existing entities |
| **Photo memories** | EXIF date matches today (years prior) |
| **Stale project alerts** | Project entity untouched for >N days |

These feed into the Team Leader's morning routine and the Daily Discovery briefing.

## Research Integration

Every research result (`researcher-tools.ts`) automatically includes a `cortexSynthesis` field — the system runs `synthesize(topic)` on the topic against the user's personal library and embeds an LLM narrative explaining the connections. The user sees: "Here's what's new on the web" plus "Here's how this connects to what you already know."

## Operational Notes

**Migration**: `cortex-migration.ts` handles version-gated data migrations on server startup. The current schema is the two-layer architecture (entities + synthesis + focuses); older 5-directory layouts are migrated automatically. The previous index format is preserved as `_index.md.v1.bak`.

**Lint**: `enso_wiki_lint` detects orphan pages (no inbound refs), broken cross-references (dangling targetIds), and duplicate entities (same external identity, different pages). Run periodically; the Team Leader includes lint results in its morning signal gathering.

**Backfill**: `POST /api/cortex-enrich` re-runs Phase 1 + 2 enrichment over all entities. Useful after schema changes or when introducing a new universal-tag taxonomy.

## Key Files

**Backend:**
- `server/src/cortex-tools.ts` — wiki engine, 7 agent tools
- `server/src/cortex-synthesis.ts` — LLM cross-source intelligence
- `server/src/cortex-direct-ingest.ts` — per-item page creation (zero LLM)
- `server/src/cortex-enrichment.ts` — semantic tags + cross-references at scan time
- `server/src/cortex-migration.ts` — version-gated schema migrations
- `server/src/card-to-cortex.ts` — auto-persist significant card results
- `server/src/data-source-registry.ts` — `DATA_SOURCES` descriptor registry
- `server/src/data-source-pipeline.ts` — post-scan ingest orchestration
- `server/src/user-context-builder.ts` — profile builder
- `server/src/onboarding.ts` — first-run data source flow
- `server/src/entity-model.ts` — entity types, related-items 3-tier algorithm
- `server/src/memory-bridge.ts` — `buildEnsoContext()` (the injection point)
- `server/src/proactive-engine.ts` — active intelligence
- `server/apps/cortex/` — Cortex Explorer app

**Frontend:**
- `src/components/CortexView.tsx` — Cortex tab (dashboard, reader, graph, search)

**REST endpoints:**
- `POST /api/cortex-enrich` — backfill Phase 1 + 2 enrichment over all entities (optional `entityId` query param for single-entity re-run)
- `GET /api/cortex-stats` — page counts by type, source, recent activity
- `GET /api/cortex-pulse` — recent ingest/enrichment signal (used by Team Leader morning routine)
- `POST /api/cortex-direct-ingest` — create per-item pages without LLM (used by data source pipeline)
- `POST /api/cortex-import` — bulk LLM ingest
- `POST /api/cortex/action` — dispatch Cortex Explorer actions from the UI
- `GET /api/cortex/quick-add?title&type&creator` — one-click entity stub from email briefing links
