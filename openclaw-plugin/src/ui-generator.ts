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

export const STRUCTURED_DATA_SYSTEM_PROMPT = `You build apps, not cards. You are Enso's UI engine — every response becomes a living, interactive micro-app.

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
- React: useState, useEffect, useMemo, useCallback, useRef, Fragment
- Recharts: BarChart, LineChart, PieChart, AreaChart, RadarChart, ComposedChart, Bar, Line, Pie, Area, Radar, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PolarGrid, PolarAngleAxis, PolarRadiusAxis, RadialBarChart, RadialBar, Treemap, Funnel, FunnelChart
- Lucide icons: Use LucideReact.IconName DIRECTLY in JSX (TrendingUp, TrendingDown, DollarSign, ArrowUp, ArrowDown, Star, BarChart3, AlertCircle, CheckCircle, Info, ExternalLink, Clock, Calendar, Target, Award, Zap, Shield, Activity, Search, Filter, ChevronRight, ChevronDown, Layers, Grid, List, RefreshCw, Plus, Minus, Eye, Settings, Disc, Music, etc.)

ICON USAGE RULES:
- ALWAYS use LucideReact.IconName directly in JSX: <LucideReact.Star className="w-4 h-4" />
- NEVER create intermediate icon alias objects like "const Icons = { Album: LucideReact.Disc }". This creates bugs where you forget the alias and use the wrong name.
- If you need to pick an icon dynamically, use a function: const getIcon = (type) => type === 'album' ? LucideReact.Disc : LucideReact.Music;

ENSO UI COMPONENTS (pre-built, styled — ALWAYS use instead of coding from scratch):
All below are in scope. Do NOT import them. Dark-themed and consistent.

Layout:
- <UICard accent="blue|emerald|amber|purple|rose|cyan|orange" header={<>Title</>}>content</UICard> — styled card. Use INSTEAD of raw <div className="bg-gray-800...">.
- <Stat label="Revenue" value="$1.2M" change={12.5} trend="up" accent="emerald" icon={<LucideReact.DollarSign className="w-4 h-4" />} /> — KPI metric tile.
- <Separator /> — divider.  <EmptyState title="No data" action={{label: "Reset", onClick: fn}} />

Navigation:
- <Tabs tabs={[{value: "overview", label: "Overview"}, ...]} defaultValue="overview" variant="pills|underline|boxed">{(activeTab) => activeTab === "overview" ? <A /> : <B />}</Tabs>
  THE #1 component. Use for ANY multi-view app. Children = render function {(tab) => ...}.
- <Select options={[{value: "asc", label: "Ascending"}]} value={v} onChange={setV} placeholder="Sort by..." />
- <Accordion items={[{value: "s1", title: "Section 1", content: <p>...</p>}]} type="single|multiple" defaultOpen="s1" />

Controls:
- <Button onClick={fn} variant="default|primary|ghost|danger|outline" size="sm|md|lg" icon={<LucideReact.RefreshCw className="w-3.5 h-3.5" />} loading={isLoading}>Label</Button>
- <Badge variant="default|success|warning|danger|info|outline" dot>Active</Badge>
- <Switch checked={v} onChange={setV} label="Show advanced" />
- <Input value={v} onChange={setV} placeholder="Search..." icon={<LucideReact.Search className="w-3.5 h-3.5" />} />
- <Slider value={v} onChange={setV} min={0} max={100} step={5} label="Threshold" showValue />
- <Progress value={75} variant="default|success|warning|danger" showLabel label="Completion" />

Data Display:
- <DataTable columns={[{key: "name", label: "Name", sortable: true}, {key: "score", label: "Score", sortable: true, render: (v) => <Badge variant="info">{v}</Badge>}]} data={items} pageSize={10} striped onRowClick={(row) => onAction("select", row)} />
  Sortable, paginated table. Use INSTEAD of manual <table> with sort logic.

Overlays:
- <Dialog open={show} onClose={() => setShow(false)} title="Confirm" footer={<><Button variant="ghost" onClick={() => setShow(false)}>Cancel</Button><Button variant="primary" onClick={fn}>OK</Button></>}>Content</Dialog>
- <EnsoUI.Tooltip content="Help text"><span>Hover me</span></EnsoUI.Tooltip>  (NOT destructured — use EnsoUI.Tooltip to avoid Recharts Tooltip collision)

MANDATORY: PREFER EnsoUI over hand-coded equivalents:
- Tabs > manual tab buttons + useState
- DataTable > manual <table> with sort logic
- Badge > hand-coded colored pills
- Button > raw <button> with Tailwind
- Stat > custom KPI divs
- UICard > plain <div className="bg-gray-800 rounded-lg border...">
- Accordion > manual expand/collapse
- Progress > custom progress bars

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
- The component should feel like a real app, not a static render

WORLD-CLASS UX BAR (Linear + Notion + Vercel style):
- High hierarchy, low noise: one strong primary area, secondary metadata de-emphasized
- Progressive disclosure: summary first, details behind toggles/sections/tabs
- Contextual actions: each action sits next to the data it affects
- Every state is designed: loading, empty, error, success
- No dead zones: if it looks clickable, make the full area clickable
- Strong affordance: hover/active/focus-visible states on all interactive elements

INTERACTION POLISH:
- Buttons/chips: transition-all duration-150 active:scale-[0.98]
- Hover states increase contrast, not decrease
- Prefer compact information density with clear grouping and whitespace rhythm
- Use font-variant-numeric: tabular-nums for metrics
- Every interactive control needs explicit verb-first labels (e.g. "View Details", "Refresh Data", "Open Activity Log")
- Add short helper microcopy near action clusters that explains what click does (e.g. "Selecting an item opens a detailed follow-up card")
- Do not make entire large cards clickable unless clearly styled as a single CTA

ACCESSIBILITY:
- Include aria-label for icon-only buttons
- Use semantic headings and role-safe controls
- Never rely on color alone for status; include text labels/badges`;

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
- React: useState, useEffect, useMemo, useCallback, useRef, Fragment
- Recharts: BarChart, LineChart, PieChart, AreaChart, RadarChart, ComposedChart, Bar, Line, Pie, Area, Radar, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PolarGrid, PolarAngleAxis, PolarRadiusAxis, RadialBarChart, RadialBar, Treemap, Funnel, FunnelChart
- Lucide icons: LucideReact.IconName — use generously for visual richness:
  TrendingUp, TrendingDown, DollarSign, ArrowUp, ArrowDown, ArrowRight, Star, BarChart3,
  AlertCircle, CheckCircle, Info, ExternalLink, Clock, Calendar, Target, Award, Zap,
  Shield, Activity, Search, Filter, ChevronRight, ChevronDown, ChevronUp, Layers,
  Grid, List, RefreshCw, Plus, Minus, Eye, Settings, Hash, Tag, Bookmark,
  ThumbsUp, ThumbsDown, MessageSquare, Share2, Copy, Download, Upload

