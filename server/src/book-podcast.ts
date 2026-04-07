/**
 * book-podcast.ts — Book Intelligence Pipeline for the Kindle app.
 *
 * Deeply researches books via web search, generates long-form podcast scripts
 * (5-30+ min), renders multi-speaker audio via Gemini TTS, and caches results.
 *
 * Three entry points:
 *   1. Single book: onAction("book_podcast", { entityId }) from entity detail
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

export interface BookResearchResult {
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

export interface ProcessedBook {
  entityId: string;
  title: string;
  author: string;
  processedAt: string;
  research: BookResearchResult;
  outline: PodcastOutline;
  script: string;
  audioUrl: string;
  audioSizeBytes: number;
  durationMinutes: number;
}

export type BookPodcastPhase =
  | "researching" | "generating_outline" | "writing_section"
  | "rendering_audio" | "stitching" | "complete" | "error";

export interface BookPodcastProgress {
  phase: BookPodcastPhase;
  detail?: string;
  sectionIndex?: number;
  totalSections?: number;
  percentComplete?: number;
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const PODCAST_DIR = join(homedir(), ".enso", "data", "kindle", "podcasts");
const AUDIO_DIR = join(homedir(), ".enso", "data", "kindle", "audio");

function ensureDirs(): void {
  if (!existsSync(PODCAST_DIR)) mkdirSync(PODCAST_DIR, { recursive: true });
  if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });
}

function slugFromEntityId(entityId: string): string {
  return entityId.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 80);
}

// ─── Cache ───────────────────────────────────────────────────────────────────

export function getProcessedBook(entityId: string): ProcessedBook | null {
  ensureDirs();
  const slug = slugFromEntityId(entityId);
  const path = join(PODCAST_DIR, `${slug}.json`);
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as ProcessedBook;
  } catch { return null; }
}

export function isBookProcessed(entityId: string): boolean {
  return getProcessedBook(entityId) !== null;
}

export function listProcessedBooks(): string[] {
  ensureDirs();
  try {
    return readdirSync(PODCAST_DIR)
      .filter(f => f.endsWith(".json"))
      .map(f => {
        try {
          const data = JSON.parse(readFileSync(join(PODCAST_DIR, f), "utf-8"));
          return data.entityId as string;
        } catch { return null; }
      })
      .filter(Boolean) as string[];
  } catch { return []; }
}

function saveProcessedBook(book: ProcessedBook): void {
  ensureDirs();
  const slug = slugFromEntityId(book.entityId);
  writeFileSync(join(PODCAST_DIR, `${slug}.json`), JSON.stringify(book, null, 2));
}

// ─── Phase 1: Book Research ──────────────────────────────────────────────────

export async function researchBook(params: {
  entityId: string;
  title: string;
  author: string;
  description?: string;
  categories?: string[];
  cortexContent?: string;
  relatedEntityTitles?: string[];
  onProgress?: (progress: BookPodcastProgress) => void;
}): Promise<BookResearchResult> {
  const { title, author, categories, cortexContent, relatedEntityTitles, onProgress } = params;
  onProgress?.({ phase: "researching", detail: "Searching the web for book content..." });

  // Generate targeted search queries
  const queries = [
    `"${title}" by ${author} chapter summary`,
    `"${title}" by ${author} key themes main arguments`,
    `"${title}" book review analysis insights`,
    `"${title}" chapter by chapter breakdown`,
    `${author} "${title}" core thesis arguments`,
    `"${title}" criticism counterarguments different perspectives`,
  ];
  // Add category-specific query if available
  if (categories?.length) {
    queries.push(`"${title}" ${categories[0]} implications applications`);
  }

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
  onProgress?.({ phase: "researching", detail: `Synthesizing ${richSources.length} sources into book analysis...` });

  // Build synthesis prompt
  const sourcesText = richSources.map((s, i) =>
    `[Source ${i}] ${s.title}\nURL: ${s.url}\n${s.content || s.description}`
  ).join("\n\n---\n\n");

  const userContext = relatedEntityTitles?.length
    ? `\nUser's related interests: ${relatedEntityTitles.join(", ")}`
    : "";

  const cortexContext = cortexContent
    ? `\nExisting knowledge about this book:\n${cortexContent.slice(0, 2000)}`
    : "";

  const synthesisPrompt = `You are a book analysis expert creating an exhaustive deep-dive into "${title}" by ${author}. Your goal is to capture the FULL essence of this book — every major idea, argument, and insight.
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

    const result: BookResearchResult = {
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
  research: BookResearchResult,
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
- Each section should feel like a natural podcast segment
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
  research: BookResearchResult;
  previousEnding?: string;
  sectionIndex: number;
  totalSections: number;
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
- IMPORTANT: Write at LEAST ${targetChars} characters. This section should feel substantive, not rushed.
- Output ONLY the dialogue script`;

  const script = await llm({ prompt, tier: "pro", timeoutMs: 90_000, maxOutputTokens: 8192 });
  return script?.trim() ?? "";
}

export async function generateFullScript(
  title: string,
  author: string,
  outline: PodcastOutline,
  research: BookResearchResult,
  onProgress?: (sectionIndex: number, totalSections: number) => void,
): Promise<{ fullScript: string; sectionScripts: string[] }> {
  const sectionScripts: string[] = [];
  let previousEnding = "";

  for (let i = 0; i < outline.sections.length; i++) {
    onProgress?.(i, outline.sections.length);

    const script = await generateSectionScript({
      title,
      author,
      section: outline.sections[i],
      research,
      previousEnding,
      sectionIndex: i,
      totalSections: outline.sections.length,
    });

    sectionScripts.push(script);
    // Capture last 200 chars for continuity
    previousEnding = script.slice(-200);
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

  // Render segments with concurrency limit of 3
  const pcmBuffers: Buffer[] = [];
  const concurrency = 3;

  for (let i = 0; i < allSegments.length; i += concurrency) {
    const batch = allSegments.slice(i, i + concurrency);
    const promises = batch.map((seg, j) => {
      const idx = i + j;
      onProgress?.(idx, allSegments.length);
      return renderPodcastAudio(seg, geminiKey).catch(err => {
        logError("book-podcast", `Failed to render segment ${idx}`, err);
        return Buffer.alloc(0); // Skip failed segments
      });
    });

    const results = await Promise.all(promises);
    pcmBuffers.push(...results.filter(b => b.length > 0));
  }

  // Concatenate PCM and wrap with WAV header
  const totalPcm = Buffer.concat(pcmBuffers);
  return pcmToWav(totalPcm);
}

// ─── Full Pipeline ───────────────────────────────────────────────────────────

export async function generateBookPodcast(params: {
  entityId: EntityId;
  onProgress?: (progress: BookPodcastProgress) => void;
}): Promise<ProcessedBook> {
  const { entityId, onProgress } = params;

  // Check cache first
  const cached = getProcessedBook(entityId);
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

  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Starting pipeline for "${title}" by ${author}` });

  // Phase 1: Research
  onProgress?.({ phase: "researching", detail: "Searching the web...", percentComplete: 5 });
  const research = await researchBook({
    entityId, title, author, description, categories,
    cortexContent, relatedEntityTitles: relatedTitles,
    onProgress,
  });

  // Phase 2: Outline
  onProgress?.({ phase: "generating_outline", detail: "Planning podcast structure...", percentComplete: 25 });
  const outline = await generatePodcastOutline(title, author, research);

  logAction({ ts: Date.now(), type: "action", category: "book-podcast", message: `Outline: ${outline.sections.length} sections, ~${outline.estimatedMinutes} min for "${title}"` });

  // Phase 3: Script
  const { fullScript, sectionScripts } = await generateFullScript(
    title, author, outline, research,
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
  const processed: ProcessedBook = {
    entityId,
    title,
    author,
    processedAt: new Date().toISOString(),
    research,
    outline,
    script: fullScript,
    audioUrl,
    audioSizeBytes: wavData.length,
    durationMinutes,
  };

  // Persist
  saveProcessedBook(processed);
  onProgress?.({ phase: "complete", percentComplete: 100 });

  return processed;
}

// ─── Batch Processing ────────────────────────────────────────────────────────

export async function processBookBatch(params: {
  entityIds: string[];
  onBookProgress?: (bookIndex: number, totalBooks: number, bookTitle: string, progress: BookPodcastProgress) => void;
}): Promise<{ processed: number; failed: number; results: Array<{ entityId: string; success: boolean; error?: string }> }> {
  const { entityIds, onBookProgress } = params;
  const results: Array<{ entityId: string; success: boolean; error?: string }> = [];
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < entityIds.length; i++) {
    const entityId = entityIds[i];
    try {
      const result = await generateBookPodcast({
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

// ─── Book Recommendations (for scheduled tasks) ────────────────────────────

/**
 * Select N unprocessed books that best match the user's Cortex interests.
 * Uses tag overlap between books and Cortex theme distribution.
 */
