/**
 * cortex-tools.ts — Knowledge Cortex engine + agent tools.
 *
 * Implements Karpathy's "LLM Wiki" pattern: a persistent, interlinked markdown
 * knowledge base maintained by the LLM. Three layers: raw sources (immutable),
 * the cortex (LLM-maintained markdown), and a schema (_index.md conventions).
 *
 * Storage: ~/.enso/wiki/
 *   _index.md          — page catalog with summaries (machine-parseable)
 *   _log.md            — chronological operation log
 *   entities/           — people, projects, companies, tools
 *   concepts/           — topics, techniques, patterns
 *   sources/            — source summaries (reference to raw material)
 *   synthesis/          — cross-cutting analyses
 *
 * Operations: ingest, query (search + read), lint.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { homedir } from "node:os";
import type { EnsoAgentTool } from "./local-types.js";
import { llm } from "./llm.js";
import { logAction, logError } from "./action-log.js";
import { DATA_SOURCES, readCache as registryReadCache } from "./data-source-registry.js";

// ── Constants ──

const CORTEX_DIR = join(homedir(), ".enso", "wiki");
const INDEX_PATH = join(CORTEX_DIR, "_index.md");
const LOG_PATH = join(CORTEX_DIR, "_log.md");
const SUBDIRS = ["entities", "concepts", "sources", "synthesis"] as const;
type CortexCategory = (typeof SUBDIRS)[number];

// ── Types ──

export interface CortexIndexEntry {
  path: string;      // e.g. "entities/react.md"
  title: string;     // e.g. "React"
  summary: string;   // one-line summary
  tags: string[];    // e.g. ["framework", "javascript"]
  updated: string;   // ISO 8601
}

interface CortexPageInfo {
  path: string;
  title: string;
  sizeBytes: number;
  modified: string;
}

export interface IngestResult {
  pagesCreated: string[];
  pagesUpdated: string[];
  summary: string;
}

// ── Directory setup ──

function ensureCortexDir(): void {
  if (!existsSync(CORTEX_DIR)) mkdirSync(CORTEX_DIR, { recursive: true });
  for (const sub of SUBDIRS) {
    const dir = join(CORTEX_DIR, sub);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

// ── Safe file I/O ──

function safeRead(path: string): string | null {
  try { return readFileSync(path, "utf-8"); } catch { return null; }
}

function safeWrite(path: string, content: string): void {
  const dir = join(path, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, content, "utf-8");
}

// ── Index parsing/writing ──

/**
 * Parse _index.md into structured entries.
 * Format:
 *   ## entities/react.md
 *   **React** — A JavaScript library for building UIs. Tags: framework, javascript.
 *   Updated: 2026-04-05T12:00:00Z
 */
