import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./server.js", () => ({
  toMediaUrl: (p: string) => `http://localhost:3001/media/${Buffer.from(p).toString("base64url")}`,
  MAX_MEDIA_FILE_SIZE: 300 * 1024 * 1024,
}));

import { createFilesystemTools } from "./filesystem-tools";

function parseToolJsonText(result: { content: Array<{ type: string; text?: string }> }): unknown {
  const text = result.content.find((x) => x.type === "text")?.text ?? "";
  if (text.startsWith("[ERROR]")) return { error: text };
  return JSON.parse(text);
}

describe("filesystem tools", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("lists directory and reads file content", async () => {
    const root = join(process.cwd(), `.tmp-fs-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);
    const nested = join(root, "docs");
    mkdirSync(nested);
    const filePath = join(nested, "readme.txt");
    writeFileSync(filePath, "hello filesystem tool", "utf-8");

    const allTools = createFilesystemTools();
    const listTool = allTools.find((t) => t.name === "enso_fs_list_directory")!;
    const readTool = allTools.find((t) => t.name === "enso_fs_read_text_file")!;
    const listResult = await listTool.execute("call-1", { path: nested });
    const listData = parseToolJsonText(listResult) as Record<string, unknown>;
    expect(listData.tool).toBe("enso_fs_list_directory");
    expect(Array.isArray(listData.items)).toBe(true);
    expect((listData.items as Array<Record<string, unknown>>)[0]?.name).toBe("readme.txt");

    const readResult = await readTool.execute("call-2", { path: filePath });
    const readData = parseToolJsonText(readResult) as Record<string, unknown>;
    expect(readData.tool).toBe("enso_fs_read_text_file");
    expect(String(readData.content)).toContain("hello filesystem tool");
  });

  it("stats path and searches by query", async () => {
    const root = join(process.cwd(), `.tmp-fs-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);
    const srcDir = join(root, "src");
    mkdirSync(srcDir);
    const targetFile = join(srcDir, "alpha.ts");
    writeFileSync(targetFile, "export const alpha = 1;", "utf-8");

    const tools = createFilesystemTools();
    const statTool = tools.find((tool) => tool.name === "enso_fs_stat_path");
    const searchTool = tools.find((tool) => tool.name === "enso_fs_search_paths");
    expect(statTool).toBeDefined();
    expect(searchTool).toBeDefined();

    const statResult = await statTool!.execute("call-3", { path: targetFile });
    const statData = parseToolJsonText(statResult) as Record<string, unknown>;
    expect(statData.tool).toBe("enso_fs_stat_path");
    expect(statData.type).toBe("file");

    const searchResult = await searchTool!.execute("call-4", {
      path: root,
      query: "alpha",
      type: "file",
    });
    const searchData = parseToolJsonText(searchResult) as Record<string, unknown>;
    expect(searchData.tool).toBe("enso_fs_search_paths");
    expect((searchData.matches as Array<Record<string, unknown>>).some((m) => String(m.path).endsWith("alpha.ts"))).toBe(true);
  });

  it("rejects path outside allowed roots with security error", async () => {
    const tools = createFilesystemTools();
    const listTool = tools.find((tool) => tool.name === "enso_fs_list_directory");
    // /etc or C:\Windows are outside allowed roots (home, tmpdir, project)
    const result = await listTool!.execute("call-5", { path: "/etc" });
    const text = result.content.find((x) => x.type === "text")?.text ?? "";
    expect(text).toContain("[ERROR]");
    expect(text).toContain("outside allowed directories");
  });

  it("rejects path traversal attacks", async () => {
    const tools = createFilesystemTools();
    const readTool = tools.find((t) => t.name === "enso_fs_read_text_file")!;

    // Attempt to read sensitive system file via path traversal
    const result = await readTool.execute("call-6", { path: "C:\\Windows\\System32\\config\\SAM" });
    const text = result.content.find((x) => x.type === "text")?.text ?? "";
    expect(text).toContain("[ERROR]");
    expect(text).toContain("outside allowed directories");
  });

  it("rejects paths with null bytes", async () => {
    const tools = createFilesystemTools();
    const readTool = tools.find((t) => t.name === "enso_fs_read_text_file")!;

    const result = await readTool.execute("call-7", { path: "test\x00.txt" });
    const text = result.content.find((x) => x.type === "text")?.text ?? "";
    expect(text).toContain("[ERROR]");
    expect(text).toContain("invalid characters");
  });

  it("prevents deletion of protected system paths", async () => {
    const tools = createFilesystemTools();
    const deleteTool = tools.find((t) => t.name === "enso_fs_delete_path")!;

    const result = await deleteTool.execute("call-8", { path: "C:\\Windows\\System32" });
    const text = result.content.find((x) => x.type === "text")?.text ?? "";
    expect(text).toContain("[ERROR]");
  });

  // ── write_file tests ──

  it("writes a new file in create mode (default)", async () => {
    const root = join(process.cwd(), `.tmp-fs-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);

    const tools = createFilesystemTools();
    const writeTool = tools.find((t) => t.name === "enso_fs_write_file")!;
    const filePath = join(root, "test-write.txt");

    const result = await writeTool.execute("call-w1", { path: filePath, content: "hello world" });
    const data = parseToolJsonText(result) as Record<string, unknown>;
    expect(data.tool).toBe("enso_fs_write_file");
    expect(data.bytesWritten).toBe(11);
    expect(data.mode).toBe("create");
  });

  it("rejects overwrite in create mode", async () => {
    const root = join(process.cwd(), `.tmp-fs-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);
    const filePath = join(root, "existing.txt");
    writeFileSync(filePath, "original", "utf-8");

    const tools = createFilesystemTools();
    const writeTool = tools.find((t) => t.name === "enso_fs_write_file")!;

    const result = await writeTool.execute("call-w2", { path: filePath, content: "new content" });
    const text = result.content.find((x) => x.type === "text")?.text ?? "";
    expect(text).toContain("[ERROR]");
    expect(text).toContain("already exists");
  });

  it("allows overwrite in overwrite mode", async () => {
    const root = join(process.cwd(), `.tmp-fs-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);
    const filePath = join(root, "overwrite-me.txt");
    writeFileSync(filePath, "original", "utf-8");

    const tools = createFilesystemTools();
    const writeTool = tools.find((t) => t.name === "enso_fs_write_file")!;

    const result = await writeTool.execute("call-w3", { path: filePath, content: "replaced", mode: "overwrite" });
    const data = parseToolJsonText(result) as Record<string, unknown>;
    expect(data.tool).toBe("enso_fs_write_file");
    expect(data.mode).toBe("overwrite");
  });

  it("appends in append mode", async () => {
    const root = join(process.cwd(), `.tmp-fs-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);
    const filePath = join(root, "append-me.txt");
    writeFileSync(filePath, "line1\n", "utf-8");

    const tools = createFilesystemTools();
    const writeTool = tools.find((t) => t.name === "enso_fs_write_file")!;

    await writeTool.execute("call-w4", { path: filePath, content: "line2\n", mode: "append" });

    const readTool = tools.find((t) => t.name === "enso_fs_read_text_file")!;
    const readResult = await readTool.execute("call-w5", { path: filePath });
    const readData = parseToolJsonText(readResult) as Record<string, unknown>;
    expect(String(readData.content)).toContain("line1");
    expect(String(readData.content)).toContain("line2");
  });

  it("rejects write to protected system path", async () => {
    const tools = createFilesystemTools();
    const writeTool = tools.find((t) => t.name === "enso_fs_write_file")!;

    const result = await writeTool.execute("call-w6", { path: "C:\\Windows\\test.txt", content: "x" });
    const text = result.content.find((x) => x.type === "text")?.text ?? "";
    expect(text).toContain("[ERROR]");
  });

  it("auto-creates parent directories for write_file", async () => {
    const root = join(process.cwd(), `.tmp-fs-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);

    const tools = createFilesystemTools();
    const writeTool = tools.find((t) => t.name === "enso_fs_write_file")!;
    const deepPath = join(root, "a", "b", "c", "deep.txt");

    const result = await writeTool.execute("call-w7", { path: deepPath, content: "deep file" });
    const data = parseToolJsonText(result) as Record<string, unknown>;
    expect(data.tool).toBe("enso_fs_write_file");
  });

  // ── copy_path tests ──

  it("copies a file to a new location", async () => {
    const root = join(process.cwd(), `.tmp-fs-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);
    const srcFile = join(root, "src.txt");
    writeFileSync(srcFile, "copy me", "utf-8");
    const destFile = join(root, "dest.txt");

    const tools = createFilesystemTools();
    const copyTool = tools.find((t) => t.name === "enso_fs_copy_path")!;

    const result = await copyTool.execute("call-c1", { source: srcFile, destination: destFile });
    const data = parseToolJsonText(result) as Record<string, unknown>;
    expect(data.tool).toBe("enso_fs_list_directory"); // returns parent listing
  });

  it("rejects copy when source does not exist", async () => {
    const root = join(process.cwd(), `.tmp-fs-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);

    const tools = createFilesystemTools();
    const copyTool = tools.find((t) => t.name === "enso_fs_copy_path")!;

    const result = await copyTool.execute("call-c2", { source: join(root, "nope.txt"), destination: join(root, "dest.txt") });
    const text = result.content.find((x) => x.type === "text")?.text ?? "";
    expect(text).toContain("[ERROR]");
    expect(text).toContain("does not exist");
  });

  it("copies into directory preserving original name", async () => {
    const root = join(process.cwd(), `.tmp-fs-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);
    const srcFile = join(root, "original.txt");
    writeFileSync(srcFile, "hello", "utf-8");
    const destDir = join(root, "dest-folder");
    mkdirSync(destDir);

    const tools = createFilesystemTools();
    const copyTool = tools.find((t) => t.name === "enso_fs_copy_path")!;

    const result = await copyTool.execute("call-c3", { source: srcFile, destination: destDir });
    const data = parseToolJsonText(result) as Record<string, unknown>;
    // Should return listing of dest-folder
    expect(data.tool).toBe("enso_fs_list_directory");
  });

  // ── search_content tests ──

  it("finds text matches in files", async () => {
    const root = join(process.cwd(), `.tmp-fs-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);
    writeFileSync(join(root, "a.ts"), "const hello = 'world';\nconst foo = 'bar';", "utf-8");
    writeFileSync(join(root, "b.ts"), "console.log('test');", "utf-8");

    const tools = createFilesystemTools();
    const searchTool = tools.find((t) => t.name === "enso_fs_search_content")!;

    const result = await searchTool.execute("call-s1", { path: root, query: "hello" });
    const data = parseToolJsonText(result) as Record<string, unknown>;
    expect(data.tool).toBe("enso_fs_search_content");
    expect(data.matchCount).toBe(1);
    expect((data.matches as Array<Record<string, unknown>>)[0].lineNumber).toBe(1);
  });

  it("respects glob filter", async () => {
    const root = join(process.cwd(), `.tmp-fs-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);
    writeFileSync(join(root, "code.ts"), "findMe here", "utf-8");
    writeFileSync(join(root, "data.json"), '{"findMe": true}', "utf-8");

    const tools = createFilesystemTools();
    const searchTool = tools.find((t) => t.name === "enso_fs_search_content")!;

    const result = await searchTool.execute("call-s2", { path: root, query: "findMe", glob: "*.ts" });
    const data = parseToolJsonText(result) as Record<string, unknown>;
    expect(data.matchCount).toBe(1);
    expect((data.matches as Array<Record<string, unknown>>)[0].file).toContain("code.ts");
  });

  it("respects maxResults limit", async () => {
    const root = join(process.cwd(), `.tmp-fs-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    dirs.push(root);
    // Create a file with many matching lines
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}: match`).join("\n");
    writeFileSync(join(root, "many.txt"), lines, "utf-8");

    const tools = createFilesystemTools();
    const searchTool = tools.find((t) => t.name === "enso_fs_search_content")!;

    const result = await searchTool.execute("call-s3", { path: root, query: "match", maxResults: 5 });
    const data = parseToolJsonText(result) as Record<string, unknown>;
    expect(data.matchCount).toBe(5);
  });
});
