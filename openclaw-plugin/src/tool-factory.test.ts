import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock external modules ──

vi.mock("openclaw/plugin-sdk", () => ({}));

const mockCallGemini = vi.fn<(prompt: string, apiKey: string) => Promise<string>>();

vi.mock("./ui-generator.js", () => ({
  callGeminiLLMWithRetry: (...args: unknown[]) => mockCallGemini(args[0] as string, args[1] as string),
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

vi.mock("./tool-families/catalog.js", () => ({
  TOOL_FAMILY_CAPABILITIES: [],
  addCapability: vi.fn(),
}));

vi.mock("./outbound.js", () => ({
  registerCardContext: vi.fn(),
}));

const mockSaveApp = vi.fn();
vi.mock("./app-persistence.js", () => ({
  saveApp: (...args: unknown[]) => mockSaveApp(...args),
  generateSkillMd: vi.fn((_spec: unknown, _proposal?: string) => "---\nname: workout_planner\n---\n\n# Workout Planner\n"),
}));

vi.mock("./accounts.js", () => ({
  resolveEnsoAccount: vi.fn(),
}));

vi.mock("./server.js", () => ({
  toMediaUrl: vi.fn(),
  MAX_MEDIA_FILE_SIZE: 300 * 1024 * 1024,
  getActiveAccount: vi.fn(() => null),
}));

// ── Helpers ──

import type { ServerMessage } from "./types.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";

function mockAccount(): ResolvedEnsoAccount {
  return {
    accountId: "default",
    enabled: true,
    name: "test",
    configured: true,
    port: 3001,
    host: "0.0.0.0",
    geminiApiKey: "test-gemini-key",
    mode: "full",
    config: { mode: "full" },
  };
}

function mockClient(): ConnectedClient & { messages: ServerMessage[] } {
  const messages: ServerMessage[] = [];
  return {
    id: "test-conn",
    sessionKey: "enso_test",
    ws: {} as any,
    send: vi.fn((msg: ServerMessage) => messages.push(msg)),
    messages,
  };
}

// ── Import SUT (after mocks) ──

import { handleBuildTool, validateToolExecutor, validateTemplateJSX, generateAppProposal } from "./tool-factory.js";
import { registerToolTemplate, registerToolTemplateDataHint, registerGeneratedTool, registerGeneratedTemplateCode, executeToolDirect } from "./native-tools/registry.js";
import { addCapability } from "./tool-families/catalog.js";
import { registerCardContext } from "./outbound.js";
import { generateSkillMd } from "./app-persistence.js";

// ── Sample Gemini Responses — Multi-Tool Plugin ──

const VALID_PLUGIN_SPEC = JSON.stringify({
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
    {
      suffix: "track_progress",
      description: "Show progress statistics for the workout goal",
      parameters: { type: "object", properties: { goal: { type: "string" } }, required: ["goal"] },
      sampleParams: { goal: "strength" },
      sampleData: { tool: "enso_workout_track_progress", goal: "strength", weeksDone: 3, improvement: "15%" },
      requiredDataKeys: ["tool", "goal"],
      isPrimary: false,
    },
  ],
});

const EXECUTE_BODY_PLAN_WEEK = `
var goal = (params.goal || "").trim() || "general fitness";
var days = Array.from({ length: 5 }).map(function(_, idx) {
  return { day: idx + 1, exercises: ["Exercise " + (idx + 1) + " for " + goal] };
});
return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workout_plan_week", goal: goal, days: days }) }] };
`;

const EXECUTE_BODY_SWAP_EXERCISE = `
var day = Number(params.day) || 1;
var newExercise = (params.newExercise || "").trim() || "lunges";
return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workout_swap_exercise", day: day, oldExercise: "squats", newExercise: newExercise }) }] };
`;

const EXECUTE_BODY_TRACK_PROGRESS = `
var goal = (params.goal || "").trim() || "general fitness";
return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_workout_track_progress", goal: goal, weeksDone: 3, improvement: "15%" }) }] };
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

describe("handleBuildTool", () => {
  it("sends enhanceResult null when no geminiApiKey", async () => {
    const client = mockClient();
    const account = mockAccount();
    account.geminiApiKey = undefined;

    await handleBuildTool({
      cardId: "card-1",
      cardText: "Some text",
      toolDefinition: "A workout planner",
      client,
      account,
    });

    const finals = client.messages.filter((m) => m.state === "final");
    expect(finals).toHaveLength(1);
    expect(finals[0].enhanceResult).toBeNull();
  });

  it("sends progress deltas during the build pipeline", async () => {
    const client = mockClient();
    const account = mockAccount();

    // spec + 3 executor bodies (parallel) + template = 5 Gemini calls
    mockCallGemini
      .mockResolvedValueOnce(VALID_PLUGIN_SPEC)
      .mockResolvedValueOnce(EXECUTE_BODY_PLAN_WEEK)
      .mockResolvedValueOnce(EXECUTE_BODY_SWAP_EXERCISE)
      .mockResolvedValueOnce(EXECUTE_BODY_TRACK_PROGRESS)
      .mockResolvedValueOnce(VALID_TEMPLATE_JSX);

    await handleBuildTool({
      cardId: "card-2",
      cardText: "Some workout text",
      toolDefinition: "A workout planner",
      client,
      account,
    });

    const deltas = client.messages.filter((m) => m.state === "delta");
    const labels = deltas.map((d) => d.operation?.label).filter(Boolean);

    expect(labels).toContain("Designing app");
    expect(labels).toContain("Generating tools (3)");
    expect(labels).toContain("Generating UI template");
    expect(labels).toContain("Validating app");
    expect(labels).toContain("Registering app");
    expect(labels).toContain("Saving app");
    expect(labels).toContain("Running primary tool");
  });

  it("registers all tools in the plugin on success", async () => {
    const client = mockClient();
    const account = mockAccount();

    mockCallGemini
      .mockResolvedValueOnce(VALID_PLUGIN_SPEC)
      .mockResolvedValueOnce(EXECUTE_BODY_PLAN_WEEK)
      .mockResolvedValueOnce(EXECUTE_BODY_SWAP_EXERCISE)
      .mockResolvedValueOnce(EXECUTE_BODY_TRACK_PROGRESS)
      .mockResolvedValueOnce(VALID_TEMPLATE_JSX);

    await handleBuildTool({
      cardId: "card-3",
      cardText: "Some workout text",
      toolDefinition: "A workout planner",
      client,
      account,
    });

    // All 3 tools registered
    expect(registerGeneratedTool).toHaveBeenCalledTimes(3);
    expect(registerGeneratedTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "enso_workout_plan_week" }),
    );
    expect(registerGeneratedTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "enso_workout_swap_exercise" }),
    );
    expect(registerGeneratedTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "enso_workout_track_progress" }),
    );

    // One template registered for the family
    expect(registerToolTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        toolFamily: "workout_planner",
        signatureId: "weekly_workout_plan",
      }),
    );

    // Capability includes all 3 suffixes
    expect(addCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        toolFamily: "workout_planner",
        fallbackToolName: "enso_workout_plan_week",
        actionSuffixes: ["plan_week", "swap_exercise", "track_progress"],
      }),
    );

    // Card context registered with primary tool as fallback
    expect(registerCardContext).toHaveBeenCalledWith(
      "card-3",
      expect.objectContaining({
        toolFamily: "workout_planner",
        signatureId: "weekly_workout_plan",
        interactionMode: "tool",
        nativeToolHint: expect.objectContaining({
          toolName: "enso_workout_plan_week",
          handlerPrefix: "enso_workout_",
        }),
      }),
    );
  });

  it("sends enhanceResult with buildSummary listing all tools", async () => {
    const client = mockClient();
    const account = mockAccount();

    mockCallGemini
      .mockResolvedValueOnce(VALID_PLUGIN_SPEC)
      .mockResolvedValueOnce(EXECUTE_BODY_PLAN_WEEK)
      .mockResolvedValueOnce(EXECUTE_BODY_SWAP_EXERCISE)
      .mockResolvedValueOnce(EXECUTE_BODY_TRACK_PROGRESS)
      .mockResolvedValueOnce(VALID_TEMPLATE_JSX);

    await handleBuildTool({
      cardId: "card-4",
      cardText: "Some workout text",
      toolDefinition: "A workout planner",
      client,
      account,
    });

    const finals = client.messages.filter((m) => m.state === "final");
    expect(finals).toHaveLength(1);
    expect(finals[0].enhanceResult).not.toBeNull();
    expect(finals[0].enhanceResult?.generatedUI).toBe(VALID_TEMPLATE_JSX);
    expect(finals[0].targetCardId).toBe("card-4");

    const summary = finals[0].enhanceResult?.buildSummary;
    expect(summary).toBeDefined();
    expect(summary?.toolFamily).toBe("workout_planner");
    expect(summary?.toolNames).toEqual([
      "enso_workout_plan_week",
      "enso_workout_swap_exercise",
      "enso_workout_track_progress",
    ]);
    expect(summary?.description).toBe("Weekly workout planning with exercises, swaps, and progress tracking");
    expect(summary?.scenario).toBe("A workout planner");
    expect(summary?.actions).toEqual(["plan_week", "swap_exercise", "track_progress"]);
    expect(summary?.skillGenerated).toBe(true);
    expect(summary?.persisted).toBe(true);
  });

  it("passes toolDefinition as userProposal to generateSkillMd", async () => {
    const client = mockClient();
    const account = mockAccount();

    mockCallGemini
      .mockResolvedValueOnce(VALID_PLUGIN_SPEC)
      .mockResolvedValueOnce(EXECUTE_BODY_PLAN_WEEK)
      .mockResolvedValueOnce(EXECUTE_BODY_SWAP_EXERCISE)
      .mockResolvedValueOnce(EXECUTE_BODY_TRACK_PROGRESS)
      .mockResolvedValueOnce(VALID_TEMPLATE_JSX);

    await handleBuildTool({
      cardId: "card-proposal",
      cardText: "Some workout text",
      toolDefinition: "# My Workout App\n\nA custom workout planner...",
      client,
      account,
    });

    // generateSkillMd should have been called with the spec and the toolDefinition as proposal
    expect(generateSkillMd).toHaveBeenCalledWith(
      expect.objectContaining({ toolFamily: "workout_planner" }),
      "# My Workout App\n\nA custom workout planner...",
    );
  });

  it("calls saveApp with correct args on success", async () => {
    const client = mockClient();
    const account = mockAccount();

    mockCallGemini
      .mockResolvedValueOnce(VALID_PLUGIN_SPEC)
      .mockResolvedValueOnce(EXECUTE_BODY_PLAN_WEEK)
      .mockResolvedValueOnce(EXECUTE_BODY_SWAP_EXERCISE)
      .mockResolvedValueOnce(EXECUTE_BODY_TRACK_PROGRESS)
      .mockResolvedValueOnce(VALID_TEMPLATE_JSX);

    await handleBuildTool({
      cardId: "card-save",
      cardText: "Some workout text",
      toolDefinition: "A workout planner",
      client,
      account,
    });

    expect(mockSaveApp).toHaveBeenCalledTimes(1);
    const savedApp = mockSaveApp.mock.calls[0][0];
    expect(savedApp.spec.toolFamily).toBe("workout_planner");
    expect(savedApp.executors).toBeInstanceOf(Map);
    expect(savedApp.executors.size).toBe(3);
    expect(savedApp.templateJSX).toBe(VALID_TEMPLATE_JSX);
    expect(savedApp.skillMd).toBeDefined();
    expect(savedApp.createdAt).toBeGreaterThan(0);
  });

  it("continues when saveApp throws", async () => {
    const client = mockClient();
    const account = mockAccount();

    mockSaveApp.mockImplementationOnce(() => { throw new Error("disk full"); });

    mockCallGemini
      .mockResolvedValueOnce(VALID_PLUGIN_SPEC)
      .mockResolvedValueOnce(EXECUTE_BODY_PLAN_WEEK)
      .mockResolvedValueOnce(EXECUTE_BODY_SWAP_EXERCISE)
      .mockResolvedValueOnce(EXECUTE_BODY_TRACK_PROGRESS)
      .mockResolvedValueOnce(VALID_TEMPLATE_JSX);

    await handleBuildTool({
      cardId: "card-persist-fail",
      cardText: "Some text",
      toolDefinition: "A planner",
      client,
      account,
    });

    // Should still succeed despite persistence failure
    const finals = client.messages.filter((m) => m.state === "final");
    expect(finals).toHaveLength(1);
    expect(finals[0].enhanceResult).not.toBeNull();

    // buildSummary should reflect persistence failure
    const summary = finals[0].enhanceResult?.buildSummary;
    expect(summary?.persisted).toBe(false);
    expect(summary?.skillGenerated).toBe(true); // skill was generated before saveApp throws
  });

  it("sends enhanceResult null on Gemini spec failure", async () => {
    const client = mockClient();
    const account = mockAccount();

    mockCallGemini.mockRejectedValueOnce(new Error("Gemini timeout"));

    await handleBuildTool({
      cardId: "card-5",
      cardText: "Some text",
      toolDefinition: "A tool",
      client,
      account,
    });

    const finals = client.messages.filter((m) => m.state === "final");
    expect(finals).toHaveLength(1);
    expect(finals[0].enhanceResult).toBeNull();
  });

  it("sends enhanceResult null on invalid spec JSON", async () => {
    const client = mockClient();
    const account = mockAccount();

    mockCallGemini.mockResolvedValueOnce("not valid json");

    await handleBuildTool({
      cardId: "card-6",
      cardText: "Some text",
      toolDefinition: "A tool",
      client,
      account,
    });

    const finals = client.messages.filter((m) => m.state === "final");
    expect(finals).toHaveLength(1);
    expect(finals[0].enhanceResult).toBeNull();
  });

  it("drops failing non-primary tool but succeeds with rest", async () => {
    const client = mockClient();
    const account = mockAccount();
    const badExecuteBody = "throw new Error('bad code');";

    // spec + 3 executors (plan=good, swap=bad, progress=good) + template + retry swap (still bad)
    mockCallGemini
      .mockResolvedValueOnce(VALID_PLUGIN_SPEC)
      .mockResolvedValueOnce(EXECUTE_BODY_PLAN_WEEK)     // plan_week (good)
      .mockResolvedValueOnce(badExecuteBody)              // swap_exercise (bad)
      .mockResolvedValueOnce(EXECUTE_BODY_TRACK_PROGRESS) // track_progress (good)
      .mockResolvedValueOnce(VALID_TEMPLATE_JSX)          // template
      .mockResolvedValueOnce(badExecuteBody);             // retry swap_exercise (still bad)

    await handleBuildTool({
      cardId: "card-7",
      cardText: "Some workout text",
      toolDefinition: "A workout planner",
      client,
      account,
    });

    const finals = client.messages.filter((m) => m.state === "final");
    expect(finals).toHaveLength(1);
    expect(finals[0].enhanceResult).not.toBeNull();

    // Only 2 tools registered (swap_exercise was dropped)
    expect(registerGeneratedTool).toHaveBeenCalledTimes(2);
    expect(registerGeneratedTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "enso_workout_plan_week" }),
    );
    expect(registerGeneratedTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "enso_workout_track_progress" }),
    );

    // buildSummary reflects only successful tools
    const summary = finals[0].enhanceResult?.buildSummary;
    expect(summary?.toolNames).toEqual(["enso_workout_plan_week", "enso_workout_track_progress"]);
    expect(summary?.actions).toEqual(["plan_week", "track_progress"]);
  });

  it("fails entirely when primary tool fails validation", async () => {
    const client = mockClient();
    const account = mockAccount();
    const badExecuteBody = "throw new Error('bad code');";

    // spec + 3 executors (plan=bad, swap=good, progress=good) + template + retry plan (still bad)
    mockCallGemini
      .mockResolvedValueOnce(VALID_PLUGIN_SPEC)
      .mockResolvedValueOnce(badExecuteBody)              // plan_week (bad — primary)
      .mockResolvedValueOnce(EXECUTE_BODY_SWAP_EXERCISE)  // swap_exercise (good)
      .mockResolvedValueOnce(EXECUTE_BODY_TRACK_PROGRESS) // track_progress (good)
      .mockResolvedValueOnce(VALID_TEMPLATE_JSX)          // template
      .mockResolvedValueOnce(badExecuteBody);             // retry plan_week (still bad)

    await handleBuildTool({
      cardId: "card-8",
      cardText: "Some text",
      toolDefinition: "A tool",
      client,
      account,
    });

    const finals = client.messages.filter((m) => m.state === "final");
    expect(finals).toHaveLength(1);
    expect(finals[0].enhanceResult).toBeNull();

    // No tools registered since primary failed
    expect(registerGeneratedTool).not.toHaveBeenCalled();
  });

  it("retries primary tool executor once on validation failure", async () => {
    const client = mockClient();
    const account = mockAccount();
    const badExecuteBody = "throw new Error('bad code');";

    // spec + 3 executors (plan=bad, swap=good, progress=good) + template + retry plan (good)
    mockCallGemini
      .mockResolvedValueOnce(VALID_PLUGIN_SPEC)
      .mockResolvedValueOnce(badExecuteBody)              // plan_week (bad — primary)
      .mockResolvedValueOnce(EXECUTE_BODY_SWAP_EXERCISE)  // swap_exercise (good)
      .mockResolvedValueOnce(EXECUTE_BODY_TRACK_PROGRESS) // track_progress (good)
      .mockResolvedValueOnce(VALID_TEMPLATE_JSX)          // template
      .mockResolvedValueOnce(EXECUTE_BODY_PLAN_WEEK);     // retry plan_week (now good)

    await handleBuildTool({
      cardId: "card-9",
      cardText: "Some workout text",
      toolDefinition: "A workout planner",
      client,
      account,
    });

    // Should have called Gemini 6 times: spec + 3 executors + template + 1 retry
    expect(mockCallGemini).toHaveBeenCalledTimes(6);

    const finals = client.messages.filter((m) => m.state === "final");
    expect(finals).toHaveLength(1);
    expect(finals[0].enhanceResult).not.toBeNull();

    // All 3 tools registered after retry
    expect(registerGeneratedTool).toHaveBeenCalledTimes(3);
  });
});

describe("generateAppProposal", () => {
  it("returns fallback template when no API key", async () => {
    const result = await generateAppProposal({
      cardText: "Here are the top movies in HK",
      conversationContext: "[user] show me movies\n\n[assistant] Here are the top movies",
      apiKey: undefined,
    });

    expect(result).toContain("# New App");
    expect(result).toContain("## Tools");
    expect(result).toContain("(primary)");
  });

  it("calls Gemini and returns cleaned proposal on success", async () => {
    const proposalResponse = `# HK Movie Guide

Browse currently showing movies in Hong Kong cinemas.

## Tools

### Browse Movies (primary)
Show currently screening movies with title, genre, rating.

### Movie Details
Get detailed info about a specific movie.`;

    mockCallGemini.mockResolvedValueOnce(proposalResponse);

    const result = await generateAppProposal({
      cardText: "Here are the top movies in HK",
      conversationContext: "[user] show me movies\n\n[assistant] Here are the top movies",
      apiKey: "test-gemini-key",
    });

    expect(result).toBe(proposalResponse);
    expect(mockCallGemini).toHaveBeenCalledTimes(1);
    // Verify prompt includes card text and conversation context
    const prompt = mockCallGemini.mock.calls[0][0];
    expect(prompt).toContain("Here are the top movies in HK");
    expect(prompt).toContain("show me movies");
  });

  it("strips markdown fences from Gemini response", async () => {
    const fencedResponse = "```markdown\n# Movie Guide\n\nBrowse movies.\n\n## Tools\n\n### Browse (primary)\nShow movies.\n```";
    mockCallGemini.mockResolvedValueOnce(fencedResponse);

    const result = await generateAppProposal({
      cardText: "Movies",
      conversationContext: "",
      apiKey: "test-gemini-key",
    });

    expect(result).toMatch(/^# Movie Guide/);
    expect(result).not.toContain("```");
  });

  it("wraps non-heading responses in a heading", async () => {
    mockCallGemini.mockResolvedValueOnce("This is an app that browses movies and shows details.");

    const result = await generateAppProposal({
      cardText: "Movies",
      conversationContext: "",
      apiKey: "test-gemini-key",
    });

    expect(result).toMatch(/^# New App/);
    expect(result).toContain("This is an app that browses movies");
  });

  it("returns fallback template when Gemini call fails", async () => {
    mockCallGemini.mockRejectedValueOnce(new Error("Network error"));

    const result = await generateAppProposal({
      cardText: "Some text",
      conversationContext: "",
      apiKey: "test-gemini-key",
    });

    expect(result).toContain("# New App");
    expect(result).toContain("## Tools");
  });
});
