import type { EnsoAgentTool, EnsoPluginApi } from "./local-types.js";
import { getDocCollection, type DocMeta } from "./persistence.js";
import { sendHtmlEmail } from "./email.js";
import { logAction, logError } from "./action-log.js";
import { toProxiedImageUrl } from "./utils/proxy-url.js";
import {
  BRAVE_WEB_SEARCH,
  BRAVE_IMAGE_SEARCH,
  BRAVE_VIDEO_SEARCH,
  BRAVE_SEARCH_TIMEOUT_MS,
  LLM_RESEARCH_TIMEOUT_MS,
} from "./config.js";
import { llm } from "./llm.js";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

// ── Param types ──

type SearchParams = { topic: string; depth?: "quick" | "standard" | "deep"; force?: boolean; language?: string };

// ── Progressive rendering support ──

/** Progress callback for streaming intermediate results to the frontend. */
type ProgressCallback = (data: Record<string, unknown>) => void;

/**
 * Module-level progress hook. Set by card-actions before invoking the researcher tool,
 * cleared after. This allows the tool executor (which only returns a single result)
 * to push intermediate updates through the WebSocket.
 */
let _activeProgressCallback: ProgressCallback | null = null;

export function setResearchProgressCallback(cb: ProgressCallback | null): void {
  _activeProgressCallback = cb;
}

function pushProgress(data: Record<string, unknown>): void {
  if (_activeProgressCallback) {
    try { _activeProgressCallback(data); } catch { /* don't break research pipeline */ }
  }
}

// ── Deep Research via Claude Code ──

/** Callback to launch deep research → custom UI generation. */
type DeepResearchLauncher = (params: {
  topic: string;
  language: string;
  onComplete: (generatedUI: string | null) => void;
}) => void;

let _deepResearchLauncher: DeepResearchLauncher | null = null;

export function setDeepResearchLauncher(launcher: DeepResearchLauncher | null): void {
  _deepResearchLauncher = launcher;
}

/** Stores the user's original message so we can detect their language even when the agent translates the topic. */
let _lastUserMessage = "";
export function setLastUserMessage(msg: string): void {
  _lastUserMessage = msg;
}

/** Pre-computed queries from parallel classification + query gen. Consumed once. */
let _precomputedQueries: GeneratedQueries | null = null;

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
  fullContent?: string; // extracted article text from the source page
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

export interface BraveImageResult {
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

interface ResearchBook {
  title: string;
  author: string;
  year?: string;
  description: string;
  url?: string;
}

interface ResearchMovie {
  title: string;
  year?: string;
  type: "movie" | "tv" | "documentary" | "podcast";
  description: string;
  url?: string;
}

interface RecommendedVideo {
  index: number;       // index into videos array
  reason: string;      // why this video is worth watching
}

interface Contradiction {
  claim: string;
  perspectives: string[];
  sourceRefs: number[];
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
  books: ResearchBook[];
  movies: ResearchMovie[];
  recommendedVideos: RecommendedVideo[];
  contradictions: Contradiction[];
  audioUrl?: string;
  podcastScript?: string;
  timestamp: number;
}

// ── Persistent research history ──

interface ResearchHistoryMeta extends DocMeta {
  topic: string;
  depth: string;
  sourceCount: number;
  findingCount: number;
  summaryPreview: string;
  hasBooks: boolean;
  hasVideos: boolean;
  hasContradictions: boolean;
  isDeepResearch: boolean;
  tags: string;  // comma-separated tags (DocMeta requires primitive values)
}

const researchHistory = getDocCollection<CachedResearch, ResearchHistoryMeta>(
  "researcher",
  "topics",
  { maxEntries: 200 },
);

function topicSlug(topic: string): string {
  // Keep Unicode letters/digits (supports CJK, Cyrillic, Arabic, etc.)
  const slug = topic.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  // Fallback: if slug is empty (shouldn't happen now), use a hash
  if (!slug) return "topic-" + Array.from(topic).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0).toString(36).replace("-", "n");
  return slug;
}

function buildResearchMeta(entry: CachedResearch, depth: string, isDeepResearch = false): ResearchHistoryMeta {
  return {
    topic: entry.topic,
    depth,
    sourceCount: entry.sources?.length ?? 0,
    findingCount: entry.keyFindings?.length ?? 0,
    summaryPreview: (entry.summary ?? "").slice(0, 150),
    hasBooks: (entry.books?.length ?? 0) > 0,
    hasVideos: (entry.videos?.length ?? 0) > 0,
    hasContradictions: (entry.contradictions?.length ?? 0) > 0,
    isDeepResearch,
    tags: "",
  };
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
  const { getGeminiApiKey: sharedGetKey } = await import("./podcast.js");
  return sharedGetKey();
}

function sanitizeJsonStrings(json: string): string {
  // Fix unescaped control characters AND invalid escape sequences inside JSON string values.
  // JSON only allows these escapes: \" \\ \/ \b \f \n \r \t \uXXXX
  // LLMs often produce invalid escapes like \s, \d, \p, \' etc.
  const VALID_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    const code = json.charCodeAt(i);
    if (inString) {
      if (escaped) {
        escaped = false;
        if (VALID_ESCAPES.has(ch)) {
          // Valid escape — keep as-is (backslash already appended)
          result += ch;
        } else {
          // Invalid escape like \s, \p, \' — remove the backslash, keep the char
          // Replace the trailing backslash we already pushed with just the char
          result = result.slice(0, -1) + ch;
        }
        continue;
      }
      if (ch === "\\") { escaped = true; result += ch; continue; }
      if (ch === '"') { inString = false; result += ch; continue; }
      // Escape unescaped control characters (tabs and newlines most common)
      if (code < 0x20) {
        if (code === 0x0a) { result += "\\n"; continue; }
        if (code === 0x0d) { result += "\\r"; continue; }
        if (code === 0x09) { result += "\\t"; continue; }
        result += "\\u" + code.toString(16).padStart(4, "0");
        continue;
      }
      result += ch;
    } else {
      if (ch === '"') inString = true;
      result += ch;
    }
  }
  return result;
}

/**
 * Fix unescaped double quotes inside JSON string values.
 * Walks the JSON, tracking whether we're inside a string. When a " is encountered
 * inside a string, we check if closing here would produce valid JSON structure
 * (next meaningful char should be , : } ]). If not, it's an embedded quote → escape it.
 */
function fixUnescapedQuotes(json: string): string {
  const result: string[] = [];
  let inString = false;
  let escaped = false;
  // Track whether we're in a key vs a value position
  let afterColon = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        result.push(ch);
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        result.push(ch);
        continue;
      }
      if (ch === '"') {
        // Is this the real end of the string, or an unescaped embedded quote?
        // Look ahead: skip whitespace, then check if next char is valid JSON after a string
        let j = i + 1;
        while (j < json.length && (json[j] === " " || json[j] === "\t" || json[j] === "\n" || json[j] === "\r")) j++;
        const next = j < json.length ? json[j] : "";
        // Valid chars after a string value: , } ] : (for keys) or end of input
        if (next === "" || next === "," || next === "}" || next === "]" || next === ":") {
          // Looks like a real string terminator
          inString = false;
          afterColon = next === ":";
          result.push(ch);
        } else {
          // Not a valid position to end a string — escape the quote
          result.push('\\"');
        }
        continue;
      }
      result.push(ch);
      continue;
    }

    // Not in string
    if (ch === '"') {
      inString = true;
      result.push(ch);
      continue;
    }
    if (ch === ":") afterColon = true;
    else if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") afterColon = false;
    result.push(ch);
  }

  return result.join("");
}

function cleanJson(raw: string): string {
  // Strip markdown fences
  let s = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  // Extract the outermost JSON object/array if there's surrounding text
  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");
  const start = firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket) ? firstBrace : firstBracket;
  if (start > 0) s = s.slice(start);

  // Try parsing as-is first
  try { JSON.parse(s); return s; } catch { /* continue with repairs */ }

  // Sanitize unescaped control characters inside strings (common LLM issue)
  s = sanitizeJsonStrings(s);
  try { JSON.parse(s); return s; } catch { /* continue */ }

  // Fix unescaped double quotes inside string values (very common LLM issue).
  // Strategy: walk character by character, track JSON structure context.
  // When inside a string and we see a " that doesn't look like a string terminator
  // (next non-whitespace char is not : , } ] or end-of-input), escape it.
  s = fixUnescapedQuotes(s);
  try { JSON.parse(s); return s; } catch { /* continue with structural repairs */ }

  // State-machine repair: track string/structure context properly
  const stack: string[] = []; // tracks open { and [
  let inString = false;
  let lastValidEnd = -1; // last position where a complete value ended at depth 1
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = false; continue; }
      continue;
    }
    // Not in string
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") { stack.push(ch); continue; }
    if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) {
        // Balanced at root level — try parsing up to here
        const candidate = s.slice(0, i + 1);
        try { JSON.parse(candidate); return candidate; } catch { /* continue */ }
      }
      if (stack.length === 1) lastValidEnd = i;
      continue;
    }
  }

  // Truncated — try to repair by closing open structures
  // First, truncate to last position where we had a complete value at depth 1+
  if (lastValidEnd > 0) {
    let repaired = s.slice(0, lastValidEnd + 1);
    // Remove trailing commas
    repaired = repaired.replace(/,\s*$/, "");
    // Close remaining open structures from inner to outer
    // Re-scan to get current stack state
    const rStack: string[] = [];
    let rInStr = false, rEsc = false;
    for (let i = 0; i < repaired.length; i++) {
      const ch = repaired[i];
      if (rInStr) { if (rEsc) { rEsc = false; } else if (ch === "\\") { rEsc = true; } else if (ch === '"') { rInStr = false; } continue; }
      if (ch === '"') { rInStr = true; continue; }
      if (ch === "{" || ch === "[") rStack.push(ch);
      if (ch === "}" || ch === "]") rStack.pop();
    }
    while (rStack.length > 0) {
      const open = rStack.pop()!;
      repaired += open === "{" ? "}" : "]";
    }
    try { JSON.parse(repaired); return repaired; } catch { /* continue */ }
  }

  // Aggressive repair: close the unterminated string + all open structures
  let repaired = s;
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, "");
  // Re-scan for stack
  const fStack: string[] = [];
  let fInStr = false, fEsc = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (fInStr) { if (fEsc) { fEsc = false; } else if (ch === "\\") { fEsc = true; } else if (ch === '"') { fInStr = false; } continue; }
    if (ch === '"') { fInStr = true; continue; }
    if (ch === "{" || ch === "[") fStack.push(ch);
    if (ch === "}" || ch === "]") fStack.pop();
  }
  while (fStack.length > 0) {
    const open = fStack.pop()!;
    repaired += open === "{" ? "}" : "]";
  }
  try { JSON.parse(repaired); return repaired; } catch { /* continue */ }

  // Last resort: return the stripped version and let caller handle the error
  return s;
}

/**
 * Detect the likely language of a text string using Unicode script heuristics.
 * Returns a language name (e.g., "Chinese", "Japanese", "Korean", "English").
 */
