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
import type { OrchestrationPlan, OrchestrationTask } from "@shared/types.js";
import { runClaudeCode, cancelClaudeCodeRun } from "./claude-code.js";
import { logAction, logError } from "./action-log.js";
import type { ConnectedClient } from "./server.js";
import type { ServerMessage } from "@shared/types.js";

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
}

// ── DAG Executor ──

/**
 * Execute orchestration tasks in parallel waves using Kahn's algorithm
 * with a concurrency semaphore. Each task gets its own Claude Code session.
 */
export async function executeDAG(params: DAGExecutorParams): Promise<void> {
  const { plan, orch, buildTaskPrompt, onTaskStart, onTaskDone, onTaskFail, cwd, maxConcurrency = 4 } = params;

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
          const { sessionId } = await runClaudeCode({
            prompt,
            cwd,
            client: taskClient,
            runId,
            targetCardId: virtualCardId,
            skipPersist: true,
          });

          orch.taskSessionIds.set(task.taskId, sessionId);

          if (orch.aborted) return;

          // Task completed — parse output file for summary
          const summary = readTaskSummary(task.taskId) || `Task ${task.taskId} completed`;
          task.status = "completed";
          task.resultSummary = summary;
          completedSet.add(task.taskId);
          orch.sharedContext.set(task.taskId, summary);
          onTaskDone(task.taskId, summary);

          logAction({
            ts: Date.now(),
            type: "action",
            category: "orchestrator",
            message: `DAG: task ${task.taskId} completed — ${summary.slice(0, 100)}`,
          });

          // ── Fix-Verify Loop: Check for FAIL verdict on review tasks ──
          if (task.taskId === "review" || task.agentRole === "reviewer") {
            const verdict = extractVerdict(task.taskId);
            if (verdict === "FAIL" && !plan.tasks.some(t => t.taskId === "fix-cycle")) {
              // Inject a fix task into the plan
              const fixTask: OrchestrationTask = {
                taskId: "fix-cycle",
                title: "Fix Build Issues (automated fix cycle)",
                description: buildFixTaskDescription(task.taskId),
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

          logError("orchestrator", `DAG: task ${task.taskId} failed`, err);
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
  const originalSend = originalClient.send.bind(originalClient);

  return {
    ...originalClient,
    send: (msg: ServerMessage) => {
      // Route messages targeting the virtual card to the original client
      // with the virtual card ID preserved — the store will route it
      // to the correct task terminal
      originalSend(msg);
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

/**
 * Try to read the task's output file for a summary.
 * If a STRUCTURED_SUMMARY block exists, parse it and return a compact string.
 * Otherwise, extract first meaningful lines up to 500 chars.
 */
function readTaskSummary(taskId: string): string | null {

  const candidates = [
    join(process.cwd(), `server/.orchestration-output-${taskId}.md`),
    join(process.cwd(), `server/.orchestration-research-${taskId}.md`),
  ];

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
            return `[${verdict}] ${findings}${ratingsStr ? ` | Ratings: ${ratingsStr}` : ""}`
              .slice(0, 500);
          } catch {
            // JSON parse failed — fall through to plain text extraction
          }
        }

        // Fallback: extract first meaningful lines up to 500 chars
        const lines = content.split("\n").filter(
          (l: string) => l.trim() && !l.startsWith("#")
        );
        return lines.slice(0, 5).join(" ").trim().slice(0, 500)
          || `Output written to ${filePath}`;
      } catch {
        return `Output written to ${filePath}`;
      }
    }
  }

  return null;
}

/**
 * Extract VERDICT: PASS/FAIL from a review task's output file.
 */
function extractVerdict(taskId: string): "PASS" | "FAIL" | null {

  const candidates = [
    join(process.cwd(), `server/.orchestration-output-${taskId}.md`),
    join(process.cwd(), `server/.evolution-review.md`),
  ];

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
          } catch { /* fall through */ }
        }
        // Check for explicit VERDICT line
        const verdictMatch = content.match(/VERDICT:\s*(PASS|FAIL)/i);
        if (verdictMatch) {
          return verdictMatch[1].toUpperCase() as "PASS" | "FAIL";
        }
      } catch { /* skip */ }
    }
  }
  return null;
}

/**
 * Build the description for a dynamically injected fix task.
 */
function buildFixTaskDescription(reviewTaskId: string): string {
  return [
    `A review task found build errors or critical issues. Your job is to fix them.`,
    ``,
    `1. Read the review output: server/.orchestration-output-${reviewTaskId}.md`,
    `   (or server/.evolution-review.md)`,
    `2. Identify ALL issues marked as FAIL or critical`,
    `3. Fix each issue in the actual source code`,
    `4. Run \`npx tsc --noEmit\` to verify the build passes`,
    `5. Write a summary of all fixes to: server/.orchestration-output-fix-cycle.md`,
    ``,
    `SAFETY RULES (same as all sprint tasks):`,
    `- NEVER modify package.json, package-lock.json, or any lock files`,
    `- NEVER restart, stop, or kill any server/gateway process`,
    `- NEVER run npm install, npm update, npx cap sync`,
    `- NEVER push to git`,
  ].join("\n");
}