ENSO UI COMPONENTS (pre-built, styled — ALWAYS use instead of hand-coding):
All in scope. Do NOT import them.
- UICard (accent, header, footer), Stat (label, value, change, trend, accent), Separator, EmptyState
- Tabs (tabs=[{value, label}], defaultValue, variant="pills|underline|boxed", children as render function)
- Select (options, value, onChange, placeholder), Accordion (items, type, defaultOpen)
- Button (variant="default|primary|ghost|danger|outline", icon, loading), Badge (variant="success|warning|danger|info")
- Switch (checked, onChange, label), Input (value, onChange, icon), Slider (min, max, showValue), Progress (value, variant, showLabel)
- DataTable (columns=[{key, label, sortable, render}], data, pageSize, striped, onRowClick) — sortable, paginated!
- Dialog (open, onClose, title, footer), EnsoUI.Tooltip (content, side — use as EnsoUI.Tooltip, not Tooltip)
MANDATORY: Use Tabs for multi-view, DataTable for tables, Badge for status, Button for actions, Stat for KPIs.

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

WORLD-CLASS UX BAR (Linear + Notion + Vercel style):
- Strong hierarchy, low clutter, and clear visual alignment
- Progressive disclosure first: summary row + drill-in sections/tabs
- Contextual actions near the item they affect; avoid detached global controls
- Design all states: loading, empty, sparse, dense, and error
- Primary interactions must have clear affordance with hover/focus/active states

MICRO-INTERACTIONS:
- Use transition-all duration-150 for controls
- Use active:scale-[0.98] for press feedback
- Interactive controls always use cursor-pointer
- Keep hit targets generous (at least button-like sizing with px/py padding)
- Action labels must describe the outcome clearly (avoid vague labels like "Go", "Open", "Run")
- Add one line of contextual "what happens next" microcopy for dense action groups
- Avoid hidden click zones; clickable areas must look obviously interactive

ACCESSIBILITY & LEGIBILITY:
- Use text labels in addition to color for statuses
- Use tabular numbers for metrics (font-variant-numeric: tabular-nums)
- Keep section headings clear and scannable
- Add aria-label on icon-only buttons

