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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { readdirSync } from "node:fs";
import { logAction, logError } from "./action-log.js";
import { llm } from "./llm.js";
import { renderPodcastAudio, pcmToWav } from "./podcast.js";
import { resolveEntity, type EntityId } from "./entity-model.js";
import { braveWebSearch, fetchPageContent } from "./researcher-tools.js";

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

export interface ProcessedContent {
  entityId: string;
  title: string;
  author: string;
  contentType: string;
  entityType?: string;
  processedAt: string;
  research: EntityResearchResult;
  outline: PodcastOutline;
  script: string;
  audioUrl: string;
  audioSizeBytes: number;
  durationMinutes: number;
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
      `"${title}" book review analysis`,
      `"${title}" chapter by chapter breakdown`,
      `"${title}" criticism counterarguments perspectives`,
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
    ],
    synthesisHint: "TV critic analyzing story arcs, character development, production quality, and cultural impact",
  },
  channel: {
    searchQueries: (title, meta) => [
      `"${title}" youtube channel content analysis`,
      `"${title}" youtube best videos recommendations`,
      `${meta.category || ""} youtube content creators strategy`,
      `"${title}" subscriber community engagement`,
    ],
    synthesisHint: "YouTube content analyst examining content strategy, audience engagement, production quality, and growth",
  },
  project: {
    searchQueries: (title, meta) => [
      `"${title}" project architecture documentation`,
      `"${title}" ${(meta.technologies as string[])?.[0] || ""} analysis`,
      `"${title}" github alternatives comparison`,
      `"${title}" tutorial getting started`,
    ],
    synthesisHint: "software architect analyzing architecture, code quality, ecosystem positioning, and developer experience",
  },
  article: {
    searchQueries: (title, meta) => [
      `"${title}" ${meta.author || ""} article`,
      `"${title}" analysis key points`,
      `"${title}" implications discussion`,
      `${meta.author || ""} related articles insights`,
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
  return entityId.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 80);
}

// ─── Cache ───────────────────────────────────────────────────────────────────

export function getProcessedContent(entityId: string): ProcessedContent | null {
  ensureDirs();
  const slug = slugFromEntityId(entityId);

  // Search in both new (deep-content/) and old (kindle/podcasts/) directories
  const OLD_KINDLE_DIR = join(homedir(), ".enso", "data", "kindle", "podcasts");
  const searchDirs = [CONTENT_DIR, OLD_KINDLE_DIR];

  for (const dir of searchDirs) {
    // Try exact match first
    const exactPath = join(dir, `${slug}.json`);
    try {
      if (existsSync(exactPath)) {
        return JSON.parse(readFileSync(exactPath, "utf-8")) as ProcessedContent;
      }
    } catch { /* continue */ }

    // Try prefix match (handles different slug truncation lengths)
    try {
      if (existsSync(dir)) {
        const files = readdirSync(dir);
        // Slug prefix: first 40 chars should be enough to match uniquely
        const prefix = slug.slice(0, 40);
        const match = files.find(f => f.startsWith(prefix) && f.endsWith(".json"));
        if (match) {
          return JSON.parse(readFileSync(join(dir, match), "utf-8")) as ProcessedContent;
        }
      }
    } catch { /* continue */ }
  }

  return null;
}

