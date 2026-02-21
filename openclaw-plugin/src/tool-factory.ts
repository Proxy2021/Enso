import { randomUUID } from "crypto";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { ConnectedClient } from "./server.js";
import type { ServerMessage, OperationStage, ToolBuildSummary, ExecutorContext } from "./types.js";
import { callGeminiLLMWithRetry, GEMINI_MODEL_PRO, STRUCTURED_DATA_SYSTEM_PROMPT } from "./ui-generator.js";
import {
  registerToolTemplate,
  registerToolTemplateDataHint,
  registerGeneratedTool,
  registerGeneratedTemplateCode,
  executeToolDirect,
  type ToolTemplate,
} from "./native-tools/registry.js";
import { TOOL_FAMILY_CAPABILITIES, addCapability } from "./tool-families/catalog.js";
import { registerCardContext } from "./outbound.js";
import { saveApp, generateSkillMd, buildExecutorContext } from "./app-persistence.js";

// ── Types ──

interface BuildToolParams {
  cardId: string;
  cardText: string;
  toolDefinition: string;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}

export interface PluginToolDef {
  suffix: string;
  description: string;
  parameters: Record<string, unknown>;
  sampleParams: Record<string, unknown>;
  sampleData: Record<string, unknown>;
  requiredDataKeys: string[];
  isPrimary: boolean;
}

export interface PluginSpec {
  toolFamily: string;
  toolPrefix: string;
  description: string;
  signatureId: string;
  tools: PluginToolDef[];
}

// ── Progress Helpers ──

function sendProgress(
  client: ConnectedClient,
  cardId: string,
  stage: OperationStage,
  label: string,
): void {
  const msg: ServerMessage = {
    id: randomUUID(),
    runId: randomUUID(),
    sessionKey: client.sessionKey,
    seq: 0,
    state: "delta",
    targetCardId: cardId,
    operation: {
      operationId: `build-tool-${cardId}`,
      stage,
      label,
      cancellable: false,
    },
    timestamp: Date.now(),
  };
  client.send(msg);
}

function sendEnhanceResult(
  client: ConnectedClient,
  cardId: string,
  result: ServerMessage["enhanceResult"],
): void {
  const msg: ServerMessage = {
    id: randomUUID(),
    runId: randomUUID(),
    sessionKey: client.sessionKey,
    seq: 0,
    state: "final",
    targetCardId: cardId,
    enhanceResult: result,
    timestamp: Date.now(),
  };
  client.send(msg);
}

function sendBuildComplete(
  client: ConnectedClient,
  cardId: string,
  success: boolean,
  summary?: ToolBuildSummary,
  error?: string,
): void {
  const msg: ServerMessage = {
    id: randomUUID(),
    runId: randomUUID(),
    sessionKey: client.sessionKey,
    seq: 0,
    state: "final",
    buildComplete: { cardId, success, summary, error },
    timestamp: Date.now(),
  };
  client.send(msg);
}

// ── Build Trace Logger ──

interface TraceStep {
  step: string;
  status: "ok" | "fail" | "skip" | "retry";
  ms: number;
  detail?: string;
}

class BuildTrace {
  private buildId: string;
  private cardId: string;
  private startedAt: number;
  private steps: TraceStep[] = [];
  private stepStart = 0;
  private context: Record<string, unknown> = {};

  constructor(cardId: string) {
    this.buildId = randomUUID().slice(0, 8);
    this.cardId = cardId;
    this.startedAt = Date.now();
    this.stepStart = this.startedAt;
  }

  /** Set context fields that will appear in the final summary. */
  setContext(fields: Record<string, unknown>): void {
    Object.assign(this.context, fields);
  }

  /** Mark the start of a new timed step. Call before the operation. */
  beginStep(): void {
    this.stepStart = Date.now();
  }

  /** Record a completed step with timing. */
  step(name: string, status: TraceStep["status"], detail?: string): void {
    const ms = Date.now() - this.stepStart;
    this.steps.push({ step: name, status, ms, detail });
    const tag = status === "ok" ? "✓" : status === "fail" ? "✗" : status === "retry" ? "↻" : "⊘";
    const detailStr = detail ? ` — ${detail}` : "";
    console.log(`[enso:build:${this.buildId}] ${tag} ${name} (${ms}ms)${detailStr}`);
    this.stepStart = Date.now();
  }

  /** Log an informational message within the current build. */
  info(message: string): void {
    console.log(`[enso:build:${this.buildId}] ${message}`);
  }

  /** Log an error message within the current build. */
  error(message: string): void {
    console.error(`[enso:build:${this.buildId}] ${message}`);
  }

