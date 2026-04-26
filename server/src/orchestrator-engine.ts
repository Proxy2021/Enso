/**
 * Orchestrator DAG Execution Engine
 *
 * Executes orchestration tasks in parallel waves, respecting dependency
 * graph and configurable max concurrency. Each task gets its own Claude
 * Code session.
 */

import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { OrchestrationPlan, OrchestrationTask, TaskStructuredResult } from "@shared/types.js";
import { runClaudeCode, cancelClaudeCodeRun } from "./claude-code.js";
import { logAction, logError } from "./action-log.js";
import { orchestrationError } from "./errors.js";
import { runWithOrchestrationContext } from "./request-context.js";
import type { ConnectedClient } from "./server.js";
import type { ServerMessage } from "./types.js";
import type { OrchestrationWorkspace } from "./orchestration-workspace.js";

// ── Semaphore ──

class Semaphore {
  private current = 0;
  private waiters: Array<() => void> = [];

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    this.current--;
    const next = this.waiters.shift();
    if (next) {
      this.current++;
      next();
    }
  }

  get available(): number {
    return this.max - this.current;
  }
}

// ── Types ──

export interface ActiveOrchestration {
  plan: OrchestrationPlan;
  client: ConnectedClient;
  sharedContext: Map<string, string>;
  bootstrapCardId: string;
  terminalCardId: string;
  aborted: boolean;
  taskRunIds: Map<string, string>;
  taskSessionIds: Map<string, string>;
  maxConcurrency: number;
  onComplete?: (orchestrationId: string, status: "completed" | "failed") => void;
}

export interface DAGExecutorParams {
  plan: OrchestrationPlan;
  orch: ActiveOrchestration;
  buildTaskPrompt: (task: OrchestrationTask, completedContext: Map<string, string>) => string;
  onTaskStart: (taskId: string) => void;
  onTaskDone: (taskId: string, summary: string) => void;
  onTaskFail: (taskId: string, error: string) => void;
  cwd: string;
  maxConcurrency?: number;
  workspace?: OrchestrationWorkspace;
}

// ── DAG Executor ──

/**
 * Execute orchestration tasks in parallel waves using Kahn's algorithm
 * with a concurrency semaphore. Each task gets its own Claude Code session.
 */