export async function recommendUnprocessedBooks(count = 3): Promise<Array<{ entityId: string; title: string; reason: string }>> {
  const { getEntitiesBySource } = await import("./entity-model.js");
  const allBooks = getEntitiesBySource("kindle" as never, 500);
  const processedIds = new Set(listProcessedBooks());

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
export function buildBookEmailHtml(processed: ProcessedBook, baseUrl: string): string {
  const slug = slugFromEntityId(processed.entityId);
  const podcastUrl = `${baseUrl}/api/podcast/stream/${slug}`;
  const r = processed.research;

  const parts: string[] = [];
  parts.push(`<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;background:#f8fafc;padding:24px;border-radius:12px;">`);

  // Header
  parts.push(`<h1 style="color:#1e40af;font-size:22px;margin-bottom:4px;">${escapeHtml(processed.title)}</h1>`);
  parts.push(`<p style="font-size:14px;color:#6b7280;margin-top:0;">by ${escapeHtml(processed.author)}</p>`);
  parts.push(`<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />`);

  // Podcast CTA
  parts.push(`<div style="background:#7c3aed;color:white;padding:16px;border-radius:8px;margin-bottom:16px;text-align:center;">`);
  parts.push(`<p style="margin:0 0 8px;font-size:16px;font-weight:600;">🎙️ Listen to the AI Podcast (${processed.durationMinutes} min)</p>`);
  parts.push(`<a href="${escapeHtml(podcastUrl)}" style="display:inline-block;background:white;color:#7c3aed;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">▶ Play / Download Podcast</a>`);
  parts.push(`</div>`);

  // Core Thesis
  if (r.coreThesis) {
    parts.push(`<h2 style="color:#1e40af;font-size:16px;margin-bottom:8px;">💡 Core Thesis</h2>`);
    parts.push(`<p style="font-size:14px;line-height:1.6;color:#374151;">${escapeHtml(r.coreThesis)}</p>`);
  }

  // Key Insights
  if (r.keyInsights.length > 0) {
    parts.push(`<h2 style="color:#1e40af;font-size:16px;margin-bottom:8px;">🔑 Key Insights</h2>`);
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
    parts.push(`<h2 style="color:#1e40af;font-size:16px;margin-bottom:8px;">📑 Chapter Overview</h2>`);
    for (const ch of r.chapterSummaries.slice(0, 12)) {
      parts.push(`<p style="margin-bottom:8px;"><strong style="color:#1e40af;font-size:13px;">${escapeHtml(ch.chapter)}</strong><br/>`);
      parts.push(`<span style="font-size:12px;color:#374151;line-height:1.5;">${escapeHtml(ch.summary)}</span></p>`);
    }
  }

  // Critical Perspectives
  if (r.criticalPerspectives.length > 0) {
    parts.push(`<h2 style="color:#1e40af;font-size:16px;margin-bottom:8px;">⚖️ Different Perspectives</h2>`);
    parts.push(`<ul style="padding-left:20px;">`);
    for (const cp of r.criticalPerspectives) {
      parts.push(`<li style="font-size:12px;line-height:1.5;margin-bottom:4px;color:#92400e;">${escapeHtml(cp)}</li>`);
    }
    parts.push(`</ul>`);
  }

  // Footer
  parts.push(`<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />`);
  parts.push(`<p style="font-size:11px;color:#9ca3af;text-align:center;">Generated by Enso Book Intelligence • ${new Date(processed.processedAt).toLocaleDateString()}</p>`);
  parts.push(`</div>`);

  return parts.join("\n");
}
