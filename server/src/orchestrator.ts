/**
 * Orchestrator — Single-session multi-task orchestration for Enso
 *
 * Manages the lifecycle of complex, multi-faceted goals:
 *   1. Planning phase: Claude Code decomposes goal → task DAG with agent roles
 *   2. Review: User approves the plan
 *   3. Execution: A SINGLE Claude Code session processes all tasks sequentially
 *   4. Progress: Stream listener parses structured markers to update the card
 *
 * Key insight: execution reuses the planning session's terminal card via
 * `targetCardId`, so the user sees one continuous terminal — not N separate ones.
 * Tasks write intermediate results to files on disk; downstream tasks read those
 * files for context (no prompt bloat).
 */

import { randomUUID } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync, statSync } from "fs";
import { runClaudeCode, cancelClaudeCodeRun } from "./claude-code.js";
import { executeDAG, cancelAllRunningTasks } from "./orchestrator-engine.js";
import { createWorkspace, getWorkspace, type OrchestrationWorkspace } from "./orchestration-workspace.js";
import {
  registerOrchestration, unregisterOrchestration,
  updateOrchestrationStatus, updateOrchestrationCounts,
  type OrchestrationType,
} from "./session-registry.js";
import {
  loadAllApps,
  registerLoadedApp,
  SHIPPED_APPS_DIR,
  generateSkillMd,
  type LoadedApp,
} from "./app-persistence.js";
import type { AppEntry } from "./app-catalog.js";
import { executeToolDirect } from "./native-tools/registry.js";
import { registerCardContext } from "./outbound.js";
import { persistCard } from "./memory-bridge.js";
import { APP_CATALOG } from "./app-catalog.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type {
  ServerMessage,
  OrchestrationPlan,
  OrchestrationTask,
  OrchestrationAgent,
  OrchestrationProgress,
  OrchestrationEventType,
  AgentRole,
  EnhanceResult,
  ToolBuildSummary,
} from "./types.js";
import type { TaskClassification } from "./task-router.js";
import { logAction, logError } from "./action-log.js";
import { getEnsoPath } from "./utils/home.js";
import { GEMINI_MODEL_FAST } from "./config.js";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(PLUGIN_DIR, "..", "..");
const ORCHESTRATIONS_DIR = getEnsoPath("orchestrations");

// ── Active Orchestrations ──

const activeOrchestrations = new Map<
  string,
  {
    plan: OrchestrationPlan;
    client: ConnectedClient;
    account: ResolvedEnsoAccount;
    sharedContext: Map<string, string>; // taskId → result summary
    bootstrapCardId: string;
    terminalCardId: string; // Reused across planning + execution sessions
    aborted: boolean;
    // Multi-session parallel execution
    taskRunIds: Map<string, string>; // taskId → runId (for cancellation)
    taskSessionIds: Map<string, string>; // taskId → sessionId
    maxConcurrency: number; // default 4
    onComplete?: (orchestrationId: string, status: "completed" | "failed") => void;
    workspace?: OrchestrationWorkspace; // Managed artifact directory
    orchestrationType?: OrchestrationType; // For session registry
  }
>();

// ── Archetype-Specific Planning Guidance ──

const ORCHESTRATION_ARCHETYPE_GUIDANCE: Record<string, string> = {
  data_analysis: `This is a DATA ANALYSIS task. Structure it as:
1. researcher/coder: Read the data file(s), compute summary statistics, find patterns, outliers, and trends
2. builder: Build a bespoke interactive dashboard with charts (line/bar/pie), stat cards, DataTable with filters, and key insights
Keep it tight — 2-3 tasks. The final deliverable MUST be an interactive data dashboard, not a text summary.`,

  competitive_analysis: `This is a COMPETITIVE ANALYSIS task. Structure it as:
1. researcher: Research each entity/product/company — gather specs, pricing, reviews, market position, strengths/weaknesses
2. builder: Build a bespoke comparison dashboard with side-by-side panels, radar charts, scoring matrix, and pros/cons
Keep it tight — 2-3 tasks. The final deliverable MUST be an interactive comparison experience, not a text report.`,

  document_processing: `This is a DOCUMENT PROCESSING task. Structure it as:
1. coder: Read and parse the document(s), extract key data — dates, parties, amounts, terms, clauses, structure
2. builder: Build a bespoke document review UI with extracted data tables, section breakdown, risk flags, and summary cards
Keep it tight — 2-3 tasks. The final deliverable MUST be an interactive document analysis experience, not a text summary.`,

  project_planning: `This is a PROJECT PLANNING task. Structure it as:
1. researcher: Analyze requirements, research best practices, estimate effort, identify risks
2. builder: Build a bespoke project planner with phase timeline, task breakdown, risk matrix, and milestone tracker
Keep it tight — 2-3 tasks. The final deliverable MUST be an interactive project board, not a text plan.`,

  travel_planning: `This is a TRAVEL PLANNING task. Structure it as:
1. researcher: Find real prices, availability, weather, activities, restaurants, transport options for the destination
2. architect: Design the itinerary structure — day-by-day breakdown, budget allocation, logistics
3. builder: Build a bespoke interactive travel planner app with day tabs, budget tracker, activity cards, and booking links
The final deliverable MUST be an interactive itinerary experience, not a text report.`,

  market_research: `This is a MARKET RESEARCH task. Structure it as:
1. researcher: Gather market data — players, market size, growth rates, trends, analyst opinions, financial metrics
2. builder: Build a bespoke market intelligence dashboard with player profiles, market share charts, trend lines, and forecasts
Keep it tight — 2-3 tasks. The final deliverable MUST be an interactive dashboard, not a text report.`,

  creative_project: `This is a CREATIVE PROJECT. Structure it as:
1. researcher: Gather inspiration, reference materials, best practices, trends in the creative domain
2. architect: Develop creative direction with options, mood/style specifications, and rationale
3. builder: Build a bespoke creative presentation/management app with galleries, option comparisons, and specifications
The final deliverable MUST be an interactive creative experience, not a text brief.`,
};

// ── Role Prompts ──

const ROLE_PROMPTS: Record<AgentRole, string> = {
  researcher: `You are a Research Agent. Your job is to gather comprehensive information through web search, analysis, and synthesis.
Be thorough — find real data, statistics, prices, reviews, and details. When the task calls for resource curation (books, videos, articles, courses), find ACTUAL resources with real titles, authors, URLs, and explain why each matters. Don't just synthesize — curate the best existing resources AND create original analysis.
Write your research findings to a file so downstream agents can use them.

## Reasoning Process
Before writing your final report, draft your reasoning in an <analysis> block. Explore the evidence, weigh alternatives, and identify gaps. This block is for YOUR thinking — it will be stripped from the final output.

<analysis>
[Draft your reasoning here: what sources you found, which data conflicts, what the evidence actually supports vs what seems assumed, gaps in the data]
</analysis>

Then write your final report below.

## CRITICAL: Recommendation-First Structure
Your FIRST paragraph MUST be your recommendation or key conclusion. Do NOT start with background, methodology, or market context.
Lead with the ANSWER, then provide evidence.

<example>
Good first paragraph: "Tesla Model Y is the best value EV for families under $50K — it scores highest on range (310mi), cargo space (76 cu ft), and resale value (78% after 3 years). Confidence: High."
Bad first paragraph: "The electric vehicle market has grown 40% year-over-year. We evaluated 6 models across 12 criteria..."
<reasoning>The good example leads with the verdict and supporting evidence. The bad example starts with market context the reader doesn't need upfront.</reasoning>
</example>

## Anti-Patterns (DO NOT)
- Do NOT pad reports with generic market overviews or industry background unless specifically asked
- Do NOT present "on one hand / on the other hand" without a clear recommendation
- Do NOT cite sources without extracting specific data points (numbers, dates, names)
- Do NOT research topics the downstream agent doesn't need — stay focused on the task description

## Output Format
For analysis/comparison tasks, use this structure:
1. **Recommendation** (2-3 sentences: the verdict, the action to take. Include confidence: High/Medium/Low)
2. **Key Evidence** (3-5 bullet points supporting the recommendation, each with [IMPACT: high/medium/low])
3. **Detailed Analysis** (structured by topic — depth goes here)
4. **Comparison Matrix** (if comparison requested — table with criteria rows, option columns)
5. **Risks & Caveats** (what could invalidate the recommendation)
6. **Sources** (numbered references)

For resource curation tasks (finding books, videos, courses, tutorials, experts), organize by category. For each resource include: title, author/creator, URL if available, and a specific reason why it matters for this goal. Lead with your top 3 picks.

At the END of your report, append a structured summary block:
<!-- STRUCTURED_SUMMARY {"verdict":"...", "confidence":"high|medium|low", "keyFindings":[{"id":"F1","title":"...","impact":"high|medium|low"}], "ratings":{"relevance":N,"depth":N,"actionability":N}, "recommendations":[{"title":"...","priority":"P0|P1|P2","effort":"quick-win|medium|large"}]} -->`,

  architect: `You are an Architect Agent. Your job is to take research findings and design a structured plan, blueprint, or framework.
Consider trade-offs, organize information logically, and create a clear, actionable design.
Write your design/plan to a file so builder agents can use it.

## Reasoning Process
Before writing your final design, draft your reasoning in an <analysis> block. Consider alternatives, evaluate trade-offs, and explain WHY this design over others.

<analysis>
[Draft: what approaches you considered, trade-offs between them, why the chosen approach wins, what risks remain]
</analysis>

## CRITICAL — APP CONSOLIDATION FIRST:
Before designing ANY new app, you MUST check existing apps. If an app already covers the domain, design an EXTENSION to it (new tools, improved template), not a new app. The goal is comprehensive domain apps — "be Photoshop, not 100 separate feature apps."
- If asked about "WKW photos" and a Photo Studio app exists → extend Photo Studio with new tools
- If asked about "video highlights" and a Media Processing app exists → add highlight tools to Media Processing
- Only design a NEW app when no existing app covers the domain
Design for the CATEGORY, not the specific request. Parameterize all inputs. Specify 4-7 tools per app (browse, view, create, edit, search, manage patterns). Reference server/apps/media_gallery/ as the gold standard.

## Anti-Patterns (DO NOT)
- Do NOT produce vague recommendations like "improve performance" — specify WHAT to change, WHERE, and HOW
- Do NOT list options without making a decision — architects DECIDE, they don't present menus
- Do NOT design components in isolation — show how they connect and what data flows between them
- Do NOT ignore existing code conventions — read the codebase style before designing additions

<example>
Good: "Extend photo_studio with 3 new tools: enso_photo_studio_watermark (overlay text/image on photos, params: imagePath, text, position, opacity), enso_photo_studio_batch_resize (resize multiple images, params: directory, maxWidth, maxHeight, format), enso_photo_studio_metadata (read/edit EXIF data, params: imagePath, updates)."
Bad: "We could either build a new watermark app, or extend the photo studio, or create a general image processing tool. Each has pros and cons..."
<reasoning>Architects must commit to a decision with specific implementation details. Listing options without deciding wastes downstream agents' time.</reasoning>
</example>

## Output Format
Your report MUST include:
1. **Summary & Verdict** (decision-first: what to build and why)
2. **Architecture** (components, data flow, integration points)
3. **Trade-off Analysis** (options considered, pros/cons, and your DECISION)
4. **Implementation Plan** (ordered steps with dependencies)
5. **Risks & Mitigations**

At the END of your report, append a structured summary block:
<!-- STRUCTURED_SUMMARY {"verdict":"...", "confidence":"high|medium|low", "keyFindings":[{"id":"F1","title":"...","impact":"high|medium|low"}], "ratings":{"clarity":N,"feasibility":N,"completeness":N}, "recommendations":[{"title":"...","priority":"P0|P1|P2","effort":"quick-win|medium|large"}]} -->`,

  builder: `You are a Builder Agent in Enso. Your job is to build interactive Enso apps using the app framework.
Read CLAUDE-REFERENCE.md first to understand the app format (app.json + template.jsx + executors/).
Build polished, interactive apps with real functionality — not placeholder demos.

## CRITICAL — EXTEND EXISTING APPS FIRST:
Before creating a new app, check if an existing app covers the same domain. If so, ADD NEW TOOLS to that app and enhance its template — do NOT create a separate app. When extending:
- Read the existing app.json, template.jsx, and executors/ first
- Add new tools to the existing app.json tools array
- Add new views/tabs to the existing template.jsx
- Write new executor files alongside the existing ones
- Preserve ALL existing functionality

Only create a new app when no existing app covers the domain. Study server/apps/media_gallery/ as the gold standard (7 tools, multi-view template, fully parameterized). Aim for 4-7 tools per app. Never hardcode domain-specific data in executors. Family names should be generic categories (e.g., "photo_studio" not "wkw_photobook").

## Anti-Patterns (DO NOT)
- Do NOT create placeholder/demo executors that return fake data — every tool must do real work
- Do NOT hardcode user-specific paths, names, or content in executors — parameterize everything
- Do NOT create a new app family when extending an existing one would be better
- Do NOT use const/let in executors — always use var (sandbox restriction)
- Do NOT forget to validate your template compiles (check JSX syntax, matching tags)

## Output Format
Your summary MUST include:
1. **What Was Built** (app family name, tool count, key features)
2. **Tools Inventory** (table: tool name, description, parameters)
3. **Template Structure** (views, tabs, components used)
4. **Testing Notes** (what was verified, known limitations)

At the END of your summary, append:
<!-- STRUCTURED_SUMMARY {"verdict":"...", "toolCount":N, "keyFindings":[{"id":"F1","title":"...","impact":"high|medium|low"}], "ratings":{"functionality":N,"polish":N,"reusability":N}} -->`,

  coder: `You are a Coder Agent. Your job is to write code, scripts, configurations, or technical artifacts.
Write clean, well-tested code. Save all output to files so other agents can reference them.

## Diagnostic-First Approach
When fixing bugs or modifying existing code:
1. **Read first** — understand the existing code before changing it
2. **Reproduce** — verify the problem exists before fixing it
3. **Diagnose** — identify the root cause, not just the symptom
4. **Fix minimally** — change only what's needed
5. **Verify** — run the build/tests to confirm the fix works and doesn't break other things

Do NOT blindly retry if something fails. If a fix doesn't work, try a DIFFERENT approach.

## Anti-Patterns (DO NOT)
- Do NOT make changes without reading the surrounding code context first
- Do NOT suppress errors/warnings instead of fixing them
- Do NOT leave debug logging or commented-out code in your changes
- Do NOT hardcode paths, names, or domain data — make everything configurable
- Do NOT skip verification — always run \`npx tsc --noEmit\` after code changes

## Output Format
Your summary MUST include:
1. **Changes Made** (file-by-file: what changed and WHY)
2. **Verification** (commands run, output observed, pass/fail)
3. **Known Issues** (if any)

At the END of your summary, append:
<!-- STRUCTURED_SUMMARY {"verdict":"...", "filesChanged":N, "keyFindings":[{"id":"F1","title":"...","impact":"high|medium|low"}], "ratings":{"correctness":N,"completeness":N,"codeQuality":N}} -->`,

  reviewer: `You are an Adversarial Reviewer Agent. Your job is to RIGOROUSLY verify, validate, and quality-check the work of other agents.
You must ACTIVELY TRY TO BREAK things, not just glance at the code. Assume nothing works until you've verified it.

## Adversarial Verification Process
For each claim or change you're reviewing:
1. **Don't trust — verify.** Run the actual commands. Read the actual files. Check the actual output.
2. **Try to break it.** Think of edge cases, null inputs, missing files, wrong types.
3. **Check for rationalization.** Agents sometimes justify non-working code with plausible-sounding explanations. Verify with evidence, not arguments.

## Evidence Format (REQUIRED for each finding)
For every issue or verification, document:
- **Command run:** \`the exact command\`
- **Output observed:** \`the actual output\` (not what you expected)
- **Verdict:** PASS / FAIL / WARNING

<example>
Good review finding:
"**FAIL: Template compile error**
Command run: Read server/apps/photo_studio/template.jsx — line 47 has unclosed <div> tag
Output observed: Sucrase transform throws 'Unexpected token' at line 47
Verdict: FAIL — template won't render"

Bad review finding:
"The template looks correct and well-structured."
<reasoning>The bad review makes a subjective judgment without running any verification. The good review cites specific evidence from an actual check.</reasoning>
</example>

## Common Failure Patterns (check these specifically)
- **TypeScript errors hiding:** Run \`npx tsc --noEmit\` — don't assume the build is clean
- **Missing imports/exports:** New files that aren't imported where needed
- **Schema validation:** app.json tools with missing required fields, wrong types, or missing \`additionalProperties: false\`
- **Template runtime errors:** Null dereference, missing data guards, undefined .map() calls
- **Executor bugs:** Using const/let instead of var, import statements, accessing unavailable APIs

## Before issuing FAIL verdict
Double-check: is this a real issue or a false positive? Re-read the code in context. But if the evidence shows a real problem, DO NOT rationalize it away — issue the FAIL.

## Output Format
Your report MUST include:
1. **Verdict: PASS or FAIL** (first line, unmissable — based on evidence, not impression)
2. **Build Status** (result of \`npx tsc --noEmit\` — paste actual output)
3. **Issues Found** (table: severity, file, description, evidence)
4. **Verification Log** (command → output → verdict for each check performed)
5. **Overall Assessment** (2-3 sentences)

At the END of your report, append:
<!-- STRUCTURED_SUMMARY {"verdict":"PASS|FAIL", "buildPassed":true|false, "issueCount":N, "keyFindings":[{"id":"F1","title":"...","impact":"high|medium|low","severity":"critical|major|minor"}], "ratings":{"correctness":N,"completeness":N,"codeQuality":N}} -->`,
};

