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

const CORTEX_DIR = join(homedir(), ".enso", "wiki");
const INDEX_PATH = join(CORTEX_DIR, "_index.md");
const LOG_PATH = join(CORTEX_DIR, "_log.md");

function ensureCortexDir(): void {
  for (const sub of ["entities", "concepts", "sources", "synthesis"]) {
    const dir = join(CORTEX_DIR, sub);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read the current wiki index to check for existing pages.
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
 * Append a page entry to the wiki index.
 */
function appendToIndex(page: DirectIngestPage): void {
  const entry = `\n## ${page.path}\n**${page.title}** — ${page.summary.slice(0, 200)}. Tags: ${page.tags.join(", ")}.\nUpdated: ${new Date().toISOString()}\n`;
  writeFileSync(INDEX_PATH, (existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, "utf-8") : "") + entry);
}

/**
 * Update an existing entry in the wiki index (replace its block).
 */
function updateIndexEntry(page: DirectIngestPage): void {
  if (!existsSync(INDEX_PATH)) { appendToIndex(page); return; }
  const raw = readFileSync(INDEX_PATH, "utf-8");
  const pattern = new RegExp(`\n## ${page.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n[\\s\\S]*?(?=\\n## |$)`, "m");
  const replacement = `\n## ${page.path}\n**${page.title}** — ${page.summary.slice(0, 200)}. Tags: ${page.tags.join(", ")}.\nUpdated: ${new Date().toISOString()}\n`;
  if (pattern.test(raw)) {
    writeFileSync(INDEX_PATH, raw.replace(pattern, replacement));
  } else {
    writeFileSync(INDEX_PATH, raw + replacement);
  }
}

/**
 * Run direct ingest for all data sources. Creates per-item wiki pages
 * for items that don't already have pages (or updates existing ones).
 *
 * @param options.forceUpdate - Update pages even if they already exist
 * @param options.sourceIds - Only process specific sources
 */
export async function directIngestFromSources(options?: {
  forceUpdate?: boolean;
  sourceIds?: string[];
}): Promise<{ created: number; updated: number; sources: string[] }> {
  ensureCortexDir();

  const existingPaths = readExistingPaths();
  let created = 0;
  let updated = 0;
  const sourcesProcessed: string[] = [];

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

  return { created, updated, sources: sourcesProcessed };
}
