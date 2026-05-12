/**
 * Scheduled Tasks — cron-based task scheduler for Enso.
 *
 * Provides durable, file-persisted scheduled tasks that survive server restarts.
 * Tasks can execute chat prompts (via Claude Code) or run registered tools directly.
 *
 * Adapted from Claude Code's cronScheduler patterns.
 *
 * Storage: ~/.enso/scheduled-tasks/tasks.json + runs/<taskId>.jsonl
 */

import { Cron } from "croner";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ScheduledTaskDef, ScheduledTaskRun } from "@shared/types.js";
import { logAction, logError } from "./action-log.js";
import { isToolRegistered } from "./native-tools/registry.js";

// ── Constants ──

const MAX_CONSECUTIVE_FAILURES = 3;
const CHECK_INTERVAL_MS = 15_000; // 15 second check loop
const MAX_CONCURRENT = 2;
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_RUN_LOG_ENTRIES = 100;
const TASK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const BASE_DIR = join(homedir(), ".enso", "scheduled-tasks");
const TASKS_FILE = join(BASE_DIR, "tasks.json");
const RUNS_DIR = join(BASE_DIR, "runs");

// ── State ──

let tasks: ScheduledTaskDef[] = [];
let checkInterval: ReturnType<typeof setInterval> | null = null;
const inFlight = new Set<string>(); // taskIds currently executing
const inFlightStartTimes = new Map<string, number>(); // taskId → start timestamp for timeout detection
let fireCallback: ((task: ScheduledTaskDef) => Promise<ScheduledTaskRun>) | null = null;
let broadcastCallback: ((msg: Partial<import("@shared/types.js").ServerMessage>) => void) | null = null;
let taskEventCallback: ((type: string, task: ScheduledTaskDef, run: ScheduledTaskRun) => void) | null = null;

// ── Persistence ──

function ensureDirs(): void {
  if (!existsSync(BASE_DIR)) mkdirSync(BASE_DIR, { recursive: true });
  if (!existsSync(RUNS_DIR)) mkdirSync(RUNS_DIR, { recursive: true });
}

function loadTasks(): void {
  ensureDirs();
  if (!existsSync(TASKS_FILE)) {
    tasks = [];
    return;
  }
  try {
    const raw = readFileSync(TASKS_FILE, "utf-8");
    tasks = JSON.parse(raw);
    // Recompute nextFireAt for all enabled tasks
    for (const t of tasks) {
      if (t.enabled) {
        t.nextFireAt = computeNextFire(t);
      }
    }
    logAction({ ts: Date.now(), type: "system", category: "scheduled-tasks", message: `Loaded ${tasks.length} scheduled tasks` });
  } catch (err) {
    logError("scheduled-tasks", "Failed to load tasks", err);
    tasks = [];
  }
}

function persistTasks(): void {
  ensureDirs();
  const tmpFile = TASKS_FILE + ".tmp";
  try {
    writeFileSync(tmpFile, JSON.stringify(tasks, null, 2), "utf-8");
    // Backup existing file
    if (existsSync(TASKS_FILE)) {
      try { renameSync(TASKS_FILE, TASKS_FILE + ".bak"); } catch { /* ignore */ }
    }
    renameSync(tmpFile, TASKS_FILE);
  } catch (err) {
    logError("scheduled-tasks", "Failed to persist tasks", err);
  }
}

function appendRunLog(run: ScheduledTaskRun): void {
  ensureDirs();
  const logFile = join(RUNS_DIR, `${run.taskId}.jsonl`);
  try {
    appendFileSync(logFile, JSON.stringify(run) + "\n", "utf-8");
    // Prune if too large
    pruneRunLog(logFile);
  } catch (err) {
    logError("scheduled-tasks", `Failed to append run log for ${run.taskId}`, err);
  }
}

function pruneRunLog(logFile: string): void {
  try {
    const content = readFileSync(logFile, "utf-8");
    const lines = content.trim().split("\n");
    if (lines.length > MAX_RUN_LOG_ENTRIES) {
      const pruned = lines.slice(lines.length - MAX_RUN_LOG_ENTRIES);
      writeFileSync(logFile, pruned.join("\n") + "\n", "utf-8");
    }
  } catch { /* ignore */ }
}

// ── Cron Computation ──

