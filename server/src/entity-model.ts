/**
 * entity-model.ts — Formal Entity model for the Enso platform.
 *
 * An Entity is the universal data atom: anything that can be identified,
 * viewed, and connected — a book, a game, a movie, a photo, a song, etc.
 *
 * Entities unify three representations:
 *   1. App card data (rendered in UI via templates)
 *   2. Cortex wiki pages (persistent knowledge at ~/.enso/wiki/)
 *   3. Data source cache entries (fast browsing from JSON caches)
 *
 * Key design decisions:
 *   - EntityId is deterministic: "{source}:{type}:{slug}" — same item always gets same ID
 *   - cortexPath is optional: not every entity needs a wiki page (photos, songs)
 *   - children/parentId enables containment: album→photos, playlist→songs
 *   - Entity index is derived & rebuildable from caches + Cortex
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { logAction, logError } from "./action-log.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Stable entity identifier: "{source}:{type}:{slug}" */
export type EntityId = string;

/** All recognized entity types */
export type EntityType =
  | "book" | "game" | "movie" | "tv-series" | "documentary"
  | "album" | "photo"
  | "song" | "playlist" | "artist"
  | "channel" | "video"
  | "project"
  | "article" | "place"
  | "person" | "twitter-account"
  | "concept" | "source" | "synthesis" | "app";

/** Data source identifiers */
export type EntitySource =
  | "kindle" | "weread" | "steam" | "movies_tv" | "photos" | "qq_music"
  | "youtube" | "twitter" | "files" | "browser" | "email"
  | "cortex" | "research" | "manual";

/** Lightweight reference — carried in arrays, card data, parent/child links */
export interface EntityRef {
  entityId: EntityId;
  type: EntityType;
  source: EntitySource;
  title: string;
  slug: string;
  imageUrl?: string;
}

/** Full entity with all metadata */
export interface Entity extends EntityRef {
  summary?: string;
  tags: string[];
  themes: string[];
  cortexPath?: string;       // wiki page path (may be undefined)
  cacheKey?: string;         // pointer into source cache
  children?: EntityRef[];    // album→photos, playlist→songs, channel→videos
  parentId?: EntityId;       // photo→album, song→playlist
  metadata: Record<string, unknown>; // source-specific fields
  externalUrl?: string;
  updatedAt: string;
}

/** Parsed entity ID components */
export interface ParsedEntityId {
  source: EntitySource;
  type: EntityType;
  slug: string;
}

// ─── Entity Type Registry ────────────────────────────────────────────────────

export interface EntityTypeDef {
  sources: EntitySource[];
  cortexPrefix: string;        // wiki path prefix (matches existing conventions)
  canContain?: EntityType[];   // child entity types
  detailFields: string[];      // metadata keys surfaced in detail view
}

/**
 * Static registry of all entity types.
 * cortexPrefix values match existing page naming in data-source-registry.ts.
 */
export const ENTITY_TYPES: Record<string, EntityTypeDef> = {
  "book": {
    sources: ["kindle", "weread", "research"],
    cortexPrefix: "entities/",
    detailFields: ["author", "rating", "reviewCount", "pageCount", "publisher", "publicationDate", "categories", "description"],
  },
  "game": {
    sources: ["steam", "research"],
    cortexPrefix: "entities/game-",
    detailFields: ["genres", "developer", "metacritic", "releaseDate", "sizeOnDisk", "lastPlayed", "description"],
  },
  "movie": {
    sources: ["movies_tv", "research"],
    cortexPrefix: "entities/movie-",
    detailFields: ["director", "cast", "rating", "voteCount", "runtime", "genres", "year", "overview"],
  },
  "tv-series": {
    sources: ["movies_tv", "research"],
    cortexPrefix: "entities/tv-",
    detailFields: ["seasons", "cast", "rating", "genres", "year", "overview"],
  },
  "documentary": {
    sources: ["movies_tv", "research"],
    cortexPrefix: "entities/movie-",
    detailFields: ["director", "rating", "runtime", "genres", "year", "overview"],
  },
  "album": {
    sources: ["photos"],
    cortexPrefix: "entities/photo-album-",
    canContain: ["photo"],
    detailFields: ["photoCount", "dateRange", "cameras", "extensions"],
  },
  "photo": {
    sources: ["photos"],
    cortexPrefix: "", // no cortex page by default
    detailFields: ["camera", "date", "location", "dimensions", "filePath"],
  },
  "song": {
    sources: ["qq_music"],
    cortexPrefix: "", // no cortex page by default
    detailFields: ["artist", "album", "duration"],
  },
  "playlist": {
    sources: ["qq_music"],
    cortexPrefix: "entities/playlist-",
    canContain: ["song"],
    detailFields: ["trackCount", "creator"],
  },
  "artist": {
    sources: ["qq_music"],
    cortexPrefix: "entities/artist-",
    canContain: ["song"],
    detailFields: ["trackCount", "genres"],
  },
  "channel": {
    sources: ["youtube", "research"],
    cortexPrefix: "entities/",
    canContain: ["video"],
    detailFields: ["subscriberCount", "videoCount", "category", "description"],
  },
  "video": {
    sources: ["youtube"],
    cortexPrefix: "", // no cortex page by default
    detailFields: ["views", "duration", "publishedAt", "channelTitle"],
  },
  "project": {
    sources: ["files"],
    cortexPrefix: "entities/",
    detailFields: ["language", "framework", "dependencies", "lastModified", "size"],
  },
  "article": {
    sources: ["research", "manual"],
    cortexPrefix: "entities/article-",
    detailFields: ["author", "source", "publishedDate", "url", "summary", "topics"],
  },
  "place": {
    sources: ["research", "manual", "photos"],
    cortexPrefix: "entities/place-",
    detailFields: ["country", "region", "bestTimeToVisit", "currency", "language", "climate"],
  },
  "person": {
    sources: ["cortex", "manual"],
    cortexPrefix: "entities/",
    detailFields: ["role", "organization", "context"],
  },
  "twitter-account": {
    sources: ["twitter"],
    cortexPrefix: "entities/twitter-",
    detailFields: ["handle", "followersCount", "bio"],
  },
  "concept": {
    sources: ["cortex", "research", "manual"],
    cortexPrefix: "concepts/",
    detailFields: ["definition", "relatedConcepts"],
  },
  "source": {
    sources: ["cortex", "research"],
    cortexPrefix: "sources/",
    detailFields: ["sourceUrl", "dateAccessed"],
  },
  "synthesis": {
    sources: ["cortex"],
    cortexPrefix: "synthesis/",
    detailFields: ["themes", "scope"],
  },
  "app": {
    sources: ["cortex", "files"],
    cortexPrefix: "entities/",
    detailFields: ["toolFamily", "toolCount", "createdAt"],
  },
};

