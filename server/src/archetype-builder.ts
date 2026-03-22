/**
 * Archetype Builder — Focused single-session handler for task archetypes
 *
 * Generalizes the deep research pattern: Claude Code researches the task,
 * then builds a bespoke interactive JSX experience custom-designed for it.
 *
 * Two output modes:
 * - One-off (default): Produces a .focused-ui.jsx delivered as generatedUI (no app registration)
 * - Recurring (isRecurring=true): Builds a full app (app.json + template.jsx + executors/)
 */

import { randomUUID } from "crypto";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { runClaudeCode } from "./claude-code.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { ServerMessage } from "./types.js";
import type { TaskClassification, TaskArchetype } from "./task-router.js";
import { logAction, logError, logFix } from "./action-log.js";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(PLUGIN_DIR, "..", "..");

// ── Public API ──

export interface FocusedArchetypeParams {
  userMessage: string;
  classification: TaskClassification;
  mediaUrls?: string[];
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}

export async function handleFocusedArchetype(params: FocusedArchetypeParams): Promise<void> {
  const { userMessage, classification, mediaUrls, client, account } = params;
  const archetype = classification.archetype ?? "general";
  const isRecurring = classification.isRecurring ?? false;
  const runId = randomUUID();
  const cardId = randomUUID();
  const outputFile = join(PROJECT_ROOT, ".focused-ui.jsx");

  logAction({ ts: Date.now(), type: "build", category: "archetype-builder", message: `Focused archetype "${archetype}" build start: "${userMessage.slice(0, 80)}"`, cardId });

  // Clean up any previous output file
  try { if (existsSync(outputFile)) unlinkSync(outputFile); } catch { /* ignore */ }

  const sessionKey = client.sessionKey;
  const send = (msg: Partial<ServerMessage>) => {
    client.send({
      id: randomUUID(),
      runId,
      sessionKey,
      seq: 0,
      timestamp: Date.now(),
      ...msg,
    } as ServerMessage);
  };

  // Send initial card with "building" state
  send({
    state: "final",
    text: `Analyzing your request and building a custom experience...`,
    targetCardId: undefined,
    data: { phase: "building", archetype, topic: userMessage.slice(0, 200) },
  });

  // Send enhanceResult to show building toggle (reuses deep research building pattern)
  send({
    state: "final",
    targetCardId: cardId,
    enhanceResult: {
      data: null,
      generatedUI: undefined as unknown as string,
      cardMode: { interactionMode: "tool", appId: "archetype", toolFamily: "archetype", signatureId: "focused_archetype_building" },
    },
  });

  // Build the prompt
  const prompt = isRecurring
    ? buildRecurringAppPrompt(archetype, userMessage, classification.archetypeHints, mediaUrls)
    : buildArchetypePrompt(archetype, userMessage, classification.archetypeHints, mediaUrls);

  let sessionId: string | undefined;
  try {
    const result = await runClaudeCode({
      prompt,
      cwd: PROJECT_ROOT,
      client,
      runId,
      targetCardId: cardId,
      skipPersist: true,
    });
    sessionId = result.sessionId;
  } catch (err) {
    logError("archetype-builder", "Claude Code session error", err, { cardId, archetype });
    send({
      state: "final",
      targetCardId: cardId,
      text: "Sorry, I couldn't complete this task. Please try again.",
    });
    return;
  }

  if (isRecurring) {
    // For recurring tasks, the app building pipeline handles registration
    // (same as handleBuildAppViaClaude post-build flow)
    logAction({ ts: Date.now(), type: "build", category: "archetype-builder", message: `Recurring archetype "${archetype}" — app build complete, registration handled by build pipeline`, cardId });
    return;
  }

  // One-off: Read the generated JSX template
  if (!existsSync(outputFile)) {
    logError("archetype-builder", "No output file after Claude Code session", undefined, { cardId, archetype });
    send({
      state: "final",
      targetCardId: cardId,
      text: "The task completed but no interactive experience was generated. The results are in the terminal output above.",
    });
    return;
  }

  let templateJSX: string;
  try {
    templateJSX = readFileSync(outputFile, "utf-8").trim();
    unlinkSync(outputFile);
  } catch (err) {
    logError("archetype-builder", "Failed to read output file", err, { cardId, archetype });
    return;
  }

  if (!templateJSX || templateJSX.length < 100) {
    logError("archetype-builder", "Output file too small or empty", undefined, { cardId, archetype });
    return;
  }

  // Compile-check with Sucrase
  try {
    const { transform } = await import("sucrase");
    transform(templateJSX, { transforms: ["jsx"], jsxRuntime: "classic" });
    logAction({ ts: Date.now(), type: "build", category: "archetype-builder", message: "Template compile check: OK", cardId });
  } catch (compileErr) {
    logAction({ ts: Date.now(), type: "build", category: "archetype-builder", message: "Compile error, attempting auto-fix", cardId });

    if (sessionId) {
      writeFileSync(outputFile, templateJSX);
      const fixPrompt = [
        "The .focused-ui.jsx you just created has a compile error:",
        "```",
        String(compileErr),
        "```",
        "",
        "Fix the file. Common issues: unclosed JSX tags, invalid expressions, missing parentheses.",
        "Remember: no imports allowed. All hooks at top level. Use EnsoUI.Tooltip (not Tooltip). Use var (not const/let).",
      ].join("\n");

      try {
        await runClaudeCode({
          prompt: fixPrompt,
          cwd: PROJECT_ROOT,
          toolSessionId: sessionId,
          client,
          runId: randomUUID(),
          targetCardId: cardId,
          skipPersist: true,
        });

        if (existsSync(outputFile)) {
          templateJSX = readFileSync(outputFile, "utf-8").trim();
          unlinkSync(outputFile);
          const { transform } = await import("sucrase");
          transform(templateJSX, { transforms: ["jsx"], jsxRuntime: "classic" });
          logFix({ description: "Template compile error in archetype builder", error: String(compileErr), resolution: "Auto-fixed via Claude Code", category: "archetype-builder" });
        } else {
          return;
        }
      } catch (fixErr) {
        logError("archetype-builder", "Auto-fix failed", fixErr, { cardId });
        try { unlinkSync(outputFile); } catch { /* ignore */ }
        return;
      }
    } else {
      return;
    }
  }

  // Deliver the bespoke UI via enhanceResult
  logAction({ ts: Date.now(), type: "build", category: "archetype-builder", message: `Bespoke UI generated for "${archetype}" (${templateJSX.length} chars)`, cardId });

  send({
    state: "final",
    targetCardId: cardId,
    enhanceResult: {
      data: { tool: "archetype_builder", archetype, topic: userMessage.slice(0, 200), phase: "complete" },
      generatedUI: templateJSX,
      cardMode: { interactionMode: "tool", appId: "archetype", toolFamily: "archetype", signatureId: "focused_archetype_custom" },
    },
  });
}

