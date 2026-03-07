/**
 * Orchestrator — Multi-agent task orchestration for Enso
 *
 * Manages the lifecycle of complex, multi-faceted goals:
 *   1. Planning phase: Claude Code decomposes goal → task DAG with agent roles
 *   2. Dashboard creation: Builds a dynamic mission dashboard app (first task)
 *   3. Execution: DAG-based execution with parallel batches
 *   4. Progress: Real-time updates to the dashboard app
 *
 * Each agent = a Claude Code session with a role-specific prompt prefix.
 * Agent communication is hub-and-spoke through shared context (not direct).
 */

import { randomUUID } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { runClaudeCode } from "./claude-code.js";
import { handleBuildAppViaClaude } from "./build-via-claude.js";
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
    aborted: boolean;
  }
>();

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
    toolMeta: { toolId: "claude-code" },
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
    const { sessionId } = await runClaudeCode({
      prompt: planningPrompt,
      cwd: PROJECT_ROOT,
      client,
      runId,
      targetCardId: terminalCardId,
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
 * Transitions plan to "executing" and starts the engine.
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

  // Import and start the execution engine
  const { executeOrchestration } = await import("./orchestrator-engine.js");
  executeOrchestration(orch.plan, orch.client, orch.account, orch.sharedContext)
    .catch((err) => {
      logError("orchestrator", "executeOrchestration unhandled error", err, { orchestrationId });
      updateOrchestrationProgress(orchestrationId, "failed", undefined,
        err instanceof Error ? err.message : String(err));
    });
}

/**
 * Pause a running orchestration (after current batch completes).
 */
export function handleOrchestrationPause(orchestrationId: string): void {
  const orch = activeOrchestrations.get(orchestrationId);
  if (!orch) return;
  orch.plan.status = "paused";
  orch.aborted = true;
  persistOrchestration(orchestrationId, orch.plan);

  logAction({
    ts: Date.now(),
    type: "action",
    category: "orchestrator",
    message: `Orchestration paused: ${orchestrationId}`,
  });
}

/**
 * Resume a paused orchestration.
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
  persistOrchestration(orchestrationId, orch.plan);

  const { executeOrchestration } = await import("./orchestrator-engine.js");
  executeOrchestration(orch.plan, client, account, orch.sharedContext)
    .catch((err) => {
      logError("orchestrator", "executeOrchestration resume error", err, { orchestrationId });
      updateOrchestrationProgress(orchestrationId, "failed", undefined,
        err instanceof Error ? err.message : String(err));
    });
}

/**
 * Cancel an orchestration entirely.
 */
export function handleOrchestrationCancel(orchestrationId: string): void {
  const orch = activeOrchestrations.get(orchestrationId);
  if (!orch) return;
  orch.plan.status = "failed";
  orch.aborted = true;
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
    `1. Analyze the goal thoroughly`,
    `2. Research the domain (use web search to understand what's needed)`,
    `3. Decompose it into a dependency graph of tasks`,
    `4. Assign agent roles to each task`,
    `5. Write the plan as a structured JSON file`,
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
