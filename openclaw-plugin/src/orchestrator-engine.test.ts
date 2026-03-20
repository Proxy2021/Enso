import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OrchestrationPlan, OrchestrationTask } from "./types.js";
import type { ActiveOrchestration, DAGExecutorParams } from "./orchestrator-engine.js";

// ── Mocks ──

const mockRunClaudeCode = vi.fn().mockResolvedValue({ sessionId: "mock-session" });
const mockCancelClaudeCodeRun = vi.fn();

vi.mock("./claude-code.js", () => ({
  runClaudeCode: (...args: any[]) => mockRunClaudeCode(...args),
  cancelClaudeCodeRun: (...args: any[]) => mockCancelClaudeCodeRun(...args),
}));

vi.mock("./action-log.js", () => ({
  logAction: vi.fn(),
  logError: vi.fn(),
}));

// Mock fs for readTaskSummary — return structured summary for review tasks
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn((path: string) => {
      if (typeof path === "string" && (path.includes(".orchestration-output-") || path.includes(".orchestration-research-") || path.includes(".evolution-review"))) {
        return true;
      }
      return actual.existsSync(path);
    }),
    readFileSync: vi.fn((path: string, encoding?: string) => {
      if (typeof path === "string" && path.includes(".orchestration-output-review")) {
        // Default: PASS verdict for review tasks
        return `VERDICT: PASS\n\nAll builds passing. No issues found.\n\n<!-- STRUCTURED_SUMMARY {"verdict":"PASS","buildPassed":true,"issueCount":0,"keyFindings":[],"ratings":{"correctness":9,"completeness":9,"codeQuality":8}} -->`;
      }
      if (typeof path === "string" && (path.includes(".orchestration-output-") || path.includes(".orchestration-research-"))) {
        const taskId = path.match(/-([\w-]+)\.md$/)?.[1] || "unknown";
        return `# Task ${taskId} Output\nThis task completed successfully with mock data.\n\n<!-- STRUCTURED_SUMMARY {"verdict":"completed","keyFindings":[{"id":"F1","title":"Mock finding","impact":"low"}],"ratings":{"quality":8}} -->`;
      }
      return actual.readFileSync(path, encoding as any);
    }),
  };
});

// Import after mocks
const { executeDAG } = await import("./orchestrator-engine.js");

// ── Helpers ──

function makeTask(overrides: Partial<OrchestrationTask> & { taskId: string }): OrchestrationTask {
  return {
    title: overrides.taskId,
    description: `Task ${overrides.taskId}`,
    agentRole: "coder",
    dependsOn: [],
    outputType: "code",
    status: "pending",
    ...overrides,
  };
}

function makePlan(tasks: Array<Partial<OrchestrationTask> & { taskId: string }>): OrchestrationPlan {
  return {
    orchestrationId: "test-orch",
    goal: "Test goal",
    tasks: tasks.map(makeTask),
    agents: [],
    status: "executing",
  };
}

function makeMockOrch(): ActiveOrchestration {
  return {
    plan: {} as any,
    client: { send: vi.fn(), sessionKey: "test" } as any,
    sharedContext: new Map(),
    bootstrapCardId: "boot-card",
    terminalCardId: "term-card",
    aborted: false,
    taskRunIds: new Map(),
    taskSessionIds: new Map(),
    maxConcurrency: 4,
  };
}

function makeParams(
  plan: OrchestrationPlan,
  overrides?: Partial<DAGExecutorParams>,
): DAGExecutorParams {
  const orch = makeMockOrch();
  orch.plan = plan;
  return {
    plan,
    orch,
    buildTaskPrompt: () => "mock prompt",
    onTaskStart: vi.fn(),
    onTaskDone: vi.fn(),
    onTaskFail: vi.fn(),
    cwd: "/tmp/test",
    maxConcurrency: 4,
    ...overrides,
  };
}

// ── Tests ──

