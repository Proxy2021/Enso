import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getDocCollection, type DocMeta } from "./persistence.js";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

// ── Param types ──

type SearchParams = { topic: string; depth?: "quick" | "standard" | "deep"; force?: boolean };
type DeepDiveParams = { topic: string; subtopic: string };
type CompareParams = { topicA: string; topicB: string; context?: string };
type FollowUpParams = { topic: string; question: string };
type SendReportParams = {
  recipient: string;
  topic: string;
  summary?: string;
  narrative?: string;
  keyFindings?: KeyFinding[];
  sections?: ResearchSection[];
  sources?: Source[];
  images?: ResearchImage[];
  videos?: ResearchVideo[];
};

// ── Shared data types ──

interface Source {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  relevance: number;
}

interface KeyFinding {
  text: string;
  type: "fact" | "trend" | "insight" | "warning";
  confidence: "high" | "medium" | "low";
  sourceRefs: number[];
}

interface ResearchSection {
  title: string;
  summary: string;
  bullets: string[];
  sourceRefs: number[];
}

interface ComparisonPoint {
  aspect: string;
  detail: string;
}

interface BraveWebResult {
  title: string;
  url: string;
  description: string;
}

interface BraveImageResult {
  title: string;
  url: string;       // page URL
  thumbnail: string; // image src
}

interface BraveVideoResult {
  title: string;
  url: string;         // video page URL
  thumbnail: string;   // thumbnail src
  description: string;
  duration?: string;
  creator?: string;
  publisher?: string;
  age?: string;
}

interface ResearchImage {
  url: string;         // thumbnail/image src
  title: string;
  pageUrl: string;     // source page
  sectionIdx?: number; // matched section (-1 = unmatched/gallery)
}

interface ResearchVideo {
  url: string;         // video page URL (clickable)
  thumbnail: string;
  title: string;
  description: string;
  duration?: string;
  creator?: string;
  publisher?: string;
  age?: string;
}

interface CachedResearch {
  topic: string;
  summary: string;
  narrative: string;
  keyFindings: KeyFinding[];
  sections: ResearchSection[];
  sources: Source[];
  images: ResearchImage[];
  videos: ResearchVideo[];
  timestamp: number;
}

// ── Module-level research cache ──

const researchCache = new Map<string, CachedResearch>();

// ── Persistent research history ──

interface ResearchHistoryMeta extends DocMeta {
  topic: string;
  depth: string;
  sourceCount: number;
  summaryPreview: string;
}

const researchHistory = getDocCollection<CachedResearch, ResearchHistoryMeta>(
  "researcher",
  "topics",
  { maxEntries: 50 },
);

function topicSlug(topic: string): string {
  return topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// Hydrate in-memory cache from disk on module load
for (const entry of researchHistory.list()) {
  const data = researchHistory.load(entry.id);
  if (data) researchCache.set(data.topic.toLowerCase(), data);
}

// ── Helpers ──

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

function getBraveApiKey(): string | undefined {
  return process.env.BRAVE_API_KEY;
}

async function getGeminiApiKey(): Promise<string | undefined> {
  // 1. From active account (accounts.ts resolves config → env → key file)
  try {
    const { getActiveAccount } = await import("./server.js");
    const fromAccount = getActiveAccount()?.geminiApiKey;
    if (fromAccount) return fromAccount;
  } catch { /* server not ready yet */ }

  // 2. From environment variable (set by .env loader or system)
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;

  // 3. Direct file read via import.meta.url
  try {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const keyPath = join(dirname(fileURLToPath(import.meta.url)), "..", "gemini.key");
    const key = readFileSync(keyPath, "utf-8").trim();
    if (key) return key;
  } catch { /* path resolution failed */ }

  // 4. Fallback: locate key file via OpenClaw config
  try {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const config = JSON.parse(readFileSync(join(home, ".openclaw", "openclaw.json"), "utf-8"));
    const installPath = config?.plugins?.installs?.enso?.installPath;
    if (installPath) {
      const key = readFileSync(join(installPath, "gemini.key"), "utf-8").trim();
      if (key) return key;
    }
    const paths = config?.plugins?.load?.paths;
    if (Array.isArray(paths)) {
      for (const p of paths) {
        try {
          const key = readFileSync(join(p, "gemini.key"), "utf-8").trim();
          if (key) return key;
        } catch { /* skip */ }
      }
    }
  } catch { /* config not available */ }

  return undefined;
}

function cleanJson(raw: string): string {
  return raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.split("/")[2] ?? url;
  }
}

const TRUSTED_DOMAINS = new Set([
  "nature.com", "science.org", "arxiv.org", "pubmed.ncbi.nlm.nih.gov",
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk",
  "nytimes.com", "washingtonpost.com", "theguardian.com",
  "who.int", "cdc.gov", "nih.gov", "nasa.gov",
  "harvard.edu", "mit.edu", "stanford.edu", "oxford.ac.uk",
  "wikipedia.org", "britannica.com",
  "techcrunch.com", "arstechnica.com", "wired.com",
  "mckinsey.com", "hbr.org", "economist.com",
]);

function scoreDomain(domain: string): number {
  if (domain.endsWith(".edu") || domain.endsWith(".ac.uk")) return 15;
  if (domain.endsWith(".gov") || domain.endsWith(".int")) return 12;
  if (TRUSTED_DOMAINS.has(domain)) return 10;
  if (domain.endsWith(".org")) return 5;
  return 0;
}

// ── Brave Search ──

