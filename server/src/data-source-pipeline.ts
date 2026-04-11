/**
 * Data Source Pipeline — Post-scan auto-ingest connector.
 *
 * After a scan completes, this pipeline:
 * 1. Computes cache file hashes to detect changes
 * 2. Rate-limits LLM calls to avoid excessive cost
 * 3. Platform API enrichment (free — Amazon, WeRead, TMDB, Steam Store)
 * 4. Cortex LLM ingestion for changed sources
 * 5. Direct ingest — per-item wiki pages (no LLM cost)
 * 6. Cortex enrichment — semantic tags + cross-source references
 *
 * Called automatically at the end of buildUserContextProfile().
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { DATA_SOURCES, readIngestHashes, writeIngestHashes, computeCacheHash, readCache, getDataSource } from "./data-source-registry.js";
import { logAction, logError } from "./action-log.js";

const CACHE_DIR = join(homedir(), ".enso", "data", "user-context", "cache");

// ── Rate Limiter ──

const _ingestTimestamps: number[] = [];
const MAX_INGESTS_PER_HOUR = 20;

function isRateLimited(): boolean {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  // Prune old entries
  while (_ingestTimestamps.length > 0 && _ingestTimestamps[0] < oneHourAgo) {
    _ingestTimestamps.shift();
  }
  return _ingestTimestamps.length >= MAX_INGESTS_PER_HOUR;
}

function recordIngest(): void {
  _ingestTimestamps.push(Date.now());
}

// ── Pipeline ──

export interface PipelineResult {
  changedSources: string[];
  ingestedSources: string[];
  skippedReason?: string;
  cortexPagesCreated: number;
  cortexPagesUpdated: number;
}

/**
 * Run the post-scan pipeline: detect changed data sources, auto-ingest to Cortex.
 *
 * @param scannedSources - IDs of sources that were just scanned (or "all" to check everything)
 * @param options.forceIngest - Skip change detection, ingest regardless
 * @param options.skipCortexIngest - Only detect changes, don't actually ingest
 */
export async function runPostScanPipeline(
  scannedSources: string[],
  options?: { forceIngest?: boolean; skipCortexIngest?: boolean },
): Promise<PipelineResult> {
  const result: PipelineResult = { changedSources: [], ingestedSources: [], cortexPagesCreated: 0, cortexPagesUpdated: 0 };

  // Step 1: Detect changes via hash comparison
  const hashes = readIngestHashes();
  const sourcesToCheck = scannedSources.includes("all")
    ? DATA_SOURCES.map((ds) => ds.id)
    : scannedSources;

  for (const sourceId of sourcesToCheck) {
    const ds = getDataSource(sourceId);
    if (!ds) continue;

    const newHash = computeCacheHash(ds.cacheFile);
    if (!newHash) continue; // No cache file

    const prevEntry = hashes[ds.cacheFile];
    if (options?.forceIngest || !prevEntry || prevEntry.hash !== newHash) {
      result.changedSources.push(sourceId);
    }
  }

  if (result.changedSources.length === 0) {
    logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: "Post-scan pipeline: no data changes detected" });
    return result;
  }

  logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Post-scan pipeline: ${result.changedSources.length} source(s) changed: ${result.changedSources.join(", ")}` });

  // Step 2: Check rate limit
  if (options?.skipCortexIngest) {
    result.skippedReason = "skipCortexIngest option set";
    return result;
  }

  if (isRateLimited()) {
    result.skippedReason = `Rate limited — ${MAX_INGESTS_PER_HOUR} ingests in the last hour`;
    logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Skipping cortex ingest: ${result.skippedReason}` });
    return result;
  }

  // Step 3: Platform API enrichment (free — Amazon, WeRead, TMDB, Steam Store)
  // Enriches cached items with metadata from external APIs before Cortex ingestion
  for (const sourceId of result.changedSources) {
    try {
      const count = await platformApiEnrich(sourceId);
      if (count > 0) {
        logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Platform API enrichment for ${sourceId}: ${count} items enriched` });
      }
    } catch (err) {
      logError("data-pipeline", `Platform API enrichment failed for ${sourceId}`, err);
    }
  }

  // Step 4: Ingest changed sources to Cortex via ingestChangedSources()
  try {
    const { ingestChangedSources } = await import("./cortex-tools.js");

    const ingestResult = await ingestChangedSources(result.changedSources);
    result.ingestedSources = [...result.changedSources];
    result.cortexPagesCreated = ingestResult.pagesCreated.length;
    result.cortexPagesUpdated = ingestResult.pagesUpdated.length;
    recordIngest();

    logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Auto-ingested ${result.changedSources.length} source(s): ${ingestResult.pagesCreated.length} created, ${ingestResult.pagesUpdated.length} updated` });

    // Update hashes for all ingested sources
    for (const sourceId of result.changedSources) {
      const ds = getDataSource(sourceId);
      if (!ds) continue;
      const newHash = computeCacheHash(ds.cacheFile);
      if (newHash) {
        hashes[ds.cacheFile] = { hash: newHash, ingestedAt: Date.now() };
      }
    }
    writeIngestHashes(hashes);
  } catch (err) {
    logError("data-pipeline", "Auto-ingest failed", err);
    result.skippedReason = `Ingest error: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Step 5: Direct ingest — create per-item cortex pages (no LLM cost)
  let createdEntityIds: string[] = [];
  try {
    const { directIngestFromSources } = await import("./cortex-direct-ingest.js");
    const directResult = await directIngestFromSources({ sourceIds: result.changedSources });
    result.cortexPagesCreated += directResult.created;
    result.cortexPagesUpdated += directResult.updated;
    createdEntityIds = directResult.createdEntityIds || [];
    if (directResult.created > 0 || directResult.updated > 0) {
      logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Direct ingest: ${directResult.created} pages created, ${directResult.updated} updated` });
    }
  } catch (err) {
    logError("data-pipeline", "Direct ingest failed", err);
  }

  // Step 6: Cortex enrichment — LLM semantic tagging + cross-source references
  if (createdEntityIds.length > 0) {
    try {
      const { enrichNewEntities, crossReferenceNewEntities } = await import("./cortex-enrichment.js");

      // Level 2: Semantic tagging (Gemini Flash — cheap)
      const tagResult = await enrichNewEntities(createdEntityIds);
      if (tagResult.enriched > 0) {
        logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Semantic enrichment: ${tagResult.enriched} entities tagged` });
      }

      // Level 3: Cross-source references (Gemini Flash — semantic connections)
      const xrefResult = await crossReferenceNewEntities(createdEntityIds);
      if (xrefResult.refsCreated > 0) {
        logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Cross-references: ${xrefResult.refsCreated} relationships discovered` });
      }

      // Level 4: YouTube video recommendations (no LLM — direct title search)
      const { recommendVideosForEntities } = await import("./cortex-enrichment.js");
      const videoResult = await recommendVideosForEntities(createdEntityIds);
      if (videoResult.matched > 0) {
        logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Video recommendations: ${videoResult.matched} entities matched` });
      }
    } catch (err) {
      logError("data-pipeline", "Cortex enrichment failed (non-fatal)", err);
    }
  }

  logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Pipeline complete: ${result.ingestedSources.length} ingested, ${result.cortexPagesCreated} pages created, ${result.cortexPagesUpdated} pages updated` });

  return result;
}

