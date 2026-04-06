/**
 * conversation-compactor.test.ts — Tests for LLM-powered conversation compaction.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Must use vi.hoisted() so the mock fn is available during vi.mock() hoisting
const { mockCallGemini } = vi.hoisted(() => ({
  mockCallGemini: vi.fn(),
}));

vi.mock("./ui-generator.js", () => ({
  callGeminiLLMWithRetry: mockCallGemini,
  GEMINI_MODEL_FAST: "gemini-3-flash-preview",
  GEMINI_MODEL_PRO: "gemini-2.5-pro",
}));

vi.mock("./config.js", () => ({
  GEMINI_MODEL_UTILITY: "gemini-2.0-flash",
  ENSO_HOME: "/tmp/enso-test",
  geminiUrl: (model: string, key: string) => `https://api.example.com/${model}?key=${key}`,
  LLM_DEFAULT_TIMEOUT_MS: 30000,
  LLM_FAST_TIMEOUT_MS: 30000,
  LLM_PRO_TIMEOUT_MS: 60000,
  DEFAULT_MAX_OUTPUT_TOKENS: 8192,
  OLLAMA_API_URL: "http://localhost:11434",
}));

vi.mock("./memory-bridge.js", () => ({
  appendDailyMemory: vi.fn(),
  loadCardHistory: vi.fn(() => []),
}));

vi.mock("./action-log.js", () => ({
  logAction: vi.fn(),
  logError: vi.fn(),
}));

import { estimateTokens, maybeCompactHistory, forceCompactHistory } from "./conversation-compactor.js";
import type { ConversationEntry } from "./standalone-agent.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeEntry(role: "user" | "model", text: string): ConversationEntry {
  return { role, parts: [{ text }] };
}

function makeToolCallEntry(name: string, args: Record<string, unknown>): ConversationEntry {
  return { role: "model", parts: [{ functionCall: { name, args } }] };
}

function makeToolResultEntry(name: string, response: unknown): ConversationEntry {
  return { role: "user", parts: [{ functionResponse: { name, response } }] };
}

/** Build a realistic conversation with N turn pairs (user + model) + some tool calls.
 *  Each message is ~200+ chars to ensure token estimates cross the MIN_TOKEN_ESTIMATE threshold. */