function computeNextFire(task: ScheduledTaskDef): number | null {
  if (!task.enabled) return null;

  if (task.fireAt) {
    const fireTime = new Date(task.fireAt).getTime();
    if (fireTime > Date.now()) return fireTime;
    return null; // One-shot already past
  }

  if (task.cron) {
    try {
      const cron = new Cron(task.cron);
      const next = cron.nextRun();
      return next ? next.getTime() : null;
    } catch {
      return null;
    }
  }

  return null;
}

function cronToHuman(cron: string): string {
  // Common patterns
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = parts;

  if (cron.startsWith("*/")) {
    const interval = parseInt(min.slice(2));
    if (hour === "*" && dom === "*" && mon === "*" && dow === "*") {
      return `Every ${interval} minute${interval > 1 ? "s" : ""}`;
    }
  }
  if (min !== "*" && hour !== "*" && dom === "*" && mon === "*") {
    const h = parseInt(hour);
    const m = parseInt(min);
    const time = `${h > 12 ? h - 12 : h || 12}:${m.toString().padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;
    if (dow === "*") return `Daily at ${time}`;
    if (dow === "1-5") return `Weekdays at ${time}`;
    if (dow === "0" || dow === "7") return `Sundays at ${time}`;
    if (dow === "1") return `Mondays at ${time}`;
  }
  if (hour.startsWith("*/")) {
    const interval = parseInt(hour.slice(2));
    if (dom === "*" && mon === "*" && dow === "*") {
      return `Every ${interval} hour${interval > 1 ? "s" : ""}`;
    }
  }
  if (min === "0" && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return "Every hour";
  }

  return cron; // Fallback to raw
}

// ── Error Classification ──

function classifyTaskError(
  error: unknown,
  task: ScheduledTaskDef,
  durationMs: number,
): { category: ScheduledTaskRun["errorCategory"]; severity: ScheduledTaskRun["severity"] } {
  const msg = error instanceof Error ? error.message : String(error);
  const lc = msg.toLowerCase();

  let category: ScheduledTaskRun["errorCategory"] = "unknown";
  if (durationMs >= TASK_TIMEOUT_MS) category = "timeout";
  else if (lc.includes("timeout") || lc.includes("timed out") || lc.includes("etimedout")) category = "timeout";
  else if (lc.includes("econnrefused") || lc.includes("enotfound") || lc.includes("fetch failed") || lc.includes("network")) category = "network";
  else if (lc.includes("401") || lc.includes("403") || lc.includes("auth") || lc.includes("token") || lc.includes("credential")) category = "auth";
  else if (lc.includes("tool") || lc.includes("executor") || lc.includes("no task executor")) category = "tool-error";
  else category = "crash";

  const failures = (task.consecutiveFailures || 0) + 1;
  let severity: ScheduledTaskRun["severity"] = "warning";
  if (failures >= MAX_CONSECUTIVE_FAILURES) severity = "critical";
  else if (failures >= 2) severity = "error";

  return { category, severity };
}

function emitTaskEvent(type: string, task: ScheduledTaskDef, run: ScheduledTaskRun): void {
  if (!taskEventCallback) return;
  try {
    taskEventCallback(type, task, run);
  } catch (err) {
    logError("scheduled-tasks", `Failed to emit ${type} event`, err);
  }
}

// ── Check Loop ──

async function checkLoop(): Promise<void> {
  const now = Date.now();

  // Timeout detection for hung tasks
  for (const [taskId, startTime] of inFlightStartTimes.entries()) {
    const elapsed = now - startTime;
    if (elapsed > TASK_TIMEOUT_MS) {
      const task = tasks.find(t => t.taskId === taskId);
      if (task) {
        logError("scheduled-tasks", `Task "${task.name}" timed out after ${Math.round(elapsed / 1000)}s`);

        const failureCount = (task.consecutiveFailures || 0) + 1;
        const isCircuitBreak = task.recurring && failureCount >= MAX_CONSECUTIVE_FAILURES;

        const timeoutRun: ScheduledTaskRun = {
          runId: randomUUID(),
          taskId,
          firedAt: startTime,
          completedAt: now,
          status: "timeout",
          durationMs: elapsed,
          error: `Task execution timed out after ${Math.round(elapsed / 1000)}s`,
          errorCategory: "timeout",
          severity: isCircuitBreak ? "critical" : (failureCount >= 2 ? "error" : "warning"),
          consecutiveFailureCount: failureCount,
          circuitBroken: isCircuitBreak,
          taskName: task.name,
        };

        task.lastRunStatus = "failed";
        task.consecutiveFailures = failureCount;
        if (isCircuitBreak) {
          task.enabled = false;
          task.nextFireAt = undefined;
        }
        persistTasks();
        appendRunLog(timeoutRun);
        broadcastCallback?.({ scheduledTaskUpdate: { ...task }, scheduledTaskRun: timeoutRun });

        emitTaskEvent(isCircuitBreak ? "task.circuit_break" : "task.timeout", task, timeoutRun);
        inFlight.delete(taskId);
        inFlightStartTimes.delete(taskId);
      }
    }
  }

  for (const task of tasks) {
    if (!task.enabled || inFlight.has(task.taskId)) continue;
    if (inFlight.size >= MAX_CONCURRENT) break;

    // Check age-out for recurring tasks
    if (task.recurring && task.maxAgeMs) {
      const maxAge = task.maxAgeMs || DEFAULT_MAX_AGE_MS;
      if (now - task.createdAt >= maxAge) {
        task.enabled = false;
        task.nextFireAt = undefined;
        persistTasks();
        logAction({ ts: now, type: "system", category: "scheduled-tasks", message: `Task "${task.name}" auto-disabled (age limit)` });
        continue;
      }
    }

    if (task.nextFireAt && now >= task.nextFireAt) {
      // Fire!
      inFlight.add(task.taskId);
      inFlightStartTimes.set(task.taskId, now);
      task.lastRunStatus = "running";

      // Broadcast status update
      broadcastCallback?.({ scheduledTaskUpdate: { ...task } });

      fireTask(task).finally(() => {
        inFlight.delete(task.taskId);
        inFlightStartTimes.delete(task.taskId);
      });
    }
  }
}

async function fireTask(task: ScheduledTaskDef): Promise<void> {
  const now = Date.now();
  logAction({ ts: now, type: "action", category: "scheduled-tasks", message: `Firing task "${task.name}" (${task.taskId})` });

  try {
    let run: ScheduledTaskRun;

    if (fireCallback) {
      run = await fireCallback(task);
    } else {
      // Fallback: no executor registered
      run = {
        runId: randomUUID(),
        taskId: task.taskId,
        firedAt: now,
        completedAt: Date.now(),
        status: "failed",
        error: "No task executor registered",
      };
    }

    // Update task state
    task.lastFiredAt = now;
    task.lastRunStatus = run.status;

    // Track consecutive failures for circuit breaker
    if (run.status === "failed") {
      task.consecutiveFailures = (task.consecutiveFailures || 0) + 1;

      // Enrich with error classification
      const { category, severity } = classifyTaskError(run.error, task, run.durationMs ?? 0);
      run.errorCategory = run.errorCategory ?? category;
      run.severity = run.severity ?? severity;
      run.consecutiveFailureCount = task.consecutiveFailures;
      run.taskName = task.name;

      const isCircuitBreak = task.recurring && task.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
      if (isCircuitBreak) {
        task.enabled = false;
        task.nextFireAt = undefined;
        run.circuitBroken = true;
        run.severity = "critical";
        logError("scheduled-tasks",
          `Task "${task.name}" auto-disabled after ${task.consecutiveFailures} consecutive failures. ` +
          `Last error: ${run.error || "unknown"}. Re-enable manually after fixing the issue.`
        );
      }

      // Emit failure event to TL
      emitTaskEvent(isCircuitBreak ? "task.circuit_break" : "task.failed", task, run);
    } else if (run.status === "success") {
      task.consecutiveFailures = 0;
    }

    if (!task.recurring) {
      // One-shot: auto-disable after fire
      task.enabled = false;
      task.nextFireAt = undefined;
    } else if (task.enabled) {
      // Recurring: compute next fire (only if still enabled after circuit breaker check)
      task.nextFireAt = computeNextFire(task);
    }

    persistTasks();
    appendRunLog(run);

    // Broadcast completion
    broadcastCallback?.({
      scheduledTaskUpdate: { ...task },
      scheduledTaskRun: run,
    });

    logAction({ ts: Date.now(), type: "action", category: "scheduled-tasks", message: `Task "${task.name}" ${run.status} (${run.durationMs ?? 0}ms)` });
  } catch (err) {
    task.lastFiredAt = now;
    task.lastRunStatus = "failed";
    task.consecutiveFailures = (task.consecutiveFailures || 0) + 1;

    const durationMs = Date.now() - now;
    const { category, severity } = classifyTaskError(err, task, durationMs);
    const isCircuitBreak = task.recurring && task.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;

    if (isCircuitBreak) {
      task.enabled = false;
      task.nextFireAt = undefined;
      logError("scheduled-tasks",
        `Task "${task.name}" auto-disabled after ${task.consecutiveFailures} consecutive failures. ` +
        `Last error: ${err instanceof Error ? err.message : String(err)}. Re-enable manually after fixing.`
      );
    } else {
      task.nextFireAt = task.recurring ? computeNextFire(task) : undefined;
    }
    if (!task.recurring) task.enabled = false;
    persistTasks();

    const failRun: ScheduledTaskRun = {
      runId: randomUUID(),
      taskId: task.taskId,
      firedAt: now,
      completedAt: Date.now(),
      status: "failed",
      durationMs,
      error: err instanceof Error ? err.message : String(err),
      errorCategory: category,
      severity: isCircuitBreak ? "critical" : severity,
      consecutiveFailureCount: task.consecutiveFailures,
      circuitBroken: isCircuitBreak,
      taskName: task.name,
    };
    appendRunLog(failRun);
    broadcastCallback?.({ scheduledTaskUpdate: { ...task }, scheduledTaskRun: failRun });

    emitTaskEvent(isCircuitBreak ? "task.circuit_break" : "task.failed", task, failRun);
    logError("scheduled-tasks", `Task "${task.name}" failed`, err);
  }
}

// ── Missed Task Detection ──

function detectMissedTasks(): void {
  const now = Date.now();
  for (const task of tasks) {
    if (!task.enabled) continue;
    if (task.nextFireAt && task.nextFireAt < now) {
      const missedBy = Math.round((now - task.nextFireAt) / 60_000);
      logAction({
        ts: now,
        type: "system",
        category: "scheduled-tasks",
        message: `Task "${task.name}" missed by ${missedBy}min — rescheduling`,
      });
      // Reschedule to next future fire (don't catch up)
      task.nextFireAt = computeNextFire(task);
    }
  }
  persistTasks();
}

// ── Public API ──

export function initScheduler(
  onFire: (task: ScheduledTaskDef) => Promise<ScheduledTaskRun>,
  broadcast: (msg: Partial<import("@shared/types.js").ServerMessage>) => void,
  onTaskEvent?: (type: string, task: ScheduledTaskDef, run: ScheduledTaskRun) => void,
): void {
  fireCallback = onFire;
  broadcastCallback = broadcast;
  taskEventCallback = onTaskEvent ?? null;
  loadTasks();
  detectMissedTasks();

  if (checkInterval) clearInterval(checkInterval);
  checkInterval = setInterval(() => {
    checkLoop().catch((err) => logError("scheduled-tasks", "Check loop error", err));
  }, CHECK_INTERVAL_MS);

  logAction({ ts: Date.now(), type: "system", category: "scheduled-tasks", message: `Scheduler started (${tasks.length} tasks, ${CHECK_INTERVAL_MS / 1000}s interval)` });
}

export function stopScheduler(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  fireCallback = null;
  broadcastCallback = null;
  logAction({ ts: Date.now(), type: "system", category: "scheduled-tasks", message: "Scheduler stopped" });
}

export function createTask(def: Partial<ScheduledTaskDef>): ScheduledTaskDef {
  const taskId = def.taskId || def.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || randomUUID().slice(0, 8);

  // Check for duplicate taskId
  if (tasks.find((t) => t.taskId === taskId)) {
    throw new Error(`Task with id "${taskId}" already exists`);
  }

  // Validate tool tasks reference a registered tool
  if (def.action?.type === "tool" && def.action.toolId) {
    if (!isToolRegistered(def.action.toolId)) {
      throw new Error(
        `Cannot create task "${def.name || taskId}": tool "${def.action.toolId}" is not registered. ` +
        `Register the tool before creating a scheduled task for it.`
      );
    }
  }

  const task: ScheduledTaskDef = {
    taskId,
    name: def.name || taskId,
    description: def.description || "",
    cron: def.cron,
    fireAt: def.fireAt,
    action: def.action || { type: "prompt", prompt: "" },
    enabled: def.enabled !== false,
    createdAt: Date.now(),
    recurring: def.recurring ?? !!def.cron,
    maxAgeMs: def.maxAgeMs ?? DEFAULT_MAX_AGE_MS,
    notifyOnComplete: def.notifyOnComplete ?? true,
    model: def.model,
    consecutiveFailures: 0,
  };

  task.nextFireAt = computeNextFire(task);
  tasks.push(task);
  persistTasks();

  logAction({ ts: Date.now(), type: "action", category: "scheduled-tasks", message: `Created task "${task.name}" (${task.cron || task.fireAt || "manual"})` });
  broadcastCallback?.({ scheduledTaskUpdate: task });

  return task;
}

export function updateTask(taskId: string, updates: Partial<ScheduledTaskDef>): ScheduledTaskDef {
  const idx = tasks.findIndex((t) => t.taskId === taskId);
  if (idx === -1) throw new Error(`Task "${taskId}" not found`);

  const task = tasks[idx];

  // Apply updates (whitelist safe fields)
  if (updates.name !== undefined) task.name = updates.name;
  if (updates.description !== undefined) task.description = updates.description;
  if (updates.cron !== undefined) task.cron = updates.cron;
  if (updates.fireAt !== undefined) task.fireAt = updates.fireAt;
  if (updates.action !== undefined) task.action = updates.action;
  if (updates.enabled !== undefined) task.enabled = updates.enabled;
  if (updates.recurring !== undefined) task.recurring = updates.recurring;
  if (updates.maxAgeMs !== undefined) task.maxAgeMs = updates.maxAgeMs;
  if (updates.notifyOnComplete !== undefined) task.notifyOnComplete = updates.notifyOnComplete;
  if (updates.model !== undefined) task.model = updates.model;

  // Recompute next fire
  task.nextFireAt = computeNextFire(task);
  persistTasks();

  logAction({ ts: Date.now(), type: "action", category: "scheduled-tasks", message: `Updated task "${task.name}"` });
  broadcastCallback?.({ scheduledTaskUpdate: task });

  return task;
}

export function deleteTask(taskId: string): void {
  const idx = tasks.findIndex((t) => t.taskId === taskId);
  if (idx === -1) throw new Error(`Task "${taskId}" not found`);

  const task = tasks[idx];
  tasks.splice(idx, 1);
  persistTasks();

  logAction({ ts: Date.now(), type: "action", category: "scheduled-tasks", message: `Deleted task "${task.name}"` });
}

export function getTask(taskId: string): ScheduledTaskDef | undefined {
  return tasks.find((t) => t.taskId === taskId);
}

export function listTasks(): ScheduledTaskDef[] {
  return [...tasks];
}

export async function triggerTask(taskId: string): Promise<ScheduledTaskRun> {
  const task = tasks.find((t) => t.taskId === taskId);
  if (!task) throw new Error(`Task "${taskId}" not found`);

  if (inFlight.has(taskId)) throw new Error(`Task "${taskId}" is already running`);

  inFlight.add(taskId);
  task.lastRunStatus = "running";
  broadcastCallback?.({ scheduledTaskUpdate: { ...task } });

  try {
    let run: ScheduledTaskRun;
    if (fireCallback) {
      run = await fireCallback(task);
    } else {
      run = {
        runId: randomUUID(),
        taskId,
        firedAt: Date.now(),
        completedAt: Date.now(),
        status: "failed",
        error: "No task executor registered",
      };
    }

    task.lastFiredAt = Date.now();
    task.lastRunStatus = run.status;
    persistTasks();
    appendRunLog(run);

    broadcastCallback?.({ scheduledTaskUpdate: { ...task }, scheduledTaskRun: run });
    return run;
  } finally {
    inFlight.delete(taskId);
  }
}

export function getTaskRuns(taskId: string, count = 20): ScheduledTaskRun[] {
  const logFile = join(RUNS_DIR, `${taskId}.jsonl`);
  if (!existsSync(logFile)) return [];

  try {
    const content = readFileSync(logFile, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const runs = lines.map((l) => JSON.parse(l) as ScheduledTaskRun);
    return runs.slice(-count).reverse(); // Most recent first
  } catch {
    return [];
  }
}

export { cronToHuman, computeNextFire };
