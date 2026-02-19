import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
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

    const [listTool, readTool] = createFilesystemTools();
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

  it("returns error for path outside allowed roots", async () => {
    const tools = createFilesystemTools();
    const listTool = tools.find((tool) => tool.name === "enso_fs_list_directory");
    const result = await listTool!.execute("call-5", { path: "/etc" });
    const text = result.content.find((x) => x.type === "text")?.text ?? "";
    expect(text.startsWith("[ERROR]")).toBe(true);
  });
});
