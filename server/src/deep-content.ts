/**
 * deep-content.ts — Universal Deep Content Pipeline for any entity type.
 *
 * Deeply researches entities (books, games, movies, channels, projects, etc.)
 * via web search, generates long-form podcast scripts (5-30+ min), renders
 * multi-speaker audio via Gemini TTS, and caches results.
 *
 * Supports any entity type through ENTITY_PROFILES with per-type search
 * queries and synthesis hints. Accepts input from cards, entities, or
 * orchestration results via extractDeepContentSource().
 *
 * Three entry points:
 *   1. Single entity: onAction("book_podcast", { entityId }) from entity detail
 *   2. Batch: onAction("book_batch_process", { entityIds }) from collection view
 *   3. Scheduled: weekly recommendation task
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readdirSync } from "node:fs";
import { logAction, logError } from "./action-log.js";
import { llm } from "./llm.js";
import { renderPodcastAudio, pcmToWav } from "./podcast.js";
import { resolveEntity, lookupEntity, getEntityIndex, type EntityId } from "./entity-model.js";
import { braveWebSearch, fetchPageContent } from "./researcher-tools.js";
import { registerPage, type PageConfig, type PageSection } from "./shareable-pages.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EntityResearchResult {
  chapterSummaries: Array<{ chapter: string; summary: string }>;
  coreThesis: string;
  keyThemes: string[];
  keyInsights: Array<{ insight: string; example?: string }>;
  criticalPerspectives: string[];
  authorBackground: string;
  userConnections: string[];
  sources: Array<{ url: string; title: string }>;
  estimatedDepth: "light" | "moderate" | "rich";
}

export interface PodcastOutline {
  estimatedMinutes: number;
  sections: Array<{
    id: string;
    title: string;
    purpose: string;
    targetCharCount: number;
    keyPoints: string[];
  }>;
}

/** Which podcast style this processed content represents. */
export type DeepContentVariant = "discussion" | "interview";

export interface ProcessedContent {
  entityId: string;
  title: string;
  author: string;
  contentType: string;
  entityType?: string;
  processedAt: string;
  research: EntityResearchResult;
  /** Discussion variant only. Interview variant stores questions instead. */
  outline?: PodcastOutline;
  /** Interview variant only — the question list used to generate the dialogue. */
  interviewQuestions?: Array<{ question: string; probes: string; rationale: string }>;
  script: string;
  audioUrl: string;
  audioSizeBytes: number;
  durationMinutes: number;
  /** Defaults to "discussion" for backwards compatibility with older cache files. */
  variant?: DeepContentVariant;
}

export type DeepContentPhase =
  | "researching" | "generating_outline" | "writing_section"
  | "rendering_audio" | "stitching" | "complete" | "error";

export interface DeepContentProgress {
  phase: DeepContentPhase;
  detail?: string;
  sectionIndex?: number;
  totalSections?: number;
  percentComplete?: number;
}

/** Input for the deep content pipeline — extracted from any card or entity */
export interface DeepContentSource {
  sourceId: string;          // entityId or cardId
  title: string;
  contentType: "entity" | "research" | "orchestration" | "text";
  sections?: Array<{ title: string; content: string; bullets?: string[] }>;
  findings?: Array<{ text: string; type?: string; confidence?: string; example?: string }>;
  narrative?: string;
  summary?: string;
  keyPoints?: string[];
  contradictions?: string[];
  sources?: Array<{ url: string; title: string }>;
  entityId?: string;
  entityType?: string;
  metadata?: Record<string, unknown>;
  cortexContent?: string;
}

/** Per-entity-type web research configuration */
interface EntityProfile {
  searchQueries: (title: string, metadata: Record<string, unknown>) => string[];
  synthesisHint: string;
}

const ENTITY_PROFILES: Record<string, EntityProfile> = {
  book: {
    searchQueries: (title, meta) => [
      `"${title}" by ${meta.author || ""} chapter summary`,
      `"${title}" key themes main arguments insights`,
      `"${title}" book review analysis in-depth`,
      `"${title}" chapter by chapter breakdown`,
      `"${title}" criticism counterarguments perspectives`,
      `"${title}" book summary key takeaways actionable`,
      `site:goodreads.com "${title}" review`,
      ...(meta.categories?.[0] ? [`"${title}" ${meta.categories[0]} implications`] : []),
    ],
    synthesisHint: "book analysis expert creating chapter summaries, core thesis, key insights with examples",
  },
  game: {
    searchQueries: (title, meta) => [
      `"${title}" game review analysis gameplay`,
      `"${title}" ${(meta.genres as string[])?.[0] || ""} game mechanics`,
      `"${title}" ${meta.developer || ""} game design philosophy`,
      `"${title}" metacritic community discussion`,
      `"${title}" story narrative analysis`,
      `"${title}" game retrospective`,
      `"${title}" game design analysis GDC`,
    ],
    synthesisHint: "game critic analyzing gameplay mechanics, story, art direction, technical performance, and player reception",
  },
  movie: {
    searchQueries: (title, meta) => [
      `"${title}" ${meta.year || ""} film review analysis`,
      `"${title}" plot themes cinematography`,
      `"${title}" cast performances review`,
      `"${title}" ${meta.director || ""} director vision`,
      `"${title}" cultural impact significance`,
      `"${title}" film analysis essay`,
      `site:letterboxd.com "${title}" review`,
    ],
    synthesisHint: "film critic analyzing plot, performances, themes, cinematography, and cultural significance",
  },
  "tv-series": {
    searchQueries: (title, meta) => [
      `"${title}" tv series review analysis`,
      `"${title}" season breakdown best episodes`,
      `"${title}" cast character development`,
      `"${title}" themes storytelling`,
      `"${title}" critical reception audience response`,
      `"${title}" tv series deep dive essay`,
    ],
    synthesisHint: "TV critic analyzing story arcs, character development, production quality, and cultural impact",
  },
  channel: {
    searchQueries: (title, meta) => [
      `"${title}" youtube channel content analysis`,
      `"${title}" youtube best videos recommendations`,
      `${meta.category || ""} youtube content creators strategy`,
      `"${title}" subscriber community engagement`,
      `"${title}" youtube channel why popular`,
    ],
    synthesisHint: "YouTube content analyst examining content strategy, audience engagement, production quality, and growth",
  },
  project: {
    searchQueries: (title, meta) => [
      `"${title}" project architecture documentation`,
      `"${title}" ${(meta.technologies as string[])?.[0] || ""} analysis`,
      `"${title}" github alternatives comparison`,
      `"${title}" tutorial getting started`,
      `"${title}" open source retrospective lessons`,
    ],
    synthesisHint: "software architect analyzing architecture, code quality, ecosystem positioning, and developer experience",
  },
  article: {
    searchQueries: (title, meta) => [
      `"${title}" ${meta.author || ""} article`,
      `"${title}" analysis key points`,
      `"${title}" implications discussion`,
      `${meta.author || ""} related articles insights`,
      `"${title}" response critique rebuttal`,
    ],
    synthesisHint: "senior journalist dissecting the article's arguments, evidence quality, broader implications, and what readers should take away",
  },
  place: {
    searchQueries: (title) => [
      `${title} travel guide best things to do`,
      `${title} hidden gems local favorites tips`,
      `${title} history culture significance`,
      `${title} photography spots best views`,
      `${title} food cuisine restaurants must try`,
      `${title} practical travel tips transportation accommodation`,
      `site:lonelyplanet.com ${title}`,
      `${title} local perspective insider guide`,
    ],
    synthesisHint: "experienced travel writer creating an immersive guide with insider knowledge, cultural context, practical tips, and photography recommendations",
  },
};

function getEntityProfile(entityType: string): EntityProfile {
  return ENTITY_PROFILES[entityType] || {
    searchQueries: (title) => [
      `"${title}" analysis review`,
      `"${title}" deep dive discussion insights`,
      `"${title}" significance importance`,
    ],
    synthesisHint: "subject matter expert providing comprehensive analysis with specific examples and evidence",
  };
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const CONTENT_DIR = join(homedir(), ".enso", "data", "deep-content");
const AUDIO_DIR = join(homedir(), ".enso", "data", "deep-content", "audio");

function ensureDirs(): void {
  if (!existsSync(CONTENT_DIR)) mkdirSync(CONTENT_DIR, { recursive: true });
  if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });
}

function slugFromEntityId(entityId: string): string {
  // Preserve Unicode characters (Chinese, Japanese, etc.) in filenames
  return entityId.replace(/[^\p{L}\p{N}-]/gu, "_").slice(0, 120);
}

/** Slug for a specific variant — interview variant gets a -interview suffix. */
function slugForVariant(entityId: string, variant: DeepContentVariant = "discussion"): string {
  const base = slugFromEntityId(entityId);
  return variant === "interview" ? `${base}-interview` : base;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

export function getProcessedContent(entityId: string, variant: DeepContentVariant = "discussion"): ProcessedContent | null {
  ensureDirs();
  const slug = slugForVariant(entityId, variant);
  // Also try the old ASCII-only slug for backward compatibility (discussion only).
  const oldSlug = variant === "discussion"
    ? entityId.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 80)
    : slug;

  // Search in both new (deep-content/) and old (kindle/podcasts/) directories.
  // The old kindle dir only ever held discussion-variant podcasts, so skip it
  // when looking up an interview variant.
  const OLD_KINDLE_DIR = join(homedir(), ".enso", "data", "kindle", "podcasts");
  const searchDirs = variant === "interview" ? [CONTENT_DIR] : [CONTENT_DIR, OLD_KINDLE_DIR];

  let result: ProcessedContent | null = null;

  for (const dir of searchDirs) {
    if (result) break;
    // Try exact match with new Unicode slug first
    for (const trySlug of [slug, oldSlug]) {
      const exactPath = join(dir, `${trySlug}.json`);
      try {
        if (existsSync(exactPath)) {
          result = JSON.parse(readFileSync(exactPath, "utf-8")) as ProcessedContent;
          break;
        }
      } catch { /* continue */ }
    }

    // Try prefix match (handles different slug truncation lengths).
    // Skip for interview variant to avoid matching the discussion file by prefix.
    if (!result && variant !== "interview") {
      try {
        if (existsSync(dir)) {
          const files = readdirSync(dir);
          const prefix = slug.slice(0, 40);
          const match = files.find(f => f.startsWith(prefix) && f.endsWith(".json") && !f.endsWith("-interview.json"));
          if (match) {
            result = JSON.parse(readFileSync(join(dir, match), "utf-8")) as ProcessedContent;
          }
        }
      } catch { /* continue */ }
    }
  }

  if (!result) return null;

  // Recompute audioUrl from actual MP3 file on disk.
  const mp3Path = join(AUDIO_DIR, `${slug}.mp3`);
  if (existsSync(mp3Path)) {
    const encoded = Buffer.from(mp3Path, "utf-8").toString("base64url");
    result.audioUrl = `/media/${encoded}?ext=.mp3`;
  }

  // Tag legacy records that don't have the variant field.
  if (!result.variant) result.variant = variant;

  return result;
}

