import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ── Mocks ──

vi.mock("./native-tools/registry.js", () => ({
  registerToolTemplate: vi.fn(),
  registerToolTemplateDataHint: vi.fn(),
  registerGeneratedTool: vi.fn(),
  registerGeneratedTemplateCode: vi.fn(),
  unregisterGeneratedTool: vi.fn(),
  unregisterGeneratedTemplateCode: vi.fn(),
  unregisterToolTemplate: vi.fn(),
  unregisterToolTemplateDataHints: vi.fn(),
  executeToolDirect: vi.fn().mockResolvedValue({ success: false, data: null, error: "not available in test" }),
}));

vi.mock("./tool-families/catalog.js", () => ({
  TOOL_FAMILY_CAPABILITIES: [],
  addCapability: vi.fn(),
  removeCapability: vi.fn(),
}));

// ── Import SUT (after mocks) ──

import {
  saveApp,
  loadApps,
  registerLoadedApp,
  loadAndRegisterSavedApps,
  deleteApp,
  deleteAllApps,
  unregisterApp,
  generateSkillMd,
  buildExecutorContext,
  type SavedApp,
} from "./app-persistence.js";
import type { PluginSpec } from "./tool-factory.js";
import {
  registerGeneratedTool,
  registerGeneratedTemplateCode,
  registerToolTemplate,
  registerToolTemplateDataHint,
  unregisterGeneratedTool,
  unregisterGeneratedTemplateCode,
  unregisterToolTemplate,
  unregisterToolTemplateDataHints,
} from "./native-tools/registry.js";
import { addCapability, removeCapability } from "./tool-families/catalog.js";

// ── Fixtures ──

const SAMPLE_SPEC: PluginSpec = {
  toolFamily: "workout_planner",
  toolPrefix: "enso_workout_",
  description: "Weekly workout planning with exercises, swaps, and progress tracking",
  signatureId: "weekly_workout_plan",
  tools: [
    {
      suffix: "plan_week",
      description: "Generate a weekly workout plan based on fitness goal",
      parameters: { type: "object", properties: { goal: { type: "string" } }, required: ["goal"] },
      sampleParams: { goal: "strength" },
      sampleData: { tool: "enso_workout_plan_week", goal: "strength", days: [{ day: 1, exercises: ["squats"] }] },
      requiredDataKeys: ["tool", "goal", "days"],
      isPrimary: true,
    },
    {
      suffix: "swap_exercise",
      description: "Replace an exercise in a specific day",
      parameters: { type: "object", properties: { day: { type: "number" }, newExercise: { type: "string" } }, required: ["day"] },
      sampleParams: { day: 1, newExercise: "lunges" },
      sampleData: { tool: "enso_workout_swap_exercise", day: 1, oldExercise: "squats", newExercise: "lunges" },
      requiredDataKeys: ["tool", "day"],
      isPrimary: false,
    },
  ],
};

const EXECUTOR_PLAN_WEEK = `var goal = (params.goal || "").trim() || "general fitness";
return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workout_plan_week", goal: goal, days: [{ day: 1, exercises: ["squats"] }] }) }] };`;

const EXECUTOR_SWAP_EXERCISE = `var day = Number(params.day) || 1;
return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workout_swap_exercise", day: day, oldExercise: "squats", newExercise: "lunges" }) }] };`;

const TEMPLATE_JSX = `export default function GeneratedUI({ data, onAction }) {
  return <div className="bg-gray-900">{JSON.stringify(data)}</div>;
}`;

const SKILL_MD = `---
name: workout_planner
description: "Weekly workout planning"
---

# Workout Planner

Weekly workout planning.
`;

// ── Helpers ──

let tmpBase: string;