describe("Dependency Resolution", () => {
  beforeEach(() => {
    mockRunClaudeCode.mockReset();
    mockRunClaudeCode.mockResolvedValue({ sessionId: "mock-session" });
  });

  it("executes linear chain A→B→C in order", async () => {
    const executionOrder: string[] = [];
    mockRunClaudeCode.mockImplementation(async (args: any) => {
      // Extract task ID from prompt
      executionOrder.push(args.runId ? "task" : "task");
      return { sessionId: "mock-session" };
    });

    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: ["a"] },
      { taskId: "c", dependsOn: ["b"] },
    ]);

    const startOrder: string[] = [];
    const params = makeParams(plan, {
      onTaskStart: (id) => startOrder.push(id),
      maxConcurrency: 1,
    });

    await executeDAG(params);

    expect(plan.tasks.every(t => t.status === "completed")).toBe(true);
    expect(startOrder).toEqual(["a", "b", "c"]);
  });

  it("executes diamond DAG: A→{B,C}→D correctly", async () => {
    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: ["a"] },
      { taskId: "c", dependsOn: ["a"] },
      { taskId: "d", dependsOn: ["b", "c"] },
    ]);

    const startOrder: string[] = [];
    const params = makeParams(plan, {
      onTaskStart: (id) => startOrder.push(id),
      maxConcurrency: 4,
    });

    await executeDAG(params);

    expect(plan.tasks.every(t => t.status === "completed")).toBe(true);
    // A must be first, D must be last
    expect(startOrder[0]).toBe("a");
    expect(startOrder[startOrder.length - 1]).toBe("d");
  });

  it("executes fan-out: A→{B,C,D} in parallel", async () => {
    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: ["a"] },
      { taskId: "c", dependsOn: ["a"] },
      { taskId: "d", dependsOn: ["a"] },
    ]);

    const params = makeParams(plan, { maxConcurrency: 4 });
    await executeDAG(params);

    expect(plan.tasks.every(t => t.status === "completed")).toBe(true);
  });

  it("executes fan-in: {A,B,C}→D waiting for all", async () => {
    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: [] },
      { taskId: "c", dependsOn: [] },
      { taskId: "d", dependsOn: ["a", "b", "c"] },
    ]);

    const startOrder: string[] = [];
    const params = makeParams(plan, {
      onTaskStart: (id) => startOrder.push(id),
      maxConcurrency: 4,
    });

    await executeDAG(params);

    expect(plan.tasks.every(t => t.status === "completed")).toBe(true);
    expect(startOrder[startOrder.length - 1]).toBe("d");
  });

  it("executes complex mixed DAG with multiple waves", async () => {
    const plan = makePlan([
      { taskId: "a1", dependsOn: [] },
      { taskId: "a2", dependsOn: [] },
      { taskId: "b1", dependsOn: ["a1"] },
      { taskId: "b2", dependsOn: ["a1", "a2"] },
      { taskId: "c1", dependsOn: ["b1", "b2"] },
    ]);

    const params = makeParams(plan, { maxConcurrency: 4 });
    await executeDAG(params);

    expect(plan.tasks.every(t => t.status === "completed")).toBe(true);
  });
});