export function isContentProcessed(entityId: string, variant: DeepContentVariant = "discussion"): boolean {
  return getProcessedContent(entityId, variant) !== null;
}

/**
 * Background-convert all existing WAV podcasts to MP3.
 * Called once at startup — non-blocking, logs progress.
 */
export async function convertExistingPodcastsToMp3(): Promise<void> {
  ensureDirs();
  let wavFiles: string[];
  try {
    wavFiles = readdirSync(AUDIO_DIR).filter(f => f.endsWith(".wav"));
  } catch { return; }

  const needConversion = wavFiles.filter(f => {
    const mp3 = f.replace(/\.wav$/i, ".mp3");
    return !existsSync(join(AUDIO_DIR, mp3));
  });

  if (needConversion.length === 0) return;

  logAction({ ts: Date.now(), type: "system", category: "podcast", message: `Converting ${needConversion.length} WAV podcasts to MP3...` });

  const { wavToMp3 } = await import("./podcast.js");
  let converted = 0;
  for (const f of needConversion) {
    const result = await wavToMp3(join(AUDIO_DIR, f));
    if (result) converted++;
  }

  logAction({ ts: Date.now(), type: "system", category: "podcast", message: `Converted ${converted}/${needConversion.length} podcasts to MP3` });
}

export function listProcessedContent(): string[] {
  ensureDirs();
  try {
    return readdirSync(CONTENT_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        try {
          const data = JSON.parse(readFileSync(join(CONTENT_DIR, f), "utf-8"));
          return data.entityId as string;
        } catch { return null; }
      })
      .filter(Boolean) as string[];
  } catch { return []; }
}