  /** Emit the final structured build report. */
  finish(outcome: "success" | "failed" | "aborted"): void {
    const totalMs = Date.now() - this.startedAt;
    const passed = this.steps.filter((s) => s.status === "ok").length;
    const failed = this.steps.filter((s) => s.status === "fail").length;
    const retried = this.steps.filter((s) => s.status === "retry").length;

    console.log(`[enso:build:${this.buildId}] ── BUILD ${outcome.toUpperCase()} ──`);
    console.log(`[enso:build:${this.buildId}] cardId: ${this.cardId}`);
    for (const [key, value] of Object.entries(this.context)) {
      const val = typeof value === "string" && value.length > 120 ? value.slice(0, 120) + "..." : value;
      console.log(`[enso:build:${this.buildId}] ${key}: ${val}`);
    }
    console.log(`[enso:build:${this.buildId}] steps: ${passed} passed, ${failed} failed, ${retried} retried — total ${totalMs}ms`);

    // Step-by-step breakdown
    for (const s of this.steps) {
      const tag = s.status === "ok" ? "✓" : s.status === "fail" ? "✗" : s.status === "retry" ? "↻" : "⊘";
      const detailStr = s.detail ? ` (${s.detail})` : "";
      console.log(`[enso:build:${this.buildId}]   ${tag} ${s.step}: ${s.ms}ms${detailStr}`);
    }
    console.log(`[enso:build:${this.buildId}] ── END ──`);
  }
}

// ── Helpers ──

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:javascript|js|jsx?|tsx?)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();
}

function ensureExportDefault(jsx: string): string {
  if (jsx.startsWith("export default function")) return jsx;
  const idx = jsx.indexOf("export default function");
  return idx > 0 ? jsx.slice(idx) : jsx;
}

// ── Gemini Prompts ──

function buildPluginSpecPrompt(cardText: string, toolDefinition: string): string {
  const existingPlugins = TOOL_FAMILY_CAPABILITIES.map(
    (c) => `  - ${c.toolFamily}: ${c.description} (prefix: "enso_${c.toolFamily}_", suffixes: ${c.actionSuffixes.join(", ")})`,
  ).join("\n");

  return `You are Enso's plugin architect. Design a PLUGIN — a family of 2-4 related tools that work together to address the user's scenario end-to-end.

Each plugin has:
- A tool family name and shared prefix (e.g. "workout_planner" → prefix "enso_workout_")
- 2-4 tools, each handling a distinct function within the scenario
- One PRIMARY tool that generates the main view (e.g. generate the weekly plan)
- Action tools that modify/extend/drill into the data (e.g. swap an exercise, track progress)

EXISTING PLUGINS (for reference on patterns):
${existingPlugins}

PATTERN EXAMPLES:
  travel_planner: plan_trip (primary — creates itinerary), optimize_day (mutates one day), budget_breakdown (different view)
  meal_planner: plan_week (primary — creates meal plan), grocery_list (derived view), swap_meal (mutates one meal)

ORIGINAL AI RESPONSE:
${cardText.slice(0, 3000)}

USER'S SCENARIO:
${toolDefinition}

CAPABILITIES — Executors receive a \`ctx\` parameter with real system access:
- await ctx.callTool(toolName, params) — Call any registered tool. Returns { success, data, error }.
- await ctx.listDir(path) — List directory contents (files/folders with metadata).
- await ctx.readFile(path) — Read a text file. Returns file content.
- await ctx.searchFiles(rootPath, name) — Search for files by name pattern.
- await ctx.fetch(url, options?) — HTTPS fetch (max 512KB, 10s timeout). Returns { ok, status, data }.
- await ctx.search(query, options?) — Web search via Brave Search API. Returns { ok, results: [{ title, url, description }] }.
  Use for discovery: showtimes, reviews, local info, event details, product lookups.

When designing tools, ALWAYS prefer REAL data sources over synthetic data:
- Web search (ctx.search) — for discovering showtimes, reviews, local businesses, events, product details
- File system browsing/reading (ctx.listDir, ctx.readFile, ctx.searchFiles) — for file/project scenarios
- Any registered OpenClaw tools (ctx.callTool with tool name) — for system integration
- HTTP APIs (ctx.fetch for public APIs) — for movies, weather, news, sports, stocks, prices, etc.
  Examples: TMDB API (movies), Open-Meteo (weather), public REST APIs
Design tools that USE ctx. Synthetic/hardcoded data is ONLY for fallback when ctx calls fail.

RULES:
- Each tool's sampleData defines the OUTPUT SHAPE and serves as FALLBACK when ctx calls fail.
- The primary tool's sampleData should be a rich, complete data structure.
- Action tools should return data in a shape compatible with the primary (re-renderable by the same template).
- Each tool's sampleData MUST include a "tool" field set to the full tool name (prefix + suffix).
- Every tool must have at least one required parameter.
- Executors MUST try ctx first (fetch, listDir, callTool, etc.) and only use sampleData-shaped synthetic data as a fallback on error.

Respond with ONLY valid JSON (no markdown fences):
{
  "toolFamily": "string (snake_case)",
  "toolPrefix": "string ending with _ (e.g. enso_workout_)",
  "description": "string (what this plugin does end-to-end)",
  "signatureId": "string (snake_case template identifier)",
  "tools": [
    {
      "suffix": "plan_week",
      "description": "Generate a weekly workout plan based on fitness goal",
      "parameters": { "type": "object", "properties": { ... }, "required": [...] },
      "sampleParams": { "goal": "strength" },
      "sampleData": { "tool": "enso_workout_plan_week", "goal": "strength", "days": [...] },
      "requiredDataKeys": ["tool", "goal", "days"],
      "isPrimary": true
    },
    {
      "suffix": "swap_exercise",
      "description": "Replace an exercise in a specific day's workout",
      "parameters": { "type": "object", "properties": { ... }, "required": [...] },
      "sampleParams": { "day": 1, "oldExercise": "squats", "newExercise": "lunges" },
      "sampleData": { "tool": "enso_workout_swap_exercise", "day": 1, ... },
      "requiredDataKeys": ["tool", "day"],
      "isPrimary": false
    }
  ]
}`;
}