describe("Concurrency Control", () => {
  beforeEach(() => {
    mockRunClaudeCode.mockReset();
    mockRunClaudeCode.mockResolvedValue({ sessionId: "mock-session" });
  });

  it("serial execution (maxConcurrency=1) runs one at a time", async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    mockRunClaudeCode.mockImplementation(async () => {
      concurrentCount++;
      if (concurrentCount > maxConcurrent) maxConcurrent = concurrentCount;
      await new Promise(r => setTimeout(r, 10));
      concurrentCount--;
      return { sessionId: "mock-session" };
    });

    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: [] },
      { taskId: "c", dependsOn: [] },
    ]);

    const params = makeParams(plan, { maxConcurrency: 1 });
    await executeDAG(params);

    expect(maxConcurrent).toBe(1);
    expect(plan.tasks.every(t => t.status === "completed")).toBe(true);
  });

  it("parallel execution (maxConcurrency=3) runs up to 3 simultaneously", async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    mockRunClaudeCode.mockImplementation(async () => {
      concurrentCount++;
      if (concurrentCount > maxConcurrent) maxConcurrent = concurrentCount;
      await new Promise(r => setTimeout(r, 50));
      concurrentCount--;
      return { sessionId: "mock-session" };
    });

    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: [] },
      { taskId: "c", dependsOn: [] },
      { taskId: "d", dependsOn: [] },
      { taskId: "e", dependsOn: [] },
    ]);

    const params = makeParams(plan, { maxConcurrency: 3 });
    await executeDAG(params);

    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(plan.tasks.every(t => t.status === "completed")).toBe(true);
  });

  it("semaphore releases on task failure, allowing next tasks", async () => {
    mockRunClaudeCode
      .mockRejectedValueOnce(new Error("Task A failed"))
      .mockResolvedValue({ sessionId: "mock-session" });

    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: [] }, // independent of a
    ]);

    const params = makeParams(plan, { maxConcurrency: 1 });
    await executeDAG(params);

    expect(plan.tasks.find(t => t.taskId === "a")?.status).toBe("failed");
    expect(plan.tasks.find(t => t.taskId === "b")?.status).toBe("completed");
  });

  it("semaphore releases on task completion, unblocking waiters", async () => {
    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: [] },
      { taskId: "c", dependsOn: ["a"] },
    ]);

    const startOrder: string[] = [];
    const params = makeParams(plan, {
      onTaskStart: (id) => startOrder.push(id),
      maxConcurrency: 2,
    });

    await executeDAG(params);

    expect(plan.tasks.every(t => t.status === "completed")).toBe(true);
  });
});

describe("Failure Handling", () => {
  beforeEach(() => {
    mockRunClaudeCode.mockReset();
    mockRunClaudeCode.mockResolvedValue({ sessionId: "mock-session" });
  });

  it("single failure blocks all direct dependents", async () => {
    mockRunClaudeCode
      .mockRejectedValueOnce(new Error("A failed"))
      .mockResolvedValue({ sessionId: "mock-session" });

    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: ["a"] },
      { taskId: "c", dependsOn: ["a"] },
    ]);

    const params = makeParams(plan);
    await executeDAG(params);

    expect(plan.tasks.find(t => t.taskId === "a")?.status).toBe("failed");
    expect(plan.tasks.find(t => t.taskId === "b")?.status).toBe("blocked");
    expect(plan.tasks.find(t => t.taskId === "c")?.status).toBe("blocked");
  });

  it("single failure blocks transitive dependents regardless of array order", async () => {
    // Tasks in reverse dependency order to expose the single-pass bug
    const plan = makePlan([
      { taskId: "c", dependsOn: ["b"] },  // C depends on B (listed FIRST)
      { taskId: "b", dependsOn: ["a"] },  // B depends on A (listed SECOND)
      { taskId: "a", dependsOn: [] },     // A is root (listed LAST)
    ]);

    // Make task A fail
    let callCount = 0;
    mockRunClaudeCode.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("A failed"); // A is the first to run (no deps)
      return { sessionId: "mock-session" };
    });

    const params = makeParams(plan, { maxConcurrency: 1 });
    await executeDAG(params);

    expect(plan.tasks.find(t => t.taskId === "a")?.status).toBe("failed");
    expect(plan.tasks.find(t => t.taskId === "b")?.status).toBe("blocked");
    expect(plan.tasks.find(t => t.taskId === "c")?.status).toBe("blocked"); // MUST be blocked
  });

  it("independent branches continue when sibling fails", async () => {
    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: ["a"] },
      { taskId: "c", dependsOn: ["a"] },
    ]);

    // A succeeds, B fails, C should still succeed since it only depends on A
    mockRunClaudeCode.mockReset();
    mockRunClaudeCode
      .mockResolvedValueOnce({ sessionId: "mock-session" }) // A
      .mockRejectedValueOnce(new Error("B failed")) // B
      .mockResolvedValue({ sessionId: "mock-session" }); // C

    const params = makeParams(plan, { maxConcurrency: 1 });
    await executeDAG(params);

    expect(plan.tasks.find(t => t.taskId === "a")?.status).toBe("completed");
    expect(plan.tasks.find(t => t.taskId === "b")?.status).toBe("failed");
    expect(plan.tasks.find(t => t.taskId === "c")?.status).toBe("completed");
  });

  it("multiple failures correctly block their respective subtrees", async () => {
    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: [] },
      { taskId: "c", dependsOn: ["a"] },
      { taskId: "d", dependsOn: ["b"] },
    ]);

    mockRunClaudeCode
      .mockRejectedValueOnce(new Error("A failed"))
      .mockRejectedValueOnce(new Error("B failed"));

    const params = makeParams(plan, { maxConcurrency: 2 });
    await executeDAG(params);

    expect(plan.tasks.find(t => t.taskId === "a")?.status).toBe("failed");
    expect(plan.tasks.find(t => t.taskId === "b")?.status).toBe("failed");
    expect(plan.tasks.find(t => t.taskId === "c")?.status).toBe("blocked");
    expect(plan.tasks.find(t => t.taskId === "d")?.status).toBe("blocked");
  });

  it("failure in leaf task doesn't affect siblings", async () => {
    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: [] },
    ]);

    mockRunClaudeCode
      .mockRejectedValueOnce(new Error("A failed"))
      .mockResolvedValueOnce({ sessionId: "mock-session" });

    const params = makeParams(plan, { maxConcurrency: 1 });
    await executeDAG(params);

    expect(plan.tasks.find(t => t.taskId === "a")?.status).toBe("failed");
    expect(plan.tasks.find(t => t.taskId === "b")?.status).toBe("completed");
  });
});

