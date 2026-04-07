/**
 * Cortex Synthesis Engine — Cross-source intelligence and knowledge synthesis.
 *
 * The brain of the Cortex. Connects isolated data source entities into
 * coherent understanding through:
 *
 * 1. findRelatedContent(topic) — Fast cross-reference across all 12 data sources
 * 2. synthesizeInsight(topic, related) — LLM-powered narrative connecting the dots
 * 3. generateThematicMap() — Deep synthesis identifying cross-cutting life themes
 *
 * Philosophy: A brain doesn't store memories in silos — it synthesizes them,
 * forming meaning by weaving disparate information into coherent understanding.
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
  source: string;      // "kindle", "youtube", "movies_tv", etc.
  slug?: string;        // wiki page slug if exists
  wikiPath?: string;    // full wiki path
  score: number;        // relevance score 0-1
  metadata?: Record<string, unknown>; // extra fields (author, genre, year, etc.)
}

export interface CrossReferenceResult {
  topic: string;
  hits: CrossReferenceHit[];
  bySource: Record<string, CrossReferenceHit[]>;
  totalMatches: number;
  cortexPages: CortexIndexEntry[];
  synthesizedAt?: number;
  synthesis?: string;    // LLM-generated narrative (populated by synthesizeInsight)
}

// ── In-memory cache ──

const _cache = new Map<string, { result: CrossReferenceResult; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── Core: Cross-Reference Engine ──

/**
 * Search ALL data sources for content related to a topic.
 * Zero LLM cost — pure keyword matching against cached JSON files.
 */