function buildToolExecutePrompt(spec: PluginSpec, toolDef: PluginToolDef): string {
  const toolName = `${spec.toolPrefix}${toolDef.suffix}`;
  return `Generate a JavaScript function body for a tool executor.

The function receives THREE arguments: callId (string), params (object), and ctx (ExecutorContext).
It must return: { content: [{ type: "text", text: JSON.stringify(resultData) }] }

TOOL SPECIFICATION:
- Name: ${toolName}
- Description: ${toolDef.description}
- Parameters: ${JSON.stringify(toolDef.parameters)}
- Expected output shape: ${JSON.stringify(toolDef.sampleData)}

EXECUTOR CONTEXT (ctx) — Available capabilities:
- await ctx.callTool(toolName, params) — Call any registered OpenClaw tool. Returns { success, data, error }.
- await ctx.listDir(path) — List a directory. Returns { success, data, error } where data has file/folder entries.
- await ctx.readFile(path) — Read a text file. Returns { success, data, error } where data is the file content.
- await ctx.searchFiles(rootPath, name) — Search files by name. Returns { success, data, error }.
- await ctx.fetch(url, options?) — HTTPS fetch (max 512KB, 10s timeout). Returns { ok, status, data }.
- await ctx.search(query, options?) — Web search via Brave Search API. Returns { ok, results: [{ title, url, description }] }.
  Use for discovery: finding showtimes, reviews, detailed info, local businesses, event schedules, etc.

RULES:
- The function body will be wrapped in: new AsyncFunction("callId", "params", "ctx", YOUR_BODY)
- The executor is ASYNC — you can use \`await\` freely with ctx methods.
- The output data shape MUST match the sampleData structure.
- Include a "tool" field in the output set to "${toolName}".
- Use only standard JavaScript (no TypeScript, no JSX, no imports, no require).
- Use params values to customize the output.
- Return reasonable default data when optional params are missing.

CRITICAL — WHEN TO USE ctx:
- **PREFER ctx.search for DISCOVERY scenarios** — finding showtimes, reviews, local businesses, event details, product comparisons, detailed info about specific items.
  ctx.search returns titles, URLs, and descriptions. Use ctx.fetch on the returned URLs if you need to scrape deeper data.
- **PREFER ctx.fetch for KNOWN API scenarios** — movies (TMDB), weather (Open-Meteo), stocks, etc.
  Use free/public APIs when you know the endpoint.
- **PREFER ctx.listDir / ctx.readFile** for scenarios involving the user's files or projects.
- **PREFER ctx.callTool** for scenarios that map to registered system tools.
- Use synthetic/hardcoded data ONLY as a FALLBACK when ctx calls fail — NEVER as the primary data source when a real API exists.
- ALWAYS try the real data path FIRST, then fall back to synthetic data in the catch block.
- ALWAYS handle errors gracefully with try/catch and a synthetic fallback.

EXAMPLE — ctx.fetch with real API (PREFERRED for external data):
\`\`\`
var page = Math.max(1, Math.floor(Number(params.page) || 1));
try {
  var resp = await ctx.fetch("https://api.themoviedb.org/3/movie/now_playing?api_key=DEMO_KEY&region=HK&page=" + page);
  if (resp.ok && resp.data && resp.data.results) {
    var movies = resp.data.results.map(function(m) {
      return { movie_id: "M" + m.id, title: m.title, rating: m.vote_average, genre: "Film", poster_url: "https://image.tmdb.org/t/p/w300" + m.poster_path };
    });
    return { content: [{ type: "text", text: JSON.stringify({ tool: "${toolName}", movies: movies, current_page: page, total_pages: resp.data.total_pages }) }] };
  }
} catch (e) { /* fall through to synthetic fallback */ }
var fallback = [{ movie_id: "M001", title: "Sample Movie", rating: 8.0, genre: "Drama", poster_url: "" }];
return { content: [{ type: "text", text: JSON.stringify({ tool: "${toolName}", movies: fallback, current_page: 1, total_pages: 1 }) }] };
\`\`\`

EXAMPLE — ctx.listDir for filesystem data:
\`\`\`
var dirPath = (params.path || "").trim() || ".";
try {
  var result = await ctx.listDir(dirPath);
  if (result.success) {
    var entries = Array.isArray(result.data) ? result.data : (result.data && result.data.entries) || [];
    return { content: [{ type: "text", text: JSON.stringify({ tool: "${toolName}", path: dirPath, entries: entries }) }] };
  }
} catch (e) { /* fall through to synthetic */ }
var fallback = [{ name: "example.txt", type: "file", size: 1024 }];
return { content: [{ type: "text", text: JSON.stringify({ tool: "${toolName}", path: dirPath, entries: fallback }) }] };
\`\`\`

EXAMPLE — ctx.search for discovery (showtimes, reviews, local info):
\`\`\`
var query = (params.title || "Movie") + " showtimes " + (params.location || "");
try {
  var sr = await ctx.search(query.trim(), { count: 5 });
  if (sr.ok && sr.results.length > 0) {
    var showtimes = sr.results.map(function(r) {
      return { source: r.title, url: r.url, snippet: r.description };
    });
    return { content: [{ type: "text", text: JSON.stringify({ tool: "${toolName}", query: query, results: showtimes }) }] };
  }
} catch (e) { /* fall through to synthetic fallback */ }
var fallback = [{ source: "No results", url: "", snippet: "Search unavailable" }];
return { content: [{ type: "text", text: JSON.stringify({ tool: "${toolName}", query: query, results: fallback }) }] };
\`\`\`

Respond with ONLY the function body (no function keyword, no wrapper, no markdown fences). The code must start directly with variable declarations or return statements.`;
}