function buildConversation(turnPairs: number): ConversationEntry[] {
  const entries: ConversationEntry[] = [];
  for (let i = 0; i < turnPairs; i++) {
    entries.push(makeEntry("user", `User message ${i}: Can you help me with task number ${i}? I need detailed information about topic ${i}. This is a longer message to simulate realistic conversation length with enough tokens to cross the compaction threshold. The user is asking about various aspects of the topic including implementation details, best practices, and common pitfalls.`));
    if (i % 3 === 0) {
      // Every 3rd turn includes a tool call cycle
      entries.push(makeToolCallEntry("enso_researcher_search", { query: `topic ${i} comprehensive research with multiple keywords and filters applied` }));
      entries.push(makeToolResultEntry("enso_researcher_search", {
        findings: [`Result A for ${i}: A detailed finding with explanation of the core concept and how it applies`, `Result B for ${i}: Another finding with supporting evidence and references`, `Result C for ${i}: Additional context`],
        count: 3,
        query: `topic ${i}`,
        metadata: { source: "web", relevance: 0.95 },
      }));
    }
    entries.push(makeEntry("model", `Here's what I found for task ${i}: The answer involves multiple considerations including performance, scalability, and maintainability. Let me explain each aspect in detail. First, regarding performance, the key factor is minimizing unnecessary computations. Second, for scalability, we should consider horizontal scaling patterns. Third, maintainability depends on clean code practices and comprehensive documentation.`));
  }
  return entries;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("estimateTokens", () => {
  it("returns 0 for empty history", () => {
    expect(estimateTokens([])).toBe(0);
  });

  it("estimates tokens for text entries", () => {
    const entries = [
      makeEntry("user", "Hello world"),      // 11 chars
      makeEntry("model", "Hi there!"),        // 9 chars
    ];
    const tokens = estimateTokens(entries);
    expect(tokens).toBe(Math.ceil(20 / 4));   // 5 tokens
  });

  it("includes function call and response text in estimate", () => {
    const entries = [
      makeToolCallEntry("test_tool", { query: "search query" }),
      makeToolResultEntry("test_tool", { results: ["a", "b", "c"] }),
    ];
    const tokens = estimateTokens(entries);
    expect(tokens).toBeGreaterThan(0);
  });

  it("scales with conversation length", () => {
    const short = buildConversation(3);
    const long = buildConversation(15);
    expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
  });
});

describe("maybeCompactHistory", () => {
  beforeEach(() => {
    mockCallGemini.mockReset();
  });

  it("skips compaction when history is below threshold (20 entries)", async () => {
    const history = buildConversation(5); // ~10-15 entries
    expect(history.length).toBeLessThanOrEqual(20);

    const result = await maybeCompactHistory(history, "test-key");
    expect(result).toBe(false);
    expect(mockCallGemini).not.toHaveBeenCalled();
  });

  it("compacts when history exceeds threshold", async () => {
    const history = buildConversation(15); // ~40 entries with tool calls — enough tokens
    expect(history.length).toBeGreaterThan(20);

    const fakeSummary = `1. **User Goals**: Testing conversation compaction across 12 topics
2. **Tools Used & Results**: enso_researcher_search called 4 times with various queries
3. **Current State**: Working through task 11, all previous tasks completed successfully
4. **Pending Items**: None identified`;

    mockCallGemini.mockResolvedValueOnce(fakeSummary);

    const originalLength = history.length;
    const result = await maybeCompactHistory(history, "test-key");

    expect(result).toBe(true);
    expect(mockCallGemini).toHaveBeenCalledOnce();
    expect(history.length).toBeLessThan(originalLength);
    // Should have: summary entry + bridge (maybe) + 8 preserved entries
    expect(history.length).toBeLessThanOrEqual(10); // summary + bridge + 8 preserved

    // First entry should be the summary
    expect(history[0].role).toBe("user");
    expect(history[0].parts[0].text).toContain("summary of our conversation");
    expect(history[0].parts[0].text).toContain("User Goals");
  });

  it("preserves the last 8 entries verbatim", async () => {
    const history = buildConversation(15);
    const lastEntries = history.slice(-8).map((e) => e.parts[0]);

    mockCallGemini.mockResolvedValueOnce("Summary: lots of work was done on various tasks.");

    await maybeCompactHistory(history, "test-key");

    // The last entries should be preserved exactly
    const preserved = history.slice(-8);
    for (let i = 0; i < 8; i++) {
      expect(preserved[i].parts[0]).toEqual(lastEntries[i]);
    }
  });

  it("handles role alternation correctly", async () => {
    const history = buildConversation(15);

    mockCallGemini.mockResolvedValueOnce("Summary: the user discussed many topics.");

    await maybeCompactHistory(history, "test-key");

    // Verify alternation: no two consecutive entries should have same role
    // (with exception of function call patterns which Gemini handles)
    expect(history[0].role).toBe("user"); // summary
    // Second entry should be model (either bridge or preserved)
    if (history.length > 1) {
      expect(history[1].role).toBe("model");
    }
  });

  it("falls back gracefully when LLM returns empty", async () => {
    const history = buildConversation(15);
    const originalLength = history.length;

    mockCallGemini.mockResolvedValueOnce(""); // empty response

    const result = await maybeCompactHistory(history, "test-key");
    expect(result).toBe(false);
    expect(history.length).toBe(originalLength); // unchanged
  });

  it("falls back gracefully when LLM throws", async () => {
    const history = buildConversation(15);
    const originalLength = history.length;

    mockCallGemini.mockRejectedValueOnce(new Error("API timeout"));

    const result = await maybeCompactHistory(history, "test-key");
    expect(result).toBe(false);
    expect(history.length).toBe(originalLength); // unchanged
  });

  it("allows compaction on different conversation keys", async () => {
    const history1 = buildConversation(15);
    const history2 = buildConversation(15);

    mockCallGemini.mockResolvedValue("Summary of the conversation with all relevant details preserved.");

    // Sequential compactions on different keys both succeed
    const r1 = await maybeCompactHistory(history1, "test-key", "conv-A");
    const r2 = await maybeCompactHistory(history2, "test-key", "conv-B");

    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(mockCallGemini).toHaveBeenCalledTimes(2);
  });
});

describe("forceCompactHistory", () => {
  beforeEach(() => {
    mockCallGemini.mockReset();
  });

  it("compacts regardless of threshold", async () => {
    const history = buildConversation(4); // ~8-12 entries, below auto-compact threshold

    mockCallGemini.mockResolvedValueOnce("Summary: user asked about 4 topics and got answers.");

    const summary = await forceCompactHistory(history, "test-key");
    expect(summary).toContain("4 topics");
    expect(history[0].parts[0].text).toContain("summary of our conversation");
  });

  it("throws on too-short history", async () => {
    const history = [
      makeEntry("user", "hi"),
      makeEntry("model", "hello"),
    ];

    await expect(forceCompactHistory(history, "test-key")).rejects.toThrow("Not enough");
  });

  it("throws when LLM returns empty", async () => {
    const history = buildConversation(4);
    mockCallGemini.mockResolvedValueOnce("");

    await expect(forceCompactHistory(history, "test-key")).rejects.toThrow("unusable");
  });

  it("returns the summary text", async () => {
    const history = buildConversation(6);
    const expectedSummary = "1. **User Goals**: The user worked through 6 tasks\n2. **Current State**: Task 5 completed";

    mockCallGemini.mockResolvedValueOnce(expectedSummary);

    const result = await forceCompactHistory(history, "test-key");
    expect(result).toBe(expectedSummary);
  });
});

describe("summarization prompt quality", () => {
  beforeEach(() => {
    mockCallGemini.mockReset();
  });

  it("includes tool call details in the transcript sent to LLM", async () => {
    const history = buildConversation(15);

    mockCallGemini.mockResolvedValueOnce("Summary of the conversation with tool usage details.");

    await maybeCompactHistory(history, "test-key");

    // Check the prompt sent to the LLM
    const prompt = mockCallGemini.mock.calls[0][0] as string;
    expect(prompt).toContain("TOOL CALL:");
    expect(prompt).toContain("TOOL RESULT");
    expect(prompt).toContain("enso_researcher_search");
    expect(prompt).toContain("User Goals");
    expect(prompt).toContain("Key Decisions");
    expect(prompt).toContain("Pending Items");
  });

  it("truncates very long entries in the transcript", async () => {
    const history: ConversationEntry[] = [];
    // Add a very long user message
    history.push(makeEntry("user", "x".repeat(2000)));
    // Fill to threshold
    for (let i = 0; i < 25; i++) {
      history.push(makeEntry(i % 2 === 0 ? "model" : "user", `Message ${i}`));
    }

    mockCallGemini.mockResolvedValueOnce("Summary with truncated content handled properly.");

    await maybeCompactHistory(history, "test-key");

    const prompt = mockCallGemini.mock.calls[0]?.[0] as string;
    if (prompt) {
      // The 2000-char message should be truncated to ~800 + "..."
      expect(prompt).not.toContain("x".repeat(2000));
      expect(prompt).toContain("...");
    }
  });
});
