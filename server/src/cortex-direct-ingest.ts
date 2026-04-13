/**
 * Cortex Direct Ingest — Create per-item cortex pages from data sources without LLM cost.
 *
 * Each data source in the registry can declare getDirectIngestPages() which returns
 * structured cortex pages for individual items (books, projects, etc.). These pages
 * are written directly to ~/.enso/wiki/ and indexed, making them first-class Cortex
 * entities that support all actions (read, research, podcast, discover, etc.).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { DATA_SOURCES, readCache, type DirectIngestPage } from "./data-source-registry.js";
import { logAction, logError } from "./action-log.js";
import {
  slugify, buildEntityId, entityCortexPath, parseEntityId, ENTITY_TYPES,
  upsertEntityIndex, saveEntityIndex, lookupEntity,
  type EntityType, type EntitySource,
} from "./entity-model.js";

const CORTEX_DIR = join(homedir(), ".enso", "wiki");
const INDEX_PATH = join(CORTEX_DIR, "_index.md");
const LOG_PATH = join(CORTEX_DIR, "_log.md");

function ensureCortexDir(): void {
  for (const sub of ["entities", "synthesis"]) {
    const dir = join(CORTEX_DIR, sub);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read the current cortex index to check for existing pages.
 */
function readExistingPaths(): Set<string> {
  const paths = new Set<string>();
  try {
    if (existsSync(INDEX_PATH)) {
      const raw = readFileSync(INDEX_PATH, "utf-8");
      const matches = raw.matchAll(/^## (.+\.md)$/gm);
      for (const m of matches) paths.add(m[1]);
    }
  } catch { /* ignore */ }
  return paths;
}

/**
 * Append a page entry to the cortex index.
 */
function appendToIndex(page: DirectIngestPage): void {
  const entityIdLine = page.entityId ? `\nEntityId: ${page.entityId}` : "";
  const entry = `\n## ${page.path}\n**${page.title}** — ${page.summary.slice(0, 200)}. Tags: ${page.tags.join(", ")}.\nUpdated: ${new Date().toISOString()}${entityIdLine}\n`;
  writeFileSync(INDEX_PATH, (existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, "utf-8") : "") + entry);
}

/**
 * Update an existing entry in the cortex index (replace its block).
 */
function updateIndexEntry(page: DirectIngestPage): void {
  if (!existsSync(INDEX_PATH)) { appendToIndex(page); return; }
  const raw = readFileSync(INDEX_PATH, "utf-8");
  const pattern = new RegExp(`\n## ${page.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n[\\s\\S]*?(?=\\n## |$)`, "m");
  const entityIdLine = page.entityId ? `\nEntityId: ${page.entityId}` : "";
  const replacement = `\n## ${page.path}\n**${page.title}** — ${page.summary.slice(0, 200)}. Tags: ${page.tags.join(", ")}.\nUpdated: ${new Date().toISOString()}${entityIdLine}\n`;
  if (pattern.test(raw)) {
    writeFileSync(INDEX_PATH, raw.replace(pattern, replacement));
  } else {
    writeFileSync(INDEX_PATH, raw + replacement);
  }
}

/**
 * Run direct ingest for all data sources. Creates per-item cortex pages
 * for items that don't already have pages (or updates existing ones).
 *
 * @param options.forceUpdate - Update pages even if they already exist
 * @param options.sourceIds - Only process specific sources
 */
