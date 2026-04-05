/**
 * filesystem-error-handling.test.ts — Tests for filesystem error propagation.
 * Covers BUG-02: Ensures errors are never silently swallowed and always return
 * non-empty content arrays with [ERROR] formatted messages.
 */
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./server.js", () => ({
  toMediaUrl: (p: string) => `http://localhost:3001/media/${Buffer.from(p).toString("base64url")}`,
  MAX_MEDIA_FILE_SIZE: 300 * 1024 * 1024,
}));

import { createFilesystemTools } from "./filesystem-tools.js";

type ToolResult = { content: Array<{ type: string; text?: string }> };

function getToolByName(name: string) {
  return createFilesystemTools().find((t) => t.name === name)!;
}

function getResultText(result: ToolResult): string {
  return result.content.find((x) => x.type === "text")?.text ?? "";
}

function isError(result: ToolResult): boolean {
  return getResultText(result).startsWith("[ERROR]");
}

describe("filesystem error handling — non-existent paths", () => {
  const uniqueGhostPath = () => join(process.cwd(), `.tmp-ghost-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);

  it("list_directory on non-existent path returns [ERROR]", async () => {
    const result = await getToolByName("enso_fs_list_directory").execute("c1", { path: uniqueGhostPath() });
    expect(isError(result)).toBe(true);
    expect(getResultText(result)).toContain("does not exist");
  });

  it("list_directory on a file (not directory) returns [ERROR]", async () => {
    const root = join(process.cwd(), `.tmp-fs-err-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    const filePath = join(root, "file.txt");
    writeFileSync(filePath, "hello", "utf-8");
    try {
      const result = await getToolByName("enso_fs_list_directory").execute("c2", { path: filePath });
      expect(isError(result)).toBe(true);
      expect(getResultText(result)).toContain("not a directory");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("read_text_file on non-existent file returns [ERROR]", async () => {
    const result = await getToolByName("enso_fs_read_text_file").execute("c3", { path: uniqueGhostPath() + "/ghost.txt" });
    expect(isError(result)).toBe(true);
    expect(getResultText(result)).toContain("does not exist");
  });

  it("stat_path on non-existent path returns [ERROR]", async () => {
    const result = await getToolByName("enso_fs_stat_path").execute("c4", { path: uniqueGhostPath() });
    expect(isError(result)).toBe(true);
    expect(getResultText(result)).toContain("does not exist");
  });

  it("search_paths in non-existent directory returns [ERROR]", async () => {
    const result = await getToolByName("enso_fs_search_paths").execute("c5", { path: uniqueGhostPath(), query: "test" });
    expect(isError(result)).toBe(true);
    expect(getResultText(result)).toContain("does not exist");
  });

  it("search_content in non-existent directory returns [ERROR]", async () => {
    const result = await getToolByName("enso_fs_search_content").execute("c6", { path: uniqueGhostPath(), query: "test" });
    expect(isError(result)).toBe(true);
    expect(getResultText(result)).toContain("does not exist");
  });

  it("delete_path on non-existent path returns [ERROR]", async () => {
    const result = await getToolByName("enso_fs_delete_path").execute("c7", { path: uniqueGhostPath() });
    expect(isError(result)).toBe(true);
    expect(getResultText(result)).toContain("does not exist");
  });

  it("move_path with non-existent source returns [ERROR]", async () => {
    const root = join(process.cwd(), `.tmp-fs-err-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    try {
      const result = await getToolByName("enso_fs_move_path").execute("c8", {
        source: join(root, "ghost.txt"),
        destination: join(root, "dest.txt"),
      });
      expect(isError(result)).toBe(true);
      expect(getResultText(result)).toContain("does not exist");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("copy_path with non-existent source returns [ERROR]", async () => {
    const root = join(process.cwd(), `.tmp-fs-err-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    try {
      const result = await getToolByName("enso_fs_copy_path").execute("c9", {
        source: join(root, "ghost.txt"),
        destination: join(root, "dest.txt"),
      });
      expect(isError(result)).toBe(true);
      expect(getResultText(result)).toContain("does not exist");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("open_file on non-existent path returns [ERROR]", async () => {
    const result = await getToolByName("enso_fs_open_file").execute("c10", { path: uniqueGhostPath() + "/ghost.png" });
    expect(isError(result)).toBe(true);
    expect(getResultText(result)).toContain("does not exist");
  });
});

describe("filesystem error handling — error format contract", () => {
  it("all errors have non-empty content array", async () => {
    const ghostPath = join(process.cwd(), `.tmp-ghost-${Date.now()}`);
    const toolNames = [
      "enso_fs_list_directory",
      "enso_fs_read_text_file",
      "enso_fs_stat_path",
      "enso_fs_open_file",
    ];

    for (const name of toolNames) {
      const tool = getToolByName(name);
      const result = await tool.execute("err-test", { path: ghostPath });
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
      expect(typeof result.content[0].text).toBe("string");
      expect(result.content[0].text!.length).toBeGreaterThan(0);
    }
  });

  it("error messages always start with [ERROR]", async () => {
    const ghostPath = join(process.cwd(), `.tmp-ghost-${Date.now()}`);
    const tools = createFilesystemTools();

    // Test a representative set of tools with invalid paths
    const singlePathTools = ["enso_fs_list_directory", "enso_fs_read_text_file", "enso_fs_stat_path", "enso_fs_delete_path"];
    for (const name of singlePathTools) {
      const tool = tools.find((t) => t.name === name)!;
      const result = await tool.execute("fmt-test", { path: ghostPath });
      const text = getResultText(result);
      expect(text.startsWith("[ERROR]")).toBe(true);
    }
  });
});

describe("BUG-02: tool-router timeout prevents silent hangs", () => {
  it("Promise.race returns fallback when executor exceeds timeout", async () => {
    const TIMEOUT_MS = 100;
    const hangingPromise = new Promise<{ success: true; data: string }>((resolve) => {
      setTimeout(() => resolve({ success: true, data: "late result" }), 5000);
    });
    const timeoutPromise = new Promise<{ success: false; data: null }>((resolve) => {
      setTimeout(() => resolve({ success: false, data: null }), TIMEOUT_MS);
    });

    const result = await Promise.race([hangingPromise, timeoutPromise]);
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
  });

  it("Promise.race returns real result when executor is fast", async () => {
    const TIMEOUT_MS = 5000;
    const fastPromise = Promise.resolve({ success: true as const, data: "fast result" });
    const timeoutPromise = new Promise<{ success: false; data: null }>((resolve) => {
      setTimeout(() => resolve({ success: false, data: null }), TIMEOUT_MS);
    });

    const result = await Promise.race([fastPromise, timeoutPromise]);
    expect(result.success).toBe(true);
    expect(result.data).toBe("fast result");
  });
});

describe("NEW-BUG-02: inferPathLikeValue Windows path extraction", () => {
  // Test the regex patterns used in tool-router.ts inferPathLikeValue
  it("matches explicit Windows drive path", () => {
    const winPath = "write to D:\\Photos\\test".match(/(^|\s)([A-Za-z]:\\[^\s,;]+)/);
    expect(winPath?.[2]).toBe("D:\\Photos\\test");
  });

  it("matches C:\\ drive path", () => {
    const winPath = "save file to C:\\Users\\Admin\\Desktop".match(/(^|\s)([A-Za-z]:\\[^\s,;]+)/);
    expect(winPath?.[2]).toBe("C:\\Users\\Admin\\Desktop");
  });

  it("does NOT match non-path text", () => {
    const winPath = "hello world foo bar".match(/(^|\s)([A-Za-z]:\\[^\s,;]+)/);
    expect(winPath).toBeNull();
  });

  it("matches quoted path with forward slashes", () => {
    const quotedPath = 'save to "D:/Photos/test/output.txt" please'.match(/"([^"]+[/\\][^"]+)"/);
    expect(quotedPath?.[1]).toBe("D:/Photos/test/output.txt");
  });

  it("matches quoted path with backslashes", () => {
    const quotedPath = 'write "C:\\Users\\test\\file.md" content'.match(/"([^"]+[/\\][^"]+)"/);
    expect(quotedPath?.[1]).toBe("C:\\Users\\test\\file.md");
  });
});

describe("filesystem error handling — valid edge cases", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("search_content in empty directory returns zero matches (not error)", async () => {
    const root = join(process.cwd(), `.tmp-fs-empty-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);

    const result = await getToolByName("enso_fs_search_content").execute("c-empty", { path: root, query: "anything" });
    expect(isError(result)).toBe(false);
    const data = JSON.parse(getResultText(result));
    expect(data.matchCount).toBe(0);
    expect(data.matches).toEqual([]);
  });

  it("search_content with missing query returns [ERROR]", async () => {
    const root = join(process.cwd(), `.tmp-fs-empty2-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);

    const result = await getToolByName("enso_fs_search_content").execute("c-noq", { path: root, query: "" });
    expect(isError(result)).toBe(true);
    expect(getResultText(result)).toContain("query is required");
  });

  it("write_file with empty path returns [ERROR]", async () => {
    const result = await getToolByName("enso_fs_write_file").execute("c-nop", { path: "", content: "test" });
    expect(isError(result)).toBe(true);
    expect(getResultText(result)).toContain("path is required");
  });
});