/** Delete cached podcast for an entity (variant-scoped) so it can be regenerated. */
export function deleteProcessedContent(entityId: string, variant: DeepContentVariant = "discussion"): boolean {
  ensureDirs();
  const slug = slugForVariant(entityId, variant);
  const oldSlug = variant === "discussion"
    ? entityId.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 80)
    : slug;
  let deleted = false;

  // Delete JSON metadata
  for (const trySlug of [slug, oldSlug]) {
    const jsonPath = join(CONTENT_DIR, `${trySlug}.json`);
    try { if (existsSync(jsonPath)) { unlinkSync(jsonPath); deleted = true; } } catch { /* ignore */ }
  }

  // Delete audio files (mp3 + wav)
  for (const trySlug of [slug, oldSlug]) {
    for (const ext of [".mp3", ".wav"]) {
      const audioPath = join(AUDIO_DIR, `${trySlug}${ext}`);
      try { if (existsSync(audioPath)) { unlinkSync(audioPath); deleted = true; } } catch { /* ignore */ }
    }
  }

  if (deleted) {
    logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Deleted cached ${variant} for ${entityId}` });
  }
  return deleted;
}

function saveProcessedContent(book: ProcessedContent): void {
  ensureDirs();
  const slug = slugForVariant(book.entityId, book.variant);
  writeFileSync(join(CONTENT_DIR, `${slug}.json`), JSON.stringify(book, null, 2));
}

// ─── Content Extraction ─────────────────────────────────────────────────────

/**
 * Extract structured content from any card data for the deep content pipeline.
 * Detects the content type and maps fields appropriately.
 */
export function extractDeepContentSource(
  cardData: Record<string, unknown>,
  cardId: string,
): DeepContentSource | null {
  // Research card (from researcher tool)
  if (cardData.keyFindings || cardData.sections) {
    const findings = (cardData.keyFindings as Array<Record<string, unknown>> || []).map(f => ({
      text: String(f.text || ""),
      type: f.type as string | undefined,
      confidence: f.confidence as string | undefined,
      example: f.example as string | undefined,
    }));
    const sections = (cardData.sections as Array<Record<string, unknown>> || []).map(s => ({
      title: String(s.title || ""),
      content: String(s.summary || ""),
      bullets: s.bullets as string[] | undefined,
    }));
    return {
      sourceId: cardId,
      title: String(cardData.topic || cardData.query || "Research"),
      contentType: "research",
      findings: findings.length > 0 ? findings : undefined,
      sections: sections.length > 0 ? sections : undefined,
      narrative: cardData.narrative as string | undefined,
      summary: cardData.summary as string | undefined,
      keyPoints: findings.slice(0, 10).map(f => f.text),
      contradictions: (cardData.contradictions as Array<Record<string, unknown>> || []).map(c => String(c.claim || c)),
      sources: (cardData.sources as Array<Record<string, unknown>> || []).map(s => ({
        url: String(s.url || ""),
        title: String(s.title || s.name || ""),
      })),
    };
  }

  // Entity detail card (from view_entity action)
  if (cardData.focusEntity) {
    const entity = cardData.entity as Record<string, unknown> | undefined;
    const processed = cardData.processedBook as Record<string, unknown> | undefined;
    return {
      sourceId: String(cardData.focusEntity),
      title: String(entity?.title || "Entity"),
      contentType: "entity",
      entityId: String(cardData.focusEntity),
      entityType: String(entity?.type || ""),
      metadata: entity || {},
      cortexContent: cardData.cortexContent as string | undefined,
      // If already processed, pull research data
      findings: processed ? (processed.research as Record<string, unknown>)?.keyInsights as any : undefined,
      sections: processed ? (processed.research as Record<string, unknown>)?.chapterSummaries as any : undefined,
      summary: entity?.summary as string | undefined,
    };
  }

  // Orchestration card
  if (cardData.orchestrationPlan || cardData.orchestrationProgress) {
    return {
      sourceId: cardId,
      title: String(cardData.goal || "Orchestration Result"),
      contentType: "orchestration",
      summary: String(cardData.summary || cardData.goal || ""),
      narrative: cardData.narrative as string | undefined,
    };
  }

  // Not rich enough for deep content
  return null;
}

// ─── Phase 1: Entity Research ───────────────────────────────────────────────

export async function researchEntity(params: {
  entityId: string;
  title: string;
  author: string;
  description?: string;
  categories?: string[];
  entityType?: string;
  metadata?: Record<string, unknown>;
  cortexContent?: string;
  relatedEntityTitles?: string[];
  userProfile?: string;
  language?: string;
  onProgress?: (progress: DeepContentProgress) => void;
}): Promise<EntityResearchResult> {
  const { title, author, categories, cortexContent, relatedEntityTitles, onProgress } = params;
  const lang = params.language || "English";
  onProgress?.({ phase: "researching", detail: "Searching the web for content..." });

  // Generate targeted search queries from entity profile
  const profile = getEntityProfile(params.entityType || "book");
  const queries = profile.searchQueries(title, { author, categories, ...params.metadata });

  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Researching "${title}" with ${queries.length} queries` });

  // Run all searches in parallel
  const allResults: Array<{ title: string; url: string; description: string }> = [];
  const searchPromises = queries.map(q => braveWebSearch(q, 6).catch(() => []));
  const searchResults = await Promise.all(searchPromises);

  // Deduplicate by URL
  const seenUrls = new Set<string>();
  for (const results of searchResults) {
    for (const r of results) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        allResults.push(r);
      }
    }
  }

  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Found ${allResults.length} unique sources for "${title}"` });
  onProgress?.({ phase: "researching", detail: `Found ${allResults.length} sources, extracting content...` });

  // Fetch content from top sources (parallel, limit 15)
  const topSources = allResults.slice(0, 15);
  const contentPromises = topSources.map(async (src) => {
    const content = await fetchPageContent(src.url);
    return { ...src, content: content.slice(0, 6000) };
  });
  const sourcesWithContent = await Promise.all(contentPromises);

  // Score sources by quality: content length, domain authority, title relevance
  const QUALITY_DOMAINS = new Set([
    "goodreads.com", "letterboxd.com", "arstechnica.com", "lonelyplanet.com",
    "rogerebert.com", "theguardian.com", "nytimes.com", "newyorker.com",
    "wired.com", "theatlantic.com", "gamedeveloper.com", "eurogamer.com",
    "ign.com", "douban.com", "zhihu.com", "metacritic.com",
  ]);
  const titleWords = new Set(title.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  const scoredSources = sourcesWithContent
    .filter(s => s.content.length > 100)
    .map(s => {
      let score = 0;
      // Length bonus: richer content is more useful
      if (s.content.length > 3000) score += 3;
      else if (s.content.length > 1500) score += 2;
      else if (s.content.length > 500) score += 1;
      // Domain authority bonus
      try {
        const domain = new URL(s.url).hostname.replace(/^www\./, "");
        if (QUALITY_DOMAINS.has(domain)) score += 3;
      } catch { /* ignore invalid URLs */ }
      // Title relevance bonus
      const srcTitle = (s.title || "").toLowerCase();
      let relevance = 0;
      for (const w of titleWords) { if (srcTitle.includes(w)) relevance++; }
      if (relevance >= 2) score += 2;
      else if (relevance >= 1) score += 1;
      return { ...s, qualityScore: score };
    })
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, 12); // Take top 12 by quality (not first 15 by search order)

  const richSources = scoredSources;

  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Extracted content from ${richSources.length} sources for "${title}" (top scores: ${richSources.slice(0, 3).map(s => s.qualityScore).join(",")})` });
  onProgress?.({ phase: "researching", detail: `Synthesizing ${richSources.length} quality sources into analysis...` });

  // Build synthesis prompt
  const sourcesText = richSources.map((s, i) =>
    `[Source ${i}] ${s.title}\nURL: ${s.url}\n${s.content || s.description}`
  ).join("\n\n---\n\n");

  const userContext = relatedEntityTitles?.length
    ? `\nUser's related interests (from their personal library):\n${relatedEntityTitles.join("\n")}`
    : "";

  const cortexContext = cortexContent
    ? `\nExisting knowledge about this content:\n${cortexContent.slice(0, 2000)}`
    : "";

  const profileContext = params.userProfile
    ? `\nUSER PROFILE (tailor insights to this person's interests and expertise):\n${params.userProfile.slice(0, 1500)}`
    : "";

  const langRule = lang !== "English" ? `\n\nCRITICAL LANGUAGE RULE: ALL output text MUST be written in ${lang}. All chapter summaries, insights, thesis, perspectives, author background — EVERYTHING must be in ${lang}. Do NOT write in English.` : "";

  const synthesisPrompt = `You are a ${profile.synthesisHint} creating an exhaustive deep-dive into "${title}" by ${author}. Your goal is to capture the FULL essence of this content — every major idea, argument, and insight.${langRule}
${userContext}${profileContext}${cortexContext}

SOURCES:
${sourcesText}

Respond in JSON format:
{
  "chapterSummaries": [{ "chapter": "Chapter/Part/Section Title", "summary": "3-5 sentence detailed summary covering the key arguments and examples" }],
  "coreThesis": "The book's central argument explained thoroughly in 3-5 sentences with nuance",
  "keyThemes": ["theme1", "theme2", ...],
  "keyInsights": [{ "insight": "Detailed key insight (2-3 sentences)", "example": "Specific example, case study, quote, or data point that illustrates this insight" }],
  "criticalPerspectives": ["detailed criticism or alternative viewpoint with reasoning"],
  "authorBackground": "Author bio, credibility, what makes them uniquely positioned to write this book",
  "estimatedDepth": "light|moderate|rich"
}

CRITICAL RULES:
- You MUST provide at least 8-15 chapter/section summaries. If the sources don't have explicit chapter names, infer the book's structure from its themes and create section summaries (e.g., "Part 1: The Problem", "The Core Framework", "Case Studies", etc.)
- Each chapter summary should be 3-5 detailed sentences, not brief one-liners
- Include 8-15 key insights with SPECIFIC examples, quotes, data points, or case studies for each
- Include 3-6 critical perspectives with substantive reasoning
- The coreThesis should be a rich 3-5 sentence explanation, not a one-liner
- Use your own knowledge of this book to supplement the sources — you likely know this book well
- estimatedDepth: "light" ONLY if the book is truly obscure with <3 sources; most well-known books should be "moderate" or "rich"
- Aim for maximum depth and completeness — this will be turned into a 15-30 minute podcast
- When a USER PROFILE is provided, connect insights to the user's specific interests, projects, and expertise where relevant — make insights personally actionable
- When related interests are provided, note meaningful cross-connections (e.g., how a book's framework applies to a game's design, or how a film's theme echoes a project's challenge)
- Respond ONLY with the JSON object, no other text`;

  const synthesisResult = await llm({
    prompt: synthesisPrompt,
    tier: "pro",
    timeoutMs: 90_000,
    maxOutputTokens: 16384,
  });

  try {
    // Parse JSON from response (may have markdown code fences)
    const jsonStr = synthesisResult?.replace(/```json\n?|\n?```/g, "").trim() ?? "{}";
    const parsed = JSON.parse(jsonStr);

    const result: EntityResearchResult = {
      chapterSummaries: parsed.chapterSummaries || [],
      coreThesis: parsed.coreThesis || `A book by ${author}`,
      keyThemes: parsed.keyThemes || [],
      keyInsights: parsed.keyInsights || [],
      criticalPerspectives: parsed.criticalPerspectives || [],
      authorBackground: parsed.authorBackground || "",
      userConnections: relatedEntityTitles || [],
      sources: richSources.map(s => ({ url: s.url, title: s.title })),
      estimatedDepth: parsed.estimatedDepth || "moderate",
    };

    logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Research complete for "${title}": ${result.chapterSummaries.length} chapters, ${result.keyInsights.length} insights, depth=${result.estimatedDepth}` });
    return result;
  } catch (err) {
    logError("book-podcast", `Failed to parse research synthesis for "${title}"`, err);
    return {
      chapterSummaries: [],
      coreThesis: `A book by ${author}`,
      keyThemes: categories || [],
      keyInsights: [],
      criticalPerspectives: [],
      authorBackground: "",
      userConnections: [],
      sources: richSources.map(s => ({ url: s.url, title: s.title })),
      estimatedDepth: "light",
    };
  }
}

// ─── Phase 2: Podcast Outline ────────────────────────────────────────────────

export async function generatePodcastOutline(
  title: string,
  author: string,
  research: EntityResearchResult,
  language?: string,
): Promise<PodcastOutline> {
  // Determine target duration based on research depth
  // Real conversational speech ≈ 150 words/min ≈ 900 chars/min for dialogue text
  const depthConfig = {
    light: { minSections: 5, maxSections: 7, targetMinutes: 12 },
    moderate: { minSections: 7, maxSections: 10, targetMinutes: 20 },
    rich: { minSections: 10, maxSections: 15, targetMinutes: 35 },
  };
  const config = depthConfig[research.estimatedDepth];
  const charsPerMinute = 900; // ~150 words/min ≈ 900 chars/min for natural dialogue

  const outlinePrompt = `You are a podcast producer planning a book discussion episode.

Book: "${title}" by ${author}
Core Thesis: ${research.coreThesis}
Key Themes: ${research.keyThemes.join(", ")}
Chapters Found: ${research.chapterSummaries.length}
Key Insights: ${research.keyInsights.length}
Critical Perspectives: ${research.criticalPerspectives.length}

Create a podcast outline with ${config.minSections}-${config.maxSections} sections, targeting ~${config.targetMinutes} minutes total.

Respond in JSON:
{
  "estimatedMinutes": ${config.targetMinutes},
  "sections": [
    {
      "id": "intro",
      "title": "Section Title",
      "purpose": "What this section covers and why",
      "targetCharCount": ${Math.round(config.targetMinutes / config.maxSections * charsPerMinute)},
      "keyPoints": ["point1", "point2"]
    }
  ]
}

Rules:
- Start with an engaging introduction (why this book matters)
- Include chapter/theme breakdowns as middle sections
- Include a critical perspectives section
- End with takeaways and relevance to the listener
- Each section should feel like a natural podcast segment${language && language !== "English" ? `\n- CRITICAL: Write ALL section titles, purposes, and key points in ${language}. Do NOT use English.` : ""}
- Respond ONLY with JSON`;

  const result = await llm({ prompt: outlinePrompt, tier: "utility", timeoutMs: 30_000 });
  try {
    const jsonStr = result?.replace(/```json\n?|\n?```/g, "").trim() ?? "{}";
    return JSON.parse(jsonStr) as PodcastOutline;
  } catch {
    // Fallback outline with substantial section lengths
    const perSection = Math.round(config.targetMinutes / 5 * charsPerMinute);
    return {
      estimatedMinutes: config.targetMinutes,
      sections: [
        { id: "intro", title: "Introduction & Context", purpose: "Why this book matters and author background", targetCharCount: perSection, keyPoints: [research.coreThesis, research.authorBackground || "Author credentials"] },
        { id: "thesis", title: "The Core Thesis", purpose: "The book's central argument in depth", targetCharCount: perSection, keyPoints: [research.coreThesis, ...research.keyThemes.slice(0, 3)] },
        { id: "chapters", title: "Key Chapters & Ideas", purpose: "Walk through the book's major sections", targetCharCount: Math.round(perSection * 1.5), keyPoints: research.chapterSummaries.slice(0, 5).map(c => c.chapter) },
        { id: "insights", title: "Deep Insights & Examples", purpose: "Most important takeaways with real examples", targetCharCount: Math.round(perSection * 1.5), keyPoints: research.keyInsights.slice(0, 5).map(i => i.insight) },
        { id: "takeaways", title: "Final Takeaways & Action Items", purpose: "What listeners should do differently", targetCharCount: perSection, keyPoints: ["Synthesis", "Practical applications", "Recommendations"] },
      ],
    };
  }
}

// ─── Phase 3: Section-by-Section Script Generation ───────────────────────────

async function generateSectionScript(params: {
  title: string;
  author: string;
  section: PodcastOutline["sections"][0];
  research: EntityResearchResult;
  previousEnding?: string;
  sectionIndex: number;
  totalSections: number;
  language?: string;
}): Promise<string> {
  const { title, author, section, research, previousEnding, sectionIndex, totalSections } = params;

  // Build context for this section
  const relevantChapters = research.chapterSummaries
    .map(c => `${c.chapter}: ${c.summary}`)
    .join("\n");

  const relevantInsights = research.keyInsights
    .map(i => `- ${i.insight}${i.example ? ` (Example: ${i.example})` : ""}`)
    .join("\n");

  const criticalPoints = research.criticalPerspectives.join("\n- ");

  // Ensure minimum per-section length for meaningful content
  const minChars = 1200;
  const targetChars = Math.max(section.targetCharCount, minChars);

  const prompt = `You are writing section ${sectionIndex + 1} of ${totalSections} for a deep-dive podcast about "${title}" by ${author}. This is NOT a quick summary — it's a thorough, engaging exploration that captures the book's full richness.

SECTION: "${section.title}"
PURPOSE: ${section.purpose}
KEY POINTS TO COVER: ${section.keyPoints.join(", ")}
TARGET LENGTH: ~${targetChars} characters of dialogue (write LONG, detailed exchanges)

BOOK CONTEXT:
Core Thesis: ${research.coreThesis}
${relevantChapters ? `\nChapter Summaries:\n${relevantChapters}` : ""}
${relevantInsights ? `\nKey Insights:\n${relevantInsights}` : ""}
${section.id === "criticism" || section.id === "perspectives" ? `\nCritical Perspectives:\n- ${criticalPoints}` : ""}
${previousEnding ? `\nPREVIOUS SECTION ENDED WITH: "${previousEnding}"` : ""}

Rules:
- Use "Host A:" and "Host B:" speaker tags (one per line)
- Host A drives conversation, asks probing questions, provides context
- Host B provides deep insights, challenges assumptions, adds nuance
- WRITE LONG — each host should speak 2-4 sentences per turn, not just one-liners
- Include specific examples, case studies, data points, and quotes from the book
- Explore the "why" behind each insight — don't just state facts
- ${sectionIndex === 0 ? "Start with a compelling hook — why should someone care about this book? What problem does it solve?" : "Transition naturally from the previous section"}
- ${sectionIndex === totalSections - 1 ? "End with powerful takeaways: what should listeners DO differently after learning this? Give a warm sign-off." : "End with a natural transition that makes the listener eager for the next topic"}
- Keep it genuinely conversational — real reactions, "that reminds me of...", "wait, so you're saying...", follow-up questions
- IMPORTANT: Write at LEAST ${targetChars} characters. This section should feel substantive, not rushed.${params.language && params.language !== "English" ? `\n- CRITICAL LANGUAGE RULE: Write the ENTIRE dialogue in ${params.language}. Both hosts speak fluent ${params.language}. Do NOT use English for any dialogue.` : ""}
- Output ONLY the dialogue script`;

  const script = await llm({ prompt, tier: "pro", timeoutMs: 90_000, maxOutputTokens: 8192 });
  return script?.trim() ?? "";
}

export async function generateFullScript(
  title: string,
  author: string,
  outline: PodcastOutline,
  research: EntityResearchResult,
  language?: string,
  onProgress?: (sectionIndex: number, totalSections: number) => void,
): Promise<{ fullScript: string; sectionScripts: string[] }> {
  const total = outline.sections.length;

  // Generate sections in parallel batches of 4
  // Each section gets outline context instead of previous section ending
  // (parallel sections can't have sequential continuity, but the outline
  // provides enough context for natural transitions)
  const SCRIPT_CONCURRENCY = 4;
  const sectionScripts: string[] = new Array(total).fill("");
  let completed = 0;

  for (let batchStart = 0; batchStart < total; batchStart += SCRIPT_CONCURRENCY) {
    const batchEnd = Math.min(batchStart + SCRIPT_CONCURRENCY, total);
    const promises = [];

    for (let i = batchStart; i < batchEnd; i++) {
      // For continuity: first section of a batch uses the ending of the
      // last completed section (if available); others use outline context
      const previousEnding = i > 0 && sectionScripts[i - 1]
        ? sectionScripts[i - 1].slice(-200)
        : (i > 0 ? `[Previous section: "${outline.sections[i - 1].title}" covered: ${outline.sections[i - 1].keyPoints.join(", ")}]` : "");

      promises.push(
        generateSectionScript({
          title,
          author,
          section: outline.sections[i],
          research,
          previousEnding,
          sectionIndex: i,
          totalSections: total,
          language,
        }).then(script => {
          sectionScripts[i] = script;
          completed++;
          onProgress?.(completed - 1, total);
        })
      );
    }

    await Promise.all(promises);
  }

  return {
    fullScript: sectionScripts.join("\n\n"),
    sectionScripts,
  };
}

// ─── Phase 4: Audio Rendering ────────────────────────────────────────────────

/**
 * Split a script into segments of ≤maxChars, breaking at Host A/B boundaries.
 */
function splitScriptIntoSegments(script: string, maxChars = 4000): string[] {
  const lines = script.split("\n");
  const segments: string[] = [];
  let current = "";

  for (const line of lines) {
    if (current.length + line.length + 1 > maxChars && current.length > 0) {
      segments.push(current.trim());
      current = "";
    }
    current += line + "\n";
  }
  if (current.trim()) segments.push(current.trim());

  return segments;
}

export async function renderLongformAudio(
  sectionScripts: string[],
  geminiKey: string,
  onProgress?: (segmentIndex: number, totalSegments: number) => void,
): Promise<Buffer> {
  // Split all sections into TTS-sized segments
  const allSegments: string[] = [];
  for (const script of sectionScripts) {
    const segs = splitScriptIntoSegments(script, 4000);
    allSegments.push(...segs);
  }

  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Rendering ${allSegments.length} audio segments` });

  // Render all segments through the global TTS semaphore — keeps total Gemini
  // TTS concurrency capped across every running deep-content job, not just
  // this one.
  const { withTtsSlot } = await import("./deep-content-jobs.js");
  const pcmBuffers: Buffer[] = new Array(allSegments.length).fill(Buffer.alloc(0));
  let completed = 0;

  await Promise.all(
    allSegments.map((seg, idx) =>
      withTtsSlot(() => renderPodcastAudio(seg, geminiKey))
        .then((buf) => {
          pcmBuffers[idx] = buf;
          completed++;
          onProgress?.(completed - 1, allSegments.length);
        })
        .catch((err) => {
          logError("book-podcast", `Failed to render segment ${idx}`, err);
          completed++;
          onProgress?.(completed - 1, allSegments.length);
          // pcmBuffers[idx] stays as empty Buffer — segment skipped
        }),
    ),
  );

  // Concatenate PCM in order (preserves audio sequence) and wrap with WAV header
  const totalPcm = Buffer.concat(pcmBuffers.filter(b => b.length > 0));
  return pcmToWav(totalPcm);
}