function detectLanguage(text: string): string {
  // Count characters by Unicode script
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;       // CJK Unified
  const hiragana = (text.match(/[\u3040-\u309f]/g) || []).length;                 // Japanese
  const katakana = (text.match(/[\u30a0-\u30ff]/g) || []).length;                 // Japanese
  const hangul = (text.match(/[\uac00-\ud7af\u1100-\u11ff]/g) || []).length;      // Korean
  const cyrillic = (text.match(/[\u0400-\u04ff]/g) || []).length;                 // Russian etc.
  const arabic = (text.match(/[\u0600-\u06ff\u0750-\u077f]/g) || []).length;      // Arabic
  const thai = (text.match(/[\u0e00-\u0e7f]/g) || []).length;                     // Thai
  const devanagari = (text.match(/[\u0900-\u097f]/g) || []).length;               // Hindi

  const total = text.replace(/\s/g, "").length;
  if (total === 0) return "English";

  if ((hiragana + katakana) / total > 0.1) return "Japanese";
  if (hangul / total > 0.1) return "Korean";
  if (cjk / total > 0.1) {
    // Distinguish Simplified vs Traditional Chinese
    // Simplified Chinese uses characters like 的关于这个说话 while Traditional uses 關於這個說話
    const simplified = (text.match(/[关为们这说个与从给对让来于还进过长会当么义发现没问实间开]/g) || []).length;
    const traditional = (text.match(/[關為們這說個與從給對讓來於還進過長會當麼義發現沒問實間開]/g) || []).length;
    return simplified >= traditional ? "Simplified Chinese" : "Traditional Chinese";
  }
  if (cyrillic / total > 0.15) return "Russian";
  if (arabic / total > 0.15) return "Arabic";
  if (thai / total > 0.15) return "Thai";
  if (devanagari / total > 0.15) return "Hindi";

  return "English";
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

// ── Source Content Extraction ──

/** Max chars of extracted article text to keep per source */
const MAX_CONTENT_LENGTH = 2000;
/** How many top sources to attempt full-content fetch for */
const MAX_SOURCES_TO_FETCH = 10;
/** Timeout per page fetch (ms) — 4s is enough for good sites, avoids blocking on slow ones */
const FETCH_TIMEOUT_MS = 4_000;

/** Domains to skip content extraction (paywalled, login-gated, or non-article) */
const SKIP_CONTENT_DOMAINS = new Set([
  "youtube.com", "youtu.be", "twitter.com", "x.com", "facebook.com",
  "instagram.com", "tiktok.com", "reddit.com", "linkedin.com",
  "pinterest.com", "github.com", "docs.google.com",
]);

/**
 * Strip HTML to readable article text.
 * Lightweight "readability" extraction: removes scripts, styles, nav/header/footer,
 * then pulls text from content-bearing elements.
 */
function extractArticleText(html: string): string {
  // Remove scripts, styles, SVGs, and comments
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Remove nav, header, footer, aside, menu elements (non-content)
  clean = clean
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<menu[\s\S]*?<\/menu>/gi, " ");

  // Try to extract article/main content first (higher quality)
  const articleMatch = clean.match(/<article[\s\S]*?<\/article>/i)
    || clean.match(/<main[\s\S]*?<\/main>/i)
    || clean.match(/<div[^>]*(?:class|id)="[^"]*(?:content|article|post|entry|story|body)[^"]*"[\s\S]*?<\/div>/i);

  const contentHtml = articleMatch ? articleMatch[0] : clean;

  // Convert block elements to newlines, strip all tags, decode entities
  let text = contentHtml
    .replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section)[\s>]/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&[a-z]+;/gi, " ");

  // Collapse whitespace, remove blank lines
  text = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 30) // filter out short junk lines (menus, buttons, etc.)
    .join("\n");

  return text.slice(0, MAX_CONTENT_LENGTH);
}

/**
 * Fetch a URL and extract its article text content.
 * Returns empty string on failure (timeout, error, non-HTML, etc.)
 */
export async function fetchPageContent(url: string): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await globalThis.fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EnsoResearcher/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: ac.signal,
      redirect: "follow",
    });
    if (!resp.ok) return "";

    // Only process HTML responses
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("xhtml")) return "";

    const html = await resp.text();
    if (!html || html.length < 500) return ""; // too small to be meaningful

    return extractArticleText(html);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch full content for the top N sources in parallel.
 * Attaches `fullContent` to each source that succeeds.
 * Non-blocking: failures are silently skipped.
 */
async function enrichSourcesWithContent(sources: Source[]): Promise<void> {
  const candidates = sources
    .slice(0, MAX_SOURCES_TO_FETCH)
    .filter((s) => !SKIP_CONTENT_DOMAINS.has(s.domain));

  if (candidates.length === 0) return;

  logAction({ ts: Date.now(), type: "action", category: "researcher", message: `fetching full content from ${candidates.length} sources...` });
  const startTime = Date.now();

  const results = await Promise.allSettled(
    candidates.map(async (source) => {
      const content = await fetchPageContent(source.url);
      if (content && content.length > 100) {
        source.fullContent = content;
      }
    }),
  );

  const succeeded = candidates.filter((s) => s.fullContent).length;
  const elapsed = Date.now() - startTime;
  logAction({ ts: Date.now(), type: "action", category: "researcher", message: `content extraction: ${succeeded}/${candidates.length} sources in ${elapsed}ms` });
}

// ── Brave Search ──

export async function braveWebSearch(query: string, count = 6): Promise<BraveWebResult[]> {
  const apiKey = getBraveApiKey();
  if (!apiKey) {
    logError("researcher", "braveWebSearch: no BRAVE_API_KEY", undefined, {});
    return [];
  }
  const url = new URL(BRAVE_WEB_SEARCH);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), 10)));

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), BRAVE_SEARCH_TIMEOUT_MS);
  try {
    const resp = await globalThis.fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: ac.signal,
    });
    if (!resp.ok) {
      logError("researcher", `braveWebSearch failed: ${resp.status}`, undefined, { status: resp.status });
      return [];
    }
    const body = (await resp.json()) as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
    return (body.web?.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      description: r.description ?? "",
    }));
  } catch (err) {
    logError("researcher", "braveWebSearch error", err, {});
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function braveImageSearch(query: string, count = 8): Promise<BraveImageResult[]> {
  const apiKey = getBraveApiKey();
  if (!apiKey) return [];

  const url = new URL(BRAVE_IMAGE_SEARCH);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), 10)));

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), BRAVE_SEARCH_TIMEOUT_MS);
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

  const url = new URL(BRAVE_VIDEO_SEARCH);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), 10)));

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), BRAVE_SEARCH_TIMEOUT_MS);
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
        url: toProxiedImageUrl(rawImages[bestIdx].thumbnail),
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
      url: toProxiedImageUrl(rawImages[i].thumbnail),
      title: rawImages[i].title,
      pageUrl: rawImages[i].url,
      sectionIdx: -1,
    });
  }

  return result;
}

// ── Search angle generation ──

/** Deterministic fallback queries (used when LLM generation fails or no Gemini key). */
function generateSearchAnglesFallback(topic: string, depth: "quick" | "standard" | "deep"): string[] {
  const year = new Date().getFullYear();
  const quick = [
    `${topic} overview explained`,
    `${topic} latest developments ${year - 1} ${year}`,
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
    `${topic} future predictions outlook trends ${year}`,
  ];
  if (depth === "quick") return quick;
  if (depth === "deep") return deep;
  return standard;
}

interface GeneratedQueries {
  web: string[];
  video: string[];
  media: string[];
}

/**
 * LLM-generated search queries tailored to the specific topic.
 * Returns web queries, video queries, and media/entertainment queries.
 * Falls back to deterministic generation on failure.
 */