// ── Prompt Builders ──

function buildArchetypePrompt(
  archetype: TaskArchetype,
  userMessage: string,
  hints?: Record<string, string>,
  mediaUrls?: string[],
): string {
  const lines: string[] = [];

  lines.push(`You have TWO jobs: (1) research/analyze the user's request, then (2) write a single self-contained JSX component that presents your results in the best possible interactive experience, custom-designed for this specific task.`);
  lines.push(``);
  lines.push(`## PERFORMANCE: Be efficient. Target 3-8 minutes total. Prioritize quality over volume.`);
  lines.push(``);
  lines.push(`## User Request: "${userMessage}"`);
  lines.push(``);

  if (mediaUrls?.length) {
    lines.push(`## Attached Files`);
    lines.push(`The user attached these files: ${mediaUrls.join(", ")}`);
    lines.push(`Read and analyze these files as part of Phase 1.`);
    lines.push(``);
  }

  if (hints && Object.keys(hints).length > 0) {
    lines.push(`## Context Hints`);
    for (const [k, v] of Object.entries(hints)) {
      lines.push(`- ${k}: ${v}`);
    }
    lines.push(``);
  }

  // Phase 1: Archetype-specific research/analysis
  lines.push(`## Phase 1: ${ARCHETYPE_PHASE1[archetype] ?? ARCHETYPE_PHASE1.general}`);
  lines.push(``);

  // Phase 2: Archetype-specific UI design
  lines.push(`## Phase 2: Design the Experience`);
  lines.push(``);
  lines.push(ARCHETYPE_PHASE2[archetype] ?? ARCHETYPE_PHASE2.general);
  lines.push(``);
  lines.push(`DO NOT make a generic layout. Design something that feels CUSTOM-MADE for this specific task.`);
  lines.push(``);

  // Phase 3: JSX rules (shared with deep research)
  appendJSXRules(lines);

  lines.push(`## Output`);
  lines.push(`Write the JSX to: .focused-ui.jsx`);
  lines.push(`This should be a SINGLE file containing ONLY the function. No imports, no exports, no wrapping.`);
  lines.push(`The function signature must be: function GeneratedUI({ data, onAction })`);

  return lines.join("\n");
}