// ─── Full Pipeline ───────────────────────────────────────────────────────────

export async function generateDeepContent(params: {
  entityId: EntityId;
  language?: string;
  variant?: DeepContentVariant;
  onProgress?: (progress: DeepContentProgress) => void;
}): Promise<ProcessedContent> {
  const { entityId, language, onProgress } = params;
  const variant: DeepContentVariant = params.variant ?? "discussion";
  // Resolve language: explicit param > detect from title > "English"
  const resolveLanguage = (title: string): string => {
    if (language === "zh") return "Chinese";
    if (language === "en") return "English";
    if (language && language !== "en" && language !== "zh") return language;
    // Auto-detect from title characters
    const nonLatin = (title.match(/[^\u0000-\u007F]/g) ?? []).length;
    if (nonLatin / Math.max(title.length, 1) > 0.3) return "Chinese";
    return "English";
  };

  // Check cache first (variant-scoped)
  const cached = getProcessedContent(entityId, variant);
  if (cached) {
    logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Cache hit for ${entityId} (${variant})` });
    onProgress?.({ phase: "complete", percentComplete: 100 });
    return cached;
  }

  // Resolve entity
  const entity = await resolveEntity(entityId);
  if (!entity) throw new Error(`Entity not found: ${entityId}`);

  const title = entity.title;
  const author = (entity.metadata.author || "Unknown") as string;
  const description = (entity.metadata.description || "") as string;
  const categories = (entity.metadata.categories || entity.tags || []) as string[];

  // Read Cortex content if available
  let cortexContent: string | undefined;
  if (entity.cortexPath) {
    try {
      const cortexPath = join(homedir(), ".enso", "wiki", entity.cortexPath);
      if (existsSync(cortexPath)) {
        cortexContent = readFileSync(cortexPath, "utf-8");
      }
    } catch { /* ignore */ }
  }

  // Read user profile for personalized synthesis
  let userProfile: string | undefined;
  try {
    const profilePath = join(homedir(), ".enso", "wiki", "synthesis", "user-profile.md");
    if (existsSync(profilePath)) {
      userProfile = readFileSync(profilePath, "utf-8");
    }
  } catch { /* ignore */ }

  // Get related entity context from cross-references + semantic tag overlap
  const relatedTitles: string[] = [];
  const indexEntry = lookupEntity(entityId);

  // 1. Explicit cross-references (highest quality — LLM-curated connections)
  if (indexEntry?.crossReferences?.length) {
    for (const xref of indexEntry.crossReferences) {
      const related = lookupEntity(xref.entityId);
      if (related) {
        relatedTitles.push(`${related.title} (${related.type}, ${related.source}) — ${xref.reason}`);
      }
    }
  }

  // 2. Semantic tag overlap — find entities sharing themes across different sources
  if (relatedTitles.length < 8 && indexEntry?.semanticTags?.length) {
    const tags = new Set(indexEntry.semanticTags);
    const allEntities = getEntityIndex();
    for (const [id, entry] of allEntities) {
      if (relatedTitles.length >= 8) break;
      if (id === entityId) continue;
      if (entry.source === indexEntry.source) continue; // cross-source only
      const overlap = (entry.semanticTags || []).filter(t => tags.has(t));
      if (overlap.length >= 2) {
        relatedTitles.push(`${entry.title} (${entry.type}) — shared themes: ${overlap.join(", ")}`);
      }
    }
  }

  const contentLanguage = resolveLanguage(title);
  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Starting pipeline for "${title}" by ${author} [lang=${contentLanguage}]` });

  // Phase 1: Research
  onProgress?.({ phase: "researching", detail: "Searching the web...", percentComplete: 5 });
  let research = await researchEntity({
    entityId, title, author, description, categories,
    cortexContent, relatedEntityTitles: relatedTitles,
    userProfile,
    language: contentLanguage,
    onProgress,
  });

  // Quality gate: if research is thin, retry with broader queries
  const researchQuality = {
    chapters: research.chapterSummaries.length,
    insights: research.keyInsights.length,
    depth: research.estimatedDepth,
    sources: research.sources.length,
    retried: false,
  };

  if (research.chapterSummaries.length < 4 && research.keyInsights.length < 4) {
    logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Quality gate: thin research for "${title}" (${researchQuality.chapters} chapters, ${researchQuality.insights} insights). Retrying with broader queries...` });
    onProgress?.({ phase: "researching", detail: "Research too thin — retrying with broader queries...", percentComplete: 15 });

    // Retry with reformulated queries: use entity type + broader terms
    const entityType = entity.type || "book";
    const retryProfile: EntityProfile = {
      searchQueries: () => [
        `${title} ${author} comprehensive analysis`,
        `${title} summary key ideas takeaways`,
        `${title} review in-depth`,
        `${title} ${entityType} discussion themes`,
        `${title} why important significance`,
      ],
      synthesisHint: getEntityProfile(entityType).synthesisHint,
    };
    const retryQueries = retryProfile.searchQueries(title, { author, categories, ...entity.metadata });
    const retryResults: Array<{ title: string; url: string; description: string }> = [];
    const retrySearches = retryQueries.map(q => braveWebSearch(q, 8).catch(() => []));
    const retrySearchResults = await Promise.all(retrySearches);
    const retrySeen = new Set(research.sources.map(s => s.url));
    for (const results of retrySearchResults) {
      for (const r of results) {
        if (!retrySeen.has(r.url)) { retrySeen.add(r.url); retryResults.push(r); }
      }
    }

    if (retryResults.length > 0) {
      // Re-run synthesis with additional sources merged in
      research = await researchEntity({
        entityId, title, author, description, categories,
        cortexContent, relatedEntityTitles: relatedTitles,
        userProfile,
        language: contentLanguage,
        entityType,
        onProgress,
      });
      researchQuality.retried = true;
      researchQuality.chapters = research.chapterSummaries.length;
      researchQuality.insights = research.keyInsights.length;
      researchQuality.depth = research.estimatedDepth;
      researchQuality.sources = research.sources.length;
    }
  }

  // If still thin after retry, force "light" depth so outline targets shorter duration
  if (research.chapterSummaries.length < 3 && research.keyInsights.length < 3) {
    research.estimatedDepth = "light";
  }

  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Research quality for "${title}": ${researchQuality.chapters} chapters, ${researchQuality.insights} insights, depth=${researchQuality.depth}, sources=${researchQuality.sources}, retried=${researchQuality.retried}` });

  // Phase 2 + 3: Outline/questions + script — branches on variant
  let outline: PodcastOutline | undefined;
  let fullScript: string;
  let sectionScripts: string[];
  let interviewQuestions: Array<{ question: string; probes: string; rationale: string }> | undefined;

  if (variant === "interview") {
    // Author voice research (new) — keeps author answers grounded
    onProgress?.({ phase: "generating_outline", detail: `Researching ${author}'s voice...`, percentComplete: 25 });
    const { researchAuthorVoice, designInterviewQuestions, writeInterviewDialogue } = await import("./interview-prompts.js");
    const authorVoice = await researchAuthorVoice({ author, title, onProgress: (detail) => onProgress?.({ phase: "generating_outline", detail, percentComplete: 30 }) });

    // Question design
    onProgress?.({ phase: "generating_outline", detail: "Designing interview questions...", percentComplete: 40 });
    const userFocuses: string[] = [];
    try {
      const focusesDir = join(homedir(), ".enso", "wiki", "focuses");
      if (existsSync(focusesDir)) {
        const { readdirSync: rd } = await import("node:fs");
        for (const f of rd(focusesDir)) {
          if (f.endsWith(".md") && !f.includes("/")) {
            try { userFocuses.push(f.replace(/\.md$/, "").replace(/-/g, " ")); } catch { /* ignore */ }
          }
        }
      }
    } catch { /* focuses are optional */ }
    const questions = await designInterviewQuestions({
      title, author, research,
      userProfile, userFocuses,
      language: contentLanguage,
    });
    interviewQuestions = questions;

    logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Interview: ${questions.length} questions for "${title}" (author voice grounded=${authorVoice.grounded})` });

    // Dialogue
    onProgress?.({ phase: "writing_section", detail: "Writing author dialogue...", percentComplete: 50 });
    const targetMinutes = research.estimatedDepth === "rich" ? 25 : research.estimatedDepth === "moderate" ? 18 : 12;
    fullScript = await writeInterviewDialogue({
      title, author, research, questions,
      authorVoice,
      language: contentLanguage,
      targetMinutes,
    });
    sectionScripts = [fullScript];

    logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Interview script complete: ${fullScript.length} chars for "${title}"` });
  } else {
    // Discussion variant — existing two-host pipeline
    onProgress?.({ phase: "generating_outline", detail: "Planning podcast structure...", percentComplete: 25 });
    outline = await generatePodcastOutline(title, author, research, contentLanguage);

    logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Outline: ${outline.sections.length} sections, ~${outline.estimatedMinutes} min for "${title}"` });

    const scriptOut = await generateFullScript(
      title, author, outline, research, contentLanguage,
      (sectionIdx, total) => {
        const pct = 30 + Math.round((sectionIdx / total) * 30);
        onProgress?.({
          phase: "writing_section",
          detail: `Writing section ${sectionIdx + 1}/${total}: "${outline!.sections[sectionIdx]?.title}"`,
          sectionIndex: sectionIdx,
          totalSections: total,
          percentComplete: pct,
        });
      },
    );
    fullScript = scriptOut.fullScript;
    sectionScripts = scriptOut.sectionScripts;

    logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Script complete: ${fullScript.length} chars for "${title}"` });
  }

  // Phase 4: Audio
  const { getGeminiApiKey } = await import("./podcast.js");
  const geminiKey = await getGeminiApiKey();
  if (!geminiKey) {
    throw new Error("Gemini API key required for podcast audio generation (TTS).");
  }

  onProgress?.({ phase: "rendering_audio", detail: "Rendering audio...", percentComplete: 65 });
  const wavData = await renderLongformAudio(
    sectionScripts, geminiKey,
    (segIdx, total) => {
      const pct = 65 + Math.round((segIdx / total) * 30);
      onProgress?.({
        phase: "rendering_audio",
        detail: `Rendering audio segment ${segIdx + 1}/${total}`,
        sectionIndex: segIdx,
        totalSections: total,
        percentComplete: pct,
      });
    },
  );

  // Save audio (variant-scoped slug so discussion + interview don't overwrite each other)
  ensureDirs();
  const slug = slugForVariant(entityId, variant);
  const audioPath = join(AUDIO_DIR, `${slug}.wav`);
  writeFileSync(audioPath, wavData);

  // Convert WAV→MP3 for mobile compatibility
  const { wavToMp3 } = await import("./podcast.js");
  const mp3Path = await wavToMp3(audioPath);

  const { toMediaUrl } = await import("./server.js");
  const audioUrl = toMediaUrl(mp3Path ?? audioPath);

  // Estimate duration: 24000 samples/sec * 2 bytes/sample = 48000 bytes/sec
  const durationMinutes = Math.round((wavData.length - 44) / 48000 / 60 * 10) / 10;

  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Podcast complete for "${title}": ${durationMinutes} min, ${wavData.length} bytes${mp3Path ? ", MP3 converted" : ""}` });

  // Build result
  const processed: ProcessedContent = {
    entityId,
    title,
    author,
    contentType: entity.type || "book",
    entityType: entity.type,
    processedAt: new Date().toISOString(),
    research,
    outline,
    interviewQuestions,
    script: fullScript,
    audioUrl,
    audioSizeBytes: wavData.length,
    durationMinutes,
    variant,
  };

  // Persist
  saveProcessedContent(processed);

  // Ensure entity is in the index (content recommendation pipeline may have missed it)
  try {
    const { lookupEntity, upsertEntityIndex, saveEntityIndex, parseEntityId } = await import("./entity-model.js");
    if (!lookupEntity(entityId)) {
      const parsed = parseEntityId(entityId);
      if (parsed) {
        const { entityCortexPath } = await import("./entity-model.js");
        upsertEntityIndex({
          entityId,
          type: parsed.type as never,
          source: parsed.source as never,
          title,
          slug: parsed.slug,
          cortexPath: entityCortexPath(entityId),
          tags: [parsed.type, parsed.source, "deep-processed"],
          updatedAt: new Date().toISOString(),
        });
        saveEntityIndex();
        logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Auto-registered entity in index: ${entityId}` });
      }
    }
  } catch { /* best effort */ }

  onProgress?.({ phase: "complete", percentComplete: 100 });

  return processed;
}