function createTmpBase(): string {
  const dir = path.join(os.tmpdir(), `enso-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeSavedApp(): SavedApp {
  return {
    spec: SAMPLE_SPEC,
    executors: new Map([
      ["plan_week", EXECUTOR_PLAN_WEEK],
      ["swap_exercise", EXECUTOR_SWAP_EXERCISE],
    ]),
    templateJSX: TEMPLATE_JSX,
    skillMd: SKILL_MD,
    createdAt: Date.now(),
  };
}

// ── Setup / Teardown ──

beforeEach(() => {
  vi.clearAllMocks();
  tmpBase = createTmpBase();
});

afterEach(() => {
  try {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ── Tests ──

describe("saveApp + loadApps round-trip", () => {
  it("saves and loads an app correctly", () => {
    const app = makeSavedApp();
    saveApp(app, tmpBase);

    // Verify files exist on disk
    const appDir = path.join(tmpBase, "enso-apps", "workout_planner");
    expect(fs.existsSync(path.join(appDir, "app.json"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, "template.jsx"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, "executors", "plan_week.js"))).toBe(true);
    expect(fs.existsSync(path.join(appDir, "executors", "swap_exercise.js"))).toBe(true);

    // Verify SKILL.md exists in skills directory
    const skillPath = path.join(tmpBase, "skills", "workout_planner", "SKILL.md");
    expect(fs.existsSync(skillPath)).toBe(true);

    // Load back
    const loaded = loadApps(tmpBase);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].spec.toolFamily).toBe("workout_planner");
    expect(loaded[0].spec.tools).toHaveLength(2);
    expect(loaded[0].executors.get("plan_week")).toBe(EXECUTOR_PLAN_WEEK);
    expect(loaded[0].executors.get("swap_exercise")).toBe(EXECUTOR_SWAP_EXERCISE);
    expect(loaded[0].templateJSX).toBe(TEMPLATE_JSX);
  });

  it("returns empty array when no apps directory exists", () => {
    const loaded = loadApps(path.join(tmpBase, "nonexistent"));
    expect(loaded).toHaveLength(0);
  });

  it("skips corrupt app directories", () => {
    // Create a valid app
    saveApp(makeSavedApp(), tmpBase);

    // Create a corrupt app directory (invalid JSON)
    const corruptDir = path.join(tmpBase, "enso-apps", "corrupt_app");
    fs.mkdirSync(corruptDir, { recursive: true });
    fs.writeFileSync(path.join(corruptDir, "app.json"), "not valid json");

    const loaded = loadApps(tmpBase);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].spec.toolFamily).toBe("workout_planner");
  });

  it("skips apps with missing required manifest fields", () => {
    const appDir = path.join(tmpBase, "enso-apps", "bad_manifest");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, "app.json"), JSON.stringify({ version: 1, spec: { toolFamily: "" }, createdAt: 0 }));
    fs.writeFileSync(path.join(appDir, "template.jsx"), "");

    const loaded = loadApps(tmpBase);
    expect(loaded).toHaveLength(0);
  });
});

describe("registerLoadedApp", () => {
  it("calls all 5 registration functions", () => {
    const app = makeSavedApp();
    saveApp(app, tmpBase);
    const loaded = loadApps(tmpBase);

    registerLoadedApp(loaded[0]);

    // 2 tools registered
    expect(registerGeneratedTool).toHaveBeenCalledTimes(2);
    expect(registerGeneratedTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "enso_workout_plan_week" }),
    );
    expect(registerGeneratedTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "enso_workout_swap_exercise" }),
    );

    // Template metadata registered
    expect(registerToolTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        toolFamily: "workout_planner",
        signatureId: "weekly_workout_plan",
      }),
    );

    // Data hint registered
    expect(registerToolTemplateDataHint).toHaveBeenCalledWith(
      expect.objectContaining({
        toolFamily: "workout_planner",
        requiredKeys: ["tool", "goal", "days"],
      }),
    );

    // Template code registered
    expect(registerGeneratedTemplateCode).toHaveBeenCalledWith(
      "weekly_workout_plan",
      TEMPLATE_JSX,
    );

    // Capability added
    expect(addCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        toolFamily: "workout_planner",
        fallbackToolName: "enso_workout_plan_week",
        actionSuffixes: ["plan_week", "swap_exercise"],
      }),
    );
  });

  it("skips tools without executor bodies", () => {
    const loaded = {
      spec: SAMPLE_SPEC,
      executors: new Map([["plan_week", EXECUTOR_PLAN_WEEK]]),
      templateJSX: TEMPLATE_JSX,
    };

    registerLoadedApp(loaded);

    // Only 1 tool registered (swap_exercise has no body)
    expect(registerGeneratedTool).toHaveBeenCalledTimes(1);
    expect(registerGeneratedTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "enso_workout_plan_week" }),
    );
  });
});

describe("loadAndRegisterSavedApps", () => {
  it("loads and registers all saved apps", () => {
    saveApp(makeSavedApp(), tmpBase);

    const count = loadAndRegisterSavedApps(tmpBase);
    expect(count).toBe(1);
    expect(registerGeneratedTool).toHaveBeenCalledTimes(2);
    expect(addCapability).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when no apps exist", () => {
    const count = loadAndRegisterSavedApps(tmpBase);
    expect(count).toBe(0);
  });
});

describe("deleteApp", () => {
  it("removes app and skill directories", () => {
    saveApp(makeSavedApp(), tmpBase);

    const appDir = path.join(tmpBase, "enso-apps", "workout_planner");
    const skillDir = path.join(tmpBase, "skills", "workout_planner");
    expect(fs.existsSync(appDir)).toBe(true);
    expect(fs.existsSync(skillDir)).toBe(true);

    const removed = deleteApp("workout_planner", tmpBase);
    expect(removed).toBe(true);
    expect(fs.existsSync(appDir)).toBe(false);
    expect(fs.existsSync(skillDir)).toBe(false);
  });

  it("returns false when app does not exist", () => {
    const removed = deleteApp("nonexistent", tmpBase);
    expect(removed).toBe(false);
  });
});

describe("unregisterApp", () => {
  it("calls all unregister functions for the app's spec", () => {
    unregisterApp(SAMPLE_SPEC);

    // Should unregister both tool executors
    expect(unregisterGeneratedTool).toHaveBeenCalledTimes(2);
    expect(unregisterGeneratedTool).toHaveBeenCalledWith("enso_workout_plan_week");
    expect(unregisterGeneratedTool).toHaveBeenCalledWith("enso_workout_swap_exercise");

    // Should unregister template code
    expect(unregisterGeneratedTemplateCode).toHaveBeenCalledWith("weekly_workout_plan");

    // Should unregister tool template
    expect(unregisterToolTemplate).toHaveBeenCalledWith("workout_planner", "weekly_workout_plan");

    // Should unregister data hints
    expect(unregisterToolTemplateDataHints).toHaveBeenCalledWith("workout_planner");

    // Should remove capability
    expect(removeCapability).toHaveBeenCalledWith("workout_planner");
  });
});

describe("deleteAllApps", () => {
  it("deletes all saved apps from disk and unregisters from memory", () => {
    // Save two apps
    saveApp(makeSavedApp(), tmpBase);

    const spec2: PluginSpec = {
      ...SAMPLE_SPEC,
      toolFamily: "yoga_planner",
      toolPrefix: "enso_yoga_",
      signatureId: "weekly_yoga_plan",
    };
    const app2: SavedApp = {
      spec: spec2,
      executors: new Map([["plan_week", EXECUTOR_PLAN_WEEK]]),
      templateJSX: TEMPLATE_JSX,
      skillMd: SKILL_MD,
      createdAt: Date.now(),
    };
    saveApp(app2, tmpBase);

    // Verify both exist
    expect(loadApps(tmpBase)).toHaveLength(2);

    // Delete all
    const deleted = deleteAllApps(tmpBase);

    // Should return both families
    expect(deleted).toHaveLength(2);
    expect(deleted).toContain("workout_planner");
    expect(deleted).toContain("yoga_planner");

    // Verify disk is clean
    expect(loadApps(tmpBase)).toHaveLength(0);

    // Verify unregister functions were called for both apps
    // workout_planner has 2 tools, yoga_planner has 1 (only plan_week had a body)
    expect(unregisterGeneratedTool).toHaveBeenCalledWith("enso_workout_plan_week");
    expect(unregisterGeneratedTool).toHaveBeenCalledWith("enso_workout_swap_exercise");
    expect(unregisterGeneratedTool).toHaveBeenCalledWith("enso_yoga_plan_week");
    expect(removeCapability).toHaveBeenCalledWith("workout_planner");
    expect(removeCapability).toHaveBeenCalledWith("yoga_planner");
  });

  it("returns empty array when no apps exist", () => {
    const deleted = deleteAllApps(tmpBase);
    expect(deleted).toHaveLength(0);
  });
});

describe("generateSkillMd", () => {
  it("produces valid YAML frontmatter and tool list", () => {
    const md = generateSkillMd(SAMPLE_SPEC);

    // Has YAML frontmatter
    expect(md).toMatch(/^---\n/);
    expect(md).toContain("name: workout_planner");
    expect(md).toContain('description: "Weekly workout planning');

    // Has title
    expect(md).toContain("# Workout Planner");

    // Lists both tools
    expect(md).toContain("### enso_workout_plan_week (primary)");
    expect(md).toContain("### enso_workout_swap_exercise");

    // Includes parameter info
    expect(md).toContain("`goal` (string)");
    expect(md).toContain("`day` (number)");
    expect(md).toContain("`newExercise` (string)");
  });

  it("escapes double quotes in description", () => {
    const spec: PluginSpec = {
      ...SAMPLE_SPEC,
      description: 'Plan "awesome" workouts',
    };
    const md = generateSkillMd(spec);
    expect(md).toContain('description: "Plan \\"awesome\\" workouts"');
  });

  it("uses userProposal as body when provided", () => {
    const proposal = `# Workout Planner

Plan personalized weekly workouts based on your fitness goals.

## Tools

### Generate Plan (primary)
Create a full weekly workout plan.

### Swap Exercise
Replace a specific exercise in a day's workout.`;

    const md = generateSkillMd(SAMPLE_SPEC, proposal);

    // Has YAML frontmatter from spec
    expect(md).toMatch(/^---\n/);
    expect(md).toContain("name: workout_planner");
    expect(md).toContain('description: "Weekly workout planning');

    // Contains the user's proposal text
    expect(md).toContain("Plan personalized weekly workouts");

    // Has Tool Reference section with precise tool names from spec
    expect(md).toContain("## Tool Reference");
    expect(md).toContain("### enso_workout_plan_week (primary)");
    expect(md).toContain("### enso_workout_swap_exercise");

    // Has parameter details
    expect(md).toContain("`goal` (string)");
    expect(md).toContain("`day` (number)");
  });

  it("falls back to spec-only generation when no proposal", () => {
    const mdWithProposal = generateSkillMd(SAMPLE_SPEC, undefined);
    const mdWithout = generateSkillMd(SAMPLE_SPEC);

    // Both should be identical — existing behavior preserved
    expect(mdWithProposal).toBe(mdWithout);
  });
});

