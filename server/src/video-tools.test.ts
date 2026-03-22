import { describe, expect, it, vi, beforeEach } from "vitest";

// vi.hoisted runs before vi.mock — allows shared mock refs in hoisted factories
const { _execFileAsyncMock } = vi.hoisted(() => ({
  _execFileAsyncMock: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));

// Mock child_process with custom promisify support so promisify(execFile) works
vi.mock("child_process", () => {
  const execFileMock: any = vi.fn();
  execFileMock[Symbol.for("nodejs.util.promisify.custom")] = _execFileAsyncMock;
  return {
    execFile: execFileMock,
    execFileSync: vi.fn(),
  };
});

// Mock fs for file existence checks
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn(() => ["frame_0001.jpg", "frame_0002.jpg", "frame_0003.jpg"]),
  };
});

import { execFileSync } from "child_process";
import { existsSync } from "fs";
import {
  createVideoTools,
  hasFfmpeg,
  inspectVideo,
  extractFrames,
  detectScenes,
  generateThumbnail,
} from "./video-tools";

function parseText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.find((x) => x.type === "text")?.text ?? "";
}

// Reset hasFfmpeg cached value between tests
function resetFfmpegCache() {
  // The module caches _hasFfmpeg; re-importing won't help.
  // We control execFileSync mock to return success or throw.
}

describe("video-tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: FFmpeg available, files exist
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(""));
    vi.mocked(existsSync).mockReturnValue(true);
  });

  // ── createVideoTools() factory ──

  describe("createVideoTools", () => {
    it("returns exactly 4 tools", () => {
      const tools = createVideoTools();
      expect(tools).toHaveLength(4);
    });

    it("returns tools with correct names", () => {
      const tools = createVideoTools();
      const names = tools.map((t) => t.name);
      expect(names).toContain("enso_video_inspect");
      expect(names).toContain("enso_video_extract_frames");
      expect(names).toContain("enso_video_detect_scenes");
      expect(names).toContain("enso_video_thumbnail");
    });

    it("all tools have required properties", () => {
      const tools = createVideoTools();
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.label).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.parameters).toBeDefined();
        expect(typeof tool.execute).toBe("function");
      }
    });

    it("all tools require path parameter", () => {
      const tools = createVideoTools();
      for (const tool of tools) {
        expect(tool.parameters.required).toContain("path");
      }
    });
  });

  // ── Input validation ──

  describe("input validation", () => {
    it("inspectVideo rejects empty path", async () => {
      await expect(inspectVideo("")).rejects.toThrow("Video file path is required");
    });

    it("inspectVideo rejects whitespace-only path", async () => {
      await expect(inspectVideo("   ")).rejects.toThrow("Video file path is required");
    });

    it("inspectVideo rejects missing file", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await expect(inspectVideo("/missing/video.mp4")).rejects.toThrow("File not found");
    });

    it("extractFrames rejects missing file", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await expect(
        extractFrames({ path: "/missing/video.mp4", mode: "count", outputDir: "/tmp/out" })
      ).rejects.toThrow("Video file not found");
    });

    it("detectScenes rejects missing file", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await expect(detectScenes("/missing/video.mp4")).rejects.toThrow("Video file not found");
    });

    it("generateThumbnail rejects missing file", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await expect(
        generateThumbnail({ path: "/missing/video.mp4", outputPath: "/tmp/thumb.jpg" })
      ).rejects.toThrow("Video file not found");
    });
  });

  // ── Execute wrappers (tool.execute) ──

  describe("execute wrappers", () => {
    it("inspect tool returns [ERROR] on missing file", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tools = createVideoTools();
      const inspect = tools.find((t) => t.name === "enso_video_inspect")!;
      const result = await inspect.execute("call-1", { path: "/missing.mp4" });
      expect(parseText(result)).toMatch(/\[ERROR\]/);
    });

    it("extract_frames tool returns [ERROR] on missing file", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tools = createVideoTools();
      const extract = tools.find((t) => t.name === "enso_video_extract_frames")!;
      const result = await extract.execute("call-2", { path: "/missing.mp4" });
      expect(parseText(result)).toMatch(/\[ERROR\]/);
    });

    it("detect_scenes tool returns [ERROR] on missing file", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tools = createVideoTools();
      const scenes = tools.find((t) => t.name === "enso_video_detect_scenes")!;
      const result = await scenes.execute("call-3", { path: "/missing.mp4" });
      expect(parseText(result)).toMatch(/\[ERROR\]/);
    });

    it("thumbnail tool returns [ERROR] on missing file", async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const tools = createVideoTools();
      const thumb = tools.find((t) => t.name === "enso_video_thumbnail")!;
      const result = await thumb.execute("call-4", { path: "/missing.mp4" });
      expect(parseText(result)).toMatch(/\[ERROR\]/);
    });

    it("inspect tool returns valid JSON on success", async () => {
      const probeOutput = JSON.stringify({
        streams: [
          { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, r_frame_rate: "30/1" },
          { codec_type: "audio", codec_name: "aac", channels: 2 },
        ],
        format: { duration: "120.5", bit_rate: "5000000", size: "75000000", format_name: "mp4" },
      });
      _execFileAsyncMock.mockResolvedValueOnce({ stdout: probeOutput, stderr: "" });

      const tools = createVideoTools();
      const inspect = tools.find((t) => t.name === "enso_video_inspect")!;
      const result = await inspect.execute("call-5", { path: "/test/video.mp4" });
      const text = parseText(result);
      expect(text).not.toMatch(/\[ERROR\]/);
      const data = JSON.parse(text);
      expect(data.width).toBe(1920);
      expect(data.height).toBe(1080);
      expect(data.codec).toBe("h264");
      expect(data.fps).toBe(30);
      expect(data.duration).toBe(120.5);
    });
  });

  // ── hasFfmpeg ──

  describe("hasFfmpeg", () => {
    it("returns a boolean", () => {
      const result = hasFfmpeg();
      expect(typeof result).toBe("boolean");
    });
  });
});