async function braveWebSearch(query: string, count = 6): Promise<BraveWebResult[]> {
  const apiKey = getBraveApiKey();
  if (!apiKey) {
    console.log("[enso:researcher] braveWebSearch: no BRAVE_API_KEY");
    return [];
  }
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), 10)));

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  try {
    const resp = await globalThis.fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: ac.signal,
    });
    if (!resp.ok) {
      console.log(`[enso:researcher] braveWebSearch failed: ${resp.status}`);
      return [];
    }
    const body = (await resp.json()) as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
    return (body.web?.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      description: r.description ?? "",
    }));
  } catch (err) {
    console.log(`[enso:researcher] braveWebSearch error: ${err}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function braveImageSearch(query: string, count = 8): Promise<BraveImageResult[]> {
  const apiKey = getBraveApiKey();
  if (!apiKey) return [];

  const url = new URL("https://api.search.brave.com/res/v1/images/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), 10)));

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  try {
    const resp = await globalThis.fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: ac.signal,
    });
    if (!resp.ok) return [];
    const body = (await resp.json()) as {
      results?: Array<{ title: string; url: string; thumbnail?: { src: string } }>;
    };
    return (body.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      thumbnail: r.thumbnail?.src ?? "",
    })).filter((r) => r.thumbnail);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function braveVideoSearch(query: string, count = 6): Promise<BraveVideoResult[]> {
  const apiKey = getBraveApiKey();
  if (!apiKey) return [];

  const url = new URL("https://api.search.brave.com/res/v1/videos/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), 10)));

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  try {
    const resp = await globalThis.fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: ac.signal,
    });
    if (!resp.ok) return [];
    const body = (await resp.json()) as {
      results?: Array<{
        title: string;
        url: string;
        description?: string;
        age?: string;
        video?: { duration?: string; creator?: string; publisher?: string };
        thumbnail?: { src: string };
      }>;
    };
    return (body.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      thumbnail: r.thumbnail?.src ?? "",
      description: r.description ?? "",
      duration: r.video?.duration,
      creator: r.video?.creator,
      publisher: r.video?.publisher,
      age: r.age,
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ── Image-to-section matching ──

function matchImagesToSections(
  sections: ResearchSection[],
  rawImages: BraveImageResult[],
): ResearchImage[] {
  const result: ResearchImage[] = [];
  const usedImages = new Set<number>();

  // First pass: fuzzy-match images to sections by title word overlap
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sectionWords = sections[sIdx].title.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < rawImages.length; i++) {
      if (usedImages.has(i)) continue;
      const imgTitle = rawImages[i].title.toLowerCase();
      const score = sectionWords.filter((w) => imgTitle.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore > 0) {
      usedImages.add(bestIdx);
      result.push({
        url: rawImages[bestIdx].thumbnail,
        title: rawImages[bestIdx].title,
        pageUrl: rawImages[bestIdx].url,
        sectionIdx: sIdx,
      });
    }
  }

  // Second pass: remaining images become gallery items
  for (let i = 0; i < rawImages.length; i++) {
    if (usedImages.has(i) || !rawImages[i].thumbnail) continue;
    result.push({
      url: rawImages[i].thumbnail,
      title: rawImages[i].title,
      pageUrl: rawImages[i].url,
      sectionIdx: -1,
    });
  }

  return result;
}

// ── Search angle generation (deterministic) ──

function generateSearchAngles(topic: string, depth: "quick" | "standard" | "deep"): string[] {
  const quick = [
    `${topic} overview explained`,
    `${topic} latest developments 2025 2026`,
    `${topic} expert analysis`,
  ];
  const standard = [
    ...quick,
    `${topic} practical applications real world examples`,
    `${topic} challenges problems controversies`,
    `${topic} comparison alternatives`,
  ];
  const deep = [
    ...standard,
    `${topic} statistics data research studies`,
    `${topic} future predictions outlook trends`,
  ];
  if (depth === "quick") return quick;
  if (depth === "deep") return deep;
  return standard;
}

// ── Result deduplication and scoring ──

function deduplicateAndScore(batches: BraveWebResult[][]): Source[] {
  const seen = new Set<string>();
  const unique: BraveWebResult[] = [];
  for (const batch of batches) {
    for (const r of batch) {
      if (r.url && !seen.has(r.url)) {
        seen.add(r.url);
        unique.push(r);
      }
    }
  }
  return unique.map((r, i) => {
    const domain = extractDomain(r.url);
    const positionScore = Math.max(30, 100 - i * 3);
    const domainBonus = scoreDomain(domain);
    return {
      url: r.url,
      title: r.title,
      snippet: r.description,
      domain,
      relevance: Math.min(100, positionScore + domainBonus),
    };
  }).sort((a, b) => b.relevance - a.relevance);
}

// ── LLM Synthesis prompts ──

function buildSynthesisPrompt(topic: string, results: BraveWebResult[]): string {
  const snippetText = results
    .slice(0, 30)
    .map((s, i) => `[${i}] ${s.title}\n    ${s.description}\n    URL: ${s.url}`)
    .join("\n");

  return `You are a senior research analyst. Given web search results about "${topic}", synthesize comprehensive research findings.

SEARCH RESULTS:
${snippetText}

Return valid JSON (no markdown fences) with this exact structure:
{
  "summary": "Executive summary paragraph (3-5 sentences covering the most important findings)",
  "narrative": "A 4-8 paragraph comprehensive article. Engaging magazine-feature style. Flowing prose only — NO bullet points, NO numbered lists, NO section headers. Separate paragraphs with double newlines.",
  "keyFindings": [
    {
      "text": "Clear, specific finding statement",
      "type": "fact|trend|insight|warning",
      "confidence": "high|medium|low",
      "sourceRefs": [0, 3]
    }
  ],
  "sections": [
    {
      "title": "Section Title",
      "summary": "One-sentence section overview",
      "bullets": ["Detailed point 1", "Detailed point 2", "Detailed point 3"],
      "sourceRefs": [1, 4, 7]
    }
  ]
}

Rules:
- The "narrative" is the PRIMARY output users will read — it must be comprehensive, engaging, and cover ALL important material
- Write the narrative like a well-crafted magazine feature or intelligence briefing: strong opening that hooks the reader and establishes why this topic matters now, body paragraphs each exploring a distinct angle or theme, closing with forward-looking perspective or implications
- Each narrative paragraph should be 3-5 sentences of flowing, connected prose
- Generate 5-8 key findings covering the most important discoveries
- Generate 3-6 thematic sections organized by subtopic
- sourceRefs are 0-indexed positions in the SEARCH RESULTS list above
- Each finding and section MUST reference at least one source
- Finding types: fact (verified data/statistic), trend (emerging pattern), insight (analytical observation), warning (risk/concern/limitation)
- Confidence: high (multiple corroborating sources), medium (some support), low (single source or speculative)
- Bullets should be specific, informative, and substantive (not vague)
- Section titles should be clear topical headings, not generic labels`;
}

function buildDeepDivePrompt(topic: string, subtopic: string, parentContext: string, results: BraveWebResult[]): string {
  const snippetText = results
    .slice(0, 20)
    .map((s, i) => `[${i}] ${s.title}\n    ${s.description}`)
    .join("\n");

  return `You are a research analyst providing a deep dive into "${subtopic}" within the broader topic of "${topic}".

${parentContext ? `PRIOR RESEARCH CONTEXT:\n${parentContext}\n` : ""}
NEW SEARCH RESULTS:
${snippetText}

Return valid JSON (no markdown fences):
{
  "content": "Detailed 2-3 paragraph analysis of this subtopic",
  "bullets": ["Key point 1", "Key point 2", "Key point 3", "Key point 4", "Key point 5"],
  "relatedSubtopics": ["Related subtopic 1", "Related subtopic 2", "Related subtopic 3"],
  "sourceRefs": [0, 2, 5]
}

Rules:
- Content should be thorough and substantive
- 4-6 specific bullet points
- 2-4 related subtopics for further exploration
- sourceRefs reference the NEW SEARCH RESULTS indices`;
}

function buildComparePrompt(topicA: string, topicB: string, context: string, results: BraveWebResult[]): string {
  const snippetText = results
    .slice(0, 25)
    .map((s, i) => `[${i}] ${s.title}\n    ${s.description}`)
    .join("\n");

  return `You are a research analyst comparing "${topicA}" vs "${topicB}"${context ? ` in the context of: ${context}` : ""}.

SEARCH RESULTS:
${snippetText}

Return valid JSON (no markdown fences):
{
  "similarities": [
    { "aspect": "Aspect name", "detail": "How they are similar" }
  ],
  "differences": [
    { "aspect": "Aspect name", "detail": "How they differ" }
  ],
  "tradeoffs": [
    { "aspect": "Consideration", "detail": "Trade-off analysis" }
  ],
  "verdict": "Balanced 2-3 sentence summary comparing both options",
  "sourceRefs": [0, 3, 7]
}

Rules:
- 3-5 similarities, 4-6 differences, 3-5 trade-offs
- Be specific and evidence-based
- Verdict should be balanced, not favoring one side`;
}

function buildFollowUpPrompt(topic: string, question: string, parentContext: string, results: BraveWebResult[]): string {
  const snippetText = results
    .slice(0, 15)
    .map((s, i) => `[${i}] ${s.title}\n    ${s.description}`)
    .join("\n");

  return `You are a research analyst answering a follow-up question about "${topic}".

Question: "${question}"

${parentContext ? `PRIOR RESEARCH CONTEXT:\n${parentContext}\n` : ""}
NEW SEARCH RESULTS:
${snippetText}

Return valid JSON (no markdown fences):
{
  "answer": "Thorough 2-3 paragraph answer to the question",
  "suggestedFollowUps": ["Follow-up question 1", "Follow-up question 2", "Follow-up question 3"],
  "sourceRefs": [0, 2, 4]
}

Rules:
- Answer should directly address the question with evidence
- 3-4 suggested follow-up questions that would deepen understanding
- sourceRefs reference the NEW SEARCH RESULTS indices`;
}

// ── Context builder for cached research ──

function buildParentContext(cached: CachedResearch | undefined): string {
  if (!cached) return "";
  const sectionSummaries = cached.sections
    .map((s) => `- ${s.title}: ${s.summary}`)
    .join("\n");
  return `Summary: ${cached.summary}\nSections:\n${sectionSummaries}`;
}

// ── Fallback: LLM-only research (no Brave) ──

async function llmOnlyResearch(
  topic: string,
  depth: "quick" | "standard" | "deep",
  geminiKey: string,
): Promise<AgentToolResult> {
  const sectionCount = depth === "quick" ? 3 : depth === "deep" ? 6 : 4;

  const prompt = `You are a knowledgeable research analyst. Provide comprehensive research on: "${topic}"

Return valid JSON (no markdown fences):
{
  "summary": "Executive summary (3-5 sentences)",
  "narrative": "A 4-8 paragraph comprehensive article. Engaging magazine-feature style. Flowing prose only — NO bullet points, NO lists, NO headers. Separate paragraphs with double newlines.",
  "keyFindings": [
    { "text": "Finding", "type": "fact|trend|insight|warning", "confidence": "high|medium|low", "sourceRefs": [] }
  ],
  "sections": [
    { "title": "Section Title", "summary": "Overview", "bullets": ["Point 1", "Point 2"], "sourceRefs": [] }
  ]
}

Rules:
- The "narrative" is the primary output — write it like a well-crafted magazine feature: strong opening, body paragraphs each exploring a distinct angle, closing with forward-looking perspective
- 5-8 key findings
- ${sectionCount} thematic sections
- Be specific, factual, and substantive
- sourceRefs can be empty (no web search available)`;

  try {
    const { callGeminiLLMWithRetry } = await import("./ui-generator.js");
    const raw = await callGeminiLLMWithRetry(prompt, geminiKey);
    const parsed = JSON.parse(cleanJson(raw)) as {
      summary: string;
      narrative: string;
      keyFindings: KeyFinding[];
      sections: ResearchSection[];
    };

    const result = {
      tool: "enso_researcher_search",
      topic,
      depth,
      summary: parsed.summary ?? "",
      narrative: parsed.narrative ?? "",
      keyFindings: (parsed.keyFindings ?? []).slice(0, 8),
      sections: (parsed.sections ?? []).slice(0, sectionCount),
      sources: [] as Source[],
      images: [] as ResearchImage[],
      videos: [] as ResearchVideo[],
      metadata: {
        queriesRun: 0,
        sourcesFound: 0,
        sectionsGenerated: (parsed.sections ?? []).length,
        timestamp: Date.now(),
        note: "LLM-only research (no web search API key)",
      },
    };

    const cachedLlm: CachedResearch = {
      topic,
      summary: result.summary,
      narrative: result.narrative,
      keyFindings: result.keyFindings,
      sections: result.sections,
      sources: [],
      images: [],
      videos: [],
      timestamp: Date.now(),
    };
    researchCache.set(topic.toLowerCase(), cachedLlm);
    researchHistory.save(topicSlug(topic), cachedLlm, {
      topic,
      depth,
      sourceCount: 0,
      summaryPreview: (result.summary ?? "").slice(0, 150),
    });

    return jsonResult(result);
  } catch (err) {
    console.log(`[enso:researcher] LLM-only research failed: ${err}`);
    return generateSampleResearch(topic, depth);
  }
}

// ── Fallback: sample data ──

function generateSampleResearch(topic: string, depth: string): AgentToolResult {
  return jsonResult({
    tool: "enso_researcher_search",
    topic,
    depth,
    summary: `This is sample research data for "${topic}". Configure BRAVE_API_KEY for live web research and a Gemini API key for AI synthesis.`,
    narrative: "",
    keyFindings: [
      { text: `${topic} is a rapidly evolving field with significant recent developments.`, type: "trend", confidence: "medium", sourceRefs: [] },
      { text: `Research shows growing interest and investment in ${topic}.`, type: "fact", confidence: "medium", sourceRefs: [] },
      { text: `Experts recommend monitoring ${topic} closely for emerging opportunities.`, type: "insight", confidence: "low", sourceRefs: [] },
      { text: `Some challenges remain around scalability and adoption of ${topic}.`, type: "warning", confidence: "medium", sourceRefs: [] },
    ],
    sections: [
      { title: "Overview", summary: `Foundational understanding of ${topic}.`, bullets: [`${topic} encompasses several key areas of study and application.`, "The field has seen significant growth in recent years.", "Multiple stakeholders are involved in shaping its direction."], sourceRefs: [] },
      { title: "Recent Developments", summary: "What's new and noteworthy.", bullets: ["New research findings are emerging regularly.", "Industry adoption is accelerating.", "Regulatory frameworks are being developed."], sourceRefs: [] },
      { title: "Practical Applications", summary: "Real-world use cases and impact.", bullets: ["Several industries are applying these concepts.", "Consumer-facing applications are becoming available.", "Cost-effectiveness is improving over time."], sourceRefs: [] },
    ],
    sources: [],
    images: [],
    videos: [],
    metadata: {
      queriesRun: 0,
      sourcesFound: 0,
      sectionsGenerated: 3,
      timestamp: Date.now(),
      note: "Sample data — set BRAVE_API_KEY for live research",
    },
  });
}

// ── Tool implementations ──

async function researcherSearch(params: SearchParams): Promise<AgentToolResult> {
  const topic = params.topic?.trim();
  if (!topic) {
    return jsonResult({
      tool: "enso_researcher_search",
      topic: "",
      category: "welcome",
      recentTopics: researchHistory.list().slice(0, 12),
      summary: "",
      narrative: "",
      keyFindings: [],
      sections: [],
      sources: [],
      images: [],
      videos: [],
    });
  }

  const depth = params.depth ?? "standard";

  // Return cached result unless force-refresh requested
  if (!params.force) {
    const cached = researchCache.get(topic.toLowerCase());
    if (cached) {
      console.log(`[enso:researcher] returning cached research for "${topic}"`);
      return jsonResult({
        tool: "enso_researcher_search",
        topic: cached.topic,
        depth,
        summary: cached.summary,
        narrative: cached.narrative,
        keyFindings: cached.keyFindings,
        sections: cached.sections,
        sources: cached.sources,
        images: cached.images,
        videos: cached.videos,
        metadata: {
          queriesRun: 0,
          sourcesFound: cached.sources.length,
          sectionsGenerated: cached.sections.length,
          timestamp: cached.timestamp,
          note: "Loaded from research library",
        },
        fromHistory: true,
      });
    }
  }

  const queries = generateSearchAngles(topic, depth);

  // Fallback: no Brave key
  if (!getBraveApiKey()) {
    console.log(`[enso:researcher] No BRAVE_API_KEY — attempting LLM-only research`);
    const geminiKey = await getGeminiApiKey();
    if (geminiKey) {
      try {
        return await llmOnlyResearch(topic, depth, geminiKey);
      } catch (err) {
        console.log(`[enso:researcher] LLM-only failed: ${err}`);
      }
    }
    return generateSampleResearch(topic, depth);
  }

  // Parallel Brave searches + image/video searches (zero extra latency)
  console.log(`[enso:researcher] searching "${topic}" (${depth}): ${queries.length} queries + media`);
  const [allBatches, rawImages, rawVideos] = await Promise.all([
    Promise.all(queries.map((q) => braveWebSearch(q, 6))),
    braveImageSearch(`${topic} photos images`, 10),
    braveVideoSearch(`${topic} video explanation`, 6),
  ]);
  const sources = deduplicateAndScore(allBatches);

  if (sources.length === 0) {
    console.log(`[enso:researcher] no search results for "${topic}"`);
    const geminiKey = await getGeminiApiKey();
    if (geminiKey) return llmOnlyResearch(topic, depth, geminiKey);
    return generateSampleResearch(topic, depth);
  }

  // Build snippet list for LLM
  const snippetsForLLM: BraveWebResult[] = sources.slice(0, 30).map((s) => ({
    title: s.title,
    url: s.url,
    description: s.snippet,
  }));

  // LLM synthesis
  const geminiKey = await getGeminiApiKey();
  if (!geminiKey) {
    return fallbackFromSources(topic, depth, sources);
  }

  try {
    const { callGeminiLLMWithRetry } = await import("./ui-generator.js");
    const prompt = buildSynthesisPrompt(topic, snippetsForLLM);
    const raw = await callGeminiLLMWithRetry(prompt, geminiKey);
    const parsed = JSON.parse(cleanJson(raw)) as {
      summary: string;
      narrative: string;
      keyFindings: KeyFinding[];
      sections: ResearchSection[];
    };

    // Validate and clamp sourceRefs
    const maxRef = sources.length - 1;
    const clampRefs = (refs: number[] | undefined) =>
      (refs ?? []).filter((r) => typeof r === "number" && r >= 0 && r <= maxRef);

    const keyFindings = (parsed.keyFindings ?? []).slice(0, 8).map((f) => ({
      text: f.text ?? "",
      type: (["fact", "trend", "insight", "warning"].includes(f.type) ? f.type : "insight") as KeyFinding["type"],
      confidence: (["high", "medium", "low"].includes(f.confidence) ? f.confidence : "medium") as KeyFinding["confidence"],
      sourceRefs: clampRefs(f.sourceRefs),
    }));

    const sections = (parsed.sections ?? []).slice(0, 6).map((s) => ({
      title: s.title ?? "Untitled Section",
      summary: s.summary ?? "",
      bullets: Array.isArray(s.bullets) ? s.bullets.filter((b) => typeof b === "string") : [],
      sourceRefs: clampRefs(s.sourceRefs),
    }));

    // Match images to sections + build video list
    const images = matchImagesToSections(sections, rawImages);
    const videos: ResearchVideo[] = rawVideos.slice(0, 6);

    const result = {
      tool: "enso_researcher_search",
      topic,
      depth,
      summary: parsed.summary ?? "",
      narrative: parsed.narrative ?? "",
      keyFindings,
      sections,
      sources: sources.slice(0, 25),
      images,
      videos,
      metadata: {
        queriesRun: queries.length,
        sourcesFound: sources.length,
        sectionsGenerated: sections.length,
        timestamp: Date.now(),
      },
    };

    // Cache for follow-up context
    const cachedEntry: CachedResearch = {
      topic,
      summary: result.summary,
      narrative: result.narrative,
      keyFindings: result.keyFindings,
      sections: result.sections,
      sources: result.sources,
      images: result.images,
      videos: result.videos,
      timestamp: Date.now(),
    };
    researchCache.set(topic.toLowerCase(), cachedEntry);
    researchHistory.save(topicSlug(topic), cachedEntry, {
      topic,
      depth,
      sourceCount: result.sources?.length ?? 0,
      summaryPreview: (result.summary ?? "").slice(0, 150),
    });

    console.log(`[enso:researcher] research complete: ${keyFindings.length} findings, ${sections.length} sections, ${sources.length} sources, ${images.length} images, ${videos.length} videos`);
    return jsonResult(result);
  } catch (err) {
    console.log(`[enso:researcher] LLM synthesis error: ${err}`);
    return fallbackFromSources(topic, depth, sources);
  }
}

function fallbackFromSources(topic: string, depth: string, sources: Source[]): AgentToolResult {
  const sections: ResearchSection[] = [
    {
      title: "Search Results",
      summary: `Web search results for "${topic}"`,
      bullets: sources.slice(0, 10).map((s) => `${s.title}: ${s.snippet}`),
      sourceRefs: sources.slice(0, 10).map((_, i) => i),
    },
  ];
  const summary = `Found ${sources.length} sources about "${topic}". AI synthesis unavailable — showing raw results.`;

  // Persist fallback results to history + cache
  const cachedFallback: CachedResearch = {
    topic,
    summary,
    narrative: "",
    keyFindings: [],
    sections,
    sources: sources.slice(0, 25),
    images: [],
    videos: [],
    timestamp: Date.now(),
  };
  researchCache.set(topic.toLowerCase(), cachedFallback);
  researchHistory.save(topicSlug(topic), cachedFallback, {
    topic,
    depth,
    sourceCount: sources.length,
    summaryPreview: summary.slice(0, 150),
  });

  return jsonResult({
    tool: "enso_researcher_search",
    topic,
    depth,
    summary,
    narrative: "",
    keyFindings: [],
    sections,
    sources: sources.slice(0, 25),
    images: [],
    videos: [],
    metadata: {
      queriesRun: 0,
      sourcesFound: sources.length,
      sectionsGenerated: 1,
      timestamp: Date.now(),
      note: "Raw results — no Gemini API key for synthesis",
    },
  });
}

async function researcherDeepDive(params: DeepDiveParams): Promise<AgentToolResult> {
  const topic = params.topic?.trim() || "";
  const subtopic = params.subtopic?.trim() || "";
  if (!topic || !subtopic) return errorResult("topic and subtopic are required");

  const cached = researchCache.get(topic.toLowerCase());
  const parentContext = buildParentContext(cached);

  // Targeted searches
  const queries = [
    `${subtopic} ${topic} explained in detail`,
    `${subtopic} key concepts recent research`,
    `${subtopic} examples applications`,
  ];

  // Parallel: web searches + image search
  const [batches, rawImages] = await Promise.all([
    Promise.all(queries.map((q) => braveWebSearch(q, 5))),
    braveImageSearch(`${subtopic} ${topic} images`, 6),
  ]);
  const sources = deduplicateAndScore(batches);
  const deepDiveImages: ResearchImage[] = rawImages.slice(0, 6).map((img) => ({
    url: img.thumbnail,
    title: img.title,
    pageUrl: img.url,
  }));

  const geminiKey = await getGeminiApiKey();
  if (!geminiKey || sources.length === 0) {
    return jsonResult({
      tool: "enso_researcher_deep_dive",
      topic,
      subtopic,
      content: sources.length > 0
        ? sources.slice(0, 5).map((s) => `**${s.title}**: ${s.snippet}`).join("\n\n")
        : `Detailed analysis of "${subtopic}" in the context of "${topic}".`,
      bullets: sources.slice(0, 5).map((s) => s.title),
      relatedSubtopics: [],
      sources: sources.slice(0, 10),
      images: deepDiveImages,
    });
  }

  try {
    const { callGeminiLLMWithRetry } = await import("./ui-generator.js");
    const snippetsForLLM: BraveWebResult[] = sources.slice(0, 20).map((s) => ({
      title: s.title, url: s.url, description: s.snippet,
    }));
    const prompt = buildDeepDivePrompt(topic, subtopic, parentContext, snippetsForLLM);
    const raw = await callGeminiLLMWithRetry(prompt, geminiKey);
    const parsed = JSON.parse(cleanJson(raw)) as {
      content: string;
      bullets: string[];
      relatedSubtopics: string[];
      sourceRefs: number[];
    };

    return jsonResult({
      tool: "enso_researcher_deep_dive",
      topic,
      subtopic,
      content: parsed.content ?? "",
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
      relatedSubtopics: Array.isArray(parsed.relatedSubtopics) ? parsed.relatedSubtopics : [],
      sources: sources.slice(0, 10),
      images: deepDiveImages,
    });
  } catch (err) {
    console.log(`[enso:researcher] deep dive LLM error: ${err}`);
    return jsonResult({
      tool: "enso_researcher_deep_dive",
      topic,
      subtopic,
      content: sources.slice(0, 5).map((s) => `**${s.title}**: ${s.snippet}`).join("\n\n"),
      bullets: sources.slice(0, 5).map((s) => s.title),
      relatedSubtopics: [],
      sources: sources.slice(0, 10),
      images: deepDiveImages,
    });
  }
}

async function researcherCompare(params: CompareParams): Promise<AgentToolResult> {
  const topicA = params.topicA?.trim() || "";
  const topicB = params.topicB?.trim() || "";
  if (!topicA || !topicB) return errorResult("topicA and topicB are required");

  const context = params.context?.trim() || "";

  // 5 parallel queries: 2 per side + 1 comparison
  const queries = [
    `${topicA} advantages strengths features`,
    `${topicA} disadvantages limitations`,
    `${topicB} advantages strengths features`,
    `${topicB} disadvantages limitations`,
    `${topicA} vs ${topicB} comparison`,
  ];

  const batches = await Promise.all(queries.map((q) => braveWebSearch(q, 5)));
  const sources = deduplicateAndScore(batches);

  const geminiKey = await getGeminiApiKey();
  if (!geminiKey || sources.length === 0) {
    return jsonResult({
      tool: "enso_researcher_compare",
      topicA,
      topicB,
      context,
      similarities: [{ aspect: "General", detail: "Both are notable approaches in their domain." }],
      differences: [{ aspect: "Approach", detail: `${topicA} and ${topicB} take different approaches.` }],
      tradeoffs: [{ aspect: "Context-dependent", detail: "The best choice depends on specific requirements." }],
      verdict: `Both ${topicA} and ${topicB} have merits. The best choice depends on your specific needs and constraints.`,
      sources: sources.slice(0, 15),
    });
  }

  try {
    const { callGeminiLLMWithRetry } = await import("./ui-generator.js");
    const snippetsForLLM: BraveWebResult[] = sources.slice(0, 25).map((s) => ({
      title: s.title, url: s.url, description: s.snippet,
    }));
    const prompt = buildComparePrompt(topicA, topicB, context, snippetsForLLM);
    const raw = await callGeminiLLMWithRetry(prompt, geminiKey);
    const parsed = JSON.parse(cleanJson(raw)) as {
      similarities: ComparisonPoint[];
      differences: ComparisonPoint[];
      tradeoffs: ComparisonPoint[];
      verdict: string;
      sourceRefs: number[];
    };

    return jsonResult({
      tool: "enso_researcher_compare",
      topicA,
      topicB,
      context,
      similarities: Array.isArray(parsed.similarities) ? parsed.similarities : [],
      differences: Array.isArray(parsed.differences) ? parsed.differences : [],
      tradeoffs: Array.isArray(parsed.tradeoffs) ? parsed.tradeoffs : [],
      verdict: parsed.verdict ?? "",
      sources: sources.slice(0, 15),
    });
  } catch (err) {
    console.log(`[enso:researcher] compare LLM error: ${err}`);
    return jsonResult({
      tool: "enso_researcher_compare",
      topicA,
      topicB,
      context,
      similarities: [],
      differences: [],
      tradeoffs: [],
      verdict: `Comparison of ${topicA} vs ${topicB} — AI synthesis failed. See sources for details.`,
      sources: sources.slice(0, 15),
    });
  }
}

async function researcherFollowUp(params: FollowUpParams): Promise<AgentToolResult> {
  const topic = params.topic?.trim() || "";
  const question = params.question?.trim() || "";
  if (!topic || !question) return errorResult("topic and question are required");

  const cached = researchCache.get(topic.toLowerCase());
  const parentContext = buildParentContext(cached);

  const queries = [
    `${question} ${topic}`,
    `${topic} ${question} explained`,
  ];

  const batches = await Promise.all(queries.map((q) => braveWebSearch(q, 5)));
  const sources = deduplicateAndScore(batches);

  const geminiKey = await getGeminiApiKey();
  if (!geminiKey || sources.length === 0) {
    return jsonResult({
      tool: "enso_researcher_follow_up",
      topic,
      question,
      answer: sources.length > 0
        ? sources.slice(0, 3).map((s) => `${s.title}: ${s.snippet}`).join("\n\n")
        : `Unable to answer "${question}" about "${topic}" — no search results or AI synthesis available.`,
      sources: sources.slice(0, 10),
      suggestedFollowUps: [],
    });
  }

  try {
    const { callGeminiLLMWithRetry } = await import("./ui-generator.js");
    const snippetsForLLM: BraveWebResult[] = sources.slice(0, 15).map((s) => ({
      title: s.title, url: s.url, description: s.snippet,
    }));
    const prompt = buildFollowUpPrompt(topic, question, parentContext, snippetsForLLM);
    const raw = await callGeminiLLMWithRetry(prompt, geminiKey);
    const parsed = JSON.parse(cleanJson(raw)) as {
      answer: string;
      suggestedFollowUps: string[];
      sourceRefs: number[];
    };

    return jsonResult({
      tool: "enso_researcher_follow_up",
      topic,
      question,
      answer: parsed.answer ?? "",
      sources: sources.slice(0, 10),
      suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps) ? parsed.suggestedFollowUps : [],
    });
  } catch (err) {
    console.log(`[enso:researcher] follow-up LLM error: ${err}`);
    return jsonResult({
      tool: "enso_researcher_follow_up",
      topic,
      question,
      answer: sources.slice(0, 3).map((s) => `${s.title}: ${s.snippet}`).join("\n\n"),
      sources: sources.slice(0, 10),
      suggestedFollowUps: [],
    });
  }
}

async function researcherSendReport(params: SendReportParams): Promise<AgentToolResult> {
  const recipient = params.recipient?.trim();
  if (!recipient) return errorResult("recipient email is required");
  const topic = params.topic?.trim() || "Research Report";
  const summary = params.summary ?? "";
  const narrative = params.narrative ?? "";
  const keyFindings = params.keyFindings ?? [];
  const sections = params.sections ?? [];
  const sources = params.sources ?? [];
  const images = params.images ?? [];
  const videos = params.videos ?? [];

  const html = buildReportHtml(topic, summary, narrative, keyFindings, sections, sources, images, videos);

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    try {
      const resp = await globalThis.fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Enso Research <onboarding@resend.dev>",
          to: [recipient],
          subject: `Research Report: ${topic}`,
          html,
        }),
        signal: ac.signal,
      });
      if (resp.ok) {
        return jsonResult({
          tool: "enso_researcher_send_report",
          success: true,
          recipient,
          topic,
          message: `Research report sent to ${recipient}`,
        });
      }
      const errBody = await resp.text();
      console.log(`[enso:researcher] Resend API error: ${resp.status} ${errBody}`);
    } catch (err) {
      console.log(`[enso:researcher] Resend send error: ${err}`);
    } finally {
      clearTimeout(timer);
    }
  }

  return jsonResult({
    tool: "enso_researcher_send_report",
    success: false,
    recipient,
    topic,
    message: resendKey
      ? "Email send failed — HTML report generated below"
      : "No RESEND_API_KEY configured — HTML report generated below",
    fallbackHtml: html,
  });
}

// ── HTML report builder ──

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildReportHtml(
  topic: string,
  summary: string,
  narrative: string,
  keyFindings: KeyFinding[],
  sections: ResearchSection[],
  sources: Source[],
  images: ResearchImage[],
  videos: ResearchVideo[],
): string {
  const sourcesHtml = sources.length > 0
    ? `<tr><td style="padding:20px 0 8px;">
        <div style="color:#94a3b8;font-size:16px;font-weight:600;margin-bottom:8px;border-top:1px solid #334155;padding-top:16px;">Sources</div>
        ${sources.slice(0, 15).map((s, i) => `
          <div style="padding:3px 0;font-size:12px;">
            <span style="color:#64748b;">[${i + 1}]</span>
            <a href="${escapeHtml(s.url)}" style="color:#60a5fa;text-decoration:none;">${escapeHtml(s.title)}</a>
            <span style="color:#475569;"> — ${escapeHtml(s.domain)}</span>
          </div>
        `).join("")}
      </td></tr>`
    : "";

  // ── Narrative-first layout (primary) ──
  if (narrative && narrative.trim()) {
    const paragraphs = narrative.split(/\n\n+/).filter((p) => p.trim());
    const topImages = images.filter((img) => img.url).slice(0, 2);
    const featuredVideo = videos.length > 0 ? videos[0] : null;
    const insertImageAfter = Math.min(2, Math.floor(paragraphs.length / 3));
    const insertVideoAfter = Math.min(4, Math.floor((paragraphs.length * 2) / 3));

    let bodyHtml = "";
    for (let i = 0; i < paragraphs.length; i++) {
      bodyHtml += `<tr><td style="padding:8px 0;">
        <div style="color:#cbd5e1;font-size:15px;line-height:1.7;">${escapeHtml(paragraphs[i])}</div>
      </td></tr>`;

      if (i === insertImageAfter && topImages.length > 0) {
        const imgCells = topImages.map((img) =>
          `<td style="width:${topImages.length === 1 ? "100" : "49"}%;padding:4px;">
            <a href="${escapeHtml(img.pageUrl || img.url)}" style="display:block;">
              <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.title)}"
                style="width:100%;height:auto;max-height:200px;object-fit:cover;border-radius:8px;display:block;" />
            </a>
            <div style="color:#64748b;font-size:11px;margin-top:4px;">${escapeHtml(img.title)}</div>
          </td>`
        ).join("");
        bodyHtml += `<tr><td style="padding:12px 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>${imgCells}</tr></table>
        </td></tr>`;
      }

      if (i === insertVideoAfter && featuredVideo) {
        bodyHtml += `<tr><td style="padding:12px 0;">
          <a href="${escapeHtml(featuredVideo.url)}" style="display:block;text-decoration:none;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e1e2e;border-radius:8px;">
              <tr>
                ${featuredVideo.thumbnail ? `<td style="width:160px;padding:12px;">
                  <img src="${escapeHtml(featuredVideo.thumbnail)}" alt="${escapeHtml(featuredVideo.title)}"
                    style="width:140px;height:90px;object-fit:cover;border-radius:6px;display:block;" />
                </td>` : ""}
                <td style="padding:12px;">
                  <div style="color:#f87171;font-size:11px;text-transform:uppercase;margin-bottom:4px;">▶ Video</div>
                  <div style="color:#e2e8f0;font-size:14px;font-weight:600;">${escapeHtml(featuredVideo.title)}</div>
                  ${featuredVideo.duration ? `<div style="color:#64748b;font-size:12px;margin-top:4px;">${escapeHtml(featuredVideo.duration)}</div>` : ""}
                </td>
              </tr>
            </table>
          </a>
        </td></tr>`;
      }
    }

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;padding:20px;">
  <tr><td style="padding:20px 0;">
    <div style="color:#e2e8f0;font-size:24px;font-weight:700;">${escapeHtml(topic)}</div>
    <div style="color:#64748b;font-size:13px;margin-top:6px;">Research Report — Generated by Enso</div>
  </td></tr>
  ${bodyHtml}
  ${sourcesHtml}
  <tr><td style="padding:16px 0;text-align:center;color:#64748b;font-size:12px;">
    Generated by Enso Research
  </td></tr>
</table>
</body></html>`;
  }

  // ── Fallback: structured layout (for old cached data without narrative) ──
  const findingTypeColors: Record<string, string> = { fact: "#10b981", trend: "#3b82f6", insight: "#a855f7", warning: "#f59e0b" };
  const findingsHtml = keyFindings.length > 0
    ? `<tr><td style="padding:16px 0;">
        <div style="color:#e2e8f0;font-size:18px;font-weight:600;margin-bottom:12px;">Key Findings</div>
        ${keyFindings.map((f) => `
          <div style="padding:8px 12px;margin:4px 0;background:#1e1e2e;border-radius:6px;border-left:3px solid ${findingTypeColors[f.type] ?? "#3b82f6"};">
            <span style="color:#94a3b8;font-size:11px;text-transform:uppercase;">${escapeHtml(f.type)}</span>
            <div style="color:#e2e8f0;font-size:14px;margin-top:2px;">${escapeHtml(f.text)}</div>
          </div>
        `).join("")}
      </td></tr>` : "";
  const sectionsHtml = sections.map((s) => `
    <tr><td style="padding:8px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e1e2e;border-radius:8px;">
        <tr><td style="padding:12px 16px;">
          <div style="color:#e2e8f0;font-size:16px;font-weight:600;">${escapeHtml(s.title)}</div>
          <div style="color:#94a3b8;font-size:13px;margin-top:4px;">${escapeHtml(s.summary)}</div>
          <ul style="color:#cbd5e1;font-size:13px;margin:8px 0 0;padding-left:20px;">
            ${s.bullets.map((b) => `<li style="margin:3px 0;">${escapeHtml(b)}</li>`).join("")}
          </ul>
        </td></tr>
      </table>
    </td></tr>`).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;padding:20px;">
  <tr><td style="padding:20px 0;text-align:center;">
    <div style="color:#e2e8f0;font-size:24px;font-weight:700;">Research Report: ${escapeHtml(topic)}</div>
    ${summary ? `<div style="color:#94a3b8;font-size:14px;margin-top:8px;line-height:1.5;text-align:left;">${escapeHtml(summary)}</div>` : ""}
  </td></tr>
  ${findingsHtml}
  ${sectionsHtml}
  ${sourcesHtml}
  <tr><td style="padding:16px 0;text-align:center;color:#64748b;font-size:12px;">
    Generated by Enso Research
  </td></tr>
