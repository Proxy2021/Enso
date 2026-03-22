/**
 * video-tools.ts — FFmpeg-based video intelligence tools for the media_processing app.
 * Sprint 11: E3 — Video inspection, frame extraction, scene detection, thumbnail generation.
 */

import type { EnsoAgentTool } from "./local-types.js";
import { execFile, execFileSync } from "child_process";
import { promisify } from "util";
import { join, basename } from "path";
import { mkdirSync, existsSync, readdirSync } from "fs";

const execFileAsync = promisify(execFile);

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

// ── FFmpeg availability check (mirrors pattern from media-tools.ts) ──

let _hasFfmpeg: boolean | null = null;

export function hasFfmpeg(): boolean {
  if (_hasFfmpeg !== null) return _hasFfmpeg;
  try {
    execFileSync("ffprobe", ["-version"], { stdio: "ignore", timeout: 3000, windowsHide: true });
    _hasFfmpeg = true;
  } catch { _hasFfmpeg = false; }
  return _hasFfmpeg;
}

// ── Video Metadata Types ──

export interface VideoMetadata {
  duration: number;       // seconds
  width: number;
  height: number;
  codec: string;
  fps: number;
  bitrate: number;        // kbps
  audioCodec: string | null;
  audioChannels: number;
  fileSize: number;       // bytes
  format: string;
}

// ── Video Inspection ──

export async function inspectVideo(path: string): Promise<VideoMetadata> {
  if (!hasFfmpeg()) throw new Error("FFmpeg is not installed. Install from https://ffmpeg.org/download.html");
  if (!path || !path.trim()) throw new Error("Video file path is required");
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);

  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "quiet", "-print_format", "json",
    "-show_format", "-show_streams", path
  ]);
  const probe = JSON.parse(stdout);
  const videoStream = probe.streams?.find((s: any) => s.codec_type === "video");
  const audioStream = probe.streams?.find((s: any) => s.codec_type === "audio");

  // Parse fps safely (avoid eval)
  let fps = 0;
  const fpsStr = videoStream?.r_frame_rate || "0";
  const fpsParts = fpsStr.split("/");
  if (fpsParts.length === 2) {
    const num = parseFloat(fpsParts[0]);
    const den = parseFloat(fpsParts[1]);
    fps = den > 0 ? Math.round((num / den) * 100) / 100 : 0;
  } else {
    fps = parseFloat(fpsStr) || 0;
  }

  return {
    duration: parseFloat(probe.format?.duration || "0"),
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
    codec: videoStream?.codec_name || "unknown",
    fps,
    bitrate: Math.round((parseFloat(probe.format?.bit_rate || "0")) / 1000),
    audioCodec: audioStream?.codec_name || null,
    audioChannels: audioStream?.channels || 0,
    fileSize: parseInt(probe.format?.size || "0"),
    format: probe.format?.format_name || "unknown",
  };
}

// ── Frame Extraction ──

export async function extractFrames(params: {
  path: string;
  mode: "interval" | "keyframes" | "count";
  value?: number;
  outputDir: string;
}): Promise<string[]> {
  if (!hasFfmpeg()) throw new Error("FFmpeg is not installed.");
  if (!params.path || !existsSync(params.path)) throw new Error(`Video file not found: ${params.path}`);
  mkdirSync(params.outputDir, { recursive: true });

  const args: string[] = ["-i", params.path, "-y"];

  if (params.mode === "interval") {
    const interval = params.value || 5; // every N seconds
    args.push("-vf", `fps=1/${interval}`);
  } else if (params.mode === "keyframes") {
    args.push("-vf", "select='eq(pict_type\\,I)'", "-vsync", "vfr");
  } else if (params.mode === "count") {
    const count = params.value || 10;
    const meta = await inspectVideo(params.path);
    if (meta.duration <= 0) throw new Error("Cannot determine video duration");
    const interval = meta.duration / count;
    args.push("-vf", `fps=1/${interval}`);
  }

  args.push("-vsync", "vfr", join(params.outputDir, "frame_%04d.jpg"));
  await execFileAsync("ffmpeg", args, { timeout: 120_000 });

  return readdirSync(params.outputDir)
    .filter(f => f.startsWith("frame_"))
    .sort()
    .map(f => join(params.outputDir, f));
}

// ── Scene Detection ──

export interface SceneBoundary {
  timestamp: number;
  frameNumber: number;
  score: number;
}

