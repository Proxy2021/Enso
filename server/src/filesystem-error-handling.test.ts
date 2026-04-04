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