describe("Edge Cases", () => {
  beforeEach(() => {
    mockRunClaudeCode.mockReset();
    mockRunClaudeCode.mockResolvedValue({ sessionId: "mock-session" });
  });

  it("empty plan completes immediately", async () => {
    const plan = makePlan([]);
    const params = makeParams(plan);
    await executeDAG(params);
    // No tasks → no errors
    expect(plan.tasks.length).toBe(0);
  });

  it("all tasks pre-completed returns immediately", async () => {
    const plan = makePlan([
      { taskId: "a", dependsOn: [], status: "completed" as any },
      { taskId: "b", dependsOn: ["a"], status: "completed" as any },
    ]);

    const params = makeParams(plan);
    await executeDAG(params);

    expect(mockRunClaudeCode).not.toHaveBeenCalled();
  });

  it("all tasks pre-failed returns immediately", async () => {
    const plan = makePlan([
      { taskId: "a", dependsOn: [], status: "failed" as any },
      { taskId: "b", dependsOn: ["a"], status: "blocked" as any },
    ]);

    const params = makeParams(plan);
    await executeDAG(params);

    expect(mockRunClaudeCode).not.toHaveBeenCalled();
  });

  it("abort signal stops launching new tasks", async () => {
    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: [] },
      { taskId: "c", dependsOn: [] },
    ]);

    const orch = makeMockOrch();
    orch.plan = plan;

    // After first task starts, abort
    mockRunClaudeCode.mockImplementation(async () => {
      orch.aborted = true;
      return { sessionId: "mock-session" };
    });

    const params = makeParams(plan, { maxConcurrency: 1 });
    // Override orch
    (params as any).orch = orch;

    await executeDAG(params);

    // At most 1 task should have been launched
    const completed = plan.tasks.filter(t => t.status === "completed").length;
    expect(completed).toBeLessThanOrEqual(1);
  });
});

describe("Context Propagation", () => {
  beforeEach(() => {
    mockRunClaudeCode.mockReset();
    mockRunClaudeCode.mockResolvedValue({ sessionId: "mock-session" });
  });

  it("completed task summary available to dependent via sharedContext", async () => {
    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
      { taskId: "b", dependsOn: ["a"] },
    ]);

    const orch = makeMockOrch();
    orch.plan = plan;

    const doneArgs: string[] = [];
    const params = makeParams(plan, {
      onTaskDone: (id, summary) => doneArgs.push(`${id}:${summary.slice(0, 50)}`),
    });
    (params as any).orch = orch;

    await executeDAG(params);

    // After execution, sharedContext should have entries for completed tasks
    expect(orch.sharedContext.has("a")).toBe(true);
    expect(orch.sharedContext.has("b")).toBe(true);
  });

  it("readTaskSummary parses structured summary blocks", async () => {
    const plan = makePlan([
      { taskId: "a", dependsOn: [] },
    ]);

    const orch = makeMockOrch();
    orch.plan = plan;

    const params = makeParams(plan);
    (params as any).orch = orch;

    await executeDAG(params);

    // The mock fs returns structured summary blocks
    const summary = orch.sharedContext.get("a");
    expect(summary).toBeDefined();
    // Should contain parsed structured data
    expect(summary).toContain("completed");
  });
});

