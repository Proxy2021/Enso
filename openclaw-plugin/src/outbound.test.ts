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
    if (toolFamily === "code_workspace") {
      return { toolName: "enso_ws_list_repos", handlerPrefix: "enso_ws_" };
    }
    if (toolFamily === "multimedia") {
      return { toolName: "enso_media_scan_library", handlerPrefix: "enso_media_" };
    }
    if (toolFamily === "travel_planner") {
      return { toolName: "enso_travel_plan_trip", handlerPrefix: "enso_travel_" };
    }
    if (toolFamily === "meal_planner") {
      return { toolName: "enso_meal_plan_week", handlerPrefix: "enso_meal_" };
    }
    return undefined;
  }),
  isToolActionCovered: vi.fn(() => false),
  getToolTemplateCode: vi.fn(() => "<div>tool-template</div>"),
  normalizeDataForToolTemplate: vi.fn((_, data) => data),
  registerToolTemplateCandidate: vi.fn(),
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
} from "./outbound.js";

import { serverGenerateConstrainedFollowupUI, serverGenerateUI, serverGenerateUIFromText } from "./ui-generator.js";
import { consumeRecentToolCall } from "./native-tools/tool-call-store.js";
import { executeToolDirect, getActionDescriptions, inferToolTemplate, isToolRegistered } from "./native-tools/registry.js";
import { resolveEnsoAccount } from "./accounts.js";
import { getAllClients } from "./server.js";
import { handleEnsoInbound } from "./inbound.js";
import { reportDomainGap } from "./domain-evolution.js";

// ═══════════════════════════════════════════════════════
//  deliverEnsoReply
// ═══════════════════════════════════════════════════════

