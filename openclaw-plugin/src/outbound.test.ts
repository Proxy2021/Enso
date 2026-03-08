import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock external modules ──

vi.mock("openclaw/plugin-sdk", () => ({}));

vi.mock("./accounts.js", () => ({
  resolveEnsoAccount: vi.fn(() => mockAccount("full")),
}));

vi.mock("./server.js", () => ({
  toMediaUrl: vi.fn((p: string) => `/media/${Buffer.from(p).toString("base64url")}`),
  MAX_MEDIA_FILE_SIZE: 300 * 1024 * 1024,
  getActiveAccount: vi.fn(() => null),
  getClientsBySession: vi.fn(() => []),
  getClientsByPeerId: vi.fn(() => []),
  getAllClients: vi.fn(() => []),
}));

vi.mock("./ui-generator.js", () => ({
  serverGenerateUI: vi.fn(async () => ({
    code: "<div>generated</div>",
    shapeKey: "test-shape",
    cached: false,
  })),
  serverGenerateUIFromText: vi.fn(async () => ({
    code: "<div>text-generated</div>",
    shapeKey: "text-shape",
    cached: false,
    data: { extracted: true },
  })),
  serverGenerateConstrainedFollowupUI: vi.fn(async () => ({
    code: "<div>constrained-generated</div>",
    shapeKey: "constrained-shape",
    cached: false,
  })),
}));

vi.mock("./native-tools/registry.js", () => ({
  executeToolDirect: vi.fn(async () => ({
    success: true,
    data: { refreshed: true },
  })),
  getActionDescriptions: vi.fn(() => "Actions: refresh"),
  isToolRegistered: vi.fn(() => false),
  getToolPluginId: vi.fn(() => "test-plugin"),
  getPluginToolPrefix: vi.fn(() => "test_"),
  inferToolTemplate: vi.fn(() => undefined),
  getToolTemplate: vi.fn((toolFamily: string, signatureId: string) => {
    if (toolFamily === "enso_tooling" && signatureId === "tool_console") {
      return {
        toolFamily: "enso_tooling",
        signatureId: "tool_console",
        templateId: "tool-console-v1",
        supportedActions: ["refresh", "view_tool_family", "tooling_back", "tooling_add_tool"],
        coverageStatus: "covered",
      };
    }
    if (toolFamily === "filesystem" && signatureId === "directory_listing") {
      return {
        toolFamily: "filesystem",
        signatureId: "directory_listing",
        templateId: "filesystem-browser-v1",
        supportedActions: ["refresh", "list_directory", "read_text_file", "stat_path", "search_paths"],
        coverageStatus: "covered",
      };
    }
    return undefined;
  }),
  getPreferredToolProviderForFamily: vi.fn((toolFamily: string) => {
    if (toolFamily === "filesystem") {
      return { toolName: "enso_fs_list_directory", handlerPrefix: "enso_fs_" };
    }
    return undefined;
  }),
  isToolActionCovered: vi.fn(() => false),
  getToolTemplateCode: vi.fn(() => "<div>tool-template</div>"),
  normalizeDataForToolTemplate: vi.fn((_, data) => data),
  registerToolTemplateCandidate: vi.fn(),
  getGeneratedTemplateCodeBySignature: vi.fn(() => undefined),
  getDataHintForSignature: vi.fn(() => null),
  getRegisteredToolCatalog: vi.fn(() => []),
  isDynamicTool: vi.fn(() => false),
  getExecutorBody: vi.fn(() => null),
  hotSwapExecutor: vi.fn(),
  registerGeneratedTemplateCode: vi.fn(),
}));

vi.mock("./native-tools/tool-call-store.js", () => ({
  consumeRecentToolCall: vi.fn(() => null),
}));

vi.mock("./inbound.js", () => ({
  handleEnsoInbound: vi.fn(async () => {}),
}));

vi.mock("./domain-evolution.js", () => ({
  reportDomainGap: vi.fn(() => "evo_test"),
}));