</table>
</body></html>`;
}

// ── Delete history ──

async function researcherDeleteHistory(params: { topic: string }): Promise<AgentToolResult> {
  const topic = params.topic?.trim();
  if (!topic) return errorResult("No topic specified");

  const slug = topicSlug(topic);
  researchCache.delete(topic.toLowerCase());
  researchHistory.remove(slug);
  console.log(`[enso:researcher] deleted history for "${topic}" (slug: ${slug})`);

  // Return updated welcome view
  return researcherSearch({ topic: "" } as SearchParams);
}

// ── Tool registration ──

export function createResearcherTools(): AnyAgentTool[] {
  return [
    {
      name: "enso_researcher_search",
      label: "Research Topic",
      description: "Deep multi-angle web research on any topic — returns structured findings, sections, and sources with AI synthesis.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string", description: "Research topic (any subject)" },
          depth: { type: "string", enum: ["quick", "standard", "deep"], description: "Research depth: quick (3 queries), standard (6), deep (8)" },
          force: { type: "boolean", description: "Force fresh research, ignoring cached results" },
        },
        required: ["topic"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        researcherSearch(params as SearchParams),
    } as AnyAgentTool,
    {
      name: "enso_researcher_deep_dive",
      label: "Research Deep Dive",
      description: "Deep dive into a specific subtopic from the initial research with additional web sources.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string", description: "Original research topic" },
          subtopic: { type: "string", description: "Specific subtopic to explore in depth" },
        },
        required: ["topic", "subtopic"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        researcherDeepDive(params as DeepDiveParams),
    } as AnyAgentTool,
    {
      name: "enso_researcher_compare",
      label: "Research Compare",
      description: "Compare two topics, approaches, or perspectives with structured analysis of similarities, differences, and trade-offs.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          topicA: { type: "string", description: "First topic/option to compare" },
          topicB: { type: "string", description: "Second topic/option to compare" },
          context: { type: "string", description: "Optional context for the comparison" },
        },
        required: ["topicA", "topicB"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        researcherCompare(params as CompareParams),
    } as AnyAgentTool,
    {
      name: "enso_researcher_follow_up",
      label: "Research Follow-up",
      description: "Ask a specific follow-up question in the context of existing research.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string", description: "Original research topic" },
          question: { type: "string", description: "Specific follow-up question" },
        },
        required: ["topic", "question"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        researcherFollowUp(params as FollowUpParams),
    } as AnyAgentTool,
    {
      name: "enso_researcher_send_report",
      label: "Email Research Report",
      description: "Compile research results into a styled HTML email and send via Resend API.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          recipient: { type: "string", description: "Email address to send to" },
          topic: { type: "string", description: "Research topic for the report title" },
          summary: { type: "string", description: "Executive summary text" },
          narrative: { type: "string", description: "Narrative article text (paragraphs separated by double newlines)" },
          keyFindings: {
            type: "array",
            description: "Key findings to include",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string" },
                type: { type: "string" },
                confidence: { type: "string" },
                sourceRefs: { type: "array", items: { type: "number" } },
              },
              required: ["text", "type"],
            },
          },
          sections: {
            type: "array",
            description: "Research sections to include",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                bullets: { type: "array", items: { type: "string" } },
                sourceRefs: { type: "array", items: { type: "number" } },
              },
              required: ["title"],
            },
          },
          sources: {
            type: "array",
            description: "Source references",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                url: { type: "string" },
                title: { type: "string" },
                domain: { type: "string" },
                relevance: { type: "number" },
              },
              required: ["url", "title"],
            },
          },
          images: {
            type: "array",
            description: "Research images for inline display",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { url: { type: "string" }, title: { type: "string" }, pageUrl: { type: "string" } },
              required: ["url", "title"],
            },
          },
          videos: {
            type: "array",
            description: "Research videos for featured display",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { url: { type: "string" }, thumbnail: { type: "string" }, title: { type: "string" }, duration: { type: "string" } },
              required: ["url", "title"],
            },
          },
        },
        required: ["recipient", "topic"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        researcherSendReport(params as SendReportParams),
    } as AnyAgentTool,
    {
      name: "enso_researcher_delete_history",
      label: "Delete Research History Entry",
      description: "Remove a topic from the research history library.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string", description: "Topic to remove from history" },
        },
        required: ["topic"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        researcherDeleteHistory(params as { topic: string }),
    } as AnyAgentTool,
  ];
}

export function registerResearcherTools(api: OpenClawPluginApi): void {
  for (const tool of createResearcherTools()) {
    api.registerTool(tool);
  }
}