function buildRecurringAppPrompt(
  archetype: TaskArchetype,
  userMessage: string,
  hints?: Record<string, string>,
  mediaUrls?: string[],
): string {
  const lines: string[] = [];

  lines.push(`You are building a REUSABLE Enso app for a recurring task. This app will be registered in the tool system so the user can use it repeatedly.`);
  lines.push(``);
  lines.push(`## User Request: "${userMessage}"`);
  lines.push(`## Archetype: ${archetype}`);
  lines.push(``);
  lines.push(`Read the CLAUDE-REFERENCE.md in this project for the full guide on building Enso apps.`);
  lines.push(`Study the existing apps in server/apps/ (especially media_gallery/) as examples.`);
  lines.push(``);
  lines.push(`Build a complete app with:`);
  lines.push(`1. app.json — tool definitions with parameterized inputs`);
  lines.push(`2. template.jsx — interactive JSX template`);
  lines.push(`3. executors/*.js — executor function bodies`);
  lines.push(``);
  lines.push(`The app should be GENERAL-PURPOSE and PARAMETERIZED — not hardcoded for one specific use.`);
  lines.push(`Save to: server/apps/<family_name>/`);

  return lines.join("\n");
}

// ── Archetype-Specific Guidance ──

const ARCHETYPE_PHASE1: Record<string, string> = {
  data_analysis: `Data Analysis
1. Read the attached data file(s) — understand the schema, column types, row count
2. Compute summary statistics: totals, averages, min/max, distributions
3. Identify patterns: trends over time, correlations, outliers, groupings
4. Find the most interesting insights — what story does this data tell?
5. Prepare data for visualization: time series, category breakdowns, top-N rankings`,

  competitive_analysis: `Competitive Analysis
1. Research each entity/product/company the user wants compared
2. Gather key specs, pricing, reviews, market position, strengths/weaknesses
3. Search for head-to-head comparisons and expert reviews
4. Find quantitative data: benchmarks, ratings, market share, financial metrics
5. Identify differentiators: what makes each option unique?`,

  document_processing: `Document Analysis
1. Read the attached document(s) in full
2. Extract key information: dates, parties, amounts, terms, clauses
3. Identify structure: sections, hierarchy, key provisions
4. Flag important items: risks, unusual terms, obligations, deadlines
5. Summarize the document's purpose and key takeaways`,

  project_planning: `Project Planning & Analysis
1. Analyze the user's project/goal requirements
2. Research best practices, common pitfalls, realistic timelines
3. Break down into phases, milestones, and tasks
4. Estimate effort/duration for each task
5. Identify dependencies, risks, and resource requirements`,

  travel_planning: `Travel Research
1. Research the destination(s): attractions, neighborhoods, transport, weather
2. Find accommodation options with real prices and availability
3. Search for activities, restaurants, experiences with ratings and costs
4. Calculate budget breakdown: flights, hotels, food, activities, transport
5. Check practical info: visa, safety, local customs, best time to visit`,

  market_research: `Market Research
1. Identify the market/industry scope
2. Research major players: revenue, market share, positioning, recent moves
3. Find market size data, growth rates, projections
4. Identify trends: emerging technologies, regulatory changes, consumer shifts
5. Gather analyst opinions, expert forecasts, investment perspectives`,

  creative_project: `Creative Research & Direction
1. Research the creative domain: current trends, best practices, notable examples
2. Gather inspiration: reference works, styles, techniques
3. Analyze the user's creative brief/requirements
4. Develop a creative direction with options and rationale
5. Prepare content structure and asset recommendations`,

  general: `Research & Analysis
1. Analyze the user's request and identify what information is needed
2. Research the topic using web search (5-10 focused queries)
3. Read important articles/sources in full for depth
4. Gather data, statistics, examples, and expert opinions
5. Synthesize findings into actionable insights`,
};

const ARCHETYPE_PHASE2: Record<string, string> = {
  data_analysis: `Design an interactive data dashboard with:
- Stat cards showing key metrics (totals, averages, counts)
- Charts: line charts for trends, bar charts for comparisons, pie charts for distributions
- DataTable with sorting and filtering for the raw data
- Filter controls (date range, category, etc.) using Select/Input components
- Tabs for different views: Overview, Trends, Details, Insights`,

  competitive_analysis: `Design a side-by-side comparison experience with:
- Scoring matrix / radar chart comparing key dimensions
- Entity profile cards with key specs and ratings
- Pros/cons panels for each option
- Price comparison table
- A "Verdict" section with recommendation
- Tabs: Overview, Detailed Comparison, Pricing, Reviews`,

  document_processing: `Design a document analysis experience with:
- Summary card with document metadata and purpose
- Extracted data tables (key terms, dates, amounts)
- Section-by-section breakdown with highlights
- Risk/flag indicators with severity badges
- Action items or obligations checklist
- Tabs: Summary, Key Terms, Full Analysis, Risks`,

  project_planning: `Design an interactive project planner with:
- Phase timeline with milestones and duration estimates
- Task breakdown with effort estimates and dependencies
- Risk matrix with likelihood × impact scoring
- Resource requirements summary
- Progress tracking structure
- Tabs: Roadmap, Tasks, Risks, Resources`,

  travel_planning: `Design an interactive travel planner with:
- Day-by-day itinerary cards with activities, timing, costs
- Budget breakdown with category pie chart
- Accommodation options comparison table
- Must-see attractions with ratings and tips
- Packing checklist and practical info accordion
- Tabs: Itinerary, Budget, Hotels, Activities, Tips`,

  market_research: `Design a market intelligence dashboard with:
- Market overview stat cards (size, growth, key metrics)
- Player profile cards with market share and positioning
- Trend charts showing growth trajectories
- Competitive landscape visualization
- Analyst forecasts and projections
- Tabs: Market Overview, Key Players, Trends, Outlook`,

  creative_project: `Design a creative direction presentation with:
- Mood/style direction cards with rationale
- Reference gallery with examples and inspiration
- Specification breakdown (dimensions, colors, typography)
- Option comparison with pros/cons
- Action plan with next steps
- Tabs: Direction, Inspiration, Specifications, Plan`,

  general: `Analyze what interactive experience would BEST serve this specific task:
- Use Tabs for multi-view navigation (3-6 tabs)
- Use DataTable for structured data with sorting
- Use Recharts for any quantitative data visualization
- Use UICard with accents for grouped information
- Use Accordion for detailed sections
- Use Stat cards for key metrics
- Make it feel like a premium, bespoke experience`,
};