async function generateSearchAngles(
  topic: string,
  depth: "quick" | "standard" | "deep",
  geminiKey?: string,
): Promise<GeneratedQueries> {
  const count = depth === "quick" ? 3 : depth === "deep" ? 8 : 6;
  const fallback: GeneratedQueries = {
    web: generateSearchAnglesFallback(topic, depth),
    video: [`${topic} video explanation`],
    media: [],
  };
  if (!geminiKey) return fallback;

  try {
    // Check Cortex for existing knowledge to make queries more targeted
    let cortexContext = "";
    try {
      const { readIndex } = await import("./cortex-tools.js");
      const index = readIndex();
      const queryTerms = topic.toLowerCase().split(/\s+/).filter(t => t.length > 2);
      const relevant = index.filter(e => {
        const hay = (e.title + " " + e.summary + " " + e.tags.join(" ")).toLowerCase();
        return queryTerms.some(t => hay.includes(t));
      }).slice(0, 3);
      if (relevant.length > 0) {
        cortexContext = `\n\nThe user already has knowledge about:\n${relevant.map(e => `- ${e.title}: ${e.summary}`).join("\n")}\nGenerate queries that go DEEPER (advanced topics, recent developments, edge cases) rather than covering basics they already know.`;
      }
    } catch { /* cortex not available */ }

    const prompt = `Generate search queries for thoroughly researching: "${topic}"${cortexContext}

Return JSON with 3 arrays:
{
  "web": [${count} diverse web search queries using topic-specific terminology],
  "video": [2-3 targeted video search queries for tutorials, documentaries, expert talks],
  "media": [1-2 queries to find recommended books, movies, TV shows, documentaries, podcasts about this topic]
}

Web queries should cover: core concepts, recent developments (${new Date().getFullYear() - 1}-${new Date().getFullYear()}), expert analysis, data/statistics, challenges, comparisons.
Video queries should find the BEST explainer videos, documentaries, and expert presentations — use specific terms.
Media queries should find cultural/educational media (books, films, series, podcasts) related to the topic.

Use topic-specific language — NOT generic suffixes like "overview explained".

IMPORTANT: Detect the language of the topic. Generate search queries primarily in that same language, but also include 1-2 English queries for broader coverage if the topic is not in English.

Example for "quantum computing":
{
  "web": ["quantum computing current state 2025 superconducting qubits", "quantum error correction breakthrough 2024", ...],
  "video": ["quantum computing explained best YouTube tutorial", "quantum computing documentary IBM Google"],
  "media": ["best books about quantum computing beginners to advanced", "quantum computing movies documentaries TV shows"]
}`;

    const raw = await llm({ prompt, tier: "utility", apiKey: geminiKey });
    const parsed = JSON.parse(cleanJson(raw));
    if (parsed && Array.isArray(parsed.web) && parsed.web.length >= 2) {
      const result: GeneratedQueries = {
        web: (parsed.web as string[]).slice(0, count + 2),
        video: Array.isArray(parsed.video) ? (parsed.video as string[]).slice(0, 3) : fallback.video,
        media: Array.isArray(parsed.media) ? (parsed.media as string[]).slice(0, 2) : [],
      };
      logAction({ ts: Date.now(), type: "action", category: "researcher", message: `LLM-generated ${result.web.length} web + ${result.video.length} video + ${result.media.length} media queries for "${topic}"` });
      return result;
    }
  } catch (err) {
    logAction({ ts: Date.now(), type: "action", category: "researcher", message: `LLM query generation failed, using fallback: ${err instanceof Error ? err.message : String(err)}` });
  }

  return fallback;
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

// ── Content-level deduplication (post-synthesis) ──

const DEDUP_SIMILARITY_THRESHOLD = 0.7;

/** Build word trigrams from text */
export function buildTrigrams(text: string): Set<string> {
  const words = text.replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
  const trigrams = new Set<string>();
  for (let i = 0; i <= words.length - 3; i++) {
    trigrams.add(words.slice(i, i + 3).join(" "));
  }
  return trigrams;
}

/** Jaccard similarity between two trigram sets */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const trigram of a) {
    if (b.has(trigram)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Post-synthesis content deduplication.
 * Detects and removes duplicate sections when Phase A narrative and Phase B sections overlap.
 * Uses word trigram Jaccard similarity to detect near-duplicates.
 */
export function deduplicateSynthesisContent(
  narrative: string,
  sections: Array<{ title: string; summary: string; bullets: string[]; sourceRefs: number[] }>
): Array<{ title: string; summary: string; bullets: string[]; sourceRefs: number[] }> {
  if (!narrative || sections.length === 0) return sections;

  // Build trigrams from narrative paragraphs
  const narrativeParagraphs = narrative.split(/\n\n+/).filter(p => p.trim().length > 50);
  const narrativeTrigrams = narrativeParagraphs.map(p => buildTrigrams(p.toLowerCase()));

  // Check each section for overlap with narrative
  const dedupedSections = sections.filter(section => {
    const sectionText = [section.summary, ...section.bullets].join(" ").toLowerCase();
    if (sectionText.length < 50) return true; // Keep short sections

    const sectionTrigrams = buildTrigrams(sectionText);

    // Check against each narrative paragraph
    for (const narTrigrams of narrativeTrigrams) {
      const similarity = jaccardSimilarity(sectionTrigrams, narTrigrams);
      if (similarity > DEDUP_SIMILARITY_THRESHOLD) return false; // Drop near-duplicate section
    }
    return true;
  });

  // Also deduplicate sections against each other
  const finalSections: typeof sections = [];
  for (const section of dedupedSections) {
    const sectionText = [section.title, section.summary, ...section.bullets].join(" ").toLowerCase();
    const sectionTrigrams = buildTrigrams(sectionText);

    let isDupe = false;
    for (const existing of finalSections) {
      const existingText = [existing.title, existing.summary, ...existing.bullets].join(" ").toLowerCase();
      const existingTrigrams = buildTrigrams(existingText);
      if (jaccardSimilarity(sectionTrigrams, existingTrigrams) > DEDUP_SIMILARITY_THRESHOLD) {
        isDupe = true;
        break;
      }
    }
    if (!isDupe) finalSections.push(section);
  }

  return finalSections;
}

// ── LLM Synthesis prompts ──

/** Build shared source context string for both synthesis phases */
function buildSynthesisSourceContext(results: BraveWebResult[], sources?: Source[]): string {
  const sourceEntries = results.slice(0, 30).map((r, i) => {
    const fullContent = sources?.[i]?.fullContent;
    if (fullContent && fullContent.length > 100) {
      return `[${i}] ${r.title}\n    URL: ${r.url}\n    FULL ARTICLE CONTENT:\n${fullContent}`;
    }
    return `[${i}] ${r.title}\n    ${r.description}\n    URL: ${r.url}`;
  });
  return sourceEntries.join("\n\n");
}

/** Phase A: summary + narrative + key findings (fast, pushed to UI immediately) */
function buildPhaseAPrompt(topic: string, sourceContext: string, language: string | undefined, videoContext: string, sourceCount: number): string {
  const contentNote = sourceContext.includes("FULL ARTICLE CONTENT")
    ? "\nNOTE: Some sources include FULL ARTICLE CONTENT. Prioritize these for evidence-rich synthesis."
    : "";

  return `You are a senior research analyst. Given web search results about "${topic}", produce the core synthesis.

CRITICAL LANGUAGE RULE: ALL output text MUST be written in ${language || "the same language as the topic"}. ${language ? `Write EVERYTHING in ${language}.` : ""}

SEARCH RESULTS:
${sourceContext}${contentNote}${videoContext}

Return valid JSON (no markdown fences):
{
  "summary": "Executive summary paragraph (3-5 sentences covering the most important findings)",
  "narrative": "A 4-8 paragraph comprehensive article. Engaging magazine-feature style. Flowing prose only — NO bullet points, NO numbered lists. Separate paragraphs with double newlines.",
  "keyFindings": [
    { "text": "Clear, specific finding", "type": "fact|trend|insight|warning", "confidence": "high|medium|low", "sourceRefs": [0, 3] }
  ]
}

Rules:
- The narrative is the PRIMARY output — comprehensive, engaging, covering ALL important material
- Write like a magazine feature: strong hook, thematic paragraphs, forward-looking close
- RECOMMENDATION-FIRST: Your narrative MUST start with the key finding or recommendation in the first paragraph. If the user is asking "what should I use/do?", answer that question FIRST, then provide supporting evidence.
- If the topic appears to be a comparison (mentions "vs", "versus", "compare", "which", "better than", "pros and cons"), your first paragraph MUST state your recommendation and the comparison entities' relative positions. Then provide evidence.
- Generate 6-10 key findings. Mix fact, trend, insight, warning types
- sourceRefs: valid 0-indexed integers from 0 to ${sourceCount - 1}
- CRITICAL: Return ONLY valid JSON. No markdown fences, no comments`;
}

/** Phase B: sections + books/movies/contradictions (runs in parallel with gap check) */
function buildPhaseBPrompt(topic: string, sourceContext: string, language: string | undefined, videoContext: string, sourceCount: number, videoCount: number): string {
  return `You are a senior research analyst. Given web search results about "${topic}", produce detailed sections and media recommendations.

CRITICAL LANGUAGE RULE: ALL output text MUST be written in ${language || "the same language as the topic"}. ${language ? `Write EVERYTHING in ${language}.` : ""}

SEARCH RESULTS:
${sourceContext}${videoContext}

Return valid JSON (no markdown fences):
{
  "sections": [
    { "title": "Section Title", "summary": "One-sentence overview", "bullets": ["Point 1", "Point 2", "Point 3"], "sourceRefs": [1, 4, 7] }
  ],
  "books": [{ "title": "...", "author": "...", "year": "...", "description": "one-sentence why relevant" }],
  "movies": [{ "title": "...", "year": "...", "type": "movie|tv|documentary|podcast", "description": "one-sentence why relevant" }],
  "recommendedVideos": [{ "index": 0, "reason": "why this video is valuable" }],
  "contradictions": [{ "claim": "The disputed claim", "perspectives": ["Source A says X", "Source B says Y"], "sourceRefs": [0, 3] }]
}

Rules:
- Generate 4-6 thematic sections organized by subtopic, each with 3-5 detailed bullets
- sourceRefs: valid 0-indexed integers from 0 to ${sourceCount - 1}
- recommendedVideos index: 0 to ${videoCount - 1}. Pick top 3-5 most valuable
- 0-5 books and 0-5 movies/shows — only genuinely relevant and real titles
- Only include real contradictions found across sources
- CRITICAL: Return ONLY valid JSON`;
}

function buildSynthesisPrompt(topic: string, results: BraveWebResult[], sources?: Source[], language?: string): string {
  // Use full article content when available, falling back to snippets
  const sourceEntries = results.slice(0, 30).map((r, i) => {
    const fullContent = sources?.[i]?.fullContent;
    if (fullContent && fullContent.length > 100) {
      return `[${i}] ${r.title}\n    URL: ${r.url}\n    FULL ARTICLE CONTENT:\n${fullContent}`;
    }
    return `[${i}] ${r.title}\n    ${r.description}\n    URL: ${r.url}`;
  });
  const snippetText = sourceEntries.join("\n\n");

  const contentNote = sources?.some((s) => s.fullContent)
    ? "\nNOTE: Some sources include FULL ARTICLE CONTENT extracted from the source pages. Prioritize these for your analysis — they contain far richer information than the short snippets. Use specific facts, statistics, quotes, and details from the full content to produce a deeply informed, evidence-rich synthesis."
    : "";

  return `You are a senior research analyst. Given web search results about "${topic}", synthesize comprehensive research findings.

CRITICAL LANGUAGE RULE: ALL output text (summary, narrative, keyFindings, sections, books, movies, contradictions) MUST be written in ${language || "the same language as the topic"}. ${language ? `Write EVERYTHING in ${language}.` : ""} Even if the source material is in English, translate and write your synthesis in ${language || "the topic's language"}. Only sourceRefs, type labels (fact/trend/insight/warning), and confidence labels (high/medium/low) remain in English.

SEARCH RESULTS:
${snippetText}${contentNote}

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
- RECOMMENDATION-FIRST: Your narrative MUST start with the key finding or recommendation in the first paragraph. If the user is asking "what should I use/do?", answer that question FIRST, then provide supporting evidence.
- If the topic appears to be a comparison (mentions "vs", "versus", "compare", "which", "better than", "pros and cons"), your first paragraph MUST state your recommendation and the comparison entities' relative positions. Then provide evidence.
- Write the narrative like a well-crafted magazine feature or intelligence briefing: strong opening that hooks the reader and establishes why this topic matters now, body paragraphs each exploring a distinct angle or theme, closing with forward-looking perspective or implications
- Each narrative paragraph should be 3-5 sentences of flowing, connected prose
- Generate 6-10 key findings covering the most important discoveries. Mix fact, trend, insight, and warning types
- Generate 4-6 thematic sections organized by subtopic, each with 3-5 detailed bullets
- sourceRefs MUST be valid 0-indexed integers from 0 to ${results.slice(0, 30).length - 1} (there are ${results.slice(0, 30).length} sources). Do NOT use any index >= ${results.slice(0, 30).length}
- Each finding and section MUST reference at least one source
- Finding types: fact (verified data/statistic), trend (emerging pattern), insight (analytical observation), warning (risk/concern/limitation)
- Confidence: high (multiple corroborating sources), medium (some support), low (single source or speculative)
- Bullets should be specific, informative, and substantive (not vague)
- Section titles should be clear topical headings, not generic labels
- CRITICAL: Return ONLY valid JSON. Do NOT use invalid escape sequences in strings. Only use \\n \\t \\\\ \\" — never \\s \\d \\p or similar

Also extract any books, movies, TV shows, documentaries, and podcasts mentioned or relevant. Add these fields:
  "books": [{ "title": "...", "author": "...", "year": "...", "description": "one-sentence why it's relevant" }],
  "movies": [{ "title": "...", "year": "...", "type": "movie|tv|documentary|podcast", "description": "one-sentence why it's relevant" }]
Include 0-5 books and 0-5 movies/shows. Only include genuinely relevant and real titles — do not fabricate.

If sources contradict each other on any point, add:
  "contradictions": [{ "claim": "The disputed claim", "perspectives": ["Source A says X", "Source B says Y"], "sourceRefs": [0, 3] }]
Only include genuine contradictions found across sources — do not fabricate.`;
}

function buildDeepDivePrompt(topic: string, subtopic: string, parentContext: string, results: BraveWebResult[], sources?: Source[]): string {
  const sourceEntries = results.slice(0, 20).map((r, i) => {
    const fullContent = sources?.[i]?.fullContent;
    if (fullContent && fullContent.length > 100) {
      return `[${i}] ${r.title}\n    FULL CONTENT:\n${fullContent}`;
    }
    return `[${i}] ${r.title}\n    ${r.description}`;
  });
  const snippetText = sourceEntries.join("\n\n");

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

function buildComparePrompt(topicA: string, topicB: string, context: string, results: BraveWebResult[], sources?: Source[]): string {
  const sourceEntries = results.slice(0, 25).map((r, i) => {
    const fullContent = sources?.[i]?.fullContent;
    if (fullContent && fullContent.length > 100) {
      return `[${i}] ${r.title}\n    FULL CONTENT:\n${fullContent}`;
    }
    return `[${i}] ${r.title}\n    ${r.description}`;
  });
  const snippetText = sourceEntries.join("\n\n");

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

function buildFollowUpPrompt(topic: string, question: string, parentContext: string, results: BraveWebResult[], sources?: Source[]): string {
  const sourceEntries = results.slice(0, 15).map((r, i) => {
    const fullContent = sources?.[i]?.fullContent;
    if (fullContent && fullContent.length > 100) {
      return `[${i}] ${r.title}\n    FULL CONTENT:\n${fullContent}`;
    }
    return `[${i}] ${r.title}\n    ${r.description}`;
  });
  const snippetText = sourceEntries.join("\n\n");

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

// ── Context builder for research history ──

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
    const raw = await llm({ prompt, tier: "fast", timeoutMs: 60_000, apiKey: geminiKey });
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
      phase: "complete",
      summary: parsed.summary ?? "",
      narrative: parsed.narrative ?? "",
      keyFindings: (parsed.keyFindings ?? []).slice(0, 8),
      sections: (parsed.sections ?? []).slice(0, sectionCount),
      sources: [] as Source[],
      images: [] as ResearchImage[],
      videos: [] as ResearchVideo[],
      books: [] as ResearchBook[],
      movies: [] as ResearchMovie[],
      recommendedVideos: [] as RecommendedVideo[],
      contradictions: [] as Contradiction[],
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
      books: [],
      movies: [],
      recommendedVideos: [],
      contradictions: [],
      timestamp: Date.now(),
    };
    researchHistory.save(topicSlug(topic), cachedLlm, buildResearchMeta(cachedLlm, depth));

    // Auto-ingest into Knowledge Cortex (fire-and-forget)
    try {
      import("./cortex-tools.js").then(({ ingestFromResearch }) => {
        ingestFromResearch({ topic, summary: result.summary, keyFindings: result.keyFindings, sections: result.sections }).catch(() => {});
      }).catch(() => {});
    } catch { /* best effort */ }

    return jsonResult(result);
  } catch (err) {
    logError("researcher", "LLM-only research failed", err, { topic, depth });
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
    books: [],
    movies: [],
    recommendedVideos: [],
    contradictions: [],
    metadata: {
      queriesRun: 0,
      sourcesFound: 0,
      sectionsGenerated: 3,
      timestamp: Date.now(),
      note: "Sample data — set BRAVE_API_KEY for live research",
    },
  });
}

// ── Deep Research Classification ──

/**
 * Research depth classifier: decides whether a topic needs standard web search
 * or deep iterative research (Claude Code multi-round analysis).
 *
 * Note: Simple Q&A is already filtered by the task-router before we get here,
 * so this only decides between standard and deep.
 */
type RouteResult = {
  route: "simple" | "standard" | "deep";
  reason: string;
  answer?: string;
};

async function classifyResearchRoute(topic: string, geminiKey: string, _language: string): Promise<RouteResult> {
  try {
    const prompt = `Classify whether this research topic needs standard web search or deep iterative research.

Topic: "${topic}"

ROUTES:
1. "standard" — DEFAULT for almost everything. Web search + synthesis handles: current events, "latest X", "best X for Y", comparisons (even 3-4 items), product reviews, health/science questions, how-to guides, technology trends, breakthroughs/updates, recommendations, pros/cons analysis. Standard research already searches 6+ queries in parallel and synthesizes 10+ full articles — it is thorough.
2. "deep" — RARE. Only for genuinely complex multi-domain analysis that standard cannot handle: policy impact analysis spanning economics+politics+social, PhD-level academic literature reviews, comprehensive industry reports requiring 20+ sources across different disciplines, or strategic decision-making requiring iterative hypothesis testing. If you can imagine answering it well with 10 good web sources, it's standard.

IMPORTANT: Default to "standard". Deep research takes 5+ minutes and uses expensive resources. Only choose deep when standard would genuinely produce an incomplete or misleading answer.

Return valid JSON (no markdown fences):
{ "route": "standard" | "deep", "reason": "One sentence explaining" }`;

    const raw = await llm({ prompt, tier: "utility", apiKey: geminiKey });
    const parsed = JSON.parse(cleanJson(raw)) as RouteResult;
    const route = (["simple", "standard", "deep"].includes(parsed.route) ? parsed.route : "standard") as RouteResult["route"];
    logAction({ ts: Date.now(), type: "action", category: "researcher", message: `route: ${route} for "${topic}" — ${parsed.reason ?? ""}` });
    return { route, answer: parsed.answer, reason: parsed.reason ?? "" };
  } catch (err) {
    logError("researcher", "Research route classification failed", err, { topic });
    return { route: "standard", reason: "classification failed, defaulting to standard" };
  }
}

// Deep research system prompt removed — deep research now builds custom apps
// via handleDeepResearchBuild() in build-via-claude.ts

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
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const mark = (phase: string) => { timings[phase] = Date.now() - t0; };
  // Language priority: explicit param > detect from topic > detect from user's original message
  let language = params.language || detectLanguage(topic);
  if (language === "English" && _lastUserMessage) {
    const userLang = detectLanguage(_lastUserMessage);
    if (userLang !== "English") {
      language = userLang;
      logAction({ ts: Date.now(), type: "action", category: "researcher", message: `language override from user message: ${userLang} (topic detected as English)` });
    }
  }

  // ── Cache-first: return cached results instantly for repeat topics ──
  if (!params.force) {
    const slug = topicSlug(topic);
    const cached = researchHistory.load(slug);
    if (cached && cached.summary && cached.keyFindings?.length > 0) {
      // Check cache age — serve if less than 24 hours old
      const cacheAge = Date.now() - (cached.timestamp || 0);
      const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24h
      if (cacheAge < MAX_CACHE_AGE_MS) {
        logAction({ ts: Date.now(), type: "action", category: "researcher", message: `cache hit for "${topic}" (age: ${Math.round(cacheAge / 60000)}min)` });

        // Check if a deeper depth was requested than what's cached
        const depthOrder = { quick: 0, standard: 1, deep: 2 };
        const cachedMeta = researchHistory.list().find((e) => e.id === slug);
        const cachedDepth = (cachedMeta?.meta?.depth ?? "standard") as keyof typeof depthOrder;
        if (depthOrder[depth] <= depthOrder[cachedDepth]) {
          return jsonResult({
            tool: "enso_researcher_search",
            topic: cached.topic,
            depth: cachedDepth,
            phase: "complete",
            summary: cached.summary,
            narrative: cached.narrative ?? "",
            keyFindings: cached.keyFindings,
            sections: cached.sections ?? [],
            sources: cached.sources ?? [],
            images: cached.images ?? [],
            videos: cached.videos ?? [],
            books: cached.books ?? [],
            movies: cached.movies ?? [],
            recommendedVideos: cached.recommendedVideos ?? [],
            contradictions: cached.contradictions ?? [],
            fromHistory: true,
            metadata: {
              queriesRun: 0,
              sourcesFound: cached.sources?.length ?? 0,
              sectionsGenerated: cached.sections?.length ?? 0,
              timestamp: cached.timestamp,
              note: "From research library",
            },
            recentTopics: researchHistory.list().slice(0, 12),
          });
        }
        // Deeper depth requested → fall through to fresh search
        logAction({ ts: Date.now(), type: "action", category: "researcher", message: `deeper depth "${depth}" requested vs cached "${cachedDepth}" — running fresh search` });
      }
    }
  }

  // ── Deep research classification ──
  // The task-router already filters out simple Q&A before we get here,
  // so we only need to decide: standard pipeline vs deep research escalation.
  const geminiKey = await getGeminiApiKey();

  // Generate search queries (no separate classification call needed —
  // task-router already handled simple vs research, and deep is only
  // triggered explicitly via the ✨ Deep button on completed cards)
  if (depth !== "deep" && geminiKey) {
    mark("classify_start");
    const queries_ = await generateSearchAngles(topic, depth, geminiKey);
    mark("classify_done");
    _precomputedQueries = queries_;
  }

  // Deep research is ONLY triggered explicitly via the ✨ Deep button on a completed card.
  // Never auto-escalate from the internal classifier route. This ensures users always get
  // fast standard results first (~30-60s) and can opt into deep research (~5 min) if desired.
  const shouldDeepResearch = depth === "deep";

  if (shouldDeepResearch && _deepResearchLauncher && geminiKey) {
      logAction({ ts: Date.now(), type: "action", category: "researcher", message: `deep research triggered for "${topic}" (explicit depth=deep)` });

      pushProgress({
        tool: "enso_researcher_search",
        topic,
        depth: "deep",
        phase: "deep_research",
        summary: "",
        narrative: "",
        keyFindings: [],
        sections: [],
        sources: [],
        images: [],
        videos: [],
      });

      // Launch deep research → custom UI generation
      // Claude Code researches the topic AND generates a bespoke JSX template
      const generatedUI = await new Promise<string | null>((resolve) => {
        _deepResearchLauncher!({
          topic,
          language,
          onComplete: resolve,
        });
      });

      if (generatedUI) {
        // Custom template generated — return result with generatedUI for the card
        logAction({ ts: Date.now(), type: "action", category: "researcher", message: `deep research custom UI generated for "${topic}" (${generatedUI.length} chars)` });

        const result = {
          tool: "enso_researcher_search",
          topic,
          depth: "deep",
          phase: "app_built",
          summary: `Custom research experience for: ${topic}`,
          narrative: "",
          keyFindings: [],
          sections: [],
          sources: [],
          images: [],
          videos: [],
          metadata: {
            queriesRun: 0,
            sourcesFound: 0,
            sectionsGenerated: 0,
            timestamp: Date.now(),
            note: "Deep research delivered as custom UI",
            isDeepResearch: true,
            isCustomApp: true,
          },
          _generatedUI: generatedUI,
        };
        return jsonResult(result);
      }

      // If UI generation failed, fall through to standard pipeline
      logAction({ ts: Date.now(), type: "action", category: "researcher", message: `deep research UI generation failed for "${topic}", falling back to standard pipeline` });
  }

  // ── Phase: generating_queries ──
  pushProgress({
    tool: "enso_researcher_search",
    topic,
    depth,
    phase: "generating_queries",
    summary: "",
    narrative: "",
    keyFindings: [],
    sections: [],
    sources: [],
    images: [],
    videos: [],
  });
  // Use pre-computed queries from parallel classification (if available), otherwise generate now
  let queries: GeneratedQueries;
  if (_precomputedQueries) {
    queries = _precomputedQueries;
    _precomputedQueries = null; // consume once
  } else {
    queries = await generateSearchAngles(topic, depth, geminiKey ?? undefined);
  }

  // Fallback: no Brave key
  if (!getBraveApiKey()) {
    logAction({ ts: Date.now(), type: "action", category: "researcher", message: `No BRAVE_API_KEY — attempting LLM-only research` });
    if (geminiKey) {
      try {
        return await llmOnlyResearch(topic, depth, geminiKey);
      } catch (err) {
        logError("researcher", "LLM-only failed", err, { topic, depth });
      }
    }
    return generateSampleResearch(topic, depth);
  }

  // ── Phase: searching ──
  mark("search_start");
  const allQueries = [...queries.web, ...queries.video, ...queries.media];
  pushProgress({
    tool: "enso_researcher_search",
    topic,
    depth,
    phase: "searching",
    searchQueries: allQueries,
    summary: "",
    narrative: "",
    keyFindings: [],
    sections: [],
    sources: [],
    images: [],
    videos: [],
    books: [],
    movies: [],
    recommendedVideos: [],
  });

  // Parallel Brave searches + image/video/media searches (zero extra latency)
  logAction({ ts: Date.now(), type: "action", category: "researcher", message: `searching "${topic}" (${depth}): ${queries.web.length} web + ${queries.video.length} video + ${queries.media.length} media queries` });

  // Stream source results as they arrive AND start fetching content immediately
  const collectedSources: Source[] = [];
  const earlyFetchPromises: Promise<void>[] = [];
  const fetchedUrls = new Set<string>();
  const searchPromises = queries.web.map((q) =>
    braveWebSearch(q, 6).then((batch) => {
      const newSources = deduplicateAndScore([batch]);
      for (const s of newSources) {
        if (!collectedSources.some((existing) => existing.url === s.url)) {
          collectedSources.push(s);
          // Start fetching content for top sources immediately (don't wait for all searches)
          if (!SKIP_CONTENT_DOMAINS.has(s.domain) && !fetchedUrls.has(s.url) && fetchedUrls.size < MAX_SOURCES_TO_FETCH) {
            fetchedUrls.add(s.url);
            earlyFetchPromises.push(
              fetchPageContent(s.url).then((content) => {
                if (content && content.length > 100) s.fullContent = content;
              }).catch(() => {}),
            );
          }
        }
      }
      // Push incremental source update
      pushProgress({
        tool: "enso_researcher_search",
        topic,
        depth,
        phase: "sources",
        searchQueries: allQueries,
        summary: "",
        narrative: "",
        keyFindings: [],
        sections: [],
        sources: collectedSources.slice(0, 25),
        images: [],
        videos: [],
        books: [],
        movies: [],
        recommendedVideos: [],
      });
    }),
  );

  // All searches run in a single Promise.all — web, video, image, and media in parallel
  const videoSearchPromises = queries.video.map((q) => braveVideoSearch(q, 6));
  const mediaSearchPromises = queries.media.map((q) => braveWebSearch(q, 8));

  const [, rawImages, ...mixedResults] = await Promise.all([
    Promise.all(searchPromises),
    braveImageSearch(`${topic} photos images`, 10),
    ...videoSearchPromises,
    ...mediaSearchPromises,
  ]);

  mark("search_done");
  // Split mixed results: first N are video batches, rest are media batches
  const videoResults = mixedResults.slice(0, queries.video.length);
  const mediaResults = mixedResults.slice(queries.video.length);

  // Deduplicate videos across all video queries
  const seenVideoUrls = new Set<string>();
  const rawVideos: BraveVideoResult[] = [];
  for (const batch of videoResults) {
    for (const v of batch as BraveVideoResult[]) {
      if (v.url && !seenVideoUrls.has(v.url)) {
        seenVideoUrls.add(v.url);
        rawVideos.push(v);
      }
    }
  }

  // Collect media results as additional sources for synthesis
  const mediaSourceBatches = mediaResults.map((batch) => batch as BraveWebResult[]);
  const mediaSources = deduplicateAndScore(mediaSourceBatches);

  // Re-sort collected sources by relevance
  collectedSources.sort((a, b) => b.relevance - a.relevance);
  const sources = collectedSources;

  if (sources.length === 0) {
    logError("researcher", `no search results for "${topic}"`, undefined, { topic, depth });
    if (geminiKey) return llmOnlyResearch(topic, depth, geminiKey);
    return generateSampleResearch(topic, depth);
  }

  // Wait for early fetches to complete, then fetch any remaining sources + media
  mark("fetch_start");
  await Promise.all([
    ...earlyFetchPromises,
    // Fetch any sources that weren't caught by early fetch (late-arriving searches)
    ...sources.filter((s) => !fetchedUrls.has(s.url) && !SKIP_CONTENT_DOMAINS.has(s.domain))
      .slice(0, MAX_SOURCES_TO_FETCH - fetchedUrls.size)
      .map((s) => fetchPageContent(s.url).then((content) => {
        if (content && content.length > 100) s.fullContent = content;
      }).catch(() => {})),
    enrichSourcesWithContent(mediaSources.slice(0, 5)),
  ]);
  mark("fetch_done");

  // ── Phase: synthesizing ──
  pushProgress({
    tool: "enso_researcher_search",
    topic,
    depth,
    phase: "synthesizing",
    searchQueries: allQueries,
    summary: "",
    narrative: "",
    keyFindings: [],
    sections: [],
    sources: sources.slice(0, 25),
    images: matchImagesToSections([], rawImages),
    videos: rawVideos.slice(0, 12).map((v) => ({ ...v, thumbnail: toProxiedImageUrl(v.thumbnail) })),
    books: [],
    movies: [],
    recommendedVideos: [],
  });

  // Build source list for LLM (with full content when available)
  // Include both web sources and media sources for comprehensive synthesis
  const allSourcesForLLM = [...sources.slice(0, 25), ...mediaSources.slice(0, 5)];
  const snippetsForLLM: BraveWebResult[] = allSourcesForLLM.map((s) => ({
    title: s.title,
    url: s.url,
    description: s.snippet,
  }));

  // Include video titles in the synthesis prompt for ranking
  const videoContext = rawVideos.length > 0
    ? `\n\nVIDEOS FOUND (rank the top 3-5 most helpful — include their index and a brief reason to watch):\n${rawVideos.slice(0, 12).map((v, i) => `[V${i}] "${v.title}" by ${v.creator ?? v.publisher ?? "unknown"} (${v.duration ?? "unknown duration"}): ${v.description?.slice(0, 100) ?? ""}`).join("\n")}\n\nAdd to your JSON: "recommendedVideos": [{ "index": 0, "reason": "Why this video is worth watching" }]`
    : "";

  // LLM synthesis
  if (!geminiKey) {
    return fallbackFromSources(topic, depth, sources, "no Gemini API key");
  }

  try {
    // ── Two-phase synthesis for faster perceived results ──
    // Phase A (Flash): summary + narrative + key findings → push to UI immediately (~8-12s)
    // Phase B (Flash): sections + books/movies/contradictions → runs in parallel with gap check

    const sourceContext = buildSynthesisSourceContext(snippetsForLLM, allSourcesForLLM);

    // Phase A: Core synthesis (summary + narrative + key findings)
    mark("synthesis_start");
    const phaseAPrompt = buildPhaseAPrompt(topic, sourceContext, language, videoContext, allSourcesForLLM.length);
    let phaseARaw = await llm({ prompt: phaseAPrompt, tier: "utility", timeoutMs: LLM_RESEARCH_TIMEOUT_MS, apiKey: geminiKey });
    let phaseAParsed: Record<string, unknown>;
    try {
      phaseAParsed = JSON.parse(cleanJson(phaseARaw));
    } catch {
      logAction({ ts: Date.now(), type: "action", category: "researcher", message: `retrying Phase A synthesis for "${topic}"` });
      phaseARaw = await llm({
        prompt: phaseAPrompt + "\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no comments, no trailing commas.",
        tier: "utility", timeoutMs: LLM_RESEARCH_TIMEOUT_MS, apiKey: geminiKey,
      });
      phaseAParsed = JSON.parse(cleanJson(phaseARaw));
    }
    mark("synthesis_a_done");

    // Validate and clamp sourceRefs
    const maxRef = allSourcesForLLM.length - 1;
    const clampRefs = (refs: number[] | undefined) =>
      (refs ?? []).filter((r) => typeof r === "number" && r >= 0 && r <= maxRef);

    const typedA = phaseAParsed as {
      summary: string; narrative: string; keyFindings: KeyFinding[];
    };
    const keyFindings = (typedA.keyFindings ?? []).slice(0, 8).map((f) => ({
      text: f.text ?? "",
      type: (["fact", "trend", "insight", "warning"].includes(f.type) ? f.type : "insight") as KeyFinding["type"],
      confidence: (["high", "medium", "low"].includes(f.confidence) ? f.confidence : "medium") as KeyFinding["confidence"],
      sourceRefs: clampRefs(f.sourceRefs),
    }));

    // Match images + build video list (no LLM needed)
    const videos: ResearchVideo[] = rawVideos.slice(0, 12).map((v) => ({
      ...v,
      thumbnail: toProxiedImageUrl(v.thumbnail),
    }));

    // Push Phase A results immediately — user sees summary+findings while Phase B runs
    pushProgress({
      tool: "enso_researcher_search",
      topic,
      depth,
      phase: "synthesized",
      searchQueries: allQueries,
      summary: typedA.summary ?? "",
      narrative: typedA.narrative ?? "",
      keyFindings,
      sections: [],  // populated by Phase B
      sources: sources.slice(0, 25),
      images: [],
      videos,
      books: [],
      movies: [],
      recommendedVideos: [],
      contradictions: [],
    });

    // Phase B: Sections + media extraction (runs in parallel with gap check)
    const phaseBPrompt = buildPhaseBPrompt(topic, sourceContext, language, videoContext, allSourcesForLLM.length, videos.length);

    // Start Phase B and gap check concurrently
    const phaseBPromise = llm({ prompt: phaseBPrompt, tier: "utility", timeoutMs: LLM_RESEARCH_TIMEOUT_MS, apiKey: geminiKey })
      .then((raw) => {
        try { return JSON.parse(cleanJson(raw)); } catch { return null; }
      })
      .catch((err) => { logError("researcher", "Phase B synthesis failed", err, { topic }); return null; });

    let gapQueries: string[] = [];
    const shouldGapCheck = (depth === "deep" || depth === "standard") && geminiKey && keyFindings.length > 0;
    const gapPromise = shouldGapCheck ? (async () => {
      mark("gap_start");
      const gapPrompt = `Given this research synthesis about "${topic}":

Summary: ${typedA.summary ?? ""}

Key findings: ${keyFindings.map((f) => f.text).join("; ")}

Identify 1-3 specific questions or angles NOT adequately covered that would significantly strengthen this research.

Return valid JSON (no markdown fences):
{ "gaps": ["specific search query 1", "specific search query 2"] }

Generate gap queries in the same language as the topic "${topic}".
If the research is already comprehensive, return: { "gaps": [] }`;

      try {
        const gapRaw = await llm({ prompt: gapPrompt, tier: "utility", apiKey: geminiKey });
        const gapParsed = JSON.parse(cleanJson(gapRaw)) as { gaps: string[] };
        gapQueries = (gapParsed.gaps ?? []).filter((g) => typeof g === "string").slice(0, 3);
        return gapQueries;
      } catch (err) {
        logError("researcher", "Gap detection failed", err, { topic });
        return [];
      }
    })() : Promise.resolve([]);

    // Wait for both Phase B and gap detection to complete in parallel
    const [phaseBResult, detectedGaps] = await Promise.all([phaseBPromise, gapPromise]);
    mark("synthesis_done");

    // Extract Phase B results
    const typedB = (phaseBResult ?? {}) as {
      sections?: ResearchSection[];
      books?: ResearchBook[];
      movies?: ResearchMovie[];
      recommendedVideos?: RecommendedVideo[];
      contradictions?: Contradiction[];
    };

    const sections = (typedB.sections ?? []).slice(0, 6).map((s) => ({
      title: s.title ?? "Untitled Section",
      summary: s.summary ?? "",
      bullets: Array.isArray(s.bullets) ? s.bullets.filter((b) => typeof b === "string") : [],
      sourceRefs: clampRefs(s.sourceRefs),
    }));

    const images = matchImagesToSections(sections, rawImages);

    const books: ResearchBook[] = (typedB.books ?? []).slice(0, 5).map((b) => ({
      title: b.title ?? "",
      author: b.author ?? "",
      year: b.year,
      description: b.description ?? "",
      url: b.url,
    })).filter((b) => b.title);

    const movies: ResearchMovie[] = (typedB.movies ?? []).slice(0, 5).map((m) => ({
      title: m.title ?? "",
      year: m.year,
      type: (["movie", "tv", "documentary", "podcast"].includes(m.type) ? m.type : "documentary") as ResearchMovie["type"],
      description: m.description ?? "",
      url: m.url,
    })).filter((m) => m.title);

    const recommendedVideos: RecommendedVideo[] = (typedB.recommendedVideos ?? [])
      .filter((rv) => typeof rv.index === "number" && rv.index >= 0 && rv.index < videos.length && typeof rv.reason === "string")
      .slice(0, 5)
      .map((rv) => ({ index: rv.index, reason: rv.reason }));

    const contradictions: Contradiction[] = (typedB.contradictions ?? [])
      .filter((c) => typeof c.claim === "string" && Array.isArray(c.perspectives))
      .slice(0, 5)
      .map((c) => ({
        claim: c.claim,
        perspectives: c.perspectives.filter((p: unknown) => typeof p === "string"),
        sourceRefs: clampRefs(c.sourceRefs),
      }));

    // Deduplicate sections against narrative before pushing
    const dedupedSections = deduplicateSynthesisContent(
      typedA.narrative ?? "",
      sections
    );

    // Push complete results with deduplicated Phase B data
    pushProgress({
      tool: "enso_researcher_search",
      topic,
      depth,
      phase: "synthesized",
      searchQueries: allQueries,
      summary: typedA.summary ?? "",
      narrative: typedA.narrative ?? "",
      keyFindings,
      sections: dedupedSections,
      sources: sources.slice(0, 25),
      images,
      videos,
      books,
      movies,
      recommendedVideos,
      contradictions,
    });

    // ── Gap enrichment (only if gaps were detected during parallel phase) ──
    gapQueries = detectedGaps;
    if (gapQueries.length > 0) {
      logAction({ ts: Date.now(), type: "action", category: "researcher", message: `gap check found ${gapQueries.length} gaps: ${gapQueries.join(", ")}` });
      try {
        // Run gap searches in parallel
        const gapResultSets = await Promise.all(
          gapQueries.map((q) => braveWebSearch(q, 4)),
        );
        const gapResults = gapResultSets.flat();

        // Deduplicate against existing sources
        const existingUrls = new Set(sources.map((s) => s.url));
        const newGapSources: Source[] = [];
        for (const r of gapResults) {
          if (!existingUrls.has(r.url)) {
            existingUrls.add(r.url);
            const domain = (() => { try { return new URL(r.url).hostname.replace("www.", ""); } catch { return "unknown"; } })();
            newGapSources.push({
              url: r.url,
              title: r.title,
              snippet: r.description,
              domain,
              relevance: 0.7,
            });
          }
        }

        if (newGapSources.length > 0) {
          await enrichSourcesWithContent(newGapSources);
          sources.push(...newGapSources);

          const gapSourceEntries = newGapSources.map((s, i) => {
            if (s.fullContent && s.fullContent.length > 100) {
              return `[GAP-${i}] ${s.title}\n    FULL CONTENT:\n${s.fullContent}`;
            }
            return `[GAP-${i}] ${s.title}\n    ${s.snippet}`;
          }).join("\n\n");

          const mergePrompt = `You previously researched "${topic}" and produced this synthesis:

Summary: ${typedA.summary ?? ""}
Narrative: ${typedA.narrative ?? ""}
Key Findings: ${JSON.stringify(keyFindings)}

We found additional sources to fill gaps:

${gapSourceEntries}

Return valid JSON (no markdown fences) with ONLY new content to merge:
{
  "additionalFindings": [{ "text": "New finding", "type": "fact|trend|insight|warning", "confidence": "high|medium|low" }],
  "narrativeAddendum": "1-2 paragraphs of additional narrative. Write as continuation prose.",
  "additionalContradictions": [{ "claim": "...", "perspectives": ["...", "..."] }]
}

Only include genuinely new information. If gap sources don't add meaningful new content, return empty arrays and empty string.`;

          try {
            const mergeRaw = await llm({ prompt: mergePrompt, tier: "utility", apiKey: geminiKey });
            const mergeParsed = JSON.parse(cleanJson(mergeRaw)) as {
              additionalFindings?: KeyFinding[];
              narrativeAddendum?: string;
              additionalContradictions?: Contradiction[];
            };

            if (mergeParsed.additionalFindings?.length) {
              for (const f of mergeParsed.additionalFindings.slice(0, 3)) {
                keyFindings.push({
                  text: f.text ?? "",
                  type: (["fact", "trend", "insight", "warning"].includes(f.type) ? f.type : "insight") as KeyFinding["type"],
                  confidence: (["high", "medium", "low"].includes(f.confidence) ? f.confidence : "medium") as KeyFinding["confidence"],
                  sourceRefs: [],
                });
              }
            }

            if (mergeParsed.narrativeAddendum && mergeParsed.narrativeAddendum.length > 50) {
              typedA.narrative = (typedA.narrative ?? "") + "\n\n" + mergeParsed.narrativeAddendum;
            }

            if (mergeParsed.additionalContradictions?.length) {
              for (const c of mergeParsed.additionalContradictions.slice(0, 2)) {
                if (typeof c.claim === "string" && Array.isArray(c.perspectives)) {
                  contradictions.push({
                    claim: c.claim,
                    perspectives: c.perspectives.filter((p: unknown) => typeof p === "string"),
                    sourceRefs: [],
                  });
                }
              }
            }

            logAction({ ts: Date.now(), type: "action", category: "researcher", message: `gap merge: +${mergeParsed.additionalFindings?.length ?? 0} findings, +${mergeParsed.narrativeAddendum?.length ?? 0} chars narrative` });
          } catch (mergeErr) {
            logError("researcher", "Gap merge synthesis failed", mergeErr, { topic });
          }
        }
      } catch (gapErr) {
        logError("researcher", "Gap enrichment failed", gapErr, { topic });
      }
      mark("gap_done");
    }

    // Re-deduplicate sections after gap merge may have updated narrative
    const finalSections = deduplicateSynthesisContent(
      typedA.narrative ?? "",
      sections
    );

    // Cross-reference topic against user's entire Cortex & data sources (fire-and-forget, non-blocking)
    let cortexSynthesis: { narrative?: string; connections?: Array<{ items: string[]; insight: string }>; themes?: string[]; suggestedActions?: string[]; bySource?: Record<string, Array<{ title: string; reason?: string }>> } = {};
    try {
      const { synthesize } = await import("./cortex-synthesis.js");
      const synthResult = await synthesize(topic);
      if (synthResult.narrative) {
        cortexSynthesis = {
          narrative: synthResult.narrative,
          connections: synthResult.connections,
          themes: synthResult.themes,
          suggestedActions: synthResult.suggestedActions,
          bySource: Object.fromEntries(
            Object.entries(synthResult.relatedContent.bySource).map(([src, hits]) => [
              src, hits.slice(0, 3).map(h => ({ title: h.title, reason: h.reason })),
            ]),
          ),
        };
        logAction({ ts: Date.now(), type: "action", category: "researcher:cortex-synth", message: `Cross-referenced "${topic}": ${synthResult.connections.length} connections across ${Object.keys(synthResult.relatedContent.bySource).length} sources` });
      }
    } catch (synthErr) {
      logAction({ ts: Date.now(), type: "action", category: "researcher:cortex-synth", message: `Cross-reference skipped: ${synthErr instanceof Error ? synthErr.message : String(synthErr)}` });
    }

    const result = {
      tool: "enso_researcher_search",
      topic,
      depth,
      phase: "complete",
      summary: typedA.summary ?? "",
      narrative: typedA.narrative ?? "",
      keyFindings,
      sections: finalSections,
      sources: sources.slice(0, 25),
      images,
      videos,
      books,
      movies,
      recommendedVideos,
      contradictions,
      // Cross-source synthesis from user's personal Cortex
      cortexSynthesis: cortexSynthesis.narrative ? cortexSynthesis : undefined,
      metadata: {
        queriesRun: queries.web.length,
        sourcesFound: sources.length,
        sectionsGenerated: sections.length,
        searchQueries: allQueries,
        gapQueries,
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
      books: result.books,
      movies: result.movies,
      recommendedVideos: result.recommendedVideos,
      contradictions: result.contradictions,
      timestamp: Date.now(),
    };
    researchHistory.save(topicSlug(topic), cachedEntry, buildResearchMeta(cachedEntry, depth));

    // Auto-ingest research findings into Knowledge Cortex (fire-and-forget)
    try {
      import("./cortex-tools.js").then(({ ingestFromResearch }) => {
        ingestFromResearch({ topic, summary: result.summary, narrative: result.narrative, keyFindings, sections, sources }).then(
          (r) => logAction({ ts: Date.now(), type: "action", category: "researcher:cortex", message: `Auto-ingested to Cortex: ${r.pagesCreated.length} created, ${r.pagesUpdated.length} updated` }),
          (e) => logAction({ ts: Date.now(), type: "action", category: "researcher:cortex", message: `Auto-ingest skipped: ${e instanceof Error ? e.message : String(e)}` }),
        );
      }).catch(() => { /* cortex-tools not available */ });
    } catch { /* best effort */ }

    mark("complete");
    logAction({ ts: Date.now(), type: "action", category: "researcher", message: `research complete: ${keyFindings.length} findings, ${sections.length} sections, ${sources.length} sources, ${images.length} images, ${videos.length} videos, ${books.length} books, ${movies.length} movies, ${contradictions.length} contradictions, ${gapQueries.length} gap queries` });
    logAction({ ts: Date.now(), type: "action", category: "researcher:perf", message: `PERF [${depth}] "${topic.slice(0, 50)}": total=${timings.complete}ms | classify=${(timings.classify_done ?? 0) - (timings.classify_start ?? 0)}ms | search=${(timings.search_done ?? 0) - (timings.search_start ?? 0)}ms | fetch=${(timings.fetch_done ?? 0) - (timings.fetch_start ?? 0)}ms | synthesis=${(timings.synthesis_done ?? 0) - (timings.synthesis_start ?? 0)}ms`, metadata: { timings, depth, topic } });
    return jsonResult(result);
  } catch (err) {
    logError("researcher", "LLM synthesis error", err, { topic, depth });
    return fallbackFromSources(topic, depth, sources, "synthesis failed");
  }
}

function fallbackFromSources(topic: string, depth: string, sources: Source[], reason: string = "synthesis unavailable"): AgentToolResult {
  const sections: ResearchSection[] = [
    {
      title: "Search Results",
      summary: `Web search results for "${topic}"`,
      bullets: sources.slice(0, 10).map((s) => `${s.title}: ${s.snippet}`),
      sourceRefs: sources.slice(0, 10).map((_, i) => i),
    },
  ];
  const reasonLabel = reason === "no Gemini API key" ? "AI synthesis unavailable" : "AI synthesis failed";
  const summary = `Found ${sources.length} sources about "${topic}". ${reasonLabel} — showing raw results.`;

  // Only cache fallback in memory (short-lived) — do NOT persist to disk history.
  // Failed synthesis results are low-quality and should not pollute the research library.
  const cachedFallback: CachedResearch = {
    topic,
    summary,
    narrative: "",
    keyFindings: [],
    sections,
    sources: sources.slice(0, 25),
    images: [],
    videos: [],
    books: [],
    movies: [],
    recommendedVideos: [],
    contradictions: [],
    timestamp: Date.now(),
  };
  return jsonResult({
    tool: "enso_researcher_search",
    topic,
    depth,
    phase: "complete",
    summary,
    narrative: "",
    keyFindings: [],
    sections,
    sources: sources.slice(0, 25),
    images: [],
    videos: [],
    books: [],
    movies: [],
    recommendedVideos: [],
    contradictions: [],
    metadata: {
      queriesRun: 0,
      sourcesFound: sources.length,
      sectionsGenerated: 1,
      timestamp: Date.now(),
      note: reason === "no Gemini API key"
        ? "Raw results — no Gemini API key for synthesis"
        : `Raw results — ${reason}`,
    },
  });
}

async function researcherDeepDive(params: DeepDiveParams): Promise<AgentToolResult> {
  const topic = params.topic?.trim() || "";
  const subtopic = params.subtopic?.trim() || "";
  if (!topic || !subtopic) return errorResult("topic and subtopic are required");

  const cached = researchHistory.load(topicSlug(topic));
  const parentContext = buildParentContext(cached ?? undefined);

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
    url: toProxiedImageUrl(img.thumbnail),
    title: img.title,
    pageUrl: img.url,
  }));

  // Fetch full content from top deep-dive sources
  await enrichSourcesWithContent(sources);

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
    const snippetsForLLM: BraveWebResult[] = sources.slice(0, 20).map((s) => ({
      title: s.title, url: s.url, description: s.snippet,
    }));
    const prompt = buildDeepDivePrompt(topic, subtopic, parentContext, snippetsForLLM, sources);
    const raw = await llm({ prompt, tier: "fast", apiKey: geminiKey });
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
    logError("researcher", "deep dive LLM error", err, { topic, subtopic });
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

  // Fetch full content from top comparison sources
  await enrichSourcesWithContent(sources);

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
    const snippetsForLLM: BraveWebResult[] = sources.slice(0, 25).map((s) => ({
      title: s.title, url: s.url, description: s.snippet,
    }));
    const prompt = buildComparePrompt(topicA, topicB, context, snippetsForLLM, sources);
    const raw = await llm({ prompt, tier: "fast", apiKey: geminiKey });
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
    logError("researcher", "compare LLM error", err, { topicA, topicB, context });
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

  const cached = researchHistory.load(topicSlug(topic));
  const parentContext = buildParentContext(cached ?? undefined);

  const queries = [
    `${question} ${topic}`,
    `${topic} ${question} explained`,
  ];

  const batches = await Promise.all(queries.map((q) => braveWebSearch(q, 5)));
  const sources = deduplicateAndScore(batches);

  // Fetch full content from top follow-up sources
  await enrichSourcesWithContent(sources);

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
    const snippetsForLLM: BraveWebResult[] = sources.slice(0, 15).map((s) => ({
      title: s.title, url: s.url, description: s.snippet,
    }));
    const prompt = buildFollowUpPrompt(topic, question, parentContext, snippetsForLLM, sources);
    const raw = await llm({ prompt, tier: "fast", apiKey: geminiKey });
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
    logError("researcher", "follow-up LLM error", err, { topic, question });
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

  // Pull rich data from cache (much better than agent-passed flat data)
  const cached = researchHistory.load(topicSlug(topic));
  const summary = cached?.summary ?? params.summary ?? "";
  const narrative = cached?.narrative ?? params.narrative ?? "";
  const keyFindings = cached?.keyFindings ?? params.keyFindings ?? [];
  const sections = cached?.sections ?? params.sections ?? [];
  const sources = cached?.sources ?? params.sources ?? [];
  const images = cached?.images ?? params.images ?? [];
  const videos = cached?.videos ?? params.videos ?? [];

  if (!narrative && sections.length === 0 && keyFindings.length === 0) {
    return errorResult(`No research data found for "${topic}". Run enso_researcher_search first.`);
  }

  const html = buildReportHtml(topic, summary, narrative, keyFindings, sections, sources, images, videos);
  const subject = `\u{1F52C} Research Report: ${topic}`;

  // Build plain-text fallback
  const textLines = [`Research Report: ${topic}`, "", summary, ""];
  if (keyFindings.length > 0) {
    textLines.push("KEY FINDINGS:");
    for (const f of keyFindings) textLines.push(`  [${f.type.toUpperCase()}] ${f.text}`);
    textLines.push("");
  }
  if (narrative) {
    textLines.push("ANALYSIS:", "", narrative, "");
  }
  for (const s of sections) {
    textLines.push(`-- ${s.title} --`);
    if (s.summary) textLines.push(s.summary);
    for (const b of s.bullets) textLines.push(`  * ${b}`);
    textLines.push("");
  }
  if (sources.length > 0) {
    textLines.push("SOURCES:");
    for (const s of sources.slice(0, 10)) textLines.push(`  [${s.domain}] ${s.title} - ${s.url}`);
    textLines.push("");
  }
  textLines.push("Generated by Enso Researcher");

  // Primary: send via himalaya CLI (local SMTP)
  try {
    const result = await sendHtmlEmail({
      to: recipient,
      subject,
      html,
      textFallback: textLines.join("\n"),
    });
    if (result.success) {
      return jsonResult({
        tool: "enso_researcher_send_report",
        success: true,
        recipient,
        topic,
        message: result.message,
        sourceCount: sources.length,
        sectionCount: sections.length,
        findingCount: keyFindings.length,
      });
    }
    logError("researcher", `himalaya send failed: ${result.message}`, undefined, { recipient, topic });
  } catch (err) {
    logError("researcher", "himalaya send error", err, { recipient, topic });
  }

  // Fallback: return HTML for manual use
  return jsonResult({
    tool: "enso_researcher_send_report",
    success: false,
    recipient,
    topic,
    message: "Email send failed — HTML report generated below",
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
  const esc = escapeHtml;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Finding type styling
  const findingColors: Record<string, { border: string; bg: string; label: string }> = {
    fact:    { border: "#10b981", bg: "#052e16", label: "#6ee7b7" },
    trend:   { border: "#3b82f6", bg: "#172554", label: "#93c5fd" },
    insight: { border: "#a855f7", bg: "#2e1065", label: "#c4b5fd" },
    warning: { border: "#f59e0b", bg: "#422006", label: "#fcd34d" },
  };

  // Key findings section
  const findingsHtml = keyFindings.length > 0 ? `
    <tr><td style="padding:20px 0 8px;">
      <div style="color:#e2e8f0;font-size:18px;font-weight:700;border-bottom:2px solid #3b3b5c;padding-bottom:8px;">
        \u{1F4A1} Key Findings <span style="color:#64748b;font-size:13px;font-weight:400;">(${keyFindings.length})</span>
      </div>
    </td></tr>
    ${keyFindings.map((f) => {
      const style = findingColors[f.type] ?? findingColors.fact;
      const confDot = f.confidence === "high" ? "\u{1F7E2}" : f.confidence === "low" ? "\u{1F7E0}" : "\u{1F535}";
      return `<tr><td style="padding:4px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:${style.bg};border-radius:8px;border-left:4px solid ${style.border};">
          <tr><td style="padding:12px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td><span style="color:${style.label};font-size:11px;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">${esc(f.type)}</span></td>
              <td style="text-align:right;"><span style="font-size:11px;">${confDot} <span style="color:#64748b;">${esc(f.confidence ?? "medium")}</span></span></td>
            </tr></table>
            <div style="color:#e2e8f0;font-size:14px;margin-top:6px;line-height:1.5;">${esc(f.text)}</div>
          </td></tr>
        </table>
      </td></tr>`;
    }).join("\n")}` : "";

  // Narrative section — split into paragraphs with inline images and video
  let narrativeHtml = "";
  if (narrative && narrative.trim()) {
    const paragraphs = narrative.split(/\n\n+/).filter((p) => p.trim());
    const topImages = images.filter((img) => img.url).slice(0, 3);
    const insertImageAfter = Math.min(2, Math.floor(paragraphs.length / 3));
    const insertVideoAfter = Math.min(4, Math.floor((paragraphs.length * 2) / 3));

    narrativeHtml += `<tr><td style="padding:20px 0 8px;">
      <div style="color:#e2e8f0;font-size:18px;font-weight:700;border-bottom:2px solid #3b3b5c;padding-bottom:8px;">
        \u{1F4DD} Analysis
      </div>
    </td></tr>`;

    for (let i = 0; i < paragraphs.length; i++) {
      narrativeHtml += `<tr><td style="padding:6px 0;">
        <div style="color:#cbd5e1;font-size:14px;line-height:1.7;">${esc(paragraphs[i])}</div>
      </td></tr>`;

      // Insert images after early paragraph
      if (i === insertImageAfter && topImages.length > 0) {
        const imgCells = topImages.map((img) =>
          `<td style="width:${Math.floor(100 / topImages.length)}%;padding:4px;">
            <a href="${esc(img.pageUrl || img.url)}" style="display:block;">
              <img src="${esc(img.url)}" alt="${esc(img.title)}"
                style="width:100%;height:auto;max-height:180px;object-fit:cover;border-radius:8px;display:block;" />
            </a>
            <div style="color:#64748b;font-size:10px;margin-top:3px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(img.title)}</div>
          </td>`
        ).join("");
        narrativeHtml += `<tr><td style="padding:12px 0;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>${imgCells}</tr></table>
        </td></tr>`;
      }

      // Insert featured video mid-narrative
      if (i === insertVideoAfter && videos.length > 0) {
        const v = videos[0];
        narrativeHtml += `<tr><td style="padding:12px 0;">
          <a href="${esc(v.url)}" style="display:block;text-decoration:none;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;border:1px solid #2a2a4a;">
              <tr>
                ${v.thumbnail ? `<td width="140" style="vertical-align:top;">
                  <img src="${esc(v.thumbnail)}" alt="" style="width:140px;height:90px;object-fit:cover;border-radius:8px 0 0 8px;display:block;" />
                </td>` : ""}
                <td style="padding:12px 14px;vertical-align:top;">
                  <div style="color:#f87171;font-size:10px;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">\u25B6 Featured Video</div>
                  <div style="color:#e2e8f0;font-size:13px;font-weight:600;margin-top:4px;">${esc(v.title)}</div>
                  <div style="color:#64748b;font-size:11px;margin-top:3px;">${[v.creator, v.duration].filter((s): s is string => !!s).map(esc).join(" \u00B7 ")}</div>
                </td>
              </tr>
            </table>
          </a>
        </td></tr>`;
      }
    }
  }

  // Sections
  const sectionsHtml = sections.length > 0 ? `
    <tr><td style="padding:20px 0 8px;">
      <div style="color:#e2e8f0;font-size:18px;font-weight:700;border-bottom:2px solid #3b3b5c;padding-bottom:8px;">
        \u{1F4CB} Research Sections <span style="color:#64748b;font-size:13px;font-weight:400;">(${sections.length})</span>
      </div>
    </td></tr>
    ${sections.map((s, idx) => `<tr><td style="padding:6px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;border:1px solid #2a2a4a;">
        <tr><td style="padding:16px;">
          <div style="color:#f1f5f9;font-size:15px;font-weight:600;">
            <span style="color:#6366f1;font-size:13px;margin-right:6px;">${idx + 1}.</span>${esc(s.title)}
          </div>
          ${s.summary ? `<div style="color:#94a3b8;font-size:13px;margin-top:6px;line-height:1.5;">${esc(s.summary)}</div>` : ""}
          ${s.bullets.length > 0 ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">
            ${s.bullets.map((b) => `<tr>
              <td width="16" style="vertical-align:top;padding:3px 0;"><span style="color:#6366f1;font-size:8px;">\u25CF</span></td>
              <td style="color:#cbd5e1;font-size:13px;line-height:1.5;padding:3px 0 3px 6px;">${esc(b)}</td>
            </tr>`).join("")}
          </table>` : ""}
        </td></tr>
      </table>
    </td></tr>`).join("\n")}` : "";

  // Videos section (remaining videos after featured)
  const remainingVideos = videos.slice(narrative ? 1 : 0);
  const videosHtml = remainingVideos.length > 0 ? `
    <tr><td style="padding:20px 0 8px;">
      <div style="color:#e2e8f0;font-size:18px;font-weight:700;border-bottom:2px solid #3b3b5c;padding-bottom:8px;">
        \u{1F3AC} Video Resources <span style="color:#64748b;font-size:13px;font-weight:400;">(${remainingVideos.length})</span>
      </div>
    </td></tr>
    ${remainingVideos.slice(0, 5).map((v) => `<tr><td style="padding:4px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;border:1px solid #2a2a4a;">
        <tr>
          ${v.thumbnail ? `<td width="120" style="vertical-align:top;"><a href="${esc(v.url)}" style="text-decoration:none;"><img src="${esc(v.thumbnail)}" alt="" width="120" style="display:block;border-radius:8px 0 0 8px;height:68px;object-fit:cover;" /></a></td>` : ""}
          <td style="padding:10px 14px;vertical-align:top;">
            <a href="${esc(v.url)}" style="color:#93c5fd;font-size:13px;font-weight:600;text-decoration:none;">${esc(v.title)}</a>
            <div style="color:#64748b;font-size:11px;margin-top:3px;">${[v.creator, v.duration].filter((s): s is string => !!s).map(esc).join(" \u00B7 ")}</div>
          </td>
        </tr>
      </table>
    </td></tr>`).join("\n")}` : "";

  // Sources
  const sourcesHtml = sources.length > 0 ? `
    <tr><td style="padding:20px 0 4px;">
      <div style="color:#64748b;font-size:12px;font-weight:600;margin-bottom:8px;">SOURCES (${sources.length})</div>
      ${sources.slice(0, 15).map((s, i) => `
        <div style="padding:3px 0;font-size:12px;">
          <span style="color:#475569;">[${i + 1}]</span>
          <a href="${esc(s.url)}" style="color:#60a5fa;text-decoration:none;font-size:12px;">${esc(s.title)}</a>
          <span style="color:#374151;"> \u2014 ${esc(s.domain)}</span>
        </div>
      `).join("")}
    </td></tr>` : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
  <!-- Header banner -->
  <tr><td style="background:linear-gradient(135deg,#0c4a6e,#1e3a5f);padding:32px 24px;text-align:center;border-radius:0 0 16px 16px;">
    <div style="font-size:14px;color:#7dd3fc;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Research Report</div>
    <div style="color:#f1f5f9;font-size:26px;font-weight:800;margin-top:8px;line-height:1.2;">${esc(topic)}</div>
    <div style="color:#bae6fd;font-size:13px;margin-top:10px;">${esc(date)} \u00B7 ${sources.length} sources \u00B7 ${sections.length} sections${videos.length > 0 ? ` \u00B7 ${videos.length} videos` : ""}</div>
  </td></tr>

  <!-- Executive summary -->
  ${summary ? `<tr><td style="padding:24px 20px 0;">
    <div style="background:#1a1a2e;border-radius:12px;padding:18px 20px;border-left:4px solid #0ea5e9;">
      <div style="color:#7dd3fc;font-size:11px;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:6px;">Executive Summary</div>
      <div style="color:#e2e8f0;font-size:14px;line-height:1.6;">${esc(summary)}</div>
    </div>
  </td></tr>` : ""}

  <!-- Key findings -->
  <tr><td style="padding:0 20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${findingsHtml}
    </table>
  </td></tr>

  <!-- Narrative with inline media -->
  <tr><td style="padding:0 20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${narrativeHtml}
    </table>
  </td></tr>

  <!-- Research sections -->
  <tr><td style="padding:0 20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${sectionsHtml}
    </table>
  </td></tr>

  <!-- Video resources -->
  <tr><td style="padding:0 20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${videosHtml}
    </table>
  </td></tr>

  <!-- Sources -->
  <tr><td style="padding:0 20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${sourcesHtml}
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 20px;text-align:center;">
    <div style="border-top:1px solid #1e1e3a;padding-top:16px;">
      <div style="color:#4b5563;font-size:11px;">Generated by <span style="color:#0ea5e9;">Enso Researcher</span></div>
    </div>
  </td></tr>
</table>
</body></html>`;
}