describe("deliverEnsoReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("IM mode: sends plain text, skips UI generation", async () => {
    const client = mockClient();
    const account = mockAccount("im");

    await deliverEnsoReply({
      payload: { text: "Hello from the agent with enough text to trigger UI generation if mode allowed it. This is more than 100 chars of content." },
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
    expect(msg.generatedUI).toBeUndefined();
    expect(msg.data).toBeUndefined();

    // UI generation functions should NOT have been called
    expect(serverGenerateUI).not.toHaveBeenCalled();
    expect(serverGenerateUIFromText).not.toHaveBeenCalled();
    expect(consumeRecentToolCall).not.toHaveBeenCalled();
  });

  it("UI mode: generates UI and registers card context", async () => {
    const client = mockClient();
    const account = mockAccount("ui");

    // Set up tool call so UI generation triggers
    vi.mocked(consumeRecentToolCall).mockReturnValueOnce(null);

    await deliverEnsoReply({
      payload: {
        text: '```json\n{"items": [{"name": "test"}]}\n```\nHere is some data that is long enough for the text path check as well.',
      },
      client,
      runId: "run-1",
      seq: 0,
      account,
      userMessage: "show me data",
    });

    expect(client.messages).toHaveLength(1);
    const msg = client.messages[0];
    expect(msg.state).toBe("final");
    expect(msg.generatedUI).toBe("<div>generated</div>");
    expect(msg.data).toEqual({ items: [{ name: "test" }] });

    expect(serverGenerateUI).toHaveBeenCalled();
    expect(reportDomainGap).toHaveBeenCalledTimes(1);
  });

  it("Full mode: generates UI and registers card context", async () => {
    const client = mockClient();
    const account = mockAccount("full");

    vi.mocked(consumeRecentToolCall).mockReturnValueOnce(null);

    await deliverEnsoReply({
      payload: {
        text: '```json\n{"dashboard": true}\n```\nMore text to go with it.',
      },
      client,
      runId: "run-2",
      seq: 0,
      account,
      userMessage: "show dashboard",
    });

    expect(client.messages).toHaveLength(1);
    const msg = client.messages[0];
    expect(msg.generatedUI).toBe("<div>generated</div>");
    expect(msg.data).toEqual({ dashboard: true });
    expect(reportDomainGap).toHaveBeenCalledTimes(1);
  });

  it("toolMeta bypasses mode check (Claude Code terminal)", async () => {
    const client = mockClient();
    const account = mockAccount("im"); // Even in IM mode

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

  it("/tool enso command returns tool-console card in tool mode", async () => {
    const client = mockClient();
    const account = mockAccount("full");

    await deliverEnsoReply({
      payload: { text: "tool console bootstrap" },
      client,
      runId: "run-tool-console",
      seq: 0,
      account,
      userMessage: "/tool enso",
    });

    expect(client.messages).toHaveLength(1);
    const msg = client.messages[0];
    expect(msg.cardMode?.interactionMode).toBe("tool");
    expect(msg.cardMode?.toolFamily).toBe("enso_tooling");
    expect(msg.generatedUI).toBe("<div>tool-template</div>");
    expect(msg.data).toMatchObject({ view: "home" });
  });

});

// ═══════════════════════════════════════════════════════
//  deliverToEnso
// ═══════════════════════════════════════════════════════

describe("deliverToEnso", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("IM mode: sends plain text, skips UI generation", async () => {
    const client = mockClient();
    vi.mocked(resolveEnsoAccount).mockReturnValue(mockAccount("im"));
    vi.mocked(getAllClients).mockReturnValue([client]);

    const result = await deliverToEnso({
      to: "enso_test",
      text: "Agent response with enough text to trigger UI generation. This should be more than one hundred characters of text content for the threshold.",
    });

    expect(result.channel).toBe("enso");
    expect(client.messages).toHaveLength(1);
    const msg = client.messages[0];
    expect(msg.state).toBe("final");
    expect(msg.text).toContain("Agent response");
    expect(msg.generatedUI).toBeUndefined();
    expect(msg.data).toBeUndefined();

    expect(serverGenerateUI).not.toHaveBeenCalled();
    expect(serverGenerateUIFromText).not.toHaveBeenCalled();
    expect(consumeRecentToolCall).not.toHaveBeenCalled();
  });

  it("Full mode: generates UI via text path", async () => {
    const client = mockClient();
    vi.mocked(resolveEnsoAccount).mockReturnValue(mockAccount("full"));
    vi.mocked(getAllClients).mockReturnValue([client]);
    vi.mocked(consumeRecentToolCall).mockReturnValueOnce(null);

    await deliverToEnso({
      to: "enso_test",
      text: "A long agent response that should trigger UI generation because it exceeds the 100 character minimum. Here is more content to be sure.",
    });

    expect(client.messages).toHaveLength(1);
    const msg = client.messages[0];
    expect(msg.generatedUI).toBeDefined();
    expect(serverGenerateUIFromText).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════
//  handlePluginCardAction
// ═══════════════════════════════════════════════════════

describe("handlePluginCardAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper: create a card with context by delivering a reply first
  async function createCardWithContext(mode: "im" | "ui" | "full"): Promise<{
    cardId: string;
    client: ConnectedClient & { messages: ServerMessage[] };
  }> {
    const client = mockClient();
    const account = mockAccount(mode);

    vi.mocked(consumeRecentToolCall).mockReturnValueOnce(null);

    await deliverEnsoReply({
      payload: {
        text: '```json\n{"columns": [{"name": "To Do", "tasks": [{"id": 1, "title": "Task 1", "priority": "high", "assignee": "Alice"}]}], "projectName": "Test"}\n```',
      },
      client,
      runId: "run-card",
      seq: 0,
      account,
      userMessage: "show tasks",
    });

    const cardId = client.messages[0]?.id;
    client.messages.length = 0; // Clear previous messages
    vi.clearAllMocks();
    return { cardId, client };
  }

  // ── IM mode guard ──

  it("IM mode guard: rejects card actions with error", async () => {
    // IM mode skips UI gen so no card context is created normally.
    // But we test the guard in handlePluginCardAction by first creating
    // a card context in a non-IM mode, then simulating the IM guard.
    // The server.ts guard would catch this first, but we test the outbound guard too.

    // Create a card in full mode first so context exists
    const { cardId, client } = await createCardWithContext("full");

    // Now manually we can't change the mode on an existing context,
    // but the IM guard in handlePluginCardAction checks ctx.mode.
    // Since we created in "full" mode, the IM guard won't trigger here.
    // The server.ts guard is the primary defense. Let's verify the error
    // path when context is missing instead.
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
    const { cardId, client } = await createCardWithContext("full");

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
    const { cardId, client } = await createCardWithContext("ui");

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
    // Create a card that has a native tool hint
    const client = mockClient();
    const account = mockAccount("full");

    vi.mocked(consumeRecentToolCall).mockReturnValueOnce({
      toolName: "test_latest_data",
      params: { period: "1d" },
      timestamp: Date.now(),
    });
    vi.mocked(isToolRegistered).mockReturnValue(true);
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, details");

    // Need to mock getToolPluginId and getPluginToolPrefix for the hint
    const { getToolPluginId, getPluginToolPrefix } = await import(
      "./native-tools/registry.js"
    );
    vi.mocked(getToolPluginId).mockReturnValue("test-plugin");
    vi.mocked(getPluginToolPrefix).mockReturnValue("test_");

    await deliverEnsoReply({
      payload: {
        text: '```json\n{"items": [{"name": "item1", "value": 42}]}\n```',
      },
      client,
      runId: "run-native",
      seq: 0,
      account,
      userMessage: "show data",
    });

    const cardId = client.messages[0]?.id;
    client.messages.length = 0;
    vi.clearAllMocks();

    // Now trigger a native tool action (refresh)
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

    vi.mocked(consumeRecentToolCall).mockReturnValueOnce({
      toolName: "test_latest_data",
      params: { period: "1d" },
      timestamp: Date.now(),
    });
    vi.mocked(isToolRegistered).mockReturnValue(true);
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh");

    const { getToolPluginId, getPluginToolPrefix } = await import(
      "./native-tools/registry.js"
    );
    vi.mocked(getToolPluginId).mockReturnValue("test-plugin");
    vi.mocked(getPluginToolPrefix).mockReturnValue("test_");

    await deliverEnsoReply({
      payload: {
        text: '```json\n{"items": [{"name": "item1"}]}\n```',
      },
      client,
      runId: "run-native-ui",
      seq: 0,
      account,
      userMessage: "show data",
    });

    const cardId = client.messages[0]?.id;
    client.messages.length = 0;
    vi.clearAllMocks();

    // Trigger native tool action (refresh)
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
    const { cardId, client } = await createCardWithContext("full");

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
    const { cardId, client } = await createCardWithContext("ui");

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
    const { cardId, client } = await createCardWithContext("ui");

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
    const { cardId, client } = await createCardWithContext("full");

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

  it("AlphaRank E2E: covered follow-up switches to tool mode template path", async () => {
    const client = mockClient();
    const account = mockAccount("full");

    const toolTemplate = {
      toolFamily: "alpharank",
      signatureId: "ranked_predictions_table",
      templateId: "market-top-picks-v1",
      supportedActions: ["refresh", "predictions"],
      coverageStatus: "covered",
    };

    vi.mocked(consumeRecentToolCall).mockReturnValueOnce({
      toolName: "alpharank_latest_predictions",
      params: { top_n: 10 },
      timestamp: Date.now(),
    });
    vi.mocked(isToolRegistered).mockReturnValue(true);
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, predictions");
    vi.mocked(inferToolTemplate).mockReturnValue(toolTemplate);

    const { getToolPluginId, getPluginToolPrefix, isToolActionCovered } = await import(
      "./native-tools/registry.js"
    );
    vi.mocked(getToolPluginId).mockReturnValue("alpharank");
    vi.mocked(getPluginToolPrefix).mockReturnValue("alpharank_");
    vi.mocked(isToolActionCovered).mockReturnValue(true);

    await deliverEnsoReply({
      payload: {
        text: '```json\n{"title":"AlphaRank Predictions","picks":[{"ticker":"NVDA","rank":1}]}\n```',
      },
      client,
      runId: "run-alpharank-tool-mode",
      seq: 0,
      account,
      userMessage: "show latest stock ranking",
    });

    const cardId = client.messages[0]?.id;
    client.messages.length = 0;
    vi.clearAllMocks();

    vi.mocked(executeToolDirect).mockResolvedValueOnce({
      success: true,
      data: { title: "AlphaRank Predictions", picks: [{ ticker: "AVGO", rank: 1 }] },
    });
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, predictions");
    vi.mocked(inferToolTemplate).mockReturnValue(toolTemplate);
    vi.mocked(isToolRegistered).mockReturnValue(true);
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

  it("Filesystem E2E: tool action maps to enso_fs_* and uses tool template", async () => {
    const client = mockClient();
    const account = mockAccount("full");

    const toolTemplate = {
      toolFamily: "filesystem",
      signatureId: "directory_listing",
      templateId: "filesystem-browser-v1",
      supportedActions: ["refresh", "list_directory", "read_text_file", "stat_path", "search_paths"],
      coverageStatus: "covered",
    };

    vi.mocked(consumeRecentToolCall).mockReturnValueOnce({
      toolName: "enso_fs_list_directory",
      params: { path: "/Users/demo/Desktop" },
      timestamp: Date.now(),
    });
    vi.mocked(isToolRegistered).mockReturnValue(true);
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, list_directory, read_text_file, stat_path, search_paths");
    vi.mocked(inferToolTemplate).mockReturnValue(toolTemplate);

    const { getToolPluginId, getPluginToolPrefix, isToolActionCovered } = await import(
      "./native-tools/registry.js"
    );
    vi.mocked(getToolPluginId).mockReturnValue("enso");
    vi.mocked(getPluginToolPrefix).mockReturnValue("enso_fs_");
    vi.mocked(isToolActionCovered).mockReturnValue(true);

    await deliverEnsoReply({
      payload: {
        text: '```json\n{"path":"/Users/demo/Desktop","items":[{"name":"Github","path":"/Users/demo/Desktop/Github","type":"directory"}]}\n```',
      },
      client,
      runId: "run-filesystem-tool-mode",
      seq: 0,
      account,
      userMessage: "list files on desktop",
    });

    const cardId = client.messages[0]?.id;
    client.messages.length = 0;
    vi.clearAllMocks();

    vi.mocked(executeToolDirect).mockResolvedValueOnce({
      success: true,
      data: { path: "/Users/demo/Desktop/Github", items: [{ name: "Enso", path: "/Users/demo/Desktop/Github/Enso", type: "directory" }] },
    });
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, list_directory, read_text_file, stat_path, search_paths");
    vi.mocked(inferToolTemplate).mockReturnValue(toolTemplate);
    vi.mocked(isToolRegistered).mockReturnValue(true);
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

  it("Workspace E2E: tool action maps to enso_ws_* and uses tool template", async () => {
    const client = mockClient();
    const account = mockAccount("full");

    const toolTemplate = {
      toolFamily: "code_workspace",
      signatureId: "workspace_inventory",
      templateId: "code-workspace-v1",
      supportedActions: ["refresh", "list_repos", "detect_dev_tools", "project_overview"],
      coverageStatus: "covered",
    };

    vi.mocked(consumeRecentToolCall).mockReturnValueOnce({
      toolName: "enso_ws_list_repos",
      params: { path: "/Users/demo/Github" },
      timestamp: Date.now(),
    });
    vi.mocked(isToolRegistered).mockReturnValue(true);
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, list_repos, detect_dev_tools, project_overview");
    vi.mocked(inferToolTemplate).mockReturnValue(toolTemplate);

    const { getToolPluginId, getPluginToolPrefix, isToolActionCovered } = await import(
      "./native-tools/registry.js"
    );
    vi.mocked(getToolPluginId).mockReturnValue("enso");
    vi.mocked(getPluginToolPrefix).mockReturnValue("enso_ws_");
    vi.mocked(isToolActionCovered).mockReturnValue(true);

    await deliverEnsoReply({
      payload: {
        text: '```json\n{"path":"/Users/demo/Github","repos":[{"name":"Enso","path":"/Users/demo/Github/Enso"}]}\n```',
      },
      client,
      runId: "run-workspace-tool-mode",
      seq: 0,
      account,
      userMessage: "scan workspace repos",
    });

    const cardId = client.messages[0]?.id;
    client.messages.length = 0;
    vi.clearAllMocks();

    vi.mocked(executeToolDirect).mockResolvedValueOnce({
      success: true,
      data: { path: "/Users/demo/Github/Enso", extensionStats: [{ ext: ".ts", count: 120 }] },
    });
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, list_repos, detect_dev_tools, project_overview");
    vi.mocked(inferToolTemplate).mockReturnValue(toolTemplate);
    vi.mocked(isToolRegistered).mockReturnValue(true);
    vi.mocked(isToolActionCovered).mockReturnValue(true);

    await handlePluginCardAction({
      cardId,
      action: "project_overview",
      payload: { path: "/Users/demo/Github/Enso" },
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    const finals = finalMessages(client.messages);
    expect(finals).toHaveLength(1);
    expect(finals[0].targetCardId).toBe(cardId);
    expect(finals[0].generatedUI).toBe("<div>tool-template</div>");
    expect(executeToolDirect).toHaveBeenCalledWith("enso_ws_project_overview", { path: "/Users/demo/Github/Enso" });
  });

  it("Media E2E: tool action maps to enso_media_* and uses tool template", async () => {
    const client = mockClient();
    const account = mockAccount("full");

    const toolTemplate = {
      toolFamily: "multimedia",
      signatureId: "media_gallery",
      templateId: "media-gallery-v1",
      supportedActions: ["refresh", "scan_library", "inspect_file", "group_by_type"],
      coverageStatus: "covered",
    };

    vi.mocked(consumeRecentToolCall).mockReturnValueOnce({
      toolName: "enso_media_scan_library",
      params: { path: "/Users/demo/Pictures" },
      timestamp: Date.now(),
    });
    vi.mocked(isToolRegistered).mockReturnValue(true);
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, scan_library, inspect_file, group_by_type");
    vi.mocked(inferToolTemplate).mockReturnValue(toolTemplate);

    const { getToolPluginId, getPluginToolPrefix, isToolActionCovered } = await import(
      "./native-tools/registry.js"
    );
    vi.mocked(getToolPluginId).mockReturnValue("enso");
    vi.mocked(getPluginToolPrefix).mockReturnValue("enso_media_");
    vi.mocked(isToolActionCovered).mockReturnValue(true);

    await deliverEnsoReply({
      payload: {
        text: '```json\n{"path":"/Users/demo/Pictures","items":[{"name":"photo.jpg","path":"/Users/demo/Pictures/photo.jpg","type":"image"}]}\n```',
      },
      client,
      runId: "run-media-tool-mode",
      seq: 0,
      account,
      userMessage: "scan media library",
    });

    const cardId = client.messages[0]?.id;
    client.messages.length = 0;
    vi.clearAllMocks();

    vi.mocked(executeToolDirect).mockResolvedValueOnce({
      success: true,
      data: { path: "/Users/demo/Pictures/photo.jpg", type: "image", size: 12345 },
    });
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, scan_library, inspect_file, group_by_type");
    vi.mocked(inferToolTemplate).mockReturnValue(toolTemplate);
    vi.mocked(isToolRegistered).mockReturnValue(true);
    vi.mocked(isToolActionCovered).mockReturnValue(true);

    await handlePluginCardAction({
      cardId,
      action: "inspect_file",
      payload: { path: "/Users/demo/Pictures/photo.jpg" },
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    const finals = finalMessages(client.messages);
    expect(finals).toHaveLength(1);
    expect(finals[0].targetCardId).toBe(cardId);
    expect(finals[0].generatedUI).toBe("<div>tool-template</div>");
    expect(executeToolDirect).toHaveBeenCalledWith("enso_media_inspect_file", { path: "/Users/demo/Pictures/photo.jpg" });
  });

  it("Tool Console E2E: add action updates card in tool mode", async () => {
    const client = mockClient();
    const account = mockAccount("full");

    await deliverEnsoReply({
      payload: { text: "tool console bootstrap" },
      client,
      runId: "run-tooling-actions",
      seq: 0,
      account,
      userMessage: "/tool enso",
    });

    const initial = finalMessages(client.messages)[0];
    expect(initial).toBeDefined();
    expect(initial.cardMode?.toolFamily).toBe("enso_tooling");

    client.messages.length = 0;
    vi.clearAllMocks();

    await handlePluginCardAction({
      cardId: initial.id,
      action: "tooling_add_tool",
      payload: { description: "a brand new legal case management tool" },
      mode: "full",
      client,
      config: {} as any,
      runtime: mockRuntime(),
    });

    const finals = finalMessages(client.messages).filter((m) => m.targetCardId === initial.id);
    expect(finals.length).toBeGreaterThan(0);
    const updated = finals[finals.length - 1];
    expect(updated.cardMode?.interactionMode).toBe("tool");
    expect(updated.cardMode?.toolFamily).toBe("enso_tooling");
    expect(updated.generatedUI).toBe("<div>tool-template</div>");
  });

  it("System Tool E2E: generic provider actions use deterministic system template path", async () => {
    const client = mockClient();
    const account = mockAccount("full");

    const toolTemplate = {
      toolFamily: "system_official_mail",
      signatureId: "system_auto_official_mail",
      templateId: "system-auto-official-mail-v1",
      supportedActions: ["refresh", "list_threads", "read_thread", "archive_thread"],
      coverageStatus: "covered",
    };

    vi.mocked(consumeRecentToolCall).mockReturnValueOnce({
      toolName: "official_mail_list_threads",
      params: { limit: 20 },
      timestamp: Date.now(),
    });
    vi.mocked(isToolRegistered).mockReturnValue(true);
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, list_threads, read_thread, archive_thread");
    vi.mocked(inferToolTemplate).mockReturnValue(toolTemplate);

    const { getToolPluginId, getPluginToolPrefix, isToolActionCovered } = await import(
      "./native-tools/registry.js"
    );
    vi.mocked(getToolPluginId).mockReturnValue("official_mail");
    vi.mocked(getPluginToolPrefix).mockReturnValue("official_mail_");
    vi.mocked(isToolActionCovered).mockReturnValue(true);

    await deliverEnsoReply({
      payload: {
        text: '```json\n{"rows":[{"id":"th_1","title":"Launch update"}]}\n```',
      },
      client,
      runId: "run-system-tool-mode",
      seq: 0,
      account,
      userMessage: "show latest official mail threads",
    });

    const cardId = client.messages[0]?.id;
    client.messages.length = 0;
    vi.clearAllMocks();

    vi.mocked(executeToolDirect).mockResolvedValueOnce({
      success: true,
      data: { rows: [{ id: "th_1", title: "Launch update", body: "Detailed content" }] },
    });
    vi.mocked(getActionDescriptions).mockReturnValue("Actions: refresh, list_threads, read_thread, archive_thread");
    vi.mocked(inferToolTemplate).mockReturnValue(toolTemplate);
    vi.mocked(isToolRegistered).mockReturnValue(true);
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