export function readIndex(): CortexIndexEntry[] {
  ensureCortexDir();
  const raw = safeRead(INDEX_PATH);
  if (!raw) return [];

  const entries: CortexIndexEntry[] = [];
  const blocks = raw.split(/\n(?=## )/).filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const pathMatch = lines[0]?.match(/^##\s+(.+\.md)$/);
    if (!pathMatch) continue;

    const path = pathMatch[1];
    const detailLine = lines[1] ?? "";
    const titleMatch = detailLine.match(/^\*\*(.+?)\*\*\s*—\s*(.+?)(?:\.\s*Tags:\s*(.+))?\.?$/);
    const title = titleMatch?.[1] ?? path.replace(/.*\//, "").replace(/\.md$/, "");
    const summary = titleMatch?.[2]?.trim() ?? detailLine;
    const tags = titleMatch?.[3]?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
    const updatedLine = lines.find((l) => l.startsWith("Updated:"));
    const updated = updatedLine?.replace("Updated:", "").trim() ?? new Date().toISOString();

    entries.push({ path, title, summary, tags, updated });
  }

  return entries;
}

function writeIndex(entries: CortexIndexEntry[]): void {
  ensureCortexDir();
  const lines = ["<!-- WIKI INDEX — machine-maintained, do not hand-edit -->\n"];
  for (const e of entries) {
    lines.push(`## ${e.path}`);
    const tagStr = e.tags.length > 0 ? `. Tags: ${e.tags.join(", ")}` : "";
    lines.push(`**${e.title}** — ${e.summary}${tagStr}.`);
    lines.push(`Updated: ${e.updated}\n`);
  }
  safeWrite(INDEX_PATH, lines.join("\n"));
}

// ── Log ──

function appendLog(operation: string, details: string): void {
  ensureCortexDir();
  const ts = new Date().toISOString();
  const entry = `- [${ts}] ${operation}: ${details}\n`;
  const existing = safeRead(LOG_PATH) ?? "# Wiki Log\n\n";
  safeWrite(LOG_PATH, existing + entry);
}

// ── Page I/O ──

function resolvePage(pagePath: string): string | null {
  // Normalize slashes
  const normalized = pagePath.replace(/\\/g, "/");
  const full = join(CORTEX_DIR, normalized);
  // Security: ensure within cortex dir
  if (!full.startsWith(CORTEX_DIR)) return null;
  return full;
}

export function readCortexPage(pagePath: string): string | null {
  const full = resolvePage(pagePath);
  if (!full) return null;
  return safeRead(full);
}

function writeCortexPage(pagePath: string, content: string): void {
  const full = resolvePage(pagePath);
  if (!full) throw new Error(`Invalid cortex path: ${pagePath}`);
  safeWrite(full, content);
}

// ── Search ──

function searchIndex(query: string, maxResults = 10): CortexIndexEntry[] {
  const entries = readIndex();
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (queryTerms.length === 0) return entries.slice(0, maxResults);

  const scored: Array<{ entry: CortexIndexEntry; score: number }> = [];

  for (const entry of entries) {
    const haystack = `${entry.title} ${entry.summary} ${entry.tags.join(" ")}`.toLowerCase();
    let score = 0;
    for (const term of queryTerms) {
      if (haystack.includes(term)) {
        score += 1;
        // Boost title matches
        if (entry.title.toLowerCase().includes(term)) score += 2;
        // Boost tag matches
        if (entry.tags.some((t) => t.toLowerCase().includes(term))) score += 1;
      }
    }
    if (score > 0) {
      scored.push({ entry, score: score / queryTerms.length });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map((s) => s.entry);
}

// ── List pages ──

function listAllPages(category?: string): CortexPageInfo[] {
  ensureCortexDir();
  const pages: CortexPageInfo[] = [];
  const dirs = category && SUBDIRS.includes(category as CortexCategory)
    ? [category]
    : [...SUBDIRS];

  for (const sub of dirs) {
    const dir = join(CORTEX_DIR, sub);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;
      const full = join(dir, file);
      try {
        const stat = statSync(full);
        const relPath = `${sub}/${file}`;
        // Extract title from first H1 or filename
        const content = safeRead(full);
        const titleMatch = content?.match(/^#\s+(.+)$/m);
        const title = titleMatch?.[1] ?? file.replace(/\.md$/, "");
        pages.push({
          path: relPath,
          title,
          sizeBytes: stat.size,
          modified: stat.mtime.toISOString(),
        });
      } catch { /* skip unreadable */ }
    }
  }

  pages.sort((a, b) => b.modified.localeCompare(a.modified));
  return pages;
}

// ── Lint ──

function lintCortex(): {
  orphanPages: string[];
  missingPages: string[];
  brokenLinks: Array<{ page: string; link: string }>;
  stalePages: string[];
  stats: { totalPages: number; totalIndexed: number; categories: Record<string, number> };
} {
  ensureCortexDir();
  const index = readIndex();
  const indexedPaths = new Set(index.map((e) => e.path));
  const allPages = listAllPages();
  const allPagePaths = new Set(allPages.map((p) => p.path));

  // Orphan pages: on disk but not in index
  const orphanPages = allPages
    .filter((p) => !indexedPaths.has(p.path))
    .map((p) => p.path);

  // Missing pages: in index but not on disk
  const missingPages = index
    .filter((e) => !allPagePaths.has(e.path))
    .map((e) => e.path);

  // Broken links: [[reference]] to non-existent pages
  const brokenLinks: Array<{ page: string; link: string }> = [];
  for (const page of allPages) {
    const content = readCortexPage(page.path);
    if (!content) continue;
    const linkMatches = content.matchAll(/\[\[([^\]]+)\]\]/g);
    for (const match of linkMatches) {
      const linkTarget = match[1].toLowerCase().replace(/\s+/g, "-");
      // Check if any page matches this link
      const found = allPages.some((p) => {
        const pageName = p.path.replace(/.*\//, "").replace(/\.md$/, "");
        return pageName === linkTarget;
      });
      if (!found) {
        brokenLinks.push({ page: page.path, link: match[1] });
      }
    }
  }

  // Stale pages: not updated in 30+ days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const stalePages = index
    .filter((e) => new Date(e.updated).getTime() < thirtyDaysAgo)
    .map((e) => e.path);

  const categories: Record<string, number> = {};
  for (const sub of SUBDIRS) categories[sub] = 0;
  for (const p of allPages) {
    const cat = p.path.split("/")[0];
    if (categories[cat] !== undefined) categories[cat]++;
  }

  return {
    orphanPages,
    missingPages,
    brokenLinks,
    stalePages,
    stats: {
      totalPages: allPages.length,
      totalIndexed: index.length,
      categories,
    },
  };
}

// ── LLM call ──

async function callCortexLLM(prompt: string, timeoutMs = 90_000): Promise<string> {
  return llm({ prompt, tier: "fast", timeoutMs });
}

// ─�� Ingest mutex ──

let _ingestBusy = false;

// ── Ingest Pipeline ──

const INGEST_PROMPT = `You are a wiki maintainer. Given source material and the current wiki index, produce structured JSON to create or update wiki pages.

RULES:
- Extract entities (people, technologies, companies, frameworks) → entities/ pages
- Extract concepts (patterns, theories, methodologies, techniques) → concepts/ pages
- Create a source summary in sources/ as an immutable reference
- If relationships between existing pages emerge, create synthesis/ pages
- Use [[entity-name]] wiki links between pages (lowercase, hyphens for spaces)
- Page filenames: lowercase, hyphens, .md extension (e.g., entities/react.md)
- Each page should have: # Title, a summary paragraph, then ## sections with bullet points
- If a page already exists in the index, MERGE new facts with existing content — do NOT overwrite
- Keep pages concise (under 1500 words)
- Only create pages for substantive topics — skip trivial mentions

RESPOND WITH VALID JSON ONLY (no markdown fences):
{
  "pages": [
    {
      "path": "entities/react.md",
      "title": "React",
      "content": "# React\\n\\nA JavaScript library for building user interfaces...\\n\\n## Key Concepts\\n\\n- Virtual DOM...\\n- Component-based architecture...\\n\\n## Related\\n\\n- [[javascript]]\\n- [[virtual-dom]]",
      "summary": "A JavaScript library for building user interfaces",
      "tags": ["framework", "javascript", "frontend"]
    }
  ],
  "logEntry": "Ingested article on React: created entities/react.md, updated concepts/virtual-dom.md"
}`;

async function runIngestPipeline(source: {
  text?: string;
  url?: string;
  topic?: string;
  sourceLabel?: string;
}): Promise<IngestResult> {
  if (_ingestBusy) throw new Error("Cortex ingest already in progress");
  _ingestBusy = true;

  try {
    ensureCortexDir();
    const index = readIndex();
    // Cap index summary to ~8K chars to leave room for source material in the prompt
    let indexSummary: string;
    if (index.length === 0) {
      indexSummary = "(empty cortex — no pages yet)";
    } else {
      const lines = index.map((e) => `- ${e.path}: ${e.title} — ${e.summary}`);
      indexSummary = lines.join("\n");
      if (indexSummary.length > 8000) {
        indexSummary = indexSummary.slice(0, 8000) + `\n... and ${index.length - lines.filter((_, i) => lines.slice(0, i + 1).join("\n").length <= 8000).length} more pages`;
      }
    }

    const sourceText = [
      source.topic ? `Topic: ${source.topic}` : "",
      source.url ? `URL: ${source.url}` : "",
      source.sourceLabel ? `Source: ${source.sourceLabel}` : "",
      source.text ?? "",
    ].filter(Boolean).join("\n\n");

    const prompt = `${INGEST_PROMPT}

CURRENT CORTEX INDEX (${index.length} pages):
${indexSummary}

SOURCE MATERIAL TO INGEST:
${sourceText.slice(0, 60_000)}`;

    logAction({ ts: Date.now(), type: "action", category: "cortex", message: `Ingest started: ${source.topic ?? source.sourceLabel ?? "text"}` });

    const raw = await callCortexLLM(prompt);

    // Parse JSON response — handle markdown fences if present
    const jsonStr = raw.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    let parsed: {
      pages: Array<{ path: string; title: string; content: string; summary: string; tags: string[] }>;
      logEntry: string;
    };
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      logError("cortex", "Failed to parse ingest LLM response", null, { raw: raw.slice(0, 500) });
      throw new Error("Cortex ingest: LLM returned invalid JSON");
    }

    if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) {
      return { pagesCreated: [], pagesUpdated: [], summary: "No pages extracted from source." };
    }

    const created: string[] = [];
    const updated: string[] = [];

    for (const page of parsed.pages) {
      if (!page.path || !page.content) continue;
      // Normalize path
      const path = page.path.replace(/\\/g, "/");
      const category = path.split("/")[0];
      if (!SUBDIRS.includes(category as CortexCategory)) continue;

      const existing = readCortexPage(path);
      if (existing) {
        // Merge: append new content if it adds new info
        const merged = mergePageContent(existing, page.content);
        writeCortexPage(path, merged);
        updated.push(path);
      } else {
        writeCortexPage(path, page.content);
        created.push(path);
      }

      // Update index entry
      const now = new Date().toISOString();
      const idx = index.findIndex((e) => e.path === path);
      if (idx >= 0) {
        index[idx] = { path, title: page.title, summary: page.summary, tags: page.tags ?? [], updated: now };
      } else {
        index.push({ path, title: page.title, summary: page.summary, tags: page.tags ?? [], updated: now });
      }
    }

    writeIndex(index);
    appendLog("INGEST", parsed.logEntry || `Created ${created.length}, updated ${updated.length} pages`);

    const summary = `Ingested: ${created.length} pages created (${created.join(", ") || "none"}), ${updated.length} updated (${updated.join(", ") || "none"})`;
    logAction({ ts: Date.now(), type: "action", category: "cortex", message: summary });

    return { pagesCreated: created, pagesUpdated: updated, summary };
  } finally {
    _ingestBusy = false;
  }
}

/**
 * Merge new content into an existing page.
 * Strategy: append new sections, skip duplicate headings.
 */
function mergePageContent(existing: string, incoming: string): string {
  const existingHeadings = new Set(
    [...existing.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim().toLowerCase()),
  );

  const incomingSections = incoming.split(/\n(?=## )/).filter((s) => s.trim());
  const newSections: string[] = [];

  for (const section of incomingSections) {
    const headingMatch = section.match(/^##\s+(.+)$/m);
    if (headingMatch && existingHeadings.has(headingMatch[1].trim().toLowerCase())) {
      // Extract just the bullet points from the incoming section
      const bullets = section.split("\n").filter((l) => l.startsWith("- ")).join("\n");
      if (bullets) {
        // Append bullets under the existing heading
        const heading = headingMatch[1].trim();
        const pattern = new RegExp(`(## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?)(?=\\n## |$)`, "i");
        const match = existing.match(pattern);
        if (match) {
          existing = existing.replace(pattern, `$1\n${bullets}\n`);
        }
      }
    } else if (!section.startsWith("# ")) {
      // New section — append
      newSections.push(section);
    }
  }

  if (newSections.length > 0) {
    existing = existing.trimEnd() + "\n\n" + newSections.join("\n\n") + "\n";
  }

  return existing;
}

// ── Public helpers ──

/**
 * Ingest from a completed research result (called from card-actions.ts).
 */
export async function ingestFromResearch(data: {
  topic: string;
  summary?: string;
  narrative?: string;
  keyFindings?: Array<{ text: string; type?: string }>;
  sections?: Array<{ title: string; summary?: string; bullets?: string[] }>;
  sources?: Array<{ url?: string; title?: string; snippet?: string }>;
}): Promise<IngestResult> {
  const parts: string[] = [];
  parts.push(`Topic: ${data.topic}`);
  if (data.summary) parts.push(`Summary: ${data.summary}`);
  if (data.narrative) parts.push(`Narrative: ${data.narrative}`);

  if (data.keyFindings?.length) {
    parts.push("\nKey Findings:");
    for (const f of data.keyFindings) {
      parts.push(`- [${f.type ?? "insight"}] ${f.text}`);
    }
  }

  if (data.sections?.length) {
    for (const s of data.sections) {
      parts.push(`\n### ${s.title}`);
      if (s.summary) parts.push(s.summary);
      if (s.bullets?.length) {
        for (const b of s.bullets) parts.push(`- ${b}`);
      }
    }
  }

  if (data.sources?.length) {
    parts.push("\nSources:");
    for (const src of data.sources.slice(0, 15)) {
      parts.push(`- ${src.title ?? src.url ?? "Unknown"}: ${src.snippet ?? ""}`);
    }
  }

  return runIngestPipeline({
    text: parts.join("\n"),
    topic: data.topic,
    sourceLabel: `Research: ${data.topic}`,
  });
}

/**
 * Ingest from user context data sources + YouTube.
 * Runs SEPARATE ingests per source so the LLM gives each one proper attention
 * instead of summarizing everything into a single blob.
 */
export async function ingestFromDataSources(): Promise<IngestResult> {
  const contextDir = join(homedir(), ".enso", "data", "user-context");

  // Read consent — only ingest consented sources
  let consent: Record<string, boolean> = {};
  try {
    const { readConsent } = await import("./user-context-tools.js");
    consent = readConsent() as unknown as Record<string, boolean>;
  } catch {
    const consentPath = join(contextDir, "consent.json");
    try {
      if (existsSync(consentPath)) consent = JSON.parse(readFileSync(consentPath, "utf-8"));
    } catch { /* no consent */ }
  }

  // Collect separate source blocks — each will be ingested individually
  const sources: Array<{ text: string; topic: string; label: string }> = [];

  // ── Registry-based sources (cache files) ──
  const sortedSources = [...DATA_SOURCES].sort((a, b) => (a.ingestPriority ?? 50) - (b.ingestPriority ?? 50));
  for (const ds of sortedSources) {
    if (!(consent as Record<string, boolean>)[ds.id]) continue;
    const cached = registryReadCache(ds.cacheFile);
    if (!cached) continue;
    const formatted = ds.formatForCortex(cached);
    if (formatted) sources.push(formatted);
  }

  // ── YouTube (live data via tool registry — not cache-based) ──
  try {
    const { executeLocalTool } = await import("./tool-registry-local.js");
    try {
      const subJson = await executeLocalTool("enso_youtube_subscriptions", {}) as { channels?: Array<{ title: string; description?: string }> };
      if (subJson?.channels?.length) {
        const lines = ["# YouTube Subscriptions\n", "Channels this user follows, revealing their interests and content preferences.\n"];
        for (const ch of subJson.channels.slice(0, 50)) {
          lines.push(`- **${ch.title}**: ${ch.description?.slice(0, 120) ?? "No description"}`);
        }
        sources.push({ text: lines.join("\n"), topic: "YouTube Subscriptions", label: "YouTube API subscriptions" });
      }
    } catch { /* YouTube subscriptions not available */ }
    try {
      const likedJson = await executeLocalTool("enso_youtube_liked_videos", {}) as { videos?: Array<{ title: string; channelTitle?: string; description?: string }> };
      if (likedJson?.videos?.length) {
        const lines = ["# YouTube Liked Videos\n", "Videos this user explicitly liked, indicating strong interest in these topics.\n"];
        for (const v of likedJson.videos.slice(0, 40)) {
          lines.push(`- **${v.title}** by ${v.channelTitle ?? "unknown"}: ${v.description?.slice(0, 100) ?? ""}`);
        }
        sources.push({ text: lines.join("\n"), topic: "YouTube Liked Videos", label: "YouTube API liked videos" });
      }
    } catch { /* YouTube liked videos not available */ }
    try {
      const feedJson = await executeLocalTool("enso_youtube_my_feed", {}) as { videos?: Array<{ title: string; channelTitle?: string }> };
      if (feedJson?.videos?.length) {
        const lines = ["# YouTube Recent Feed\n", "Recent videos in the user's feed, showing current interests and algorithm-recommended content.\n"];
        for (const v of feedJson.videos.slice(0, 30)) {
          lines.push(`- **${v.title}** by ${v.channelTitle ?? "unknown"}`);
        }
        sources.push({ text: lines.join("\n"), topic: "YouTube Feed", label: "YouTube API feed" });
      }
    } catch { /* YouTube feed not available */ }
  } catch { /* YouTube tools not available */ }

  if (sources.length === 0) {
    return { pagesCreated: [], pagesUpdated: [], summary: "No data sources available. Enable and scan data sources in Settings first." };
  }

  logAction({ ts: Date.now(), type: "action", category: "cortex", message: `Data source import started: ${sources.length} sources` });

  // Run separate ingests per source for better quality
  const allCreated: string[] = [];
  const allUpdated: string[] = [];
  const summaries: string[] = [];

  for (const source of sources) {
    try {
      const result = await runIngestPipeline({
        text: source.text,
        topic: source.topic,
        sourceLabel: source.label,
      });
      allCreated.push(...result.pagesCreated);
      allUpdated.push(...result.pagesUpdated);
      summaries.push(`${source.topic}: ${result.pagesCreated.length} created, ${result.pagesUpdated.length} updated`);
    } catch (err) {
      logError("cortex", `Data source ingest failed for ${source.topic}`, err);
      summaries.push(`${source.topic}: failed`);
    }
  }

  const summary = `Imported ${sources.length} data sources:\n${summaries.join("\n")}`;
  logAction({ ts: Date.now(), type: "action", category: "cortex", message: `Data source import complete: ${allCreated.length} created, ${allUpdated.length} updated` });

  return { pagesCreated: allCreated, pagesUpdated: allUpdated, summary };
}

/**
 * Ingest only specific data sources into the cortex (used by the auto-pipeline).
 */
export async function ingestChangedSources(sourceIds: string[]): Promise<{ pagesCreated: string[]; pagesUpdated: string[]; summary: string }> {
  const sources: Array<{ text: string; topic: string; label: string }> = [];

  for (const id of sourceIds) {
    const ds = DATA_SOURCES.find((d) => d.id === id);
    if (!ds) continue;
    const cached = registryReadCache(ds.cacheFile);
    if (!cached) continue;
    const formatted = ds.formatForCortex(cached);
    if (formatted) sources.push(formatted);
  }

  if (sources.length === 0) {
    return { pagesCreated: [], pagesUpdated: [], summary: "No data to ingest." };
  }

  const allCreated: string[] = [];
  const allUpdated: string[] = [];
  const summaries: string[] = [];

  for (const source of sources) {
    try {
      const result = await runIngestPipeline({
        text: source.text,
        topic: source.topic,
        sourceLabel: source.label,
      });
      allCreated.push(...result.pagesCreated);
      allUpdated.push(...result.pagesUpdated);
      summaries.push(`${source.topic}: ${result.pagesCreated.length} created, ${result.pagesUpdated.length} updated`);
    } catch (err) {
      logError("cortex", `Changed source ingest failed for ${source.topic}`, err);
      summaries.push(`${source.topic}: failed`);
    }
  }

  return { pagesCreated: allCreated, pagesUpdated: allUpdated, summary: summaries.join("\n") };
}

/**
 * Compact cortex context summary for injection into agent prompts.
 */
export function getCortexContextSummary(maxChars: number): string {
  ensureCortexDir();
  if (!existsSync(INDEX_PATH)) return "";
  const entries = readIndex();
  if (entries.length === 0) return "";

  const byCat: Record<string, number> = {};
  for (const sub of SUBDIRS) byCat[sub] = 0;
  for (const e of entries) {
    const cat = e.path.split("/")[0];
    if (byCat[cat] !== undefined) byCat[cat]++;
  }

  const recent = [...entries]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 10);

  const lines = recent.map((e) => `- ${e.title}: ${e.summary}`);
  const header = `Cortex: ${entries.length} pages (${byCat.entities ?? 0} entities, ${byCat.concepts ?? 0} concepts, ${byCat.sources ?? 0} sources, ${byCat.synthesis ?? 0} synthesis)`;

  let text = `<wiki_knowledge>\n${header}\nRecent:\n${lines.join("\n")}\n</wiki_knowledge>`;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars - 20) + "\n...</wiki_knowledge>";
  }
  return text;
}

// ── Agent Tools ──

export function createCortexTools(): EnsoAgentTool[] {
  return [
    // ── Search ──
    {
      name: "enso_wiki_search",
      label: "Wiki Search",
      description: "Search the knowledge wiki for pages matching a query. Returns matching page summaries from the wiki index. Use this first to discover relevant wiki knowledge before answering questions that might benefit from accumulated knowledge.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query — keywords or phrases to find in wiki pages" },
          maxResults: { type: "number", description: "Maximum results to return (default: 10)" },
        },
        required: ["query"],
        additionalProperties: false,
      },
      isPrimary: true,
      execute: async (_callId, params) => {
        const query = String(params.query ?? "");
        const max = Number(params.maxResults ?? 10);

        ensureCortexDir();
        const results = query.trim() ? searchIndex(query, max) : readIndex().slice(0, max);
        const stats = lintCortex().stats;

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tool: "enso_wiki_search",
              query,
              results: results.map((e) => ({
                path: e.path,
                title: e.title,
                summary: e.summary,
                tags: e.tags,
                updated: e.updated,
              })),
              totalPages: stats.totalPages,
              categories: stats.categories,
            }),
          }],
        };
      },
    },

    // ── Read ──
    {
      name: "enso_wiki_read",
      label: "Wiki Read",
      description: "Read a specific wiki page by path. Use after wiki_search to get the full content of a matched page.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Wiki page path (e.g. 'entities/react.md', 'concepts/dependency-injection.md')" },
        },
        required: ["path"],
        additionalProperties: false,
      },
      execute: async (_callId, params) => {
        const pagePath = String(params.path ?? "");
        const content = readCortexPage(pagePath);

        if (content === null) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ tool: "enso_wiki_read", path: pagePath, error: "Page not found" }),
            }],
          };
        }

        // Find backlinks — pages that reference this one
        const pageName = pagePath.replace(/.*\//, "").replace(/\.md$/, "");
        const allPages = listAllPages();
        const backlinks: string[] = [];
        for (const p of allPages) {
          if (p.path === pagePath) continue;
          const pContent = readCortexPage(p.path);
          if (pContent?.toLowerCase().includes(`[[${pageName}]]`)) {
            backlinks.push(p.path);
          }
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tool: "enso_wiki_read",
              path: pagePath,
              content,
              backlinks,
              sizeBytes: Buffer.byteLength(content, "utf-8"),
            }),
          }],
        };
      },
    },

    // ── Ingest ──
    {
      name: "enso_wiki_ingest",
      label: "Wiki Ingest",
      description: "Ingest new knowledge into the wiki. Provide text content, a URL, or a topic. The LLM analyzes the source and creates/updates entity pages, concept pages, and source summaries in the wiki. One ingest can touch many pages.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Source text content to ingest" },
          url: { type: "string", description: "Source URL (for reference tracking)" },
          topic: { type: "string", description: "Topic label for the source" },
          source_label: { type: "string", description: "Human-readable label for the source" },
        },
        required: [],
        additionalProperties: false,
      },
      execute: async (_callId, params) => {
        const text = params.text ? String(params.text) : undefined;
        const url = params.url ? String(params.url) : undefined;
        const topic = params.topic ? String(params.topic) : undefined;
        const sourceLabel = params.source_label ? String(params.source_label) : undefined;

        if (!text && !url && !topic) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ tool: "enso_wiki_ingest", error: "Provide at least one of: text, url, or topic" }),
            }],
          };
        }

        try {
          const result = await runIngestPipeline({ text, url, topic, sourceLabel });
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                tool: "enso_wiki_ingest",
                ...result,
              }),
            }],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logError("cortex", "Ingest failed", err);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ tool: "enso_wiki_ingest", error: msg }),
            }],
          };
        }
      },
    },

    // ── List ──
    {
      name: "enso_wiki_list",
      label: "Wiki List",
      description: "List all wiki pages, optionally filtered by category (entities, concepts, sources, synthesis). Returns page paths, titles, sizes, and modification dates.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by category: 'entities', 'concepts', 'sources', or 'synthesis'. Omit for all." },
        },
        required: [],
        additionalProperties: false,
      },
      execute: async (_callId, params) => {
        const category = params.category ? String(params.category) : undefined;
        const pages = listAllPages(category);
        const index = readIndex();

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tool: "enso_wiki_list",
              category: category ?? "all",
              pages: pages.map((p) => {
                const indexEntry = index.find((e) => e.path === p.path);
                return {
                  path: p.path,
                  title: p.title,
                  summary: indexEntry?.summary ?? "",
                  tags: indexEntry?.tags ?? [],
                  sizeBytes: p.sizeBytes,
                  modified: p.modified,
                };
              }),
              totalPages: pages.length,
            }),
          }],
        };
      },
    },

    // ── Lint ──
    {
      name: "enso_wiki_lint",
      label: "Wiki Health Check",
      description: "Run a health check on the wiki. Finds orphan pages (not in index), missing pages (in index but deleted), broken [[links]], and stale pages (30+ days without update). Use periodically to maintain wiki quality.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      execute: async (_callId, _params) => {
        const report = lintCortex();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              tool: "enso_wiki_lint",
              ...report,
              healthy: report.orphanPages.length === 0
                && report.missingPages.length === 0
                && report.brokenLinks.length === 0,
            }),
          }],
        };
      },
    },

    // ── Import Data Sources ──
    {
      name: "enso_wiki_import_sources",
      label: "Wiki Import Sources",
      description: "Import knowledge from user's data sources (browser history, bookmarks, email, files/projects, system info) into the wiki. Reads previously scanned data from Settings > Data Sources and creates entity/concept pages. Only imports consented sources.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      execute: async (_callId, _params) => {
        try {
          const result = await ingestFromDataSources();
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                tool: "enso_wiki_import_sources",
                ...result,
              }),
            }],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logError("cortex", "Data source import failed", err);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ tool: "enso_wiki_import_sources", error: msg }),
            }],
          };
        }
      },
    },
  ];
}