export async function executeDAG(params: DAGExecutorParams): Promise<void> {
  const { plan, orch, buildTaskPrompt, onTaskStart, onTaskDone, onTaskFail, cwd, maxConcurrency = 4, workspace } = params;

  const semaphore = new Semaphore(maxConcurrency);
  const completedSet = new Set<string>();
  const failedSet = new Set<string>();
  const blockedSet = new Set<string>();
  const runningMap = new Map<string, Promise<void>>();

  // Pre-populate completed tasks (for resume scenarios)
  for (const task of plan.tasks) {
    if (task.status === "completed") {
      completedSet.add(task.taskId);
    } else if (task.status === "failed") {
      failedSet.add(task.taskId);
    } else if (task.status === "blocked") {
      blockedSet.add(task.taskId);
    }
  }

  const orchId = plan.orchestrationId;

  logAction({
    ts: Date.now(),
    type: "action",
    category: "orchestrator",
    message: `DAG executor started: ${plan.tasks.length} tasks, max concurrency ${maxConcurrency}`,
  });

  // Main execution loop
  while (true) {
    if (orch.aborted) {
      logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: "DAG executor: aborted" });
      break;
    }

    // Find ready tasks: pending + all deps completed + not blocked
    const readyTasks = plan.tasks.filter((t) => {
      if (t.status !== "pending") return false;
      if (blockedSet.has(t.taskId)) return false;
      if (runningMap.has(t.taskId)) return false;
      return t.dependsOn.every((depId) => completedSet.has(depId));
    });

    // Launch ready tasks up to available semaphore slots
    for (const task of readyTasks) {
      if (orch.aborted) break;
      if (semaphore.available <= 0) break;

      await semaphore.acquire();

      const runId = randomUUID();
      orch.taskRunIds.set(task.taskId, runId);

      // Mark as running
      task.status = "running";
      onTaskStart(task.taskId);

      logAction({
        ts: Date.now(),
        type: "action",
        category: "orchestrator",
        message: `DAG: launching task ${task.taskId} (${task.agentRole}) — "${task.title}"`,
      });

      // Build per-task prompt
      const prompt = buildTaskPrompt(task, orch.sharedContext);

      // Create per-task wrapped client that routes to the task's virtual card
      const virtualCardId = `${orch.bootstrapCardId}:task:${task.taskId}`;
      const taskClient = createTaskClient(orch.client, task.taskId, virtualCardId, orch);

      // Spawn Claude Code session for this task
      const taskPromise = (async () => {
        try {
          const { sessionId } = await runWithOrchestrationContext(orchId, task.taskId, () => runClaudeCode({
            prompt,
            cwd,
            client: taskClient,
            runId,
            targetCardId: virtualCardId,
            skipPersist: true,
          }));

          orch.taskSessionIds.set(task.taskId, sessionId);

          if (orch.aborted) return;

          // Task completed — parse output file for summary + full output
          const summaryResult = readTaskSummary(task.taskId, workspace);
          const summaryText = summaryResult?.text || `Task ${task.taskId} completed`;
          task.status = "completed";
          task.resultSummary = summaryText;
          task.structuredResult = summaryResult?.structured;

          // Store full output content (for focus evolution deliverables, Cortex persistence)
          if (workspace) {
            try {
              const fullPath = workspace.taskOutputPath(task.taskId);
              if (existsSync(fullPath)) {
                (task as any).fullOutput = readFileSync(fullPath, "utf-8");
              }
            } catch (err) { logError("orchestration", `Failed to read full task output for ${task.taskId}`, err, { severity: "info" }); }
          }

          completedSet.add(task.taskId);
          orch.sharedContext.set(task.taskId, summaryText);
          onTaskDone(task.taskId, summaryText);

          logAction({
            ts: Date.now(),
            type: "action",
            category: "orchestrator",
            message: `DAG: task ${task.taskId} completed — ${summaryText.slice(0, 100)}`,
          });

          // ── Fix-Verify Loop: Check for FAIL verdict on review tasks ──
          if (task.taskId === "review" || task.agentRole === "reviewer") {
            const verdict = extractVerdict(task.taskId, workspace);
            if (verdict === "FAIL" && !plan.tasks.some(t => t.taskId === "fix-cycle")) {
              // Inject a fix task into the plan
              const fixTask: OrchestrationTask = {
                taskId: "fix-cycle",
                title: "Fix Build Issues (automated fix cycle)",
                description: buildFixTaskDescription(task.taskId, workspace),
                agentRole: "coder",
                dependsOn: [task.taskId],
                outputType: "code",
                status: "pending",
              };
              plan.tasks.push(fixTask);

              // Re-point downstream tasks that depended on "review" to now depend on "fix-cycle"
              for (const t of plan.tasks) {
                if (t.taskId !== "fix-cycle" && t.dependsOn.includes(task.taskId)) {
                  t.dependsOn = t.dependsOn.map(d => d === task.taskId ? "fix-cycle" : d);
                }
              }

              logAction({
                ts: Date.now(),
                type: "action",
                category: "orchestrator",
                message: `Fix-verify loop: FAIL verdict detected, injecting fix-cycle task`,
              });
            }
          }
        } catch (err) {
          if (orch.aborted) return;

          const errorMsg = err instanceof Error ? err.message : String(err);
          task.status = "failed";
          task.error = errorMsg;
          failedSet.add(task.taskId);
          onTaskFail(task.taskId, errorMsg);

          // Block all downstream dependents
          blockDependents(plan, task.taskId, blockedSet);

          logError("orchestrator", `DAG: task ${task.taskId} failed`, orchestrationError(`Task ${task.taskId} failed`, "dag-execution", err instanceof Error ? err : undefined));
        } finally {
          semaphore.release();
          runningMap.delete(task.taskId);
          orch.taskRunIds.delete(task.taskId);
        }
      })();

      runningMap.set(task.taskId, taskPromise);
    }

    // If nothing is running and nothing is ready, we're done
    if (runningMap.size === 0) {
      break;
    }

    // Wait for at least one running task to complete (unlocks new waves)
    await Promise.race(runningMap.values());
  }

  // Summary
  const completed = plan.tasks.filter((t) => t.status === "completed").length;
  const failed = plan.tasks.filter((t) => t.status === "failed").length;
  const blocked = plan.tasks.filter((t) => t.status === "blocked").length;

  logAction({
    ts: Date.now(),
    type: "action",
    category: "orchestrator",
    message: `DAG executor finished: ${completed} completed, ${failed} failed, ${blocked} blocked out of ${plan.tasks.length}`,
  });
}