export async function detectScenes(path: string, threshold: number = 0.3): Promise<SceneBoundary[]> {
  if (!hasFfmpeg()) throw new Error("FFmpeg is not installed.");
  if (!path || !existsSync(path)) throw new Error(`Video file not found: ${path}`);

  const { stderr } = await execFileAsync("ffmpeg", [
    "-i", path,
    "-vf", `select='gt(scene\\,${threshold})',showinfo`,
    "-vsync", "vfr",
    "-f", "null", "-"
  ], { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 });

  const scenes: SceneBoundary[] = [];
  const lines = stderr.split("\n");
  for (const line of lines) {
    const ptsMatch = line.match(/pts_time:(\d+\.?\d*)/);
    const nMatch = line.match(/n:\s*(\d+)/);
    if (ptsMatch) {
      scenes.push({
        timestamp: parseFloat(ptsMatch[1]),
        frameNumber: nMatch ? parseInt(nMatch[1]) : 0,
        score: 0,
      });
    }
  }
  return scenes;
}

// ── Thumbnail Generation ──

export async function generateThumbnail(params: {
  path: string;
  time?: number;
  size?: string;
  outputPath: string;
}): Promise<{ outputPath: string; timestamp: number; size: string }> {
  if (!hasFfmpeg()) throw new Error("FFmpeg is not installed.");
  if (!params.path || !existsSync(params.path)) throw new Error(`Video file not found: ${params.path}`);

  const time = params.time ?? 1; // default to 1 second in
  const size = params.size ?? "320x240";

  // Ensure output directory exists
  const outDir = join(params.outputPath, "..");
  mkdirSync(outDir, { recursive: true });

  await execFileAsync("ffmpeg", [
    "-y", "-i", params.path,
    "-ss", String(time),
    "-vframes", "1",
    "-s", size,
    params.outputPath
  ], { timeout: 30_000 });

  return { outputPath: params.outputPath, timestamp: time, size };
}

// ── Helpers ──

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

// ── Native Tool Definitions ──

type InspectParams = { path: string };
type FramesParams = { path: string; mode?: string; value?: number };
type ScenesParams = { path: string; threshold?: number };
type ThumbnailParams = { path: string; time?: number; size?: string };

export function createVideoTools(): EnsoAgentTool[] {
  return [
    {
      name: "enso_video_inspect",
      label: "Inspect Video",
      description: "Get detailed metadata from a video file (duration, resolution, codec, fps, bitrate, audio info).",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Path to the video file" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => {
        try {
          const data = await inspectVideo((params as InspectParams).path);
          return jsonResult(data);
        } catch (err: any) {
          return errorResult(err.message);
        }
      },
    } as EnsoAgentTool,
    {
      name: "enso_video_extract_frames",
      label: "Extract Frames",
      description: "Extract still frames from a video at intervals, keyframes, or a specific count.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Path to the video file" },
          mode: { type: "string", description: "Extraction mode: interval, keyframes, or count (default: count)" },
          value: { type: "number", description: "Seconds for interval mode, or frame count for count mode (default: 10)" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => {
        try {
          const p = params as FramesParams;
          const mode = (p.mode || "count") as "interval" | "keyframes" | "count";
          const outputDir = join(p.path, "..", `frames_${basename(p.path, "." + p.path.split(".").pop())}`);
          const frames = await extractFrames({ path: p.path, mode, value: p.value, outputDir });
          return jsonResult({ frames, count: frames.length, outputDir });
        } catch (err: any) {
          return errorResult(err.message);
        }
      },
    } as EnsoAgentTool,
    {
      name: "enso_video_detect_scenes",
      label: "Detect Scenes",
      description: "Find scene change boundaries in a video using frame difference analysis.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Path to the video file" },
          threshold: { type: "number", description: "Scene change sensitivity (0.0-1.0, lower = more sensitive, default: 0.3)" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => {
        try {
          const p = params as ScenesParams;
          const scenes = await detectScenes(p.path, p.threshold);
          return jsonResult({ scenes, count: scenes.length });
        } catch (err: any) {
          return errorResult(err.message);
        }
      },
    } as EnsoAgentTool,
    {
      name: "enso_video_thumbnail",
      label: "Generate Thumbnail",
      description: "Create a thumbnail image from a video at a specific timestamp.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Path to the video file" },
          time: { type: "number", description: "Timestamp in seconds to capture (default: 1)" },
          size: { type: "string", description: "Output size (e.g., '640x480', '1280x720', default: '320x240')" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => {
        try {
          const p = params as ThumbnailParams;
          const ext = p.path.split(".").pop() || "mp4";
          const outputPath = p.path.replace(new RegExp(`\\.${ext}$`), "_thumb.jpg");
          const result = await generateThumbnail({ ...p, outputPath });
          return jsonResult(result);
        } catch (err: any) {
          return errorResult(err.message);
        }
      },
    } as EnsoAgentTool,
  ];
}

export function registerVideoTools(api?: { registerTool: (tool: EnsoAgentTool) => void }): void {
  for (const tool of createVideoTools()) {
    if (api) api.registerTool(tool);
  }
}
