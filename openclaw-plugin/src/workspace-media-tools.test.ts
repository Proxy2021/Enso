import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkspaceTools } from "./workspace-tools";
import { createMediaTools } from "./media-tools";

function parseText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.find((x) => x.type === "text")?.text ?? "";
}

describe("workspace + media tools", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("workspace tools return repos, tools, and overview", async () => {
    const root = join(process.cwd(), `.tmp-ws-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    const repoDir = join(root, "EnsoDemo");
    mkdirSync(join(repoDir, ".git"), { recursive: true });
    mkdirSync(join(repoDir, "src"), { recursive: true });
    writeFileSync(join(repoDir, "src", "app.ts"), "export const ok = true;\n", "utf-8");
    dirs.push(root);

    const tools = createWorkspaceTools();
    const list = tools.find((tool) => tool.name === "enso_ws_list_repos");
    const detect = tools.find((tool) => tool.name === "enso_ws_detect_dev_tools");
    const overview = tools.find((tool) => tool.name === "enso_ws_project_overview");
    expect(list && detect && overview).toBeDefined();

    const listData = JSON.parse(parseText(await list!.execute("c1", { path: root }))) as Record<string, unknown>;
    expect(listData.tool).toBe("enso_ws_list_repos");
    expect((listData.repos as Array<Record<string, unknown>>).length).toBeGreaterThan(0);

    const detectData = JSON.parse(parseText(await detect!.execute("c2", { names: ["node", "npm"] }))) as Record<string, unknown>;
    expect(detectData.tool).toBe("enso_ws_detect_dev_tools");
    expect(Array.isArray(detectData.found)).toBe(true);

    const overviewData = JSON.parse(parseText(await overview!.execute("c3", { path: repoDir }))) as Record<string, unknown>;
    expect(overviewData.tool).toBe("enso_ws_project_overview");
    expect(Array.isArray(overviewData.extensionStats)).toBe(true);
  });

  it("media tools scan, inspect, and group media files", async () => {
    const root = join(process.cwd(), `.tmp-media-tool-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "a.jpg"), "x", "utf-8");
    writeFileSync(join(root, "b.png"), "x", "utf-8");
    writeFileSync(join(root, "c.mp4"), "x", "utf-8");
    dirs.push(root);

    const tools = createMediaTools();
    const scan = tools.find((tool) => tool.name === "enso_media_scan_library");
    const inspect = tools.find((tool) => tool.name === "enso_media_inspect_file");
    const group = tools.find((tool) => tool.name === "enso_media_group_by_type");
    expect(scan && inspect && group).toBeDefined();

    const scanData = JSON.parse(parseText(await scan!.execute("m1", { path: root }))) as Record<string, unknown>;
    expect(scanData.tool).toBe("enso_media_scan_library");
    expect((scanData.items as Array<Record<string, unknown>>).length).toBe(3);

    const inspectData = JSON.parse(parseText(await inspect!.execute("m2", { path: join(root, "a.jpg") }))) as Record<string, unknown>;
    expect(inspectData.tool).toBe("enso_media_inspect_file");
    expect(inspectData.type).toBe("image");

    const groupData = JSON.parse(parseText(await group!.execute("m3", { path: root }))) as Record<string, unknown>;
    expect(groupData.tool).toBe("enso_media_group_by_type");
    expect(Array.isArray(groupData.groups)).toBe(true);
  });
});