Output ONLY the JSON object (or __NO_UI__). No markdown fences. No explanation.`;

const FALLBACK_COMPONENT = `export default function GeneratedUI({ data }) {
  return (
    <div className="bg-gray-900 border border-gray-700/80 rounded-xl p-4 overflow-auto max-h-96 shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
      <div className="text-xs text-gray-400 mb-2">Structured data view</div>
      <pre className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-950/60 rounded-lg p-3 border border-gray-800">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}`;

function buildDomainUxGuidance(input: { userMessage: string; assistantText: string }): string {
  const text = `${input.userMessage}\n${input.assistantText}`.toLowerCase();

  const dashboardSignals = [
    "dashboard",
    "kpi",
    "metric",
    "revenue",
    "forecast",
    "trend",
    "quarter",
    "monthly",
    "analytics",
    "scorecard",
    "performance",
  ];
  const taskSignals = [
    "task",
    "kanban",
    "board",
    "backlog",
    "sprint",
    "todo",
    "to do",
    "in progress",
    "done",
    "assignee",
    "priority",
    "ticket",
  ];
  const inspectorSignals = [
    "tool",
    "execution",
    "logs",
    "output",
    "trace",
    "terminal",
    "error",
    "warning",
    "diff",
    "command",
    "result",
    "action history",
  ];

  const hasSignal = (signals: string[]) => signals.some((s) => text.includes(s));
  const sections: string[] = [];

  if (hasSignal(dashboardSignals)) {
    sections.push(`DOMAIN UX: Executive Dashboard
- Top band: 3-6 KPI tiles with clear delta badges (up/down/flat + text label).
- Provide fast time-window controls (7d/30d/QTD/YTD) as chips.
- Main body should include at least two perspectives: trend view + breakdown view.
- Use strong comparative context (vs prior period, target, benchmark) on key metrics.
- Keep dense numeric information readable with tabular-nums and compact labels.
- Include action points section (risks, wins, next actions) for decision support.
- Progressive disclosure: details behind expandable rows/panels, not all at once.`);
  }

  if (hasSignal(taskSignals)) {
    sections.push(`DOMAIN UX: Task / Kanban Workflow
- Prefer board-style grouping by status columns with visible counts per column.
- Each task card should show priority, assignee, and short metadata chips.
- Primary actions should be obvious and contextual (complete, move, assign, reprioritize).
- Use local state for view/filter/sort and onAction for server mutations.
- Support quick filtering by assignee, priority, and status using compact chips.
- Keep interactions lightweight: hover affordance, press feedback, no modal dependency unless necessary.
- Provide empty-column and empty-board states with clear suggested next step.`);
  }

  if (hasSignal(inspectorSignals)) {
    sections.push(`DOMAIN UX: Tool-Result Inspector
- Use a split information hierarchy: summary bar, key findings, then detailed logs/results.
- Surface status first (success/warning/error) with both color and explicit text.
- Present chronology or step timeline for multi-step tool runs.
- Include structured sections for: Inputs, Actions Taken, Outputs, Errors, and Follow-up Actions.
- Make dense outputs scannable with collapsible blocks and monospace regions where useful.
- Add focused controls for refresh/retry/copy/open-details actions near relevant blocks.
- If there are errors, include a "What to do next" remediation section.`);
  }

  if (sections.length === 0) {
    return "";
  }

  return `\n\n${sections.join("\n\n")}`;
}

/**
 * Cache version — increment to invalidate all cached components.
 * Bump this whenever prompts change significantly.
 */
const CACHE_VERSION = 5;

/** In-memory cache for generated UI components. */
const cache = new Map<string, string>();

/** Cache for extracted data paired with components. */
const dataCache = new Map<string, unknown>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes("timeout")) return true;
  if (err.message.includes("Gemini API error: 429")) return true;
  if (err.message.includes("Gemini API error: 500")) return true;
  if (err.message.includes("Gemini API error: 502")) return true;
  if (err.message.includes("Gemini API error: 503")) return true;
  if (err.message.includes("Gemini API error: 504")) return true;
  return false;
}

/** Default fast model for UI generation and tool selection. */
const GEMINI_MODEL_FAST = "gemini-2.5-flash";

/** Powerful model for code generation (app spec, executors, templates). */
export const GEMINI_MODEL_PRO = "gemini-3-pro-preview";

