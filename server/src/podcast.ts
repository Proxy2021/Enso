/**
 * podcast.ts — Shared podcast generation pipeline.
 *
 * Provides script generation (via callChatLLM, any provider) and
 * audio rendering (via Gemini TTS, Gemini-only). Used by the researcher
 * and the universal card summarizer.
 */

import { GEMINI_API_BASE, LLM_FAST_TIMEOUT_MS } from "./config.js";
import { llm } from "./llm.js";
import { logAction, logError } from "./action-log.js";

// ── Types ──

export interface PodcastContent {
  title: string;
  summary: string;
  keyPoints: string[];
  contradictions?: string[];
  narrative?: string;
}

// ── Gemini API Key Resolution ──

export async function getGeminiApiKey(): Promise<string | undefined> {
  try {
    const { getActiveAccount } = await import("./server.js");
    const fromAccount = getActiveAccount()?.geminiApiKey;
    if (fromAccount) return fromAccount;
  } catch { /* server not ready yet */ }

  return process.env.GEMINI_API_KEY ?? undefined;
}

// ── Script Generation (any LLM provider) ──

const PODCAST_SCRIPT_PROMPT = `You are a podcast script writer. Given content to discuss, write a natural 3-5 minute conversational podcast script between two hosts.

Rules:
- Use exactly "Host A:" and "Host B:" as speaker tags (one per line, alternating)
- Host A drives the conversation, introduces the topic, asks questions
- Host B provides insights, adds detail, plays devil's advocate
- Cover the key points naturally — don't just list them
- Reference specific data points, statistics, and sources when available
- If there are contradictions or challenges, discuss both sides
- Keep it conversational and engaging — use reactions, follow-ups, "that's interesting"
- End with a brief summary of takeaways
- Output ONLY the dialogue script, no stage directions or metadata
- Keep total script under 3000 characters (API limit)

CRITICAL LANGUAGE RULE: Detect the language that the TITLE TEXT ITSELF is written in — ignore the language of any data or snippets below. The podcast dialogue MUST be in the same language as the title. If the title is written in English, the ENTIRE dialogue must be in English. If the title is written in Chinese characters, speak Chinese. If in Japanese, speak Japanese. Default to English when uncertain. Always keep "Host A:" and "Host B:" tags in English.`;

export async function generatePodcastScript(
  content: PodcastContent,
  model: string,
  providerKeys: Record<string, string>,
): Promise<string> {
  const pointsSummary = content.keyPoints.slice(0, 6)
    .map((p, i) => `${i + 1}. ${p}`).join("\n");

  const contradictionsSummary = (content.contradictions ?? []).slice(0, 3)
    .map((c) => `- ${c}`).join("\n");

  const nonLatinRatio = (content.title.match(/[^\u0000-\u007F]/g) ?? []).length / Math.max(content.title.length, 1);
  const topicLang = nonLatinRatio > 0.3 ? "the same language the title is written in" : "English";

  // Personalize the podcast — connect to the listener's interests and active focus areas
  let userContext = "";
  try {
    const { buildUserContext } = await import("./team-leader.js");
    const ctx = await buildUserContext({ profileChars: 400, themeChars: 600, includeApps: false });
    if (ctx) userContext = `\n\n## About the Listener\nWhen relevant, the hosts can naturally connect topics to the listener's known interests, projects, and focus areas. Don't force it — only when the connection is genuine and adds value.\n\n${ctx}\n`;
  } catch { /* non-critical */ }

  const prompt = `${PODCAST_SCRIPT_PROMPT}
${userContext}
LANGUAGE FOR THIS PODCAST: ${topicLang}

Title: ${content.title}
Summary: ${content.summary}
Key Points:
${pointsSummary}
${contradictionsSummary ? `\nContradictions/Challenges:\n${contradictionsSummary}` : ""}
${content.narrative ? `\nDetailed Narrative (condensed):\n${content.narrative.slice(0, 1500)}` : ""}`;

  const script = await llm({
    prompt,
    model,
    providerKeys,
    timeoutMs: LLM_FAST_TIMEOUT_MS,
  });
  return script?.trim() ?? "";
}

// ── Audio Rendering (Gemini TTS only) ──

