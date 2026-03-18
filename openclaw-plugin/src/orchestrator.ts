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
import {
  loadAllApps,
  registerLoadedApp,
  SHIPPED_APPS_DIR,
  generateSkillMd,
  type LoadedApp,
} from "./app-persistence.js";
import { executeToolDirect } from "./native-tools/registry.js";
import { registerCardContext } from "./outbound.js";
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

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(PLUGIN_DIR, "..", "..");
const ORCHESTRATIONS_DIR = join(
  process.env.HOME || process.env.USERPROFILE || "/tmp",
  ".openclaw",
  "enso-orchestrations",
);

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
    executionRunId?: string; // For cancellation via cancelClaudeCodeRun()
    executionSessionId?: string; // For session resume
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
Be thorough — find real data, statistics, prices, reviews, and details. Structure your findings clearly.
Write your research findings to a file so downstream agents can use them.`,

  architect: `You are an Architect Agent. Your job is to take research findings and design a structured plan, blueprint, or framework.
Consider trade-offs, organize information logically, and create a clear, actionable design.
Write your design/plan to a file so builder agents can use it.
CRITICAL: Design for REUSE — build a tool CATEGORY, not a single-use solution. If asked about "WKW photos", design a "Photo Studio" that works for any collection with any style. Always parameterize inputs. Specify 4-7 tools per app (browse, view, create, edit, search, manage patterns). Reference openclaw-plugin/apps/media_gallery/ as the gold standard.`,

  builder: `You are a Builder Agent in Enso. Your job is to build interactive Enso apps using the app framework.
Read CLAUDE-REFERENCE.md first to understand the app format (app.json + template.jsx + executors/).
Build polished, interactive apps with real functionality — not placeholder demos.
CRITICAL: Build GENERAL-PURPOSE apps, not one-off solutions. Study openclaw-plugin/apps/media_gallery/ as the gold standard (7 tools, multi-view template, fully parameterized). Aim for 4-7 tools per app. Never hardcode domain-specific data in executors. Family names should be generic categories (e.g., "photo_studio" not "wkw_photobook").`,

  coder: `You are a Coder Agent. Your job is to write code, scripts, configurations, or technical artifacts.
Write clean, well-documented code. Test your work when possible.
Save all output to files so other agents can reference them.
When writing scripts or tools, make them configurable via command-line arguments or parameters — not hardcoded to specific paths, names, or domain data. Build for reuse.`,

  reviewer: `You are a Reviewer Agent. Your job is to verify, validate, and quality-check the work of other agents.