/**
 * Cancel all running tasks in an orchestration.
 */
export function cancelAllRunningTasks(orch: ActiveOrchestration): void {
  for (const [taskId, runId] of orch.taskRunIds) {
    cancelClaudeCodeRun(runId);
    logAction({ ts: Date.now(), type: "action", category: "orchestrator", message: `DAG: cancelled task ${taskId}` });
  }
}

// ── Helpers ──

/**
 * Create a wrapped client that routes output to a specific virtual card ID
 * for the task, and also forwards to the main client.
 */
function createTaskClient(
  originalClient: ConnectedClient,
  taskId: string,
  virtualCardId: string,
  orch: ActiveOrchestration,
): ConnectedClient {
  return {
    ...originalClient,
    send: (msg: ServerMessage) => {
      // Resolve send at call time (NOT via .bind()) so that after a WebSocket
      // reconnect — where the server replaces client.send in-place — task
      // messages route through the new, live socket instead of the stale one.
      orch.client.send(msg);
    },
  };
}

/**
 * Block all tasks that transitively depend on the failed task.
 */
function blockDependents(
  plan: OrchestrationPlan,
  failedTaskId: string,
  blockedSet: Set<string>,
): void {
  blockedSet.add(failedTaskId);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of plan.tasks) {
      if (task.status === "completed" || task.status === "failed") continue;
      if (blockedSet.has(task.taskId)) continue;
      if (task.dependsOn.some((d) => blockedSet.has(d))) {
        task.status = "blocked";
        blockedSet.add(task.taskId);
        changed = true;
      }
    }
  }
}

interface TaskSummaryResult {
  text: string;
  structured?: TaskStructuredResult;
}

/**
 * Try to read the task's output file for a summary.
 * If a STRUCTURED_SUMMARY block exists, parse it and return both the
 * compact text string (for context injection) and the full structured object
 * (for rich UI rendering). Otherwise, extract first meaningful lines.
 */
function readTaskSummary(taskId: string, workspace?: OrchestrationWorkspace): TaskSummaryResult | null {

  const candidates: string[] = [];
  // Workspace paths (preferred)
  if (workspace) {
    candidates.push(workspace.taskOutputPath(taskId));
    candidates.push(workspace.taskResearchPath(taskId));
  }
  // Legacy paths (fallback)
  candidates.push(join(process.cwd(), `server/.orchestration-output-${taskId}.md`));
  candidates.push(join(process.cwd(), `server/.orchestration-research-${taskId}.md`));

  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8");

        // Try to parse structured summary block first
        const structuredMatch = content.match(
          /<!--\s*STRUCTURED_SUMMARY\s+(\{[\s\S]*?\})\s*-->/
        );
        if (structuredMatch) {
          try {
            const parsed = JSON.parse(structuredMatch[1]);
            const verdict = parsed.verdict || "completed";
            const findings = (parsed.keyFindings || [])
              .slice(0, 3)
              .map((f: any) => f.title || f)
              .join("; ");
            const ratingsStr = parsed.ratings
              ? Object.entries(parsed.ratings)
                  .map(([k, v]) => `${k}:${v}`)
                  .join(", ")
              : "";
            const text = `[${verdict}] ${findings}${ratingsStr ? ` | Ratings: ${ratingsStr}` : ""}`
              .slice(0, 500);

            // Preserve the full structured object for rich UI rendering
            const structured: TaskStructuredResult = {};
            if (parsed.verdict) structured.verdict = parsed.verdict;
            if (parsed.confidence) structured.confidence = parsed.confidence;
            if (Array.isArray(parsed.keyFindings)) structured.keyFindings = parsed.keyFindings;
            if (parsed.ratings && typeof parsed.ratings === "object") structured.ratings = parsed.ratings;
            if (Array.isArray(parsed.recommendations)) structured.recommendations = parsed.recommendations;
            if (Array.isArray(parsed.technicalDebt)) structured.technicalDebt = parsed.technicalDebt;

            return { text, structured };
          } catch (err) {
            logError("orchestration", "STRUCTURED_SUMMARY JSON parse failed, using plain text", err, { severity: "warning" });
          }
        }

        // Fallback: extract first meaningful lines up to 500 chars
        const lines = content.split("\n").filter(
          (l: string) => l.trim() && !l.startsWith("#")
        );
        const text = lines.slice(0, 5).join(" ").trim().slice(0, 500)
          || `Output written to ${filePath}`;
        return { text };
      } catch (err) {
        logError("orchestration", `Failed to read task output file: ${filePath}`, err, { severity: "warning" });
        return { text: `Output written to ${filePath}` };
      }
    }
  }

  return null;
}

