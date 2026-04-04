/**
 * browser-tools.test.ts — Tests for browser tool registration and input validation.
 * Covers Sprint 20 tools: enso_browser_extract, enso_browser_key,
 * enso_browser_evaluate, enso_browser_wait.
 */
import { describe, it, expect, vi } from "vitest";

// Mock server.js for toMediaUrl
vi.mock("./server.js", () => ({
  toMediaUrl: (p: string) => `http://localhost:3001/media/${Buffer.from(p).toString("base64url")}`,
}));

// Mock action-log
vi.mock("./action-log.js", () => ({
  logAction: vi.fn(),
  logError: vi.fn(),
}));

// Mock puppeteer to avoid actually launching a browser
vi.mock("puppeteer", () => ({
  default: {
    launch: vi.fn().mockRejectedValue(new Error("puppeteer not available in test")),
  },
}));

import { createBrowserTools } from "./browser-tools.js";

type ToolResult = { content: Array<{ type: string; text?: string }> };

function getResultText(result: ToolResult): string {
  return result.content.find((x) => x.type === "text")?.text ?? "";
}

function isError(result: ToolResult): boolean {
  return getResultText(result).startsWith("[ERROR]");
}

describe("browser tools — registration", () => {
  it("createBrowserTools returns expected number of tools", () => {
    const tools = createBrowserTools();
    // Should have: open, navigate, click, scroll, back, type, extract, key, evaluate, wait
    expect(tools.length).toBe(10);
  });

  it("all tools have required fields: name, label, description, parameters, execute", () => {
    const tools = createBrowserTools();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.label).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeTruthy();
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("tool names follow enso_browser_ prefix convention", () => {
    const tools = createBrowserTools();
    for (const tool of tools) {
      expect(tool.name.startsWith("enso_browser_")).toBe(true);
    }
  });

  it("expected tool names are present", () => {
    const tools = createBrowserTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("enso_browser_open");
    expect(names).toContain("enso_browser_navigate");
    expect(names).toContain("enso_browser_click");
    expect(names).toContain("enso_browser_scroll");
    expect(names).toContain("enso_browser_back");
    expect(names).toContain("enso_browser_type");
    expect(names).toContain("enso_browser_extract");
    expect(names).toContain("enso_browser_key");
    expect(names).toContain("enso_browser_evaluate");
    expect(names).toContain("enso_browser_wait");
  });
});

describe("browser tools — input validation (no browser required)", () => {
  // These tests verify that tools handle "no active page" or invalid input
  // gracefully — they'll fail to launch the browser (mocked) and should
  // return [ERROR] responses, not crash.

  it("enso_browser_extract with puppeteer unavailable returns error", async () => {
    const tools = createBrowserTools();
    const extractTool = tools.find((t) => t.name === "enso_browser_extract")!;
    const result = await extractTool.execute("be1", { mode: "text" });
    expect(isError(result)).toBe(true);
  });

  it("enso_browser_evaluate with puppeteer unavailable returns error", async () => {
    const tools = createBrowserTools();
    const evalTool = tools.find((t) => t.name === "enso_browser_evaluate")!;
    const result = await evalTool.execute("be2", { script: "document.title" });
    expect(isError(result)).toBe(true);
  });

  it("enso_browser_key with puppeteer unavailable returns error", async () => {
    const tools = createBrowserTools();
    const keyTool = tools.find((t) => t.name === "enso_browser_key")!;
    const result = await keyTool.execute("be3", { combo: "Escape" });
    expect(isError(result)).toBe(true);
  });

  it("enso_browser_wait with puppeteer unavailable returns error", async () => {
    const tools = createBrowserTools();
    const waitTool = tools.find((t) => t.name === "enso_browser_wait")!;
    const result = await waitTool.execute("be4", { condition: "idle" });
    expect(isError(result)).toBe(true);
  });

  it("enso_browser_navigate with puppeteer unavailable returns error", async () => {
    const tools = createBrowserTools();
    const navTool = tools.find((t) => t.name === "enso_browser_navigate")!;
    const result = await navTool.execute("be5", { url: "https://example.com" });
    expect(isError(result)).toBe(true);
  });

  it("all browser tools return AgentToolResult format on error", async () => {
    const tools = createBrowserTools();
    for (const tool of tools) {
      const result = await tool.execute("fmt-check", { mode: "text", combo: "Tab", direction: "down", text: "hello", script: "1+1", condition: "idle", url: "https://example.com", x: 100, y: 100 });
      // Result must have content array
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      expect(typeof result.content[0].text).toBe("string");
    }
  });
});

describe("browser tools — parameter schemas", () => {
  it("enso_browser_extract requires 'mode' parameter", () => {
    const tools = createBrowserTools();
    const extract = tools.find((t) => t.name === "enso_browser_extract")!;
    const required = extract.parameters.required as string[];
    expect(required).toContain("mode");
  });

  it("enso_browser_key requires 'combo' parameter", () => {
    const tools = createBrowserTools();
    const key = tools.find((t) => t.name === "enso_browser_key")!;
    const required = key.parameters.required as string[];
    expect(required).toContain("combo");
  });

  it("enso_browser_evaluate requires 'script' parameter", () => {
    const tools = createBrowserTools();
    const evaluate = tools.find((t) => t.name === "enso_browser_evaluate")!;
    const required = evaluate.parameters.required as string[];
    expect(required).toContain("script");
  });

  it("enso_browser_wait requires 'condition' parameter", () => {
    const tools = createBrowserTools();
    const wait = tools.find((t) => t.name === "enso_browser_wait")!;
    const required = wait.parameters.required as string[];
    expect(required).toContain("condition");
  });

  it("enso_browser_wait condition has correct enum values", () => {
    const tools = createBrowserTools();
    const wait = tools.find((t) => t.name === "enso_browser_wait")!;
    const props = wait.parameters.properties as Record<string, Record<string, unknown>>;
    expect(props.condition.enum).toEqual(["selector", "navigation", "idle"]);
  });

  it("enso_browser_extract mode has correct enum values", () => {
    const tools = createBrowserTools();
    const extract = tools.find((t) => t.name === "enso_browser_extract")!;
    const props = extract.parameters.properties as Record<string, Record<string, unknown>>;
    expect(props.mode.enum).toEqual(["text", "html", "selector"]);
  });
});
