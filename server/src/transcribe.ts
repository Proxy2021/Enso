/**
 * Audio transcription via Gemini 2.0 Flash API.
 *
 * Used in inbound message processing to enrich audio attachments with
 * their transcription before sending to the agent.
 */

import { readFile } from "fs/promises";
import { extname } from "path";
import { geminiUrl, GEMINI_MODEL_UTILITY, MAX_TRANSCRIBE_FILE_SIZE } from "./config.js";
import { logAction, logError } from "./action-log.js";

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".webm", ".wma"]);

const MIME_MAP: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".webm": "audio/webm",
  ".wma": "audio/x-ms-wma",
};

/** Check if a file path points to an audio file based on extension. */
export function isAudioFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

/**
 * Transcribe an audio file using Gemini 2.0 Flash.
 * Returns the transcript text, or null on failure (non-fatal).
 */
export async function transcribeAudio(params: {
  filePath: string;
  geminiApiKey: string;
}): Promise<string | null> {
  const { filePath, geminiApiKey } = params;

  try {
    const ext = extname(filePath).toLowerCase();
    const mimeType = MIME_MAP[ext];
    if (!mimeType) {
      logAction({ ts: Date.now(), type: "action", category: "transcribe", message: `unsupported audio format: ${ext}` });
      return null;
    }

    const fileBuffer = await readFile(filePath);

    if (fileBuffer.length > MAX_TRANSCRIBE_FILE_SIZE) {
      logAction({ ts: Date.now(), type: "action", category: "transcribe", message: `file too large (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB > ${(MAX_TRANSCRIBE_FILE_SIZE / 1024 / 1024).toFixed(0)}MB limit): ${filePath}` });
      return null;
    }

    const base64Data = fileBuffer.toString("base64");

    const response = await fetch(
      geminiUrl(GEMINI_MODEL_UTILITY, geminiApiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
                {
                  text: "Transcribe this audio. Return only the transcription text, nothing else.",
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 8192,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      logError("transcribe", `Gemini API error ${response.status}: ${errorText.slice(0, 200)}`);
      return null;
    }

    const result = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const transcript = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!transcript) {
      logError("transcribe", "no transcript in Gemini response");
      return null;
    }

    logAction({ ts: Date.now(), type: "action", category: "transcribe", message: `success: ${transcript.length} chars from ${filePath}` });
    return transcript;
  } catch (err) {
    logError("transcribe", "transcription failed (non-fatal)", err);
    return null;
  }
}