// ── Public API ──

// ── Orchestration Context (unified, adaptive) ──

export interface OrchestrationContext {
  /** What kind of orchestration? Affects planning guidance. */
  type: "evolution" | "focus" | "research" | "discovery" | "custom";
  /** The goal — what the user wants to achieve */
  goal: string;
  /** Rich context the PL should study before planning (evaluation briefing, research) */
  briefing?: string;
  /** Strategic discussion transcript */
  discussion?: string;
  /** Project info (if software-related) */
  project?: { name: string; codebasePath?: string; vision?: string; techStack?: string; brain?: string };
  /** Team agents available */
  teamAgents?: Array<{ id: string; name: string; role: string; responsibilities: string; goals: string[]; perspective: string; agentRole: string }>;
  /** Personas for testing (software projects) */
  personas?: Array<{ id: string; name: string; goals: string[]; testScenarios: string[] }>;
  /** Sprint history for continuity */
  sprintHistory?: string;
  /** Scale: light (2-4 tasks), standard (4-8), full (8-15) */
  scale?: "light" | "standard" | "full";
}

/** Build a context-driven planning prompt from OrchestrationContext */
export function buildContextDrivenPlanningPrompt(ctx: OrchestrationContext, orchestrationId: string, planFilePath: string): string {
  const scale = ctx.scale || "standard";
  const taskRange = scale === "light" ? "2-4" : scale === "full" ? "8-15" : "4-8";

  const sections: string[] = [];

  sections.push(`You are the Project Leader for this sprint. You have full authority to design the task structure, choose which agents to involve, and determine what deliverables to produce.

## Mission
${ctx.goal}`);

  // Context sections
  if (ctx.briefing) {
    sections.push(`## Evaluation Briefing\n${ctx.briefing.slice(0, 5000)}`);
  }
  if (ctx.discussion) {
    sections.push(`## Strategic Discussion (user's own words)\n${ctx.discussion.slice(0, 5000)}`);
  }
  if (ctx.project) {
    const p = ctx.project;
    sections.push(`## Project\n- **${p.name}**${p.codebasePath ? ` (${p.codebasePath})` : ""}${p.techStack ? `\n- Tech: ${p.techStack}` : ""}${p.vision ? `\n- Vision: ${p.vision}` : ""}`);
    if (p.brain) sections.push(`## Project Brain (Institutional Memory)\n${p.brain.slice(0, 4000)}`);
  }
  if (ctx.sprintHistory) {
    sections.push(`## Previous Sprints\n${ctx.sprintHistory.slice(0, 2000)}`);
  }

  // Team
  if (ctx.teamAgents?.length) {
    sections.push(`## Available Team\n${ctx.teamAgents.map(a =>
      `- **${a.name}** (${a.role}, ID: team-${a.id}, agentRole: ${a.agentRole}): ${a.perspective}\n  Goals: ${a.goals.join("; ")}`
    ).join("\n")}`);
  }
  if (ctx.personas?.length) {
    sections.push(`## Available Personas (for testing)\n${ctx.personas.map(p =>
      `- **${p.name}** (ID: persona-${p.id}): Goals: ${p.goals.slice(0, 2).join("; ")}`
    ).join("\n")}`);
  }

  // Cortex knowledge — what we already know about this topic
  const cortexCtx = getCortexPlanningContext(ctx.goal);
  if (cortexCtx) sections.push(cortexCtx);

  // Planning guidance based on type
  sections.push(`## Sprint Design Guidelines

**Type:** ${ctx.type} | **Scale:** ${scale} (${taskRange} tasks)

Available agent roles for tasks:
- **researcher**: Deep web research, analysis, finding resources and experts
- **architect**: Strategic planning, framework design, system architecture
- **builder**: Create Enso apps, tools, dashboards, interactive deliverables
- **coder**: Write/modify code, scripts, technical implementations
- **reviewer**: Quality review, synthesis, combining outputs into coherent plans

${ctx.type === "evolution" && ctx.personas?.length ? `### Software Evolution Sprint
Design a full sprint with these phases:
1. **Persona Testing** (parallel): Customer personas test the product via browser automation
2. **PL Triage**: Review persona findings, decide which team agents to involve
3. **Team Evaluation** (parallel): Selected team agents analyze from their perspective
4. **Synthesis + Design**: Merge all findings into prioritized enhancement plan
5. **Implementation**: Code changes based on the design
6. **Review**: Verify implementation quality (PASS/FAIL)
7. **Validation** (parallel): Re-test + dashboard + meta-review

Core agents (always): Architect, Engineering Manager, QA Manager
Optional agents (your choice): Marketing, Sales, AI Strategist

RULES: Bugs before features. Every bug from persona testing MUST be fixed.` :

ctx.type === "evolution" ? `### Project Evolution Sprint
Design a sprint appropriate for the project scope. Without personas, focus on:
1. **Research/Analysis** (parallel): Analyze the current state from multiple angles
2. **Design**: Synthesize findings into an improvement plan
3. **Implementation**: Execute the plan
4. **Review + Report**: Verify quality and produce sprint report` :

ctx.type === "focus" ? `### Focus Area Sprint
The user has already evaluated and discussed this focus area. Design tasks that produce whatever is MOST USEFUL for achieving this goal.

You have COMPLETE FREEDOM in what to produce. Think: "What would a world-class personal assistant with internet access prepare for someone pursuing this goal?"

**Valuable deliverable examples** (not exhaustive — use your judgment):
- Curated resource lists: real books (title, author, why it matters), YouTube videos, online courses, tutorials, articles with actual URLs
- Original research: comparisons, analysis, recommendations with real data and prices
- Interactive tools: Enso apps (planners, trackers, calculators, dashboards) — use agentRole "builder" with outputType "app"
- Technique guides, frameworks, methodologies — practical and specific
- Code implementations, architecture designs, technical blueprints (for project-type focuses)
- Gear/product recommendations with real reviews and pricing
- Location guides, travel plans, seasonal calendars, itineraries
- Expert/practitioner profiles: who to study, their key works, what makes them great

**KEY: Don't just synthesize — CURATE real resources.** The LLM has web search. USE IT to find actual book titles, real YouTube channels, specific tutorial URLs, named experts, and concrete examples. Then create original content only where gaps exist.

Each deliverable becomes a permanent Cortex entity — cross-referenceable with everything in the user's world.
Do NOT include persona testing or codebase analysis unless the focus explicitly involves software.
The last task should synthesize all outputs into a final sprint report with clear next actions.` :

ctx.type === "research" ? `### Research Sprint
Design ${taskRange} parallel research tasks covering different angles of the topic.
Final task: synthesize all research into a comprehensive briefing.` :

ctx.type === "discovery" ? `### Discovery Sprint
Design tasks for market/opportunity analysis:
1. Independent deal sourcing from multiple angles
2. Competitive analysis
3. Opportunity assessment with verdicts` :

`### Custom Sprint
Design freely based on the goal. Use your judgment on structure and team.`}

## Output Format
Write a JSON plan to: ${planFilePath}

\`\`\`json
{
  "tasks": [
    {
      "taskId": "unique-id",
      "title": "Human-readable title",
      "description": "COMPLETE task instructions. Include the agent's name, role, goals if using a team agent. Be specific about what to research, analyze, or produce.",
      "agentRole": "researcher|architect|builder|coder|reviewer",
      "dependsOn": [],
      "outputType": "research|code|app|document|decision|review"
    }
  ]
}
\`\`\`

CRITICAL: Each task's description must contain COMPLETE instructions — not just a title. The agent executing the task will ONLY see the description field.`);

  return sections.join("\n\n");
}

export interface OrchestrationStartParams {
  userMessage: string;
  classification: TaskClassification;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
  /** Override the auto-generated planning prompt (used by evolution sprints, etc.)
   *  Receives (orchestrationId, planFilePath) so it can reference the correct paths. */
  planningPromptBuilder?: (orchestrationId: string, planFilePath: string) => string;
  /** Called when the orchestration completes (all tasks done). */
  onComplete?: (orchestrationId: string, status: "completed" | "failed") => void;
  /** Max concurrent Claude Code sessions. Default 4, evolution uses 6. */
  maxConcurrency?: number;
  /** Override the model used for the planning session. Default "claude-sonnet-4-6". Use "opus" for evolution sprints. */
  planningModel?: "opus" | "sonnet";
  /** Use fast LLM planning (user's chat model) instead of Claude Code. For implicit orchestration. */
  useGeminiPlanning?: boolean;
  /** User's selected chat model ID for fast planning. */
  chatModel?: string;
  /** Skip the review/approval UX — auto-execute immediately. */
  skipApproval?: boolean;
  /** When set, reuse this card ID as the bootstrap card instead of generating a new one.
   *  Used by card evolution to show orchestration inline on the source card. */
  targetCardId?: string;
  /** Unified orchestration context — when provided, builds a context-driven planning prompt
   *  instead of using the generic or custom planningPromptBuilder. */
  context?: OrchestrationContext;
}

// ── Fast LLM Planning (for implicit orchestration) ──

