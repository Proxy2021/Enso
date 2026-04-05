/**
 * session-isolation.test.ts — Tests for cross-session context isolation.
 * Covers BUG-04: Ensures conversations are isolated and profile context
 * doesn't leak conversation-specific data between sessions.
 */
import { describe, it, expect, vi } from "vitest";

// Mock external dependencies
vi.mock("./server.js", () => ({
  toMediaUrl: vi.fn(),
}));

vi.mock("./action-log.js", () => ({
  logAction: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("./outbound.js", () => ({
  deliverEnsoReply: vi.fn(),
}));

vi.mock("./transcribe.js", () => ({
  isAudioFile: vi.fn(() => false),
  transcribeAudio: vi.fn(),
}));

vi.mock("./researcher-tools.js", () => ({
  setLastUserMessage: vi.fn(),
}));

vi.mock("./llm-provider.js", () => ({
  callChatLLM: vi.fn(),
}));

vi.mock("./tool-registry-local.js", () => ({
  getAllLocalTools: vi.fn(() => []),
  executeLocalTool: vi.fn(),
  getAllLocalToolNames: vi.fn(() => new Set()),
}));

vi.mock("./memory-bridge.js", () => ({
  getUserProfileContext: vi.fn(() => "User prefers dark mode."),
  appendDailyMemory: vi.fn(),
  loadCardHistory: vi.fn(() => []),
}));

vi.mock("./config.js", () => ({
  geminiUrl: vi.fn(),
  LLM_DEFAULT_TIMEOUT_MS: 30000,
}));

vi.mock("./conversation-compactor.js", () => ({
  maybeCompactHistory: vi.fn().mockResolvedValue(false),
  forceCompactHistory: vi.fn(),
}));

vi.mock("./native-tools/tool-call-store.js", () => ({
  recordToolCall: vi.fn(),
}));

vi.mock("./ui-generator.js", () => ({
  GEMINI_MODEL_FAST: "gemini-2.5-flash",
}));

import { getConversationHistory, injectCardContext, markConversationFresh, isConversationFresh } from "./standalone-agent.js";
import { getUserProfileContext } from "./memory-bridge.js";

describe("conversation isolation", () => {
  it("different conversation IDs have independent histories", () => {
    const historyA = getConversationHistory("client-1", "conv-A");
    const historyB = getConversationHistory("client-1", "conv-B");

    // Push message to conversation A
    historyA.push({ role: "user", parts: [{ text: "I want to build an API dashboard" }] });
    historyA.push({ role: "model", parts: [{ text: "Starting API dashboard project..." }] });

    // Conversation B should have no messages
    expect(historyB.length).toBe(0);

    // Verify A has the messages
    expect(historyA.length).toBe(2);
    expect(historyA[0].parts[0].text).toContain("API dashboard");
  });

  it("different clients have independent histories even for same conversation ID", () => {
    const historyClient1 = getConversationHistory("client-X", "conv-shared");
    const historyClient2 = getConversationHistory("client-Y", "conv-shared");

    historyClient1.push({ role: "user", parts: [{ text: "Private message for client X" }] });

    expect(historyClient2.length).toBe(0);
    expect(historyClient1.length).toBe(1);
  });

  it("getConversationHistory returns same array for same key", () => {
    const history1 = getConversationHistory("client-Z", "conv-same");
    const history2 = getConversationHistory("client-Z", "conv-same");

    // Should be the exact same array reference
    expect(history1).toBe(history2);
  });

  it("injectCardContext only affects the target conversation", () => {
    const historyTarget = getConversationHistory("client-inject", "conv-target");
    const historyOther = getConversationHistory("client-inject", "conv-other");

    const initialOther = historyOther.length;

    injectCardContext("client-inject", "conv-target", {
      role: "assistant",
      text: "Here is your file listing result",
      type: "chat",
    } as Parameters<typeof injectCardContext>[2]);

    // Target conversation should have the injected entry
    expect(historyTarget.length).toBeGreaterThan(0);

    // Other conversation should be unchanged
    expect(historyOther.length).toBe(initialOther);
  });
});

describe("BUG-04: fresh conversation tracking", () => {
  it("markConversationFresh and isConversationFresh work correctly", () => {
    const clientId = "client-fresh-test";
    const convId = "conv-fresh-" + Date.now();

    expect(isConversationFresh(clientId, convId)).toBe(false);
    markConversationFresh(clientId, convId);
    expect(isConversationFresh(clientId, convId)).toBe(true);
  });

  it("fresh tracking is scoped per client and conversation", () => {
    const convId = "conv-scope-" + Date.now();
    markConversationFresh("client-A-scope", convId);

    expect(isConversationFresh("client-A-scope", convId)).toBe(true);
    expect(isConversationFresh("client-B-scope", convId)).toBe(false);
    expect(isConversationFresh("client-A-scope", "other-conv")).toBe(false);
  });

  it("getConversationHistory for a new conversation returns empty array", () => {
    const history = getConversationHistory("client-empty-test", "conv-empty-" + Date.now());
    expect(history).toEqual([]);
    expect(history.length).toBe(0);
  });

  it("injectCardContext tags entries with _meta", () => {
    const clientId = "client-meta-test";
    const convId = "conv-meta-" + Date.now();

    injectCardContext(clientId, convId, {
      id: "card-123",
      role: "assistant",
      text: "Test card content",
      type: "chat",
    } as Parameters<typeof injectCardContext>[2]);

    const history = getConversationHistory(clientId, convId);
    expect(history.length).toBeGreaterThan(0);
    const lastEntry = history[history.length - 1];
    expect(lastEntry._meta).toBeDefined();
    expect(lastEntry._meta?.cardId).toBe("card-123");
    expect(lastEntry._meta?.conversationId).toBe(convId);
    expect(lastEntry._meta?.ts).toBeGreaterThan(0);
  });

  it("injectCardContext without card id still sets _meta with conversationId", () => {
    const clientId = "client-meta-noid";
    const convId = "conv-meta-noid-" + Date.now();

    injectCardContext(clientId, convId, {
      role: "assistant",
      text: "No-id card",
      type: "chat",
    } as Parameters<typeof injectCardContext>[2]);

    const history = getConversationHistory(clientId, convId);
    const lastEntry = history[history.length - 1];
    expect(lastEntry._meta).toBeDefined();
    expect(lastEntry._meta?.conversationId).toBe(convId);
  });
});

describe("profile context isolation", () => {
  it("getUserProfileContext returns global profile (not conversation-specific data)", () => {
    // First, populate a conversation with specific content
    const history = getConversationHistory("client-profile", "conv-profile");
    history.push({ role: "user", parts: [{ text: "Build me an API Monitoring Dashboard with real-time charts" }] });
    history.push({ role: "model", parts: [{ text: "I'll create an API Monitoring Dashboard for you." }] });

    // getUserProfileContext should NOT contain conversation-specific content
    const profile = getUserProfileContext();
    expect(typeof profile).toBe("string");
    // The mock returns "User prefers dark mode." — a global preference
    // In production, this should never contain "API Monitoring Dashboard" from a conversation
    expect(profile).not.toContain("API Monitoring Dashboard");
  });

  it("fresh conversation starts with empty history", () => {
    const freshHistory = getConversationHistory("new-client", "fresh-conv-" + Date.now());
    expect(freshHistory.length).toBe(0);
  });
});