export async function directIngestFromSources(options?: {
  forceUpdate?: boolean;
  sourceIds?: string[];
}): Promise<{ created: number; updated: number; sources: string[]; createdEntityIds: string[] }> {
  ensureCortexDir();

  const existingPaths = readExistingPaths();
  let created = 0;
  let updated = 0;
  const sourcesProcessed: string[] = [];
  const createdEntityIds: string[] = [];

  // Read consent
  let consent: Record<string, boolean> = {};
  try {
    const { readConsent } = await import("./user-context-tools.js");
    consent = readConsent() as unknown as Record<string, boolean>;
  } catch {
    try {
      const consentPath = join(homedir(), ".enso", "data", "user-context", "consent.json");
      if (existsSync(consentPath)) consent = JSON.parse(readFileSync(consentPath, "utf-8"));
    } catch { /* no consent */ }
  }

  for (const ds of DATA_SOURCES) {
    // Filter by sourceIds if specified
    if (options?.sourceIds && !options.sourceIds.includes(ds.id)) continue;

    // Check consent
    if (!consent[ds.id]) continue;

    // Check if this source has direct ingest capability
    if (!ds.getDirectIngestPages) continue;

    const cached = readCache(ds.cacheFile);
    if (!cached) continue;

    const pages = ds.getDirectIngestPages(cached);
    if (pages.length === 0) continue;

    sourcesProcessed.push(ds.id);

    for (const page of pages) {
      const fullPath = join(CORTEX_DIR, page.path);
      const exists = existingPaths.has(page.path) || existsSync(fullPath);

      if (exists && !options?.forceUpdate) continue; // Skip existing pages

      // Write the page
      const dir = dirname(fullPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, page.content, "utf-8");

      // Update index
      if (exists) {
        updateIndexEntry(page);
        updated++;
      } else {
        appendToIndex(page);
        created++;
        if (page.entityId) createdEntityIds.push(page.entityId);
      }
    }

    logAction({
      ts: Date.now(), type: "action", category: "cortex-direct",
      message: `Direct ingest from ${ds.id}: ${pages.length} items, ${created} created, ${updated} updated`,
    });
  }

  if (created > 0 || updated > 0) {
    // Append to cortex log
    const logEntry = `\n- ${new Date().toISOString()} — Direct ingest: ${created} pages created, ${updated} updated from ${sourcesProcessed.join(", ")}\n`;
    writeFileSync(LOG_PATH, (existsSync(LOG_PATH) ? readFileSync(LOG_PATH, "utf-8") : "# Cortex Log\n") + logEntry);
  }

  return { created, updated, sources: sourcesProcessed, createdEntityIds };
}

// ─── Discovered Entity Ingest ────────────────────────────────────────────────

/**
 * Create a Cortex entity page from a discovered entity (e.g., book recommended
 * during research, movie found in daily discovery email). Zero LLM cost.
 *
 * Idempotent: if the page already exists, returns `created: false`.
 */
