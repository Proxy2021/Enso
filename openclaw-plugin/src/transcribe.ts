/**
 * Audio transcription via Gemini 2.0 Flash API.
 *
 * Used in inbound message processing to enrich audio attachments with
 * their transcription before sending to the agent.
 */

import { readFile } from "fs/promises";
import { extname } from "path";

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

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB — Gemini inline data limit

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
      console.log(`[enso:transcribe] unsupported audio format: ${ext}`);
      return null;
    }

    const fileBuffer = await readFile(filePath);

    if (fileBuffer.length > MAX_FILE_SIZE) {
      console.log(`[enso:transcribe] file too large (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB > 20MB limit): ${filePath}`);
      return null;
    }

    const base64Data = fileBuffer.toString("base64");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
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
      console.log(`[enso:transcribe] Gemini API error ${response.status}: ${errorText.slice(0, 200)}`);
      return null;
    }

    const result = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const transcript = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!transcript) {
      console.log(`[enso:transcribe] no transcript in Gemini response`);
      return null;
    }

    console.log(`[enso:transcribe] success: ${transcript.length} chars from ${filePath}`);
    return transcript;
  } catch (err) {
    console.log(`[enso:transcribe] failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
