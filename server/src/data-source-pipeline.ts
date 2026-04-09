/**
 * Data Source Pipeline — Post-scan auto-ingest connector.
 *
 * After a scan completes, this pipeline:
 * 1. Computes cache file hashes to detect changes
 * 2. Triggers Cortex ingestion only for CHANGED data sources
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

  // Step 3: Ingest changed sources to Cortex via ingestChangedSources()
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

  // Step 4: Direct ingest — create per-item cortex pages (no LLM cost)
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

  // Step 5: Cortex enrichment — LLM semantic tagging + cross-source references
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
    } catch (err) {
      logError("data-pipeline", "Cortex enrichment failed (non-fatal)", err);
    }
  }

  logAction({ ts: Date.now(), type: "action", category: "data-pipeline", message: `Pipeline complete: ${result.ingestedSources.length} ingested, ${result.cortexPagesCreated} pages created, ${result.cortexPagesUpdated} pages updated` });

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