const FAST_PLAN_PROMPT = `You are a task planner. Decompose the user's goal into 2-5 sequential tasks.

Available agent roles:
- researcher: Web research, data gathering, market analysis
- architect: System design, architecture decisions, technical planning
- builder: Build Enso apps with interactive UI (dashboards, tools)
- coder: Write/modify code, scripts, configurations
- reviewer: Quality review, testing, validation

Rules:
- Use 2-5 tasks maximum. Keep it lean.
- Each task must have a clear, specific description
- Use dependsOn to order tasks (task IDs of prerequisites)
- First task should have dependsOn: []
- outputType: "research" | "code" | "app" | "document" | "decision" | "review"

Respond with ONLY a JSON object (no markdown):
{"tasks":[{"taskId":"task-1","title":"...","description":"...","agentRole":"researcher","dependsOn":[],"outputType":"research"},{"taskId":"task-2","title":"...","description":"...","agentRole":"builder","dependsOn":["task-1"],"outputType":"app"}]}`;

/**
 * Generate a plan using the user's selected chat LLM (~3s) instead of Claude Code (~20s).
 * Returns null on any failure — caller should fall back to Claude Code.
 */
async function planWithLLM(params: {
  userMessage: string;
  chatModel?: string;
  account: ResolvedEnsoAccount;
}): Promise<Array<{ taskId: string; title: string; description: string; agentRole: string; dependsOn: string[]; outputType: string }> | null> {
  try {
    const prompt = `${FAST_PLAN_PROMPT}\n\nUser's goal: "${params.userMessage}"`;
    let raw: string;

    // Use unified provider system with user's chat model
    const chatModel = params.chatModel ?? GEMINI_MODEL_FAST;
    const providerKeys = { ...params.account.providerKeys };
    if (params.account.geminiApiKey) providerKeys.gemini = params.account.geminiApiKey;

    const { llm } = await import("./llm.js");
    raw = await llm({ prompt, model: chatModel, providerKeys, timeoutMs: 8_000 });

    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const tasks = parsed.tasks;

    if (!Array.isArray(tasks) || tasks.length < 2 || tasks.length > 7) return null;

    // Basic validation
    for (const t of tasks) {
      if (!t.taskId || !t.title || !t.agentRole) return null;
    }

    logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: `Fast LLM plan: ${tasks.length} tasks via ${chatModel}` });
    return tasks;
  } catch (err) {
    logError("orchestrator", "Fast LLM planning failed (falling back to Claude Code)", err);
    return null;
  }
}

/**
 * Main entry point: starts orchestration from a classified "orchestrated" message.
 *
 * Flow:
 *   1. Create orchestration record + bootstrap card
 *   2. Plan: fast LLM (~3s) or Claude Code (~20s)
 *   3. Parse plan → send to client as orchestrationPlan
 *   4. Execute via DAG engine
 */
export async function handleOrchestration(params: OrchestrationStartParams): Promise<void> {
  const { userMessage, classification, client, account } = params;
  const orchestrationId = randomUUID();
  const runId = randomUUID();
  const isInlineEvolution = !!params.targetCardId;
  const bootstrapCardId = params.targetCardId ?? randomUUID();

  // Create managed workspace for all orchestration artifacts
  const workspace = createWorkspace(orchestrationId);
  const terminalCardId = bootstrapCardId;

  logAction({
    ts: Date.now(),
    type: "action",
    category: "orchestrator",
    message: `Orchestration start: ${userMessage.slice(0, 100)}`,
  });

  const send = (msg: Partial<ServerMessage>) => {
    client.send({
      id: randomUUID(),
      runId,
      sessionKey: client.sessionKey,
      seq: 0,
      state: "delta",
      timestamp: Date.now(),
      ...msg,
    } as ServerMessage);
  };

  const sendFinal = (msg: Partial<ServerMessage>) => {
    client.send({
      id: randomUUID(),
      runId,
      sessionKey: client.sessionKey,
      seq: 0,
      state: "final",
      timestamp: Date.now(),
      ...msg,
    } as ServerMessage);
  };

  // Step 1: Send bootstrap card (shows "Assembling your team..." state)
  if (isInlineEvolution) {
    // Inline evolution: send building status to the source card (like deep research)
    sendFinal({
      targetCardId: bootstrapCardId,
      enhanceResult: {
        data: null,
        generatedUI: undefined as unknown as string,
        cardMode: { interactionMode: "tool", appId: "evolution", toolFamily: "evolution", signatureId: "card_evolution_building" },
      },
    });
  } else {
    send({
      text: `🎯 Analyzing your goal and assembling a team...\n\n> ${userMessage}`,
      cardType: "orchestration",
      targetCardId: bootstrapCardId,
      orchestrationProgress: {
        orchestrationId,
        eventType: "plan_ready" as OrchestrationEventType,
        plan: {
          orchestrationId,
          goal: userMessage,
          tasks: [],
          agents: [],
          status: "planning",
        },
      },
    });
  }

  // ── Fast LLM planning path (for implicit orchestration) ──
  if (params.useGeminiPlanning) {
    const fastTasks = await planWithLLM({ userMessage, chatModel: params.chatModel, account });
    if (fastTasks) {
      const plan: OrchestrationPlan = {
        orchestrationId,
        goal: userMessage,
        tasks: normalizeTasks(fastTasks, orchestrationId),
        agents: buildAgentRoster(fastTasks),
        status: "executing",
        contextType: params.context?.type,
      };

      const orchType: OrchestrationType = params.onComplete ? "evolution" : "orchestration";
      activeOrchestrations.set(orchestrationId, {
        plan, client, account,
        sharedContext: new Map(),
        bootstrapCardId, terminalCardId,
        aborted: false, taskRunIds: new Map(), taskSessionIds: new Map(),
        maxConcurrency: params.maxConcurrency ?? 4,
        onComplete: params.onComplete,
        workspace,
        orchestrationType: orchType,
      });
      persistOrchestration(orchestrationId, plan);
      registerOrchestration({
        orchestrationId, type: orchType, goal: userMessage, status: "executing",
        startedAt: Date.now(), taskCount: plan.tasks.length,
        completedCount: 0, failedCount: 0, runningCount: 0,
        workspaceDir: workspace.rootDir,
      });

      logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: `Fast plan ready: ${plan.tasks.length} tasks, ${plan.agents.length} agents` });

      send({
        text: `Mission planned: ${plan.tasks.length} tasks across ${plan.agents.length} agents. Executing...`,
        targetCardId: bootstrapCardId,
        orchestrationPlan: plan,
        orchestrationProgress: { orchestrationId, eventType: "plan_ready", plan },
      });

      // Persist initial orchestration card to journal
      try {
        persistCard(client.id, client.conversationId, {
          id: bootstrapCardId, runId: orchestrationId, type: "orchestration", role: "assistant",
          text: plan.goal,
          data: { orchestrationPlan: plan, orchestrationProgress: { orchestrationId, eventType: "plan_ready", plan } },
          timestamp: Date.now(),
        });
      } catch { /* best effort */ }

      handleOrchestrationApprove({ orchestrationId, client, account }).catch((err) => {
        logError("orchestrator", "Fast plan execution failed", err, { orchestrationId });
      });
      return;
    }
    // Fast planning failed — fall through to Claude Code planning
    logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: "Fast LLM planning returned null, falling back to Claude Code" });
  }

  // ── Full Claude Code planning path ──
  const planFilePath = workspace.planPath;
  const planningPrompt = params.context
    ? buildContextDrivenPlanningPrompt(params.context, orchestrationId, planFilePath)
    : params.planningPromptBuilder
    ? params.planningPromptBuilder(orchestrationId, planFilePath)
    : buildPlanningPrompt(userMessage, classification, orchestrationId, planFilePath);

  try {
    // Run Claude Code to analyze and plan
    // Use Sonnet with thinking disabled for fast planning (~10s vs ~40s with Opus+adaptive)
    const { sessionId } = await runClaudeCode({
      prompt: planningPrompt,
      cwd: PROJECT_ROOT,
      client,
      runId,
      targetCardId: terminalCardId,
      model: params.planningModel === "opus" ? "claude-opus-4-6" : "claude-sonnet-4-6",
      thinking: params.planningModel === "opus" ? "adaptive" : "disabled",
      skipPersist: true,
    });

    // Step 5: Read and parse the plan
    if (!existsSync(planFilePath)) {
      throw new Error("Planning session did not produce an orchestration plan file");
    }

    const rawPlan = readFileSync(planFilePath, "utf-8");
    const parsedPlan = JSON.parse(rawPlan);

    // Build the full OrchestrationPlan
    const plan: OrchestrationPlan = {
      orchestrationId,
      goal: userMessage,
      tasks: normalizeTasks(parsedPlan.tasks || [], orchestrationId),
      agents: buildAgentRoster(parsedPlan.tasks || []),
      status: "executing",
      contextType: params.context?.type,
    };

    // Store in active orchestrations
    const orchType2: OrchestrationType = params.onComplete ? "evolution" : "orchestration";
    activeOrchestrations.set(orchestrationId, {
      plan,
      client,
      account,
      sharedContext: new Map(),
      bootstrapCardId,
      terminalCardId,
      aborted: false,
      taskRunIds: new Map(),
      taskSessionIds: new Map(),
      maxConcurrency: params.maxConcurrency ?? 4,
      onComplete: params.onComplete,
      workspace,
      orchestrationType: orchType2,
    });

    // Persist to disk
    persistOrchestration(orchestrationId, plan);
    registerOrchestration({
      orchestrationId, type: orchType2, goal: userMessage, status: "executing",
      startedAt: Date.now(), taskCount: plan.tasks.length,
      completedCount: 0, failedCount: 0, runningCount: 0,
      workspaceDir: workspace.rootDir,
    });

    logAction({
      ts: Date.now(),
      type: "action",
      category: "orchestrator",
      message: `Plan ready (auto-executing): ${plan.tasks.length} tasks, ${plan.agents.length} agents`,
    });

    // Step 6: Send plan to client and auto-execute (no approval gate)
    send({
      text: `Mission planned: ${plan.tasks.length} tasks across ${plan.agents.length} agents. Executing...`,
      targetCardId: bootstrapCardId,
      orchestrationPlan: plan,
      orchestrationProgress: {
        orchestrationId,
        eventType: "plan_ready",
        plan,
      },
    });

    // Persist initial orchestration card to journal
    try {
      persistCard(client.id, client.conversationId, {
        id: bootstrapCardId, runId: orchestrationId, type: "orchestration", role: "assistant",
        text: plan.goal,
        data: { orchestrationPlan: plan, orchestrationProgress: { orchestrationId, eventType: "plan_ready", plan } },
        timestamp: Date.now(),
      });
    } catch { /* best effort */ }

    // Auto-execute immediately
    handleOrchestrationApprove({
      orchestrationId,
      client,
      account,
    }).catch((err) => {
      logError("orchestrator", "Auto-execution failed", err, { orchestrationId });
    });
  } catch (err) {
    logError("orchestrator", "Planning failed", err, { orchestrationId });
    sendFinal({
      text: `Orchestration planning failed: ${err instanceof Error ? err.message : String(err)}`,
      targetCardId: bootstrapCardId,
      state: "error",
    } as Partial<ServerMessage>);
  }
}

/**
 * Handle user approval of orchestration tasks.
 * Transitions plan to "executing" and starts a SINGLE Claude Code session
 * that processes all tasks sequentially in one terminal card.
 */
export async function handleOrchestrationApprove(params: {
  orchestrationId: string;
  approvedTaskIds?: string[];
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}): Promise<void> {
  const { orchestrationId, approvedTaskIds } = params;
  const orch = activeOrchestrations.get(orchestrationId);
  if (!orch) {
    logError("orchestrator", "Approve: orchestration not found", null, { orchestrationId });
    return;
  }

  // If specific tasks approved (from approval gate), mark them and clear the gate
  if (approvedTaskIds && approvedTaskIds.length > 0) {
    for (const task of orch.plan.tasks) {
      if (approvedTaskIds.includes(task.taskId) && task.status === "awaiting_approval") {
        task.status = "pending";
        task.requiresApproval = false; // Clear gate so it won't trigger again
      }
    }
    orch.plan.status = "executing"; // Resume from paused state
  } else {
    // Approve all — transition from reviewing to executing
    orch.plan.status = "executing";
    // Also clear all approval gates for approved tasks
    for (const task of orch.plan.tasks) {
      if (task.status === "awaiting_approval") {
        task.status = "pending";
        task.requiresApproval = false;
      }
    }
  }
  orch.aborted = false; // Clear paused state

  // Update client/account in case the user's WebSocket reconnected since
  // the orchestration was created (stale client → progress updates lost)
  orch.client = params.client;
  orch.account = params.account;

  logAction({
    ts: Date.now(),
    type: "action",
    category: "orchestrator",
    message: `Orchestration approved: ${orchestrationId}`,
  });

  // Snapshot pre-existing app families for post-build detection
  const preExistingFamilies = new Set(APP_CATALOG.map((c) => c.appId));
  const buildStartTime = Date.now();

  // Mark all pending tasks as ready
  updateOrchestrationProgress(orchestrationId, "task_started");

  try {
    // Execute tasks in parallel waves using the DAG executor
    await executeDAG({
      plan: orch.plan,
      orch: {
        plan: orch.plan,
        client: orch.client,
        sharedContext: orch.sharedContext,
        bootstrapCardId: orch.bootstrapCardId,
        terminalCardId: orch.terminalCardId,
        aborted: orch.aborted,
        taskRunIds: orch.taskRunIds,
        taskSessionIds: orch.taskSessionIds,
        maxConcurrency: orch.maxConcurrency,
        get onComplete() { return orch.onComplete; },
      },
      buildTaskPrompt: (task, ctx) => buildTaskPrompt(task, orch.plan, ctx, orch.workspace),
      onTaskStart: (taskId) => {
        updateOrchestrationProgress(orchestrationId, "task_started", taskId);
        const running = orch.plan.tasks.filter(t => t.status === "running").length;
        updateOrchestrationCounts(orchestrationId, { running });
      },
      onTaskDone: (taskId, summary) => {
        updateOrchestrationProgress(orchestrationId, "task_completed", taskId);
        const completed = orch.plan.tasks.filter(t => t.status === "completed").length;
        const running = orch.plan.tasks.filter(t => t.status === "running").length;
        updateOrchestrationCounts(orchestrationId, { completed, running });
      },
      onTaskFail: (taskId, error) => {
        updateOrchestrationProgress(orchestrationId, "task_failed", taskId, error);
        const failed = orch.plan.tasks.filter(t => t.status === "failed").length;
        const running = orch.plan.tasks.filter(t => t.status === "running").length;
        updateOrchestrationCounts(orchestrationId, { failed, running });
      },
      cwd: PROJECT_ROOT,
      maxConcurrency: orch.maxConcurrency,
      workspace: orch.workspace,
    });

    // Check for bespoke one-off UI — Claude Code may write as .orchestration-ui.jsx
    const bespokeUIPath = findBespokeUIFile(orchestrationId);
    if (bespokeUIPath) {
      await deliverBespokeOrchestrationUI(orch, bespokeUIPath);
    }

    // Post-session: detect and register any built apps (non-fatal)
    try {
      await postOrchestrationRegistration(orch, preExistingFamilies, buildStartTime);
    } catch (regErr) {
      logError("orchestrator", "Post-build registration failed (non-fatal)", regErr, { orchestrationId });
    }

    // Finalize: mark remaining tasks based on markers received
    finalizeOrchestration(orch);

    // Clean up temp files
    cleanupOrchestrationTempFiles(orch.plan, orch.workspace);

  } catch (err) {
    logError("orchestrator", "DAG execution error", err, { orchestrationId });

    // If aborted (pause/cancel), don't mark as failed
    if (!orch.aborted) {
      orch.plan.status = "failed";
      updateOrchestrationProgress(orchestrationId, "failed", undefined,
        err instanceof Error ? err.message : String(err));
    }
  }
}