describe("Fix-Verify Loop", () => {
  beforeEach(() => {
    mockRunClaudeCode.mockReset();
    mockRunClaudeCode.mockResolvedValue({ sessionId: "mock-session" });
  });

  it("does NOT inject fix-cycle when verdict is PASS", async () => {
    const plan = makePlan([
      { taskId: "implement", dependsOn: [] },
      { taskId: "review", dependsOn: ["implement"], agentRole: "reviewer", outputType: "review" },
      { taskId: "dashboard", dependsOn: ["review"] },
    ]);

    // Review output is PASS by default (mock fs returns VERDICT: PASS for review tasks)
    const params = makeParams(plan);
    await executeDAG(params);

    expect(plan.tasks.find(t => t.taskId === "fix-cycle")).toBeUndefined();
    expect(plan.tasks.find(t => t.taskId === "dashboard")?.status).toBe("completed");
  });

  it("injects fix-cycle task when review verdict is FAIL", async () => {
    // Override fs mock for this test to return FAIL verdict
    const fsMock = await import("fs");
    const origReadFileSync = (fsMock as any).readFileSync;
    (fsMock as any).readFileSync = vi.fn((path: string, encoding?: string) => {
      if (typeof path === "string" && (path.includes(".orchestration-output-review") || path.includes(".evolution-review"))) {
        return `VERDICT: FAIL\n\nBuild errors found.\n\n<!-- STRUCTURED_SUMMARY {"verdict":"FAIL","buildPassed":false,"issueCount":3} -->`;
      }
      return origReadFileSync(path, encoding);
    });

    const plan = makePlan([
      { taskId: "implement", dependsOn: [] },
      { taskId: "review", dependsOn: ["implement"], agentRole: "reviewer", outputType: "review" },
      { taskId: "dashboard", dependsOn: ["review"] },
    ]);

    const params = makeParams(plan);
    await executeDAG(params);

    // fix-cycle should be injected
    const fixTask = plan.tasks.find(t => t.taskId === "fix-cycle");
    expect(fixTask).toBeDefined();
    expect(fixTask?.agentRole).toBe("coder");
    expect(fixTask?.dependsOn).toContain("review");

    // Dashboard should now depend on fix-cycle instead of review
    const dashboard = plan.tasks.find(t => t.taskId === "dashboard");
    expect(dashboard?.dependsOn).toContain("fix-cycle");
    expect(dashboard?.dependsOn).not.toContain("review");

    // Restore
    (fsMock as any).readFileSync = origReadFileSync;
  });

  it("injects at most one fix-cycle (bounded retry)", async () => {
    // Override fs mock for FAIL verdict
    const fsMock = await import("fs");
    const origReadFileSync = (fsMock as any).readFileSync;
    (fsMock as any).readFileSync = vi.fn((path: string, encoding?: string) => {
      if (typeof path === "string" && (path.includes(".orchestration-output-review") || path.includes(".evolution-review"))) {
        return `VERDICT: FAIL\n\nBuild errors.\n\n<!-- STRUCTURED_SUMMARY {"verdict":"FAIL","buildPassed":false} -->`;
      }
      return origReadFileSync(path, encoding);
    });

    const plan = makePlan([
      { taskId: "implement", dependsOn: [] },
      { taskId: "review", dependsOn: ["implement"], agentRole: "reviewer", outputType: "review" },
      { taskId: "dashboard", dependsOn: ["review"] },
    ]);

    const params = makeParams(plan);
    await executeDAG(params);

    // Only one fix-cycle should exist
    const fixTasks = plan.tasks.filter(t => t.taskId === "fix-cycle");
    expect(fixTasks.length).toBe(1);

    // Restore
    (fsMock as any).readFileSync = origReadFileSync;
  });
});