export async function renderPodcastAudio(script: string, geminiKey: string): Promise<Buffer> {
  const endpoint = `${GEMINI_API_BASE}/models/gemini-2.5-flash-preview-tts:generateContent`;

  const body = {
    contents: [{ parts: [{ text: `TTS the following conversation between Host A and Host B:\n\n${script}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            { speaker: "Host A", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
            { speaker: "Host B", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } },
          ],
        },
      },
    },
  };

  // Retry up to 3 times on transient network errors
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${endpoint}?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown");
        const status = res.status;
        // Retry on 429 (rate limit) and 5xx (server errors)
        if ((status === 429 || status >= 500) && attempt < maxAttempts) {
          lastError = new Error(`Gemini TTS API error ${status}: ${errText}`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
        throw new Error(`Gemini TTS API error ${status}: ${errText}`);
      }

      const json = await res.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
      };
      const b64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!b64) throw new Error("No audio data in Gemini TTS response");

      return Buffer.from(b64, "base64");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      const isRetryable = msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("429") || msg.includes("500") || msg.includes("502") || msg.includes("503");
      if (isRetryable && attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("TTS rendering failed after retries");
}

// ── WAV Encoding ──

export function pcmToWav(pcm: Buffer): Buffer {
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const headerSize = 44;
  const wav = Buffer.alloc(headerSize + dataSize);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(numChannels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);
  pcm.copy(wav, headerSize);

  return wav;
}

// ── WAV → MP3 Conversion ──

let _ffmpegPath: string | null | undefined;

async function getFfmpegPath(): Promise<string | null> {
  if (_ffmpegPath !== undefined) return _ffmpegPath;
  try {
    const mod = await import("ffmpeg-static");
    _ffmpegPath = (mod.default ?? mod) as string;
  } catch {
    _ffmpegPath = null;
  }
  return _ffmpegPath;
}

/**
 * Convert a WAV file to MP3. Returns the MP3 path on success, null on failure.
 * Uses ffmpeg-static for reliable cross-platform support.
 * Speech-optimized: 64kbps mono — shrinks 130 MB WAV to ~10 MB MP3.
 */
export async function wavToMp3(wavPath: string): Promise<string | null> {
  const ffmpeg = await getFfmpegPath();
  if (!ffmpeg) {
    logAction({ ts: Date.now(), type: "action", category: "podcast", message: "ffmpeg-static not available, skipping MP3 conversion" });
    return null;
  }

  const { existsSync } = await import("node:fs");
  if (!existsSync(wavPath)) return null;

  const mp3Path = wavPath.replace(/\.wav$/i, ".mp3");
  if (existsSync(mp3Path)) return mp3Path;

  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync(ffmpeg, [
      "-y", "-i", wavPath,
      "-codec:a", "libmp3lame", "-b:a", "64k",
      "-ar", "22050", "-ac", "1",
      mp3Path,
    ], { timeout: 120_000, windowsHide: true, stdio: "ignore" });
    // Delete the WAV source — MP3 is the only format we need for speech
    const { unlinkSync } = await import("node:fs");
    try { unlinkSync(wavPath); } catch { /* non-critical */ }
    logAction({ ts: Date.now(), type: "action", category: "podcast", message: `Converted WAV→MP3: ${mp3Path} (WAV deleted)` });
    return mp3Path;
  } catch (err) {
    logError("podcast", `WAV→MP3 conversion failed for ${wavPath}`, err);
    return null;
  }
}

// ── Full Pipeline ──

export async function generatePodcastAudio(params: {
  content: PodcastContent;
  audioSlug: string;
  subdirectory: string;
  model: string;
  providerKeys: Record<string, string>;
  onProgress?: (status: "writing_script" | "rendering_audio") => void;
}): Promise<{ audioUrl: string; script: string }> {
  const { content, audioSlug, subdirectory, model, providerKeys, onProgress } = params;

  const geminiKey = await getGeminiApiKey();
  if (!geminiKey) {
    throw new Error("Gemini API key required for podcast audio generation (TTS). Summarization works with any provider, but audio rendering requires a Gemini key.");
  }

  onProgress?.("writing_script");
  logAction({ ts: Date.now(), type: "action", category: "podcast", message: `generating script for "${content.title}"` });

  const script = await generatePodcastScript(content, model, providerKeys);
  if (!script) throw new Error("Failed to generate podcast script");

  onProgress?.("rendering_audio");
  logAction({ ts: Date.now(), type: "action", category: "podcast", message: `rendering audio for "${content.title}"` });

  const pcmData = await renderPodcastAudio(script, geminiKey);
  const wavData = pcmToWav(pcmData);

  const { join } = await import("node:path");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { homedir } = await import("node:os");

  const audioDir = join(homedir(), ".enso", "data", subdirectory, "audio");
  mkdirSync(audioDir, { recursive: true });

  const wavFilename = `${audioSlug}.wav`;
  const wavFilePath = join(audioDir, wavFilename);
  writeFileSync(wavFilePath, wavData);

  // Convert to MP3 for mobile compatibility (WAV files are 100-150 MB, MP3 ~10 MB)
  const mp3Path = await wavToMp3(wavFilePath);

  const { toMediaUrl } = await import("./server.js");
  const audioUrl = toMediaUrl(mp3Path ?? wavFilePath);

  logAction({ ts: Date.now(), type: "action", category: "podcast", message: `podcast ready for "${content.title}" (${wavData.length} bytes WAV${mp3Path ? ", MP3 converted" : ""})` });

  return { audioUrl, script };
}