export function isContentProcessed(entityId: string): boolean {
  return getProcessedContent(entityId) !== null;
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

function saveProcessedContent(book: ProcessedContent): void {
  ensureDirs();
  const slug = slugFromEntityId(book.entityId);
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
    return { ...src, content: content.slice(0, 4000) }; // Allow longer content for books
  });
  const sourcesWithContent = await Promise.all(contentPromises);
  const richSources = sourcesWithContent.filter(s => s.content.length > 100);

  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Extracted content from ${richSources.length} sources for "${title}"` });
  onProgress?.({ phase: "researching", detail: `Synthesizing ${richSources.length} sources into analysis...` });

  // Build synthesis prompt
  const sourcesText = richSources.map((s, i) =>
    `[Source ${i}] ${s.title}\nURL: ${s.url}\n${s.content || s.description}`
  ).join("\n\n---\n\n");

  const userContext = relatedEntityTitles?.length
    ? `\nUser's related interests: ${relatedEntityTitles.join(", ")}`
    : "";

  const cortexContext = cortexContent
    ? `\nExisting knowledge about this content:\n${cortexContent.slice(0, 2000)}`
    : "";

  const langRule = lang !== "English" ? `\n\nCRITICAL LANGUAGE RULE: ALL output text MUST be written in ${lang}. All chapter summaries, insights, thesis, perspectives, author background — EVERYTHING must be in ${lang}. Do NOT write in English.` : "";

  const synthesisPrompt = `You are a ${profile.synthesisHint} creating an exhaustive deep-dive into "${title}" by ${author}. Your goal is to capture the FULL essence of this content — every major idea, argument, and insight.${langRule}
${userContext}${cortexContext}

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

  // Render segments with concurrency limit of 5
  const pcmBuffers: Buffer[] = new Array(allSegments.length).fill(Buffer.alloc(0));
  const concurrency = 5;

  let completed = 0;
  for (let i = 0; i < allSegments.length; i += concurrency) {
    const batch = allSegments.slice(i, i + concurrency);
    const promises = batch.map((seg, j) => {
      const idx = i + j;
      return renderPodcastAudio(seg, geminiKey).then(buf => {
        pcmBuffers[idx] = buf;
        completed++;
        onProgress?.(completed - 1, allSegments.length);
      }).catch(err => {
        logError("book-podcast", `Failed to render segment ${idx}`, err);
        completed++;
        onProgress?.(completed - 1, allSegments.length);
        // pcmBuffers[idx] stays as empty Buffer — segment skipped
      });
    });

    await Promise.all(promises);
  }

  // Concatenate PCM in order (preserves audio sequence) and wrap with WAV header
  const totalPcm = Buffer.concat(pcmBuffers.filter(b => b.length > 0));
  return pcmToWav(totalPcm);
}

// ─── Full Pipeline ───────────────────────────────────────────────────────────

export async function generateDeepContent(params: {
  entityId: EntityId;
  language?: string;
  onProgress?: (progress: DeepContentProgress) => void;
}): Promise<ProcessedContent> {
  const { entityId, language, onProgress } = params;
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

  // Check cache first
  const cached = getProcessedContent(entityId);
  if (cached) {
    logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Cache hit for ${entityId}` });
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

  // Get related entity titles from entity index
  const { getEntitiesBySource } = await import("./entity-model.js");
  const relatedTitles = getEntitiesBySource("kindle" as never, 10)
    .filter(e => e.entityId !== entityId)
    .map(e => e.title)
    .slice(0, 5);

  const contentLanguage = resolveLanguage(title);
  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Starting pipeline for "${title}" by ${author} [lang=${contentLanguage}]` });

  // Phase 1: Research
  onProgress?.({ phase: "researching", detail: "Searching the web...", percentComplete: 5 });
  const research = await researchEntity({
    entityId, title, author, description, categories,
    cortexContent, relatedEntityTitles: relatedTitles,
    language: contentLanguage,
    onProgress,
  });

  // Phase 2: Outline
  onProgress?.({ phase: "generating_outline", detail: "Planning podcast structure...", percentComplete: 25 });
  const outline = await generatePodcastOutline(title, author, research, contentLanguage);

  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Outline: ${outline.sections.length} sections, ~${outline.estimatedMinutes} min for "${title}"` });

  // Phase 3: Script
  const { fullScript, sectionScripts } = await generateFullScript(
    title, author, outline, research, contentLanguage,
    (sectionIdx, total) => {
      const pct = 30 + Math.round((sectionIdx / total) * 30);
      onProgress?.({
        phase: "writing_section",
        detail: `Writing section ${sectionIdx + 1}/${total}: "${outline.sections[sectionIdx]?.title}"`,
        sectionIndex: sectionIdx,
        totalSections: total,
        percentComplete: pct,
      });
    },
  );

  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Script complete: ${fullScript.length} chars for "${title}"` });

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

  // Save audio
  ensureDirs();
  const slug = slugFromEntityId(entityId);
  const audioPath = join(AUDIO_DIR, `${slug}.wav`);
  writeFileSync(audioPath, wavData);

  const { toMediaUrl } = await import("./server.js");
  const audioUrl = toMediaUrl(audioPath);

  // Estimate duration: 24000 samples/sec * 2 bytes/sample = 48000 bytes/sec
  const durationMinutes = Math.round((wavData.length - 44) / 48000 / 60 * 10) / 10;

  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Podcast complete for "${title}": ${durationMinutes} min, ${wavData.length} bytes` });

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
    script: fullScript,
    audioUrl,
    audioSizeBytes: wavData.length,
    durationMinutes,
  };

  // Persist
  saveProcessedContent(processed);
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
      const result = await generateDeepContent({
        entityId,
        onProgress: (progress) => {
          onBookProgress?.(i, entityIds.length, result?.title ?? entityId, progress);
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

  if (!allResults.length) {
    logAction({ ts: Date.now(), type: "action", category: "book-discovery", message: "Web search returned no results" });
    return [];
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
  const prompt = `You are a personal book curator. Your client's top interests are: ${topThemes.join(", ")}.${langInstruction}

They already own these books (DO NOT recommend any of these): ${existingList || "none known"}

They already have AI podcasts for these books (DO NOT recommend these or any variant/edition of these): ${processedList || "none"}

Based on these web search results about recommended books:

${enriched.join("\n\n---\n\n")}

Select ${Math.max(count + 2, 3)} book(s) that would be most valuable and thought-provoking for this person. Pick books that:
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
    for (const book of parsed.books.slice(0, count + 3)) { // request extras in case some get filtered
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  const podcastUrl = `${baseUrl}/api/podcast/stream/${slug}`;
  const r = processed.research;

  // Resolve enriched metadata for proper author/creator and cover image
  let author = processed.author;
  let coverImageUrl = "";
  let entityType = "book";
  try {
    const { parseEntityId, lookupEntity } = require("./entity-model.js") as { parseEntityId: (id: string) => { type: string; source: string } | null; lookupEntity: (id: string) => { imageUrl?: string; tags?: string[] } | undefined };
    const parsed = parseEntityId(processed.entityId);
    if (parsed) entityType = parsed.type;
    const entity = lookupEntity(processed.entityId);
    if (entity?.imageUrl) coverImageUrl = entity.imageUrl;
  } catch { /* ignore */ }

  // If author is "Unknown", try to extract from the Cortex page
  if (author === "Unknown" || !author) {
    try {
      const { entityCortexPath } = require("./entity-model.js") as { entityCortexPath: (id: string) => string | undefined };
      const cortexPath = entityCortexPath(processed.entityId);
      if (cortexPath) {
        const fullPath = join(homedir(), ".enso", "wiki", cortexPath);
        if (existsSync(fullPath)) {
          const content = readFileSync(fullPath, "utf-8");
          const creatorMatch = content.match(/\*\*(?:By\s+)?(.+?)\*\*/);
          if (creatorMatch) {
            const extracted = creatorMatch[1].replace(/^By\s+/, "").trim();
            if (extracted && extracted !== "Unknown") author = extracted;
          }
          // Also try to find creator in details
          const detailMatch = content.match(/- \*\*(?:Creator|Director|Developer|Author)\*\*: (.+)/);
          if (detailMatch && (author === "Unknown" || !author)) author = detailMatch[1].trim();
        }
      }
    } catch { /* ignore */ }
  }

  // Type-specific emoji and label
  const typeEmoji: Record<string, string> = { book: "📚", movie: "🎬", "tv-series": "📺", documentary: "🎬", game: "🎮", channel: "📺", article: "📰", place: "🌍" };
  const typeLabel: Record<string, string> = { book: isChinese ? "书籍" : "Book", movie: isChinese ? "电影" : "Film", "tv-series": isChinese ? "剧集" : "TV Series", game: isChinese ? "游戏" : "Game", channel: isChinese ? "频道" : "Channel", article: isChinese ? "文章" : "Article", place: isChinese ? "旅行目的地" : "Destination" };

  const parts: string[] = [];
  parts.push(`<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;background:#f8fafc;padding:24px;border-radius:12px;">`);

  // Header with cover image
  if (coverImageUrl) {
    parts.push(`<div style="text-align:center;margin-bottom:16px;">`);
    parts.push(`<img src="${escapeHtml(coverImageUrl)}" alt="${escapeHtml(processed.title)}" style="max-width:280px;max-height:400px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);" />`);
    parts.push(`</div>`);
  }

  // Type badge + Title + Author
  parts.push(`<div style="margin-bottom:4px;"><span style="display:inline-block;background:#e0e7ff;color:#3730a3;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;">${typeEmoji[entityType] || "🎯"} ${typeLabel[entityType] || entityType}</span></div>`);
  parts.push(`<h1 style="color:#1e40af;font-size:22px;margin:4px 0;">${escapeHtml(processed.title)}</h1>`);
  if (author && author !== "Unknown") {
    parts.push(`<p style="font-size:14px;color:#6b7280;margin-top:0;">${L.by} ${escapeHtml(author)}</p>`);
  }
  parts.push(`<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />`);

  // Podcast CTA
  parts.push(`<div style="background:#7c3aed;color:white;padding:16px;border-radius:8px;margin-bottom:16px;text-align:center;">`);
  parts.push(`<p style="margin:0 0 8px;font-size:16px;font-weight:600;">${L.listenPodcast} (${processed.durationMinutes} ${L.min})</p>`);
  parts.push(`<a href="${escapeHtml(podcastUrl)}" style="display:inline-block;background:white;color:#7c3aed;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">${L.playDownload}</a>`);
  parts.push(`</div>`);

  // Add to Cortex CTA
  const quickAddUrl = `${baseUrl}/api/cortex/quick-add?title=${encodeURIComponent(processed.title)}&type=${encodeURIComponent(entityType)}&creator=${encodeURIComponent(author || "")}`;
  parts.push(`<div style="background:#059669;color:white;padding:12px 16px;border-radius:8px;margin-bottom:16px;text-align:center;">`);
  parts.push(`<p style="margin:0 0 6px;font-size:13px;">${L.addToCortexDesc}</p>`);
  parts.push(`<a href="${escapeHtml(quickAddUrl)}" style="display:inline-block;background:white;color:#059669;padding:8px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">${L.addToCortex}</a>`);
  parts.push(`</div>`);

  // Core Thesis
  if (r.coreThesis) {
    parts.push(`<h2 style="color:#1e40af;font-size:16px;margin-bottom:8px;">${L.coreThesis}</h2>`);
    parts.push(`<p style="font-size:14px;line-height:1.6;color:#374151;">${escapeHtml(r.coreThesis)}</p>`);
  }

  // Key Insights
  if (r.keyInsights.length > 0) {
    parts.push(`<h2 style="color:#1e40af;font-size:16px;margin-bottom:8px;">${L.keyInsights}</h2>`);
    parts.push(`<ul style="padding-left:20px;">`);
    for (const ins of r.keyInsights.slice(0, 8)) {
      parts.push(`<li style="font-size:13px;line-height:1.5;margin-bottom:6px;color:#374151;">${escapeHtml(ins.insight)}`);
      if (ins.example) parts.push(`<br/><span style="color:#6b7280;font-style:italic;font-size:12px;">${escapeHtml(ins.example)}</span>`);
      parts.push(`</li>`);
    }
    parts.push(`</ul>`);
  }

  // Chapter Summaries
  if (r.chapterSummaries.length > 0) {
    parts.push(`<h2 style="color:#1e40af;font-size:16px;margin-bottom:8px;">${L.chapterOverview}</h2>`);
    for (const ch of r.chapterSummaries.slice(0, 12)) {
      parts.push(`<p style="margin-bottom:8px;"><strong style="color:#1e40af;font-size:13px;">${escapeHtml(ch.chapter)}</strong><br/>`);
      parts.push(`<span style="font-size:12px;color:#374151;line-height:1.5;">${escapeHtml(ch.summary)}</span></p>`);
    }
  }

  // Critical Perspectives
  if (r.criticalPerspectives.length > 0) {
    parts.push(`<h2 style="color:#1e40af;font-size:16px;margin-bottom:8px;">${L.perspectives}</h2>`);
    parts.push(`<ul style="padding-left:20px;">`);
    for (const cp of r.criticalPerspectives) {
      parts.push(`<li style="font-size:12px;line-height:1.5;margin-bottom:4px;color:#92400e;">${escapeHtml(cp)}</li>`);
    }
    parts.push(`</ul>`);
  }

  // Footer
  parts.push(`<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />`);
  parts.push(`<p style="font-size:11px;color:#9ca3af;text-align:center;">${L.generatedBy} • ${new Date(processed.processedAt).toLocaleDateString()}</p>`);
  parts.push(`</div>`);

  return parts.join("\n");
}

// Backward compatibility aliases (for existing book-podcast.ts callers)
export const researchBook = researchEntity;
export const generateBookPodcast = generateDeepContent;
export const processBookBatch = processEntityBatch;
export const getProcessedBook = getProcessedContent;
export const isBookProcessed = isContentProcessed;
export const listProcessedBooks = listProcessedContent;
export const buildBookEmailHtml = buildEntityEmailHtml;
export const recommendUnprocessedBooks = recommendUnprocessedEntities;
export type BookResearchResult = EntityResearchResult;
export type ProcessedBook = ProcessedContent;