// ─── ID Helpers ──────────────────────────────────────────────────────────────

/**
 * Unicode-aware slugification. Keeps letters and digits from any script.
 * Matches the best existing pattern (from researcher-tools.ts).
 */
export function slugify(text: string, maxLen = 80): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
  if (!slug) {
    // Fallback: hash-based slug for edge cases
    const hash = Array.from(text).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    return "item-" + Math.abs(hash).toString(36);
  }
  return slug;
}

/** Build a deterministic entity ID */
export function buildEntityId(source: EntitySource, type: EntityType, slug: string): EntityId {
  return `${source}:${type}:${slug}`;
}

/** Parse an entity ID into its components */
export function parseEntityId(entityId: EntityId): ParsedEntityId | null {
  const parts = entityId.split(":");
  if (parts.length < 3) return null;
  const [source, type, ...slugParts] = parts;
  return {
    source: source as EntitySource,
    type: type as EntityType,
    slug: slugParts.join(":"), // slug may contain colons (unlikely but safe)
  };
}

/** Build an EntityRef from basic fields */
export function buildEntityRef(
  source: EntitySource,
  type: EntityType,
  title: string,
  imageUrl?: string,
): EntityRef {
  const slug = slugify(title);
  return {
    entityId: buildEntityId(source, type, slug),
    type,
    source,
    title,
    slug,
    imageUrl,
  };
}

/** Derive the expected Cortex wiki path for an entity */
export function entityCortexPath(entityId: EntityId): string | undefined {
  const parsed = parseEntityId(entityId);
  if (!parsed) return undefined;
  const typeDef = ENTITY_TYPES[parsed.type];
  if (!typeDef || !typeDef.cortexPrefix) return undefined;
  return `${typeDef.cortexPrefix}${parsed.slug}.md`;
}

// ─── Entity Index ────────────────────────────────────────────────────────────

const ENSO_HOME = join(homedir(), ".enso");
const ENTITY_INDEX_PATH = join(ENSO_HOME, "data", "entity-index.json");

/** In-memory entity index: EntityId → EntityRef + cortexPath + metadata subset */
export interface EntityIndexEntry extends EntityRef {
  cortexPath?: string;
  children?: EntityRef[];
  parentId?: EntityId;
  tags?: string[];
  updatedAt?: string;
  /** Structured metadata stored by enrichment (used for types without a data source cache, e.g. place) */
  metadata?: Record<string, unknown>;
  /** LLM-derived universal semantic tags for cross-source relationships (e.g., "coming-of-age", "dystopia") */
  semanticTags?: string[];
  /** Explicit cross-source relationships discovered by LLM during ingest */
  crossReferences?: Array<{ entityId: EntityId; reason: string }>;
  /** YouTube videos matched by title search during enrichment */
  recommendedVideos?: Array<{
    videoId: string;
    title: string;
    channelTitle: string;
    thumbnailUrl: string;
    viewCount?: string;
    duration?: string;
  }>;
}

let entityIndex: Map<EntityId, EntityIndexEntry> = new Map();
let indexLoaded = false;

/** Get the current entity index (read-only) */
export function getEntityIndex(): ReadonlyMap<EntityId, EntityIndexEntry> {
  if (!indexLoaded) loadEntityIndex();
  return entityIndex;
}

/** Look up an entity in the index */
export function lookupEntity(entityId: EntityId): EntityIndexEntry | undefined {
  if (!indexLoaded) loadEntityIndex();
  return entityIndex.get(entityId);
}

/** Add or update an entity in the index */
export function upsertEntityIndex(entry: EntityIndexEntry): void {
  entityIndex.set(entry.entityId, entry);
}

/** Get entities by source */
export function getEntitiesBySource(source: EntitySource, limit?: number): EntityIndexEntry[] {
  if (!indexLoaded) loadEntityIndex();
  const results: EntityIndexEntry[] = [];
  for (const entry of entityIndex.values()) {
    if (entry.source === source) {
      results.push(entry);
      if (limit && results.length >= limit) break;
    }
  }
  return results;
}

/** Get entities by type */
export function getEntitiesByType(type: EntityType, limit?: number): EntityIndexEntry[] {
  if (!indexLoaded) loadEntityIndex();
  const results: EntityIndexEntry[] = [];
  for (const entry of entityIndex.values()) {
    if (entry.type === type) {
      results.push(entry);
      if (limit && results.length >= limit) break;
    }
  }
  return results;
}