// ── Platform API Enrichment ──────────────────────────────────────────────────

function getApiKey(name: string): string {
  try {
    const keysPath = join(homedir(), ".enso", "api-keys.json");
    if (existsSync(keysPath)) {
      const keys = JSON.parse(readFileSync(keysPath, "utf-8"));
      return keys[name] || "";
    }
  } catch { /* ignore */ }
  return process.env[`${name.toUpperCase()}_API_KEY`] ?? "";
}

/**
 * Enrich cached items with metadata from platform APIs (free, no LLM cost).
 * Each source that has an external API gets its unenriched items filled in.
 */
async function platformApiEnrich(sourceId: string): Promise<number> {
  switch (sourceId) {
    case "kindleLibrary": {
      const { enrichKindleMetadata } = await import("./user-context-tools.js");
      const r = await enrichKindleMetadata();
      return r.enriched;
    }
    case "wereadLibrary": {
      const { enrichWeReadMetadata } = await import("./user-context-tools.js");
      const r = await enrichWeReadMetadata();
      return r.enriched;
    }
    case "moviesTv":
      return enrichMoviesTv();
    case "steam":
      return enrichSteamGames();
    default:
      return 0;
  }
}

async function enrichMoviesTv(): Promise<number> {
  const tmdbKey = getApiKey("tmdb");
  if (!tmdbKey) return 0;

  const cachePath = join(CACHE_DIR, "movies-tv.json");
  let cached: { items: Array<Record<string, unknown>> } | null = null;
  try { cached = JSON.parse(readFileSync(cachePath, "utf-8")); } catch { return 0; }
  if (!cached?.items) return 0;

  const unenriched = cached.items.filter(m => !m.enrichedAt);
  if (unenriched.length === 0) return 0;

  logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Enriching ${unenriched.length} movies/TV from TMDB...` });

  let enriched = 0;
  for (const item of unenriched) {
    try {
      const searchType = item.category === "tv" ? "tv" : "movie";
      let url = `https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(String(item.title))}`;
      if (item.year) url += `&year=${item.year}`;

      const resp = await fetch(url);
      const data = await resp.json() as { results?: Array<Record<string, unknown>> };

      if (data.results && data.results.length > 0) {
        const match = data.results[0];
        item.tmdbId = match.id;
        item.overview = match.overview || "";
        item.rating = match.vote_average || null;
        item.voteCount = match.vote_count || 0;
        item.posterPath = match.poster_path ? `https://image.tmdb.org/t/p/w342${match.poster_path}` : null;
        item.backdropPath = match.backdrop_path ? `https://image.tmdb.org/t/p/w780${match.backdrop_path}` : null;
        item.genreIds = match.genre_ids || [];
        item.originalLanguage = match.original_language || null;
        item.releaseDate = (match.release_date || match.first_air_date || null) as string | null;

        // Full details for genres, cast, runtime
        try {
          const detailResp = await fetch(`https://api.themoviedb.org/3/${searchType}/${match.id}?api_key=${tmdbKey}&append_to_response=credits`);
          const detail = await detailResp.json() as Record<string, unknown>;
          item.genres = ((detail.genres as Array<{ name: string }>) || []).map(g => g.name);
          item.runtime = detail.runtime || ((detail.episode_run_time as number[])?.at(0)) || null;
          item.imdbId = detail.imdb_id || null;
          item.tagline = detail.tagline || null;
          item.status = detail.status || null;
          item.numberOfSeasons = detail.number_of_seasons || null;

          const credits = detail.credits as { cast?: Array<{ name: string }>; crew?: Array<{ name: string; job: string }> } | undefined;
          if (credits) {
            item.cast = (credits.cast || []).slice(0, 8).map(c => c.name);
            item.directors = (credits.crew || []).filter(c => c.job === "Director").map(c => c.name);
          }
        } catch { /* detail fetch optional */ }

        item.enrichedAt = Date.now();
        enriched++;
      }
    } catch { /* skip failed items */ }

    if (enriched % 10 === 0 && enriched > 0) {
      writeFileSync(cachePath, JSON.stringify(cached, null, 2));
    }

    await new Promise(r => setTimeout(r, 250));
  }

  writeFileSync(cachePath, JSON.stringify(cached, null, 2));
  return enriched;
}