// ── Delete history ──

async function researcherDeleteHistory(params: { topic: string }): Promise<AgentToolResult> {
  const topic = params.topic?.trim();
  if (!topic) return errorResult("No topic specified");

  const slug = topicSlug(topic);
  researchHistory.remove(slug);
  logAction({ ts: Date.now(), type: "action", category: "researcher", message: `deleted history for "${topic}" (slug: ${slug})` });

  // Return updated welcome view
  return researcherSearch({ topic: "" } as SearchParams);
}

// ── Clear all history ──

async function researcherClearAllHistory(): Promise<AgentToolResult> {
  const count = researchHistory.count();
  researchHistory.clear();
  logAction({ ts: Date.now(), type: "action", category: "researcher", message: `cleared all research history (${count} entries)` });

  // Return updated welcome view
  return researcherSearch({ topic: "" } as SearchParams);
}

// ── Research Recall (cross-topic knowledge) ──

async function researcherRecall(params: { query: string; maxResults?: number }): Promise<AgentToolResult> {
  const { query, maxResults = 3 } = params;
  if (!query.trim()) {
    return jsonResult({ tool: "enso_researcher_recall", query, matches: [], message: "Empty query" });
  }

  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);

  // Search through all cached research topics
  const entries = researchHistory.list();
  const scored: Array<{ id: string; meta: ResearchHistoryMeta; score: number }> = [];

  for (const entry of entries) {
    let score = 0;
    const topicLower = entry.meta.topic.toLowerCase();
    const previewLower = entry.meta.summaryPreview.toLowerCase();

    // Exact topic match
    if (topicLower.includes(queryLower)) score += 3;
    // Term matching
    for (const term of queryTerms) {
      if (topicLower.includes(term)) score += 1;
      if (previewLower.includes(term)) score += 0.5;
      // Tag matching
      if (entry.meta.tags && typeof entry.meta.tags === "string" && (entry.meta.tags as string).split(",").some((t: string) => t.trim().toLowerCase().includes(term))) score += 0.5;
    }
    if (score > 0) scored.push({ id: entry.id, meta: entry.meta, score });
  }

  // Sort by score, take top N
  scored.sort((a, b) => b.score - a.score);
  const topMatches = scored.slice(0, maxResults);

  // Load full data for top matches
  const matches = topMatches.map((m) => {
    const data = researchHistory.load(m.id);
    return {
      topic: m.meta.topic,
      summary: data?.summary ?? m.meta.summaryPreview,
      keyFindings: (data?.keyFindings ?? []).slice(0, 5).map((f) => f.text),
      sectionTitles: (data?.sections ?? []).map((s) => s.title),
      sourceCount: m.meta.sourceCount,
      timestamp: m.meta.timestamp,
      relevance: Math.round((m.score / Math.max(1, queryTerms.length)) * 100) + "%",
    };
  });

  return jsonResult({
    tool: "enso_researcher_recall",
    query,
    matchCount: matches.length,
    totalTopics: entries.length,
    matches,
  });
}

