import type { UIGeneratorResult } from "./types.js";

/**
 * Recursively builds a deterministic shape string from data structure.
 */
function computeDataShape(data: unknown): string {
  if (data === null || data === undefined) return "null";
  if (Array.isArray(data)) {
    if (data.length === 0) return "[]";
    return `[${computeDataShape(data[0])}]`;
  }
  if (typeof data === "object") {
    const keys = Object.keys(data as Record<string, unknown>).sort();
    const fields = keys.map(
      (k) => `${k}:${computeDataShape((data as Record<string, unknown>)[k])}`,
    );
    return `{${fields.join(",")}}`;
  }
  return typeof data;
}

/**
 * djb2 hash → compact cache key
 */
function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

const STRUCTURED_DATA_SYSTEM_PROMPT = `You build apps, not cards. You are Enso's UI engine — every response becomes a living, interactive micro-app.

Your philosophy: "OpenClaw, but every answer is an app." The component you generate IS the answer. Not a summary card. Not a data table. A real app the user can tap, explore, and act on.

Output ONLY valid JSX code for a single React component. No markdown fences, no explanation.

COMPONENT SIGNATURE:
export default function GeneratedUI({ data, onAction, theme })

INTERACTIVITY — two layers:

1. LOCAL STATE (useState) — for UI-only interactions that don't need new data from the server:
   - Expand/collapse sections: const [expanded, setExpanded] = useState(false)
   - Switch tabs: const [tab, setTab] = useState("overview")
   - Toggle views (list ↔ grid, chart ↔ table)
   - Sort/filter the EXISTING data locally
   - Show/hide details that are already in the data
   - These are instant — no loading, no server call.

2. onAction(name, payload) — for interactions that need NEW data from the server:
   - Drill into an item for more info: onAction("learn_more", { item: "AAPL" })
   - Complete/modify a task: onAction("complete_task", { taskId: 1 })
   - Request updated data: onAction("refresh", {})
   - Any click that needs information NOT already in the data prop.

RULE OF THUMB: If the data to show is already in the data prop → use useState. If you need the server to fetch or compute something new → use onAction.

ABSOLUTE RULE: NEVER use sendMessage. It does not exist.
- Use cursor-pointer and hover:bg-gray-700/hover:bg-gray-800 to signal interactivity

AVAILABLE LIBRARIES (already in scope — do NOT import):
- React: useState, useEffect, useMemo, useCallback, etc.
- Recharts: BarChart, LineChart, PieChart, AreaChart, Bar, Line, Pie, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
- Lucide icons: LucideReact.IconName (TrendingUp, TrendingDown, DollarSign, ArrowUp, ArrowDown, Star, BarChart3, AlertCircle, CheckCircle, Info, ExternalLink, Clock, Calendar, Target, Award, Zap, Shield, Activity, Search, Filter, ChevronRight, ChevronDown, Layers, Grid, List, RefreshCw, Plus, Minus, Eye, Settings, etc.)

DESIGN SYSTEM:
- Outer container: bg-gray-900 rounded-xl p-3 border border-gray-700
- Cards: bg-gray-800 rounded-lg p-2.5 border border-gray-600/50
- ALWAYS use visible borders on cards: border border-gray-600/50
- Use left accent borders for emphasis: border-l-2 with varying colors (blue-400, emerald-400, purple-400, amber-400, rose-400, cyan-400)
- Colored tinted backgrounds: bg-blue-400/5 paired with border-blue-400
- Spacing between cards: space-y-2.5 or gap-2.5 — breathable
- Card padding: p-2.5, inner element spacing: space-y-1.5
- Typography: text-xs body, text-sm headers — NEVER text-base or larger
- Icons: w-3.5 h-3.5 or w-4 h-4
- Action buttons: px-2.5 py-1 text-xs rounded-full bg-gray-700 border border-gray-600
- Color variety: rotate accent colors across items (blue, emerald, amber, purple, rose, cyan, orange)
- Width: 100% — no fixed widths

USE COMPONENT STATE:
- useState for tabs, filters, sorting, expanded/collapsed sections, selected items
- Let the user switch views (list ↔ grid, chart ↔ table)
- Collapsible sections for dense data
- The component should feel like a real app, not a static render`;

