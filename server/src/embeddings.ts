/**
 * embeddings.ts — Gemini embedding utilities for semantic similarity.
 *
 * Provides vector embedding generation, cosine similarity, and caching.
 * Used by media library discovery and available for any server-side code
 * that needs semantic similarity (cortex cross-references, search, etc.).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { GEMINI_API_BASE } from "./config.js";
import { ENSO_HOME } from "./utils/home.js";
import { logAction, logError } from "./action-log.js";

const EMBEDDING_MODEL = "text-embedding-004";
const EMBEDDING_ENDPOINT = `${GEMINI_API_BASE}/models/${EMBEDDING_MODEL}`;
const BATCH_SIZE = 100; // Gemini batch limit
const RATE_LIMIT_DELAY_MS = 200; // delay between batch calls
const CACHE_DIR = join(ENSO_HOME, "data", "media-library");
const CACHE_FILE = join(CACHE_DIR, "embeddings-cache.json");

// ── Types ──

interface EmbeddingCacheEntry {
  embedding: number[];
  textHash: string;
  cachedAt: number;
}

interface EmbeddingCache {
  [entityId: string]: EmbeddingCacheEntry;
}

// ── Pure math ──

/**
 * Cosine similarity between two vectors. Returns value in [-1, 1].
 * Identical vectors → 1, orthogonal → 0, opposite → -1.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Text construction ──

/**
 * Build a single text string from an entity's metadata for embedding.
 * Combines title, tags, semanticTags, and themes into a coherent passage.
 */
export function buildEntityEmbeddingText(entity: {
  title?: string;
  type?: string;
  tags?: string[];
  semanticTags?: string[];
  themes?: string[];
  description?: string;
}): string {
  const parts: string[] = [];

  if (entity.title) parts.push(entity.title);
  if (entity.type) parts.push(`[${entity.type}]`);
  if (entity.tags?.length) parts.push(entity.tags.join(", "));
  if (entity.semanticTags?.length) parts.push(entity.semanticTags.join(", "));
  if (entity.themes?.length) parts.push(entity.themes.join(", "));
  if (entity.description) parts.push(entity.description.slice(0, 200));

  return parts.join(" | ");
}

// ── Hashing ──

/** Simple string hash for detecting content changes. */
function textHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
}

// ── Cache I/O ──

function loadCache(): EmbeddingCache {
  try {
    if (existsSync(CACHE_FILE)) {
      return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
    }
  } catch {
    logError("embeddings", "Failed to load embedding cache", "");
  }
  return {};
}

function saveCache(cache: EmbeddingCache): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(cache), "utf-8");
  } catch (err) {
    logError("embeddings", "Failed to save embedding cache", String(err));
  }
}

// ── API calls ──

function getApiKey(): string {
  return process.env.GEMINI_API_KEY || "";
}

/**
 * Get embedding for a single text string.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No GEMINI_API_KEY configured");

  const url = `${EMBEDDING_ENDPOINT}:embedContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text }] },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Embedding API error: ${response.status} ${errText}`);
  }

  const result = (await response.json()) as {
    embedding?: { values?: number[] };
  };

  const values = result.embedding?.values;
  if (!values?.length) throw new Error("Empty embedding response");

  return values;
}

/**
 * Batch-get embeddings with rate limiting.
 * Splits into chunks of BATCH_SIZE and calls the batch endpoint.
 */
export async function batchGetEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No GEMINI_API_KEY configured");

  const results: number[][] = [];

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const chunk = texts.slice(start, start + BATCH_SIZE);

    const url = `${EMBEDDING_ENDPOINT}:batchEmbedContents?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: chunk.map((t) => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text: t }] },
        })),
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Batch embedding API error: ${response.status} ${errText}`);
    }

    const result = (await response.json()) as {
      embeddings?: Array<{ values?: number[] }>;
    };

    const embeddings = result.embeddings || [];
    for (const emb of embeddings) {
      results.push(emb.values || []);
    }

    // Rate-limit between batches
    if (start + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }
  }

  return results;
}

/**
 * Get embeddings for a set of entities, using cache where possible.
 * Returns a map of entityId → embedding vector.
 */
export async function getEntityEmbeddings(
  entities: Array<{ entityId: string; [key: string]: unknown }>,
  maxNewEmbeddings = 200,
): Promise<{ embeddings: Record<string, number[]>; cached: number; computed: number }> {
  const cache = loadCache();
  const embeddings: Record<string, number[]> = {};
  const toCompute: Array<{ entityId: string; text: string }> = [];

  for (const entity of entities) {
    const embText = buildEntityEmbeddingText(entity as any);
    const hash = textHash(embText);
    const cached = cache[entity.entityId];

    if (cached && cached.textHash === hash) {
      embeddings[entity.entityId] = cached.embedding;
    } else {
      toCompute.push({ entityId: entity.entityId, text: embText });
    }
  }

  const cachedCount = Object.keys(embeddings).length;

  // Limit new embeddings per call
  const batch = toCompute.slice(0, maxNewEmbeddings);

  if (batch.length > 0) {
    try {
      const texts = batch.map((b) => b.text);
      const vectors = await batchGetEmbeddings(texts);

      for (let i = 0; i < batch.length; i++) {
        const { entityId, text } = batch[i];
        const vector = vectors[i];
        if (vector?.length) {
          embeddings[entityId] = vector;
          cache[entityId] = {
            embedding: vector,
            textHash: textHash(text),
            cachedAt: Date.now(),
          };
        }
      }

      saveCache(cache);

      logAction({
        ts: Date.now(),
        type: "action",
        category: "embeddings",
        message: `Computed ${batch.length} embeddings (${cachedCount} cached)`,
      });
    } catch (err) {
      logError("embeddings", "Batch embedding failed", String(err));
    }
  }

  return { embeddings, cached: cachedCount, computed: batch.length };
}

/**
 * Compute the average vector (centroid) from multiple embeddings.
 * Used to build a "taste vector" from rated/favorite items.
 */
export function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];

  const dim = vectors[0].length;
  const avg = new Array(dim).fill(0);

  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      avg[i] += v[i];
    }
  }

  for (let i = 0; i < dim; i++) {
    avg[i] /= vectors.length;
  }

  return avg;
}