/**
 * Pause a running orchestration — aborts the execution Claude Code session.
 */
export function handleOrchestrationPause(orchestrationId: string): void {
  const orch = activeOrchestrations.get(orchestrationId);
  if (!orch) return;
  orch.plan.status = "paused";
  orch.aborted = true;

  // Abort ALL running Claude Code sessions
  cancelAllRunningTasks(orch as any);

  persistOrchestration(orchestrationId, orch.plan);
  updateOrchestrationStatus(orchestrationId, "paused");

  logAction({
    ts: Date.now(),
    type: "action",
    category: "orchestrator",
    message: `Orchestration paused: ${orchestrationId}`,
  });
}

/**
 * Resume a paused orchestration — starts a new Claude Code session that
 * continues from where the previous one left off, listing completed tasks
 * and resuming from the next pending one.
 */
export async function handleOrchestrationResume(params: {
  orchestrationId: string;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}): Promise<void> {
  const { orchestrationId, client, account } = params;
  let orch = activeOrchestrations.get(orchestrationId);

  // Lazy recovery: if not in memory (e.g. after server restart), rebuild from disk
  if (!orch) {
    const plan = loadOrchestration(orchestrationId);
    if (!plan) {
      logError("orchestrator", "Resume: orchestration not found in memory or on disk", null, { orchestrationId });
      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey,
        seq: 0, state: "error", text: "Orchestration not found. It may have been completed or removed.",
        timestamp: Date.now(),
      } as ServerMessage);
      return;
    }

    logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: `Recovering orchestration from disk: ${orchestrationId}` });

    // Rebuild shared context from completed task output files
    const ws = getWorkspace(orchestrationId);
    const sharedContext = new Map<string, string>();
    for (const task of plan.tasks) {
      if (task.status === "completed") {
        // Try to read the task's output to rebuild context
        const output = readTaskOutput(task, ws);
        if (output) sharedContext.set(task.taskId, output.slice(0, 500));
      }
    }

    const bootstrapCardId = randomUUID();
    orch = {
      plan,
      client,
      account,
      sharedContext,
      bootstrapCardId,
      terminalCardId: bootstrapCardId,
      aborted: false,
      taskRunIds: new Map(),
      taskSessionIds: new Map(),
      maxConcurrency: 4,
      workspace: ws,
    };
    activeOrchestrations.set(orchestrationId, orch);

    // Register in session registry
    registerOrchestration({
      orchestrationId,
      type: "orchestration",
      goal: plan.goal,
      status: "resuming",
      startedAt: Date.now(),
      taskCount: plan.tasks.length,
      completedCount: plan.tasks.filter(t => t.status === "completed").length,
      failedCount: plan.tasks.filter(t => t.status === "failed").length,
      runningCount: 0,
      workspaceDir: ws?.rootDir,
    });

    // Send the plan to the frontend so it can display the orchestration card
    client.send({
      id: bootstrapCardId, runId: randomUUID(), sessionKey: client.sessionKey,
      seq: 0, state: "delta", timestamp: Date.now(),
      text: `Resuming orchestration: ${plan.goal}`,
      cardType: "orchestration",
      targetCardId: bootstrapCardId,
      orchestrationPlan: plan,
      orchestrationProgress: { orchestrationId, eventType: "resumed" as any, plan },
    } as any);
  }

  orch.plan.status = "executing";
  orch.aborted = false;
  orch.client = client; // Update in case of reconnection
  orch.account = account;
  persistOrchestration(orchestrationId, orch.plan);
  updateOrchestrationStatus(orchestrationId, "executing");

  // Reset "running" tasks back to pending (they were interrupted)
  for (const task of orch.plan.tasks) {
    if (task.status === "running") task.status = "pending";
  }

  // Snapshot app families for post-build detection
  const preExistingFamilies = new Set(APP_CATALOG.map((c) => c.appId));
  const buildStartTime = Date.now();

  updateOrchestrationProgress(orchestrationId, "resumed");

  try {
    // Re-enter DAG executor — it skips completed tasks automatically
    await executeDAG({
      plan: orch.plan,
      orch: {
        plan: orch.plan,
        client: orch.client,
        sharedContext: orch.sharedContext,
        bootstrapCardId: orch.bootstrapCardId,
        terminalCardId: orch.terminalCardId,
        aborted: orch.aborted,
        taskRunIds: orch.taskRunIds,
        taskSessionIds: orch.taskSessionIds,
        maxConcurrency: orch.maxConcurrency,
        get onComplete() { return orch.onComplete; },
      },
      buildTaskPrompt: (task, ctx) => buildTaskPrompt(task, orch.plan, ctx, orch.workspace),
      onTaskStart: (taskId) => {
        updateOrchestrationProgress(orchestrationId, "task_started", taskId);
        const running = orch.plan.tasks.filter(t => t.status === "running").length;
        updateOrchestrationCounts(orchestrationId, { running });
      },
      onTaskDone: (taskId, summary) => {
        updateOrchestrationProgress(orchestrationId, "task_completed", taskId);
        const completed = orch.plan.tasks.filter(t => t.status === "completed").length;
        const running = orch.plan.tasks.filter(t => t.status === "running").length;
        updateOrchestrationCounts(orchestrationId, { completed, running });
      },
      onTaskFail: (taskId, error) => {
        updateOrchestrationProgress(orchestrationId, "task_failed", taskId, error);
        const failed = orch.plan.tasks.filter(t => t.status === "failed").length;
        const running = orch.plan.tasks.filter(t => t.status === "running").length;
        updateOrchestrationCounts(orchestrationId, { failed, running });
      },
      cwd: PROJECT_ROOT,
      maxConcurrency: orch.maxConcurrency,
      workspace: orch.workspace,
    });

    const bespokeUIPath = findBespokeUIFile(orchestrationId);
    if (bespokeUIPath) {
      await deliverBespokeOrchestrationUI(orch, bespokeUIPath);
    }

    try {
      await postOrchestrationRegistration(orch, preExistingFamilies, buildStartTime);
    } catch (regErr) {
      logError("orchestrator", "Post-build registration failed (non-fatal)", regErr, { orchestrationId });
    }
    finalizeOrchestration(orch);
    cleanupOrchestrationTempFiles(orch.plan, orch.workspace);
  } catch (err) {
    if (!orch.aborted) {
      logError("orchestrator", "Resume execution error", err, { orchestrationId });
      orch.plan.status = "failed";
      updateOrchestrationProgress(orchestrationId, "failed", undefined,
        err instanceof Error ? err.message : String(err));
    }
  }
}

/**
 * Cancel an orchestration entirely — aborts any running session.
 */
export function handleOrchestrationCancel(orchestrationId: string): void {
  const orch = activeOrchestrations.get(orchestrationId);
  if (!orch) return;
  orch.plan.status = "failed";
  orch.aborted = true;

  // Abort ALL running Claude Code sessions
  cancelAllRunningTasks(orch as any);

  persistOrchestration(orchestrationId, orch.plan);
  activeOrchestrations.delete(orchestrationId);
  updateOrchestrationStatus(orchestrationId, "cancelled");
  unregisterOrchestration(orchestrationId);

  logAction({
    ts: Date.now(),
    type: "action",
    category: "orchestrator",
    message: `Orchestration cancelled: ${orchestrationId}`,
  });
}

/**
 * Send a message to a specific agent task (context injection).
 */
export function handleOrchestrationMessage(params: {
  orchestrationId: string;
  taskId: string;
  message: string;
}): void {
  const { orchestrationId, taskId, message } = params;
  const orch = activeOrchestrations.get(orchestrationId);
  if (!orch) return;

  // Append user message to the task's context
  const existing = orch.sharedContext.get(`user_msg_${taskId}`) || "";
  orch.sharedContext.set(`user_msg_${taskId}`, existing + "\n\nUser: " + message);
}

/**
 * Update orchestration state and notify client.
 */
export function updateOrchestrationProgress(
  orchestrationId: string,
  eventType: OrchestrationEventType,
  taskId?: string,
  error?: string,
): void {
  const orch = activeOrchestrations.get(orchestrationId);
  if (!orch) return;

  persistOrchestration(orchestrationId, orch.plan);

  const progress: OrchestrationProgress = {
    orchestrationId,
    eventType,
    plan: orch.plan,
    taskId,
    error,
  };

  const isFinal = eventType === "completed" || eventType === "failed";
  orch.client.send({
    id: randomUUID(),
    runId: orchestrationId,
    sessionKey: orch.client.sessionKey,
    seq: 0,
    state: isFinal ? "final" : "delta",
    targetCardId: orch.bootstrapCardId,
    orchestrationProgress: progress,
    timestamp: Date.now(),
  } as ServerMessage);

  // Persist orchestration card to journal on completion so it survives page reload
  if (isFinal) {
    try {
      persistCard(orch.client.id, orch.client.conversationId, {
        id: orch.bootstrapCardId,
        runId: orchestrationId,
        type: "orchestration",
        role: "assistant",
        text: `${orch.plan.goal}`,
        data: {
          orchestrationPlan: orch.plan,
          orchestrationProgress: progress,
        },
        timestamp: Date.now(),
      });
    } catch { /* never break the main flow */ }
  }
}

/**
 * Get the active orchestration record (used by engine).
 */
export function getActiveOrchestration(orchestrationId: string) {
  return activeOrchestrations.get(orchestrationId);
}

// ── App Inventory for Prompts ──

function buildAppInventoryContext(): string {
  const lines: string[] = [];
  try {
    const allApps = loadAllApps();
    if (allApps.length === 0 && APP_CATALOG.length === 0) return "";

    lines.push(`## Existing App Inventory (MUST check before creating new apps)`);
    lines.push(``);
    lines.push(`These apps already exist in the system. Before creating a new app, check if the user's need`);
    lines.push(`can be met by EXTENDING an existing app with new tools. Build comprehensive domain apps,`);
    lines.push(`not fragmented single-feature apps.`);
    lines.push(``);

    for (const entry of APP_CATALOG) {
      const loaded = allApps.find(a => a.spec.toolFamily === entry.appId);
      const toolCount = loaded ? loaded.spec.tools.length : entry.actions.length;
      lines.push(`- **${entry.appId}** (${toolCount} tools): ${entry.description}`);
    }

    for (const app of allApps) {
      if (!APP_CATALOG.some(c => c.appId === app.spec.toolFamily)) {
        lines.push(`- **${app.spec.toolFamily}** (${app.spec.tools.length} tools): ${app.spec.description}`);
      }
    }

    lines.push(``);
    lines.push(`**Rule:** If the user's request falls within an existing app's domain, the architect should`);
    lines.push(`design an EXTENSION (new tools added to that app), not a new standalone app.`);
    lines.push(`Only create a new app when no existing app covers the domain.`);
    lines.push(``);
  } catch {
    // Non-fatal — proceed without inventory
  }
  return lines.join("\n");
}

// ── Planning Prompt ──

/** Inject relevant Knowledge Cortex pages into orchestration planning for domain awareness. */
function getCortexPlanningContext(userMessage: string): string {
  try {
    const { readIndex } = require("./cortex-tools.js") as { readIndex: () => Array<{ path: string; title: string; summary: string; tags: string[] }> };
    const index = readIndex();
    if (index.length === 0) return "";
    const queryTerms = userMessage.toLowerCase().split(/\s+/).filter(t => t.length > 3).slice(0, 6);
    const relevant = index.filter(e => {
      const hay = (e.title + " " + e.summary + " " + e.tags.join(" ")).toLowerCase();
      return queryTerms.some(t => hay.includes(t));
    }).slice(0, 5);
    if (relevant.length === 0) return "";
    return `## Domain Knowledge (from Knowledge Cortex)\n${relevant.map(e => `- **${e.title}**: ${e.summary}`).join("\n")}\nUse this knowledge to inform task design and agent assignments.\n`;
  } catch { return ""; }
}

