/**
 * Cortex Synthesis Engine — LLM-native cross-source intelligence.
 *
 * The brain of the Cortex. LLM-first design: the LLM does the thinking,
 * keyword matching is just a fast pre-filter for gathering context.
 *
 * 1. findRelatedContent(topic) — Fast keyword pre-filter to gather candidates
 * 2. synthesize(topic) — LLM analyzes ALL sources to find semantic connections
 * 3. generateThematicMap() — Deep LLM synthesis of cross-cutting life themes
 *
 * Philosophy: LLMs are getting faster, cheaper, and smarter. Instead of building
 * complex keyword heuristics, send the data to the LLM and let it think.
 * The LLM understands that "evolutionary biology" relates to "genetics" and
 * "natural selection" even when those exact words don't appear.
 */

import { readCache, DATA_SOURCES } from "./data-source-registry.js";
import { readIndex, type CortexIndexEntry } from "./cortex-tools.js";
import { logAction, logError } from "./action-log.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CORTEX_DIR = join(homedir(), ".enso", "wiki");

// ── Types ──

export interface CrossReferenceHit {
  title: string;
  source: string;
  score: number;
  reason?: string;       // LLM-generated reason for relevance
  metadata?: Record<string, unknown>;
}

export interface CrossReferenceResult {
  topic: string;
  hits: CrossReferenceHit[];
  bySource: Record<string, CrossReferenceHit[]>;
  totalMatches: number;
  cortexPages: CortexIndexEntry[];
  synthesis?: string;
}

export interface SynthesisResult {
  topic: string;
  narrative: string;            // LLM-generated connecting narrative
  connections: Array<{          // Specific cross-source connections found
    items: string[];            // e.g. ["Kindle: Build an LLM", "Project: AlphaRank"]
    insight: string;            // Why they connect
  }>;
  relatedContent: CrossReferenceResult;
  suggestedActions?: string[];  // What the user could explore next
  themes?: string[];            // Which life themes this topic touches
}

// ── In-memory cache ──