vi.mock("./tooling-console.js", () => ({
  buildToolConsoleHomeData: vi.fn(() => ({
    view: "home",
    families: [{ toolFamily: "filesystem", toolCount: 4, templateCount: 1 }],
  })),
  buildToolConsoleFamilyData: vi.fn((toolFamily: string) => ({
    view: "family",
    selected: {
      toolFamily,
      tools: ["enso_fs_list_directory"],
      templates: [{ signatureId: "directory_listing", templateId: "filesystem-browser-v1" }],
    },
  })),
  handleToolConsoleAdd: vi.fn((description: string) => ({
    status: description.includes("existing") ? "exists" : "registered",
    message: description.includes("existing") ? "already exists" : "registered",
  })),
}));

vi.mock("./action-log.js", () => ({
  logAction: vi.fn(),
  logError: vi.fn(),
  logFix: vi.fn(),
}));

vi.mock("./app-catalog.js", () => ({
  APP_CATALOG: [],
}));

// ── Helpers ──

import type { ServerMessage } from "./types.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";

function mockAccount(mode: "im" | "ui" | "full"): ResolvedEnsoAccount {
  return {
    accountId: "default",
    enabled: true,
    name: "test",
    configured: true,
    port: 3001,
    host: "0.0.0.0",
    geminiApiKey: "test-key",
    mode,
    config: { mode },
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

function mockRuntime() {
  return {
    log: vi.fn(),
    error: vi.fn(),
  } as any;
}

function finalMessages(messages: ServerMessage[]): ServerMessage[] {
  return messages.filter((m) => m.state === "final");
}

// ── Import SUT (after mocks are set up) ──

import {
  deliverEnsoReply,
  deliverToEnso,
  handlePluginCardAction,
  registerCardContext,
} from "./outbound.js";

import { serverGenerateConstrainedFollowupUI, serverGenerateUI } from "./ui-generator.js";
import { executeToolDirect, getActionDescriptions, inferToolTemplate, isToolRegistered } from "./native-tools/registry.js";
import { resolveEnsoAccount } from "./accounts.js";
import { getAllClients } from "./server.js";
import { handleEnsoInbound } from "./inbound.js";

// ═══════════════════════════════════════════════════════
//  deliverEnsoReply
//  (Now a pure delivery function — no UI gen, no mode checks, no card contexts)
// ═══════════════════════════════════════════════════════

describe("deliverEnsoReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends plain text as a final message", async () => {
    const client = mockClient();
    const account = mockAccount("full");

    await deliverEnsoReply({
      payload: { text: "Hello from the agent" },
      client,
      runId: "run-1",
      seq: 0,
      account,
      userMessage: "hi",
    });

    expect(client.messages).toHaveLength(1);
    const msg = client.messages[0];
    expect(msg.state).toBe("final");
    expect(msg.text).toContain("Hello from the agent");
    // deliverEnsoReply no longer generates UI or extracts data
    expect(msg.generatedUI).toBeUndefined();
    expect(msg.data).toBeUndefined();
  });

  it("passes toolMeta through for claude-code messages", async () => {
    const client = mockClient();
    const account = mockAccount("full");

    await deliverEnsoReply({
      payload: { text: "Claude Code output" },
      client,
      runId: "run-3",
      seq: 0,
      account,
      userMessage: "/code test",
      toolMeta: { toolId: "claude-code" },
    });

    expect(client.messages).toHaveLength(1);
    const msg = client.messages[0];
    expect(msg.toolMeta).toEqual({ toolId: "claude-code" });
    expect(msg.state).toBe("final");
  });

  it("includes steps when multi-block response", async () => {
    const client = mockClient();
    const account = mockAccount("full");
    const now = Date.now();

    const steps = [
      { seq: 0, text: "First I'll check the data", timestamp: now },
      { seq: 1, text: "Here are the results", timestamp: now + 1 },
    ];

    await deliverEnsoReply({
      payload: { text: "Here are the results" },
      client,
      runId: "run-4",
      seq: 1,
      account,
      userMessage: "analyze data",
      steps,
    });

    expect(client.messages).toHaveLength(1);
    const msg = client.messages[0];
    expect(msg.state).toBe("final");
    expect(msg.steps).toEqual(steps);
    // Uses last step's text as primary content
    expect(msg.text).toContain("Here are the results");
  });

  it("sends with targetCardId when provided", async () => {
    const client = mockClient();
    const account = mockAccount("full");

    await deliverEnsoReply({
      payload: { text: "Updated content" },
      client,
      runId: "run-5",
      seq: 0,
      account,
      userMessage: "update",
      targetCardId: "existing-card-123",
    });

    expect(client.messages).toHaveLength(1);
    const msg = client.messages[0];
    expect(msg.targetCardId).toBe("existing-card-123");
  });
});