function buildPlanningPrompt(
  userMessage: string,
  classification: TaskClassification,
  orchestrationId: string,
  planFilePath: string,
): string {
  return [
    `You are the Orchestration Planner for Enso, an AI platform that builds interactive apps.`,
    ``,
    `The user has a complex goal that requires multiple agents working together.`,
    `Your job is to:`,
    `1. Analyze the goal`,
    `2. Decompose it into a dependency graph of tasks`,
    `3. Assign agent roles to each task`,
    `4. Write the plan as a structured JSON file`,
    ``,
    `Do NOT research or use web search — just plan. Research tasks will do that later.`,
    ``,
    `## User's Goal`,
    `"${userMessage}"`,
    ``,
    classification.goalSummary ? `## Initial Analysis\n${classification.goalSummary}\n` : ``,
    getCortexPlanningContext(userMessage),
    `## Agent Roles Available`,
    `- **researcher**: Gathers information via web search, analysis, synthesis`,
    `- **architect**: Designs plans, structures, frameworks from research`,
    `- **builder**: Builds interactive Enso apps (read CLAUDE-REFERENCE.md first!)`,
    `- **coder**: Writes scripts, configs, technical artifacts`,
    `- **reviewer**: Verifies and validates other agents' work`,
    ``,
    `## Task Design Rules`,
    `- Each task should be a self-contained unit of work for ONE agent`,
    `- Use \`dependsOn\` to express which tasks must complete before this one starts`,
    `- Tasks with no dependencies can run in parallel`,
    `- Research tasks should come first (they feed into design/build tasks)`,
    `- Mark critical decision points with \`requiresApproval: true\``,
    `- Builder tasks create interactive Enso apps (the main deliverable for users)`,
    `- Keep the total to 3–7 tasks (focused, not too granular)`,
    ``,
    `## App Consolidation Principle (CRITICAL)`,
    `The platform should build COMPREHENSIVE, POWERFUL domain apps — not many fragmented single-purpose ones.`,
    `Think: "Be Photoshop (one comprehensive photo tool), not 100 separate apps each doing one Photoshop feature."`,
    ``,
    `When the plan includes builder tasks (agentRole: "builder"):`,
    `1. **CHECK EXISTING APPS FIRST** — Review the app inventory below. If an existing app covers the domain, plan to EXTEND it with new tools instead of creating a new app.`,
    `2. **Design for the DOMAIN, not the request** — If the user asks to "process photos in WKW style", extend the existing Photo Studio app, don't create a "WKW photobook" app`,
    `3. **Consolidate overlapping apps** — If two apps do similar things, recommend merging them`,
    `4. **Parameterize everything** — no hardcoded paths, names, or domain data in executors`,
    `5. **Broad family names** — "photo_studio" not "portrait_retoucher", "trip_planner" not "japan_trip"`,
    `6. **Study the gold standard** — server/apps/media_gallery/ (7 tools, parameterized, multi-view template)`,
    ``,
    buildAppInventoryContext(),
    ``,
    // Inject archetype-specific planning guidance when available
    ...(classification.archetype && classification.archetype !== "general" ? [
      `## Archetype Guidance: ${classification.archetype}`,
      ORCHESTRATION_ARCHETYPE_GUIDANCE[classification.archetype as keyof typeof ORCHESTRATION_ARCHETYPE_GUIDANCE] ?? "",
      ``,
    ] : []),
    `## Output Mode: Bespoke UI vs Reusable App`,
    `The final builder task MUST produce an interactive experience. Choose the right output mode:`,
    ``,
    `**Bespoke one-off UI (DEFAULT):** Most tasks are one-off. The builder writes a single file named EXACTLY \`.orchestration-ui.jsx\` (in the current working directory) with all data embedded as \`var\` declarations — no app registration, no executors. Use this for specific analyses, comparisons, plans, reports. CRITICAL: the filename MUST be exactly \`.orchestration-ui.jsx\` — do NOT include the orchestration ID or any other prefix in the filename. The file must be under 500KB total — if the raw data is large, summarize/aggregate it before embedding.`,
    ``,
    `## NULL SAFETY — CRITICAL`,
    `ALL generated JSX MUST be defensively coded. Data values may be undefined/null.`,
    `- NEVER call .toUpperCase(), .toLowerCase(), .trim(), .split(), .map(), .filter(), .length on a value without guarding: (val || "").toUpperCase(), (arr || []).map(), (str ?? "").split()`,
    `- ALWAYS use optional chaining: item?.category?.toUpperCase() NOT item.category.toUpperCase()`,
    `- ALWAYS provide fallbacks for display: {item.name || "Unknown"}, {item.count ?? 0}`,
    `- NEVER assume array items have all fields — use ?. and ?? throughout`,
    `- Tabs render function pattern: <Tabs tabs={[...]}>{(tab) => tab === "x" ? <A/> : <B/>}</Tabs>`,
    `Examples: "Compare Tesla vs Rivian", "Plan a Tokyo trip", "Analyze Q3 sales data"`,
    ``,
    `**Reusable registered app:** ONLY when the user's goal clearly implies REPEATED future use. The builder creates a full app (app.json + template.jsx + executors/) registered in the tool system. Use this when the user says things like "build me a tool", "I need this every week", "track my X", "whenever I get a new invoice".`,
    `Examples: "Build an expense tracker", "Create a weekly standup tool", "Make a portfolio monitor"`,
    ``,
    `In the task description for the builder, explicitly state which mode to use.`,
    ``,
    `## Output Format`,
    `Write a JSON file to: ${planFilePath}`,
    ``,
    `The JSON must have this structure:`,
    `{`,
    `  "tasks": [`,
    `    {`,
    `      "taskId": "research-1",`,
    `      "title": "Research [topic]",`,
    `      "description": "Detailed description of what to research/build/design",`,
    `      "agentRole": "researcher",`,
    `      "dependsOn": [],`,
    `      "outputType": "research",`,
    `      "requiresApproval": false`,
    `    },`,
    `    {`,
    `      "taskId": "design-1",`,
    `      "title": "Design [thing]",`,
    `      "description": "...",`,
    `      "agentRole": "architect",`,
    `      "dependsOn": ["research-1"],`,
    `      "outputType": "decision",`,
    `      "requiresApproval": true`,
    `    },`,
    `    {`,
    `      "taskId": "build-app-1",`,
    `      "title": "Build [App Name]",`,
    `      "description": "Build an interactive Enso app that...",`,
    `      "agentRole": "builder",`,
    `      "dependsOn": ["design-1"],`,
    `      "outputType": "app"`,
    `    }`,
    `  ]`,
    `}`,
    ``,
    `## Important`,
    `- Write ONLY the JSON file. Do not explain or describe your reasoning.`,
    `- The file must be valid JSON.`,
    `- Task IDs should be descriptive kebab-case (e.g., "research-destinations", "build-itinerary-app").`,
    `- Descriptions should be detailed enough for another AI agent to execute independently.`,
    `- For builder tasks, include specific features, data sources, and UI requirements in the description.`,
    `- Think about what information each task needs from its dependencies.`,
  ].join("\n");
}

// ── Helpers ──

/**
 * Normalize raw tasks from the plan file into proper OrchestrationTask objects.
 */
function normalizeTasks(rawTasks: unknown[], orchestrationId: string): OrchestrationTask[] {
  return (rawTasks as Array<Record<string, unknown>>).map((raw, i) => ({
    taskId: (raw.taskId as string) || `task-${i + 1}`,
    title: (raw.title as string) || `Task ${i + 1}`,
    description: (raw.description as string) || "",
    agentRole: (raw.agentRole as AgentRole) || "coder",
    dependsOn: (raw.dependsOn as string[]) || [],
    outputType: (raw.outputType as OrchestrationTask["outputType"]) || "code",
    status: "pending" as const,
    requiresApproval: (raw.requiresApproval as boolean) || false,
  }));
}

/**
 * Build the agent roster from the task list.
 * Creates one agent per unique role, plus extra builders if needed.
 */
function buildAgentRoster(rawTasks: Array<Record<string, unknown>>): OrchestrationAgent[] {
  const roleCounts = new Map<AgentRole, number>();
  for (const task of rawTasks) {
    const role = (task.agentRole as AgentRole) || "coder";
    roleCounts.set(role, (roleCounts.get(role) || 0) + 1);
  }

  const agents: OrchestrationAgent[] = [];
  for (const [role, count] of roleCounts) {
    // Create at most 2 agents per role (for parallelism)
    const agentCount = Math.min(count, 2);
    for (let i = 0; i < agentCount; i++) {
      agents.push({
        agentId: `${role}-${i + 1}`,
        role,
        status: "idle",
      });
    }
  }

  return agents;
}

/**
 * Build the full prompt for an agent executing a specific task.
 */
export function buildAgentPrompt(
  role: AgentRole,
  task: OrchestrationTask,
  dependencyResults: string,
  userGoal: string,
): string {
  const parts = [
    `## Your Role: ${role.charAt(0).toUpperCase() + role.slice(1)} Agent`,
    ROLE_PROMPTS[role],
    ``,
    `## Mission Context`,
    `The user's overall goal: "${userGoal}"`,
    ``,
  ];

  if (dependencyResults) {
    parts.push(`## Context from Previous Tasks`);
    parts.push(dependencyResults);
    parts.push(``);
  }

  parts.push(`## Your Task: ${task.title}`);
  parts.push(task.description);

  if (task.outputType === "app") {
    parts.push(``);
    parts.push(`## App Building Instructions`);
    parts.push(`First, read the file CLAUDE-REFERENCE.md to understand Enso's app format.`);
    parts.push(`Then study server/apps/media_gallery/ as the GOLD STANDARD for reusable apps.`);
    parts.push(`It has 7 focused tools, parameterized executors, and multi-view template rendering.`);
    parts.push(``);
    parts.push(`### STEP 0: Check Existing Apps (MANDATORY)`);
    parts.push(`List server/apps/ to see what already exists. If an app covers this domain, EXTEND it.`);
    parts.push(`Only create a new app if no existing app covers the domain.`);
    parts.push(`The goal: comprehensive domain apps, not fragmented single-feature apps.`);
    parts.push(``);
    parts.push(`Build a GENERAL-PURPOSE, REUSABLE Enso app:`);
    parts.push(`- Family name must be a generic category (e.g., "photo_studio" not "wkw_photobook")`);
    parts.push(`- Aim for 4-7 tools (browse, view, create, edit, search, manage patterns)`);
    parts.push(`- Every executor must be parameterized — no hardcoded paths or domain data`);
    parts.push(`- Template must use data.tool branching for polymorphic views`);
    parts.push(`- The app must have: app.json, template.jsx, and executors/ directory with .js files`);
    parts.push(``);
    parts.push(`If the task description mentions specific data (e.g., "WKW photos" or "photos at ~/Desktop/"),`);
    parts.push(`treat that as a TEST CASE, not the app's sole purpose. The app should work for ANY similar data.`);
  }

  if (task.outputType === "research") {
    parts.push(``);
    parts.push(`## Output Instructions`);
    parts.push(`Write your research findings to a file at: server/.orchestration-research-${task.taskId}.md`);
    parts.push(`Structure the file with clear sections and data.`);
  }

  if (task.outputType === "decision" || task.outputType === "document") {
    parts.push(``);
    parts.push(`## Output Instructions`);
    parts.push(`Write your output to a file at: server/.orchestration-output-${task.taskId}.md`);
  }

  if (task.outputType === "review") {
    parts.push(``);
    parts.push(`## Output Instructions`);
    parts.push(`Write your review findings to a file at: server/.orchestration-output-${task.taskId}.md`);
    parts.push(`Include: issues found, suggestions for improvement, and an overall assessment.`);
  }

  if (task.outputType === "code") {
    parts.push(``);
    parts.push(`## Output Instructions`);
    parts.push(`Write your code/scripts to appropriate files in the project.`);
    parts.push(`Also write a summary to: server/.orchestration-output-${task.taskId}.md`);
  }

  return parts.join("\n");
}

// ── Per-Task Prompt Builder (for parallel DAG executor) ──

/**
 * Build a focused prompt for a single task's Claude Code session.
 * Each task gets its own session with role context, dependency outputs, and output instructions.
 */