// ─── Batch Processing ────────────────────────────────────────────────────────

export async function processEntityBatch(params: {
  entityIds: string[];
  onBookProgress?: (bookIndex: number, totalBooks: number, bookTitle: string, progress: DeepContentProgress) => void;
}): Promise<{ processed: number; failed: number; results: Array<{ entityId: string; success: boolean; error?: string }> }> {
  const { entityIds, onBookProgress } = params;
  const results: Array<{ entityId: string; success: boolean; error?: string }> = [];
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < entityIds.length; i++) {
    const entityId = entityIds[i];
    try {
      let progressTitle = entityId;
      const result = await generateDeepContent({
        entityId,
        onProgress: (progress) => {
          if (progress.detail) progressTitle = progress.detail;
          onBookProgress?.(i, entityIds.length, progressTitle, progress);
        },
      });
      processed++;
      results.push({ entityId, success: true });
      logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Batch ${i + 1}/${entityIds.length}: "${result.title}" complete` });
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ entityId, success: false, error: msg });
      logError("book-podcast", `Batch ${i + 1}/${entityIds.length}: failed for ${entityId}`, err);
    }
  }

  return { processed, failed, results };
}

// ─── Email Sharing ───────────────────────────────────────────────────────────

// ─── Book Discovery (for scheduled tasks) ────────────────────────────────────

interface DiscoveredBook {
  title: string;
  author: string;
  year?: string;
  description: string;
  whyRecommended: string;
  entityId: string;
}

/**
 * Discover NEW books the user hasn't read — based on Cortex interests + web search + LLM.
 *
 * Pipeline:
 *   1. Read top Cortex themes and existing books (to exclude)
 *   2. Web search for book recommendations matching interests
 *   3. LLM selects the best book the user doesn't already have
 *   4. Returns structured recommendation with entityId ready for deep processing
 */
export async function discoverNewBooks(count = 1, language?: string): Promise<DiscoveredBook[]> {
  const isChinese = language === "zh" || language === "Chinese";
  // Step 1: Read Cortex themes
  let topThemes: string[] = [];
  try {
    const indexPath = join(homedir(), ".enso", "wiki", "_index.md");
    if (existsSync(indexPath)) {
      const idx = readFileSync(indexPath, "utf-8");
      const themeMatches = idx.matchAll(/Themes:\s*(.+)/g);
      const themeCounts: Record<string, number> = {};
      for (const m of themeMatches) {
        m[1].split(",").forEach(t => {
          const theme = t.trim().toLowerCase();
          if (theme) themeCounts[theme] = (themeCounts[theme] || 0) + 1;
        });
      }
      topThemes = Object.entries(themeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(e => e[0]);
    }
  } catch { /* ignore */ }

  if (!topThemes.length) {
    topThemes = ["technology", "leadership", "innovation", "business strategy"];
  }

  // Step 2: Collect existing book titles to exclude
  const existingTitles = new Set<string>();
  try {
    const kindlePath = join(homedir(), ".enso", "data", "user-context", "cache", "kindle-library.json");
    if (existsSync(kindlePath)) {
      const kindle = JSON.parse(readFileSync(kindlePath, "utf-8"));
      for (const b of kindle.books || []) {
        if (b.title) existingTitles.add(b.title.toLowerCase());
      }
    }
  } catch { /* ignore */ }
  // Also exclude already-discovered books
  try {
    const eiPath = join(homedir(), ".enso", "data", "entity-index.json");
    if (existsSync(eiPath)) {
      const idx = JSON.parse(readFileSync(eiPath, "utf-8"));
      for (const entry of Object.values(idx) as Array<{ source?: string; type?: string; title?: string }>) {
        if (entry.source === "research" && entry.type === "book" && entry.title) {
          existingTitles.add(entry.title.toLowerCase());
        }
      }
    }
  } catch { /* ignore */ }
  // Also exclude already-processed books
  const processedIds = new Set(listProcessedContent());

  logAction({ ts: Date.now(), type: "action", category: "book-discovery", message: `Discovering books for themes: ${topThemes.slice(0, 5).join(", ")}. Excluding ${existingTitles.size} known books.` });

  // Step 3: Web search for book recommendations
  // Pick 3-4 themes to search (rotate daily for variety)
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const themeOffset = dayOfYear % Math.max(1, topThemes.length - 3);
  const searchThemes = topThemes.slice(themeOffset, themeOffset + 4);
  if (searchThemes.length < 2) searchThemes.push(...topThemes.slice(0, 2));

  const queries = isChinese ? [
    `2024 2025 年度好书推荐 豆瓣高分 必读`,
    `${searchThemes.slice(0, 2).join(" ")} 最新好书推荐 值得一读`,
    `${searchThemes[0]} 书单推荐 深度好书 2024`,
    `科技 商业 思维 新书推荐 豆瓣 2025`,
  ] : [
    `best books ${searchThemes.slice(0, 2).join(" ")} 2024 2025 recommendations`,
    `must read books ${searchThemes.slice(1, 3).join(" and ")} highly rated`,
    `new important books ${searchThemes[0]} thought-provoking`,
  ];

  const allResults: Array<{ title: string; description: string; url: string }> = [];
  for (const q of queries) {
    try {
      const results = await braveWebSearch(q, 5);
      allResults.push(...results);
    } catch { /* ignore individual failures */ }
  }

  const webSearchAvailable = allResults.length > 0;
  if (!webSearchAvailable) {
    logAction({ ts: Date.now(), type: "action", category: "book-discovery", message: "Web search returned no results — falling back to LLM-only mode" });
  }

  // Fetch content from top results for richer context
  const enriched: string[] = [];
  for (const r of allResults.slice(0, 8)) {
    try {
      const content = await fetchPageContent(r.url);
      if (content && content.length > 100) {
        enriched.push(`[${r.title}]\n${content.slice(0, 1500)}`);
      } else {
        enriched.push(`[${r.title}] ${r.description}`);
      }
    } catch {
      enriched.push(`[${r.title}] ${r.description}`);
    }
  }

  // Step 4: LLM picks the best book
  // Also collect already-processed book titles for stronger exclusion
  const processedTitles: string[] = [];
  try {
    const dcDir = join(homedir(), ".enso", "data", "deep-content");
    if (existsSync(dcDir)) {
      for (const f of readdirSync(dcDir)) {
        if (f.endsWith(".json")) {
          try {
            const meta = JSON.parse(readFileSync(join(dcDir, f), "utf-8"));
            if (meta.title) processedTitles.push(meta.title);
          } catch { /* ignore */ }
        }
      }
    }
  } catch { /* ignore */ }

  const existingList = [...existingTitles].slice(0, 100).join(", ");
  const processedList = processedTitles.join(", ");
  const langInstruction = isChinese ? "\n\nCRITICAL: ALL output text (title, description, whyRecommended) MUST be written in Chinese (中文). Recommend Chinese-language books." : "";
  const webContext = webSearchAvailable
    ? `Based on these web search results about recommended books:\n\n${enriched.join("\n\n---\n\n")}\n\n`
    : `No live web search results are available. Use your own knowledge to select high-quality books from the past decade.\n\n`;
  const prompt = `You are a personal book curator. Your client's top interests are: ${topThemes.join(", ")}.${langInstruction}

They already own these books (DO NOT recommend any of these): ${existingList || "none known"}

They already have AI podcasts for these books (DO NOT recommend these or any variant/edition of these): ${processedList || "none"}

${webContext}Select ${Math.max(count + 7, 8)} book(s) that would be most valuable and thought-provoking for this person. Pick books that:
- Are COMPLETELY DIFFERENT from books they already own or have podcasts for — no variant editions, translations, or related titles
- Are highly acclaimed and substantive (not pop/superficial)
- Match their core interests but EXPAND their thinking in new, surprising directions
- They are unlikely to already know about (avoid obvious bestsellers they'd have)
- Have enough depth to support a 20-30 minute podcast discussion

Return valid JSON (no markdown fences):
{
  "books": [
    {
      "title": "exact book title",
      "author": "author name",
      "year": "publication year or null",
      "description": "2-3 sentence description of the book's key ideas",
      "whyRecommended": "1-2 sentences on why this book specifically matches their interests and what new perspective it offers"
    }
  ]
}

CRITICAL: Return ONLY valid JSON. Pick real, existing books with correct authors.`;

  try {
    const raw = await llm({ prompt, tier: "utility", timeoutMs: 30000 });
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    const parsed = JSON.parse(cleaned) as { books: Array<{ title: string; author: string; year?: string; description: string; whyRecommended: string }> };

    if (!parsed.books?.length) return [];

    // Fuzzy title match helper — checks if two titles share >50% characters
    const isSimilarTitle = (a: string, b: string): boolean => {
      const sa = a.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      const sb = b.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (sa === sb) return true;
      if (sa.includes(sb) || sb.includes(sa)) return true;
      // Character overlap check
      const setA = new Set(sa);
      const setB = new Set(sb);
      let overlap = 0;
      for (const c of setA) if (setB.has(c)) overlap++;
      return overlap / Math.max(setA.size, setB.size) > 0.7;
    };

    const allKnownTitles = [...existingTitles, ...processedTitles.map(t => t.toLowerCase())];

    const results: DiscoveredBook[] = [];
    for (const book of parsed.books.slice(0, count + 8)) { // request extras in case some get filtered
      if (!book.title || !book.author) continue;
      if (results.length >= count) break;

      // Skip exact match
      if (existingTitles.has(book.title.toLowerCase())) continue;

      // Skip fuzzy match against all known titles
      const isTooSimilar = allKnownTitles.some(t => isSimilarTitle(book.title, t));
      if (isTooSimilar) {
        logAction({ ts: Date.now(), type: "action", category: "book-discovery", message: `Skipped "${book.title}" — too similar to existing book` });
        continue;
      }

      const slug = book.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
      const entityId = `research:book:${slug}`;

      // Skip if already processed
      if (processedIds.has(entityId)) continue;

      results.push({
        title: book.title,
        author: book.author,
        year: book.year || undefined,
        description: book.description,
        whyRecommended: book.whyRecommended,
        entityId,
      });
    }

    // If all candidates were filtered, try one more time with a relaxed fuzzy threshold
    if (results.length === 0 && parsed.books.length > 0) {
      logAction({ ts: Date.now(), type: "action", category: "book-discovery", message: `All ${parsed.books.length} candidates filtered — retrying with relaxed matching` });
      for (const book of parsed.books) {
        if (!book.title || !book.author) continue;
        if (results.length >= count) break;
        // Only apply exact match, skip fuzzy check on retry
        if (existingTitles.has(book.title.toLowerCase())) continue;
        const slug = book.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
        const entityId = `research:book:${slug}`;
        if (processedIds.has(entityId)) continue;
        results.push({ title: book.title, author: book.author, year: book.year || undefined, description: book.description, whyRecommended: book.whyRecommended, entityId });
      }
    }

    logAction({ ts: Date.now(), type: "action", category: "book-discovery", message: `Discovered ${results.length} new books: ${results.map(b => b.title).join(", ")}` });
    return results;
  } catch (err) {
    logError("book-discovery", "LLM book selection failed", err);
    return [];
  }
}

// ─── Legacy Book Recommendations (from existing library) ─────────────────────

/**
 * Select N unprocessed books from the existing Kindle library that best match
 * the user's Cortex interests. Uses tag overlap with Cortex theme distribution.
 */
export async function recommendUnprocessedEntities(count = 3): Promise<Array<{ entityId: string; title: string; reason: string }>> {
  const { getEntitiesBySource } = await import("./entity-model.js");
  const allBooks = getEntitiesBySource("kindle" as never, 500);
  const processedIds = new Set(listProcessedContent());

  // Filter to unprocessed books
  const unprocessed = allBooks.filter(b => !processedIds.has(b.entityId));
  if (!unprocessed.length) return [];

  // Read Cortex themes to find user's top interests
  let topThemes: string[] = [];
  try {
    const indexPath = join(homedir(), ".enso", "wiki", "_index.md");
    if (existsSync(indexPath)) {
      const idx = readFileSync(indexPath, "utf-8");
      const themeMatches = idx.matchAll(/Themes:\s*(.+)/g);
      const themeCounts: Record<string, number> = {};
      for (const m of themeMatches) {
        m[1].split(",").forEach(t => {
          const theme = t.trim().toLowerCase();
          if (theme) themeCounts[theme] = (themeCounts[theme] || 0) + 1;
        });
      }
      topThemes = Object.entries(themeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(e => e[0]);
    }
  } catch { /* ignore */ }

  // Score books by tag overlap with top themes
  const scored = unprocessed.map(book => {
    const bookTags = new Set((book.tags || []).map(t => t.toLowerCase()));
    let score = 0;
    for (const theme of topThemes) {
      if (bookTags.has(theme)) score += 3;
      // Partial match
      for (const tag of bookTags) {
        if (tag.includes(theme) || theme.includes(tag)) score += 1;
      }
    }
    // Bonus for enriched books (they have more metadata → better podcasts)
    if (bookTags.size > 3) score += 2;
    return { ...book, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, count).map(b => ({
    entityId: b.entityId,
    title: b.title,
    reason: `Matches your interests in ${topThemes.slice(0, 3).join(", ")}`,
  }));
}

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Build a rich HTML email for a processed book with summary + podcast link.
 */
export function buildEntityEmailHtml(processed: ProcessedContent, baseUrl: string, language?: string): string {
  // Detect language from title if not provided
  const nonLatin = (processed.title.match(/[^\u0000-\u007F]/g) ?? []).length;
  const isChinese = language === "zh" || language === "Chinese" || (nonLatin / Math.max(processed.title.length, 1) > 0.3);
  const L = {
    listenPodcast: isChinese ? "🎙️ 聆听AI播客" : "🎙️ Listen to the AI Podcast",
    playDownload: isChinese ? "▶ 播放 / 下载播客" : "▶ Play / Download Podcast",
    addToCortex: isChinese ? "📥 添加到知识库" : "📥 Add to My Cortex",
    addToCortexDesc: isChinese ? "喜欢这个推荐？保存到你的知识库。" : "Like this recommendation? Save it to your knowledge base.",
    coreThesis: isChinese ? "💡 核心论点" : "💡 Core Thesis",
    keyInsights: isChinese ? "🔑 核心洞见" : "🔑 Key Insights",
    chapterOverview: isChinese ? "📑 章节概览" : "📑 Chapter Overview",
    perspectives: isChinese ? "⚖️ 不同视角" : "⚖️ Different Perspectives",
    generatedBy: isChinese ? "由 Enso AI 智能生成" : "Generated by Enso AI",
    by: isChinese ? "著" : "by",
    min: isChinese ? "分钟" : "min",
  };
  const slug = slugFromEntityId(processed.entityId);
  const podcastUrl = `${baseUrl}/api/podcast/play/${slug}`;
  const r = processed.research;

  // Resolve enriched metadata — read directly from caches (no require() needed)
  let author = processed.author;
  let coverImageUrl = "";
  let entityType = "book";

  // Parse entity ID
  const eidParts = processed.entityId.split(":");
  if (eidParts.length >= 3) {
    entityType = eidParts[1];
  }
  const entitySource = eidParts[0] || "research";

  // Read cover from entity index file
  try {
    const idxPath = join(homedir(), ".enso", "data", "entity-index.json");
    if (existsSync(idxPath)) {
      const idx = JSON.parse(readFileSync(idxPath, "utf-8"));
      const entry = idx[processed.entityId];
      if (entry?.imageUrl) coverImageUrl = entry.imageUrl;
    }
  } catch { /* ignore */ }

  // Read metadata from source cache for author resolution
  let cachedBook: Record<string, unknown> | null = null;
  try {
    const cacheFile = entitySource === "kindle" ? "kindle-library.json" : entitySource === "weread" ? "weread-library.json" : "";
    if (cacheFile) {
      const cachePath = join(homedir(), ".enso", "data", "user-context", "cache", cacheFile);
      if (existsSync(cachePath)) {
        const cache = JSON.parse(readFileSync(cachePath, "utf-8"));
        cachedBook = (cache.books || []).find((b: Record<string, unknown>) => b.title === processed.title) || null;
        if (cachedBook) {
          if ((author === "Unknown" || !author) && cachedBook.author) author = String(cachedBook.author);
          if (!coverImageUrl && cachedBook.coverUrl) coverImageUrl = String(cachedBook.coverUrl);
        }
      }
    }
  } catch { /* ignore */ }

  // Fallback author from Cortex page
  if (author === "Unknown" || !author) {
    try {
      const PREFIXES: Record<string, string> = { book: "entities/", game: "entities/game-", movie: "entities/movie-", "tv-series": "entities/tv-" };
      const prefix = PREFIXES[entityType] || "entities/";
      const slug = eidParts.slice(2).join(":");
      const cortexPath = `${prefix}${slug}.md`;
      const fullPath = join(homedir(), ".enso", "wiki", cortexPath);
      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, "utf-8");
        const creatorMatch = content.match(/\*\*(?:By\s+)?(.+?)\*\*/);
        if (creatorMatch) {
          const extracted = creatorMatch[1].replace(/^By\s+/, "").trim();
          if (extracted && extracted !== "Unknown") author = extracted;
        }
      }
    } catch { /* ignore */ }
  }

  // Type-specific emoji and label
  const typeEmoji: Record<string, string> = { book: "📚", movie: "🎬", "tv-series": "📺", documentary: "🎬", game: "🎮", channel: "📺", article: "📰", place: "🌍" };
  const typeLabel: Record<string, string> = { book: isChinese ? "书籍" : "Book", movie: isChinese ? "电影" : "Film", "tv-series": isChinese ? "剧集" : "TV Series", game: isChinese ? "游戏" : "Game", channel: isChinese ? "频道" : "Channel", article: isChinese ? "文章" : "Article", place: isChinese ? "旅行目的地" : "Destination" };

  const quickAddUrl = `${baseUrl}/api/cortex/quick-add?title=${encodeURIComponent(processed.title)}&type=${encodeURIComponent(entityType)}&creator=${encodeURIComponent(author || "")}`;
  const esc = escapeHtml;

  // Resolve content access URL from cached book data (already loaded above)
  let contentUrl = "";
  let contentLabel = "";
  if (cachedBook) {
    if (entitySource === "kindle" && cachedBook.readerUrl) {
      contentUrl = String(cachedBook.readerUrl);
      contentLabel = isChinese ? "📖 在Kindle阅读" : "📖 Read on Kindle";
    } else if (entitySource === "weread" && cachedBook.wereadBookId) {
      try {
        const { encodeWereadBookId } = require("./entity-model.js") as { encodeWereadBookId: (id: string) => string };
        contentUrl = `https://weread.qq.com/web/bookDetail/${encodeWereadBookId(String(cachedBook.wereadBookId))}`;
      } catch {
        contentUrl = `https://weread.qq.com/web/bookDetail/${cachedBook.wereadBookId}`;
      }
      contentLabel = isChinese ? "📖 在微信读书阅读" : "📖 Read on WeRead";
    }
  }

  // Clean, modern email layout
  const parts: string[] = [];
  parts.push(`<div style="font-family:'Segoe UI',system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;background:#ffffff;">`);

  // Header — cover + title + badges + buttons
  parts.push(`<div style="padding:24px;background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 100%);border-bottom:2px solid #e0e7ff;">`);
  parts.push(`<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>`);
  if (coverImageUrl) {
    parts.push(`<td width="110" valign="top" style="padding-right:20px;">`);
    parts.push(`<img src="${esc(coverImageUrl)}" alt="${esc(processed.title)}" width="100" style="border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);" />`);
    parts.push(`</td>`);
  }
  parts.push(`<td valign="top">`);
  parts.push(`<h1 style="color:#111827;font-size:22px;margin:0 0 4px;line-height:1.3;font-weight:700;">${esc(processed.title)}</h1>`);
  if (author && author !== "Unknown") {
    parts.push(`<p style="font-size:15px;color:#4b5563;margin:0 0 10px;font-weight:400;">${esc(author)}</p>`);
  }
  // Badges
  parts.push(`<div style="margin-bottom:12px;">`);
  parts.push(`<span style="display:inline-block;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:600;padding:3px 10px;border-radius:12px;margin-right:6px;border:1px solid #c7d2fe;">${typeEmoji[entityType] || "🎯"} ${typeLabel[entityType] || entityType}</span>`);
  if (processed.durationMinutes) {
    parts.push(`<span style="display:inline-block;background:#faf5ff;color:#7c3aed;font-size:11px;font-weight:600;padding:3px 10px;border-radius:12px;border:1px solid #e9d5ff;">🎙️ ${processed.durationMinutes} ${L.min}</span>`);
  }
  parts.push(`</div>`);
  // Action buttons — larger, rounded, with shadows
  parts.push(`<table cellpadding="0" cellspacing="0" border="0"><tr>`);
  parts.push(`<td style="padding-right:8px;"><a href="${esc(podcastUrl)}" style="display:inline-block;background:#7c3aed;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;box-shadow:0 2px 4px rgba(124,58,237,0.3);">▶ ${isChinese ? "播放播客" : "Play Podcast"}</a></td>`);
  if (contentUrl) {
    parts.push(`<td style="padding-right:8px;"><a href="${esc(contentUrl)}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;box-shadow:0 2px 4px rgba(37,99,235,0.3);">${contentLabel}</a></td>`);
  }
  parts.push(`<td><a href="${esc(quickAddUrl)}" style="display:inline-block;background:#059669;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;box-shadow:0 2px 4px rgba(5,150,105,0.3);">${L.addToCortex}</a></td>`);
  parts.push(`</tr></table>`);
  parts.push(`</td></tr></table>`);
  parts.push(`</div>`);

  // Metadata section — rating, pages, publisher, categories
  {
    const metaItems: string[] = [];
    const bookMeta = cachedBook;
    {
      if (bookMeta) {
        if (bookMeta.rating) metaItems.push(`⭐ ${bookMeta.rating}${bookMeta.reviewCount ? ` (${Number(bookMeta.reviewCount).toLocaleString()})` : ""}`);
        if (bookMeta.pageCount) metaItems.push(`📄 ${bookMeta.pageCount} pages`);
        if (bookMeta.totalWords) metaItems.push(`📝 ${Math.round(Number(bookMeta.totalWords) / 10000)}万字`);
        if (bookMeta.publisher) metaItems.push(`📚 ${bookMeta.publisher}`);
        if (bookMeta.publicationDate || bookMeta.publishTime) metaItems.push(`📅 ${bookMeta.publicationDate || bookMeta.publishTime}`);
        if (bookMeta.categories && Array.isArray(bookMeta.categories)) {
          const cats = bookMeta.categories.slice(0, 3).map((c: unknown) => typeof c === "string" ? c : (c as Record<string, string>).title || String(c));
          if (cats.length) metaItems.push(`🏷️ ${cats.join(", ")}`);
        }
        if (bookMeta.isbn) metaItems.push(`ISBN: ${bookMeta.isbn}`);
      }
    }

    // Official description from cache
    if (bookMeta?.description) {
      parts.push(`<div style="padding:16px 24px 0;">`);
      parts.push(`<p style="font-size:13px;color:#374151;line-height:1.7;margin:0;">${esc(String(bookMeta.description).slice(0, 600))}${String(bookMeta.description).length > 600 ? "..." : ""}</p>`);
      parts.push(`</div>`);
    }

    // Metadata line
    if (metaItems.length > 0) {
      parts.push(`<div style="padding:12px 24px;font-size:12px;color:#6b7280;border-bottom:1px solid #f1f5f9;">`);
      parts.push(metaItems.join(` &nbsp;&nbsp;·&nbsp;&nbsp; `));
      parts.push(`</div>`);
    }
  }

  // Content sections
  parts.push(`<div style="padding:4px 24px 24px;">`);

  // Core Thesis
  if (r.coreThesis) {
    parts.push(`<div style="background:linear-gradient(135deg,#faf5ff 0%,#eef2ff 100%);border-left:4px solid #7c3aed;padding:16px 18px;margin:16px 0;border-radius:0 8px 8px 0;">`);
    parts.push(`<h2 style="color:#6d28d9;font-size:14px;margin:0 0 8px;font-weight:700;">${L.coreThesis}</h2>`);
    parts.push(`<p style="font-size:14px;line-height:1.7;color:#1f2937;margin:0;">${esc(r.coreThesis)}</p>`);
    parts.push(`</div>`);
  }

  // Key Insights
  if (r.keyInsights.length > 0) {
    parts.push(`<h2 style="color:#6d28d9;font-size:14px;margin:20px 0 12px;font-weight:700;">${L.keyInsights}</h2>`);
    for (const ins of r.keyInsights.slice(0, 6)) {
      parts.push(`<div style="border-left:3px solid #c4b5fd;padding:10px 14px;margin:0 0 10px;background:#faf5ff;border-radius:0 6px 6px 0;">`);
      parts.push(`<p style="font-size:14px;color:#1f2937;margin:0;line-height:1.6;font-weight:500;">${esc(ins.insight)}</p>`);
      if (ins.example) parts.push(`<p style="font-size:12px;color:#6b7280;font-style:italic;margin:6px 0 0;line-height:1.5;">${esc(ins.example)}</p>`);
      parts.push(`</div>`);
    }
  }

  // Chapter Summaries
  if (r.chapterSummaries.length > 0) {
    parts.push(`<h2 style="color:#6d28d9;font-size:14px;margin:20px 0 10px;font-weight:700;">${L.chapterOverview}</h2>`);
    parts.push(`<div style="background:#f8fafc;border-radius:8px;padding:4px 16px;border:1px solid #e5e7eb;">`);
    for (const ch of r.chapterSummaries.slice(0, 8)) {
      parts.push(`<div style="padding:8px 0;border-bottom:1px solid #f1f5f9;">`);
      parts.push(`<p style="margin:0;font-size:13px;"><strong style="color:#111827;">${esc(ch.chapter)}</strong></p>`);
      parts.push(`<p style="margin:2px 0 0;font-size:12px;color:#6b7280;line-height:1.5;">${esc(ch.summary.slice(0, 120))}${ch.summary.length > 120 ? "..." : ""}</p>`);
      parts.push(`</div>`);
    }
    if (r.chapterSummaries.length > 8) {
      parts.push(`<p style="font-size:12px;color:#9ca3af;margin:8px 0 4px;text-align:center;">+ ${r.chapterSummaries.length - 8} more chapters</p>`);
    }
    parts.push(`</div>`);
  }

  // Critical Perspectives
  if (Array.isArray(r.criticalPerspectives) && r.criticalPerspectives.length > 0) {
    parts.push(`<h2 style="color:#6d28d9;font-size:14px;margin:20px 0 10px;font-weight:700;">${L.perspectives}</h2>`);
    parts.push(`<div style="background:#fffbeb;border-radius:8px;padding:12px 16px;border:1px solid #fde68a;">`);
    for (const cp of r.criticalPerspectives.slice(0, 3)) {
      const cpText = typeof cp === "string" ? cp : typeof cp === "object" && cp !== null ? (cp as Record<string, unknown>).text || (cp as Record<string, unknown>).perspective || JSON.stringify(cp) : String(cp);
      const cpStr = String(cpText);
      parts.push(`<p style="font-size:13px;line-height:1.6;color:#92400e;margin:0 0 8px;">⚖️ ${esc(cpStr.slice(0, 200))}${cpStr.length > 200 ? "..." : ""}</p>`);
    }
    parts.push(`</div>`);
  }

  parts.push(`</div>`); // end content

  // Footer
  parts.push(`<div style="background:linear-gradient(135deg,#eef2ff 0%,#faf5ff 100%);padding:16px 24px;text-align:center;">`);
  parts.push(`<p style="font-size:11px;color:#7c3aed;margin:0;font-weight:500;">${L.generatedBy} • ${new Date(processed.processedAt).toLocaleDateString()}</p>`);
  parts.push(`</div>`);
  parts.push(`</div>`);

  return parts.join("\n");
}

