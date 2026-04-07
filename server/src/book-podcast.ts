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

  const synthesisPrompt = `You are a book analysis expert. Given web sources about the book "${title}" by ${author}, synthesize a comprehensive research result.
${userContext}${cortexContext}

SOURCES:
${sourcesText}

Respond in JSON format:
{
  "chapterSummaries": [{ "chapter": "Chapter N: Title", "summary": "2-3 sentence summary" }],
  "coreThesis": "The book's central argument in 2-3 sentences",
  "keyThemes": ["theme1", "theme2", ...],
  "keyInsights": [{ "insight": "Key insight text", "example": "Supporting example or quote" }],
  "criticalPerspectives": ["criticism or alternative viewpoint 1", ...],
  "authorBackground": "Brief author bio and credibility",
  "estimatedDepth": "light|moderate|rich"
}

Rules:
- Extract as many chapter summaries as the sources support (aim for completeness)
- Include 5-10 key insights with specific examples where possible
- Include 2-4 critical perspectives or counterarguments
- If sources are thin, set estimatedDepth to "light"; if rich with chapter details, "rich"
- All content must be factual and sourced from the provided materials
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
  const depthConfig = {
    light: { minSections: 3, maxSections: 4, targetMinutes: 6 },
    moderate: { minSections: 5, maxSections: 7, targetMinutes: 14 },
    rich: { minSections: 8, maxSections: 12, targetMinutes: 25 },
  };
  const config = depthConfig[research.estimatedDepth];
  const charsPerMinute = 150; // ~150 dialogue chars per minute of audio

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
    // Fallback outline
    return {
      estimatedMinutes: config.targetMinutes,
      sections: [
        { id: "intro", title: "Introduction", purpose: "Why this book matters", targetCharCount: 600, keyPoints: [research.coreThesis] },
        { id: "themes", title: "Key Themes", purpose: "Main themes and arguments", targetCharCount: 900, keyPoints: research.keyThemes.slice(0, 5) },
        { id: "insights", title: "Key Insights", purpose: "Most important takeaways", targetCharCount: 900, keyPoints: research.keyInsights.slice(0, 5).map(i => i.insight) },
        { id: "takeaways", title: "Final Takeaways", purpose: "Summary and listener relevance", targetCharCount: 600, keyPoints: ["Synthesis", "Recommendations"] },
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

  const prompt = `You are writing section ${sectionIndex + 1} of ${totalSections} for a podcast about "${title}" by ${author}.

SECTION: "${section.title}"
PURPOSE: ${section.purpose}
KEY POINTS TO COVER: ${section.keyPoints.join(", ")}
TARGET LENGTH: ~${section.targetCharCount} characters of dialogue

BOOK CONTEXT:
Core Thesis: ${research.coreThesis}
${relevantChapters ? `\nChapter Summaries:\n${relevantChapters}` : ""}
${relevantInsights ? `\nKey Insights:\n${relevantInsights}` : ""}
${section.id === "criticism" || section.id === "perspectives" ? `\nCritical Perspectives:\n- ${criticalPoints}` : ""}
${previousEnding ? `\nPREVIOUS SECTION ENDED WITH: "${previousEnding}"` : ""}

Rules:
- Use "Host A:" and "Host B:" speaker tags (one per line)
- Host A drives conversation; Host B adds depth and challenges
- ${sectionIndex === 0 ? "Start with an engaging hook about the book" : "Transition naturally from the previous section"}
- ${sectionIndex === totalSections - 1 ? "End with clear takeaways and a warm sign-off" : "End with a natural transition to the next topic"}
- Reference specific examples, data points, and chapter content
- Keep it conversational — reactions, follow-ups, genuine curiosity
- Target ~${section.targetCharCount} characters
- Output ONLY the dialogue script`;

  const script = await llm({ prompt, tier: "utility", timeoutMs: 45_000, maxOutputTokens: 4096 });
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