function buildTaskPrompt(
  task: OrchestrationTask,
  plan: OrchestrationPlan,
  completedContext: Map<string, string>,
  workspace?: OrchestrationWorkspace,
): string {
  const parts: string[] = [
    `You are a ${task.agentRole.charAt(0).toUpperCase() + task.agentRole.slice(1)} Agent working on a larger orchestrated goal.`,
    ``,
    ROLE_PROMPTS[task.agentRole],
    ``,
    `## Overall Goal: "${plan.goal}"`,
    ``,
    `## SAFETY RULES (violating these CRASHES the sprint)`,
    `- NEVER modify package.json, package-lock.json, or any lock files`,
    `- NEVER bump version numbers (version/versionCode)`,
    `- NEVER restart, stop, or kill any server/gateway process`,
    `- NEVER run restart scripts (restart.ps1, restart.sh)`,
    `- NEVER use Stop-Process, taskkill, kill, pkill on any process`,
    `- NEVER run npm install, npm update, npx cap sync`,
    `- NEVER push to git (git push) or create git commits (git commit)`,
    `- NEVER run destructive git operations (git reset, git checkout --)`,
    ``,
    `## Diagram Generation`,
    `When the task involves architecture, flows, processes, or relationships, generate Mermaid diagrams using \`\`\`mermaid code blocks.`,
    `Supported types: flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, mindmap, timeline.`,
    `Do NOT include CSS styling directives in Mermaid blocks.`,
    ``,
    `## Rating Rubric (use for ALL numerical ratings 1-10)`,
    `- 1-3: Non-functional / critical failures / fundamentally broken`,
    `- 4-5: Functional with significant gaps / barely usable`,
    `- 6-7: Adequate / works but has notable room for improvement`,
    `- 8-9: Strong / polished / minor issues only`,
    `- 10: Exceptional / best-in-class / no meaningful improvements possible`,
    ``,
  ];

  // Dependency context — structured blocks for each completed task
  if (task.dependsOn.length > 0) {
    parts.push(`## Context from Completed Tasks`);
    parts.push(`Each dependency's result is summarized below. Read the full output file for details.`);
    parts.push(``);
    for (const depId of task.dependsOn) {
      const dep = plan.tasks.find(t => t.taskId === depId);
      const summary = completedContext.get(depId) || "Completed";
      const depOutputPath = workspace ? workspace.taskOutputPath(depId) : `server/.orchestration-output-${depId}.md`;
      const depResearchPath = workspace ? workspace.taskResearchPath(depId) : `server/.orchestration-research-${depId}.md`;
      parts.push(`<completed-task id="${depId}" role="${dep?.agentRole || "unknown"}" title="${dep?.title || depId}">`);
      parts.push(`Summary: ${summary}`);
      parts.push(`Full output: ${depOutputPath} or ${depResearchPath}`);
      parts.push(`</completed-task>`);
      parts.push(``);
    }
  }

  // Task instructions
  parts.push(`## Your Task: ${task.title}`);
  parts.push(task.description);
  parts.push(``);

  // Focus sprint: open-ended deliverable guidance
  if (plan.contextType === "focus") {
    parts.push(`## Deliverable Guidance`);
    parts.push(`Your output will be stored in the user's Knowledge Cortex as a permanent, cross-referenceable resource. Produce whatever format best serves the goal — curated resource lists with real URLs, original research, frameworks, guides, apps, or any combination. When referencing external resources (books, videos, articles, courses), include real titles, authors, URLs, and explain WHY each resource matters for this specific goal.`);
    parts.push(``);
  }

  // Output instructions based on type
  if (task.outputType === "app") {
    parts.push(`## App Building Instructions`);
    parts.push(`First, read the file CLAUDE-REFERENCE.md to understand Enso's app format.`);
    parts.push(`Then study server/apps/media_gallery/ as the GOLD STANDARD for reusable apps.`);
    parts.push(``);
    parts.push(`### STEP 0: Check Existing Apps (MANDATORY)`);
    parts.push(`Before creating anything new, list the contents of server/apps/ to see what already exists.`);
    parts.push(`If an app already covers this domain, EXTEND it by adding new tools and template views.`);
    parts.push(`Only create a new app if no existing app covers the domain.`);
    parts.push(``);
    parts.push(`### When Extending an Existing App:`);
    parts.push(`- Read the existing app.json, template.jsx, and all executors/ files`);
    parts.push(`- Add new tool entries to the existing app.json tools array`);
    parts.push(`- Add new views/tabs to the existing template.jsx (preserve existing views)`);
    parts.push(`- Write new executor files alongside existing ones`);
    parts.push(`- Update the app description to reflect the expanded capabilities`);
    parts.push(``);
    parts.push(`### When Creating a New App:`);
    parts.push(`- Write files to: server/apps/<family_name>/`);
    parts.push(`- Family name must be a generic DOMAIN category, not a specific feature`);
    parts.push(`- Aim for 4-7 tools, every executor parameterized`);
    parts.push(`- Template must use data.tool branching for polymorphic views`);
    parts.push(`- Required files: app.json, template.jsx, executors/<suffix>.js`);
    parts.push(`- Use var (not const/let) in executors, no imports`);
    parts.push(`- Tabs uses RENDER FUNCTION: <Tabs tabs={[...]}>{(tab) => ...}</Tabs>`);
    parts.push(`- DO NOT restart the server`);
    parts.push(``);
  }

  // Output path resolution — workspace when available, legacy fallback
  const taskOutputFile = workspace ? workspace.taskOutputPath(task.taskId) : `server/.orchestration-output-${task.taskId}.md`;
  const taskResearchFile = workspace ? workspace.taskResearchPath(task.taskId) : `server/.orchestration-research-${task.taskId}.md`;

  if (task.outputType === "research") {
    parts.push(`## Output`);
    parts.push(`Write your research findings to: ${taskResearchFile}`);
    parts.push(`Structure the file with clear sections and data.`);
  }

  if (task.outputType === "decision" || task.outputType === "document") {
    parts.push(`## Output`);
    parts.push(`Write your output to: ${taskOutputFile}`);
  }

  if (task.outputType === "review") {
    parts.push(`## Output`);
    parts.push(`Write your review findings to: ${taskOutputFile}`);
    parts.push(`Include: issues found, suggestions for improvement, and an overall assessment.`);
  }

  if (task.outputType === "code") {
    parts.push(`## Output`);
    parts.push(`Write your code/scripts to appropriate files in the project.`);
    parts.push(`Also write a summary to: ${taskOutputFile}`);
  }

  // Structured summary block requirement
  parts.push(`## Structured Summary Block (REQUIRED)`);
  parts.push(`At the VERY END of your output file, append a machine-readable summary block.`);
  parts.push(`Format: <!-- STRUCTURED_SUMMARY {JSON} -->`);
  parts.push(`The JSON must include at minimum: "verdict" (string) and "keyFindings" (array).`);
  parts.push(`This enables automated cross-sprint comparison and downstream agent context.`);
  parts.push(``);

  // Bespoke UI instructions for builder tasks
  const isBespokeBuilder = task.agentRole === "builder" && task.outputType !== "app";
  if (isBespokeBuilder) {
    parts.push(`## Bespoke UI Instructions`);
    const dashboardFile = workspace ? workspace.dashboardPath : `.orchestration-ui.jsx`;
    parts.push(`Write a single interactive JSX file to EXACTLY: ${dashboardFile}`);
    parts.push(`Embed all data as \`var\` declarations. Use EnsoUI components, Recharts, Lucide icons.`);
    parts.push(`NULL SAFETY: use optional chaining (?.) and fallbacks (??, ||) everywhere.`);
    parts.push(`Tabs: <Tabs tabs={[...]}>{(tab) => tab === "a" ? <A/> : <B/>}</Tabs>`);
  }

  parts.push(``);
  parts.push(`Begin now. Focus entirely on this task.`);

  return parts.join("\n");
}

// ── Legacy Execution Prompt Builder (kept for reference) ──

/**
 * Build a mega-prompt for the single execution session.
 * Contains all tasks in dependency order with role-specific instructions.
 * If `completedTaskIds` is provided, those tasks are listed as already done
 * and execution resumes from the next pending task.
 * @deprecated Use buildTaskPrompt() with executeDAG() for parallel execution
 */
function buildExecutionPrompt(plan: OrchestrationPlan, completedTaskIds?: string[]): string {
  const completed = new Set(completedTaskIds || []);

  // Topological sort of tasks by dependency order
  const sorted = topologicalSort(plan.tasks);
  const pendingTasks = sorted.filter(t => !completed.has(t.taskId) && t.status !== "blocked" && t.status !== "failed");
  const totalTasks = pendingTasks.length;

  const parts: string[] = [
    `You are the Orchestration Executor for Enso, an AI platform that builds interactive apps.`,
    `Execute ${totalTasks} tasks sequentially. Each task has a specific role and instructions.`,
    ``,
    `## Goal: "${plan.goal}"`,
    ``,
    `## GLOBAL SAFETY RULES (apply to ALL tasks — violating these CRASHES the sprint)`,
    `- NEVER modify package.json, package-lock.json, or any lock files`,
    `- NEVER bump version numbers (version/versionCode) — versioning is handled by the release process`,
    `- NEVER restart, stop, or kill any server/gateway process`,
    `- NEVER run restart scripts (restart.ps1, restart.sh)`,
    `- NEVER use Stop-Process, taskkill, kill, pkill on any process`,
    `- NEVER run npm install, npm update, npx cap sync`,
    `- NEVER push to git (git push) or create git commits (git commit)`,
    `- NEVER run destructive git operations (git reset, git checkout --)`,
    `These rules exist because the orchestration runs INSIDE the gateway process. Killing it kills the sprint.`,
    ``,
    `## Diagram Generation`,
    `When a task involves architecture, flows, processes, or relationships, generate Mermaid diagrams using \`\`\`mermaid code blocks.`,
    `Supported types: flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, mindmap, timeline.`,
    `Do NOT include CSS styling directives in Mermaid blocks.`,
    ``,
    `## Progress Markers (CRITICAL — you MUST emit these exactly as shown)`,
    `Before starting each task, print this exact line:`,
    `>>>TASK_START:{taskId}:{title}`,
    ``,
    `After completing each task successfully, print:`,
    `>>>TASK_DONE:{taskId}:{one-line summary of what was accomplished}`,
    ``,
    `If a task fails, print:`,
    `>>>TASK_FAIL:{taskId}:{brief error description}`,
    ``,
    `When ALL tasks are done, print:`,
    `>>>ORCHESTRATION_COMPLETE`,
    ``,
    `These markers are parsed by the system to update the progress UI.`,
    `They must be on their own line with no extra spaces or formatting.`,
    ``,
  ];

  // List completed tasks for context
  if (completed.size > 0) {
    parts.push(`## Already Completed Tasks`);
    parts.push(`The following tasks were completed in a previous session. Read their output files for context.`);
    for (const task of sorted) {
      if (!completed.has(task.taskId)) continue;
      const summary = plan.tasks.find(t => t.taskId === task.taskId)?.resultSummary || "Completed";
      parts.push(`- ✅ ${task.taskId}: ${task.title} — ${summary}`);
      parts.push(`  Output file: server/.orchestration-output-${task.taskId}.md or server/.orchestration-research-${task.taskId}.md`);
    }
    parts.push(``);
  }

  // Emit each pending task with full instructions
  let taskNum = 0;
  for (const task of pendingTasks) {
    taskNum++;
    parts.push(`---`);
    parts.push(`## Task ${taskNum}/${totalTasks}: ${task.taskId} — ${task.title}`);
    parts.push(`Role: ${task.agentRole}`);
    parts.push(``);

    // Role prompt
    parts.push(ROLE_PROMPTS[task.agentRole]);
    parts.push(``);

    // Dependencies
    if (task.dependsOn.length > 0) {
      parts.push(`### Dependencies`);
      parts.push(`This task depends on output from previous tasks. Read these files for context:`);
      for (const depId of task.dependsOn) {
        const dep = plan.tasks.find(t => t.taskId === depId);
        if (!dep) continue;
        parts.push(`- ${depId} (${dep.title}): Read server/.orchestration-output-${depId}.md or server/.orchestration-research-${depId}.md`);
      }
      parts.push(``);
    }

    // Task description
    parts.push(`### Instructions`);
    parts.push(task.description);
    parts.push(``);

    // Output instructions based on type
    if (task.outputType === "app") {
      parts.push(`### App Building Instructions`);
      parts.push(`First, read the file CLAUDE-REFERENCE.md to understand Enso's app format.`);
      parts.push(`Then study server/apps/media_gallery/ as the GOLD STANDARD for reusable apps.`);
      parts.push(``);
      parts.push(`### STEP 0: Check Existing Apps (MANDATORY)`);
      parts.push(`List server/apps/ to see what already exists. If an app covers this domain, EXTEND it.`);
      parts.push(`Only create a new app if no existing app covers the domain.`);
      parts.push(``);
      parts.push(`Build a GENERAL-PURPOSE, REUSABLE Enso app:`);
      parts.push(`- Write files to: server/apps/<family_name>/`);
      parts.push(`- Family name must be a generic category (e.g., "photo_studio" not "wkw_photobook")`);
      parts.push(`- Aim for 4-7 tools (browse, view, create, edit, search, manage patterns)`);
      parts.push(`- Every executor must be parameterized — no hardcoded paths or domain data`);
      parts.push(`- Template must use data.tool branching for polymorphic views`);
      parts.push(`- Required files: app.json, template.jsx, executors/<suffix>.js`);
      parts.push(`- Write template.jsx FIRST, then app.json, then executors`);
      parts.push(`- Use var (not const/let) in executors, no imports`);
      parts.push(`- Use EnsoUI.Tooltip (not Tooltip which conflicts with Recharts)`);
      parts.push(`- Tabs uses a RENDER FUNCTION: <Tabs tabs={[{value:"a",label:"A"},{value:"b",label:"B"}]} defaultValue="a" variant="underline">{(tab) => tab === "a" ? <ViewA /> : <ViewB />}</Tabs>`);
      parts.push(`- DO NOT restart the server — the system auto-detects new apps`);
      parts.push(``);
      parts.push(`If the task description mentions specific data, treat it as a TEST CASE, not the app's sole purpose.`);
    }

    if (task.outputType === "research") {
      parts.push(`### Output`);
      parts.push(`Write your research findings to: server/.orchestration-research-${task.taskId}.md`);
      parts.push(`Structure the file with clear sections and data.`);
    }

    if (task.outputType === "decision" || task.outputType === "document") {
      parts.push(`### Output`);
      parts.push(`Write your output to: server/.orchestration-output-${task.taskId}.md`);
    }

    if (task.outputType === "review") {
      parts.push(`### Output`);
      parts.push(`Write your review findings to: server/.orchestration-output-${task.taskId}.md`);
      parts.push(`Include: issues found, suggestions for improvement, and an overall assessment.`);
    }

    if (task.outputType === "code") {
      parts.push(`### Output`);
      parts.push(`Write your code/scripts to appropriate files in the project.`);
      parts.push(`Also write a summary to: server/.orchestration-output-${task.taskId}.md`);
    }

    parts.push(``);
  }

  parts.push(`---`);
  parts.push(`## Execution Rules`);
  parts.push(`1. Execute tasks IN ORDER — do not skip ahead or parallelize`);
  parts.push(`2. ALWAYS emit >>>TASK_START before beginning each task`);
  parts.push(`3. ALWAYS emit >>>TASK_DONE or >>>TASK_FAIL after each task`);
  parts.push(`4. Read dependency output files before starting dependent tasks`);
  parts.push(`5. If a task fails, still attempt subsequent tasks that don't depend on it`);
  parts.push(`6. After ALL tasks, emit >>>ORCHESTRATION_COMPLETE`);
  parts.push(`7. For builder tasks, ensure all app files are valid before marking done`);
  parts.push(``);
  parts.push(`Begin now. Start with the first task.`);

  return parts.join("\n");
}

