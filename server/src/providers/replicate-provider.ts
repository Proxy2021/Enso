/**
 * replicate-provider.ts — Replicate Real-ESRGAN AI upscaling provider.
 * Sprint 11: E5 — Cloud AI provider for image upscaling via Replicate API.
 *
 * Requires REPLICATE_API_TOKEN environment variable.
 * Uses nightmareai/real-esrgan model for high-quality upscaling with face enhancement.
 */

import type { MediaAIProvider, MediaAITask, MediaAIResult } from "../media-ai-gateway.js";
import { readFileSync, createWriteStream } from "fs";
import { pipeline } from "stream/promises";

export const replicateProvider: MediaAIProvider = {
  name: "replicate-esrgan",
  capabilities: ["upscale"],

  async isAvailable() {
    return !!process.env.REPLICATE_API_TOKEN;
  },

  async process(task: MediaAITask): Promise<MediaAIResult> {
    if (task.operation !== "upscale") {
      return { success: false, error: "Replicate provider only supports upscale operation" };
    }

    try {
      // @ts-expect-error replicate is an optional runtime dependency
      const Replicate = (await import("replicate")).default;
      const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

      const scale = (task.params.scale as number) || 4;
      const imageData = readFileSync(task.inputPath);
      const base64 = imageData.toString("base64");
      const mimeType = task.inputPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

      const output = await replicate.run("nightmareai/real-esrgan", {
        input: {
          image: `data:${mimeType};base64,${base64}`,
          scale,
          face_enhance: true,
        },
      });

      // Download result to outputPath
      const response = await fetch(output as string);
      if (!response.ok || !response.body) {
        return { success: false, error: `Failed to download upscaled image: ${response.status}` };
      }
      await pipeline(response.body as any, createWriteStream(task.outputPath));

      return {
        success: true,
        outputPath: task.outputPath,
        metadata: { scale, method: "Real-ESRGAN + GFPGAN (Replicate)" },
      };
    } catch (err: any) {
      return { success: false, error: `Replicate upscale failed: ${err.message}` };
    }
  },
};