const _cache = new Map<string, { result: unknown; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// ── Data Inventory Builder ──

/**
 * Build a compact inventory of ALL data sources for LLM context.
 * This is what the LLM "sees" when thinking about connections.
 */
function buildDataInventory(maxCharsPerSource = 2000): string {
  const sections: string[] = [];

  // Kindle books — titles + authors + categories
  const kindleCache = readCache("kindle-library.json") as { books?: Array<Record<string, unknown>> } | null;
  if (kindleCache?.books?.length) {
    const books = kindleCache.books.map((b: Record<string, unknown>) => {
      const cats = (b.categories as string[] || []).join(", ");
      return `"${b.title}" by ${b.author}${cats ? ` [${cats}]` : ""}`;
    }).join("\n");
    sections.push(`## Books (Kindle Library — ${kindleCache.books.length} books)\n${books.slice(0, maxCharsPerSource)}`);
  }

  // YouTube subscriptions
  const ytCache = readCache("youtube-data.json") as { subscriptions?: Array<Record<string, unknown>> } | null;
  if (ytCache?.subscriptions?.length) {
    const channels = ytCache.subscriptions.map((c: Record<string, unknown>) =>
      `${c.title}${c.description ? `: ${String(c.description).slice(0, 80)}` : ""}`
    ).join("\n");
    sections.push(`## YouTube (${ytCache.subscriptions.length} subscriptions)\n${channels.slice(0, maxCharsPerSource)}`);
  }

  // Movies & TV
  const movieCache = readCache("movies-tv.json") as { items?: Array<Record<string, unknown>> } | null;
  if (movieCache?.items?.length) {
    const items = movieCache.items.map((m: Record<string, unknown>) => {
      const genres = (m.genres as string[] || []).join(", ");
      return `"${m.title}"${m.year ? ` (${m.year})` : ""}${genres ? ` [${genres}]` : ""} — ${m.category}`;
    }).join("\n");
    sections.push(`## Movies & TV (${movieCache.items.length} items)\n${items.slice(0, maxCharsPerSource)}`);
  }

  // Steam games
  const steamCache = readCache("steam-games.json") as { games?: Array<Record<string, unknown>> } | null;
  if (steamCache?.games?.length) {
    const games = steamCache.games.map((g: Record<string, unknown>) => {
      const genres = (g.genres as string[] || []).join(", ");
      return `${g.name}${genres ? ` [${genres}]` : ""}${g.metacritic ? ` MC:${g.metacritic}` : ""}`;
    }).join("\n");
    sections.push(`## Steam Games (${steamCache.games.length})\n${games.slice(0, maxCharsPerSource)}`);
  }

  // Projects
  const fileCache = readCache("file-index.json") as { projects?: Array<Record<string, unknown>> } | null;
  if (fileCache?.projects?.length) {
    const projects = fileCache.projects.map((p: Record<string, unknown>) =>
      `${p.name} (${(p.technologies as string[] || []).join(", ")})`
    ).join("\n");
    sections.push(`## Software Projects (${fileCache.projects.length})\n${projects.slice(0, maxCharsPerSource)}`);
  }

  // Photo albums (just names — too many for full listing)
  const photoCache = readCache("photo-library.json") as { albums?: Array<Record<string, unknown>>; totalPhotos?: number } | null;
  if (photoCache?.albums?.length) {
    const topAlbums = photoCache.albums.slice(0, 30).map((a: Record<string, unknown>) =>
      `${a.name} (${a.photoCount} photos)`
    ).join(", ");
    sections.push(`## Photos (${photoCache.totalPhotos || 0} photos, ${photoCache.albums.length} albums)\nTop: ${topAlbums}`);
  }

  // QQ Music
  const qqCache = readCache("qq-music.json") as { favorites?: Array<Record<string, unknown>> } | null;
  if (qqCache?.favorites?.length) {
    const tracks = qqCache.favorites.map((t: Record<string, unknown>) => `"${t.title}" by ${t.artist}`).join(", ");
    sections.push(`## Music (${qqCache.favorites.length} favorites)\n${tracks.slice(0, maxCharsPerSource)}`);
  }

  // Browser bookmarks (folders + counts)
  const bmCache = readCache("bookmarks.json") as { folders?: Array<Record<string, unknown>>; totalBookmarks?: number } | null;
  if (bmCache?.folders?.length) {
    const folders = bmCache.folders.map((f: Record<string, unknown>) =>
      `${f.folder} (${f.count})`
    ).join(", ");
    sections.push(`## Bookmarks (${bmCache.totalBookmarks || 0})\nFolders: ${folders}`);
  }

  return sections.join("\n\n");
}

// ── Fast Pre-Filter (keyword-based, zero LLM) ──

/**
 * Quick keyword-based cross-reference. Used as pre-filter and for
 * real-time context injection where LLM latency isn't acceptable.
 */
export function findRelatedContent(topic: string, maxPerSource = 5): CrossReferenceResult {
  const cacheKey = `keyword:${topic}:${maxPerSource}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.result as CrossReferenceResult;

  const terms = tokenize(topic);
  if (terms.length === 0) return emptyResult(topic);

  const allHits: CrossReferenceHit[] = [];

  // Scan all data sources with keyword matching
  const sources: Array<{ cacheFile: string; source: string; extract: (item: Record<string, unknown>) => { title: string; fields: string[]; metadata: Record<string, unknown> } }> = [
    { cacheFile: "kindle-library.json", source: "kindle", extract: (b) => ({ title: String(b.title), fields: [String(b.title || ""), String(b.author || ""), ...(b.categories as string[] || []), String(b.description || "")], metadata: { author: b.author, categories: b.categories } }) },
    { cacheFile: "steam-games.json", source: "steam", extract: (g) => ({ title: String(g.name), fields: [String(g.name || ""), ...(g.genres as string[] || []), String(g.description || "")], metadata: { genres: g.genres, metacritic: g.metacritic } }) },
    { cacheFile: "movies-tv.json", source: "movies_tv", extract: (m) => ({ title: `${m.title}${m.year ? ` (${m.year})` : ""}`, fields: [String(m.title || ""), ...(m.genres as string[] || []), String(m.overview || ""), ...(m.cast as string[] || [])], metadata: { genres: m.genres, category: m.category, year: m.year } }) },
  ];

  for (const { cacheFile, source, extract } of sources) {
    const cache = readCache(cacheFile) as Record<string, unknown> | null;
    const items = (cache?.books || cache?.games || cache?.items || []) as Array<Record<string, unknown>>;
    for (const item of items) {
      const { title, fields, metadata } = extract(item);
      const score = matchScore(terms, fields);
      if (score > 0) allHits.push({ title, source, score, metadata });
    }
  }

  // YouTube
  const ytCache = readCache("youtube-data.json") as { subscriptions?: Array<Record<string, unknown>>; likedVideos?: Array<Record<string, unknown>> } | null;
  if (ytCache) {
    for (const ch of ytCache.subscriptions || []) {
      const score = matchScore(terms, [String(ch.title || ""), String(ch.description || "")]);
      if (score > 0) allHits.push({ title: String(ch.title), source: "youtube", score, metadata: { type: "channel" } });
    }
    for (const v of ytCache.likedVideos || []) {
      const score = matchScore(terms, [String(v.title || ""), String(v.channelTitle || "")]);
      if (score > 0) allHits.push({ title: String(v.title), source: "youtube", score, metadata: { type: "video" } });
    }
  }

  // Projects
  const fileCache = readCache("file-index.json") as { projects?: Array<Record<string, unknown>> } | null;
  for (const p of fileCache?.projects || []) {
    const score = matchScore(terms, [String(p.name || ""), ...(p.technologies as string[] || [])]);
    if (score > 0) allHits.push({ title: String(p.name), source: "project", score, metadata: { technologies: p.technologies } });
  }

  // Bookmarks
  const bmCache = readCache("bookmarks.json") as { folders?: Array<{ bookmarks: Array<Record<string, unknown>> }> } | null;
  for (const folder of bmCache?.folders || []) {
    for (const bm of folder.bookmarks || []) {
      const score = matchScore(terms, [String(bm.title || ""), String(bm.url || "")]);
      if (score > 0) allHits.push({ title: String(bm.title), source: "bookmark", score, metadata: { url: bm.url } });
    }
  }

  // Cortex pages
  const cortexPages = readIndex().filter(e => matchScore(terms, [e.title, e.summary, ...e.tags]) > 0).slice(0, 10);

  // Group by source, take top per source
  allHits.sort((a, b) => b.score - a.score);
  const bySource: Record<string, CrossReferenceHit[]> = {};
  for (const hit of allHits) {
    if (!bySource[hit.source]) bySource[hit.source] = [];
    if (bySource[hit.source].length < maxPerSource) bySource[hit.source].push(hit);
  }

  const result: CrossReferenceResult = {
    topic,
    hits: Object.values(bySource).flat().sort((a, b) => b.score - a.score),
    bySource,
    totalMatches: allHits.length,
    cortexPages,
  };

  _cache.set(cacheKey, { result, ts: Date.now() });
  return result;
}

// ── LLM-Powered Synthesis (the real brain) ──

/**
 * The primary intelligence function. Sends the topic + full data inventory
 * to the LLM, which semantically finds connections, generates insights,
 * and identifies cross-source patterns that keyword matching would miss.
 */
export async function synthesize(topic: string, opts?: { maxTokens?: number }): Promise<SynthesisResult> {
  const cacheKey = `synth:${topic}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.result as SynthesisResult;

  try {
    const { llm } = await import("./llm.js");

    // Build full data inventory for the LLM
    const inventory = buildDataInventory(3000);

    // Read user profile
    const profilePath = join(CORTEX_DIR, "synthesis", "user-profile.md");
    const profile = existsSync(profilePath) ? readFileSync(profilePath, "utf-8").slice(0, 800) : "";

    // Also get keyword pre-filter results for grounding
    const keywordResults = findRelatedContent(topic, 5);

    const prompt = `You are the intelligence engine for a personal knowledge system called the Cortex. Your job is to THINK deeply about how a topic connects to everything in this person's digital life.

## The Person
${profile || "No profile available"}

## Their Digital Life (all data sources)
${inventory}

## Topic to Analyze
"${topic}"

## Your Task
Analyze this topic against their ENTIRE digital life and produce a JSON response:

{
  "narrative": "A 3-5 sentence synthesis that connects this topic to their books, movies, projects, YouTube channels, etc. Be specific — name actual titles. Reveal connections they might not see. Explain WHY these things connect in their life, not just THAT they do.",
  "connections": [
    {
      "items": ["Source: Item Title", "Source: Item Title"],
      "insight": "Why these two things connect in a way the person might not realize"
    }
  ],
  "suggestedActions": ["Specific things they could do: read a book, watch a video, start a project, etc."],
  "themes": ["Which major life themes this topic touches: e.g., 'Systems Thinking', 'Visual Storytelling', 'Quantitative Intelligence'"],
  "relatedItems": [
    {"title": "Item name", "source": "kindle|youtube|movies_tv|steam|project|bookmark|music|photos", "reason": "Why it's semantically related (not just keyword match)"}
  ]
}

IMPORTANT: Find SEMANTIC connections, not just keyword matches. "Machine Learning for Asset Managers" connects to a stock ranking project not because they share words, but because they share PURPOSE. A documentary about human evolution connects to a genetics book not by title, but by intellectual curiosity about the same fundamental question.

Return ONLY valid JSON, no markdown fencing.`;

    const raw = await llm({
      prompt,
      tier: "fast",
      maxOutputTokens: opts?.maxTokens || 1500,
      timeoutMs: 30000,
      responseMimeType: "application/json",
    });

    if (!raw?.trim()) throw new Error("Empty LLM response");

    // Parse LLM response — extract JSON from possibly wrapped output
    let parsed: Record<string, unknown>;
    try {
      // Strip markdown code fences if present
      let cleaned = raw.trim();
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      // Find the first { and last } to extract JSON object
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
      parsed = JSON.parse(cleaned);
    } catch {
      // LLM didn't return valid JSON — use the raw text as narrative
      parsed = { narrative: raw.trim().slice(0, 500), connections: [], suggestedActions: [], themes: [], relatedItems: [] };
    }

    // Convert LLM's relatedItems to CrossReferenceHits
    const llmHits: CrossReferenceHit[] = ((parsed.relatedItems || []) as Array<{ title: string; source: string; reason: string }>).map(item => ({
      title: item.title,
      source: item.source || "unknown",
      score: 0.9, // LLM-identified = high relevance
      reason: item.reason,
    }));

    // Merge LLM hits with keyword hits (LLM takes priority)
    const mergedBySource: Record<string, CrossReferenceHit[]> = { ...keywordResults.bySource };
    for (const hit of llmHits) {
      if (!mergedBySource[hit.source]) mergedBySource[hit.source] = [];
      // Don't duplicate
      if (!mergedBySource[hit.source].some(h => h.title === hit.title)) {
        mergedBySource[hit.source].unshift(hit); // LLM hits first
      }
    }

    const result: SynthesisResult = {
      topic,
      narrative: String(parsed.narrative || ""),
      connections: (parsed.connections || []) as SynthesisResult["connections"],
      relatedContent: {
        topic,
        hits: [...llmHits, ...keywordResults.hits],
        bySource: mergedBySource,
        totalMatches: llmHits.length + keywordResults.totalMatches,
        cortexPages: keywordResults.cortexPages,
        synthesis: String(parsed.narrative || ""),
      },
      suggestedActions: (parsed.suggestedActions || []) as string[],
      themes: (parsed.themes || []) as string[],
    };

    _cache.set(cacheKey, { result, ts: Date.now() });
    logAction({ ts: Date.now(), type: "action", category: "cortex-synthesis", message: `Synthesized "${topic}": ${result.connections.length} connections, ${llmHits.length} semantic matches` });
    return result;
  } catch (err) {
    logError("cortex-synthesis", `Synthesis failed for "${topic}"`, err);
    // Fallback to keyword-only results
    const keyword = findRelatedContent(topic);
    return {
      topic,
      narrative: "",
      connections: [],
      relatedContent: keyword,
      suggestedActions: [],
      themes: [],
    };
  }
}

/**
 * Format synthesis result as markdown for display or injection.
 */
export function formatSynthesis(result: SynthesisResult): string {
  const parts: string[] = [];

  if (result.narrative) {
    parts.push(`🧠 **Synthesis**: ${result.narrative}`);
  }

  if (result.connections.length > 0) {
    parts.push("\n**Connections:**");
    for (const conn of result.connections.slice(0, 3)) {
      parts.push(`- ${conn.items.join(" ↔ ")}: ${conn.insight}`);
    }
  }

  const sourceLabels: Record<string, string> = {
    kindle: "📚", youtube: "📺", movies_tv: "🎬", steam: "🎮",
    photos: "📷", project: "💻", bookmark: "🔖", music: "🎵", twitter: "🐦",
  };

  const sourceCounts = Object.entries(result.relatedContent.bySource)
    .filter(([, hits]) => hits.length > 0)
    .map(([src, hits]) => `${sourceLabels[src] || "📄"} ${hits.length}`);
  if (sourceCounts.length > 0) {
    parts.push(`\n**Across**: ${sourceCounts.join("  ")}`);
  }

  if (result.suggestedActions?.length) {
    parts.push("\n**Try**: " + result.suggestedActions.slice(0, 2).join(" · "));
  }

  return parts.join("\n");
}

/**
 * Quick format for cross-reference only (no synthesis).
 */
export function formatCrossReference(result: CrossReferenceResult): string {
  if (result.totalMatches === 0 && result.cortexPages.length === 0) return "";

  const sections: string[] = [];
  const sourceLabels: Record<string, string> = {
    kindle: "📚 Books", youtube: "📺 YouTube", movies_tv: "🎬 Movies & TV",
    steam: "🎮 Games", photos: "📷 Photos", project: "💻 Projects",
    bookmark: "🔖 Bookmarks", music: "🎵 Music", twitter: "🐦 Twitter",
  };

  for (const [source, hits] of Object.entries(result.bySource)) {
    if (hits.length === 0) continue;
    const label = sourceLabels[source] || source;
    const items = hits.slice(0, 3).map(h => h.reason ? `${h.title} — ${h.reason}` : h.title).join(", ");
    sections.push(`${label}: ${items}${hits.length > 3 ? ` (+${hits.length - 3} more)` : ""}`);
  }

  if (result.cortexPages.length > 0) {
    const pages = result.cortexPages.slice(0, 3).map(p => p.title).join(", ");
    sections.push(`🧠 Cortex: ${pages}${result.cortexPages.length > 3 ? ` (+${result.cortexPages.length - 3} more)` : ""}`);
  }

  return sections.length > 0
    ? `**From Your Brain** (${result.totalMatches} matches across ${Object.keys(result.bySource).length} sources):\n${sections.join("\n")}`
    : "";
}

// ── Thematic Map: Deep Cross-Source Synthesis ──

/**
 * Generate a thematic map — the Cortex's self-understanding of how all
 * knowledge connects across sources. Creates synthesis/thematic-map.md.
 */
export async function generateThematicMap(): Promise<string> {
  try {
    const { llm } = await import("./llm.js");

    const inventory = buildDataInventory(4000);

    const profilePath = join(CORTEX_DIR, "synthesis", "user-profile.md");
    const profile = existsSync(profilePath) ? readFileSync(profilePath, "utf-8").slice(0, 1000) : "";

    const entries = readIndex();
    const tagCounts: Record<string, number> = {};
    for (const e of entries) {
      for (const tag of e.tags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([t, c]) => `${t} (${c})`).join(", ");

    const prompt = `You are the meta-cognition engine for a personal knowledge system. This person has ${entries.length} pages in their Cortex spanning books, movies, games, photos, YouTube channels, software projects, music, and more.

Their profile:
${profile}

Their complete data inventory:
${inventory}

Top knowledge tags: ${topTags}

Generate a THEMATIC MAP — identify 5-8 major life themes that SPAN MULTIPLE data sources. For each theme:

1. **Theme name** — a compelling 2-4 word label
2. **Essence** — one sentence capturing WHY this theme matters to this person
3. **Sources** — which data sources contribute (name specific items from each)
4. **Key connections** — 2-3 specific cross-source connections (e.g., "Book X echoes the same patterns as Project Y")
5. **Growth direction** — where this theme is heading based on recent activity

End with a **Meta-Pattern** section: 1-2 overarching patterns that connect multiple themes. This is the deepest insight — what drives this person at their core?

Be deeply insightful. Reference specific titles. Reveal connections they wouldn't see themselves.`;

    const thematicMap = await llm({ prompt, tier: "utility", maxOutputTokens: 2000, timeoutMs: 60000 });
    if (!thematicMap?.trim()) return "";

    const content = `# Thematic Map\n\nAuto-generated synthesis of cross-source knowledge themes.\nLast updated: ${new Date().toISOString()}\n\n${thematicMap.trim()}`;

    const mapPath = join(CORTEX_DIR, "synthesis", "thematic-map.md");
    mkdirSync(join(CORTEX_DIR, "synthesis"), { recursive: true });
    writeFileSync(mapPath, content, "utf-8");

    logAction({ ts: Date.now(), type: "action", category: "cortex-synthesis", message: `Thematic map generated (${content.length} chars)` });
    return content;
  } catch (err) {
    logError("cortex-synthesis", "Thematic map generation failed", err);
    return "";
  }
}

// ── Helpers ──

function tokenize(text: string): string[] {
  const STOPWORDS = new Set(["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "is", "it", "as", "be", "was", "are", "been", "has", "had", "do", "did", "will", "can", "may", "not", "no", "so", "if", "my", "your", "this", "that"]);
  const words = text.toLowerCase().split(/[\s,;:!?.()\[\]{}'"]+/).filter(w => w.length > 1 && !STOPWORDS.has(w));
  const phrase = text.toLowerCase().trim();
  if (phrase.includes(" ") && phrase.length > 3) return [phrase, ...words];
  return words;
}

function matchScore(terms: string[], fields: string[]): number {
  const haystack = fields.join(" ").toLowerCase();
  if (!haystack) return 0;
  let score = 0;
  const titleField = fields[0]?.toLowerCase() || "";
  for (const term of terms) {
    if (!term) continue;
    if (term.includes(" ") && titleField.includes(term)) score += 1.0;
    else if (term.includes(" ") && haystack.includes(term)) score += 0.5;
    else if (!term.includes(" ")) {
      if (titleField.includes(term)) score += 0.7;
      else if (haystack.includes(term)) score += 0.3;
    }
  }
  return score > 0.2 ? Math.min(score, 1.0) : 0;
}

function emptyResult(topic: string): CrossReferenceResult {
  return { topic, hits: [], bySource: {}, totalMatches: 0, cortexPages: [] };
}

// ── Export inventory builder for other modules ──
export { buildDataInventory };