async function callGeminiLLM(prompt: string, apiKey: string, timeoutMs = 30000, model = GEMINI_MODEL_FAST): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 16384 },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const err = await response.text();
      console.error(`[enso:ui-gen] Gemini API error (${model}):`, err);
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
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`Gemini API timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callGeminiLLMWithRetry(prompt: string, apiKey: string, model?: string): Promise<string> {
  const maxAttempts = 3;
  // Pro models need longer timeouts for large code-generation prompts
  const timeoutMs = model === GEMINI_MODEL_PRO ? 90_000 : 30_000;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await callGeminiLLM(prompt, apiKey, timeoutMs, model);
    } catch (err) {
      lastError = err;
      if (!isRetryableGeminiError(err) || attempt === maxAttempts) {
        throw err;
      }
      const delayMs = 500 * 2 ** (attempt - 1);
      console.warn(`[enso:ui-gen] retrying Gemini call (${attempt}/${maxAttempts}) in ${delayMs}ms — model=${model ?? GEMINI_MODEL_FAST}`);
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini call failed");
}

/**
 * Call Gemini with image + text (multimodal). Used for AI photo description/tagging.
 * Reads the image file, encodes as base64, sends as inlineData alongside the text prompt.
 * Retries on transient errors (429, 5xx) up to 3 times.
 */
export async function callGeminiVision(params: {
  imagePath: string;
  prompt: string;
  apiKey: string;
  model?: string;
  maxOutputTokens?: number;
}): Promise<string> {
  const { readFileSync } = await import("fs");
  const { extname } = await import("path");

  const ext = extname(params.imagePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".gif": "image/gif",
    ".webp": "image/webp", ".bmp": "image/bmp",
  };
  const mimeType = mimeMap[ext] ?? "image/jpeg";

  // Read image — limit to 10 MB
  const imageBuffer = readFileSync(params.imagePath);
  if (imageBuffer.length > 10 * 1024 * 1024) {
    throw new Error("Image too large for vision API (max 10 MB)");
  }
  const imageBase64 = imageBuffer.toString("base64");
  const model = params.model ?? GEMINI_MODEL_FAST;
  const maxAttempts = 3;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${params.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType, data: imageBase64 } },
                { text: params.prompt },
              ],
            }],
            generationConfig: {
              maxOutputTokens: params.maxOutputTokens ?? 1024,
              temperature: 0.2,
            },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        const err = new Error(`Gemini API error: ${response.status} ${errText.slice(0, 200)}`);
        if (isRetryableGeminiError(err) && attempt < maxAttempts) {
          lastError = err;
          const delayMs = 500 * 2 ** (attempt - 1);
          console.warn(`[enso:vision] retrying (${attempt}/${maxAttempts}) in ${delayMs}ms`);
          await sleep(delayMs);
          continue;
        }
        throw err;
      }

      const result = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Empty Gemini Vision response");

      return text
        .replace(/^```(?:json|jsx?|tsx?)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();
    } catch (err) {
      lastError = err;
      if ((err as Error).name === "AbortError") {
        lastError = new Error("Gemini Vision timeout after 30s");
      }
      if (!isRetryableGeminiError(lastError) || attempt === maxAttempts) {
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }
      const delayMs = 500 * 2 ** (attempt - 1);
      console.warn(`[enso:vision] retrying (${attempt}/${maxAttempts}) in ${delayMs}ms`);
      await sleep(delayMs);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini Vision call failed");
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
  const domainSection = buildDomainUxGuidance({
    userMessage: params.userMessage,
    assistantText: params.assistantText,
  });

  const userPrompt = `Generate a React component to display this data:

Data shape: ${shape}
Sample data: ${JSON.stringify(params.data, null, 2)}
User's request: ${params.userMessage}
Assistant context: ${params.assistantText.slice(0, 500)}${actionSection}${domainSection}

Remember: output ONLY the component code, starting with "export default function GeneratedUI"`;

  try {
    const code = await callGeminiLLMWithRetry(
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
  const domainSection = buildDomainUxGuidance({
    userMessage: params.userMessage,
    assistantText: params.assistantText,
  });

  const userPrompt = `User's question: ${params.userMessage}

Assistant's response:
${params.assistantText}${actionSection}${domainSection}`;

  try {
    console.log("[enso:ui-gen] Requesting UI generation from Gemini...");
    const raw = await callGeminiLLMWithRetry(
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

export async function serverGenerateConstrainedFollowupUI(params: {
  data: unknown;
  userMessage: string;
  assistantText: string;
  geminiApiKey?: string;
  action: string;
  signatureId: string;
  toolFamily: string;
  actionHints?: string;
}): Promise<UIGeneratorResult> {
  const constrainedPrompt = `Follow-up regeneration for tool mode.
Tool family: ${params.toolFamily}
Signature: ${params.signatureId}
Triggered action: ${params.action}

Maintain interaction continuity with the existing card:
- Keep action names stable and verb-first.
- Keep layout compact and deterministic for repeated follow-ups.
- Preserve the same information hierarchy when possible.
- Avoid introducing unrelated sections.
`;

  return serverGenerateUI({
    data: params.data,
    userMessage: `${params.userMessage} [Signature follow-up: ${params.signatureId}]`,
    assistantText: `${params.assistantText}\n\n${constrainedPrompt}`,
    geminiApiKey: params.geminiApiKey,
    actionHints: params.actionHints,
  });
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

// ── Tool Selection for Card Enhancement ──

export interface ToolSelectionResult {
  toolFamily: string;
  toolName: string;
  params: Record<string, unknown>;
}

export async function selectToolForContent(params: {
  cardText: string;
  geminiApiKey: string;
  toolFamilies: Array<{
    toolFamily: string;
    fallbackToolName: string;
    actionSuffixes: string[];
    description?: string;
  }>;
}): Promise<ToolSelectionResult | null> {
  if (!params.geminiApiKey) return null;
  if (params.toolFamilies.length === 0) return null;

  const familiesPayload = params.toolFamilies.map((f) => ({
    family: f.toolFamily,
    description: f.description,
    defaultTool: f.fallbackToolName,
    actions: f.actionSuffixes,
  }));

  const prompt = `You are Enso's tool selector.
Given an AI assistant's text response, decide which ONE tool family and tool best serves this content as an interactive app.
Return ONLY strict JSON:
{
  "matched": boolean,
  "toolFamily": string,
  "toolName": string,
  "params": object,
  "reasoning": string
}

Rules:
- Only select from the provided tool families and their tools.
- CRITICAL: toolName must be EXACTLY the defaultTool or constructed as: take the defaultTool name, strip its last segment after the final underscore, then append an action suffix. Example: defaultTool "enso_meal_plan_week" has prefix "enso_meal_", so valid tools are "enso_meal_plan_week", "enso_meal_grocery_list", "enso_meal_swap_meal".
- If the content doesn't clearly map to any tool family, return {"matched": false}.
- DO NOT match generic greetings, opinions, jokes, code snippets, or explanations — only match content that describes structured real-world data.
- Use the EXACT parameter names the tool expects. For travel tools: use "destination" (not "location"), "days" (not "duration"). For meal tools: use "diet" (not "dietary_preferences"), "servings" (not "num_servings"). For filesystem/workspace: use "path".
- Infer params from the text content (e.g. paths, destinations, dietary preferences).

Tool families:
${JSON.stringify(familiesPayload, null, 2)}

Assistant response to analyze:
${params.cardText.slice(0, 4000)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${params.geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 512,
              temperature: 0,
              responseMimeType: "application/json",
            },
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        console.log(`[enso:tool-select] Gemini returned HTTP ${response.status}`);
        return null;
      }

      const result = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; thought?: boolean }> };
        }>;
      };
      const parts = result.candidates?.[0]?.content?.parts;
      // Gemini 2.5 Flash may return thinking parts first; pick the last non-thought text part
      const textPart = parts?.filter((p) => p.text && !p.thought).pop();
      const text = textPart?.text;
      if (!text) {
        console.log(`[enso:tool-select] Gemini returned no text. parts: ${JSON.stringify(parts?.map((p) => ({ len: p.text?.length, thought: p.thought })))}`);
        return null;
      }

      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      console.log(`[enso:tool-select] response (${text.length} chars)`);

      let parsed: {
        matched?: boolean;
        toolFamily?: string;
        toolName?: string;
        params?: Record<string, unknown>;
      };
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Gemini 2.5 Flash may return slightly malformed JSON — try extracting object
        const objMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!objMatch) {
          console.log(`[enso:tool-select] could not extract JSON object from response`);
          return null;
        }
        parsed = JSON.parse(objMatch[0]);
      }

      if (!parsed.matched || !parsed.toolFamily || !parsed.toolName) {
        console.log(`[enso:tool-select] no match (matched=${parsed.matched})`);
        return null;
      }

      return {
        toolFamily: parsed.toolFamily,
        toolName: parsed.toolName,
        params: parsed.params && typeof parsed.params === "object" ? parsed.params : {},
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.log(`[enso:tool-select] error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

