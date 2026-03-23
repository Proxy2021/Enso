/**
 * media-ai-gateway.ts — Model-agnostic AI media processing gateway.
 * Sprint 11: E4 — Contact sheet generation + AI processing interface.
 *
 * Supports multiple backends via provider interface.
 * Ships with sharp basic provider (when sharp is available).
 * Cloud providers (Replicate, remove.bg) registered by E5.
 */

import type { EnsoAgentTool } from "./local-types.js";
import { existsSync, readdirSync } from "fs";
import { join, extname } from "path";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

// ── Provider Interface ──

export interface MediaAIProvider {
  name: string;
  capabilities: MediaAICapability[];
  isAvailable(): Promise<boolean>;
  process(task: MediaAITask): Promise<MediaAIResult>;
}

export type MediaAICapability = "upscale" | "rmbg" | "enhance" | "colorize";

export interface MediaAITask {
  operation: MediaAICapability;
  inputPath: string;
  outputPath: string;
  params: Record<string, unknown>;
}

export interface MediaAIResult {
  success: boolean;
  outputPath?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

// ── Provider Registry ──

const providers: MediaAIProvider[] = [];

export function registerMediaAIProvider(provider: MediaAIProvider): void {
  providers.push(provider);
}

export async function processMediaAI(task: MediaAITask): Promise<MediaAIResult> {
  // Find first available provider that supports the operation
  for (const provider of providers) {
    if (provider.capabilities.includes(task.operation)) {
      const available = await provider.isAvailable();
      if (available) {
        return provider.process(task);
      }
    }
  }
  return {
    success: false,
    error: `No AI provider available for "${task.operation}". Basic resize is available via sharp. For AI-enhanced processing, set REPLICATE_API_TOKEN (upscaling) or REMOVE_BG_API_KEY (background removal) in your server/.env file.`,
  };
}

// ── Sharp Basic Provider (available when sharp is installed) ──

export const sharpBasicProvider: MediaAIProvider = {
  name: "basic-resize",
  capabilities: ["upscale"],

  async isAvailable() {
    try {
      // @ts-expect-error sharp is an optional runtime dependency
      await import("sharp");
      return true;
    } catch {
      return false;
    }
  },

  async process(task) {
    if (task.operation === "upscale") {
      try {
        // @ts-expect-error sharp is an optional runtime dependency
        const sharp = (await import("sharp")).default;
        const scale = (task.params.scale as number) || 2;
        const meta = await sharp(task.inputPath).metadata();
        const newWidth = (meta.width || 100) * scale;
        const newHeight = (meta.height || 100) * scale;
        await sharp(task.inputPath)
          .resize(newWidth, newHeight, { kernel: "lanczos3" })
          .toFile(task.outputPath);
        return {
          success: true,
          outputPath: task.outputPath,
          metadata: {
            width: newWidth,
            height: newHeight,
            method: "Basic Resize (Lanczos3 interpolation)",
            note: "This is mathematical interpolation, not AI enhancement. For AI-powered upscaling with detail recovery, configure REPLICATE_API_TOKEN in your environment.",
          },
        };
      } catch (err: any) {
        return { success: false, error: `Sharp upscale failed: ${err.message}` };
      }
    }
    return { success: false, error: "Unsupported operation for sharp-basic provider" };
  },
};

// Register default provider
registerMediaAIProvider(sharpBasicProvider);

// ── Cloud AI Provider Registration (E5) ──

let _cloudProvidersRegistered = false;

/** Register cloud AI providers (Replicate, remove.bg). Call once at startup. */
export async function registerCloudAIProviders(): Promise<void> {
  if (_cloudProvidersRegistered) return;
  _cloudProvidersRegistered = true;

  try {
    const { replicateProvider } = await import("./providers/replicate-provider.js");
    registerMediaAIProvider(replicateProvider);
  } catch { /* replicate module not available */ }

  try {
    const { removebgProvider } = await import("./providers/removebg-provider.js");
    registerMediaAIProvider(removebgProvider);
  } catch { /* removebg module not available */ }
}

// Auto-register cloud providers (async, non-blocking)
registerCloudAIProviders().catch(() => {});

// ── Contact Sheet Generation ──

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".gif"]);

