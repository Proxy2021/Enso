/**
 * seedance-tools.ts — BytePlus Seedance video generation tools.
 *
 * Supports:
 *   - Text-to-Video (T2V): Generate video from a text prompt
 *   - Image-to-Video (I2V): Animate a still image into video
 *
 * Uses the BytePlus ModelArk async API: submit → poll → download.
 * Endpoint: POST /contents/generations/tasks
 * Status:   GET  /contents/generations/tasks/{taskId}
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import type { EnsoAgentTool } from "./local-types.js";
import { toMediaUrl } from "./server.js";
import { ensureEnsoDir } from "./utils/home.js";
import { logAction, logError } from "./action-log.js";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

// ── Config ──

const BASE_URL =
  process.env.SEEDANCE_BASE_URL ??
  "https://ark.ap-southeast.bytepluses.com/api/v3";
const DEFAULT_MODEL =
  process.env.SEEDANCE_MODEL ?? "seedance-1-5-pro-251215";
const POLL_INTERVAL_MS = 15_000; // BytePlus recommends 15s
const TIMEOUT_MS = 10 * 60_000; // 10 minutes — extended for long clips on paid tier
const MAX_DURATION = 30; // Client-side guard; actual limit is API-tier-dependent (standard: ~10s, pro paid: ~15-30s)

function getApiKey(): string {
  return process.env.BYTEPLUS_API_KEY ?? "";
}

function getOutputDir(): string {
  return ensureEnsoDir("data", "seedance");
}

// ── BytePlus ModelArk API Types ──

interface TaskResponse {
  id: string;
  model: string;
  status: "queued" | "running" | "succeeded" | "failed" | "expired";
  /** content can be an object with video_url string, or an array of items */
  content?:
    | { video_url?: string; [key: string]: unknown }
    | Array<{ type?: string; video_url?: string | { url: string }; [key: string]: unknown }>;
  error?: { code: string; message: string };
  usage?: { total_tokens: number };
  seed?: number;
  resolution?: string;
  ratio?: string;
  duration?: number;
  [key: string]: unknown;
}

// ── API Client ──