// ── Shareable Page Builder ───────────────────────────────────────────────────

/**
 * Build a shareable page for a processed entity and register it.
 * Returns the page URL and short URL for sharing via email/WeChat.
 */
export function buildEntityPage(processed: ProcessedContent, baseUrl: string): { pageUrl: string; shortUrl: string } {
  const r = processed.research;
  const slug = slugFromEntityId(processed.entityId);
  const eidParts = processed.entityId.split(":");
  const entityType = eidParts[1] || "book";

  // Resolve cover and author
  let coverUrl = "";
  let author = processed.author;
  try {
    const idxPath = join(homedir(), ".enso", "data", "entity-index.json");
    if (existsSync(idxPath)) {
      const idx = JSON.parse(readFileSync(idxPath, "utf-8"));
      const entry = idx[processed.entityId];
      if (entry?.imageUrl) coverUrl = entry.imageUrl;
    }
  } catch { /* ignore */ }

  const typeEmoji: Record<string, string> = { book: "📚", movie: "🎬", "tv-series": "📺", game: "🎮", channel: "📺", article: "📰", place: "🌍" };
  const typeLabel: Record<string, string> = { book: "Book", movie: "Film", "tv-series": "TV Series", game: "Game", channel: "Channel", article: "Article", place: "Destination" };

  const sections: PageSection[] = [];

  if (r.coreThesis) {
    sections.push({ type: "text", title: "💡 Core Thesis", content: r.coreThesis, style: "blockquote" });
  }

  if (r.keyInsights?.length > 0) {
    sections.push({
      type: "list", title: "🔑 Key Insights",
      items: r.keyInsights.slice(0, 8).map((ins: { insight: string; example?: string }) => ({
        text: ins.insight, detail: ins.example,
      })),
    });
  }

  if (r.chapterSummaries?.length > 0) {
    sections.push({
      type: "list", title: "📑 Chapters",
      items: r.chapterSummaries.slice(0, 12).map((ch: { chapter: string; summary: string }) => ({
        text: ch.chapter, detail: ch.summary,
      })),
    });
  }

  if (Array.isArray(r.criticalPerspectives) && r.criticalPerspectives.length > 0) {
    sections.push({
      type: "list", title: "⚖️ Critical Perspectives",
      items: r.criticalPerspectives.map((cp: unknown) => ({
        text: String(typeof cp === "string" ? cp : (cp as Record<string, unknown>)?.text || cp),
      })),
    });
  }

  const podcastUrl = `${baseUrl}/api/podcast/play/${slug}`;
  const streamUrl = `${baseUrl}/api/podcast/stream/${slug}`;
  const quickAddUrl = `${baseUrl}/api/cortex/quick-add?title=${encodeURIComponent(processed.title)}&type=${encodeURIComponent(entityType)}&creator=${encodeURIComponent(author || "")}`;

  const actions = [
    { label: "▶ Play Podcast", url: podcastUrl, style: "primary" as const },
    { label: "⬇ Download", url: streamUrl, style: "outline" as const },
    { label: "📥 Add to Cortex", url: quickAddUrl, style: "success" as const },
  ];

  const subtitle = author && author !== "Unknown"
    ? `${author} · ${processed.durationMinutes} min podcast`
    : `${processed.durationMinutes} min AI podcast`;

  const config: PageConfig = {
    id: `entity-${slug}`,
    title: processed.title,
    subtitle,
    coverUrl,
    badge: { label: `${typeEmoji[entityType] || "🎯"} ${typeLabel[entityType] || entityType}` },
    audio: { src: `/api/podcast/stream/${slug}`, duration: `${processed.durationMinutes} min` },
    sections,
    actions,
    footer: `Generated by Enso AI · ${new Date(processed.processedAt).toLocaleDateString()}`,
    meta: { description: r.coreThesis?.slice(0, 200), image: coverUrl },
  };

  return registerPage(config, baseUrl);
}

// Backward compatibility aliases (for existing book-podcast.ts callers)
export const researchBook = researchEntity;
export const generateBookPodcast = generateDeepContent;
export const processBookBatch = processEntityBatch;
export const getProcessedBook = getProcessedContent;
export const deleteProcessedBook = deleteProcessedContent;
export const isBookProcessed = isContentProcessed;
export const listProcessedBooks = listProcessedContent;
export const buildBookEmailHtml = buildEntityEmailHtml;
export const recommendUnprocessedBooks = recommendUnprocessedEntities;
export type BookResearchResult = EntityResearchResult;
export type ProcessedBook = ProcessedContent;