export async function createContactSheet(params: {
  path: string;
  columns?: number;
  thumbSize?: number;
  showExif?: boolean;
  outputPath?: string;
}): Promise<{ outputPath: string; photoCount: number; dimensions: { width: number; height: number } }> {
  const { columns = 5, thumbSize = 300 } = params;

  if (!params.path || !existsSync(params.path)) {
    throw new Error(`Folder not found: ${params.path}`);
  }

  // Scan folder for images
  const files = readdirSync(params.path)
    .filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()))
    .sort();

  if (files.length === 0) throw new Error("No image files found in the specified folder.");

  const outputPath = params.outputPath || join(params.path, "_contact_sheet.jpg");

  // Try sharp-based contact sheet
  try {
    // @ts-expect-error sharp is an optional runtime dependency
    const sharp = (await import("sharp")).default;

    // Generate thumbnails
    const thumbs = await Promise.all(
      files.map(f =>
        sharp(join(params.path, f))
          .resize(thumbSize, thumbSize, { fit: "cover" })
          .jpeg({ quality: 85 })
          .toBuffer()
      )
    );

    // Compose grid
    const rows = Math.ceil(thumbs.length / columns);
    const width = columns * thumbSize;
    const height = rows * thumbSize;

    const composites = thumbs.map((thumb, i) => ({
      input: thumb,
      left: (i % columns) * thumbSize,
      top: Math.floor(i / columns) * thumbSize,
    }));

    await sharp({
      create: { width, height, channels: 3 as const, background: { r: 30, g: 30, b: 30 } }
    })
      .composite(composites)
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    return { outputPath, photoCount: files.length, dimensions: { width, height } };
  } catch (err: any) {
    // sharp not available — fallback to simple file listing
    if (err.message?.includes("Cannot find module") || err.code === "MODULE_NOT_FOUND") {
      throw new Error(
        `Contact sheet generation requires the 'sharp' image library. ` +
        `Found ${files.length} images in the folder. ` +
        `Install sharp (npm install sharp) to enable grid generation.`
      );
    }
    throw err;
  }
}

// ── Helpers ──

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

// ── Native Tool Definitions ──

type ContactSheetParams = { path: string; columns?: number; thumbSize?: number; showExif?: boolean };
type UpscaleParams = { path: string; scale?: number };
type RemoveBgParams = { path: string; outputFormat?: string };

export function createMediaProcessingTools(): EnsoAgentTool[] {
  return [
    {
      name: "enso_media_contact_sheet",
      label: "Contact Sheet",
      description: "Generate a contact sheet (thumbnail grid) from a folder of photos.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Path to folder containing photos" },
          columns: { type: "number", description: "Number of columns in grid (default: 5)" },
          thumbSize: { type: "number", description: "Size of each thumbnail in pixels (default: 300)" },
          showExif: { type: "boolean", description: "Show EXIF metadata overlay (default: true)" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => {
        try {
          const p = params as ContactSheetParams;
          const result = await createContactSheet(p);
          return jsonResult(result);
        } catch (err: any) {
          return errorResult(err.message);
        }
      },
    } as EnsoAgentTool,
    {
      name: "enso_media_upscale",
      label: "AI Upscale",
      description: "Upscale an image to 2x or 4x resolution using AI enhancement.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Path to the image file" },
          scale: { type: "number", description: "Scale factor: 2 or 4 (default: 2)" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => {
        try {
          const p = params as UpscaleParams;
          if (!p.path || !existsSync(p.path)) return errorResult(`File not found: ${p.path}`);
          const scale = p.scale || 2;
          const ext = extname(p.path);
          const outputPath = p.path.replace(new RegExp(`\\${ext}$`), `_${scale}x${ext}`);
          const result = await processMediaAI({
            operation: "upscale",
            inputPath: p.path,
            outputPath,
            params: { scale },
          });
          if (!result.success) return errorResult(result.error || "Upscale failed");
          return jsonResult(result);
        } catch (err: any) {
          return errorResult(err.message);
        }
      },
    } as EnsoAgentTool,
    {
      name: "enso_media_remove_bg",
      label: "Remove Background",
      description: "Remove the background from an image, outputting a transparent PNG.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Path to the image file" },
          outputFormat: { type: "string", description: "Output format: png or webp (default: png)" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => {
        try {
          const p = params as RemoveBgParams;
          if (!p.path || !existsSync(p.path)) return errorResult(`File not found: ${p.path}`);
          const format = p.outputFormat || "png";
          const outputPath = p.path.replace(/\.\w+$/, `_nobg.${format}`);
          const result = await processMediaAI({
            operation: "rmbg",
            inputPath: p.path,
            outputPath,
            params: { outputFormat: format },
          });
          if (!result.success) return errorResult(result.error || "Background removal failed");
          return jsonResult(result);
        } catch (err: any) {
          return errorResult(err.message);
        }
      },
    } as EnsoAgentTool,
  ];
}

export function registerMediaProcessingTools(api?: { registerTool: (tool: EnsoAgentTool) => void }): void {
  for (const tool of createMediaProcessingTools()) {
    if (api) api.registerTool(tool);
  }
}