async function submitTask(
  body: Record<string, unknown>,
): Promise<TaskResponse> {
  const apiKey = getApiKey();
  const url = `${BASE_URL}/contents/generations/tasks`;

  logAction({
    ts: Date.now(),
    type: "action",
    category: "seedance",
    message: `POST ${url} model=${body.model}`,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Seedance API error ${res.status}: ${errText.slice(0, 500)}`);
  }

  return res.json() as Promise<TaskResponse>;
}

async function pollTask(taskId: string): Promise<TaskResponse> {
  const apiKey = getApiKey();
  const url = `${BASE_URL}/contents/generations/tasks/${taskId}`;
  const startTime = Date.now();

  while (Date.now() - startTime < TIMEOUT_MS) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Seedance poll error ${res.status}: ${errText.slice(0, 500)}`,
      );
    }

    const task = (await res.json()) as TaskResponse;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    if (task.status === "succeeded") {
      logAction({
        ts: Date.now(),
        type: "action",
        category: "seedance",
        message: `Task ${taskId} succeeded after ${elapsed}s`,
      });
      return task;
    }

    if (task.status === "failed") {
      throw new Error(
        `Video generation failed: ${task.error?.message || "Unknown error"}`,
      );
    }

    if (task.status === "expired") {
      throw new Error("Video generation task expired");
    }

    logAction({
      ts: Date.now(),
      type: "action",
      category: "seedance",
      message: `Task ${taskId}: ${task.status} (${elapsed}s)`,
    });

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Video generation timed out after ${TIMEOUT_MS / 1000}s`);
}

function extractVideoUrl(task: TaskResponse): string {
  if (!task.content) throw new Error("No content in completed response");

  // content can be an object { video_url: "..." } or an array
  if (!Array.isArray(task.content)) {
    // Object form: { video_url: "https://..." }
    if (typeof task.content.video_url === "string") return task.content.video_url;
  } else {
    // Array form: look for video_url in items
    for (const item of task.content) {
      if (typeof item.video_url === "string") return item.video_url;
      if (typeof item.video_url === "object" && item.video_url?.url)
        return item.video_url.url;
    }
  }

  throw new Error("No video URL in completed response");
}

async function downloadVideo(
  url: string,
  filename: string,
): Promise<string> {
  const outputDir = getOutputDir();
  const outputPath = join(outputDir, filename);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(outputPath, buffer);

  return outputPath;
}

// ── Tools ──

export function createSeedanceTools(): EnsoAgentTool[] {
  return [
    // ── Text-to-Video ──
    {
      name: "enso_seedance_generate",
      label: "Generate Video (Seedance)",
      description:
        "Generate a video from a text prompt using BytePlus Seedance 1.5 Pro. " +
        "Supports cinematic, realistic, anime, and 3D styles. " +
        "Duration 4-15 seconds (paid tier), up to 1080p resolution with native audio. " +
        "Default: 1080p 9:16 portrait optimized for 短视频 (Douyin/TikTok).",
      isPrimary: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          prompt: {
            type: "string",
            description:
              "Detailed scene description. English recommended. Include camera motion, lighting, and style for best results.",
          },
          duration: {
            type: "number",
            description: `Video duration in seconds (4-${MAX_DURATION}). Default: 5. Actual max depends on your BytePlus tier — standard ~10s, paid pro potentially higher. API will return an error if your tier doesn't support the requested duration.`,
          },
          resolution: {
            type: "string",
            enum: ["480p", "720p", "1080p"],
            description:
              "Output resolution. Default: 1080p for production-quality 短视频. Lower = faster generation.",
          },
          ratio: {
            type: "string",
            enum: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
            description: "Aspect ratio. Default: 9:16 (portrait, optimized for Douyin/TikTok 短视频)",
          },
          generate_audio: {
            type: "boolean",
            description:
              "Generate native audio alongside the video. Default: true. Only supported by Seedance 1.5 Pro.",
          },
          seed: {
            type: "number",
            description: "Random seed for reproducibility. Optional.",
          },
        },
        required: ["prompt"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => {
        const apiKey = getApiKey();
        if (!apiKey) {
          return errorResult(
            "BYTEPLUS_API_KEY is not configured. Set it in Settings or ~/.enso/api-keys.json to use Seedance video generation.\n" +
              "Get an API key at: https://console.byteplus.com/",
          );
        }

        const prompt = params.prompt as string;
        const duration = (params.duration as number) ?? 5;
        const resolution = (params.resolution as string) ?? "1080p";
        const ratio = (params.ratio as string) ?? "9:16";
        const generateAudio = (params.generate_audio as boolean) ?? true;
        const seed = params.seed as number | undefined;

        if (duration < 4 || duration > MAX_DURATION) {
          return errorResult(`Duration must be between 4 and ${MAX_DURATION} seconds (paid tier)`);
        }

        logAction({
          ts: Date.now(),
          type: "action",
          category: "seedance",
          message: `T2V: "${prompt.slice(0, 80)}..." ${duration}s ${resolution} ${ratio}`,
        });

        try {
          // Build request body per BytePlus ModelArk spec
          const body: Record<string, unknown> = {
            model: DEFAULT_MODEL,
            content: [{ type: "text", text: prompt }],
            duration,
            resolution,
            ratio,
            generate_audio: generateAudio,
          };
          if (seed !== undefined && seed >= 0) body.seed = seed;

          // Submit task
          const task = await submitTask(body);
          const taskId = task.id;
          logAction({
            ts: Date.now(),
            type: "action",
            category: "seedance",
            message: `Job submitted: ${taskId}`,
          });

          // If already succeeded (unlikely), extract immediately
          let finalTask = task;
          if (task.status !== "succeeded") {
            finalTask = await pollTask(taskId);
          }

          // Extract video URL and download
          const videoUrl = extractVideoUrl(finalTask);
          const filename = `seedance_${Date.now()}.mp4`;
          const localPath = await downloadVideo(videoUrl, filename);

          logAction({
            ts: Date.now(),
            type: "action",
            category: "seedance",
            message: `Video saved: ${localPath}`,
          });

          return jsonResult({
            tool: "enso_seedance_generate",
            videoPath: localPath,
            url: toMediaUrl(localPath),
            sourceUrl: videoUrl,
            prompt,
            duration,
            resolution,
            ratio,
            generateAudio,
            taskId,
          });
        } catch (err: any) {
          logError("seedance", "T2V generation failed", err);
          return errorResult(`Video generation failed: ${err.message}`);
        }
      },
    } as EnsoAgentTool,

    // ── Image-to-Video ──
    {
      name: "enso_seedance_image_to_video",
      label: "Image to Video (Seedance)",
      description:
        "Animate a still image into a video using BytePlus Seedance 1.5 Pro. " +
        "Provide an image as the first frame and an optional motion description.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          image_path: {
            type: "string",
            description: "Path to the source image to animate (first frame)",
          },
          prompt: {
            type: "string",
            description:
              "Optional motion/scene description (e.g., 'camera slowly zooms in, leaves sway gently').",
          },
          duration: {
            type: "number",
            description: `Video duration in seconds (4-${MAX_DURATION}). Default: 5.`,
          },
          resolution: {
            type: "string",
            enum: ["480p", "720p", "1080p"],
            description: "Output resolution. Default: 1080p.",
          },
          ratio: {
            type: "string",
            enum: [
              "16:9",
              "9:16",
              "1:1",
              "4:3",
              "3:4",
              "21:9",
              "adaptive",
            ],
            description:
              "Aspect ratio. Default: adaptive (matches source image).",
          },
        },
        required: ["image_path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => {
        const apiKey = getApiKey();
        if (!apiKey) {
          return errorResult(
            "BYTEPLUS_API_KEY is not configured. Set it in Settings or ~/.enso/api-keys.json to use Seedance video generation.\n" +
              "Get an API key at: https://console.byteplus.com/",
          );
        }

        const imagePath = params.image_path as string;
        const prompt = (params.prompt as string) ?? "";
        const duration = (params.duration as number) ?? 5;
        const resolution = (params.resolution as string) ?? "1080p";
        const ratio = (params.ratio as string) ?? "adaptive";

        if (!existsSync(imagePath)) {
          return errorResult(`Image not found: ${imagePath}`);
        }

        // Read and encode image as data URL
        const imageBuffer = readFileSync(imagePath);
        const base64Image = imageBuffer.toString("base64");
        const ext = extname(imagePath).toLowerCase();
        const mimeMap: Record<string, string> = {
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".webp": "image/webp",
          ".gif": "image/gif",
        };
        const mimeType = mimeMap[ext] || "image/jpeg";
        const dataUrl = `data:${mimeType};base64,${base64Image}`;

        logAction({
          ts: Date.now(),
          type: "action",
          category: "seedance",
          message: `I2V: "${imagePath}" → ${duration}s ${resolution}`,
        });

        try {
          // Build content array: image as first_frame + optional text prompt
          const content: Array<Record<string, unknown>> = [
            {
              type: "image_url",
              image_url: { url: dataUrl },
              role: "first_frame",
            },
          ];
          if (prompt) {
            content.push({ type: "text", text: prompt });
          }

          const body: Record<string, unknown> = {
            model: DEFAULT_MODEL,
            content,
            duration,
            resolution,
            ratio,
          };

          // Submit task
          const task = await submitTask(body);
          const taskId = task.id;
          logAction({
            ts: Date.now(),
            type: "action",
            category: "seedance",
            message: `I2V job submitted: ${taskId}`,
          });

          // Poll
          let finalTask = task;
          if (task.status !== "succeeded") {
            finalTask = await pollTask(taskId);
          }

          // Download
          const videoUrl = extractVideoUrl(finalTask);
          const filename = `seedance_i2v_${Date.now()}.mp4`;
          const localPath = await downloadVideo(videoUrl, filename);

          logAction({
            ts: Date.now(),
            type: "action",
            category: "seedance",
            message: `I2V video saved: ${localPath}`,
          });

          return jsonResult({
            tool: "enso_seedance_image_to_video",
            videoPath: localPath,
            url: toMediaUrl(localPath),
            sourceUrl: videoUrl,
            sourceImage: imagePath,
            prompt,
            duration,
            resolution,
            ratio,
            taskId,
          });
        } catch (err: any) {
          logError("seedance", "I2V generation failed", err);
          return errorResult(`Image-to-video generation failed: ${err.message}`);
        }
      },
    } as EnsoAgentTool,
  ];
}