// ═══════════════════════════════════════════════════════
//  deliverToEnso
//  (Pure delivery — no UI gen, no mode checks)
// ═══════════════════════════════════════════════════════

describe("deliverToEnso", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delivers text to connected clients", async () => {
    const client = mockClient();
    vi.mocked(resolveEnsoAccount).mockReturnValue(mockAccount("full"));
    vi.mocked(getAllClients).mockReturnValue([client]);

    const result = await deliverToEnso({
      to: "enso_test",
      text: "Agent response message",
    });

    expect(result.channel).toBe("enso");
    expect(client.messages).toHaveLength(1);
    const msg = client.messages[0];
    expect(msg.state).toBe("final");
    expect(msg.text).toContain("Agent response");
  });
});

// ═══════════════════════════════════════════════════════
//  handlePluginCardAction
// ═══════════════════════════════════════════════════════

describe("handlePluginCardAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper: create a card with manually registered context
  // (deliverEnsoReply no longer creates card contexts — that's now done by handleCardEnhance)
  function createCardWithContext(mode: "im" | "ui" | "full"): {
    cardId: string;
    client: ConnectedClient & { messages: ServerMessage[] };
  } {
    const client = mockClient();
    const account = mockAccount(mode);
    const cardId = `card-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    registerCardContext(cardId, {
      cardId,
      originalPrompt: "show tasks",
      originalResponse: JSON.stringify({
        columns: [{ name: "To Do", tasks: [{ id: 1, title: "Task 1", priority: "high", assignee: "Alice" }] }],
        projectName: "Test",
      }),
      currentData: {
        columns: [{ name: "To Do", tasks: [{ id: 1, title: "Task 1", priority: "high", assignee: "Alice" }] }],
        projectName: "Test",
      },
      geminiApiKey: account.geminiApiKey,
      account,
      mode,
      actionHistory: [],
      interactionMode: "llm",
    });

    return { cardId, client };
  }

  // ── Missing context error ──

  it("returns error when card context does not exist", async () => {
    const freshClient = mockClient();
    await handlePluginCardAction({
      cardId: "nonexistent-card",
      action: "test",
      payload: {},
      client: freshClient,
      config: {} as any,
      runtime: mockRuntime(),
    });

    const errors = freshClient.messages.filter((m) => m.state === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].text).toContain("Card context not found");
  });

  // ── Full mode: Path 1 (Mechanical action) ──

  it("Full mode + mechanical action: in-place update via targetCardId", async () => {
    const { cardId, client } = createCardWithContext("full");

    await handlePluginCardAction({
      cardId,
      action: "complete_task",
      payload: { taskId: 1 },
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    // Full mode: single message with targetCardId
    const finals = finalMessages(client.messages);
    expect(finals).toHaveLength(1);
    const msg = finals[0];
    expect(msg.targetCardId).toBe(cardId);
    expect(msg.state).toBe("final");
    expect(msg.data).toBeDefined();
    expect(msg.generatedUI).toBeDefined();

    // The task should have been moved to "Done"
    const data = msg.data as any;
    const doneCol = data.columns.find((c: any) => c.name === "Done");
    expect(doneCol).toBeDefined();
    expect(doneCol.tasks).toHaveLength(1);
    expect(doneCol.tasks[0].id).toBe(1);
  });

  // ── UI mode: Path 1 (Mechanical action) ──

  it("UI mode + mechanical action: restore source card + create new card", async () => {
    const { cardId, client } = createCardWithContext("ui");

    await handlePluginCardAction({
      cardId,
      action: "complete_task",
      payload: { taskId: 1 },
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    // UI mode: TWO messages — restore + new card
    const finals = finalMessages(client.messages);
    expect(finals).toHaveLength(2);

    // Message 1: Restore source card (targetCardId, no data/generatedUI)
    const restore = finals[0];
    expect(restore.targetCardId).toBe(cardId);
    expect(restore.state).toBe("final");
    expect(restore.data).toBeUndefined();
    expect(restore.generatedUI).toBeUndefined();

    // Message 2: New card (no targetCardId, has data + generatedUI)
    const newCard = finals[1];
    expect(newCard.targetCardId).toBeUndefined();
    expect(newCard.state).toBe("final");
    expect(newCard.data).toBeDefined();
    expect(newCard.generatedUI).toBeDefined();
    expect(newCard.id).not.toBe(cardId); // Different ID

    // New card data should have the task moved to Done
    const data = newCard.data as any;
    const doneCol = data.columns.find((c: any) => c.name === "Done");
    expect(doneCol).toBeDefined();
    expect(doneCol.tasks[0].id).toBe(1);
  });

  // ── Full mode: Path 2 (Native tool action) ──

  it("Full mode + native tool action: in-place update via targetCardId", async () => {
    const client = mockClient();
    const account = mockAccount("full");
    const cardId = `card-native-full-${Date.now()}`;

    // Register card context with a native tool hint
    registerCardContext(cardId, {
      cardId,
      originalPrompt: "show data",
      originalResponse: JSON.stringify({ items: [{ name: "item1", value: 42 }] }),
      currentData: { items: [{ name: "item1", value: 42 }] },
      geminiApiKey: account.geminiApiKey,
      account,
      mode: "full",
      actionHistory: [],
      interactionMode: "tool",
      appToolHint: {
        toolName: "test_latest_data",
        params: { period: "1d" },
        handlerPrefix: "test_",
      },
    });

    // Trigger a native tool action (refresh)
    vi.mocked(executeToolDirect).mockResolvedValueOnce({
      success: true,
      data: { items: [{ name: "refreshed", value: 99 }] },
    });
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh");

    await handlePluginCardAction({
      cardId,
      action: "refresh",
      payload: {},
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    // Full mode: single message with targetCardId
    const finals = finalMessages(client.messages);
    expect(finals).toHaveLength(1);
    const msg = finals[0];
    expect(msg.targetCardId).toBe(cardId);
    expect(msg.data).toEqual({ items: [{ name: "refreshed", value: 99 }] });
    expect(msg.generatedUI).toBeDefined();
    expect(executeToolDirect).toHaveBeenCalledWith("test_latest_data", { period: "1d" });
  });

  // ── UI mode: Path 2 (Native tool action) ──

  it("UI mode + native tool action: restore source card + create new card", async () => {
    const client = mockClient();
    const account = mockAccount("ui");
    const cardId = `card-native-ui-${Date.now()}`;

    registerCardContext(cardId, {
      cardId,
      originalPrompt: "show data",
      originalResponse: JSON.stringify({ items: [{ name: "item1" }] }),
      currentData: { items: [{ name: "item1" }] },
      geminiApiKey: account.geminiApiKey,
      account,
      mode: "ui",
      actionHistory: [],
      interactionMode: "tool",
      appToolHint: {
        toolName: "test_latest_data",
        params: { period: "1d" },
        handlerPrefix: "test_",
      },
    });

    vi.mocked(executeToolDirect).mockResolvedValueOnce({
      success: true,
      data: { items: [{ name: "refreshed" }] },
    });
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh");

    await handlePluginCardAction({
      cardId,
      action: "refresh",
      payload: {},
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    // UI mode: TWO messages — restore + new card
    const finals = finalMessages(client.messages);
    expect(finals).toHaveLength(2);

    // Restore message
    const restore = finals[0];
    expect(restore.targetCardId).toBe(cardId);
    expect(restore.data).toBeUndefined();
    expect(restore.generatedUI).toBeUndefined();

    // New card
    const newCard = finals[1];
    expect(newCard.targetCardId).toBeUndefined();
    expect(newCard.data).toEqual({ items: [{ name: "refreshed" }] });
    expect(newCard.generatedUI).toBeDefined();
    expect(newCard.id).not.toBe(cardId);
  });

  // ── Full mode: Path 3 (Agent fallback) ──

  it("Full mode + agent fallback: routes to agent with targetCardId", async () => {
    const { cardId, client } = createCardWithContext("full");

    await handlePluginCardAction({
      cardId,
      action: "unknown_action",
      payload: { detail: "test" },
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    // Full mode: handleEnsoInbound called WITH targetCardId
    expect(handleEnsoInbound).toHaveBeenCalledTimes(1);
    const call = vi.mocked(handleEnsoInbound).mock.calls[0][0];
    expect(call.targetCardId).toBe(cardId);
    expect(call.message.text).toContain("unknown_action");

    // No restore message sent (full mode goes directly to agent)
    const finals = finalMessages(client.messages);
    expect(finals).toHaveLength(0);
  });

  // ── UI mode: Path 3 (Agent fallback) ──

  it("UI mode + agent fallback: sends restore, then routes to agent WITHOUT targetCardId", async () => {
    const { cardId, client } = createCardWithContext("ui");

    await handlePluginCardAction({
      cardId,
      action: "unknown_action",
      payload: { detail: "test" },
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    // UI mode: restore message sent FIRST
    const finals = finalMessages(client.messages);
    expect(finals).toHaveLength(1);
    const restore = finals[0];
    expect(restore.targetCardId).toBe(cardId);
    expect(restore.state).toBe("final");
    expect(restore.data).toBeUndefined();
    expect(restore.generatedUI).toBeUndefined();

    // Then handleEnsoInbound called WITHOUT targetCardId
    expect(handleEnsoInbound).toHaveBeenCalledTimes(1);
    const call = vi.mocked(handleEnsoInbound).mock.calls[0][0];
    expect(call.targetCardId).toBeUndefined();
  });

  // ── UI mode: New card gets its own CardContext for chained actions ──

  it("UI mode: new card from action can receive further actions", async () => {
    const { cardId, client } = createCardWithContext("ui");

    // First action: mechanical mutation → restore + new card
    await handlePluginCardAction({
      cardId,
      action: "add_task",
      payload: { title: "New Task", column: "To Do" },
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    let finals = finalMessages(client.messages);
    expect(finals).toHaveLength(2);
    const newCardId = finals[1].id;
    expect(newCardId).not.toBe(cardId);

    // Clear and try another action on the NEW card
    client.messages.length = 0;
    vi.clearAllMocks();

    await handlePluginCardAction({
      cardId: newCardId,
      action: "complete_task",
      payload: { taskId: 2 }, // The newly added task (id auto-incremented to 2)
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    // Should succeed — new card has its own context
    finals = finalMessages(client.messages);
    expect(finals).toHaveLength(2); // restore + another new card
    expect(finals[0].targetCardId).toBe(newCardId);
    expect(finals[1].targetCardId).toBeUndefined();
  });

  // ── send_message action ──

  it("Full mode + send_message action: routes through agent with text", async () => {
    const { cardId, client } = createCardWithContext("full");

    await handlePluginCardAction({
      cardId,
      action: "send_message",
      payload: { text: "Tell me more about this" },
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    expect(handleEnsoInbound).toHaveBeenCalledTimes(1);
    const call = vi.mocked(handleEnsoInbound).mock.calls[0][0];
    expect(call.message.text).toContain("Tell me more about this");
    expect(call.targetCardId).toBe(cardId);
  });

  // ── E2E: AlphaRank covered follow-up ──

  it("AlphaRank E2E: covered follow-up switches to tool mode template path", async () => {
    const client = mockClient();
    const account = mockAccount("full");
    const cardId = `card-alpharank-${Date.now()}`;

    const toolTemplate = {
      toolFamily: "alpharank",
      signatureId: "ranked_predictions_table",
      templateId: "market-top-picks-v1",
      supportedActions: ["refresh", "predictions"],
      coverageStatus: "covered",
    };

    // Register card context with AlphaRank native tool hint
    registerCardContext(cardId, {
      cardId,
      originalPrompt: "show latest stock ranking",
      originalResponse: JSON.stringify({ title: "AlphaRank Predictions", picks: [{ ticker: "NVDA", rank: 1 }] }),
      currentData: { title: "AlphaRank Predictions", picks: [{ ticker: "NVDA", rank: 1 }] },
      geminiApiKey: account.geminiApiKey,
      account,
      mode: "full",
      actionHistory: [],
      interactionMode: "tool",
      toolFamily: "alpharank",
      signatureId: "ranked_predictions_table",
      coverageStatus: "covered",
      appToolHint: {
        toolName: "alpharank_latest_predictions",
        params: { top_n: 10 },
        handlerPrefix: "alpharank_",
      },
    });

    vi.mocked(executeToolDirect).mockResolvedValueOnce({
      success: true,
      data: { title: "AlphaRank Predictions", picks: [{ ticker: "AVGO", rank: 1 }] },
    });
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, predictions");
    vi.mocked(inferToolTemplate).mockReturnValue(toolTemplate);
    vi.mocked(isToolRegistered).mockReturnValue(true);
    const { isToolActionCovered } = await import("./native-tools/registry.js");
    vi.mocked(isToolActionCovered).mockReturnValue(true);

    await handlePluginCardAction({
      cardId,
      action: "refresh",
      payload: {},
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    const finals = finalMessages(client.messages);
    expect(finals).toHaveLength(1);
    expect(finals[0].targetCardId).toBe(cardId);
    expect(finals[0].generatedUI).toBe("<div>tool-template</div>");
    expect(serverGenerateUI).not.toHaveBeenCalled();
    expect(serverGenerateConstrainedFollowupUI).not.toHaveBeenCalled();
    expect(executeToolDirect).toHaveBeenCalledWith("alpharank_latest_predictions", { top_n: 10 });
  });

  // ── E2E: Filesystem tool action ──

  it("Filesystem E2E: tool action maps to enso_fs_* and uses tool template", async () => {
    const client = mockClient();
    const account = mockAccount("full");
    const cardId = `card-filesystem-${Date.now()}`;

    const toolTemplate = {
      toolFamily: "filesystem",
      signatureId: "directory_listing",
      templateId: "filesystem-browser-v1",
      supportedActions: ["refresh", "list_directory", "read_text_file", "stat_path", "search_paths"],
      coverageStatus: "covered",
    };

    // Register card context with filesystem native tool hint
    registerCardContext(cardId, {
      cardId,
      originalPrompt: "list files on desktop",
      originalResponse: JSON.stringify({ path: "/Users/demo/Desktop", items: [{ name: "Github", type: "directory" }] }),
      currentData: { path: "/Users/demo/Desktop", items: [{ name: "Github", path: "/Users/demo/Desktop/Github", type: "directory" }] },
      geminiApiKey: account.geminiApiKey,
      account,
      mode: "full",
      actionHistory: [],
      interactionMode: "tool",
      toolFamily: "filesystem",
      signatureId: "directory_listing",
      coverageStatus: "covered",
      appToolHint: {
        toolName: "enso_fs_list_directory",
        params: { path: "/Users/demo/Desktop" },
        handlerPrefix: "enso_fs_",
      },
    });

    vi.mocked(executeToolDirect).mockResolvedValueOnce({
      success: true,
      data: { path: "/Users/demo/Desktop/Github", items: [{ name: "Enso", path: "/Users/demo/Desktop/Github/Enso", type: "directory" }] },
    });
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, list_directory, read_text_file, stat_path, search_paths");
    vi.mocked(inferToolTemplate).mockReturnValue(toolTemplate);
    vi.mocked(isToolRegistered).mockReturnValue(true);
    const { isToolActionCovered } = await import("./native-tools/registry.js");
    vi.mocked(isToolActionCovered).mockReturnValue(true);

    await handlePluginCardAction({
      cardId,
      action: "list_directory",
      payload: { path: "/Users/demo/Desktop/Github" },
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    const finals = finalMessages(client.messages);
    expect(finals).toHaveLength(1);
    expect(finals[0].targetCardId).toBe(cardId);
    expect(finals[0].generatedUI).toBe("<div>tool-template</div>");
    expect(executeToolDirect).toHaveBeenCalledWith("enso_fs_list_directory", { path: "/Users/demo/Desktop/Github" });
    expect(serverGenerateUI).not.toHaveBeenCalled();
    expect(serverGenerateConstrainedFollowupUI).not.toHaveBeenCalled();
  });

  // ── E2E: Tool Console ──

  it("Tool Console E2E: add action updates card in tool mode", async () => {
    const client = mockClient();
    const account = mockAccount("full");
    const cardId = `card-tooling-${Date.now()}`;

    // Register card context for tool console
    registerCardContext(cardId, {
      cardId,
      originalPrompt: "/tool enso",
      originalResponse: "tool console bootstrap",
      currentData: {
        view: "home",
        families: [{ toolFamily: "filesystem", toolCount: 4, templateCount: 1 }],
      },
      geminiApiKey: account.geminiApiKey,
      account,
      mode: "full",
      actionHistory: [],
      interactionMode: "tool",
      toolFamily: "enso_tooling",
      signatureId: "tool_console",
      coverageStatus: "covered",
    });

    await handlePluginCardAction({
      cardId,
      action: "tooling_add_tool",
      payload: { description: "a brand new legal case management tool" },
      mode: "full",
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    const finals = finalMessages(client.messages).filter((m) => m.targetCardId === cardId);
    expect(finals.length).toBeGreaterThan(0);
    const updated = finals[finals.length - 1];
    expect(updated.cardMode?.interactionMode).toBe("tool");
    expect(updated.cardMode?.toolFamily).toBe("enso_tooling");
    expect(updated.generatedUI).toBe("<div>tool-template</div>");
  });

  // ── E2E: System Tool (generic provider) ──

  it("System Tool E2E: generic provider actions use deterministic system template path", async () => {
    const client = mockClient();
    const account = mockAccount("full");
    const cardId = `card-system-mail-${Date.now()}`;

    const toolTemplate = {
      toolFamily: "system_official_mail",
      signatureId: "system_auto_official_mail",
      templateId: "system-auto-official-mail-v1",
      supportedActions: ["refresh", "list_threads", "read_thread", "archive_thread"],
      coverageStatus: "covered",
    };

    // Register card context with system tool hint
    registerCardContext(cardId, {
      cardId,
      originalPrompt: "show latest official mail threads",
      originalResponse: JSON.stringify({ rows: [{ id: "th_1", title: "Launch update" }] }),
      currentData: { rows: [{ id: "th_1", title: "Launch update" }] },
      geminiApiKey: account.geminiApiKey,
      account,
      mode: "full",
      actionHistory: [],
      interactionMode: "tool",
      toolFamily: "system_official_mail",
      signatureId: "system_auto_official_mail",
      coverageStatus: "covered",
      appToolHint: {
        toolName: "official_mail_list_threads",
        params: { limit: 20 },
        handlerPrefix: "official_mail_",
      },
    });

    vi.mocked(executeToolDirect).mockResolvedValueOnce({
      success: true,
      data: { rows: [{ id: "th_1", title: "Launch update", body: "Detailed content" }] },
    });
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, list_threads, read_thread, archive_thread");
    vi.mocked(inferToolTemplate).mockReturnValue(toolTemplate);
    vi.mocked(isToolRegistered).mockReturnValue(true);
    const { isToolActionCovered } = await import("./native-tools/registry.js");
    vi.mocked(isToolActionCovered).mockReturnValue(true);

    await handlePluginCardAction({
      cardId,
      action: "read_thread",
      payload: { id: "th_1" },
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    const finals = finalMessages(client.messages);
    expect(finals).toHaveLength(1);
    expect(finals[0].targetCardId).toBe(cardId);
    expect(finals[0].generatedUI).toBe("<div>tool-template</div>");
    expect(executeToolDirect).toHaveBeenCalledWith("official_mail_read_thread", { id: "th_1" });
    expect(serverGenerateUI).not.toHaveBeenCalled();
    expect(serverGenerateConstrainedFollowupUI).not.toHaveBeenCalled();
  });
});
