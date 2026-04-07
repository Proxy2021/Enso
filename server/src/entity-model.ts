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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
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
  | "person" | "twitter-account"
  | "concept" | "source" | "synthesis";

/** Data source identifiers */
export type EntitySource =
  | "kindle" | "steam" | "movies_tv" | "photos" | "qq_music"
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
    sources: ["kindle"],
    cortexPrefix: "entities/",
    detailFields: ["author", "rating", "reviewCount", "pageCount", "publisher", "publicationDate", "categories", "description"],
  },
  "game": {
    sources: ["steam"],
    cortexPrefix: "entities/game-",
    detailFields: ["genres", "developer", "metacritic", "releaseDate", "sizeOnDisk", "lastPlayed", "description"],
  },
  "movie": {
    sources: ["movies_tv"],
    cortexPrefix: "entities/movie-",
    detailFields: ["director", "cast", "rating", "voteCount", "runtime", "genres", "year", "overview"],
  },
  "tv-series": {
    sources: ["movies_tv"],
    cortexPrefix: "entities/tv-",
    detailFields: ["seasons", "cast", "rating", "genres", "year", "overview"],
  },
  "documentary": {
    sources: ["movies_tv"],
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
    sources: ["youtube"],
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
  entityIndex.clear();

  // 1. Extract entities from all data source caches
  for (const [source, extractor] of Object.entries(EXTRACTORS)) {
    try {
      const cached = readCache(source);
      if (!cached) continue;
      const entries = extractor(cached);
      for (const entry of entries) {
        entityIndex.set(entry.entityId, entry);
      }
    } catch (err) {
      logError("entity-index", `Failed to extract entities from ${source}`, err);
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