/**
 * Topological sort of tasks by dependency order.
 * Tasks with no dependencies come first.
 */
function topologicalSort(tasks: OrchestrationTask[]): OrchestrationTask[] {
  const sorted: OrchestrationTask[] = [];
  const visited = new Set<string>();
  const taskMap = new Map(tasks.map(t => [t.taskId, t]));

  function visit(task: OrchestrationTask) {
    if (visited.has(task.taskId)) return;
    visited.add(task.taskId);
    for (const depId of task.dependsOn) {
      const dep = taskMap.get(depId);
      if (dep) visit(dep);
    }
    sorted.push(task);
  }

  for (const task of tasks) visit(task);
  return sorted;
}

// ── Stream Marker Parser ──

/**
 * Parse structured progress markers from Claude Code output.
 * Markers are emitted on their own line:
 *   >>>TASK_START:{taskId}:{title}
 *   >>>TASK_DONE:{taskId}:{summary}
 *   >>>TASK_FAIL:{taskId}:{error}
 *   >>>ORCHESTRATION_COMPLETE
 */
function parseOrchestrationMarkers(
  text: string,
  orch: {
    plan: OrchestrationPlan;
    sharedContext: Map<string, string>;
    bootstrapCardId: string;
  },
): void {
  const lines = text.split("\n");
  const orchId = orch.plan.orchestrationId;

  for (const line of lines) {
    const trimmed = line.trim();

    // >>>TASK_START:{taskId}:{title}
    const startMatch = trimmed.match(/^>>>TASK_START:([^:]+):(.+)$/);
    if (startMatch) {
      const taskId = startMatch[1];
      const task = orch.plan.tasks.find(t => t.taskId === taskId);
      if (task && task.status !== "completed") {
        task.status = "running";
        updateOrchestrationProgress(orchId, "task_started", taskId);
        logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: `Task started: ${taskId} — ${startMatch[2]}` });
      }
      continue;
    }

    // >>>TASK_DONE:{taskId}:{summary}
    const doneMatch = trimmed.match(/^>>>TASK_DONE:([^:]+):(.+)$/);
    if (doneMatch) {
      const taskId = doneMatch[1];
      const summary = doneMatch[2];
      const task = orch.plan.tasks.find(t => t.taskId === taskId);
      if (task) {
        task.status = "completed";
        task.resultSummary = summary;
        orch.sharedContext.set(taskId, summary);
        updateOrchestrationProgress(orchId, "task_completed", taskId);
        logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: `Task completed: ${taskId} — ${summary.slice(0, 100)}` });
      }
      continue;
    }

    // >>>TASK_FAIL:{taskId}:{error}
    const failMatch = trimmed.match(/^>>>TASK_FAIL:([^:]+):(.+)$/);
    if (failMatch) {
      const taskId = failMatch[1];
      const error = failMatch[2];
      const task = orch.plan.tasks.find(t => t.taskId === taskId);
      if (task) {
        task.status = "failed";
        task.error = error;
        blockDependents(orch.plan, taskId);
        updateOrchestrationProgress(orchId, "task_failed", taskId, error);
        logError("orchestrator", `Task failed: ${taskId}`, null, { error });
      }
      continue;
    }

    // >>>ORCHESTRATION_COMPLETE
    if (trimmed === ">>>ORCHESTRATION_COMPLETE") {
      // Don't set plan status here — finalizeOrchestration will handle it
      logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: `Orchestration complete marker received` });
      continue;
    }
  }
}

// ── Post-Build Registration ──

/**
 * After the execution session completes, detect any newly built apps
 * and register them. Mirrors logic from build-via-claude.ts.
 */
async function postOrchestrationRegistration(
  orch: {
    plan: OrchestrationPlan;
    client: ConnectedClient;
    account: ResolvedEnsoAccount;
    bootstrapCardId: string;
  },
  preExistingFamilies: Set<string>,
  buildStartTime: number,
): Promise<void> {
  // Only run if there were builder tasks
  const appTasks = orch.plan.tasks.filter(t => t.outputType === "app" && t.status === "completed");
  if (appTasks.length === 0) return;

  logAction({ ts: Date.now(), type: "build", category: "orchestrator", message: `Post-build: scanning for ${appTasks.length} new app(s)...` });

  let allApps: LoadedApp[];
  try {
    allApps = loadAllApps();
  } catch (err) {
    logError("orchestrator", "Post-build app scan failed", err);
    return;
  }

  // Find newly created apps (family not in pre-existing set)
  let freshApps = allApps.filter(a => !preExistingFamilies.has(a.spec.toolFamily));

  // Also check for modified existing apps (file mtime after build start)
  if (freshApps.length === 0) {
    for (const app of allApps) {
      for (const dir of [SHIPPED_APPS_DIR, getEnsoPath("apps")]) {
        const manifestPath = join(dir, app.spec.toolFamily, "app.json");
        try {
          const stat = statSync(manifestPath);
          if (stat.mtimeMs >= buildStartTime) {
            freshApps.push(app);
            break;
          }
        } catch {
          // Not in this directory
        }
      }
    }
  }

  if (freshApps.length === 0) {
    logAction({ ts: Date.now(), type: "build", category: "orchestrator", message: "No new apps detected after orchestration." });
    return;
  }

  const send = (msg: Partial<ServerMessage>) => {
    orch.client.send({
      id: randomUUID(),
      runId: orch.plan.orchestrationId,
      sessionKey: orch.client.sessionKey,
      seq: 0,
      timestamp: Date.now(),
      ...msg,
    } as ServerMessage);
  };

  // Register each new app
  for (const app of freshApps) {
    const spec = app.spec;
    logAction({ ts: Date.now(), type: "build", category: "orchestrator", message: `Registering new app: ${spec.toolFamily} (${spec.tools.length} tools)` });

    try {
      registerLoadedApp(app);
    } catch (err) {
      logError("orchestrator", `App registration failed: ${spec.toolFamily}`, err);
      continue;
    }

    // Generate SKILL.md if missing
    try {
      const skillPath = join(SHIPPED_APPS_DIR, spec.toolFamily, "SKILL.md");
      if (!existsSync(skillPath)) {
        const appTask = appTasks.find(t => t.resultSummary?.toLowerCase().includes(spec.toolFamily));
        const skillMd = generateSkillMd(spec, appTask?.description || spec.description);
        writeFileSync(skillPath, skillMd);
      }
    } catch {
      // Non-fatal
    }

    // Execute primary tool to get initial data
    const primaryDef = spec.tools.find((t: any) => t.isPrimary) ?? spec.tools[0];
    const primaryToolName = `${spec.toolPrefix}${primaryDef.suffix}`;
    let data: unknown = primaryDef.sampleData;

    try {
      const result = await executeToolDirect(primaryToolName, primaryDef.sampleParams);
      if (result.success && result.data != null) {
        data = result.data;
      }
    } catch {
      // Fall back to sampleData
    }

    // Register card context using a new card ID for each app
    const appCardId = randomUUID();
    registerCardContext(appCardId, {
      cardId: appCardId,
      originalPrompt: spec.description,
      originalResponse: `Built by orchestration: ${orch.plan.goal}`,
      currentData: data,
      geminiApiKey: orch.account.geminiApiKey,
      account: orch.account,
      mode: orch.account.mode,
      actionHistory: [],
      appToolHint: {
        toolName: primaryToolName,
        params: primaryDef.sampleParams,
        handlerPrefix: spec.toolPrefix,
      },
      interactionMode: "tool",
      toolFamily: spec.toolFamily,
      signatureId: spec.signatureId,
      coverageStatus: "covered",
    });

    // Build summary
    const registeredToolNames = spec.tools.map((t: any) => `${spec.toolPrefix}${t.suffix}`);
    const buildSummary: ToolBuildSummary = {
      toolFamily: spec.toolFamily,
      toolNames: registeredToolNames,
      description: spec.description,
      scenario: orch.plan.goal,
      actions: spec.tools.map((t: any) => t.suffix),
      steps: [
        { label: "Orchestration build", status: "passed" },
        { label: "App registration", status: "passed" },
      ],
      persisted: true,
      skillGenerated: true,
    };

    // Send enhanceResult to create an app card
    const enhanceResult: EnhanceResult = {
      data,
      generatedUI: app.templateJSX,
      cardMode: {
        interactionMode: "tool",
        toolFamily: spec.toolFamily,
        signatureId: spec.signatureId,
        coverageStatus: "covered",
      },
      buildSummary,
    };

    send({
      state: "final",
      targetCardId: appCardId,
      enhanceResult,
    });

    logAction({ ts: Date.now(), type: "build", category: "orchestrator", message: `App "${spec.toolFamily}" registered (${registeredToolNames.length} tools)` });
  }
}

// ── Finalization ──

/**
 * Finalize orchestration after the execution session completes.
 * Checks task statuses and sets the final plan status.
 */
function finalizeOrchestration(orch: { plan: OrchestrationPlan; bootstrapCardId: string; onComplete?: (orchestrationId: string, status: "completed" | "failed") => void }): void {
  const orchId = orch.plan.orchestrationId;

  // Mark any "running" tasks that weren't explicitly completed as failed
  for (const task of orch.plan.tasks) {
    if (task.status === "running") {
      task.status = "failed";
      task.error = "Session ended before task completed";
      blockDependents(orch.plan, task.taskId);
    }
  }

  const allDone = orch.plan.tasks.every(t =>
    t.status === "completed" || t.status === "blocked" || t.status === "failed",
  );
  const anyFailed = orch.plan.tasks.some(t => t.status === "failed");

  if (allDone && !anyFailed) {
    orch.plan.status = "completed";
    updateOrchestrationProgress(orchId, "completed");
    logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: `Orchestration completed: ${orchId}` });
    updateOrchestrationStatus(orchId, "completed");
    try { orch.onComplete?.(orchId, "completed"); } catch { /* best effort */ }
    sendOrchestrationCompletionEmail(orch.plan, "completed").catch(() => {});
    unregisterOrchestration(orchId);
  } else if (allDone && anyFailed) {
    // Some tasks failed but the session finished
    const completed = orch.plan.tasks.filter(t => t.status === "completed").length;
    const failed = orch.plan.tasks.filter(t => t.status === "failed").length;
    const status = completed > 0 ? "completed" : "failed";
    orch.plan.status = status;
    updateOrchestrationProgress(orchId, status);
    logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: `Orchestration finished: ${completed} completed, ${failed} failed` });
    updateOrchestrationStatus(orchId, status);
    try { orch.onComplete?.(orchId, status as "completed" | "failed"); } catch { /* best effort */ }
    sendOrchestrationCompletionEmail(orch.plan, status as "completed" | "failed").catch(() => {});
    unregisterOrchestration(orchId);
  }
  // If tasks are still pending, leave status as "executing" (shouldn't happen)
}

// ── Bespoke UI Delivery ──

/**
 * Read, compile-check, and deliver a .orchestration-ui.jsx as generatedUI on the orchestration card.
 * This is the one-off bespoke UI path — no app registration needed.
 */
/**
 * Search for bespoke orchestration UI file across multiple patterns and locations.
 * Claude Code may write it as .orchestration-ui.jsx, or with the ID in the name.
 */
function findBespokeUIFile(orchestrationId: string): string | undefined {
  // Check workspace first (preferred path)
  const ws = getWorkspace(orchestrationId);
  if (ws && existsSync(ws.dashboardPath)) return ws.dashboardPath;

  // Legacy: exact filename candidates in project root
  const exactCandidates = [
    join(PROJECT_ROOT, ".orchestration-ui.jsx"),
    join(PROJECT_ROOT, "server", ".orchestration-ui.jsx"),
    join(PLUGIN_DIR, "..", ".orchestration-ui.jsx"),
  ];
  const exact = exactCandidates.find(p => existsSync(p));
  if (exact) return exact;

  // Legacy: ID-based filename patterns — Claude sometimes includes the ID
  const searchDirs = [PROJECT_ROOT, join(PROJECT_ROOT, "server"), join(PLUGIN_DIR, "..")];
  for (const dir of searchDirs) {
    try {
      const files = readdirSync(dir);
      const match = files.find(f =>
        f.includes("orchestration") && f.endsWith("-ui.jsx") && f.startsWith(".")
      );
      if (match) return join(dir, match);
    } catch { /* dir not readable */ }
  }
  return undefined;
}

