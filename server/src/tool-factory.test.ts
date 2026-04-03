import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock external modules ──


const mockCallGemini = vi.fn<(prompt: string, apiKey: string, model?: string) => Promise<string>>();

vi.mock("./ui-generator.js", () => ({
  callGeminiLLMWithRetry: (...args: unknown[]) => mockCallGemini(args[0] as string, args[1] as string, args[2] as string | undefined),
  GEMINI_MODEL_PRO: "gemini-3-pro-preview",
  STRUCTURED_DATA_SYSTEM_PROMPT: "You build apps.",
}));

vi.mock("./native-tools/registry.js", () => ({
  registerToolTemplate: vi.fn(),
  registerToolTemplateDataHint: vi.fn(),
  registerGeneratedTool: vi.fn(),
  registerGeneratedTemplateCode: vi.fn(),
  executeToolDirect: vi.fn(async () => ({
    success: true,
    data: { tool: "enso_workout_plan_week", goal: "strength", days: [{ day: 1, exercises: ["squats"] }] },
  })),
}));

vi.mock("./app-catalog.js", () => ({
  APP_CATALOG: [],
  registerApp: vi.fn(),
}));

vi.mock("./outbound.js", () => ({
  registerCardContext: vi.fn(),
}));

vi.mock("./app-persistence.js", () => ({
  saveApp: vi.fn(),
  generateSkillMd: vi.fn((_spec: unknown, _proposal?: string) => "---\nname: workout_planner\n---\n\n# Workout Planner\n"),
  buildExecutorContext: vi.fn(() => ({
    callTool: vi.fn().mockResolvedValue({ success: false, data: null, error: "not available in test" }),
    listDir: vi.fn().mockResolvedValue({ success: false, data: null, error: "not available in test" }),
    readFile: vi.fn().mockResolvedValue({ success: false, data: null, error: "not available in test" }),
    searchFiles: vi.fn().mockResolvedValue({ success: false, data: null, error: "not available in test" }),
    fetch: vi.fn().mockResolvedValue({ ok: false, status: 0, data: "not available in test" }),
  })),
}));

vi.mock("./accounts.js", () => ({
  resolveEnsoAccount: vi.fn(),
}));

vi.mock("./server.js", () => ({
  toMediaUrl: vi.fn(),
  MAX_MEDIA_FILE_SIZE: 300 * 1024 * 1024,
  getActiveAccount: vi.fn(() => null),
}));

// ── Import SUT (after mocks) ──

import { validateToolExecutor, validateTemplateJSX } from "./tool-factory.js";

// ── Sample Data ──

const EXECUTE_BODY_PLAN_WEEK = `
var goal = (params.goal || "").trim() || "general fitness";
var days = Array.from({ length: 5 }).map(function(_, idx) {
  return { day: idx + 1, exercises: ["Exercise " + (idx + 1) + " for " + goal] };
});
return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workout_plan_week", goal: goal, days: days }) }] };
`;

const VALID_TEMPLATE_JSX = `export default function GeneratedUI({ data, onAction, theme }) {
  var days = Array.isArray(data?.days) ? data.days : [];
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700">
      <div className="text-sm font-semibold text-gray-100">Workout Plan</div>
      {days.map(function(d, i) {
        return <div key={i} className="text-xs text-gray-300">{d.exercises.join(", ")}</div>;
      })}
      <button onClick={function() { onAction("refresh", {}); }}>Refresh</button>
      <button onClick={function() { onAction("swap_exercise", { day: 1 }); }}>Swap</button>
      <button onClick={function() { onAction("track_progress", { goal: data?.goal }); }}>Progress</button>
    </div>
  );
}`;

// ── Tests ──

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validateToolExecutor", () => {
  it("accepts valid execute function", async () => {
    const result = await validateToolExecutor({
      executeBody: EXECUTE_BODY_PLAN_WEEK,
      sampleParams: { goal: "strength" },
      expectedKeys: ["tool", "goal", "days"],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects execute function that throws", async () => {
    const result = await validateToolExecutor({
      executeBody: "throw new Error('boom');",
      sampleParams: {},
      expectedKeys: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Execute function error"))).toBe(true);
  });

  it("rejects execute function with wrong output shape", async () => {
    const result = await validateToolExecutor({
      executeBody: 'return { wrong: "shape" };',
      sampleParams: {},
      expectedKeys: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("did not return expected"))).toBe(true);
  });

  it("reports missing expected data keys", async () => {
    const body = 'return { content: [{ type: "text", text: JSON.stringify({ only: "one key" }) }] };';
    const result = await validateToolExecutor({
      executeBody: body,
      sampleParams: {},
      expectedKeys: ["tool", "goal", "days"],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Missing expected key "tool"'))).toBe(true);
    expect(result.errors.some((e) => e.includes('Missing expected key "goal"'))).toBe(true);
  });
});

describe("validateTemplateJSX", () => {
  it("accepts valid JSX template", async () => {
    const result = await validateTemplateJSX(VALID_TEMPLATE_JSX);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects template JSX with syntax errors", async () => {
    const result = await validateTemplateJSX("export default function Broken({ data }) { return <div unclosed }");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Template JSX compilation error"))).toBe(true);
  });
});