describe("registered tool executors work", () => {
  it("re-hydrated executors produce correct output with ctx (3-param)", () => {
    const app = makeSavedApp();
    saveApp(app, tmpBase);
    const loaded = loadApps(tmpBase);

    // Manually reconstruct an executor with 3 params (ctx ignored by old executors)
    const body = loaded[0].executors.get("plan_week")!;
    const fn = new Function("callId", "params", "ctx", body) as (
      callId: string,
      params: Record<string, unknown>,
      ctx: unknown,
    ) => { content: Array<{ type: string; text?: string }> };

    const dummyCtx = {};
    const result = fn("test", { goal: "strength" }, dummyCtx);
    expect(result.content[0].text).toBeDefined();
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.tool).toBe("enso_workout_plan_week");
    expect(parsed.goal).toBe("strength");
  });

  it("old 2-param executor bodies work fine with 3-param Function (backward compat)", () => {
    // An old executor body that doesn't reference ctx at all
    const oldBody = `var x = params.goal || "default";
return { content: [{ type: "text", text: JSON.stringify({ tool: "test_tool", goal: x }) }] };`;

    const fn = new Function("callId", "params", "ctx", oldBody) as (
      callId: string,
      params: Record<string, unknown>,
      ctx: unknown,
    ) => { content: Array<{ type: string; text?: string }> };

    const result = fn("test", { goal: "power" }, {});
    const parsed = JSON.parse(result.content[0].text!);
    expect(parsed.tool).toBe("test_tool");
    expect(parsed.goal).toBe("power");
  });
});

describe("buildExecutorContext", () => {
  it("returns an object with all expected methods", () => {
    const ctx = buildExecutorContext("test_family", "test_suffix");
    expect(typeof ctx.callTool).toBe("function");
    expect(typeof ctx.listDir).toBe("function");
    expect(typeof ctx.readFile).toBe("function");
    expect(typeof ctx.searchFiles).toBe("function");
    expect(typeof ctx.fetch).toBe("function");
  });
});