Check for correctness, completeness, and quality. Report issues clearly.
Write your review findings to a file.`,
};

// ── Public API ──

export interface OrchestrationStartParams {
  userMessage: string;
  classification: TaskClassification;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}

/**
 * Main entry point: starts orchestration from a classified "orchestrated" message.
 *
 * Flow:
 *   1. Create orchestration record + bootstrap card
 *   2. Spawn Claude Code to analyze + plan the mission (writes .orchestration-<id>.json)
 *   3. Parse plan → send to client as orchestrationPlan
 *   4. Wait for user approval → execute via engine
 */
export async function handleOrchestration(params: OrchestrationStartParams): Promise<void> {
  const { userMessage, classification, client, account } = params;
  const orchestrationId = randomUUID();
  const runId = randomUUID();
  const terminalCardId = randomUUID();
  const bootstrapCardId = randomUUID();

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

  // Step 2: Create terminal card for the planning Claude Code session
  send({
    text: "",
    toolMeta: { toolId: "claude-code", cwd: PROJECT_ROOT },
    targetCardId: terminalCardId,
    operation: {
      operationId: runId,
      stage: "processing",
      label: "Planning mission...",
      cancellable: true,
    },
  });

  // Step 3: Build the planning prompt
  const planFilePath = join(PROJECT_ROOT, `openclaw-plugin/.orchestration-${orchestrationId}.json`);
  const planningPrompt = buildPlanningPrompt(userMessage, classification, orchestrationId, planFilePath);

  try {
    // Step 4: Run Claude Code to analyze and plan
    // Use Sonnet with thinking disabled for fast planning (~10s vs ~40s with Opus+adaptive)
    const { sessionId } = await runClaudeCode({
      prompt: planningPrompt,
      cwd: PROJECT_ROOT,
      client,
      runId,
      targetCardId: terminalCardId,
      model: "claude-sonnet-4-6",
      thinking: "disabled",
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
      status: "reviewing",
    };

    // Store in active orchestrations
    activeOrchestrations.set(orchestrationId, {
      plan,
      client,
      account,
      sharedContext: new Map(),
      bootstrapCardId,
      terminalCardId,
      aborted: false,
    });

    // Persist to disk
    persistOrchestration(orchestrationId, plan);

    logAction({
      ts: Date.now(),
      type: "action",
      category: "orchestrator",
      message: `Plan ready: ${plan.tasks.length} tasks, ${plan.agents.length} agents`,
    });

    // Step 6: Send plan to client for review
    sendFinal({
      text: `Mission planned: ${plan.tasks.length} tasks across ${plan.agents.length} agents.\n\nReview the plan and approve to begin execution.`,
      targetCardId: bootstrapCardId,
      orchestrationPlan: plan,
      orchestrationProgress: {
        orchestrationId,
        eventType: "plan_ready",
        plan,
      },
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

  // Build the single execution mega-prompt
  const executionPrompt = buildExecutionPrompt(orch.plan);

  // Wrap client.send to intercept text deltas and parse progress markers
  const originalSend = orch.client.send.bind(orch.client);
  let markerBuffer = ""; // Buffer for incomplete marker lines
  const wrappedClient: ConnectedClient = {
    ...orch.client,
    send: (msg: ServerMessage) => {
      originalSend(msg);
      // Only intercept text deltas targeting our terminal card
      if (msg.text && msg.targetCardId === orch.terminalCardId) {
        markerBuffer += msg.text;
        // Only parse COMPLETE lines (ending with \n) to avoid firing on partial markers
        const lastNewline = markerBuffer.lastIndexOf("\n");
        if (lastNewline >= 0) {
          const completedLines = markerBuffer.slice(0, lastNewline + 1);
          markerBuffer = markerBuffer.slice(lastNewline + 1);
          parseOrchestrationMarkers(completedLines, orch);
        }
        // Prevent unbounded growth
        if (markerBuffer.length > 2000) markerBuffer = markerBuffer.slice(-500);
      }
    },
  };

  // Create the execution run
  const executionRunId = randomUUID();
  orch.executionRunId = executionRunId;

  // Mark all pending tasks as ready
  updateOrchestrationProgress(orchestrationId, "task_started");

  try {
    // Run a SINGLE Claude Code session on the SAME terminal card as planning
    const { sessionId } = await runClaudeCode({
      prompt: executionPrompt,
      cwd: PROJECT_ROOT,
      client: wrappedClient,
      runId: executionRunId,
      targetCardId: orch.terminalCardId,
      skipPersist: true,
    });

    orch.executionSessionId = sessionId;

    // Check for bespoke one-off UI (.orchestration-ui.jsx)
    const bespokeUIPath = join(PROJECT_ROOT, ".orchestration-ui.jsx");
    if (existsSync(bespokeUIPath)) {
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
    cleanupOrchestrationTempFiles(orch.plan);

  } catch (err) {
    logError("orchestrator", "Execution session error", err, { orchestrationId });

    // If aborted (pause/cancel), don't mark as failed
    if (!orch.aborted) {
      orch.plan.status = "failed";
      updateOrchestrationProgress(orchestrationId, "failed", undefined,
        err instanceof Error ? err.message : String(err));
    }
  } finally {
    orch.executionRunId = undefined;
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

  // Abort the running Claude Code session
  if (orch.executionRunId) {
    cancelClaudeCodeRun(orch.executionRunId);
  }

  persistOrchestration(orchestrationId, orch.plan);

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
  const orch = activeOrchestrations.get(orchestrationId);
  if (!orch) return;

  orch.plan.status = "executing";
  orch.aborted = false;
  orch.client = client; // Update in case of reconnection
  orch.account = account;
  persistOrchestration(orchestrationId, orch.plan);

  // Build a continuation prompt that lists completed tasks and resumes
  const completedTasks = orch.plan.tasks.filter(t => t.status === "completed");
  const pendingTasks = orch.plan.tasks.filter(t => t.status === "pending" || t.status === "running");

  // Reset "running" tasks back to pending (they were interrupted)
  for (const task of orch.plan.tasks) {
    if (task.status === "running") task.status = "pending";
  }

  const resumePrompt = buildExecutionPrompt(orch.plan, completedTasks.map(t => t.taskId));

  // Snapshot app families for post-build detection
  const preExistingFamilies = new Set(APP_CATALOG.map((c) => c.appId));
  const buildStartTime = Date.now();

  // Wrap client.send for marker parsing
  const originalSend = client.send.bind(client);
  let markerBuffer = "";
  const wrappedClient: ConnectedClient = {
    ...client,
    send: (msg: ServerMessage) => {
      originalSend(msg);
      if (msg.text && msg.targetCardId === orch.terminalCardId) {
        markerBuffer += msg.text;
        const lastNewline = markerBuffer.lastIndexOf("\n");
        if (lastNewline >= 0) {
          const completedLines = markerBuffer.slice(0, lastNewline + 1);
          markerBuffer = markerBuffer.slice(lastNewline + 1);
          parseOrchestrationMarkers(completedLines, orch);
        }
        if (markerBuffer.length > 2000) markerBuffer = markerBuffer.slice(-500);
      }
    },
  };

  const executionRunId = randomUUID();
  orch.executionRunId = executionRunId;

  updateOrchestrationProgress(orchestrationId, "resumed");

  try {
    const { sessionId } = await runClaudeCode({
      prompt: resumePrompt,
      cwd: PROJECT_ROOT,
      client: wrappedClient,
      runId: executionRunId,
      targetCardId: orch.terminalCardId,
      ...(orch.executionSessionId ? { toolSessionId: orch.executionSessionId } : {}),
      skipPersist: true,
    });

    orch.executionSessionId = sessionId;

    // Check for bespoke one-off UI (.orchestration-ui.jsx)
    const bespokeUIPath = join(PROJECT_ROOT, ".orchestration-ui.jsx");
    if (existsSync(bespokeUIPath)) {
      await deliverBespokeOrchestrationUI(orch, bespokeUIPath);
    }

    try {
      await postOrchestrationRegistration(orch, preExistingFamilies, buildStartTime);
    } catch (regErr) {
      logError("orchestrator", "Post-build registration failed (non-fatal)", regErr, { orchestrationId });
    }
    finalizeOrchestration(orch);
    cleanupOrchestrationTempFiles(orch.plan);
  } catch (err) {
    if (!orch.aborted) {
      logError("orchestrator", "Resume execution error", err, { orchestrationId });
      orch.plan.status = "failed";
      updateOrchestrationProgress(orchestrationId, "failed", undefined,
        err instanceof Error ? err.message : String(err));
    }
  } finally {
    orch.executionRunId = undefined;
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

  // Abort the running Claude Code session
  if (orch.executionRunId) {
    cancelClaudeCodeRun(orch.executionRunId);
  }

  persistOrchestration(orchestrationId, orch.plan);
  activeOrchestrations.delete(orchestrationId);

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

  orch.client.send({
    id: randomUUID(),
    runId: orchestrationId,
    sessionKey: orch.client.sessionKey,
    seq: 0,
    state: "delta",
    targetCardId: orch.bootstrapCardId,
    orchestrationProgress: progress,
    timestamp: Date.now(),
  } as ServerMessage);
}

/**
 * Get the active orchestration record (used by engine).
 */
export function getActiveOrchestration(orchestrationId: string) {
  return activeOrchestrations.get(orchestrationId);
}

// ── Planning Prompt ──

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
    `## App Reusability Principle (IMPORTANT)`,
    `When the plan includes builder tasks (agentRole: "builder"):`,
    `- Builder tasks MUST create GENERAL-PURPOSE tools, not one-off solutions`,
    `- If the user asks to "process photos in WKW style", the builder should create a "Photo Studio" app that can apply various artistic styles to any photo collection — NOT a WKW-specific photobook`,
    `- The architect should design for the CATEGORY of need, not just the specific request`,
    `- All tools and executors must be parameterized — no hardcoded paths, names, or domain data`,
    `- App family names should be generic categories: "photo_studio" not "wkw_photobook", "trip_planner" not "japan_trip"`,
    `- Builder task descriptions MUST include: "Build a reusable, general-purpose [category] app with at least 4 tools"`,
    `- Study openclaw-plugin/apps/media_gallery/ as the gold standard (7 tools, parameterized, multi-view template)`,
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
    `**Bespoke one-off UI (DEFAULT):** Most tasks are one-off. The builder writes a single \`.orchestration-ui.jsx\` file with all data embedded as \`var\` declarations — no app registration, no executors. Use this for specific analyses, comparisons, plans, reports.`,
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
    parts.push(`Then study openclaw-plugin/apps/media_gallery/ as the GOLD STANDARD for reusable apps.`);
    parts.push(`It has 7 focused tools, parameterized executors, and multi-view template rendering.`);
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
    parts.push(`Write your research findings to a file at: openclaw-plugin/.orchestration-research-${task.taskId}.md`);
    parts.push(`Structure the file with clear sections and data.`);
  }

  if (task.outputType === "decision" || task.outputType === "document") {
    parts.push(``);
    parts.push(`## Output Instructions`);
    parts.push(`Write your output to a file at: openclaw-plugin/.orchestration-output-${task.taskId}.md`);
  }

  if (task.outputType === "review") {
    parts.push(``);
    parts.push(`## Output Instructions`);
    parts.push(`Write your review findings to a file at: openclaw-plugin/.orchestration-output-${task.taskId}.md`);
    parts.push(`Include: issues found, suggestions for improvement, and an overall assessment.`);
  }

  if (task.outputType === "code") {
    parts.push(``);
    parts.push(`## Output Instructions`);
    parts.push(`Write your code/scripts to appropriate files in the project.`);
    parts.push(`Also write a summary to: openclaw-plugin/.orchestration-output-${task.taskId}.md`);
  }

  return parts.join("\n");
}