export function findRelatedContent(topic: string, maxPerSource = 5): CrossReferenceResult {
  // Check cache
  const cacheKey = `${topic}:${maxPerSource}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.result;

  const terms = tokenize(topic);
  if (terms.length === 0) return emptyResult(topic);

  const allHits: CrossReferenceHit[] = [];

  // 1. Kindle books
  const kindleCache = readCache("kindle-library.json") as { books?: Array<Record<string, unknown>> } | null;
  if (kindleCache?.books) {
    for (const b of kindleCache.books) {
      const score = matchScore(terms, [
        String(b.title || ""),
        String(b.author || ""),
        ...(b.categories as string[] || []),
        String(b.description || ""),
      ]);
      if (score > 0) {
        allHits.push({
          title: String(b.title),
          source: "kindle",
          score,
          metadata: { author: b.author, categories: b.categories, rating: b.rating },
        });
      }
    }
  }

  // 2. YouTube subscriptions + liked videos
  const ytCache = readCache("youtube-data.json") as { subscriptions?: Array<Record<string, unknown>>; likedVideos?: Array<Record<string, unknown>>; feed?: Array<Record<string, unknown>> } | null;
  if (ytCache) {
    for (const ch of ytCache.subscriptions || []) {
      const score = matchScore(terms, [String(ch.title || ""), String(ch.description || "")]);
      if (score > 0) allHits.push({ title: String(ch.title), source: "youtube", score, metadata: { type: "channel" } });
    }
    for (const v of ytCache.likedVideos || []) {
      const score = matchScore(terms, [String(v.title || ""), String(v.channelTitle || "")]);
      if (score > 0) allHits.push({ title: String(v.title), source: "youtube", score, metadata: { type: "video", channel: v.channelTitle } });
    }
  }

  // 3. Movies & TV
  const movieCache = readCache("movies-tv.json") as { items?: Array<Record<string, unknown>> } | null;
  if (movieCache?.items) {
    for (const m of movieCache.items) {
      const score = matchScore(terms, [
        String(m.title || ""),
        ...(m.genres as string[] || []),
        String(m.overview || ""),
        ...(m.cast as string[] || []),
        ...(m.directors as string[] || []),
      ]);
      if (score > 0) {
        allHits.push({
          title: `${m.title}${m.year ? ` (${m.year})` : ""}`,
          source: "movies_tv",
          score,
          metadata: { category: m.category, genres: m.genres, rating: m.rating, year: m.year },
        });
      }
    }
  }

  // 4. Steam games
  const steamCache = readCache("steam-games.json") as { games?: Array<Record<string, unknown>> } | null;
  if (steamCache?.games) {
    for (const g of steamCache.games) {
      const score = matchScore(terms, [
        String(g.name || ""),
        ...(g.genres as string[] || []),
        String(g.description || ""),
      ]);
      if (score > 0) {
        allHits.push({
          title: String(g.name),
          source: "steam",
          score,
          metadata: { genres: g.genres, metacritic: g.metacritic },
        });
      }
    }
  }

  // 5. Photo albums
  const photoCache = readCache("photo-library.json") as { albums?: Array<Record<string, unknown>> } | null;
  if (photoCache?.albums) {
    for (const a of photoCache.albums) {
      const score = matchScore(terms, [String(a.name || ""), String(a.parentPath || "")]);
      if (score > 0) {
        allHits.push({
          title: String(a.name),
          source: "photos",
          score,
          metadata: { photoCount: a.photoCount, path: a.path },
        });
      }
    }
  }

  // 6. Projects
  const fileCache = readCache("file-index.json") as { projects?: Array<Record<string, unknown>> } | null;
  if (fileCache?.projects) {
    for (const p of fileCache.projects) {
      const score = matchScore(terms, [
        String(p.name || ""),
        ...(p.technologies as string[] || []),
      ]);
      if (score > 0) {
        allHits.push({
          title: String(p.name),
          source: "project",
          score,
          metadata: { technologies: p.technologies, path: p.path },
        });
      }
    }
  }

  // 7. Browser bookmarks
  const bmCache = readCache("bookmarks.json") as { folders?: Array<{ bookmarks: Array<Record<string, unknown>> }> } | null;
  if (bmCache?.folders) {
    for (const folder of bmCache.folders) {
      for (const bm of folder.bookmarks || []) {
        const score = matchScore(terms, [String(bm.title || ""), String(bm.url || "")]);
        if (score > 0) {
          allHits.push({
            title: String(bm.title),
            source: "bookmark",
            score,
            metadata: { url: bm.url },
          });
        }
      }
    }
  }

  // 8. QQ Music
  const qqCache = readCache("qq-music.json") as { favorites?: Array<Record<string, unknown>>; localFiles?: Array<Record<string, unknown>> } | null;
  if (qqCache) {
    for (const t of [...(qqCache.favorites || []), ...(qqCache.localFiles || [])]) {
      const score = matchScore(terms, [String(t.title || ""), String(t.artist || ""), String(t.album || "")]);
      if (score > 0) {
        allHits.push({ title: `${t.title} by ${t.artist}`, source: "qq_music", score, metadata: { artist: t.artist } });
      }
    }
  }

  // 9. Twitter following
  const twCache = readCache("twitter-following.json") as { accounts?: Array<Record<string, unknown>> } | null;
  if (twCache?.accounts) {
    for (const a of twCache.accounts) {
      const score = matchScore(terms, [String(a.displayName || ""), String(a.handle || ""), String(a.bio || "")]);
      if (score > 0) {
        allHits.push({ title: `@${a.handle} (${a.displayName})`, source: "twitter", score, metadata: { bio: a.bio } });
      }
    }
  }

  // 10. Cortex wiki pages (search index)
  const cortexEntries = readIndex();
  const cortexPages: CortexIndexEntry[] = [];
  for (const e of cortexEntries) {
    const score = matchScore(terms, [e.title, e.summary, ...e.tags]);
    if (score > 0) cortexPages.push(e);
  }

  // Sort all hits by score, take top per source
  allHits.sort((a, b) => b.score - a.score);

  const bySource: Record<string, CrossReferenceHit[]> = {};
  for (const hit of allHits) {
    if (!bySource[hit.source]) bySource[hit.source] = [];
    if (bySource[hit.source].length < maxPerSource) {
      bySource[hit.source].push(hit);
    }
  }

  const topHits = Object.values(bySource).flat().sort((a, b) => b.score - a.score);

  const result: CrossReferenceResult = {
    topic,
    hits: topHits,
    bySource,
    totalMatches: allHits.length,
    cortexPages: cortexPages.slice(0, 10),
  };

  _cache.set(cacheKey, { result, ts: Date.now() });
  return result;
}

/**
 * Format cross-reference results as markdown for injection into responses.
 */
export function formatCrossReference(result: CrossReferenceResult): string {
  if (result.totalMatches === 0 && result.cortexPages.length === 0) return "";

  const sections: string[] = [];

  const sourceLabels: Record<string, string> = {
    kindle: "📚 Books", youtube: "📺 YouTube", movies_tv: "🎬 Movies & TV",
    steam: "🎮 Games", photos: "📷 Photos", project: "💻 Projects",
    bookmark: "🔖 Bookmarks", qq_music: "🎵 Music", twitter: "🐦 Twitter",
  };

  for (const [source, hits] of Object.entries(result.bySource)) {
    if (hits.length === 0) continue;
    const label = sourceLabels[source] || source;
    const items = hits.slice(0, 3).map(h => h.title).join(", ");
    sections.push(`${label}: ${items}${hits.length > 3 ? ` (+${hits.length - 3} more)` : ""}`);
  }

  if (result.cortexPages.length > 0) {
    const pages = result.cortexPages.slice(0, 3).map(p => p.title).join(", ");
    sections.push(`🧠 Cortex: ${pages}${result.cortexPages.length > 3 ? ` (+${result.cortexPages.length - 3} more)` : ""}`);
  }

  if (sections.length === 0) return "";
  return `**From Your Brain** (${result.totalMatches} matches across ${Object.keys(result.bySource).length} sources):\n${sections.join("\n")}`;
}

// ── Synthesis: LLM-Powered Narrative ──

/**
 * Generate a synthesized narrative connecting cross-referenced content.
 * Uses LLM to create meaning from connections, not just list matches.
 */
export async function synthesizeInsight(
  topic: string,
  related: CrossReferenceResult,
  userProfile?: string,
): Promise<string> {
  if (related.totalMatches < 2) return ""; // Need at least 2 matches for synthesis

  try {
    const { llm } = await import("./llm.js");

    // Build context for synthesis
    const sourceItems: string[] = [];
    for (const [source, hits] of Object.entries(related.bySource)) {
      for (const h of hits.slice(0, 3)) {
        const meta = h.metadata ? ` (${Object.entries(h.metadata).filter(([, v]) => v).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("; ")})` : "";
        sourceItems.push(`[${source}] ${h.title}${meta}`);
      }
    }
    for (const p of related.cortexPages.slice(0, 3)) {
      sourceItems.push(`[cortex] ${p.title}: ${p.summary}`);
    }

    const prompt = `You are the synthesis engine for a personal knowledge system. Given a topic and related items from different parts of someone's life (books, movies, games, projects, YouTube channels, photos, music), generate a 2-4 sentence insight that:

1. Identifies the DEEPER CONNECTION between these items — not just "they're about the same topic" but WHY this person gravitates to this theme
2. Connects across source types (e.g., how a book relates to a project, how a movie echoes a research interest)
3. Reveals a pattern about the person's thinking or interests that they might not see themselves

Topic: "${topic}"
${userProfile ? `\nUser profile: ${userProfile.slice(0, 500)}` : ""}

Related items from their digital life:
${sourceItems.join("\n")}

Write the synthesis as a single cohesive paragraph. Be specific — reference actual titles. Be insightful — go beyond surface-level connections.`;

    const synthesis = await llm(prompt, { tier: "fast", maxTokens: 300 });
    return synthesis?.trim() || "";
  } catch (err) {
    logError("cortex-synthesis", "Synthesis failed", err);
    return "";
  }
}

// ── Thematic Map: Deep Cross-Source Synthesis ──

/**
 * Generate a thematic map of the entire Cortex — identifying major life themes
 * that span multiple data sources and how they interconnect.
 * Creates/updates synthesis/thematic-map.md in the wiki.
 */
export async function generateThematicMap(): Promise<string> {
  try {
    const { llm } = await import("./llm.js");

    // Gather summaries from all data sources
    const sourceSummaries: string[] = [];
    for (const ds of DATA_SOURCES) {
      const cached = readCache(ds.cacheFile);
      if (!cached) continue;
      const profile = ds.formatForProfile(cached);
      if (profile) sourceSummaries.push(profile);
    }

    // Read user profile
    const profilePath = join(CORTEX_DIR, "synthesis", "user-profile.md");
    const profile = existsSync(profilePath) ? readFileSync(profilePath, "utf-8").slice(0, 1000) : "";

    // Read Cortex index for themes
    const entries = readIndex();
    const tagCounts: Record<string, number> = {};
    for (const e of entries) {
      for (const tag of e.tags) tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([t, c]) => `${t} (${c})`).join(", ");

    const prompt = `You are the meta-synthesis engine for a personal knowledge system. This person has ${entries.length} pages in their knowledge base spanning books, movies, games, photos, YouTube channels, software projects, music, and more.

Their profile:
${profile}

Data across their digital life:
${sourceSummaries.join("\n\n")}

Top knowledge tags: ${topTags}

Generate a THEMATIC MAP — identify 5-8 major life themes that SPAN MULTIPLE data sources. For each theme:

1. **Theme name** — a compelling 2-4 word label
2. **Essence** — one sentence capturing WHY this theme matters to this person
3. **Sources** — which data sources contribute (books, movies, projects, YouTube, etc.)
4. **Key connections** — 2-3 specific items that bridge different sources
5. **Growth direction** — where this theme is heading based on recent activity

Format as markdown with ## headers per theme. End with a "Meta-Pattern" section identifying 1-2 overarching patterns that connect multiple themes together.

Be deeply insightful. Reference specific items. Reveal connections they might not see themselves.`;

    const thematicMap = await llm(prompt, { tier: "utility", maxTokens: 1500, timeout: 60000 });
    if (!thematicMap?.trim()) return "";

    // Write to Cortex
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
  // Also keep multi-word phrases (the full topic)
  const phrase = text.toLowerCase().trim();
  if (phrase.includes(" ") && phrase.length > 3) {
    return [phrase, ...words];
  }
  return words;
}

function matchScore(terms: string[], fields: string[]): number {
  const haystack = fields.join(" ").toLowerCase();
  if (!haystack) return 0;

  let score = 0;
  const titleField = fields[0]?.toLowerCase() || "";

  for (const term of terms) {
    if (!term) continue;

    // Full phrase match in title is highest value
    if (term.includes(" ") && titleField.includes(term)) {
      score += 1.0;
    } else if (term.includes(" ") && haystack.includes(term)) {
      score += 0.5;
    } else if (!term.includes(" ")) {
      // Single word matching
      if (titleField.includes(term)) score += 0.7;
      else if (haystack.includes(term)) score += 0.3;
    }
  }

  // Normalize: require at least a meaningful match
  return score > 0.2 ? Math.min(score, 1.0) : 0;
}

function emptyResult(topic: string): CrossReferenceResult {
  return { topic, hits: [], bySource: {}, totalMatches: 0, cortexPages: [] };
}
