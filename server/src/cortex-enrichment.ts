/**
 * Cortex Enrichment — LLM-powered semantic tagging and cross-reference discovery.
 *
 * Three phases at ingest time + periodic re-enrichment:
 *   1. enrichNewEntities() — Adds universal semantic tags (Gemini Flash, ~$0.002/batch)
 *   2. crossReferenceNewEntities() — Discovers cross-source relationships (Gemini, ~$0.01/batch)
 *   3. recommendVideosForEntities() — YouTube video search (zero LLM)
 *   4. reEnrichStaleEntities() — Periodic re-enrichment of under-connected entities
 *
 * Cross-reference discovery uses SEMANTIC-AWARE sampling: entities sharing tags with
 * the new batch are prioritized, then diverse sampling fills remaining slots.
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { llm } from "./llm.js";
import {
  getEntityIndex, lookupEntity, upsertEntityIndex, saveEntityIndex,
  type EntityId, type EntityIndexEntry,
} from "./entity-model.js";
import { logAction, logError } from "./action-log.js";
import { cortexError } from "./errors.js";
import { suppressCategory } from "./error-rate-monitor.js";
import { cleanJson } from "./json-utils.js";

// ── Constants ──

/** Max entities per LLM call to stay within output token limits */
const SEMANTIC_TAG_BATCH_SIZE = 30;
const CROSS_REF_BATCH_SIZE = 15;
/** Max entities in the LLM inventory for cross-reference discovery */
const INVENTORY_MAX_ENTRIES = 500;

// ── Level 2: Semantic Tagging ──

/**
 * Add LLM-derived universal semantic tags to newly ingested entities.
 * Tags transcend source boundaries (e.g., "coming-of-age", "survival", "cyberpunk").
 * Runs a single batched LLM call per batch of entities.
 */
export async function enrichNewEntities(entityIds: string[]): Promise<{ enriched: number }> {
  if (entityIds.length === 0) return { enriched: 0 };
  suppressCategory("cortex", 30 * 60 * 1000);

  let totalEnriched = 0;

  // Process in batches
  for (let i = 0; i < entityIds.length; i += SEMANTIC_TAG_BATCH_SIZE) {
    const batch = entityIds.slice(i, i + SEMANTIC_TAG_BATCH_SIZE);
    const items = batch.map(id => {
      const entry = lookupEntity(id);
      if (!entry) return null;
      return {
        entityId: id,
        title: entry.title,
        type: entry.type,
        source: entry.source,
        tags: entry.tags || [],
      };
    }).filter(Boolean) as Array<{ entityId: string; title: string; type: string; source: string; tags: string[] }>;

    if (items.length === 0) continue;

    const itemsList = items.map(it =>
      `- ${it.entityId}: "${it.title}" [${it.type}, ${it.source}] tags: ${it.tags.join(", ")}`
    ).join("\n");

    const prompt = `You are a knowledge librarian tagging items for cross-source discovery.

Given these items from different sources (books, movies, games, YouTube channels, projects, etc.), assign 3-5 UNIVERSAL SEMANTIC TAGS to each item. These tags should:
- Describe themes, moods, and concepts that transcend source type
- Enable finding related items ACROSS sources (a book and a movie about the same theme)
- Be lowercase, hyphenated phrases (e.g., "coming-of-age", "east-asian-culture", "dystopian-society", "team-building", "visual-storytelling", "survival", "philosophical", "historical-fiction", "open-world-exploration", "personal-growth")
- NOT repeat source-specific tags like "book", "kindle", "steam", "game", "movie" etc.
- Focus on what the item is ABOUT, not what format it is

Items:
${itemsList}

Return JSON array, one entry per item:
[{ "entityId": "...", "semanticTags": ["tag1", "tag2", "tag3"] }]

Return ONLY the JSON array, no markdown fences.`;

    try {
      const response = await llm({
        prompt,
        tier: "fast",
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entityId: { type: "string" },
              semanticTags: { type: "array", items: { type: "string" } },
            },
            required: ["entityId", "semanticTags"],
          },
        },
        temperature: 0.3,
        maxOutputTokens: 8192,
      });

      const parsed = JSON.parse(cleanJson(response)) as Array<{ entityId: string; semanticTags: string[] }>;

      for (const item of parsed) {
        const entry = lookupEntity(item.entityId);
        if (!entry || !item.semanticTags?.length) continue;
        // Normalize tags
        const tags = item.semanticTags
          .map(t => t.toLowerCase().trim().replace(/\s+/g, "-"))
          .filter(t => t.length > 1 && t.length < 50)
          .slice(0, 5);
        if (tags.length === 0) continue;

        upsertEntityIndex({ ...entry, semanticTags: tags });
        totalEnriched++;

        // Emit event for conversation context registry
        import("./conversation-context.js").then(({ contextRegistry }) => {
          contextRegistry.emitEvent({
            type: "cortex.entity.created",
            payload: { entityId: item.entityId, title: entry.title, semanticTags: tags, source: entry.source },
            timestamp: Date.now(),
          }).catch(() => {});
        }).catch(() => {});
      }

      logAction({
        ts: Date.now(), type: "action", category: "cortex-enrichment",
        message: `Semantic tagging: ${items.length} items → ${totalEnriched} enriched`,
      });
    } catch (err) {
      logError("cortex-enrichment", "Semantic tagging batch failed", cortexError("Semantic tagging batch failed", "enrichment", err instanceof Error ? err : undefined));
    }

    // Small inter-batch pause to ease rate-limit pressure between sequential batches
    if (i + SEMANTIC_TAG_BATCH_SIZE < entityIds.length) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (totalEnriched > 0) saveEntityIndex();
  return { enriched: totalEnriched };
}

