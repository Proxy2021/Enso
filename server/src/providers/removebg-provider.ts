/**
 * removebg-provider.ts — remove.bg API provider for background removal.
 * Sprint 11: E5 — Cloud AI provider for background removal via remove.bg API.
 *
 * Requires REMOVE_BG_API_KEY environment variable.
 */

import type { MediaAIProvider, MediaAITask, MediaAIResult } from "../media-ai-gateway.js";
import { readFileSync, writeFileSync } from "fs";

export const removebgProvider: MediaAIProvider = {
  name: "remove-bg",
  capabilities: ["rmbg"],

  async isAvailable() {
    return !!process.env.REMOVE_BG_API_KEY;
  },

  async process(task: MediaAITask): Promise<MediaAIResult> {
    if (task.operation !== "rmbg") {
      return { success: false, error: "remove.bg provider only supports rmbg operation" };
    }

    try {
      const imageData = readFileSync(task.inputPath);
      const formData = new FormData();
      formData.append("image_file", new Blob([imageData]), "image.jpg");
      formData.append("size", "full");
      formData.append("format", (task.params.outputFormat as string) || "png");

      const response = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: { "X-Api-Key": process.env.REMOVE_BG_API_KEY! },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `remove.bg API error: ${response.status} — ${errText}` };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      writeFileSync(task.outputPath, buffer);

      return {
        success: true,
        outputPath: task.outputPath,
        metadata: { method: "remove.bg", format: (task.params.outputFormat as string) || "png" },
      };
    } catch (err: any) {
      return { success: false, error: `Background removal failed: ${err.message}` };
    }
  },
};