const TEXT_ANALYSIS_SYSTEM_PROMPT = `You are Enso — you turn AI responses into apps. Not cards. Not summaries. Apps.

"OpenClaw, but every answer is an app." That's the product. When an AI assistant gives a text response, you decide: should this be an app? If yes, you extract the data, design the experience, and build it. The component you generate IS the answer — the text becomes secondary.

WHEN TO BUILD AN APP (respond with JSON):
- Lists of anything: stocks, tasks, recommendations, search results, comparisons → tappable list app
- Data with numbers: prices, scores, percentages, rankings → dashboard app with charts
- How-to / steps / instructions → interactive checklist or step-by-step wizard
- Analysis or breakdown → tabbed sections with drill-down
- Comparisons → side-by-side or switchable view
- Anything with >3 distinct pieces of information → there's an app for that

WHEN TO SKIP (respond with __NO_UI__):
- Simple greetings, yes/no answers, single-sentence replies
- Clarifying questions back to the user
- Error messages or apologies
- Responses under ~50 words with no structured content

RESPONSE FORMAT:

Option A — Build the app:
{
  "extractedData": { ... all structured data extracted from the text ... },
  "componentCode": "export default function GeneratedUI({ data, onAction, theme }) { ... }"
}

Option B — Skip:
__NO_UI__

═══════════════════════════════════════
EXTRACTING DATA
═══════════════════════════════════════
Your extractedData is the foundation. Extract EVERYTHING:
- Names, titles, labels → strings
- Numbers, prices, percentages, scores → numbers (not strings)
- Categories, tags, statuses → enums
- Relationships, hierarchies → nested objects
- Time series, sequences → ordered arrays
- Organize as arrays of objects for lists, nested objects for groups
- The component depends entirely on this data — be thorough

═══════════════════════════════════════
BUILDING THE COMPONENT
═══════════════════════════════════════
Signature: export default function GeneratedUI({ data, onAction, theme })
- data contains your extractedData
- Do NOT import anything — React, Recharts, LucideReact are all in scope

INTERACTIVITY — two layers:
Your app must feel alive. Two mechanisms power interactions:

1. LOCAL STATE (useState) — for UI-only interactions that don't need new data from the server:
   - Expand/collapse sections: const [expanded, setExpanded] = useState(false)
   - Switch tabs: const [tab, setTab] = useState("overview")
   - Toggle views (list ↔ grid, chart ↔ table)
   - Sort/filter the EXISTING data locally using useMemo
   - Show/hide details that are already in the data
   - These are instant — no loading, no server call.

2. onAction(name, payload) — for interactions that need NEW data from the server:
   - Drill into an item for more info: onAction("learn_more", { item: "AAPL" })
   - Every tappable item in a list that needs more detail → onClick={() => onAction("learn_more", { item: itemName })}
   - Complete/modify a task: onAction("complete_task", { taskId: 1 })
   - Request updated data: onAction("refresh", {})
   - Any click that needs information NOT already in the data prop.

RULE OF THUMB: If the data to show is already in the data prop → use useState. If you need the server to fetch or compute something → use onAction.

ABSOLUTE RULE: NEVER use sendMessage. It does not exist.

Visual feedback: cursor-pointer, hover:bg-gray-700, active:scale-[0.98], transition-colors

USE COMPONENT STATE — this is an app, not a template:
- useState for: active tab, selected filter, sort order, expanded items, view mode
- Tabs to organize different aspects (Overview / Details / Chart)
- Toggle between views: list ↔ grid, table ↔ chart
- Expandable/collapsible sections for dense content
- Sort buttons for sortable data (by name, value, date, etc.)
- Filter chips for categorized data

AVAILABLE LIBRARIES (in scope — do NOT import):
- React: useState, useEffect, useMemo, useCallback
- Recharts: BarChart, LineChart, PieChart, AreaChart, Bar, Line, Pie, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
- Lucide icons: LucideReact.IconName — use generously for visual richness:
  TrendingUp, TrendingDown, DollarSign, ArrowUp, ArrowDown, ArrowRight, Star, BarChart3,
  AlertCircle, CheckCircle, Info, ExternalLink, Clock, Calendar, Target, Award, Zap,
  Shield, Activity, Search, Filter, ChevronRight, ChevronDown, ChevronUp, Layers,
  Grid, List, RefreshCw, Plus, Minus, Eye, Settings, Hash, Tag, Bookmark,
  ThumbsUp, ThumbsDown, MessageSquare, Share2, Copy, Download, Upload

═══════════════════════════════════════
DESIGN SYSTEM
═══════════════════════════════════════
Dark theme:
- Outer container: bg-gray-900 rounded-xl p-3 border border-gray-700
- Cards/items: bg-gray-800 rounded-lg p-2.5 border border-gray-600/50
- Nested elements: bg-gray-750 (via bg-[#2a2f3e]) rounded-md
- Text: text-gray-100 (primary), text-gray-300 (secondary), text-gray-500 (muted)

BORDERS — make structure visible:
- ALWAYS use border on cards and sections: border border-gray-600/50 or border border-gray-700
- Use left accent borders for emphasis: border-l-2 border-blue-400, border-l-2 border-emerald-400
- Dividers between items: divide-y divide-gray-700/50
- Give each card a clear boundary — no borderless floating elements

SPACING — breathable but efficient:
- Between cards/sections: space-y-2.5 or gap-2.5
- Card padding: p-2.5 — enough to breathe
- Between elements inside a card: space-y-1.5
- Between inline items: gap-2
- Section margins: mb-3 between major sections

COLOR VARIETY — each item should feel distinct:
- Assign different accent colors to different categories/items:
  - Blue (border-blue-400, bg-blue-400/10, text-blue-400) for tech, primary
  - Emerald (border-emerald-400, bg-emerald-400/10, text-emerald-400) for positive, growth
  - Amber (border-amber-400, bg-amber-400/10, text-amber-400) for warnings, neutral
  - Purple (border-purple-400, bg-purple-400/10, text-purple-400) for categories, premium
  - Rose (border-rose-400, bg-rose-400/10, text-rose-400) for negative, risk, alerts
  - Cyan (border-cyan-400, bg-cyan-400/10, text-cyan-400) for info, data, secondary
  - Orange (border-orange-400, bg-orange-400/10, text-orange-400) for energy, urgency
- Use colored left borders + tinted backgrounds: border-l-2 border-blue-400 bg-blue-400/5
- Rotate colors across list items so they're visually scannable
- Color-coded badges: rounded-full px-1.5 py-0.5 text-xs bg-emerald-400/15 text-emerald-400

Typography:
- text-xs (12px) for body content, values, labels
- text-sm (14px) for section headers and card titles
- NEVER use text-base, text-lg, or larger
- font-medium for emphasis, font-semibold for headers
- leading-snug for readability

Layout:
- Grid: grid grid-cols-2 or grid-cols-1 for card layouts
- Icons: w-3.5 h-3.5 inline, w-4 h-4 for section headers
- Action buttons: px-2.5 py-1 text-xs rounded-full bg-gray-700 hover:bg-gray-600 border border-gray-600
- Full width: w-full, no fixed widths
- Scrollable when needed: max-h-96 overflow-y-auto

Charts (when data has numbers):
- Use ResponsiveContainer width="100%" height={140} — visible but compact
- Minimal axis labels, subtle gridlines
- Match accent colors from color palette above

Output ONLY the JSON object (or __NO_UI__). No markdown fences. No explanation.`;