// ── Tool registration ──

export function createResearcherTools(): EnsoAgentTool[] {
  return [
    {
      name: "enso_researcher_search",
      label: "Research Topic",
      description: "Deep multi-angle web research on any topic — returns structured findings, sections, and sources with AI synthesis. IMPORTANT: If the user writes in a non-English language, you MUST set the 'language' parameter to that language (e.g., 'Chinese', 'Japanese', 'Korean', 'Spanish'). The topic can be in any language but always pass the user's language.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string", description: "Research topic — keep it in the user's original language when possible, or include both the original and English translation" },
          depth: { type: "string", enum: ["quick", "standard", "deep"], description: "Research depth: quick (3 queries), standard (6), deep (8)" },
          force: { type: "boolean", description: "Force fresh research, ignoring cached results" },
          language: { type: "string", description: "REQUIRED when user writes in non-English. The language the user is writing in (e.g., 'Chinese', 'Japanese', 'Korean', 'Spanish', 'French'). Results will be synthesized in this language." },
        },
        required: ["topic"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        researcherSearch(params as SearchParams),
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
    {
      name: "enso_researcher_send_report",
      label: "Email Research Report",
      description: "Email a full research report (findings, narrative, sections, sources, media) to a recipient. Pulls rich data from the research cache — run enso_researcher_search first.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          recipient: { type: "string", description: "Email address to send the report to" },
          topic: { type: "string", description: "Research topic (must have been researched already)" },
        },
        required: ["recipient", "topic"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        researcherSendReport(params as SendReportParams),
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
    {
      name: "enso_researcher_clear_all_history",
      label: "Clear All Research History",
      description: "Remove all topics from the research history library.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      execute: async () => researcherClearAllHistory(),
    } as EnsoAgentTool,
    {
      name: "enso_researcher_recall",
      label: "Research Recall",
      description: "Search across all past research topics to find relevant cached findings. Use this when the user asks about something they've researched before, or wants to synthesize knowledge across topics.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", description: "Search query to find in past research topics" },
          maxResults: { type: "number", description: "Max number of past topics to return (default: 3)" },
        },
        required: ["query"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        researcherRecall(params as { query: string; maxResults?: number }),
    } as EnsoAgentTool,
  ];
}

export function registerResearcherTools(api?: EnsoPluginApi): void {
  for (const tool of createResearcherTools()) {
    if (api) api.registerTool(tool);
  }
}

/**
 * Direct research search for use by the monitor (returns cached research data, not tool result).
 * Returns null if research fails or no API key is available.
 */
export async function researcherSearchDirect(params: { topic: string; depth?: string }): Promise<{ keyFindings: Array<{ text: string; type?: string }> } | null> {
  try {
    const result = await researcherSearch({ topic: params.topic, depth: (params.depth ?? "quick") as "quick" | "standard" | "deep" });
    const text = result.content?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    if (parsed.keyFindings) return { keyFindings: parsed.keyFindings };
    return null;
  } catch {
    return null;
  }
}