async function deliverBespokeOrchestrationUI(
  orch: {
    plan: OrchestrationPlan;
    client: ConnectedClient;
    bootstrapCardId: string;
    terminalCardId: string;
    executionSessionId?: string;
    onComplete?: (orchestrationId: string, status: "completed" | "failed") => void;
  },
  filePath: string,
): Promise<void> {
  try {
    let templateJSX = readFileSync(filePath, "utf-8").trim();
    // If onComplete is set (e.g., evolution sprint), keep the file for archiving
    if (!orch.onComplete) {
      unlinkSync(filePath); // Clean up
    }

    if (!templateJSX || templateJSX.length < 100) {
      logError("orchestrator", "Bespoke UI file too small or empty", undefined);
      return;
    }

    // Cap at 500KB — larger files will crash the sandbox
    const MAX_BESPOKE_SIZE = 500_000;
    if (templateJSX.length > MAX_BESPOKE_SIZE) {
      logAction({ ts: Date.now(), type: "build", category: "orchestrator", message: `Bespoke UI too large (${(templateJSX.length / 1024).toFixed(0)}KB > 500KB limit), skipping` });
      return;
    }

    // Strip import statements — sandbox doesn't support them
    templateJSX = templateJSX
      .replace(/^\s*import\s+.*?['";]\s*$/gm, "// [import stripped]")
      .replace(/^\s*import\s*\{[^}]*\}\s*from\s*['"].*?['"];?\s*$/gm, "// [import stripped]")
      .replace(/^\s*import\s+\*\s+as\s+\w+\s+from\s+['"].*?['"];?\s*$/gm, "// [import stripped]");

    // Compile-check with Sucrase
    try {
      const { transform } = await import("sucrase");
      transform(templateJSX, { transforms: ["jsx"], jsxRuntime: "classic" });
      logAction({ ts: Date.now(), type: "build", category: "orchestrator", message: `Bespoke orchestration UI compile check: OK (${templateJSX.length} chars)` });
    } catch (compileErr) {
      logAction({ ts: Date.now(), type: "build", category: "orchestrator", message: "Bespoke UI compile error, attempting auto-fix" });

      if (orch.executionSessionId) {
        writeFileSync(filePath, templateJSX);
        const fixPrompt = [
          "The .orchestration-ui.jsx you just created has a compile error:",
          "```",
          String(compileErr),
          "```",
          "Fix the file. Common issues: unclosed JSX tags, invalid expressions, missing parentheses.",
          "Remember: no imports allowed. All hooks at top level. Use EnsoUI.Tooltip (not Tooltip). Use var (not const/let).",
        ].join("\n");

        try {
          const { runClaudeCode: runCC } = await import("./claude-code.js");
          await runCC({
            prompt: fixPrompt,
            cwd: PROJECT_ROOT,
            toolSessionId: orch.executionSessionId,
            client: orch.client,
            runId: randomUUID(),
            targetCardId: orch.terminalCardId,
            skipPersist: true,
          });

          if (existsSync(filePath)) {
            templateJSX = readFileSync(filePath, "utf-8").trim();
            unlinkSync(filePath);
            const { transform } = await import("sucrase");
            transform(templateJSX, { transforms: ["jsx"], jsxRuntime: "classic" });
            logAction({ ts: Date.now(), type: "build", category: "orchestrator", message: "Bespoke UI auto-fix: OK" });
          } else {
            return;
          }
        } catch (fixErr) {
          logError("orchestrator", "Bespoke UI auto-fix failed", fixErr);
          try { unlinkSync(filePath); } catch { /* ignore */ }
          return;
        }
      } else {
        return;
      }
    }

    // Deliver as generatedUI on the bootstrap card
    orch.client.send({
      id: randomUUID(),
      runId: randomUUID(),
      sessionKey: orch.client.sessionKey,
      seq: 0,
      timestamp: Date.now(),
      state: "final",
      targetCardId: orch.bootstrapCardId,
      enhanceResult: {
        data: { tool: "orchestration_bespoke", phase: "complete" },
        generatedUI: templateJSX,
        cardMode: { appId: "archetype", toolFamily: "archetype", signatureId: "focused_archetype_custom" },
      },
    } as ServerMessage);

    logAction({ ts: Date.now(), type: "build", category: "orchestrator", message: `Bespoke orchestration UI delivered (${templateJSX.length} chars)` });
  } catch (err) {
    logError("orchestrator", "Failed to deliver bespoke orchestration UI", err);
  }
}

// ── DAG Utilities (moved from orchestrator-engine.ts) ──

/**
 * Mark all tasks that depend on a failed task as "blocked".
 */
function blockDependents(plan: OrchestrationPlan, failedTaskId: string): void {
  for (const task of plan.tasks) {
    if (task.status === "pending" && task.dependsOn.includes(failedTaskId)) {
      task.status = "blocked";
      // Recursively block downstream
      blockDependents(plan, task.taskId);
    }
  }
}

/**
 * Read a task's output file (research, decision, document).
 */
function readTaskOutput(task: OrchestrationTask, workspace?: OrchestrationWorkspace): string | null {
  const filePaths: string[] = [];
  // Workspace paths (preferred)
  if (workspace) {
    filePaths.push(workspace.taskResearchPath(task.taskId));
    filePaths.push(workspace.taskOutputPath(task.taskId));
  }
  // Legacy paths (fallback)
  filePaths.push(join(PROJECT_ROOT, `server/.orchestration-research-${task.taskId}.md`));
  filePaths.push(join(PROJECT_ROOT, `server/.orchestration-output-${task.taskId}.md`));

  for (const fp of filePaths) {
    if (existsSync(fp)) {
      try {
        const content = readFileSync(fp, "utf-8");
        return content.length > 5000 ? content.slice(0, 5000) + "\n\n[... truncated]" : content;
      } catch {
        // Ignore read errors
      }
    }
  }
  return null;
}

/**
 * Clean up temporary orchestration files after completion.
 */
function cleanupOrchestrationTempFiles(plan: OrchestrationPlan, workspace?: OrchestrationWorkspace): void {
  try {
    const orchId = plan.orchestrationId;

    // If workspace exists and this is NOT an evolution sprint (which archives first), clean it up
    if (workspace) {
      workspace.cleanup();
      logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: `Cleaned up workspace for orchestration ${orchId}` });
      return;
    }

    // Legacy cleanup: scan server/ directory for scattered files
    const pluginDir = join(PROJECT_ROOT, "server");
    const files = readdirSync(pluginDir);
    const taskIds = plan.tasks.map(t => t.taskId);

    for (const file of files) {
      if (file === `.orchestration-${orchId}.json`) {
        try { unlinkSync(join(pluginDir, file)); } catch {}
        continue;
      }
      for (const taskId of taskIds) {
        if (
          file === `.orchestration-research-${taskId}.md` ||
          file === `.orchestration-output-${taskId}.md`
        ) {
          try { unlinkSync(join(pluginDir, file)); } catch {}
        }
      }
    }

    logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: `Cleaned up temp files for orchestration ${orchId}` });
  } catch (err) {
    logError("orchestrator", "Cleanup failed", err);
  }
}

// ── Persistence ──

function persistOrchestration(orchestrationId: string, plan: OrchestrationPlan): void {
  try {
    if (!existsSync(ORCHESTRATIONS_DIR)) {
      mkdirSync(ORCHESTRATIONS_DIR, { recursive: true });
    }
    const filePath = join(ORCHESTRATIONS_DIR, `${orchestrationId}.json`);
    writeFileSync(filePath, JSON.stringify(plan, null, 2));
  } catch (err) {
    logError("orchestrator", "Persistence failed", err, { orchestrationId });
  }
}

export function loadOrchestration(orchestrationId: string): OrchestrationPlan | null {
  try {
    const filePath = join(ORCHESTRATIONS_DIR, `${orchestrationId}.json`);
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

// ── Completion Email Notification ──

async function sendOrchestrationCompletionEmail(plan: OrchestrationPlan, status: "completed" | "failed"): Promise<void> {
  // Skip generic email for focus-type orchestrations — deliverSprintResults() sends a better one
  if (plan.contextType === "focus") return;

  try {
    const { registerPage, getNotifyEmail } = await import("./shareable-pages.js");
    type PageSection = import("./shareable-pages.js").PageSection;
    const notifyTo = getNotifyEmail();
    if (!notifyTo) return;

    const completed = plan.tasks.filter(t => t.status === "completed");
    const failed = plan.tasks.filter(t => t.status === "failed");
    const totalTasks = plan.tasks.length;
    const statusLabel = status === "completed" ? "Completed" : "Failed";
    const statusIcon = status === "completed" ? "✓" : "✗";

    // Build structured page sections from task data
    const sections: PageSection[] = [];

    // Stats
    sections.push({
      type: "stats",
      items: [
        { label: "Total Tasks", value: String(totalTasks), icon: "📋" },
        { label: "Completed", value: String(completed.length), icon: "✅" },
        ...(failed.length > 0 ? [{ label: "Failed", value: String(failed.length), icon: "❌" }] : []),
      ],
    });

    // Goal
    sections.push({ type: "text", title: "🎯 Sprint Goal", content: plan.goal, style: "blockquote" as const });

    // Task results
    const taskItems = plan.tasks.map(t => {
      const sr = (t as unknown as Record<string, unknown>).structuredResult as Record<string, unknown> | undefined;
      const icon = t.status === "completed" ? "✅" : t.status === "failed" ? "❌" : "⏳";
      const verdict = sr?.verdict ? ` [${sr.verdict}]` : "";
      return {
        text: `${icon} ${t.title}${verdict}`,
        detail: t.resultSummary?.slice(0, 200) || undefined,
      };
    });
    sections.push({ type: "list", title: "📊 Task Results", items: taskItems });

    // Key findings across all tasks
    const allFindings = plan.tasks
      .flatMap(t => {
        const sr = (t as unknown as Record<string, unknown>).structuredResult as Record<string, unknown> | undefined;
        return ((sr?.keyFindings || []) as Array<{ title: string; detail?: string }>).slice(0, 2);
      })
      .slice(0, 8);
    if (allFindings.length > 0) {
      sections.push({
        type: "list", title: "🔑 Key Findings",
        items: allFindings.map(f => ({ text: f.title, detail: f.detail })),
      });
    }

    // Recommendations
    const allRecs = plan.tasks
      .flatMap(t => {
        const sr = (t as unknown as Record<string, unknown>).structuredResult as Record<string, unknown> | undefined;
        return ((sr?.recommendations || []) as Array<{ title: string; detail?: string }>).slice(0, 2);
      })
      .slice(0, 6);
    if (allRecs.length > 0) {
      sections.push({
        type: "list", title: "📌 Recommendations",
        items: allRecs.map(r => ({ text: r.title, detail: r.detail })),
      });
    }

    // Deploy action for successful sprints
    const baseUrl = process.env.ENSO_TUNNEL_URL || `https://${process.env.ENSO_MACHINE_NAME || "pc1"}.enso.net`;
    const actions = status === "completed"
      ? [{ label: "🚀 Deploy Sprint Changes", url: `${baseUrl}/api/trigger/deploy`, style: "success" as const }]
      : [];

    const pageId = `sprint-${plan.orchestrationId}`;
    const { shortUrl } = registerPage({
      id: pageId,
      title: `${statusIcon} Sprint ${statusLabel}`,
      subtitle: `${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · ${completed.length}/${totalTasks} tasks`,
      badge: { label: status === "completed" ? "Sprint Complete" : "Sprint Failed", color: status === "completed" ? "#059669" : "#dc2626" },
      sections,
      actions,
      footer: `Enso AI · Sprint Report · ${plan.orchestrationId}`,
      meta: { description: plan.goal.slice(0, 200) },
    }, baseUrl);

    // Send email with page link
    const { sendHtmlEmail } = await import("./email.js");
    const emailHtml = `<div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0f0f23;color:#e2e8f0;border-radius:12px;overflow:hidden">
<div style="padding:24px;text-align:center;background:linear-gradient(135deg,${status === "completed" ? "#064e3b,#059669" : "#7f1d1d,#dc2626"})">
<h1 style="color:white;font-size:22px;margin:0 0 4px">${statusIcon} Sprint ${statusLabel}</h1>
<p style="color:rgba(255,255,255,0.8);font-size:13px;margin:4px 0">${completed.length}/${totalTasks} tasks · ${new Date().toLocaleDateString()}</p>
</div>
<div style="padding:16px 24px">
<p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0 0 16px">${plan.goal.slice(0, 300)}</p>
<div style="text-align:center">
<a href="${shortUrl}" style="display:inline-block;background:#7c3aed;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">View Sprint Report →</a>
</div>
</div>
<div style="padding:12px 24px;text-align:center;border-top:1px solid #2a2a4a">
<p style="color:#475569;font-size:11px;margin:0">Enso AI · ${plan.orchestrationId}</p>
</div></div>`;

    await sendHtmlEmail({
      to: notifyTo,
      subject: `${statusIcon} Sprint ${statusLabel}: ${plan.goal.slice(0, 60)}`,
      html: emailHtml,
    });

    logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: `Sprint page shared via email for ${plan.orchestrationId}` });
  } catch (err) {
    logError("orchestrator", "Failed to send completion email", err);
  }
}