/** Get entities discovered via research for a specific type */
export function getDiscoveredEntities(type: EntityType, limit?: number): EntityIndexEntry[] {
  if (!indexLoaded) loadEntityIndex();
  const results: EntityIndexEntry[] = [];
  for (const entry of entityIndex.values()) {
    if (entry.source === "research" && entry.type === type) {
      results.push(entry);
      if (limit && results.length >= limit) break;
    }
  }
  return results;
}

/** Load entity index from disk */
export function loadEntityIndex(): void {
  try {
    if (existsSync(ENTITY_INDEX_PATH)) {
      const raw = readFileSync(ENTITY_INDEX_PATH, "utf-8");
      const data = JSON.parse(raw) as Record<string, EntityIndexEntry>;
      entityIndex = new Map(Object.entries(data));
      indexLoaded = true;
      logAction({ ts: Date.now(), type: "system", category: "entity-index", message: `Loaded entity index: ${entityIndex.size} entries` });
    } else {
      entityIndex = new Map();
      indexLoaded = true;
    }
  } catch (err) {
    logError("entity-index", "Failed to load entity index", err);
    entityIndex = new Map();
    indexLoaded = true;
  }
}

/** Persist entity index to disk */
export function saveEntityIndex(): void {
  try {
    const dir = dirname(ENTITY_INDEX_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const data: Record<string, EntityIndexEntry> = {};
    for (const [id, entry] of entityIndex) data[id] = entry;
    writeFileSync(ENTITY_INDEX_PATH, JSON.stringify(data), "utf-8");
    logAction({ ts: Date.now(), type: "system", category: "entity-index", message: `Saved entity index: ${entityIndex.size} entries` });
  } catch (err) {
    logError("entity-index", "Failed to save entity index", err);
  }
}

// ─── Index Building ──────────────────────────────────────────────────────────

/** Cache file paths by source ID (matches data-source-registry.ts cacheFile fields) */
const CACHE_FILES: Record<string, string> = {
  kindle: "kindle-library.json",
  weread: "weread-library.json",
  steam: "steam-games.json",
  movies_tv: "movies-tv.json",
  photos: "photo-library.json",
  qq_music: "qq-music.json",
  youtube: "youtube-data.json",
  twitter: "twitter-following.json",
  files: "file-index.json",
  browser: "bookmarks.json",
  email: "email-summary.json",
  system: "system-info.json",
};

/** Read a cache file for a data source */
function readCache(source: string): unknown | null {
  const filename = CACHE_FILES[source];
  if (!filename) return null;
  const cachePath = join(ENSO_HOME, "data", "user-context", "cache", filename);
  try {
    if (!existsSync(cachePath)) return null;
    return JSON.parse(readFileSync(cachePath, "utf-8"));
  } catch {
    return null;
  }
}

/** Extract EntityRefs from a Kindle library cache */
function extractKindleEntities(cached: unknown): EntityIndexEntry[] {
  const data = cached as { books?: Array<{ title: string; author?: string; coverUrl?: string; asin?: string; categories?: string[] }> };
  if (!data?.books) return [];
  return data.books.filter(b => b.title).map(b => {
    const slug = slugify(b.title);
    return {
      entityId: buildEntityId("kindle", "book", slug),
      type: "book" as EntityType,
      source: "kindle" as EntitySource,
      title: b.title,
      slug,
      imageUrl: b.coverUrl,
      cortexPath: `entities/${slug}.md`,
      tags: ["book", "kindle", ...(b.categories || []).map(c => c.toLowerCase())],
    };
  });
}

/** Extract EntityRefs from a WeRead library cache */
function extractWereadEntities(cached: unknown): EntityIndexEntry[] {
  const data = cached as { books?: Array<{ title: string; author?: string; coverUrl?: string; wereadBookId?: string; categories?: string[] }> };
  if (!data?.books) return [];
  return data.books.filter(b => b.title).map(b => {
    const slug = slugify(b.title);
    return {
      entityId: buildEntityId("weread", "book", slug),
      type: "book" as EntityType,
      source: "weread" as EntitySource,
      title: b.title,
      slug,
      imageUrl: b.coverUrl,
      cortexPath: `entities/weread-${slug}.md`,
      tags: ["book", "weread", ...(b.categories || []).map(c => c.toLowerCase())],
    };
  });
}

/** Extract EntityRefs from a Steam games cache */
function extractSteamEntities(cached: unknown): EntityIndexEntry[] {
  const data = cached as { games?: Array<{ name: string; appId?: number; genres?: string[] }> };
  if (!data?.games) return [];
  return data.games.filter(g => g.name).map(g => {
    const slug = slugify(g.name);
    return {
      entityId: buildEntityId("steam", "game", slug),
      type: "game" as EntityType,
      source: "steam" as EntitySource,
      title: g.name,
      slug,
      cortexPath: `entities/game-${slug}.md`,
      tags: ["game", "steam", ...(g.genres || []).map(c => c.toLowerCase())],
    };
  });
}

/** Extract EntityRefs from Movies/TV cache */
function extractMoviesTvEntities(cached: unknown): EntityIndexEntry[] {
  const data = cached as { items?: Array<{ title: string; category?: string; posterPath?: string; genres?: string[]; year?: number }> };
  if (!data?.items) return [];
  return data.items.filter(m => m.title).map(m => {
    const slug = slugify(m.title + (m.year ? `-${m.year}` : ""));
    const type: EntityType = m.category === "tv" ? "tv-series" : m.category === "documentaries" ? "documentary" : "movie";
    const prefix = type === "tv-series" ? "tv-" : "movie-";
    return {
      entityId: buildEntityId("movies_tv", type, slug),
      type,
      source: "movies_tv" as EntitySource,
      title: m.title,
      slug,
      imageUrl: m.posterPath,
      cortexPath: `entities/${prefix}${slug}.md`,
      tags: [type, "video", ...(m.genres || []).map(c => c.toLowerCase())],
    };
  });
}

/** Extract EntityRefs from Photo Library cache */
function extractPhotoEntities(cached: unknown): EntityIndexEntry[] {
  const data = cached as { albums?: Array<{ name: string; path?: string; photoCount?: number }> };
  if (!data?.albums) return [];
  return data.albums.filter(a => a.name).map(a => {
    const slug = slugify(a.name);
    return {
      entityId: buildEntityId("photos", "album", slug),
      type: "album" as EntityType,
      source: "photos" as EntitySource,
      title: a.name,
      slug,
      cortexPath: `entities/photo-album-${slug}.md`,
      tags: ["photo-album", "photos"],
    };
  });
}

/** Extract EntityRefs from YouTube cache */
function extractYoutubeEntities(cached: unknown): EntityIndexEntry[] {
  const data = cached as { subscriptions?: Array<{ title: string; channelId?: string; thumbnailUrl?: string }> };
  if (!data?.subscriptions) return [];
  return data.subscriptions.filter(c => c.title).map(c => {
    const slug = slugify(c.title);
    return {
      entityId: buildEntityId("youtube", "channel", slug),
      type: "channel" as EntityType,
      source: "youtube" as EntitySource,
      title: c.title,
      slug,
      imageUrl: c.thumbnailUrl,
      cortexPath: `entities/${slug}.md`,
      tags: ["youtube", "channel", "subscription"],
    };
  });
}

/** Extract EntityRefs from QQ Music cache */
function extractQqMusicEntities(cached: unknown): EntityIndexEntry[] {
  const data = cached as { favorites?: Array<{ title: string; artist?: string }> };
  if (!data?.favorites) return [];
  // Group by artist
  const artistMap = new Map<string, { name: string; trackCount: number }>();
  for (const f of data.favorites) {
    if (f.artist && !artistMap.has(f.artist)) {
      artistMap.set(f.artist, { name: f.artist, trackCount: 0 });
    }
    if (f.artist) artistMap.get(f.artist)!.trackCount++;
  }
  return Array.from(artistMap.values()).map(a => {
    const slug = slugify(a.name);
    return {
      entityId: buildEntityId("qq_music", "artist", slug),
      type: "artist" as EntityType,
      source: "qq_music" as EntitySource,
      title: a.name,
      slug,
      cortexPath: `entities/artist-${slug}.md`,
      tags: ["music", "artist", "qq-music"],
    };
  });
}

/** Extract EntityRefs from Projects/Files cache */
function extractProjectEntities(cached: unknown): EntityIndexEntry[] {
  const data = cached as { projects?: Array<{ name: string; path?: string; type?: string; technologies?: string[] }> };
  if (!data?.projects) return [];
  return data.projects.filter(p => p.name).map(p => {
    const slug = slugify(p.name);
    return {
      entityId: buildEntityId("files", "project", slug),
      type: "project" as EntityType,
      source: "files" as EntitySource,
      title: p.name,
      slug,
      cortexPath: `entities/${slug}.md`,
      tags: ["project", ...(p.technologies || []).map(t => t.toLowerCase())],
    };
  });
}

/** Source → extractor mapping */
const EXTRACTORS: Record<string, (cached: unknown) => EntityIndexEntry[]> = {
  kindle: extractKindleEntities,
  weread: extractWereadEntities,
  steam: extractSteamEntities,
  movies_tv: extractMoviesTvEntities,
  photos: extractPhotoEntities,
  youtube: extractYoutubeEntities,
  qq_music: extractQqMusicEntities,
  files: extractProjectEntities,
};

/**
 * Build the complete entity index from all data source caches.
 * Also cross-references with Cortex _index.md to set cortexPath accurately.
 */
export async function buildEntityIndex(): Promise<number> {
  const startTime = Date.now();

  // Ensure we load the persisted index first so enrichment data is preserved
  if (!indexLoaded) loadEntityIndex();

  // Preserve enrichment data from existing entries before clearing
  const enrichmentData = new Map<string, {
    semanticTags?: string[];
    crossReferences?: Array<{ entityId: string; reason: string }>;
    recommendedVideos?: Array<{ videoId: string; title: string; channelTitle: string; thumbnailUrl: string; viewCount?: string; duration?: string }>;
  }>();
  // Preserve full entries for entities not backed by any data source cache
  // (e.g., places from research/discovery, manually added entities)
  const orphanEntries = new Map<string, EntityIndexEntry>();
  const extractorSources = new Set(Object.keys(EXTRACTORS));

  for (const [id, entry] of entityIndex) {
    if (entry.semanticTags?.length || entry.crossReferences?.length || (entry as any).recommendedVideos?.length) {
      enrichmentData.set(id, {
        semanticTags: entry.semanticTags,
        crossReferences: entry.crossReferences,
        recommendedVideos: (entry as any).recommendedVideos,
      });
    }
    if (!extractorSources.has(entry.source)) {
      orphanEntries.set(id, entry);
    }
  }

  entityIndex.clear();

  // 1. Extract entities from all data source caches
  for (const [source, extractor] of Object.entries(EXTRACTORS)) {
    try {
      const cached = readCache(source);
      if (!cached) continue;
      const entries = extractor(cached);
      for (const entry of entries) {
        // Restore enrichment data if previously enriched
        const enriched = enrichmentData.get(entry.entityId);
        if (enriched) {
          if (enriched.semanticTags) entry.semanticTags = enriched.semanticTags;
          if (enriched.crossReferences) entry.crossReferences = enriched.crossReferences;
          if (enriched.recommendedVideos) (entry as any).recommendedVideos = enriched.recommendedVideos;
        }
        entityIndex.set(entry.entityId, entry);
      }
    } catch (err) {
      logError("entity-index", `Failed to extract entities from ${source}`, err);
    }
  }

  // 1.5. Restore entities not backed by any data source cache
  for (const [id, entry] of orphanEntries) {
    if (!entityIndex.has(id)) {
      entityIndex.set(id, entry);
    }
  }

  // 2. Cross-reference with Cortex _index.md to verify cortexPath
  try {
    const indexPath = join(ENSO_HOME, "wiki", "_index.md");
    if (existsSync(indexPath)) {
      const indexContent = readFileSync(indexPath, "utf-8");
      const existingPages = new Set<string>();
      const pageMatches = indexContent.matchAll(/^## (.+\.md)$/gm);
      for (const m of pageMatches) existingPages.add(m[1]);

      // Verify cortexPath for each entity
      for (const entry of entityIndex.values()) {
        if (entry.cortexPath && !existingPages.has(entry.cortexPath)) {
          entry.cortexPath = undefined; // page doesn't exist yet
        }
      }

      // Also pick up Cortex pages that have EntityId metadata
      const entityIdMatches = indexContent.matchAll(/^## (.+\.md)\n[\s\S]*?EntityId:\s*(.+)$/gm);
      for (const m of entityIdMatches) {
        const path = m[1];
        const eid = m[2].trim();
        const existing = entityIndex.get(eid);
        if (existing) {
          existing.cortexPath = path;
        }
      }
    }
  } catch (err) {
    logError("entity-index", "Failed to cross-reference Cortex index", err);
  }

  // 2.5. Scan deep-content metadata for processed entities not in any cache
  try {
    const dcDir = join(ENSO_HOME, "data", "deep-content");
    if (existsSync(dcDir)) {
      const dcFiles = readdirSync(dcDir).filter(f => f.endsWith(".json"));
      for (const f of dcFiles) {
        try {
          const meta = JSON.parse(readFileSync(join(dcDir, f), "utf-8"));
          if (!meta.entityId || entityIndex.has(meta.entityId)) continue;
          const parts = meta.entityId.split(":");
          if (parts.length < 3) continue;
          const [src, typ, ...slugParts] = parts;
          const slug = slugParts.join(":");
          const typeDef = ENTITY_TYPES[typ];
          const cortexPath = typeDef?.cortexPrefix ? `${typeDef.cortexPrefix}${slug}.md` : undefined;
          entityIndex.set(meta.entityId, {
            entityId: meta.entityId,
            type: typ as EntityType,
            source: src as EntitySource,
            title: meta.title || slug,
            slug,
            cortexPath,
            tags: [typ, src, "deep-processed"],
            updatedAt: meta.processedAt || new Date().toISOString(),
          });
        } catch { /* skip individual files */ }
      }
    }
  } catch (err) {
    logError("entity-index", "Failed to scan deep-content for entities", err);
  }

  // 2.7. Scan Cortex wiki entity pages for orphaned "place" and other non-cache-backed types
  try {
    const entDir = join(ENSO_HOME, "wiki", "entities");
    if (existsSync(entDir)) {
      const pageFiles = readdirSync(entDir).filter(f => f.startsWith("place-") && f.endsWith(".md"));
      for (const f of pageFiles) {
        const slug = f.replace("place-", "").replace(".md", "");
        const candidateIds = [`research:place:${slug}`, `manual:place:${slug}`];
        const alreadyExists = candidateIds.some(id => entityIndex.has(id));
        if (alreadyExists) continue;

        try {
          const content = readFileSync(join(entDir, f), "utf-8");
          const titleMatch = content.match(/^# (.+)$/m);
          const title = titleMatch ? titleMatch[1] : slug;
          const entityId = `research:place:${slug}`;
          const cortexPath = `entities/${f}`;
          entityIndex.set(entityId, {
            entityId,
            type: "place" as EntityType,
            source: "research" as EntitySource,
            title,
            slug,
            cortexPath,
            tags: ["place", "research", "discovered"],
            updatedAt: new Date().toISOString(),
          });
        } catch { /* skip */ }
      }
    }
  } catch (err) {
    logError("entity-index", "Failed to scan wiki entities for places", err);
  }

  // 3. Persist
  indexLoaded = true;
  saveEntityIndex();

  const elapsed = Date.now() - startTime;
  logAction({
    ts: Date.now(),
    type: "system",
    category: "entity-index",
    message: `Built entity index: ${entityIndex.size} entities from ${Object.keys(EXTRACTORS).length} sources in ${elapsed}ms`,
  });

  return entityIndex.size;
}

// ─── Entity Resolution ───────────────────────────────────────────────────────

/** Cache-level item finder by source and slug */
function findInCache(source: string, type: string, slug: string): Record<string, unknown> | null {
  const cached = readCache(source);
  if (!cached || typeof cached !== "object") return null;
  const data = cached as Record<string, unknown>;

  // Each source has a different array key and match strategy
  const matchBySlug = (title: string) => slugify(title) === slug;

  if (source === "kindle" && Array.isArray(data.books)) {
    return (data.books as Array<Record<string, unknown>>).find(b => typeof b.title === "string" && matchBySlug(b.title)) ?? null;
  }
  if (source === "weread" && Array.isArray(data.books)) {
    return (data.books as Array<Record<string, unknown>>).find(b => typeof b.title === "string" && matchBySlug(b.title)) ?? null;
  }
  if (source === "steam" && Array.isArray(data.games)) {
    return (data.games as Array<Record<string, unknown>>).find(g => typeof g.name === "string" && matchBySlug(g.name)) ?? null;
  }
  if (source === "movies_tv" && Array.isArray(data.items)) {
    return (data.items as Array<Record<string, unknown>>).find(m => {
      if (typeof m.title !== "string") return false;
      const titleSlug = slugify(m.title + (m.year ? `-${m.year}` : ""));
      return titleSlug === slug;
    }) ?? null;
  }
  if (source === "photos" && Array.isArray(data.albums)) {
    return (data.albums as Array<Record<string, unknown>>).find(a => typeof a.name === "string" && matchBySlug(a.name)) ?? null;
  }
  if (source === "youtube" && Array.isArray(data.subscriptions)) {
    return (data.subscriptions as Array<Record<string, unknown>>).find(c => typeof c.title === "string" && matchBySlug(c.title)) ?? null;
  }
  if (source === "qq_music") {
    if (type === "artist" && Array.isArray(data.favorites)) {
      // Build artist from favorites
      const artistTracks = (data.favorites as Array<Record<string, unknown>>).filter(f => typeof f.artist === "string" && matchBySlug(f.artist));
      if (artistTracks.length > 0) {
        return { name: artistTracks[0].artist, trackCount: artistTracks.length, tracks: artistTracks.slice(0, 10).map(t => t.title) };
      }
    }
  }
  if (source === "twitter" && Array.isArray(data.accounts)) {
    return (data.accounts as Array<Record<string, unknown>>).find(a => {
      const handle = typeof a.handle === "string" ? a.handle : typeof a.displayName === "string" ? a.displayName : "";
      return matchBySlug(handle);
    }) ?? null;
  }
  if (source === "files" && Array.isArray(data.projects)) {
    return (data.projects as Array<Record<string, unknown>>).find(p => typeof p.name === "string" && matchBySlug(p.name)) ?? null;
  }
  return null;
}

/** Read Cortex wiki page content */
function readCortexPage(cortexPath: string): { content: string; backlinks: string[] } | null {
  const fullPath = join(ENSO_HOME, "wiki", cortexPath);
  try {
    if (!existsSync(fullPath)) return null;
    const content = readFileSync(fullPath, "utf-8");

    // Find backlinks from _index.md
    const indexPath = join(ENSO_HOME, "wiki", "_index.md");
    const backlinks: string[] = [];
    if (existsSync(indexPath)) {
      const idx = readFileSync(indexPath, "utf-8");
      const pageName = cortexPath.replace(/.*\//, "").replace(/\.md$/, "");
      const linkPattern = new RegExp(`\\[\\[${pageName}\\]\\]`, "gi");
      const blocks = idx.split(/\n(?=## )/);
      for (const block of blocks) {
        if (linkPattern.test(block)) {
          const pathMatch = block.match(/^## (.+\.md)$/m);
          if (pathMatch && pathMatch[1] !== cortexPath) backlinks.push(pathMatch[1]);
        }
      }
    }
    return { content, backlinks };
  } catch {
    return null;
  }
}

/**
 * Resolve a full Entity from its ID by merging index, cache, and Cortex data.
 */
export async function resolveEntity(entityId: EntityId): Promise<Entity | null> {
  const parsed = parseEntityId(entityId);
  if (!parsed) return null;

  // 1. Index lookup
  const indexEntry = lookupEntity(entityId);

  // 2. Cache enrichment
  const cacheItem = findInCache(parsed.source, parsed.type, parsed.slug);

  // 3. Cortex enrichment
  const cortexPath = indexEntry?.cortexPath ?? entityCortexPath(entityId);
  const cortexData = cortexPath ? readCortexPage(cortexPath) : null;

  // If nothing found anywhere, return null
  if (!indexEntry && !cacheItem) return null;

  // 4. Merge into full Entity
  // Use cache item for metadata, falling back to index entry's metadata (for types like place that have no cache)
  const effectiveMetadata = cacheItem ?? (indexEntry?.metadata as Record<string, unknown> | undefined) ?? {};
  const entity: Entity = {
    entityId,
    type: parsed.type as EntityType,
    source: parsed.source as EntitySource,
    title: indexEntry?.title ?? (cacheItem?.title || cacheItem?.name || parsed.slug) as string,
    slug: parsed.slug,
    imageUrl: indexEntry?.imageUrl ?? (cacheItem?.coverUrl || cacheItem?.posterPath || cacheItem?.thumbnailUrl) as string | undefined,
    summary: (effectiveMetadata.description || cacheItem?.overview || cacheItem?.bio) as string | undefined,
    tags: indexEntry?.tags ?? [],
    themes: [],
    cortexPath: cortexData ? cortexPath : indexEntry?.cortexPath,
    metadata: effectiveMetadata,
    externalUrl: (cacheItem?.readerUrl || cacheItem?.storeUrl || cacheItem?.externalUrl) as string | undefined,
    updatedAt: indexEntry?.updatedAt ?? new Date().toISOString(),
  };

  return entity;
}

/**
 * Build the data payload for an entity detail card.
 * Includes: entity metadata, Cortex wiki content, related entities.
 */
/**
 * Resolve how to open/view the real content for an entity.
 * Returns a unified content access descriptor with:
 *  - primaryAction: what the main "Open" button does
 *  - mediaUrl: for local files that can be streamed via /media/
 *  - embedUrl: for content that can be embedded (YouTube, etc.)
 *  - externalUrl: for content that opens in a new browser tab
 *  - launchUrl: for protocol handlers (steam://, kindle://)
 */
/**
 * Encode a WeRead numeric bookId into the URL slug used by weread.qq.com.
 * Algorithm reverse-engineered from WeRead's frontend JS.
 */
export function encodeWereadBookId(bookId: string): string {
  const md5 = createHash("md5").update(bookId).digest("hex");
  let result = md5.slice(0, 3);

  if (/^\d+$/.test(bookId)) {
    result += "3";
    result += "2" + md5.slice(-2);
    const chunks: string[] = [];
    for (let i = 0; i < bookId.length; i += 9) {
      chunks.push(parseInt(bookId.slice(i, Math.min(i + 9, bookId.length)), 10).toString(16));
    }
    for (let j = 0; j < chunks.length; j++) {
      let n = chunks[j].length.toString(16);
      if (n.length === 1) n = "0" + n;
      result += n + chunks[j];
      if (j < chunks.length - 1) result += "g";
    }
  } else {
    result += "4";
    result += "2" + md5.slice(-2);
    let hex = "";
    for (let i = 0; i < bookId.length; i++) hex += bookId.charCodeAt(i).toString(16);
    let n = hex.length.toString(16);
    if (n.length === 1) n = "0" + n;
    result += n + hex;
  }

  if (result.length < 20) result += md5.slice(0, 20 - result.length);
  result += createHash("md5").update(result).digest("hex").slice(0, 3);
  return result;
}

function resolveContentAccess(entity: Entity): Record<string, unknown> {
  const m = entity.metadata;
  const type = entity.type;
  const source = entity.source;

  const result: Record<string, unknown> = { type };

  // ── Books ──
  if (type === "book") {
    if (source === "kindle" && m.readerUrl) {
      result.primaryAction = "open_web";
      result.externalUrl = String(m.readerUrl);
      result.label = "Read on Kindle";
      result.icon = "📖";
    } else if (source === "weread" && m.wereadBookId) {
      result.primaryAction = "open_web";
      result.externalUrl = `https://weread.qq.com/web/bookDetail/${encodeWereadBookId(String(m.wereadBookId))}`;
      result.label = "Read on WeRead";
      result.icon = "📖";
    } else if (m.isbn) {
      result.primaryAction = "open_web";
      result.externalUrl = `https://www.google.com/search?q=${encodeURIComponent(entity.title + " " + (m.author || ""))}+book`;
      result.label = "Search Online";
      result.icon = "🔍";
    }
  }

  // ── Movies / TV ──
  if (type === "movie" || type === "tv-series" || type === "documentary") {
    if (m.filePath) {
      const fp = String(m.filePath);
      const encodedPath = Buffer.from(fp, "utf-8").toString("base64url");
      const ext = fp.match(/\.\w+$/)?.[0]?.toLowerCase() || "";
      result.primaryAction = "stream_media";
      result.mediaUrl = `/media/${encodedPath}${ext ? `?ext=${ext}` : ""}`;
      result.mediaType = "video";
      result.label = "Play";
      result.icon = "▶️";
      result.filePath = fp;
    }
    if (m.imdbId) {
      result.externalUrl = `https://www.imdb.com/title/${m.imdbId}`;
      result.externalLabel = "IMDB";
    } else {
      result.externalUrl = `https://www.google.com/search?q=${encodeURIComponent(entity.title)}+watch+online`;
      result.externalLabel = "Find Online";
    }
  }

  // ── Games ──
  if (type === "game") {
    if (m.appId) {
      result.primaryAction = "launch_protocol";
      result.launchUrl = `steam://run/${m.appId}`;
      result.label = "Launch in Steam";
      result.icon = "🎮";
      result.externalUrl = `https://store.steampowered.com/app/${m.appId}`;
      result.externalLabel = "Steam Store";
    }
  }

  // ── YouTube ──
  if (type === "channel") {
    if (m.channelId) {
      result.primaryAction = "open_web";
      result.externalUrl = `https://www.youtube.com/channel/${m.channelId}`;
      result.label = "Open Channel";
      result.icon = "📺";
    } else {
      result.primaryAction = "open_web";
      result.externalUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(entity.title)}`;
      result.label = "Find on YouTube";
      result.icon = "🔍";
    }
  }
  if (type === "video") {
    if (m.videoId) {
      result.primaryAction = "embed";
      result.embedUrl = `https://www.youtube.com/embed/${m.videoId}`;
      result.embedType = "iframe";
      result.externalUrl = `https://www.youtube.com/watch?v=${m.videoId}`;
      result.label = "Watch";
      result.icon = "▶️";
    }
  }

  // ── Articles ──
  if (type === "article") {
    if (m.url || entity.externalUrl) {
      result.primaryAction = "open_web";
      result.externalUrl = String(m.url || entity.externalUrl);
      result.label = "Read Article";
      result.icon = "📰";
    }
  }

  // ── Places ──
  if (type === "place") {
    result.primaryAction = "open_web";
    result.externalUrl = m.url
      ? String(m.url)
      : `https://www.google.com/maps/search/${encodeURIComponent(entity.title)}`;
    result.label = "View on Map";
    result.icon = "🗺️";
  }

  // ── Music ──
  if (type === "song" || type === "artist") {
    if (m.filePath) {
      const fp2 = String(m.filePath);
      result.primaryAction = "stream_media";
      result.mediaUrl = `/media/${Buffer.from(fp2, "utf-8").toString("base64url")}${fp2.match(/\.\w+$/)?.[0] ? `?ext=${fp2.match(/\.\w+$/)?.[0].toLowerCase()}` : ""}`;
      result.mediaType = "audio";
      result.label = "Play";
      result.icon = "🎵";
    }
  }

  // ── Photos ──
  if (type === "photo" || type === "album") {
    if (m.filePath) {
      const fp3 = String(m.filePath);
      result.primaryAction = "stream_media";
      result.mediaUrl = `/media/${Buffer.from(fp3, "utf-8").toString("base64url")}${fp3.match(/\.\w+$/)?.[0] ? `?ext=${fp3.match(/\.\w+$/)?.[0].toLowerCase()}` : ""}`;
      result.mediaType = "image";
      result.label = "View";
      result.icon = "🖼️";
    }
  }

  // Default fallback
  if (!result.primaryAction && entity.externalUrl) {
    result.primaryAction = "open_web";
    result.externalUrl = entity.externalUrl;
    result.label = "Open";
    result.icon = "🔗";
  }

  return result;
}

export async function buildEntityDetailData(entityId: EntityId): Promise<Record<string, unknown> | null> {
  const entity = await resolveEntity(entityId);
  if (!entity) return null;

  const parsed = parseEntityId(entityId);
  const typeDef = parsed ? ENTITY_TYPES[parsed.type] : undefined;

  // Read Cortex content
  let cortexContent: string | undefined;
  let backlinks: string[] = [];
  if (entity.cortexPath) {
    const page = readCortexPage(entity.cortexPath);
    if (page) {
      cortexContent = page.content;
      backlinks = page.backlinks;
    }
  }

  // Find related entities — 3-tier: cross-references > semantic tags > tag overlap
  const relatedEntities: Array<EntityRef & { reason?: string }> = [];
  const relatedReasons: Record<string, string> = {};
  const seenIds = new Set<string>();

  // Source-identifier tags to exclude from overlap computation
  const SOURCE_TAGS = new Set(["kindle", "weread", "steam", "youtube", "movies_tv", "photos", "qq_music", "twitter", "project", "qq-music", "social-media"]);

  // Tier 1: Pre-computed cross-references (from LLM enrichment)
  const indexEntry = entityIndex.get(entityId);
  if (indexEntry?.crossReferences?.length) {
    for (const xref of indexEntry.crossReferences) {
      if (seenIds.has(xref.entityId)) continue;
      const target = entityIndex.get(xref.entityId);
      if (!target) continue;
      seenIds.add(xref.entityId);
      relatedEntities.push({
        entityId: target.entityId, type: target.type, source: target.source,
        title: target.title, slug: target.slug, imageUrl: target.imageUrl,
        reason: xref.reason,
      });
      relatedReasons[target.entityId] = xref.reason;
    }
  }

  // Tier 2+3: Semantic tag + regular tag overlap (combined, scored)
  if (relatedEntities.length < 10) {
    const entitySemanticTags = new Set(indexEntry?.semanticTags || []);
    const entityContentTags = new Set((entity.tags || []).filter(t => !SOURCE_TAGS.has(t)));

    const candidates: Array<{ entry: EntityIndexEntry; score: number; crossSource: boolean }> = [];
    for (const entry of entityIndex.values()) {
      if (entry.entityId === entityId || seenIds.has(entry.entityId)) continue;

      const entryContentTags = (entry.tags || []).filter(t => !SOURCE_TAGS.has(t));
      const entrySemanticTags = entry.semanticTags || [];

      // Semantic tag overlap (Tier 2) — worth more
      let semanticOverlap = 0;
      for (const st of entrySemanticTags) {
        if (entitySemanticTags.has(st)) semanticOverlap++;
      }

      // Regular tag overlap (Tier 3) — exclude source tags
      let tagOverlap = 0;
      for (const t of entryContentTags) {
        if (entityContentTags.has(t)) tagOverlap++;
      }

      const crossSource = entry.source !== entity.source;
      // Score: semantic tags worth 3x, regular tags worth 1x, cross-source bonus +0.5
      const score = semanticOverlap * 3 + tagOverlap + (crossSource ? 0.5 : 0);

      // Threshold: ≥1 content/semantic tag overlap required
      if (semanticOverlap >= 1 || tagOverlap >= 1) {
        candidates.push({ entry, score, crossSource });
      }
    }

    // Sort: highest score first, prefer cross-source diversity
    candidates.sort((a, b) => b.score - a.score);

    const remaining = 10 - relatedEntities.length;
    for (const c of candidates.slice(0, remaining)) {
      seenIds.add(c.entry.entityId);
      relatedEntities.push({
        entityId: c.entry.entityId, type: c.entry.type, source: c.entry.source,
        title: c.entry.title, slug: c.entry.slug, imageUrl: c.entry.imageUrl,
      });
    }
  }

  // Build detail fields from metadata
  const detailFields: Array<{ key: string; label: string; value: unknown }> = [];
  if (typeDef) {
    for (const key of typeDef.detailFields) {
      const value = entity.metadata[key];
      if (value !== undefined && value !== null && value !== "") {
        detailFields.push({
          key,
          label: key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()),
          value,
        });
      }
    }
  }

  // Resolve content access — how to open/view the real content
  const contentAccess = resolveContentAccess(entity);

  return {
    tool: `entity_detail`,
    focusEntity: entityId,
    entity: {
      entityId: entity.entityId,
      type: entity.type,
      source: entity.source,
      title: entity.title,
      slug: entity.slug,
      imageUrl: entity.imageUrl,
      summary: entity.summary,
      cortexPath: entity.cortexPath,
      externalUrl: entity.externalUrl,
    },
    contentAccess,
    detailFields,
    cortexContent,
    backlinks,
    metadata: entity.metadata,
    relatedEntities,
    relatedReasons,
    recommendedVideos: indexEntry?.recommendedVideos ?? [],
    childEntities: entity.children ?? [],
    navigationDepth: 1,
  };
}