export async function ingestDiscoveredEntity(opts: {
  title: string;
  type: string;
  source?: string;
  creator?: string;
  year?: string;
  description?: string;
  imageUrl?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ entityId: string; cortexPath: string; created: boolean }> {
  ensureCortexDir();

  const source = (opts.source || "research") as EntitySource;
  const type = opts.type as EntityType;
  const slug = slugify(opts.title);
  const entityId = buildEntityId(source, type, slug);

  // Derive cortex path from ENTITY_TYPES registry
  const typeDef = ENTITY_TYPES[type];
  const cortexPath = typeDef?.cortexPrefix
    ? `${typeDef.cortexPrefix}${slug}.md`
    : `entities/${slug}.md`;

  const fullPath = join(CORTEX_DIR, cortexPath);

  // Idempotent: if page exists, just ensure entity index is updated
  if (existsSync(fullPath)) {
    const existing = lookupEntity(entityId);
    if (!existing) {
      upsertEntityIndex({
        entityId,
        type,
        source,
        title: opts.title,
        slug,
        imageUrl: opts.imageUrl,
        cortexPath,
        tags: [type, source, "discovered"],
        updatedAt: new Date().toISOString(),
      });
      saveEntityIndex();
    } else if (opts.imageUrl || opts.metadata) {
      // Backfill missing imageUrl/metadata on existing entries
      const patch: Record<string, unknown> = { entityId, type, source, title: opts.title, slug, cortexPath, updatedAt: new Date().toISOString() };
      if (opts.imageUrl && !existing.imageUrl) patch.imageUrl = opts.imageUrl;
      else if (opts.imageUrl) patch.imageUrl = opts.imageUrl;
      if (opts.metadata) {
        const merged = { ...(existing.metadata as Record<string, unknown> || {}), ...opts.metadata };
        if (opts.creator && !merged.author) merged.author = opts.creator;
        if (opts.description && !merged.description) merged.description = opts.description;
        patch.metadata = merged;
      }
      upsertEntityIndex(patch as Parameters<typeof upsertEntityIndex>[0]);
      saveEntityIndex();
    }
    return { entityId, cortexPath, created: false };
  }

  // Build markdown content
  const lines: string[] = [`# ${opts.title}`];
  if (opts.creator) lines.push(`\n**By ${opts.creator}**`);
  if (opts.year) lines.push(`\n*${opts.year}*`);
  lines.push("");
  if (opts.description) {
    lines.push("## Overview");
    lines.push("");
    lines.push(opts.description);
    lines.push("");
  }
  lines.push("## Details");
  lines.push("");
  lines.push(`- **Type**: ${type}`);
  lines.push(`- **Discovered via**: Research`);
  if (opts.creator) lines.push(`- **Creator**: ${opts.creator}`);
  if (opts.year) lines.push(`- **Year**: ${opts.year}`);
  if (opts.url) lines.push(`- **URL**: ${opts.url}`);
  if (opts.metadata) {
    const md = opts.metadata;
    if (md.sourceUrl && typeof md.sourceUrl === "string") lines.push(`- **Source Link**: [${md.source || "Link"}](${md.sourceUrl})`);
    if (md.publisher) lines.push(`- **Publisher**: ${md.publisher}`);
    if (md.pageCount) lines.push(`- **Pages**: ${md.pageCount}`);
    if (md.rating) lines.push(`- **Rating**: ${md.rating}`);
    if (Array.isArray(md.categories) && md.categories.length) lines.push(`- **Categories**: ${md.categories.join(", ")}`);
  }
  lines.push(`- **Added**: ${new Date().toISOString().split("T")[0]}`);
  lines.push("");

  const content = lines.join("\n");

  // Write page
  const dir = dirname(fullPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, "utf-8");

  // Update cortex index
  const page: DirectIngestPage = {
    path: cortexPath,
    title: opts.title,
    content,
    summary: opts.description?.slice(0, 200) || `${type} discovered via research`,
    tags: [type, source, "discovered", ...(opts.creator ? [opts.creator.toLowerCase()] : [])],
    entityId,
  };
  appendToIndex(page);

  // Update entity index (include rich metadata if provided)
  const indexEntry: Record<string, unknown> = {
    entityId,
    type,
    source,
    title: opts.title,
    slug,
    imageUrl: opts.imageUrl,
    cortexPath,
    tags: page.tags,
    updatedAt: new Date().toISOString(),
  };
  const meta: Record<string, unknown> = opts.metadata ? { ...opts.metadata } : {};
  if (opts.creator) meta.author = opts.creator;
  if (opts.year) meta.publicationDate = opts.year;
  if (opts.description) meta.description = opts.description;
  if (opts.url) { meta.sourceUrl = meta.sourceUrl || opts.url; meta.url = opts.url; }
  // Normalize keys to match detailFields conventions
  if (meta.creator && !meta.author) { meta.author = meta.creator; delete meta.creator; }
  if (meta.ratingsCount !== undefined) { meta.reviewCount = meta.ratingsCount; delete meta.ratingsCount; }
  if (meta.year && !meta.publicationDate) { meta.publicationDate = meta.year; }
  if (Object.keys(meta).length > 0) indexEntry.metadata = meta;
  upsertEntityIndex(indexEntry as Parameters<typeof upsertEntityIndex>[0]);
  saveEntityIndex();

  // Log
  logAction({
    ts: Date.now(), type: "action", category: "cortex-direct",
    message: `Discovered entity ingested: ${entityId} → ${cortexPath}`,
  });

  return { entityId, cortexPath, created: true };
}

// ─── Book Enrichment via Google Books API ────────────────────────────────────

/**
 * Enrich a discovered/manually-added book with metadata from Google Books API.
 * Updates the Cortex wiki page and entity index with rich metadata:
 * description, rating, categories, pageCount, publisher, publishedDate, ISBN, cover.
 *
 * Fire-and-forget safe — call after ingestDiscoveredEntity() for books.
 */
export async function enrichDiscoveredBook(entityId: string): Promise<boolean> {
  try {
    const parsed = parseEntityId(entityId);
    if (!parsed || parsed.type !== "book") return false;

    const cortexPath = entityCortexPath(entityId);
    if (!cortexPath) return false;
    const fullPath = join(CORTEX_DIR, cortexPath);
    if (!existsSync(fullPath)) return false;

    const content = readFileSync(fullPath, "utf-8");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : parsed.slug;
    const authorMatch = content.match(/\*\*(?:By\s+)?(.+?)\*\*/);
    const author = authorMatch ? authorMatch[1].replace(/^By\s+/, "").trim() : "";

    // Search Google Books API (free, no key)
    const query = author
      ? `intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`
      : encodeURIComponent(title + " book");

    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=3`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return false;

    const data = await res.json() as {
      items?: Array<{ volumeInfo?: Record<string, unknown> }>;
    };
    if (!data.items?.length) return false;

    const vol = data.items[0].volumeInfo as {
      title?: string; authors?: string[]; description?: string; publisher?: string;
      publishedDate?: string; pageCount?: number; categories?: string[];
      averageRating?: number; ratingsCount?: number; language?: string;
      imageLinks?: { thumbnail?: string }; industryIdentifiers?: Array<{ type: string; identifier: string }>;
    } | undefined;
    if (!vol) return false;

    const enrichedAuthor = author || (vol.authors?.join(", ") ?? "Unknown");
    const isbn = vol.industryIdentifiers?.find(id => id.type === "ISBN_13")?.identifier
      || vol.industryIdentifiers?.find(id => id.type === "ISBN_10")?.identifier || "";
    const coverUrl = vol.imageLinks?.thumbnail?.replace("http://", "https://") || "";
    const desc = vol.description?.replace(/<[^>]+>/g, "").slice(0, 1000) || "";

    // Rebuild enriched page
    const lines: string[] = [`# ${title}\n`];
    lines.push(`By **${enrichedAuthor}**.${vol.publisher ? ` Published by ${vol.publisher}` : ""}${vol.publishedDate ? `, ${vol.publishedDate}` : ""}.${vol.pageCount ? ` ${vol.pageCount} pages.` : ""}\n`);
    if (vol.averageRating) lines.push(`⭐ ${vol.averageRating}${vol.ratingsCount ? ` (${vol.ratingsCount.toLocaleString()} ratings)` : ""}${vol.categories?.length ? ` · ${vol.categories.join(", ")}` : ""}\n`);
    if (desc) { lines.push("## Overview\n"); lines.push(desc + "\n"); }
    lines.push("## Details");
    lines.push(`- **Author**: ${enrichedAuthor}`);
    lines.push(`- **Source**: Discovered`);
    if (vol.publisher) lines.push(`- **Publisher**: ${vol.publisher}`);
    if (vol.publishedDate) lines.push(`- **Published**: ${vol.publishedDate}`);
    if (vol.pageCount) lines.push(`- **Pages**: ${vol.pageCount}`);
    if (vol.language) lines.push(`- **Language**: ${vol.language}`);
    if (isbn) lines.push(`- **ISBN**: ${isbn}`);
    if (coverUrl) lines.push(`- **Cover**: ![cover](${coverUrl})`);
    if (vol.categories?.length) { lines.push("\n## Categories"); for (const c of vol.categories) lines.push(`- ${c}`); }
    lines.push(`\n*Enriched: ${new Date().toISOString().split("T")[0]}*`);

    writeFileSync(fullPath, lines.join("\n"), "utf-8");

    // Update index
    const page: DirectIngestPage = {
      path: cortexPath, title, content: lines.join("\n"),
      summary: desc.slice(0, 200) || `${title} by ${enrichedAuthor}`,
      tags: ["book", parsed.source, "enriched", ...(vol.categories || []).map(c => c.toLowerCase())],
      entityId,
    };
    updateIndexEntry(page);

    upsertEntityIndex({
      entityId, type: "book" as EntityType, source: parsed.source as EntitySource,
      title, slug: parsed.slug, imageUrl: coverUrl, cortexPath,
      tags: page.tags, updatedAt: new Date().toISOString(),
    });
    saveEntityIndex();

    logAction({ ts: Date.now(), type: "action", category: "book-enrich",
      message: `Enriched "${title}": ${vol.pageCount || "?"} pages, rating ${vol.averageRating || "?"}, ${vol.categories?.join(", ") || "no categories"}` });
    return true;
  } catch (err) {
    logError("book-enrich", `Failed to enrich ${entityId}`, err);
    return false;
  }
}