// ── Shared JSX Template Rules ──

function appendJSXRules(lines: string[]): void {
  lines.push(`## Phase 3: Write the JSX Component`);
  lines.push(``);
  lines.push(`Write a SINGLE file: \`.focused-ui.jsx\` in the project root.`);
  lines.push(``);
  lines.push(`The file must contain a function like this:`);
  lines.push("```jsx");
  lines.push(`function GeneratedUI({ data, onAction }) {`);
  lines.push(`  // Your data is embedded directly as constants here`);
  lines.push(`  var findings = [ ... ];`);
  lines.push(`  var metrics = { ... };`);
  lines.push(`  // ... all your data as JS objects/arrays`);
  lines.push(``);
  lines.push(`  // React hooks`);
  lines.push(`  var [activeTab, setActiveTab] = React.useState("overview");`);
  lines.push(`  // ... your UI state`);
  lines.push(``);
  lines.push(`  return ( /* your custom JSX */ );`);
  lines.push(`}`);
  lines.push("```");
  lines.push(``);
  lines.push(`### Available in the sandbox (no imports needed):`);
  lines.push(`- **React hooks**: React.useState, React.useEffect, React.useMemo, React.useCallback, React.useRef`);
  lines.push(`- **EnsoUI**: Tabs, DataTable, Stat, Badge, Button, UICard, Progress, Accordion, Dialog, Select, Input, Switch, Slider, Separator, EmptyState, EnsoUI.Tooltip, EnsoUI.VideoPlayer`);
  lines.push(`- **Recharts**: LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Tooltip (Recharts Tooltip — for EnsoUI tooltip use EnsoUI.Tooltip)`);
  lines.push(`- **Lucide icons**: any icon via LucideReact.IconName, e.g. Clock, Star, MapPin, Users, TrendingUp, BookOpen, DollarSign, etc.`);
  lines.push(`- **Color palette for accent colors**: emerald, blue, violet, amber, rose, cyan, orange, lime, pink, indigo, teal, fuchsia, sky`);
  lines.push(``);
  lines.push(`### Critical rules:`);
  lines.push(`1. NO imports — everything is injected into the sandbox`);
  lines.push(`2. Use \`var\` (not const/let) for all declarations`);
  lines.push(`3. ALL React hooks MUST be at the top level of the function — NEVER inside conditionals, loops, or callbacks`);
  lines.push(`4. No fetch(), no DOM access, no window/document globals`);
  lines.push(`5. Use EnsoUI.Tooltip for tooltips (not Tooltip which is Recharts)`);
  lines.push(`6. Embed your data directly as \`var\` declarations at the top of the function`);
  lines.push(`7. \`onAction(name, payload)\` for user interactions — e.g., \`onAction("open_url", { url: "https://..." })\` to open links`);
  lines.push(`8. Use Tabs component for multi-view navigation`);
  lines.push(`9. The \`data\` prop will contain \`{ archetype: "...", topic: "..." }\` — you can ignore it and use your embedded data`);
  lines.push(``);
  lines.push(`### Design quality:`);
  lines.push(`- Dark theme (dark backgrounds: #0f172a, #1e293b, #334155; light text: #e2e8f0, #f8fafc)`);
  lines.push(`- Professional typography: clear hierarchy, good spacing`);
  lines.push(`- Interactive: clickable cards, expandable sections, tab navigation`);
  lines.push(`- Rich: use icons, badges, stat cards, charts where appropriate`);
  lines.push(`- Make it feel like a premium, bespoke experience for this specific task`);
  lines.push(``);
}