async function enrichSteamGames(): Promise<number> {
  const cachePath = join(CACHE_DIR, "steam-games.json");
  let cached: { games: Array<Record<string, unknown>> } | null = null;
  try { cached = JSON.parse(readFileSync(cachePath, "utf-8")); } catch { return 0; }
  if (!cached?.games) return 0;

  const unenriched = cached.games.filter(g => !g.enrichedAt);
  if (unenriched.length === 0) return 0;

  logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Enriching ${unenriched.length} Steam games...` });

  let enriched = 0;
  for (const game of unenriched) {
    try {
      const resp = await fetch(`https://store.steampowered.com/api/appdetails?appids=${game.appId}`);
      const data = await resp.json() as Record<string, { success: boolean; data: Record<string, unknown> }>;
      const detail = data[String(game.appId)];
      if (detail?.success && detail.data) {
        const d = detail.data;
        game.description = (d.short_description as string) || "";
        game.headerImage = (d.header_image as string) || "";
        game.genres = ((d.genres as Array<{ description: string }>) || []).map(g => g.description);
        game.categories = ((d.categories as Array<{ description: string }>) || []).map(c => c.description);
        game.metacritic = (d.metacritic as { score: number })?.score ?? null;
        game.releaseDate = (d.release_date as { date: string })?.date ?? null;
        game.developers = (d.developers as string[]) || [];
        game.publishers = (d.publishers as string[]) || [];
        game.platforms = d.platforms || {};
        game.screenshots = ((d.screenshots as Array<{ path_thumbnail: string }>) || []).slice(0, 3).map(s => s.path_thumbnail);
        game.enrichedAt = Date.now();
        enriched++;
      }
    } catch { /* skip */ }

    if (enriched % 5 === 0 && enriched > 0) {
      writeFileSync(cachePath, JSON.stringify(cached, null, 2));
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  writeFileSync(cachePath, JSON.stringify(cached, null, 2));
  return enriched;
}

/**
 * Get sources that have been scanned but never ingested into the Cortex.
 * Used by the proactive engine to suggest importing.
 */
export function getUningestedSources(): string[] {
  const hashes = readIngestHashes();
  const result: string[] = [];
  for (const ds of DATA_SOURCES) {
    const cacheHash = computeCacheHash(ds.cacheFile);
    if (cacheHash && !hashes[ds.cacheFile]) {
      result.push(ds.id); // Scanned (cache exists) but never ingested
    }
  }
  return result;
}

/**
 * Get sources whose cache data has changed since last Cortex ingest.
 */
export function getStaleIngestSources(): string[] {
  const hashes = readIngestHashes();
  const result: string[] = [];
  for (const ds of DATA_SOURCES) {
    const cacheHash = computeCacheHash(ds.cacheFile);
    const entry = hashes[ds.cacheFile];
    if (cacheHash && entry && entry.hash !== cacheHash) {
      result.push(ds.id); // Cache changed since last ingest
    }
  }
  return result;
}