/**
 * Extract VERDICT: PASS/FAIL from a review task's output file.
 */
function extractVerdict(taskId: string, workspace?: OrchestrationWorkspace): "PASS" | "FAIL" | null {

  const candidates: string[] = [];
  if (workspace) {
    candidates.push(workspace.taskOutputPath(taskId));
    candidates.push(workspace.evolutionFilePath("review"));
  }
  candidates.push(join(process.cwd(), `server/.orchestration-output-${taskId}.md`));
  candidates.push(join(process.cwd(), `server/.evolution-review.md`));

  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8");
        // Check structured summary first
        const structMatch = content.match(/STRUCTURED_SUMMARY\s+(\{[\s\S]*?\})/);
        if (structMatch) {
          try {
            const parsed = JSON.parse(structMatch[1]);
            if (parsed.verdict === "PASS" || parsed.verdict === "FAIL") {
              return parsed.verdict;
            }
          } catch (err) { logError("orchestration", "Verdict JSON parse failed", err, { severity: "warning" }); }
        }
        // Check for explicit VERDICT line
        const verdictMatch = content.match(/VERDICT:\s*(PASS|FAIL)/i);
        if (verdictMatch) {
          return verdictMatch[1].toUpperCase() as "PASS" | "FAIL";
        }
      } catch (err) { logError("orchestration", `Failed to read verdict file: ${filePath}`, err, { severity: "warning" }); }
    }
  }
  return null;
}

/**
 * Build the description for a dynamically injected fix task.
 */
function buildFixTaskDescription(reviewTaskId: string, workspace?: OrchestrationWorkspace): string {
  const reviewPath = workspace ? workspace.taskOutputPath(reviewTaskId) : `server/.orchestration-output-${reviewTaskId}.md`;
  const reviewAlt = workspace ? workspace.evolutionFilePath("review") : `server/.evolution-review.md`;
  const fixOutputPath = workspace ? workspace.taskOutputPath("fix-cycle") : `server/.orchestration-output-fix-cycle.md`;
  return [
    `A review task found build errors or critical issues. Your job is to DIAGNOSE and fix them.`,
    ``,
    `## Diagnostic-First Approach (CRITICAL)`,
    `Do NOT blindly apply fixes. For EACH issue:`,
    `1. **Reproduce** — verify the issue exists (run the failing command, read the error)`,
    `2. **Diagnose** — understand WHY it fails (root cause, not just symptoms)`,
    `3. **Fix** — apply the minimal correct fix`,
    `4. **Verify** — confirm the fix works (re-run the command)`,
    ``,
    `Common traps to avoid:`,
    `- Fixing the symptom, not the root cause (e.g., suppressing a type error instead of fixing the type)`,
    `- Introducing new issues while fixing old ones (always re-run \`npx tsc --noEmit\` after each fix)`,
    `- Changing code you don't understand — read the surrounding context first`,
    `- Retrying the same fix if it didn't work — try a different approach`,
    ``,
    `## Steps`,
    `1. Read the review output: ${reviewPath}`,
    `   (or ${reviewAlt})`,
    `2. For EACH issue marked FAIL or critical:`,
    `   a. Read the relevant source file(s) to understand the context`,
    `   b. Identify the root cause (not just the error message)`,
    `   c. Apply the fix`,
    `   d. Run \`npx tsc --noEmit\` to verify no new errors`,
    `3. After ALL fixes, run a final \`npx tsc --noEmit\` to confirm clean build`,
    `4. Write a summary to: ${fixOutputPath}`,
    `   For each fix: what was wrong, why, what you changed, and how you verified it`,
    ``,
    `SAFETY RULES (same as all sprint tasks):`,
    `- NEVER modify package.json, package-lock.json, or any lock files`,
    `- NEVER restart, stop, or kill any server/gateway process`,
    `- NEVER run npm install, npm update, npx cap sync`,
    `- NEVER push to git`,
  ].join("\n");
}