// ── Level 3: Cross-Reference Discovery ──

/**
 * Discover cross-source relationships between newly ingested entities and ALL
 * existing entities. Sends a compact inventory to the LLM which finds semantic
 * connections (e.g., book about space → space game → space documentary).
 *
 * Stores bidirectional cross-references on both entities.
 */
export async function crossReferenceNewEntities(entityIds: string[]): Promise<{ refsCreated: number }> {
  if (entityIds.length === 0) return { refsCreated: 0 };

  const entityIndex = getEntityIndex();
  let totalRefs = 0;

  // Collect semantic tags from the new batch for smart sampling
  const batchTags: string[] = [];
  const batchIdSet = new Set(entityIds);
  for (const id of entityIds) {
    const entry = lookupEntity(id);
    if (entry?.semanticTags) batchTags.push(...entry.semanticTags);
  }

  // Build semantic-aware inventory: prioritize entities sharing tags with new batch
  const inventory = buildEntityInventory(entityIndex, INVENTORY_MAX_ENTRIES, {
    relevantTags: batchTags,
    excludeIds: batchIdSet,
  });
  if (inventory.length === 0) return { refsCreated: 0 };

  // Process new entities in batches
  for (let i = 0; i < entityIds.length; i += CROSS_REF_BATCH_SIZE) {
    const batch = entityIds.slice(i, i + CROSS_REF_BATCH_SIZE);
    const newItems = batch.map(id => {
      const entry = lookupEntity(id);
      if (!entry) return null;
      return {
        entityId: id,
        title: entry.title,
        type: entry.type,
        source: entry.source,
        semanticTags: entry.semanticTags || [],
      };
    }).filter(Boolean) as Array<{ entityId: string; title: string; type: string; source: string; semanticTags: string[] }>;

    if (newItems.length === 0) continue;

    const newItemsList = newItems.map(it =>
      `- ${it.entityId}: "${it.title}" [${it.type}] semantic: ${it.semanticTags.join(", ")}`
    ).join("\n");

    const prompt = `You are a knowledge synthesis engine finding CROSS-SOURCE connections in a personal knowledge base.

## New Items (find relationships FOR these)
${newItemsList}

## Existing Inventory (find relationships WITH these)
${inventory}

## Task
For each new item, find 2-5 items from the EXISTING INVENTORY that are semantically related but from a DIFFERENT source type. Focus on:
- Thematic connections (same themes explored in different media)
- Creator connections (same author/director/developer across formats)
- Subject connections (same topic, event, or setting)
- Complementary content (e.g., a "how to draw" book + an art YouTube channel)

DO NOT match items from the same source (no book-to-book or game-to-game).

Return JSON array of cross-references:
[{ "from": "entityId-of-new-item", "to": "entityId-of-existing-item", "reason": "brief 5-15 word explanation" }]

Only include meaningful connections, not forced ones. If no good cross-source match exists for an item, omit it. Return ONLY the JSON array, no markdown fences.`;

    try {
      const crossRefSchema = {
        type: "array",
        items: {
          type: "object",
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            reason: { type: "string" },
          },
          required: ["from", "to", "reason"],
        },
      };
      let response = await llm({
        prompt,
        tier: "utility",
        responseMimeType: "application/json",
        responseSchema: crossRefSchema,
        temperature: 0.3,
        maxOutputTokens: 16384,
        timeoutMs: 120_000,
      });

      let refs: Array<{ from: string; to: string; reason: string }>;
      try {
        refs = JSON.parse(cleanJson(response));
      } catch {
        // Retry once with stricter prompt on parse failure
        logAction({
          ts: Date.now(), type: "action", category: "cortex-enrichment",
          message: `Cross-reference JSON parse failed, retrying with stricter prompt`,
        });
        response = await llm({
          prompt: prompt + "\n\nIMPORTANT: Return ONLY valid JSON array. No trailing commas, no unescaped quotes in reason strings. Escape all special characters.",
          tier: "utility",
          responseMimeType: "application/json",
          responseSchema: crossRefSchema,
          temperature: 0.1,
          maxOutputTokens: 16384,
          timeoutMs: 120_000,
        });
        refs = JSON.parse(cleanJson(response));
      }

      for (const ref of refs) {
        if (!ref.from || !ref.to || !ref.reason) continue;
        const fromEntry = lookupEntity(ref.from);
        const toEntry = lookupEntity(ref.to);
        if (!fromEntry || !toEntry) continue;
        // Skip same-source refs
        if (fromEntry.source === toEntry.source) continue;

        // Add bidirectional cross-reference
        addCrossReference(fromEntry, ref.to, ref.reason);
        addCrossReference(toEntry, ref.from, ref.reason);
        totalRefs++;
      }

      logAction({
        ts: Date.now(), type: "action", category: "cortex-enrichment",
        message: `Cross-reference: ${newItems.length} new items → ${totalRefs} cross-refs created`,
      });
    } catch (err) {
      logError("cortex-enrichment", "Cross-reference batch failed", cortexError("Cross-reference batch failed", "cross-ref", err instanceof Error ? err : undefined));
    }

    // Inter-batch pause to reduce rate-limit pressure
    if (i + CROSS_REF_BATCH_SIZE < entityIds.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (totalRefs > 0) saveEntityIndex();
  return { refsCreated: totalRefs };
}

// ── Helpers ──

function addCrossReference(entry: EntityIndexEntry, targetId: EntityId, reason: string): void {
  const existing = entry.crossReferences || [];
  // Don't duplicate
  if (existing.some(r => r.entityId === targetId)) return;
  upsertEntityIndex({
    ...entry,
    crossReferences: [...existing, { entityId: targetId, reason }],
  });
}

// ── Level 4: YouTube Video Recommendations ──

/** Max entities to process per recommendVideos call (YouTube API quota: 100 units per search).
 *  YouTube daily quota = 10,000 units. Each search.list = 100 units.
 *  Cap at 20 to leave quota headroom for enso_youtube_my_feed and other tools. */
const VIDEO_BATCH_SIZE = 20;
const VIDEO_SEARCH_DELAY_MS = 300; // delay between API calls

/**
 * Search YouTube for relevant videos for each entity and store top results.
 * No LLM cost — uses entity title directly as search query.
 * Applies to all entity types (books, movies, games, places, articles, etc.).
 */
export async function recommendVideosForEntities(entityIds: string[]): Promise<{ matched: number }> {
  if (entityIds.length === 0) return { matched: 0 };

  let searchFn: typeof import("./youtube-tools.js").search;
  try {
    const yt = await import("./youtube-tools.js");
    searchFn = yt.search;
  } catch {
    logError("cortex-enrichment", "YouTube tools not available, skipping video recommendations", null);
    return { matched: 0 };
  }

  let matched = 0;
  const batch = entityIds.slice(0, VIDEO_BATCH_SIZE);

  for (const id of batch) {
    const entry = lookupEntity(id);
    if (!entry) continue;
    // Skip entities that already have videos
    if (entry.recommendedVideos?.length) continue;
    // Skip YouTube channels/videos themselves
    if (entry.source === "youtube") continue;
    // Skip unmatched movies/TV (raw video files without IMDB/TMDB genre data)
    if (entry.source === "movies_tv") {
      const genres = (entry.tags || []).filter(t => t !== "movie" && t !== "tv-series" && t !== "documentary" && t !== "video");
      if (genres.length === 0) continue; // no genre tags = not enriched via TMDB
    }

    try {
      const query = entry.title;
      const results = await searchFn({ query, maxResults: 5 });

      // Filter out shorts (duration < 1 minute) and pick top 3
      const videos = results
        .filter(v => {
          if (!v.duration) return true;
          // Parse duration like "5m30s", "1h2m", "45s"
          const dur = v.duration.toLowerCase();
          const hasHours = dur.includes("h");
          const hasMinutes = dur.includes("m");
          if (hasHours) return true;
          if (hasMinutes) return true;
          // Only seconds — it's a short, skip
          return false;
        })
        .slice(0, 3)
        .map(v => ({
          videoId: v.videoId,
          title: v.title,
          channelTitle: v.channelTitle,
          thumbnailUrl: v.thumbnailUrl,
          viewCount: v.viewCount,
          duration: v.duration,
        }));

      if (videos.length > 0) {
        upsertEntityIndex({ ...entry, recommendedVideos: videos });
        matched++;
      }

      // Respect API rate limits
      if (VIDEO_SEARCH_DELAY_MS > 0) {
        await new Promise(r => setTimeout(r, VIDEO_SEARCH_DELAY_MS));
      }
    } catch (err) {
      // Log but continue — individual failures shouldn't stop the batch
      logError("cortex-enrichment", `Video search failed for "${entry.title}"`, err);
    }
  }

  if (matched > 0) {
    saveEntityIndex();
    logAction({
      ts: Date.now(), type: "action", category: "cortex-enrichment",
      message: `Video recommendations: ${matched} entities matched from ${batch.length} processed`,
    });
  }

  return { matched };
}

// ── Inventory Builder (semantic-aware sampling) ──

/**
 * Build a compact inventory of entities for LLM context.
 * Uses SEMANTIC-AWARE SAMPLING when relevantTags are provided:
 *   Phase 1: Include all entities sharing ≥1 semantic tag with the new batch
 *   Phase 2: Fill remaining slots with diverse random-sampled entities
 * This ensures the LLM sees the most relevant connections, not just the first N.
 */
export function buildEntityInventory(
  index: ReadonlyMap<EntityId, EntityIndexEntry>,
  maxEntries: number,
  options?: { relevantTags?: string[]; excludeIds?: Set<string> },
): string {
  const relevantTags = new Set(options?.relevantTags || []);
  const excludeIds = options?.excludeIds || new Set<string>();
  const selected: EntityIndexEntry[] = [];
  const remainder: EntityIndexEntry[] = [];

  for (const entry of index.values()) {
    if (excludeIds.has(entry.entityId)) continue;
    // Phase 1: entities with matching semantic tags
    if (relevantTags.size > 0 && entry.semanticTags?.some(t => relevantTags.has(t))) {
      selected.push(entry);
    } else {
      remainder.push(entry);
    }
  }

  // Phase 2: fill remaining slots with diverse sample
  const remaining = maxEntries - selected.length;
  if (remaining > 0 && remainder.length > 0) {
    // Shuffle remainder for diversity, then take up to remaining
    for (let i = remainder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainder[i], remainder[j]] = [remainder[j], remainder[i]];
    }
    selected.push(...remainder.slice(0, remaining));
  }

  // Trim to max
  const final = selected.slice(0, maxEntries);

  return final.map(entry => {
    const stags = entry.semanticTags?.length ? ` sem:[${entry.semanticTags.join(",")}]` : "";
    return `${entry.entityId}: "${entry.title}" [${entry.type}, ${entry.source}]${stags}`;
  }).join("\n");
}

