import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./native-tools/registry.js", () => ({
  executeToolDirect: vi.fn(),
  getRegisteredToolsDetailed: vi.fn(),
  detectToolTemplateForToolName: vi.fn(() => ({
    toolFamily: "filesystem",
    signatureId: "directory_listing",
    templateId: "filesystem-browser-v1",
    supportedActions: ["refresh", "list_directory"],
    coverageStatus: "covered",
  })),
}));

vi.mock("./ui-generator.js", () => ({
  serverSuggestToolInvocation: vi.fn(),
}));

import { tryRouteWithLLM } from "./tool-router.js";
import { executeToolDirect, getRegisteredToolsDetailed } from "./native-tools/registry.js";
import { serverSuggestToolInvocation } from "./ui-generator.js";

type ToolDetail = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  pluginId: string;
};

function tool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
  pluginId = "enso",
): ToolDetail {
  return { name, description, parameters, pluginId };
}

function familyTools(): ToolDetail[] {
  return [
    tool(
      "enso_fs_list_directory",
      "List files and folders under a directory path.",
      {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path to list." },
          includeHidden: { type: "boolean", description: "Include dotfiles/directories." },
        },
        required: ["path"],
      },
      "enso_filesystem",
    ),
    tool(
      "enso_ws_project_overview",
      "Get project overview for workspace repository.",
      {
        type: "object",
        properties: {
          repoPath: { type: "string", description: "Repository path." },
        },
      },
      "enso_workspace",
    ),
    tool(
      "enso_media_scan_library",
      "Scan a media library and index files.",
      {
        type: "object",
        properties: {
          rootPath: { type: "string", description: "Path to media library root." },
        },
      },
      "enso_media",
    ),
    tool(
      "alpharank_latest_predictions",
      "Fetch latest AlphaRank predictions and confidence.",
      {
        type: "object",
        properties: {
          market: { type: "string", description: "Market universe identifier." },
        },
      },
      "alpharank",
    ),
  ];
}

