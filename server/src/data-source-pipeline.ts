/**
 * Data Source Pipeline — Post-scan auto-ingest connector.
 *
 * After a scan completes, this pipeline:
 * 1. Computes cache file hashes to detect changes
 * 2. Triggers Cortex wiki ingestion only for CHANGED data sources
 * 3. Rate-limits LLM calls to avoid excessive cost
 *
 * Called automatically at the end of buildUserContextProfile().
 */

import { DATA_SOURCES, readIngestHashes, writeIngestHashes, computeCacheHash, readCache, getDataSource } from "./data-source-registry.js";
import { logAction, logError } from "./action-log.js";

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
  wikiPagesCreated: number;
  wikiPagesUpdated: number;
}

/**
 * Run the post-scan pipeline: detect changed data sources, auto-ingest to Cortex.
 *
 * @param scannedSources - IDs of sources that were just scanned (or "all" to check everything)
 * @param options.forceIngest - Skip change detection, ingest regardless
 * @param options.skipWikiIngest - Only detect changes, don't actually ingest
 */
export async function runPostScanPipeline(
  scannedSources: string[],
  options?: { forceIngest?: boolean; skipWikiIngest?: boolean },
): Promise<PipelineResult> {
  const result: PipelineResult = { changedSources: [], ingestedSources: [], wikiPagesCreated: 0, wikiPagesUpdated: 0 };

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
  if (options?.skipWikiIngest) {
    result.skippedReason = "skipWikiIngest option set";
    return result;
  }

  if (isRateLimited()) {
    result.skippedReason = `Rate limited — ${MAX_INGESTS_PER_HOUR} ingests in the last hour`;
    logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Skipping wiki ingest: ${result.skippedReason}` });
    return result;
  }

  // Step 3: Ingest changed sources to Cortex wiki
  try {
    const { runIngestPipeline } = await import("./wiki-tools.js");

    // Sort by priority
    const changedDescriptors = result.changedSources
      .map((id) => getDataSource(id))
      .filter((ds): ds is NonNullable<typeof ds> => !!ds)
      .sort((a, b) => (a.ingestPriority ?? 50) - (b.ingestPriority ?? 50));

    for (const ds of changedDescriptors) {
      const cached = readCache(ds.cacheFile);
      if (!cached) continue;

      const formatted = ds.formatForWiki(cached);
      if (!formatted) continue;

      try {
        const ingestResult = await runIngestPipeline({
          text: formatted.text,
          topic: formatted.topic,
          sourceLabel: formatted.label,
        });

        result.ingestedSources.push(ds.id);
        result.wikiPagesCreated += ingestResult.pagesCreated.length;
        result.wikiPagesUpdated += ingestResult.pagesUpdated.length;
        recordIngest();

        logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Auto-ingested ${ds.id}: ${ingestResult.pagesCreated.length} created, ${ingestResult.pagesUpdated.length} updated` });

        // Update hash for this source
        const newHash = computeCacheHash(ds.cacheFile);
        if (newHash) {
          hashes[ds.cacheFile] = { hash: newHash, ingestedAt: Date.now() };
          writeIngestHashes(hashes);
        }
      } catch (err) {
        logError("data-pipeline", `Auto-ingest failed for ${ds.id}`, err);
      }
    }
  } catch (err) {
    logError("data-pipeline", "Wiki import module load failed", err);
    result.skippedReason = "Wiki module unavailable";
  }

  logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Pipeline complete: ${result.ingestedSources.length} ingested, ${result.wikiPagesCreated} pages created, ${result.wikiPagesUpdated} updated` });

  return result;
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
