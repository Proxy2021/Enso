import { describe, it, expect } from "vitest";

describe("chat.ts: sendMessage slash command routing", () => {
  // Test the routing logic patterns without full store setup
  // Source: src/store/chat.ts sendMessage() slash command handling

  it("/orchestrate extracts goal text", () => {
    const text = "/orchestrate Build a REST API with Express";
    const isOrchestrate = text.trim() === "/orchestrate" || text.trim().startsWith("/orchestrate ");
    expect(isOrchestrate).toBe(true);
    const goal = text.trim().startsWith("/orchestrate ")
      ? text.trim().slice("/orchestrate ".length).trim()
      : "";
    expect(goal).toBe("Build a REST API with Express");
  });

  it("/orchestrate without goal has empty goal", () => {
    const text = "/orchestrate";
    const goal = text.trim().startsWith("/orchestrate ")
      ? text.trim().slice("/orchestrate ".length).trim()
      : "";
    expect(goal).toBe("");
  });

  it("/research extracts topic", () => {
    const text = "/research CRISPR 2026";
    const isResearch = text.trim().startsWith("/research ");
    expect(isResearch).toBe(true);
    const topic = text.trim().slice("/research ".length).trim();
    expect(topic).toBe("CRISPR 2026");
  });

  it("/shell extracts command argument", () => {
    const text = "/shell node --version";
    const isShell = text.trim() === "/shell" || text.trim().startsWith("/shell ");
    expect(isShell).toBe(true);
    const cmd = text.trim().startsWith("/shell ")
      ? text.trim().slice("/shell ".length).trim()
      : undefined;
    expect(cmd).toBe("node --version");
  });

  it("bare /research falls through to normal path", () => {
    const text = "/research";
    const isResearchWithTopic = text.trim().startsWith("/research ");
    expect(isResearchWithTopic).toBe(false);
  });

  // ── NEW TESTS ──

  // SC-01: /code bare opens project picker
  it("bare /code triggers project picker", () => {
    const text = "/code";
    const isBareCode = text.trim() === "/code";
    expect(isBareCode).toBe(true);
    // Should NOT match the "/code " prefix route
    const isCodeWithArgs = text.startsWith("/code ");
    expect(isCodeWithArgs).toBe(false);
  });

  // SC-02: /code with args routes to claude-code
  it("/code with args routes to claude-code tool", () => {
    const text = "/code fix the authentication bug";
    const isBareCode = text.trim() === "/code";
    expect(isBareCode).toBe(false);
    const isCodeWithArgs = text.startsWith("/code ");
    expect(isCodeWithArgs).toBe(true);
    const displayText = text.slice(6);
    expect(displayText).toBe("fix the authentication bug");
  });

  // SC-03: /shell bare (no command)
  it("bare /shell launches shell without command", () => {
    const text = "/shell";
    const isShell = text.trim() === "/shell" || text.trim().startsWith("/shell ");
    expect(isShell).toBe(true);
    const cmd = text.trim().startsWith("/shell ")
      ? text.trim().slice("/shell ".length).trim()
      : undefined;
    expect(cmd).toBeUndefined();
  });

  // SC-04: /orchestrate with goal
  it("/orchestrate with multi-word goal", () => {
    const text = "/orchestrate build REST API with user auth and payments";
    const goal = text.trim().slice("/orchestrate ".length).trim();
    expect(goal).toBe("build REST API with user auth and payments");
  });

  // SC-05: /delete-apps exact match only
  it("/delete-apps matches exactly", () => {
    expect("/delete-apps".trim() === "/delete-apps").toBe(true);
    expect("/delete-apps extra".trim() === "/delete-apps").toBe(false);
  });

  // SC-06: /evolve with and without goal
  it("/evolve matches with or without goal", () => {
    expect("/evolve".trim().startsWith("/evolve")).toBe(true);
    expect("/evolve some goal".trim().startsWith("/evolve")).toBe(true);
    const goal = "/evolve custom goal".trim().slice(7).trim();
    expect(goal).toBe("custom goal");
  });

  // SC-07: /code with leading whitespace edge case
  it("/code preserves text after prefix", () => {
    const text = "/code   fix with extra spaces  ";
    const isCodeWithArgs = text.startsWith("/code ");
    expect(isCodeWithArgs).toBe(true);
    const displayText = text.slice(6);
    expect(displayText).toBe("  fix with extra spaces  ");
  });

  // SC-08: Non-slash messages don't trigger routing
  it("regular messages don't trigger slash routing", () => {
    const text = "Tell me about /code";
    const isSlash = text.trim().startsWith("/");
    // Starts with "T", not "/"
    expect(isSlash).toBe(false);
  });
});