function buildPluginTemplatePrompt(spec: PluginSpec): string {
  const primaryTool = spec.tools.find((t) => t.isPrimary) ?? spec.tools[0];
  const toolDescriptions = spec.tools.map((t) => {
    const name = `${spec.toolPrefix}${t.suffix}`;
    const tag = t.isPrimary ? " (PRIMARY)" : "";
    const paramNames = Object.keys(
      (t.parameters as { properties?: Record<string, unknown> }).properties ?? {},
    ).join(", ");
    return `  - ${name}${tag}: ${t.description} — params: { ${paramNames} }`;
  }).join("\n");

  const actionRules = spec.tools
    .filter((t) => !t.isPrimary)
    .map((t) => {
      const paramNames = Object.keys(
        (t.parameters as { properties?: Record<string, unknown> }).properties ?? {},
      );
      const paramHints = paramNames.map((p) => `${p}: /* from current data */`).join(", ");
      return `  - "${t.suffix}" → onAction("${t.suffix}", { ${paramHints} })`;
    })
    .join("\n");

  return `${STRUCTURED_DATA_SYSTEM_PROMPT}

DATA SHAPE (from primary tool output):
${JSON.stringify(primaryTool.sampleData, null, 2)}

PLUGIN CONTEXT:
- Plugin family: ${spec.toolFamily}
- Description: ${spec.description}
- Signature: ${spec.signatureId}

AVAILABLE TOOLS IN THIS PLUGIN:
${toolDescriptions}

ACTION BUTTON RULES:
- "refresh" → onAction("refresh", {}) — always include a refresh button
${actionRules}
- Each action button should pass relevant context from the current data item
- Use the SUFFIX only as the action name (not the full tool name)

Build a rich, interactive app component for this data. Use tabs, expandable sections, and action buttons that invoke the other tools in this plugin.`;
}

// ── Validation ──

// AsyncFunction constructor: supports `await` in executor bodies
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as typeof Function;

