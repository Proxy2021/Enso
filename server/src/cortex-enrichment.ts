/**
 * Cortex Enrichment — LLM-powered semantic tagging and cross-reference discovery.
 *
 * Runs at INGEST TIME (after data source scans), not at runtime.
 * Two phases:
 *   1. enrichNewEntities() — Adds universal semantic tags (Gemini Flash, ~$0.002/batch)
 *   2. crossReferenceNewEntities() — Discovers cross-source relationships (Gemini Flash, ~$0.01/batch)
 *
 * Both phases operate in batch: one LLM call per ingest run, not per entity.
 */

import { llm } from "./llm.js";
import {
  getEntityIndex, lookupEntity, upsertEntityIndex, saveEntityIndex,
  type EntityId, type EntityIndexEntry,
} from "./entity-model.js";
import { logAction, logError } from "./action-log.js";

// ── Constants ──

/** Max entities per LLM call to stay within output token limits */
const SEMANTIC_TAG_BATCH_SIZE = 30;
const CROSS_REF_BATCH_SIZE = 15;
const INVENTORY_MAX_ENTRIES = 200;

// ── Level 2: Semantic Tagging ──

/**
 * Add LLM-derived universal semantic tags to newly ingested entities.
 * Tags transcend source boundaries (e.g., "coming-of-age", "survival", "cyberpunk").
 * Runs a single batched LLM call per batch of entities.
 */
export async function enrichNewEntities(entityIds: string[]): Promise<{ enriched: number }> {
  if (entityIds.length === 0) return { enriched: 0 };

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
        temperature: 0.3,
        maxOutputTokens: 8192,
      });

      const parsed = JSON.parse(response) as Array<{ entityId: string; semanticTags: string[] }>;

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
      }

      logAction({
        ts: Date.now(), type: "action", category: "cortex-enrichment",
        message: `Semantic tagging: ${items.length} items → ${totalEnriched} enriched`,
      });
    } catch (err) {
      logError("cortex-enrichment", "Semantic tagging batch failed", err);
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

  // Build compact inventory of ALL existing entities (for LLM context)
  const inventory = buildEntityInventory(entityIndex, INVENTORY_MAX_ENTRIES);
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
      const response = await llm({
        prompt,
        tier: "utility",
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 16384,
        timeoutMs: 120_000,
      });

      const refs = JSON.parse(response) as Array<{ from: string; to: string; reason: string }>;

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
      logError("cortex-enrichment", "Cross-reference batch failed", err);
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

/**
 * Build a compact inventory of all entities for LLM context.
 * Format: one line per entity with entityId, title, type, source, and semantic tags.
 */
function buildEntityInventory(
  index: ReadonlyMap<EntityId, EntityIndexEntry>,
  maxEntries: number,
): string {
  const lines: string[] = [];
  let count = 0;
  for (const entry of index.values()) {
    if (count >= maxEntries) break;
    const stags = entry.semanticTags?.length ? ` sem:[${entry.semanticTags.join(",")}]` : "";
    lines.push(`${entry.entityId}: "${entry.title}" [${entry.type}, ${entry.source}]${stags}`);
    count++;
  }
  return lines.join("\n");
}
