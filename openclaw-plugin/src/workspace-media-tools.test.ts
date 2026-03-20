import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("openclaw/plugin-sdk", () => ({}));
vi.mock("./server.js", () => ({
  toMediaUrl: (p: string) => `http://localhost:3001/media/${Buffer.from(p).toString("base64url")}`,
  MAX_MEDIA_FILE_SIZE: 300 * 1024 * 1024,
}));
vi.mock("./action-log.js", () => ({
  logAction: vi.fn(),
  logError: vi.fn(),
}));

import { createMediaTools } from "./media-tools";

function parseText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.find((x) => x.type === "text")?.text ?? "";
}

describe("media tools", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
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