export async function validateToolExecutor(params: {
  executeBody: string;
  sampleParams: Record<string, unknown>;
  expectedKeys: string[];
}): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    const executeFn = new AsyncFunction("callId", "params", "ctx", params.executeBody) as (
      callId: string,
      params: Record<string, unknown>,
      ctx: ExecutorContext,
    ) => Promise<{ content: Array<{ type: string; text?: string }> }>;

    const ctx = buildExecutorContext("validation", "test");
    const result = await executeFn("test-call", params.sampleParams, ctx);
    if (!result?.content?.[0]?.text) {
      errors.push("Execute function did not return expected { content: [{ type, text }] } structure");
    } else {
      const parsed = JSON.parse(result.content[0].text);
      for (const key of params.expectedKeys) {
        if (!(key in parsed)) {
          errors.push(`Missing expected key "${key}" in tool output`);
        }
      }
    }
  } catch (err) {
    errors.push(`Execute function error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { valid: errors.length === 0, errors };
}

export async function validateTemplateJSX(templateJSX: string): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    const { transform } = await import("sucrase");
    transform(templateJSX, {
      transforms: ["jsx", "typescript"],
      jsxRuntime: "classic",
      jsxPragma: "React.createElement",
      jsxFragmentPragma: "React.Fragment",
    });
  } catch (err) {
    errors.push(`Template JSX compilation error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { valid: errors.length === 0, errors };
}

// ── App Proposal Generation ──

function buildAppProposalPrompt(cardText: string, conversationContext: string): string {
  const existingFamilies = TOOL_FAMILY_CAPABILITIES.map(
    (c) => `  - **${c.toolFamily}**: ${c.description}`,
  ).join("\n");

  return `You are Enso's app architect. Based on a conversation between a user and an AI assistant, propose a new interactive app that would enhance the AI's response.

CONVERSATION CONTEXT (recent exchanges):
${conversationContext.slice(0, 2000) || "(no context available)"}

AI RESPONSE TO ENHANCE (this is the card the user wants to turn into an app):
${cardText.slice(0, 3000)}

EXISTING APP FAMILIES (for reference — do not duplicate these):
${existingFamilies || "  (none yet)"}

YOUR TASK:
Propose a structured app description. This will serve as both:
1. A human-readable proposal the user can review and edit
2. The app's SKILL.md file (describing what it does and when to use it)

OUTPUT FORMAT — respond with ONLY the structured markdown below, no fences, no preamble:

# <App Name>

<One-line description of what this app does>

## Overview

<2-3 sentences explaining the scenario this app addresses, what data it works with, and why it's useful as an interactive experience rather than just text>

## Tools

### <Primary Tool Name> (primary)
<Description of the main view this tool generates — e.g., "Show currently screening movies with title, genre, rating, and cinema availability">

### <Action Tool 1>
<Description of what this action does — e.g., "Get detailed info about a specific movie — synopsis, cast, showtimes, and ticket links">

### <Action Tool 2>
<Description of another action — e.g., "Filter the movie list by genre (action, comedy, drama, etc.)">

GUIDELINES:
- The app name should be descriptive and concise (2-4 words)
- Include 2-4 tools total: one primary (generates the main view) and 1-3 action tools
- Each tool description should explain what data it produces or how it mutates the view
- Keep descriptions concise but specific enough to guide implementation
- The primary tool generates the initial data view; action tools modify, filter, or drill into it
- Focus on the specific scenario in the conversation, not generic functionality`;
}

export async function generateAppProposal(params: {
  cardText: string;
  conversationContext: string;
  apiKey?: string;
}): Promise<string> {
  const t0 = Date.now();
  const contextLen = params.conversationContext.length;
  const cardTextLen = params.cardText.length;

  console.log(`[enso:propose] starting proposal generation — cardText=${cardTextLen} chars, context=${contextLen} chars`);

  if (!params.apiKey) {
    console.log(`[enso:propose] no API key — returning fallback template (${Date.now() - t0}ms)`);
    return "# New App\n\nDescribe the app, its tools, and what scenarios it supports...\n\n## Tools\n\n### Browse (primary)\nGenerate the main data view.\n\n### Filter\nFilter or refine the results.\n";
  }

  try {
    const prompt = buildAppProposalPrompt(params.cardText, params.conversationContext);
    console.log(`[enso:propose] calling Gemini — prompt=${prompt.length} chars`);

    const raw = await callGeminiLLMWithRetry(prompt, params.apiKey);
    console.log(`[enso:propose] Gemini responded — ${raw.length} chars (${Date.now() - t0}ms)`);

    // Strip any accidental markdown fences
    const cleaned = raw
      .replace(/^```(?:markdown|md)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();

    // Basic sanity check: should start with a heading
    if (cleaned.startsWith("#")) {
      const firstLine = cleaned.split("\n")[0];
      console.log(`[enso:propose] ✓ proposal ready — "${firstLine}" (${cleaned.length} chars, ${Date.now() - t0}ms)`);
      return cleaned;
    }

    // If response doesn't look like structured markdown, wrap it
    console.log(`[enso:propose] ⚠ response not headed — wrapping in "# New App" (${Date.now() - t0}ms)`);
    return `# New App\n\n${cleaned}`;
  } catch (err) {
    console.log(`[enso:propose] ✗ proposal generation failed (${Date.now() - t0}ms): ${err instanceof Error ? err.message : String(err)}`);
    return "# New App\n\nDescribe the app, its tools, and what scenarios it supports...\n\n## Tools\n\n### Browse (primary)\nGenerate the main data view.\n\n### Filter\nFilter or refine the results.\n";
  }
}

// ── Main Entry Point ──

export async function handleBuildTool(params: BuildToolParams): Promise<void> {
  const { cardId, cardText, toolDefinition, client, account } = params;
  const trace = new BuildTrace(cardId);

  trace.setContext({
    toolDefinition: toolDefinition.slice(0, 200),
    cardTextLen: cardText.length,
    definitionLen: toolDefinition.length,
  });
  trace.info("build-app request received");

  if (!account.geminiApiKey) {
    trace.info("aborted: no geminiApiKey configured");
    trace.finish("aborted");
    sendEnhanceResult(client, cardId, null);
    sendBuildComplete(client, cardId, false, undefined, "No Gemini API key configured");
    return;
  }

  const apiKey = account.geminiApiKey;
  const buildSteps: ToolBuildSummary["steps"] = [];

  try {
    // ── Step 1: Generate app specification ──
    sendProgress(client, cardId, "processing", "Designing app");
    trace.beginStep();

    const specPrompt = buildPluginSpecPrompt(cardText, toolDefinition);
    trace.info(`spec prompt: ${specPrompt.length} chars — model=${GEMINI_MODEL_PRO}`);
    const specRaw = await callGeminiLLMWithRetry(specPrompt, apiKey, GEMINI_MODEL_PRO);
    trace.info(`spec response: ${specRaw.length} chars`);

    let spec: PluginSpec;
    try {
      spec = JSON.parse(specRaw);
    } catch {
      trace.step("Design app spec", "fail", `invalid JSON: ${specRaw.slice(0, 100)}`);
      buildSteps.push({ label: "Design app specification", status: "failed" });
      trace.finish("failed");
      sendEnhanceResult(client, cardId, null);
      sendBuildComplete(client, cardId, false, undefined, "Failed to parse app specification");
      return;
    }

    // Validate spec has required fields
    if (!spec.toolFamily || !spec.signatureId || !Array.isArray(spec.tools) || spec.tools.length === 0) {
      trace.step("Design app spec", "fail", "missing required fields");
      buildSteps.push({ label: "Design app specification", status: "failed" });
      trace.finish("failed");
      sendEnhanceResult(client, cardId, null);
      sendBuildComplete(client, cardId, false, undefined, "App specification missing required fields");
      return;
    }

    // Ensure naming conventions
    if (!spec.toolPrefix) spec.toolPrefix = `enso_${spec.toolFamily}_`;

    // Ensure at least one primary tool
    if (!spec.tools.some((t) => t.isPrimary)) {
      spec.tools[0].isPrimary = true;
    }

    // Fill in defaults for tools
    for (const tool of spec.tools) {
      if (!tool.sampleParams) tool.sampleParams = {};
      if (!tool.requiredDataKeys || tool.requiredDataKeys.length === 0) {
        tool.requiredDataKeys = Object.keys(tool.sampleData ?? {}).slice(0, 5);
      }
    }

    const toolCount = spec.tools.length;
    const toolSuffixes = spec.tools.map((t) => t.suffix).join(", ");
    const primarySuffix = spec.tools.find((t) => t.isPrimary)?.suffix ?? spec.tools[0].suffix;
    trace.step("Design app spec", "ok", `family=${spec.toolFamily}, tools=[${toolSuffixes}], primary=${primarySuffix}`);
    trace.setContext({ toolFamily: spec.toolFamily, signatureId: spec.signatureId, toolCount });
    buildSteps.push({ label: "Design app specification", status: "passed" });

    // ── Step 2: Generate execute functions (parallel) ──
    sendProgress(client, cardId, "calling_tool", `Generating tools (${toolCount})`);
    trace.beginStep();

    const executeResults = await Promise.all(
      spec.tools.map(async (toolDef) => {
        const raw = await callGeminiLLMWithRetry(buildToolExecutePrompt(spec, toolDef), apiKey, GEMINI_MODEL_PRO);
        return { suffix: toolDef.suffix, body: stripMarkdownFences(raw), bodyLen: raw.length };
      }),
    );

    const executeBodies = new Map<string, string>();
    for (const r of executeResults) {
      executeBodies.set(r.suffix, r.body);
    }

    const executorSizes = executeResults.map((r) => `${r.suffix}=${r.body.length}b`).join(", ");
    trace.step(`Generate ${toolCount} executors`, "ok", executorSizes);
    buildSteps.push({ label: `Generate ${toolCount} tool executors`, status: "passed" });

    // ── Step 3: Generate shared UI template ──
    sendProgress(client, cardId, "generating_ui", "Generating UI template");
    trace.beginStep();

    let templateJSX = await callGeminiLLMWithRetry(
      buildPluginTemplatePrompt(spec),
      apiKey,
      GEMINI_MODEL_PRO,
    );
    templateJSX = ensureExportDefault(stripMarkdownFences(templateJSX));

    trace.step("Generate UI template", "ok", `${templateJSX.length} chars`);
    buildSteps.push({ label: "Generate shared UI template", status: "passed" });

    // ── Step 4: Validate all tools + template ──
    sendProgress(client, cardId, "processing", "Validating app");

    // Validate template JSX first
    trace.beginStep();
    const templateValidation = await validateTemplateJSX(templateJSX);
    if (!templateValidation.valid) {
      trace.step("Validate UI template", "retry", templateValidation.errors.join("; "));
      // Retry template once
      trace.beginStep();
      const retryPrompt = buildPluginTemplatePrompt(spec)
        + `\n\nPREVIOUS ATTEMPT FAILED WITH ERRORS:\n${templateValidation.errors.join("\n")}\n\nFix the JSX syntax errors.`;
      templateJSX = await callGeminiLLMWithRetry(retryPrompt, apiKey, GEMINI_MODEL_PRO);
      templateJSX = ensureExportDefault(stripMarkdownFences(templateJSX));

      const retry = await validateTemplateJSX(templateJSX);
      if (!retry.valid) {
        trace.step("Validate UI template (retry)", "fail", retry.errors.join("; "));
        buildSteps.push({ label: "Validate UI template", status: "failed" });
        trace.finish("failed");
        sendEnhanceResult(client, cardId, null);
        sendBuildComplete(client, cardId, false, undefined, "UI template validation failed after retry");
        return;
      }
      trace.step("Validate UI template (retry)", "ok", `${templateJSX.length} chars`);
    } else {
      trace.step("Validate UI template", "ok");
    }
    buildSteps.push({ label: "Validate UI template", status: "passed" });

    // Validate each tool executor
    const primaryTool = spec.tools.find((t) => t.isPrimary) ?? spec.tools[0];
    const validatedTools: Array<{ def: PluginToolDef; body: string }> = [];

    for (const toolDef of spec.tools) {
      trace.beginStep();
      let body = executeBodies.get(toolDef.suffix) ?? "";
      const validation = await validateToolExecutor({
        executeBody: body,
        sampleParams: toolDef.sampleParams,
        expectedKeys: toolDef.requiredDataKeys,
      });

      if (!validation.valid) {
        trace.step(`Validate ${toolDef.suffix}`, "retry", validation.errors.join("; "));

        // Retry once
        trace.beginStep();
        const retryPrompt = buildToolExecutePrompt(spec, toolDef)
          + `\n\nPREVIOUS ATTEMPT FAILED WITH ERRORS:\n${validation.errors.join("\n")}\n\nFix these issues.`;
        body = stripMarkdownFences(await callGeminiLLMWithRetry(retryPrompt, apiKey, GEMINI_MODEL_PRO));

        const retry = await validateToolExecutor({
          executeBody: body,
          sampleParams: toolDef.sampleParams,
          expectedKeys: toolDef.requiredDataKeys,
        });

        if (!retry.valid) {
          trace.step(`Validate ${toolDef.suffix} (retry)`, "fail", retry.errors.join("; "));
          buildSteps.push({ label: `Validate tool ${spec.toolPrefix}${toolDef.suffix}`, status: "failed" });

          // Primary tool failure → entire plugin fails
          if (toolDef === primaryTool) {
            trace.finish("failed");
            sendEnhanceResult(client, cardId, null);
            sendBuildComplete(client, cardId, false, undefined, `Primary tool ${spec.toolPrefix}${toolDef.suffix} validation failed`);
            return;
          }
          // Non-primary → drop this tool, continue with others
          continue;
        }
        trace.step(`Validate ${toolDef.suffix} (retry)`, "ok");
      } else {
        trace.step(`Validate ${toolDef.suffix}`, "ok");
      }

      buildSteps.push({ label: `Validate tool ${spec.toolPrefix}${toolDef.suffix}`, status: "passed" });
      validatedTools.push({ def: toolDef, body });
    }

    if (validatedTools.length === 0) {
      trace.info("no tools passed validation");
      trace.finish("failed");
      sendEnhanceResult(client, cardId, null);
      sendBuildComplete(client, cardId, false, undefined, "No tools passed validation");
      return;
    }

    trace.setContext({ validatedTools: `${validatedTools.length}/${toolCount}` });

    // ── Step 5: Register all tools ──
    sendProgress(client, cardId, "processing", "Registering app");
    trace.beginStep();

    const registeredToolNames: string[] = [];
    const actionSuffixes: string[] = [];

    for (const { def, body } of validatedTools) {
      const toolName = `${spec.toolPrefix}${def.suffix}`;
      const executeFn = new AsyncFunction("callId", "params", "ctx", body) as (
        callId: string,
        params: Record<string, unknown>,
        ctx: ExecutorContext,
      ) => Promise<{ content: Array<{ type: string; text?: string }> }>;

      registerGeneratedTool({
        name: toolName,
        description: def.description,
        parameters: def.parameters,
        execute: async (callId: string, toolParams: Record<string, unknown>) => {
          const ctx = buildExecutorContext(spec.toolFamily, def.suffix);
          const result = await executeFn(callId, toolParams, ctx);
          return result;
        },
      });

      registeredToolNames.push(toolName);
      actionSuffixes.push(def.suffix);
    }

    // Register template metadata
    const template: ToolTemplate = {
      toolFamily: spec.toolFamily,
      signatureId: spec.signatureId,
      templateId: `generated-${spec.signatureId}-v1`,
      supportedActions: actionSuffixes.map((s) => `${spec.toolPrefix}${s}`),
      coverageStatus: "covered",
    };
    registerToolTemplate(template);

    // Register data hint
    const primaryDef = validatedTools.find((v) => v.def.isPrimary)?.def ?? validatedTools[0].def;
    registerToolTemplateDataHint({
      toolFamily: spec.toolFamily,
      signatureId: spec.signatureId,
      requiredKeys: primaryDef.requiredDataKeys,
    });

    // Register template JSX code
    registerGeneratedTemplateCode(spec.signatureId, templateJSX);

    // Register in capability catalog
    const fallbackToolName = `${spec.toolPrefix}${primaryDef.suffix}`;
    addCapability({
      toolFamily: spec.toolFamily,
      fallbackToolName,
      actionSuffixes,
      signatureId: spec.signatureId,
      description: spec.description,
    });

    trace.step("Register tools", "ok", `[${registeredToolNames.join(", ")}]`);
    buildSteps.push({ label: `Register ${registeredToolNames.length} tools in live system`, status: "passed" });

    // ── Step 6: Persist app to disk + generate SKILL.md ──
    sendProgress(client, cardId, "processing", "Saving app");
    trace.beginStep();

    let persisted = false;
    let skillGenerated = false;
    try {
      const skillMd = generateSkillMd(spec, toolDefinition);
      skillGenerated = true;
      trace.info(`SKILL.md generated: ${skillMd.length} chars`);
      saveApp({
        spec,
        executors: new Map(validatedTools.map(({ def, body }) => [def.suffix, body])),
        templateJSX,
        skillMd,
        createdAt: Date.now(),
      });
      persisted = true;
      trace.step("Persist + SKILL.md", "ok", `skill=${skillMd.length}b, persisted=true`);
      buildSteps.push({ label: "Save app to disk + generate skill", status: "passed" });
    } catch (err) {
      // Non-fatal: the app works in memory even if persistence fails
      trace.step("Persist + SKILL.md", "fail", err instanceof Error ? err.message : String(err));
      buildSteps.push({ label: "Save app to disk", status: "failed" });
    }

    // ── Step 7: Execute primary tool and deliver result ──
    sendProgress(client, cardId, "calling_tool", "Running primary tool");
    trace.beginStep();

    const toolResult = await executeToolDirect(fallbackToolName, primaryDef.sampleParams);
    const data = toolResult.success && toolResult.data != null
      ? toolResult.data
      : primaryDef.sampleData;

    const dataKeys = data && typeof data === "object" ? Object.keys(data).join(", ") : "n/a";
    trace.step("Execute primary tool", toolResult.success ? "ok" : "fail", `keys=[${dataKeys}]`);
    buildSteps.push({ label: "Execute primary tool", status: toolResult.success ? "passed" : "failed" });

    // Register card context for future card actions
    registerCardContext(cardId, {
      cardId,
      originalPrompt: toolDefinition,
      originalResponse: cardText,
      currentData: structuredClone(data),
      geminiApiKey: apiKey,
      account,
      mode: account.mode,
      actionHistory: [],
      nativeToolHint: {
        toolName: fallbackToolName,
        params: primaryDef.sampleParams,
        handlerPrefix: spec.toolPrefix,
      },
      interactionMode: "tool",
      toolFamily: spec.toolFamily,
      signatureId: spec.signatureId,
      coverageStatus: "covered",
    });

    // Build the summary report
    const buildSummary: ToolBuildSummary = {
      toolFamily: spec.toolFamily,
      toolNames: registeredToolNames,
      description: spec.description,
      scenario: toolDefinition,
      actions: actionSuffixes,
      steps: buildSteps,
      skillGenerated,
      persisted,
    };

    trace.setContext({
      tools: registeredToolNames.join(", "),
      persisted,
      skillGenerated,
    });
    trace.finish("success");

    sendEnhanceResult(client, cardId, {
      data,
      generatedUI: templateJSX,
      cardMode: {
        interactionMode: "tool",
        toolFamily: spec.toolFamily,
        signatureId: spec.signatureId,
        coverageStatus: "covered",
      },
      buildSummary,
    });
    sendBuildComplete(client, cardId, true, buildSummary);
  } catch (err) {
    trace.error(`fatal: ${err instanceof Error ? err.message : String(err)}`);
    trace.finish("failed");
    sendEnhanceResult(client, cardId, null);
    sendBuildComplete(client, cardId, false, undefined, err instanceof Error ? err.message : String(err));
  }
}
