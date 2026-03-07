/**
 * Orchestrator Execution Engine — DAG-based task execution
 *
 * Traverses the orchestration task graph, executing tasks in dependency order.
 * Supports parallel execution (up to MAX_CONCURRENT agents) and approval gates.
 *
 * Each task = a Claude Code session with a role-specific prompt.
 * Results are stored in shared context and injected into dependent tasks.
 */

import { randomUUID } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync, unlinkSync, readdirSync } from "fs";
import { runClaudeCode } from "./claude-code.js";
import { handleBuildAppViaClaude } from "./build-via-claude.js";
import {
  buildAgentPrompt,
  updateOrchestrationProgress,
  getActiveOrchestration,
} from "./orchestrator.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type {
  ServerMessage,
  OrchestrationPlan,
  OrchestrationTask,
  AgentRole,
} from "./types.js";
import { logAction, logError } from "./action-log.js";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(PLUGIN_DIR, "..", "..");

/** Maximum concurrent agent sessions */
const MAX_CONCURRENT_AGENTS = 2;

// ── Main Execution Loop ──

/**
 * Execute an approved orchestration plan.
 * Processes tasks in dependency order, running parallel batches where possible.
 * Pauses at approval gates and resumes when user approves.
 */
export async function executeOrchestration(
  plan: OrchestrationPlan,
  client: ConnectedClient,
  account: ResolvedEnsoAccount,
  sharedContext: Map<string, string>,
): Promise<void> {
  plan.status = "executing";
  updateOrchestrationProgress(plan.orchestrationId, "task_started");

  logAction({
    ts: Date.now(),
    type: "action",
    category: "orchestrator-engine",
    message: `Execution started: ${plan.orchestrationId} (${plan.tasks.length} tasks)`,
  });

  try {
    while (hasReadyTasks(plan)) {
      // Check if paused/cancelled
      const orch = getActiveOrchestration(plan.orchestrationId);
      if (!orch || orch.aborted) {
        logAction({
          ts: Date.now(),
          type: "action",
          category: "orchestrator-engine",
          message: `Execution halted (paused/cancelled): ${plan.orchestrationId}`,
        });
        return;
      }

      const ready = getReadyTasks(plan);

      // Check approval gates — pause if any ready task needs approval
      const needsApproval = ready.filter(
        (t) => t.requiresApproval && t.status === "pending",
      );
      if (needsApproval.length > 0) {
        for (const task of needsApproval) {
          task.status = "awaiting_approval";
        }
        plan.status = "paused";
        updateOrchestrationProgress(
          plan.orchestrationId,
          "approval_needed",
          needsApproval[0].taskId,
        );
        logAction({
          ts: Date.now(),
          type: "action",
          category: "orchestrator-engine",
          message: `Paused for approval: ${needsApproval.map((t) => t.taskId).join(", ")}`,
        });
        return; // Will resume when user approves
      }

      // Execute batch (up to MAX_CONCURRENT)
      const batch = ready
        .filter((t) => t.status === "pending")
        .slice(0, MAX_CONCURRENT_AGENTS);

      if (batch.length === 0) break;

      // Mark batch as running
      for (const task of batch) {
        task.status = "running";
        // Assign agent
        const agent = plan.agents.find(
          (a) => a.role === task.agentRole && a.status === "idle",
        );
        if (agent) {
          agent.status = "working";
          agent.currentTaskId = task.taskId;
        }
      }

      updateOrchestrationProgress(plan.orchestrationId, "task_started");

      // Execute all tasks in the batch concurrently
      const results = await Promise.allSettled(
        batch.map((task) =>
          executeTask(plan, task, client, account, sharedContext),
        ),
      );

      // Process results
      for (let i = 0; i < batch.length; i++) {
        const task = batch[i];
        const result = results[i];

        // Free the agent — always set back to idle so it can pick up more tasks
        const agent = plan.agents.find(
          (a) => a.currentTaskId === task.taskId,
        );
        if (agent) {
          agent.status = "idle";
          agent.currentTaskId = undefined;
        }

        if (result.status === "rejected") {
          task.status = "failed";
          task.error = result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);

          // Block downstream tasks
          blockDependents(plan, task.taskId);

          updateOrchestrationProgress(
            plan.orchestrationId,
            "task_failed",
            task.taskId,
            task.error,
          );

          logError("orchestrator-engine", `Task failed: ${task.taskId}`, result.reason, {
            orchestrationId: plan.orchestrationId,
          });
        } else {
          task.status = "completed";
          task.resultSummary = result.value || "Completed successfully";

          // Store result in shared context for dependent tasks
          sharedContext.set(task.taskId, task.resultSummary);

          updateOrchestrationProgress(
            plan.orchestrationId,
            "task_completed",
            task.taskId,
          );

          logAction({
            ts: Date.now(),
            type: "action",
            category: "orchestrator-engine",
            message: `Task completed: ${task.taskId} — ${task.resultSummary.slice(0, 100)}`,
          });
        }
      }
    }

    // Check final state
    const allCompleted = plan.tasks.every(
      (t) => t.status === "completed" || t.status === "blocked",
    );
    const anyFailed = plan.tasks.some((t) => t.status === "failed");

    if (allCompleted && !anyFailed) {
      plan.status = "completed";
      // Mark all agents as completed
      for (const agent of plan.agents) {
        agent.status = "completed";
        agent.currentTaskId = undefined;
      }
      updateOrchestrationProgress(plan.orchestrationId, "completed");
      cleanupOrchestrationTempFiles(plan);
      logAction({
        ts: Date.now(),
        type: "action",
        category: "orchestrator-engine",
        message: `Orchestration completed: ${plan.orchestrationId}`,
      });
    } else if (anyFailed) {
      plan.status = "failed";
      updateOrchestrationProgress(plan.orchestrationId, "failed");
    }
  } catch (err) {
    plan.status = "failed";
    logError("orchestrator-engine", "Execution error", err, {
      orchestrationId: plan.orchestrationId,
    });
    updateOrchestrationProgress(
      plan.orchestrationId,
      "failed",
      undefined,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ── Task Execution ──

/**
 * Execute a single orchestration task.
 * Returns a summary of the result.
 */
async function executeTask(
  plan: OrchestrationPlan,
  task: OrchestrationTask,
  client: ConnectedClient,
  account: ResolvedEnsoAccount,
  sharedContext: Map<string, string>,
): Promise<string> {
  const terminalCardId = randomUUID();
  const runId = randomUUID();
  task.terminalCardId = terminalCardId;

  // Create terminal card for this agent
  client.send({
    id: randomUUID(),
    runId,
    sessionKey: client.sessionKey,
    seq: 0,
    state: "delta",
    text: "",
    toolMeta: { toolId: "claude-code" },
    targetCardId: terminalCardId,
    operation: {
      operationId: runId,
      stage: "processing",
      label: `${getRoleEmoji(task.agentRole)} ${task.title}`,
      cancellable: true,
    },
    timestamp: Date.now(),
  } as ServerMessage);

  // Gather context from completed dependencies
  const dependencyResults = gatherDependencyContext(plan, task, sharedContext);

  // Check for user messages to this task
  const userMsg = sharedContext.get(`user_msg_${task.taskId}`) || "";
  const contextWithUserMsg = dependencyResults + (userMsg ? `\n\n## User Notes\n${userMsg}` : "");

  // Build agent prompt
  const prompt = buildAgentPrompt(
    task.agentRole,
    task,
    contextWithUserMsg,
    plan.goal,
  );

  // For builder tasks that create apps, use handleBuildAppViaClaude
  if (task.outputType === "app") {
    return executeAppBuildTask(task, plan, prompt, client, account, terminalCardId, sharedContext);
  }

  // For all other tasks, use runClaudeCode directly
  const { sessionId } = await runClaudeCode({
    prompt,
    cwd: PROJECT_ROOT,
    client,
    runId,
    targetCardId: terminalCardId,
  });

  task.sessionId = sessionId;

  // Try to read the task's output file
  const resultSummary = readTaskOutput(task);
  return resultSummary || `${task.title} completed (session: ${sessionId})`;
}

/**
 * Execute a builder task that creates an Enso app.
 * Uses handleBuildAppViaClaude for the full app registration pipeline.
 *
 * Includes dependency context from upstream tasks (truncated to keep prompt manageable)
 * and post-build validation for template.jsx.
 */
async function executeAppBuildTask(
  task: OrchestrationTask,
  plan: OrchestrationPlan,
  prompt: string,
  client: ConnectedClient,
  account: ResolvedEnsoAccount,
  terminalCardId: string,
  sharedContext: Map<string, string>,
): Promise<string> {
  // Gather concise dependency context for the builder
  const depContextParts: string[] = [];
  for (const depId of task.dependsOn) {
    const dep = plan.tasks.find((t) => t.taskId === depId);
    if (!dep || dep.status !== "completed") continue;
    // Read full output but truncate to keep prompt manageable
    const fullOutput = readTaskOutput(dep);
    const summary = fullOutput
      ? fullOutput.slice(0, 3000) + (fullOutput.length > 3000 ? "\n\n[... truncated for brevity]" : "")
      : sharedContext.get(depId) || dep.resultSummary || "";
    if (summary) {
      depContextParts.push(`### ${dep.title}\n${summary}`);
    }
  }
  const dependencyContext = depContextParts.length > 0
    ? `This app is part of an orchestrated mission: "${plan.goal}"\n\n## Research & Design Context\n${depContextParts.join("\n\n")}`
    : `This app is part of an orchestrated mission: "${plan.goal}"`;

  // For app-building tasks, we use handleBuildAppViaClaude which handles
  // the full pipeline: Claude Code → detect new app → register → validate
  await handleBuildAppViaClaude({
    cardId: terminalCardId,
    cardText: `Mission: ${plan.goal}\n\nTask: ${task.description}`,
    buildAppDefinition: task.description,
    conversationContext: dependencyContext,
    client,
    account,
  });

  return `Built Enso app: ${task.title}`;
}

// ── DAG Helpers ──

/**
 * Check if there are tasks ready to run (dependencies met, not complete/failed/blocked).
 */
function hasReadyTasks(plan: OrchestrationPlan): boolean {
  return plan.tasks.some((task) => {
    if (task.status !== "pending" && task.status !== "awaiting_approval") return false;
    return task.dependsOn.every((depId) => {
      const dep = plan.tasks.find((t) => t.taskId === depId);
      return dep?.status === "completed";
    });
  });
}

/**
 * Get all tasks whose dependencies are met and are ready to execute.
 */
function getReadyTasks(plan: OrchestrationPlan): OrchestrationTask[] {
  return plan.tasks.filter((task) => {
    if (task.status !== "pending" && task.status !== "awaiting_approval") return false;
    return task.dependsOn.every((depId) => {
      const dep = plan.tasks.find((t) => t.taskId === depId);
      return dep?.status === "completed";
    });
  });
}

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
 * Gather context from completed dependency tasks.
 */
function gatherDependencyContext(
  plan: OrchestrationPlan,
  task: OrchestrationTask,
  sharedContext: Map<string, string>,
): string {
  if (task.dependsOn.length === 0) return "";

  const parts: string[] = [];
  for (const depId of task.dependsOn) {
    const dep = plan.tasks.find((t) => t.taskId === depId);
    if (!dep || dep.status !== "completed") continue;

    // Try to read the full output file first
    const fullOutput = readTaskOutput(dep);
    if (fullOutput) {
      parts.push(`### ${dep.title} (${dep.agentRole})\n${fullOutput}`);
    } else {
      // Fall back to shared context summary
      const summary = sharedContext.get(depId);
      if (summary) {
        parts.push(`### ${dep.title} (${dep.agentRole})\n${summary}`);
      }
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : "";
}

/**
 * Try to read a task's output file (research, decision, document).
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
        // Truncate to prevent overly long context
        return content.length > 5000 ? content.slice(0, 5000) + "\n\n[... truncated]" : content;
      } catch {
        // Ignore read errors
      }
    }
  }

  return null;
}

/**
 * Get emoji for agent role (for terminal card labels).
 */
function getRoleEmoji(role: AgentRole): string {
  const emojis: Record<AgentRole, string> = {
    researcher: "🔍",
    architect: "📐",
    builder: "🔨",
    coder: "💻",
    reviewer: "✅",
  };
  return emojis[role] || "🤖";
}

/**
 * Clean up temporary orchestration files after completion.
 * Removes .orchestration-*.json, .orchestration-research-*.md, .orchestration-output-*.md
 */
function cleanupOrchestrationTempFiles(plan: OrchestrationPlan): void {
  try {
    const pluginDir = join(PROJECT_ROOT, "openclaw-plugin");
    const files = readdirSync(pluginDir);
    const orchId = plan.orchestrationId;
    const taskIds = plan.tasks.map((t) => t.taskId);

    for (const file of files) {
      // Clean up plan file
      if (file === `.orchestration-${orchId}.json`) {
        try { unlinkSync(join(pluginDir, file)); } catch {}
        continue;
      }
      // Clean up research/output files for completed tasks
      for (const taskId of taskIds) {
        if (
          file === `.orchestration-research-${taskId}.md` ||
          file === `.orchestration-output-${taskId}.md`
        ) {
          try { unlinkSync(join(pluginDir, file)); } catch {}
        }
      }
    }

    logAction({
      ts: Date.now(),
      type: "action",
      category: "orchestrator-engine",
      message: `Cleaned up temp files for orchestration ${orchId}`,
    });
  } catch (err) {
    // Non-critical — don't fail on cleanup errors
    logError("orchestrator-engine", "Cleanup failed", err);
  }
}
