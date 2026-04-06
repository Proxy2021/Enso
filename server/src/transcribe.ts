/**
 * Audio transcription via Gemini 2.0 Flash API.
 *
 * Used in inbound message processing to enrich audio attachments with
 * their transcription before sending to the agent.
 */

import { readFile } from "fs/promises";
import { extname } from "path";
import { MAX_TRANSCRIBE_FILE_SIZE } from "./config.js";
import { llmVision } from "./llm.js";
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
 * Transcribe an audio buffer using Gemini 2.0 Flash — no disk I/O.
 * Used by the /transcribe endpoint to avoid writing temp files.
 */
export async function transcribeAudioBuffer(params: {
  audioBuffer: Buffer;
  mimeType: string;
  geminiApiKey: string;
}): Promise<string | null> {
  const { audioBuffer, mimeType, geminiApiKey } = params;

  try {
    if (audioBuffer.length > MAX_TRANSCRIBE_FILE_SIZE) {
      logAction({ ts: Date.now(), type: "action", category: "transcribe", message: `buffer too large (${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB > ${(MAX_TRANSCRIBE_FILE_SIZE / 1024 / 1024).toFixed(0)}MB limit)` });
      return null;
    }

    return await callGeminiTranscribe(audioBuffer.toString("base64"), mimeType, geminiApiKey, `buffer(${audioBuffer.length}b)`);
  } catch (err) {
    logError("transcribe", "buffer transcription failed (non-fatal)", err);
    return null;
  }
}

/**
 * Transcribe an audio file using Gemini 2.0 Flash.
 * Used by inbound.ts for file-based audio attachments.
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

    return await callGeminiTranscribe(fileBuffer.toString("base64"), mimeType, geminiApiKey, filePath);
  } catch (err) {
    logError("transcribe", "transcription failed (non-fatal)", err);
    return null;
  }
}

/** Shared Gemini transcription call used by both buffer and file paths. */
async function callGeminiTranscribe(
  base64Data: string,
  mimeType: string,
  geminiApiKey: string,
  sourceLabel: string,
): Promise<string | null> {
  try {
    const transcript = await llmVision({
      prompt: "Transcribe this audio. Return only the transcription text, nothing else.",
      tier: "utility",
      maxOutputTokens: 8192,
      temperature: 0,
      apiKey: geminiApiKey,
      imageBase64: base64Data,
      imageMimeType: mimeType,
    });

    if (!transcript?.trim()) {
      logError("transcribe", "no transcript in Gemini response");
      return null;
    }

    logAction({ ts: Date.now(), type: "action", category: "transcribe", message: `success: ${transcript.trim().length} chars from ${sourceLabel}` });
    return transcript.trim();
  } catch (err) {
    logError("transcribe", `transcription API call failed`, err);
    return null;
  }
}
