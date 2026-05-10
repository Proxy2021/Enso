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
- Use exactly "Joe:" (male host) and "Jane:" (female host) as speaker tags (one per line, alternating)
- Joe drives the conversation, introduces the topic, asks questions
- Jane provides insights, adds detail, plays devil's advocate
- Cover the key points naturally — don't just list them
- Reference specific data points, statistics, and sources when available
- If there are contradictions or challenges, discuss both sides
- Keep it conversational and engaging — use reactions, follow-ups, "that's interesting"
- End with a brief summary of takeaways
- Output ONLY the dialogue script, no stage directions or metadata
- Keep total script under 3000 characters (API limit)

CRITICAL LANGUAGE RULE: Detect the language that the TITLE TEXT ITSELF is written in — ignore the language of any data or snippets below. The podcast dialogue MUST be in the same language as the title. If the title is written in English, the ENTIRE dialogue must be in English. If the title is written in Chinese characters, speak Chinese. If in Japanese, speak Japanese. Default to English when uncertain. Always keep "Joe:" and "Jane:" tags in English — these are speaker identifiers for the TTS engine, NEVER translate them or use Chinese/Japanese names in their place.`;

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

/** Output of a single TTS call — PCM bytes plus the sample rate the model declared. */
export interface TTSSegment {
  pcm: Buffer;
  sampleRate: number;
}

/**
 * Render a single TTS segment. Returns the raw PCM plus the sample rate
 * declared in the response's mimeType (defaults to 24000 Hz).
 *
 * Prompts kept under ~2000 chars — the preview TTS model's audio quality
 * degrades noticeably within a single response past roughly 3-4 min of
 * generated audio (voice gets deeper/distorted as the decoder drifts).
 * Segments are sized to keep each response in the model's clean range.
 */
export async function renderPodcastAudio(script: string, geminiKey: string): Promise<Buffer> {
  const seg = await renderPodcastSegment(script, geminiKey);
  return seg.pcm;
}

/**
 * Group a two-speaker script into consecutive-speaker turns.
 * Input:  "Joe: line1\nJane: line2\nJoe: line3a\nJoe: line3b"
 * Output: [{speaker:"Joe",text:"line1"},{speaker:"Jane",text:"line2"},{speaker:"Joe",text:"line3a line3b"}]
 *
 * Lines that don't match a Joe/Jane tag are appended to the current turn
 * (handles multi-line speaker turns). Lines before the first tag are dropped.
 */
export function parseSpeakerTurns(script: string): Array<{ speaker: "Joe" | "Jane"; text: string }> {
  const lines = script.split("\n").map((l) => l.trim()).filter(Boolean);
  const turns: Array<{ speaker: "Joe" | "Jane"; text: string }> = [];
  let curSpeaker: "Joe" | "Jane" | null = null;
  let curBody: string[] = [];
  const flush = () => {
    if (curSpeaker && curBody.length) {
      const text = curBody.join(" ").trim();
      if (text) turns.push({ speaker: curSpeaker, text });
    }
    curBody = [];
  };
  for (const line of lines) {
    const m = line.match(/^(Joe|Jane)\s*:\s*(.*)$/);
    if (m) {
      const nextSpeaker = m[1] as "Joe" | "Jane";
      if (curSpeaker === nextSpeaker) {
        // Same speaker as previous line — keep accumulating
        if (m[2]) curBody.push(m[2]);
      } else {
        flush();
        curSpeaker = nextSpeaker;
        curBody = m[2] ? [m[2]] : [];
      }
    } else if (curSpeaker) {
      curBody.push(line);
    }
  }
  flush();
  return turns;
}

const VOICE_FOR_SPEAKER: Record<"Joe" | "Jane", string> = {
  Joe: "Enceladus",  // male, breathy
  Jane: "Zephyr",    // female, bright
};

/**
 * Render a script as audio, using one SINGLE-SPEAKER TTS call per speaker turn.
 *
 * Gemini's multi-speaker mode (`multiSpeakerVoiceConfig`) has a documented bug
 * where voices get swapped or blended unpredictably across calls — even with
 * identical configs. The dominant workaround in Google's own developer forums
 * is to split dialogues into single-speaker calls and stitch the PCM buffers
 * together. This guarantees each turn is rendered by exactly the voice we
 * asked for.
 *
 * Per-turn PCMs are concatenated; the outer pipeline handles loudnorm and
 * silence padding at the segment level.
 *
 * Tracked issues:
 *   https://discuss.ai.google.dev/t/gemini-tts-multi-speaker-mode-7-critical-bugs-after-3-weeks-in-production-finishreason-other-truncation-voice-swapping-hallucinated-lines/132776
 *   https://discuss.ai.google.dev/t/2-5-flash-tts-multispeaker-no-wrong-voice-switch/112023
 */
export async function renderPodcastSegment(script: string, geminiKey: string): Promise<TTSSegment> {
  const turns = parseSpeakerTurns(script);
  if (turns.length === 0) {
    // No Joe/Jane tags found — fall back to rendering the whole thing as Joe.
    const fallback = await renderSingleSpeakerTTS(script, VOICE_FOR_SPEAKER.Joe, geminiKey);
    return fallback;
  }

  const turnResults: TTSSegment[] = [];
  for (const turn of turns) {
    const result = await renderSingleSpeakerTTS(turn.text, VOICE_FOR_SPEAKER[turn.speaker], geminiKey);
    turnResults.push(result);
  }
  const pcm = Buffer.concat(turnResults.map((r) => r.pcm));
  const sampleRate = turnResults[0]?.sampleRate ?? 24000;
  return { pcm, sampleRate };
}

/**
 * One single-speaker Gemini TTS call. Used as the building block for
 * renderPodcastSegment (per-turn) and any other single-voice text.
 */
export async function renderSingleSpeakerTTS(
  text: string,
  voiceName: string,
  geminiKey: string,
): Promise<TTSSegment> {
  const endpoint = `${GEMINI_API_BASE}/models/gemini-3.1-flash-tts-preview:generateContent`;
  const body = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    },
  };

  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${endpoint}?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown");
        const status = res.status;
        if ((status === 429 || status === 499 || status >= 500) && attempt < maxAttempts) {
          lastError = new Error(`Gemini TTS API error ${status}: ${errText}`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
        throw new Error(`Gemini TTS API error ${status}: ${errText}`);
      }

      const json = await res.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
      };
      const inline = json.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const b64 = inline?.data;
      if (!b64) {
        if (attempt < maxAttempts) {
          lastError = new Error("No audio data in Gemini TTS response");
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }
        throw new Error("No audio data in Gemini TTS response");
      }

      const mime = inline?.mimeType ?? "";
      const rateMatch = mime.match(/rate=(\d+)/i);
      const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
      if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
        logError("podcast", `Unexpected TTS sample rate from mimeType "${mime}" — falling back to 24000`, null);
      }

      return {
        pcm: Buffer.from(b64, "base64"),
        sampleRate: Number.isFinite(sampleRate) && sampleRate >= 8000 && sampleRate <= 96000 ? sampleRate : 24000,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      const isRetryable = msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("terminated") || msg.includes("socket hang up") || msg.includes("AbortError") || msg.includes("TimeoutError") || msg.includes("429") || msg.includes("499") || msg.includes("500") || msg.includes("502") || msg.includes("503");
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

export function pcmToWav(pcm: Buffer, sampleRate: number = 24000): Buffer {
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
 * Loudness-normalize a raw PCM segment and append a short silence tail.
 *
 * Gemini TTS responses exhibit per-call pitch/loudness drift. Concatenating
 * raw PCM preserves that drift across a long podcast (voice gets "deeper and
 * crackier" over time). Running each segment through ffmpeg loudnorm (EBU R128,
 * -16 LUFS) flattens the per-segment energy to a stable target, and apad
 * inserts a small silence gap so joins don't click.
 *
 * Falls back to the original PCM if ffmpeg is unavailable.
 */
export async function normalizeAndPadPcm(
  pcm: Buffer,
  sampleRate: number,
  padMs: number = 150,
): Promise<Buffer> {
  const ffmpeg = await getFfmpegPath();
  if (!ffmpeg || pcm.length === 0) return pcm;

  const { spawn } = await import("node:child_process");
  const padSec = (padMs / 1000).toFixed(3);

  return new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    let errBuf = "";
    const proc = spawn(ffmpeg, [
      "-hide_banner", "-loglevel", "error",
      "-f", "s16le", "-ar", String(sampleRate), "-ac", "1", "-i", "pipe:0",
      "-af", `loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=${padSec}`,
      "-f", "s16le", "-ar", String(sampleRate), "-ac", "1", "pipe:1",
    ], { windowsHide: true });

    proc.stdout.on("data", (c: Buffer) => chunks.push(c));
    proc.stderr.on("data", (c: Buffer) => { errBuf += c.toString(); });
    proc.on("error", (err) => {
      logError("podcast", "ffmpeg spawn failed during PCM normalization", err);
      resolve(pcm);
    });
    proc.on("close", (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        logError("podcast", `ffmpeg normalization exited ${code}: ${errBuf.slice(0, 200)}`, null);
        resolve(pcm);
      }
    });
    proc.stdin.on("error", () => { /* proc may close before we finish writing */ });
    proc.stdin.end(pcm);
  });
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

  const seg = await renderPodcastSegment(script, geminiKey);
  const wavData = pcmToWav(seg.pcm, seg.sampleRate);

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