// ── Re-Enrichment Cycle ──

/**
 * Find and enrich entities that are under-connected in the knowledge graph.
 * Targets entities missing semantic tags or with <2 cross-references.
 * Runs in small batches to stay within rate limits.
 */
export async function reEnrichStaleEntities(maxEntities = 50): Promise<{ enriched: number; refsCreated: number }> {
  const index = getEntityIndex();
  const needsTags: string[] = [];
  const needsRefs: string[] = [];

  for (const entry of index.values()) {
    if (!entry.semanticTags || entry.semanticTags.length === 0) {
      needsTags.push(entry.entityId);
    }
    if (!entry.crossReferences || entry.crossReferences.length < 2) {
      needsRefs.push(entry.entityId);
    }
  }

  // Prioritize: entities with NO tags first, then those with few refs
  const tagBatch = needsTags.slice(0, maxEntities);
  const refBatch = needsRefs.slice(0, maxEntities);

  let enriched = 0;
  let refsCreated = 0;

  if (tagBatch.length > 0) {
    console.log(`[enso:enrichment] Re-enriching ${tagBatch.length} entities missing semantic tags`);
    const result = await enrichNewEntities(tagBatch);
    enriched = result.enriched;
  }

  if (refBatch.length > 0) {
    console.log(`[enso:enrichment] Re-enriching ${refBatch.length} entities with <2 cross-references`);
    const result = await crossReferenceNewEntities(refBatch);
    refsCreated = result.refsCreated;
  }

  if (enriched > 0 || refsCreated > 0) {
    logAction({
      ts: Date.now(), type: "action", category: "cortex-enrichment",
      message: `Re-enrichment: ${enriched} tagged, ${refsCreated} cross-refs created (from ${needsTags.length} untagged, ${needsRefs.length} under-connected)`,
    });
  }

  // Auto-refresh thematic map if stale
  await maybeRefreshThematicMap();

  return { enriched, refsCreated };
}

// ── Thematic Map Auto-Refresh ──

/**
 * Regenerate the thematic map if it's stale (>7 days old) or missing.
 */
export async function maybeRefreshThematicMap(): Promise<boolean> {
  try {
    const mapPath = join(homedir(), ".enso", "wiki", "synthesis", "thematic-map.md");
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const shouldRefresh = !existsSync(mapPath)
      || (Date.now() - statSync(mapPath).mtimeMs > sevenDays);

    if (!shouldRefresh) return false;

    console.log("[enso:enrichment] Thematic map is stale — regenerating");
    const { generateThematicMap } = await import("./cortex-synthesis.js");
    await generateThematicMap();
    logAction({
      ts: Date.now(), type: "action", category: "cortex-enrichment",
      message: "Thematic map auto-refreshed",
    });
    return true;
  } catch (err) {
    logError("cortex-enrichment", "Thematic map refresh failed", err);
    return false;
  }
}