describe("tryRouteWithLLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRegisteredToolsDetailed).mockReturnValue(familyTools());
    vi.mocked(executeToolDirect).mockResolvedValue({
      success: true,
      data: { ok: true },
    });
    vi.mocked(serverSuggestToolInvocation).mockResolvedValue({
      toolName: "enso_fs_list_directory",
      params: { path: "~/Desktop" },
      confidence: 0.92,
    });
  });

  it("skips routing for social chat", async () => {
    const result = await tryRouteWithLLM({
      userMessage: "hello",
      geminiApiKey: "key",
    });
    expect(result.matched).toBe(false);
    expect(serverSuggestToolInvocation).not.toHaveBeenCalled();
  });

  it("routes with lexical fallback without API key", async () => {
    const result = await tryRouteWithLLM({
      userMessage: "show me files on desktop",
    });
    expect(result.matched).toBe(true);
    expect(result.toolName).toBe("enso_fs_list_directory");
    expect(serverSuggestToolInvocation).not.toHaveBeenCalled();
  });

  it("returns unmatched when tool catalog is empty", async () => {
    vi.mocked(getRegisteredToolsDetailed).mockReturnValue([]);
    const result = await tryRouteWithLLM({
      userMessage: "scan my media library",
      geminiApiKey: "key",
    });
    expect(result.matched).toBe(false);
    expect(serverSuggestToolInvocation).not.toHaveBeenCalled();
  });

  it("passes rich catalog context to LLM router", async () => {
    // Prevent lexical direct route so the LLM path is exercised.
    vi.mocked(getRegisteredToolsDetailed).mockReturnValue([
      tool(
        "tool_alpha_x",
        "Handles alpha.",
        { type: "object", properties: { input: { type: "string" } } },
        "alpha_plugin",
      ),
      tool(
        "tool_beta_y",
        "Handles beta.",
        { type: "object", properties: { input: { type: "string" } } },
        "beta_plugin",
      ),
    ]);
    vi.mocked(executeToolDirect).mockResolvedValue({
      success: false,
      data: null,
      error: "force-llm-path",
    });
    await tryRouteWithLLM({
      userMessage: "run operation with best matching tool",
      geminiApiKey: "key",
    });
    expect(serverSuggestToolInvocation).toHaveBeenCalledTimes(2);
    const call = vi.mocked(serverSuggestToolInvocation).mock.calls[0][0];
    expect(call.tools.length).toBeGreaterThan(0);
    expect(call.catalogContext).toContain("Registered plugins and tools:");
    expect(call.catalogContext).toContain("Top candidate tools for this message:");
    expect(call.catalogContext).toContain("alpha_plugin");
    expect(call.catalogContext).toContain("tool_alpha_x");
  });

  it("enforces confidence threshold", async () => {
    vi.mocked(serverSuggestToolInvocation).mockResolvedValue({
      toolName: "enso_fs_list_directory",
      params: { path: "~/Desktop" },
      confidence: 0.2,
    });
    vi.mocked(executeToolDirect).mockResolvedValue({
      success: false,
      data: null,
      error: "failed",
    });
    const result = await tryRouteWithLLM({
      userMessage: "list desktop files confidence test",
      geminiApiKey: "key",
    });
    expect(result.matched).toBe(false);
    expect(executeToolDirect).toHaveBeenCalled();
  });

  it("retries multiple routing attempts when initial primary misses", async () => {
    vi.mocked(getRegisteredToolsDetailed).mockReturnValue([
      tool(
        "tool_alpha_x",
        "Handles alpha.",
        { type: "object", properties: { input: { type: "string" } } },
        "alpha_plugin",
      ),
      tool(
        "tool_beta_y",
        "Handles beta.",
        { type: "object", properties: { input: { type: "string" } } },
        "beta_plugin",
      ),
    ]);
    vi.mocked(serverSuggestToolInvocation)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        toolName: "tool_alpha_x",
        params: { input: "x" },
        confidence: 0.8,
      });
    let execCalls = 0;
    vi.mocked(executeToolDirect).mockImplementation(async () => {
      execCalls += 1;
      if (execCalls <= 2) {
        return { success: false, data: null, error: "lexical-fail" };
      }
      return { success: true, data: { ok: true } };
    });
    const result = await tryRouteWithLLM({
      userMessage: "run alpha operation fallback strategy test",
      geminiApiKey: "key",
    });
    expect(result.matched).toBe(true);
    expect(serverSuggestToolInvocation).toHaveBeenCalledTimes(2);
    const first = vi.mocked(serverSuggestToolInvocation).mock.calls[0][0];
    expect(first.strategy).toBe("primary");
  });

  it("returns unmatched when direct tool execution fails", async () => {
    vi.mocked(executeToolDirect).mockResolvedValue({
      success: false,
      data: null,
      error: "failed",
    });
    const result = await tryRouteWithLLM({
      userMessage: "list desktop files execution fail test",
      geminiApiKey: "key",
    });
    expect(result.matched).toBe(false);
  });

  it("uses route cache on repeated message", async () => {
    const prompt = "show me all files on desktop cache path";
    const first = await tryRouteWithLLM({
      userMessage: prompt,
      geminiApiKey: "key",
    });
    expect(first.matched).toBe(true);
    expect(executeToolDirect).toHaveBeenCalledTimes(1);

    vi.mocked(serverSuggestToolInvocation).mockReset();
    const second = await tryRouteWithLLM({
      userMessage: prompt,
      geminiApiKey: "key",
    });
    expect(second.matched).toBe(true);
    expect(serverSuggestToolInvocation).not.toHaveBeenCalled();
    expect(executeToolDirect).toHaveBeenCalledTimes(2);
  });

  it("keeps schema-relevant filesystem tool in shortlist", async () => {
    const noisyTools: ToolDetail[] = [];
    for (let i = 0; i < 50; i += 1) {
      noisyTools.push(
        tool(
          `noise_plugin_tool_${i}`,
          "Unrelated helper",
          {
            type: "object",
            properties: { misc: { type: "string", description: "Misc argument" } },
          },
          `noise_${i % 5}`,
        ),
      );
    }
    noisyTools.push(
      tool(
        "official_fs_list_directory",
        "List directory entries by path.",
        {
          type: "object",
          properties: {
            path: { type: "string", description: "Path of directory to list files and folders." },
          },
          required: ["path"],
        },
        "official_filesystem",
      ),
    );
    vi.mocked(getRegisteredToolsDetailed).mockReturnValue(noisyTools);
    vi.mocked(serverSuggestToolInvocation).mockResolvedValue({
      toolName: "official_fs_list_directory",
      params: { path: "~/Desktop" },
      confidence: 0.94,
    });

    const result = await tryRouteWithLLM({
      userMessage: "show files in desktop with schema matching",
      geminiApiKey: "key",
    });
    expect(result.matched).toBe(true);
    expect(result.toolName).toBe("official_fs_list_directory");
  });

  it.each([
    ["filesystem", "show files on desktop map test", "enso_fs_list_directory", { path: "~/Desktop" }],
    ["workspace", "give project overview map test", "enso_ws_project_overview", { repoPath: "." }],
    ["media", "scan media library map test", "enso_media_scan_library", { rootPath: "~/Pictures" }],
    ["alpharank", "show latest market predictions map test", "alpharank_latest_predictions", { market: "us_equities" }],
  ])(
    "maps %s family tool correctly",
    async (_label, userMessage, toolName, params) => {
      vi.mocked(serverSuggestToolInvocation).mockResolvedValue({
        toolName,
        params,
        confidence: 0.91,
      });
      vi.mocked(executeToolDirect).mockResolvedValue({
        success: true,
        data: { toolName, params, ok: true },
      });

      const result = await tryRouteWithLLM({
        userMessage,
        geminiApiKey: "key",
      });
      expect(result.matched).toBe(true);
      expect(result.toolName).toBe(toolName);
      expect(result.data).toEqual({ toolName, params, ok: true });
    },
  );

  it("fills required path-like params when LLM omits them", async () => {
    vi.mocked(serverSuggestToolInvocation).mockResolvedValue({
      toolName: "enso_fs_list_directory",
      params: {},
      confidence: 0.9,
    });
    vi.mocked(executeToolDirect).mockResolvedValue({
      success: true,
      data: { ok: true },
    });
    const result = await tryRouteWithLLM({
      userMessage: "show files on desktop and include hidden",
      geminiApiKey: "key",
    });
    expect(result.matched).toBe(true);
    expect(executeToolDirect).toHaveBeenCalled();
    const call = vi.mocked(executeToolDirect).mock.calls[0];
    expect(call[0]).toBe("enso_fs_list_directory");
    expect((call[1] as Record<string, unknown>).path).toBe("~/Desktop");
  });
});
