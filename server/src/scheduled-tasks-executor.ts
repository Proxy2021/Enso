/**
 * Scheduled Tasks Executor — handles firing scheduled tasks.
 *
 * Two execution modes:
 * 1. Prompt tasks → spawn a Claude Code session
 * 2. Tool tasks → execute via registered tool executors
 */

import { randomUUID } from "node:crypto";
import type { ScheduledTaskDef, ScheduledTaskRun } from "@shared/types.js";
import { logAction, logError } from "./action-log.js";
import { registerSession, unregisterSession } from "./session-registry.js";

// ── Types ──

// ── State ──

/** The actual ConnectedClient from server.ts — set when a real client connects */
let connectedClient: unknown = null;

/** Register the currently connected client for task delivery */
export function setScheduledTaskClient(client: unknown): void {
  connectedClient = client;
}

// ── Executor ──

export async function executeScheduledTask(task: ScheduledTaskDef): Promise<ScheduledTaskRun> {
  const runId = randomUUID();
  const firedAt = Date.now();

  logAction({ ts: firedAt, type: "action", category: "scheduled-tasks", message: `Executing task "${task.name}" (${task.action.type})` });

  // Register with session registry
  registerSession({
    sessionId: runId,
    runId,
    type: "scheduled-task",
    description: `Scheduled: ${task.name}`,
    startedAt: firedAt,
    status: "running",
    model: task.model,
  });

  try {
    if (task.action.type === "prompt") {
      return await executePromptTask(task, runId, firedAt);
    } else if (task.action.type === "tool") {
      return await executeToolTask(task, runId, firedAt);
    } else {
      throw new Error(`Unknown action type: ${(task.action as { type: string }).type}`);
    }
  } catch (err) {
    unregisterSession(runId);
    const run: ScheduledTaskRun = {
      runId,
      taskId: task.taskId,
      firedAt,
      completedAt: Date.now(),
      status: "failed",
      durationMs: Date.now() - firedAt,
      error: err instanceof Error ? err.message : String(err),
    };
    logError("scheduled-tasks", `Task "${task.name}" execution failed`, err);
    return run;
  }
}

async function executePromptTask(
  task: ScheduledTaskDef,
  runId: string,
  firedAt: number,
): Promise<ScheduledTaskRun> {
  const prompt = task.action.prompt;
  if (!prompt) {
    throw new Error("Prompt task has no prompt defined");
  }

  const hasClient = connectedClient && typeof (connectedClient as any).send === "function";
  if (!hasClient) {
    logAction({ ts: Date.now(), type: "action", category: "scheduled-tasks", message: `No client connected for task "${task.name}" — running headless` });
  }

  try {
    // Dynamically import to avoid circular deps
    const { runClaudeCode } = await import("./claude-code.js");

    const targetCardId = `sched-${task.taskId}-${Date.now()}`;
    const client = hasClient ? connectedClient : createDummyClient();

    await runClaudeCode({
      prompt: `[Scheduled Task: ${task.name}]\n\n${prompt}`,
      client: client as Parameters<typeof runClaudeCode>[0]["client"],
      runId,
      targetCardId,
      model: task.model,
      skipPersist: true,
    });

    unregisterSession(runId);

    return {
      runId,
      taskId: task.taskId,
      firedAt,
      completedAt: Date.now(),
      status: "success",
      durationMs: Date.now() - firedAt,
      resultSummary: `Claude Code session completed for: ${prompt.slice(0, 150)}`,
    };
  } catch (err) {
    unregisterSession(runId);
    throw err;
  }
}

async function executeToolTask(
  task: ScheduledTaskDef,
  runId: string,
  firedAt: number,
): Promise<ScheduledTaskRun> {
  const { toolId, params } = task.action;
  if (!toolId) throw new Error("Tool task has no toolId defined");

  try {
    // Execute tool via the native tool registry
    const { executeToolDirect } = await import("./native-tools/registry.js");
    const result = await executeToolDirect(toolId, params || {});

    if (!result.success) {
      throw new Error(result.error || "Tool execution failed");
    }

    const data = result.data as Record<string, unknown> | undefined;
    if (data && data.ok === false) {
      throw new Error(String(data.message || "Tool reported ok:false"));
    }

    unregisterSession(runId);

    return {
      runId,
      taskId: task.taskId,
      firedAt,
      completedAt: Date.now(),
      status: "success",
      durationMs: Date.now() - firedAt,
      resultSummary: (result.rawText || JSON.stringify(result.data) || "Done").slice(0, 200),
    };
  } catch (err) {
    unregisterSession(runId);
    throw err;
  }
}

/** Create a dummy ConnectedClient for headless execution (no WS delivery) */
function createDummyClient(): unknown {
  const noop = () => {};
  return {
    id: "scheduled-task-runner",
    sessionKey: "scheduled",
    ws: { send: noop, readyState: 1, close: noop, on: noop, off: noop, ping: noop },
    send: noop,  // ConnectedClient.send() — just discard
    _disconnectedBuffer: [],
    conversationId: "default",
  };
}