// ── Execution Prompt Builder ──

/**
 * Build a mega-prompt for the single execution session.
 * Contains all tasks in dependency order with role-specific instructions.
 * If `completedTaskIds` is provided, those tasks are listed as already done
 * and execution resumes from the next pending task.
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
      parts.push(`  Output file: openclaw-plugin/.orchestration-output-${task.taskId}.md or openclaw-plugin/.orchestration-research-${task.taskId}.md`);
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
        parts.push(`- ${depId} (${dep.title}): Read openclaw-plugin/.orchestration-output-${depId}.md or openclaw-plugin/.orchestration-research-${depId}.md`);
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
      parts.push(`Then study openclaw-plugin/apps/media_gallery/ as the GOLD STANDARD for reusable apps.`);
      parts.push(``);
      parts.push(`Build a GENERAL-PURPOSE, REUSABLE Enso app:`);
      parts.push(`- Write files to: openclaw-plugin/apps/<family_name>/`);
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
      parts.push(`Write your research findings to: openclaw-plugin/.orchestration-research-${task.taskId}.md`);
      parts.push(`Structure the file with clear sections and data.`);
    }

    if (task.outputType === "decision" || task.outputType === "document") {
      parts.push(`### Output`);
      parts.push(`Write your output to: openclaw-plugin/.orchestration-output-${task.taskId}.md`);
    }

    if (task.outputType === "review") {
      parts.push(`### Output`);
      parts.push(`Write your review findings to: openclaw-plugin/.orchestration-output-${task.taskId}.md`);
      parts.push(`Include: issues found, suggestions for improvement, and an overall assessment.`);
    }

    if (task.outputType === "code") {
      parts.push(`### Output`);
      parts.push(`Write your code/scripts to appropriate files in the project.`);
      parts.push(`Also write a summary to: openclaw-plugin/.orchestration-output-${task.taskId}.md`);
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
      for (const dir of [SHIPPED_APPS_DIR, join(process.env.HOME || process.env.USERPROFILE || "", ".openclaw", "enso-apps")]) {
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
function finalizeOrchestration(orch: { plan: OrchestrationPlan; bootstrapCardId: string }): void {
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
  } else if (allDone && anyFailed) {
    // Some tasks failed but the session finished
    const completed = orch.plan.tasks.filter(t => t.status === "completed").length;
    const failed = orch.plan.tasks.filter(t => t.status === "failed").length;
    orch.plan.status = completed > 0 ? "completed" : "failed";
    updateOrchestrationProgress(orchId, completed > 0 ? "completed" : "failed");
    logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: `Orchestration finished: ${completed} completed, ${failed} failed` });
  }
  // If tasks are still pending, leave status as "executing" (shouldn't happen)
}

// ── Bespoke UI Delivery ──

/**
 * Read, compile-check, and deliver a .orchestration-ui.jsx as generatedUI on the orchestration card.
 * This is the one-off bespoke UI path — no app registration needed.
 */
async function deliverBespokeOrchestrationUI(
  orch: {
    plan: OrchestrationPlan;
    client: ConnectedClient;
    bootstrapCardId: string;
    terminalCardId: string;
    executionSessionId?: string;
  },
  filePath: string,
): Promise<void> {
  try {
    let templateJSX = readFileSync(filePath, "utf-8").trim();
    unlinkSync(filePath); // Clean up

    if (!templateJSX || templateJSX.length < 100) {
      logError("orchestrator", "Bespoke UI file too small or empty", undefined);
      return;
    }

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
function readTaskOutput(task: OrchestrationTask): string | null {
  const filePaths = [
    join(PROJECT_ROOT, `openclaw-plugin/.orchestration-research-${task.taskId}.md`),
    join(PROJECT_ROOT, `openclaw-plugin/.orchestration-output-${task.taskId}.md`),
  ];

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
function cleanupOrchestrationTempFiles(plan: OrchestrationPlan): void {
  try {
    const pluginDir = join(PROJECT_ROOT, "openclaw-plugin");
    const files = readdirSync(pluginDir);
    const orchId = plan.orchestrationId;
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