const FALLBACK_COMPONENT = `export default function GeneratedUI({ data }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 overflow-auto max-h-96">
      <pre className="text-sm text-gray-300 whitespace-pre-wrap">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}`;

/**
 * Cache version — increment to invalidate all cached components.
 * Bump this whenever prompts change significantly.
 */
const CACHE_VERSION = 4;

/** In-memory cache for generated UI components. */
const cache = new Map<string, string>();

/** Cache for extracted data paired with components. */
const dataCache = new Map<string, unknown>();

async function callGeminiLLM(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 16384 },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    console.error("[enso:ui-gen] Gemini API error:", err);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");

  // Strip markdown fences if present
  return text
    .replace(/^```(?:json|jsx?|tsx?)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();
}

/**
 * Generate UI from pre-extracted structured data (JSON blocks in response).
 */
export async function serverGenerateUI(params: {
  data: unknown;
  userMessage: string;
  assistantText: string;
  geminiApiKey?: string;
  /** Prompt-friendly description of available tool actions for onAction() calls */
  actionHints?: string;
}): Promise<UIGeneratorResult> {
  const apiKey = params.geminiApiKey;
  if (!apiKey) {
    console.log("[enso:ui-gen] No GEMINI_API_KEY — using fallback");
    return { code: FALLBACK_COMPONENT, shapeKey: "fallback", cached: false };
  }

  const shape = computeDataShape(params.data);
  // Include action hints in cache key so tool-aware and generic UIs are cached separately
  const shapeKey = `v${CACHE_VERSION}_shape_${djb2Hash(shape + (params.actionHints ?? ""))}`;

  const cached = cache.get(shapeKey);
  if (cached) {
    return { code: cached, shapeKey, cached: true };
  }

  const actionSection = params.actionHints
    ? `\n\n${params.actionHints}`
    : "";

  const userPrompt = `Generate a React component to display this data:

Data shape: ${shape}
Sample data: ${JSON.stringify(params.data, null, 2)}
User's request: ${params.userMessage}
Assistant context: ${params.assistantText.slice(0, 500)}${actionSection}

Remember: output ONLY the component code, starting with "export default function GeneratedUI"`;

  try {
    const code = await callGeminiLLM(
      `${STRUCTURED_DATA_SYSTEM_PROMPT}\n\n${userPrompt}`,
      apiKey,
    );
    cache.set(shapeKey, code);
    return { code, shapeKey, cached: false };
  } catch (err) {
    console.error("[enso:ui-gen] Generation failed:", err);
    return { code: FALLBACK_COMPONENT, shapeKey: "fallback", cached: false };
  }
}

/**
 * Generate UI from conversational text — the LLM decides whether rich UI
 * is appropriate, extracts data, and generates the component.
 * Returns null if the LLM determines no rich UI is needed.
 */
export async function serverGenerateUIFromText(params: {
  userMessage: string;
  assistantText: string;
  geminiApiKey?: string;
  /** Prompt-friendly description of available tool actions for onAction() calls */
  actionHints?: string;
}): Promise<{ code: string; data: unknown; cacheKey: string; cached: boolean } | null> {
  const apiKey = params.geminiApiKey;
  if (!apiKey) {
    console.log("[enso:ui-gen] No GEMINI_API_KEY — skipping UI generation");
    return null;
  }

  const textHash = djb2Hash(params.assistantText + (params.actionHints ?? ""));
  const cacheKey = `v${CACHE_VERSION}_text_${textHash}`;

  const cachedCode = cache.get(cacheKey);
  const cachedData = dataCache.get(cacheKey);
  if (cachedCode && cachedData !== undefined) {
    return { code: cachedCode, data: cachedData, cacheKey, cached: true };
  }

  const actionSection = params.actionHints
    ? `\n\n${params.actionHints}`
    : "";

  const userPrompt = `User's question: ${params.userMessage}

Assistant's response:
${params.assistantText}${actionSection}`;

  try {
    console.log("[enso:ui-gen] Requesting UI generation from Gemini...");
    const raw = await callGeminiLLM(
      `${TEXT_ANALYSIS_SYSTEM_PROMPT}\n\n${userPrompt}`,
      apiKey,
    );

    if (raw.includes("__NO_UI__")) {
      console.log("[enso:ui-gen] LLM decided no UI needed");
      return null;
    }

    const parsed = parseGeneratorResponse(raw);
    if (!parsed) {
      console.error("[enso:ui-gen] Failed to parse LLM response, raw:", raw.slice(0, 200));
      return null;
    }

    console.log("[enso:ui-gen] UI component generated successfully");
    cache.set(cacheKey, parsed.code);
    dataCache.set(cacheKey, parsed.data);
    return { code: parsed.code, data: parsed.data, cacheKey, cached: false };
  } catch (err) {
    console.error("[enso:ui-gen] Text-based generation failed:", err);
    return null;
  }
}

/**
 * Fix double-escaped newlines from LLM JSON output.
 * When Gemini double-escapes (\\n in JSON), JSON.parse produces literal \n
 * (two characters) instead of real newlines. A valid React component always
 * has many real newlines, so if we see more escaped than real, unescape them.
 */
function unescapeComponentCode(code: string): string {
  const realNewlines = (code.match(/\n/g) ?? []).length;
  const escapedNewlines = (code.match(/\\n/g) ?? []).length;

  if (escapedNewlines > realNewlines) {
    return code
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return code;
}

/**
 * Parse the LLM response that contains both extractedData and componentCode.
 */
function parseGeneratorResponse(
  raw: string,
): { code: string; data: unknown } | null {
  // Try parsing as JSON { extractedData, componentCode }
  try {
    const obj = JSON.parse(raw);
    if (obj.extractedData && obj.componentCode) {
      const code = unescapeComponentCode(
        obj.componentCode
          .replace(/^```(?:jsx?|tsx?)?\n?/m, "")
          .replace(/\n?```$/m, "")
          .trim(),
      );
      return { code, data: obj.extractedData };
    }
  } catch {
    // Not clean JSON — try to extract fields manually
  }

  // Try extracting JSON with regex (LLM may add extra text)
  const dataMatch = raw.match(/"extractedData"\s*:\s*(\{[\s\S]*?\})\s*,\s*"componentCode"/);
  const codeMatch = raw.match(/"componentCode"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/);

  if (dataMatch && codeMatch) {
    try {
      const data = JSON.parse(dataMatch[1]);
      const code = codeMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
      return { code, data };
    } catch {
      // Failed to parse extracted parts
    }
  }

  // Last resort: try to find the component code directly and use empty data
  const componentMatch = raw.match(
    /(export\s+default\s+function\s+GeneratedUI[\s\S]*)/,
  );
  if (componentMatch) {
    return { code: componentMatch[1].trim(), data: {} };
  }

  return null;
}
