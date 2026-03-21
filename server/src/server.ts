import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { existsSync, statSync, createReadStream, createWriteStream, readFileSync, readdirSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from "fs";
import { extname, dirname, basename, join } from "path";
import { fileURLToPath } from "url";
import { tmpdir, homedir, hostname, platform, arch, totalmem } from "os";
import { spawn } from "child_process";
import type { EnsoRuntime } from "./local-types.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { CoreConfig, ClientMessage, ServerMessage } from "./types.js";
import { handleInbound } from "./agent-adapter.js";
import { handleCardEnhance, handlePluginCardAction, createScopedShareContext, getCardState } from "./outbound.js";
import { runClaudeCode, cancelClaudeCodeRun } from "./claude-code.js";
import { getDomainEvolutionJob, getDomainEvolutionJobs } from "./domain-evolution.js";
import { transcribeAudio } from "./transcribe.js";
import { APP_CATALOG } from "./app-catalog.js";
import { logAction, logError, logFix, getUnacknowledgedFixes, acknowledgeFixes, getRecentLog, onFixLogged } from "./action-log.js";
import type { FixEntry } from "./action-log.js";
import { classifyTask, qualityGate } from "./task-router.js";
import { persistCard, loadCardHistory, clearCardHistory, pruneStaleJournals, migrateCardJournals, readEnsoMemory, writeEnsoUser, writeEnsoMemory, getMemoryContext } from "./memory-bridge.js";
import type { CardRecord } from "./memory-bridge.js";

export type ConnectedClient = {
  id: string;
  sessionKey: string;
  ws: WebSocket;
  send: (msg: ServerMessage) => void;
  /** Messages buffered while the WebSocket was disconnected (mobile background). */
  _disconnectedBuffer: ServerMessage[];
  /** User-selected Claude model for Claude Code sessions. */
  claudeModel?: string;
  /** User-selected thinking mode. */
  claudeThinking?: "adaptive" | "disabled";
};

/** All connected browser clients, keyed by connection id. */
const clients = new Map<string, ConnectedClient>();

/** Live runtime account — mutated by settings.set_mode, visible to all handlers. */
let activeAccount: ResolvedEnsoAccount | null = null;

/** Current server port for constructing media URLs. */
let activePort = 3001;

/** Maximum file size for served media (300 MB). */
export const MAX_MEDIA_FILE_SIZE = 300 * 1024 * 1024; // 300 MB for non-streamable files

/** Extensions that support HTTP Range streaming — exempt from the size limit. */
const STREAMABLE_EXTS = new Set([
  ".mp4", ".webm", ".avi", ".mov", ".mkv", ".m4v", ".ts", ".mts",
  ".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma",
]);

/**
 * Detect MIME type from file magic bytes (header signatures).
 * Returns the MIME string or undefined if not recognized.
 */
function detectMimeFromMagicBytes(buffer: Buffer): string | undefined {
  if (buffer.length < 4) return undefined;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return "image/jpeg";
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return "image/png";
  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return "image/gif";
  // WebP: RIFF....WEBP
  if (buffer.length >= 12 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
    && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return "image/webp";
  // BMP: 42 4D
  if (buffer[0] === 0x42 && buffer[1] === 0x4D) return "image/bmp";
  // PDF: 25 50 44 46
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return "application/pdf";
  return undefined;
}

/**
 * Detect MIME type from a file path by extension.
 */
function mimeFromExtension(filePath: string): string | undefined {
  const ext = extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
    ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm",
    ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav",
    ".ogg": "audio/ogg", ".pdf": "application/pdf",
  };
  return map[ext];
}

/**
 * Convert a local file path to an HTTP URL served by the Enso media endpoint.
 * Appends `?ext=` with the original file extension so the frontend can detect
 * media type even though the URL path itself is base64url-encoded.
 * Returns the original string if it's already an HTTP(S) URL.
 */
export function toMediaUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  const encoded = Buffer.from(pathOrUrl, "utf-8").toString("base64url");
  const ext = extname(pathOrUrl).toLowerCase();
  return `/media/${encoded}${ext ? `?ext=${ext}` : ""}`;
}

export function getActiveAccount(): ResolvedEnsoAccount | null {
  return activeAccount;
}

export function getConnectedClient(id: string): ConnectedClient | undefined {
  return clients.get(id);
}

export function getClientsBySession(sessionKey: string): ConnectedClient[] {
  return Array.from(clients.values()).filter((c) => c.sessionKey === sessionKey);
}

export function getClientsByPeerId(peerId: string): ConnectedClient[] {
  return Array.from(clients.values()).filter(
    (c) => c.id === peerId || `user_${c.id}` === peerId,
  );
}

export function getAllClients(): ConnectedClient[] {
  return Array.from(clients.values());
}

export function broadcastToSession(sessionKey: string, msg: ServerMessage): void {
  for (const client of getClientsBySession(sessionKey)) {
    client.send(msg);
  }
}

/**
 * Scan for git-based projects in common directories.
 */
function scanProjects(): Array<{ name: string; path: string }> {
  const projects: Array<{ name: string; path: string }> = [];
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const searchDirs = [
    join(home, "Desktop", "Github"),
    join(home, "Github"),
    join(home, "Projects"),
    join(home, "Desktop", "Projects"),
    join(home, "repos"),
    join(home, "src"),
    "D:\\Github",
    "C:\\Github",
  ];

  for (const dir of searchDirs) {
    try {
      if (!existsSync(dir)) continue;
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const projectPath = join(dir, entry.name);
        if (existsSync(join(projectPath, ".git"))) {
          projects.push({ name: entry.name, path: projectPath });
        }
      }
    } catch {
      // Directory not readable
    }
  }

  return projects;
}

/**
 * Route a topic to the research pipeline — creates researcher card and triggers search.
 * Used by both the task-router research path and image-research intent.
 */
async function routeToResearch(params: {
  topic: string;
  depth: "quick" | "standard";
  originalText: string;
  sessionKey: string;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
  config: CoreConfig;
  runtime: EnsoRuntime;
  connectionId: string;
}): Promise<void> {
  const { topic, depth, originalText, sessionKey, client, account, config, runtime, connectionId } = params;
  const send = (m: ServerMessage) => client.send(m);

  const { setLastUserMessage } = await import("./researcher-tools.js");
  setLastUserMessage(originalText);

  const { executeToolDirect, getToolTemplateCode, getToolTemplate } = await import("./native-tools/registry.js");
  const { getApp } = await import("./app-catalog.js");
  const { registerCardContext } = await import("./outbound.js");

  const cap = getApp("researcher");
  if (!cap) throw new Error("Researcher app not found in catalog");

  const welcomeResult = await executeToolDirect(cap.primaryTool, {});
  const template = getToolTemplate(cap.appId, cap.signatureId);
  const generatedUI = template ? getToolTemplateCode(template) : undefined;

  const cardId = randomUUID();
  const handlerPrefix = cap.primaryTool.replace(/_search$/, "_");

  registerCardContext(cardId, {
    cardId,
    originalPrompt: originalText,
    originalResponse: "",
    currentData: structuredClone(welcomeResult.success ? welcomeResult.data : {}),
    geminiApiKey: account.geminiApiKey,
    account,
    mode: "full",
    actionHistory: [],
    appToolHint: {
      toolName: cap.primaryTool,
      params: {},
      handlerPrefix,
    },
    interactionMode: "tool",
    toolFamily: cap.appId,
    signatureId: cap.signatureId,
    coverageStatus: "covered",
  });

  send({
    id: cardId,
    runId: randomUUID(),
    sessionKey,
    seq: 0,
    state: "final",
    data: welcomeResult.success ? welcomeResult.data : {},
    generatedUI,
    cardMode: {
      interactionMode: "tool",
      toolFamily: cap.appId,
      signatureId: cap.signatureId,
      coverageStatus: "covered",
    },
    targetCardId: undefined,
    timestamp: Date.now(),
  });

  handlePluginCardAction({
    cardId,
    action: "search",
    payload: { topic, depth },
    mode: "full",
    client,
    config,
    runtime,
  }).catch((err) => {
    logError("task-router", "Research action failed", err, { topic });
  });
}

/**
 * Analyze an image with Gemini Vision and extract a research topic.
 */
async function analyzeImageForResearch(params: {
  imagePath: string;
  userText: string;
  apiKey: string;
}): Promise<{ topic: string; depth: "quick" | "standard" }> {
  const { callGeminiVision } = await import("./ui-generator.js");

  const prompt = `Analyze this image and identify what it shows. Then produce a specific research topic about it.

${params.userText ? `The user added this context: "${params.userText}"` : "No additional context was provided — infer the best research topic from the image content."}

Reply with ONLY the research topic as a single line of plain text (no JSON, no markdown, no quotes). Examples:
- Nike Air Force 1 x Carhartt WIP collaboration sneaker design and features
- Gothic cathedral architecture and structural innovations
- Japanese ramen varieties and regional cooking styles`;

  const raw = await callGeminiVision({
    imagePath: params.imagePath,
    prompt,
    apiKey: params.apiKey,
    maxOutputTokens: 256,
  });

  // Extract a clean single-line topic from the response
  const lines = raw.trim().split("\n").map(l => l.trim()).filter(Boolean);
  // Take the first substantive line (skip any "Topic:" or "Research topic:" prefixes)
  let topic = lines[0] || "Analyze this image";
  topic = topic.replace(/^(research\s*topic|topic)\s*[:：]\s*/i, "").replace(/^["']|["']$/g, "");

  // If user provided text, combine with vision analysis
  if (params.userText) {
    topic = `${topic} — ${params.userText}`;
  }

  return { topic, depth: "standard" };
}

// ── App Intent Matcher (E1: Chat-to-App Routing Fix) ──
// Pre-classification check: does the user's message match a registered app?

const APP_INTENT_PATTERNS: Array<{
  pattern: RegExp;
  toolFamily: string;
  confidence: number;
}> = [
  // Media Gallery — browsing, viewing, organizing photos
  { pattern: /\b(media\s+gallery|photo\s+gallery|browse\s+(my\s+)?photo|view\s+(my\s+)?photo|show\s+(me\s+)?(my\s+)?(favorite\s+|recent\s+)?photo|organize\s+photo|photo\s+collections?\b|my\s+gallery|open\s+(the\s+)?gallery)\b/i, toolFamily: "media_gallery", confidence: 0.9 },
  { pattern: /\b(rate\s+(my\s+|this\s+)?photo|favorite\s+(my\s+)?photo|search\s+(my\s+)?photo|photo\s+search|find\s+(my\s+)?photo|my\s+photos|my\s+pictures|browse\s+photos|browse\s+pictures)\b/i, toolFamily: "media_gallery", confidence: 0.85 },
  { pattern: /\b(show\s+(me\s+)?(my\s+)?collections|list\s+collections|open\s+gallery|view\s+gallery|show\s+gallery|browse\s+(my\s+)?gallery|browse\s+(the\s+)?pictures)\b/i, toolFamily: "media_gallery", confidence: 0.85 },

  // Photo Studio — editing, styling, processing photos
  { pattern: /\b(photo\s+studio|style\s+gallery|apply\s+(a\s+)?style|photo\s+processing|film\s+stock|cinematic\s+style|artistic\s+style|photo\s+style|open\s+(the\s+)?studio)\b/i, toolFamily: "photo_studio", confidence: 0.9 },
  { pattern: /\b(batch\s+process|style\s+preview|portra\s+400|wong\s+kar[- ]?wai|blade\s+runner|nordic\s+noir|photo\s*book|create\s+(a\s+)?photo\s*book)\b/i, toolFamily: "photo_studio", confidence: 0.85 },
  { pattern: /\b(adjust\s+(a\s+|my\s+|this\s+)?photo|photo\s+adjust|increase\s+contrast|add\s+grain|edit\s+(my\s+|a\s+|this\s+)?photo|analyze\s+(this\s+|my\s+|a\s+)?photo|compare\s+(photo\s+)?versions|show\s+(me\s+)?(all\s+)?styles|list\s+styles|artistic\s+styles)\b/i, toolFamily: "photo_studio", confidence: 0.85 },
];

function matchAppIntent(message: string): { appId: string; toolFamily: string; confidence: number } | null {
  // Skip messages that are clearly about programming/research, not app usage
  if (/\b(research|build|implement|code|script|deploy|write\s+a|help\s+me\s+write)\b/i.test(message) &&
      !/\b(photo\s+studio|media\s+gallery|open|browse|show\s+me|launch)\b/i.test(message)) {
    return null;
  }

  for (const { pattern, toolFamily, confidence } of APP_INTENT_PATTERNS) {
    if (pattern.test(message)) {
      return { appId: toolFamily, toolFamily, confidence };
    }
  }
  return null;
}

function inferAppParams(message: string, primaryTool: any): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  // Extract path hints from message
  const pathMatch = message.match(/\b(~\/\S+|[A-Z]:\\[^\s,]+|\/[a-z][^\s,]+)\b/i);
  if (pathMatch && primaryTool.parameters?.properties?.path) {
    params.path = pathMatch[1];
  }

  // Extract style hints
  const styleMatch = message.match(/\b(portra\s*400|ektar|tri-?x|wong\s+kar[- ]?wai|blade\s+runner|nordic\s+noir|moriyama|fan\s+ho|moody\s+natural|soft\s+film)\b/i);
  if (styleMatch && primaryTool.parameters?.properties?.style) {
    params.style = styleMatch[1].toLowerCase().replace(/[\s-]+/g, "_");
  }

  return params;
}

export async function startEnsoServer(opts: {
  account: ResolvedEnsoAccount;
  config: CoreConfig;
  runtime: EnsoRuntime;
  abortSignal?: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<{ stop: () => void }> {
  const { account, config, runtime, statusSink } = opts;
  const port = account.port;
  activePort = port;
  activeAccount = account;

  // Re-hydrate saved apps from disk before setting up routes
  try {
    const { loadAndRegisterApps } = await import("./app-persistence.js");
    const appCount = loadAndRegisterApps();
    if (appCount > 0) {
      console.log(`[enso] re-hydrated ${appCount} saved app(s) from disk`);
    }
  } catch (err) {
    logError("system", "app re-hydration failed (non-fatal)", err);
  }

  // Conditionally load shell PTY support (requires node-pty native module)
  let shellPty: typeof import("./shell-pty.js") | null = null;
  try {
    shellPty = await import("./shell-pty.js");
    console.log(`[enso] shell PTY support available`);
  } catch {
    console.log(`[enso] node-pty not available — shell feature disabled`);
  }

  const app = express();
  // Skip JSON body parsing for routes that use express.raw() — otherwise
  // express.json()'s 100KB default limit rejects large base64 image uploads
  // from Capacitor native, and pre-parsing prevents express.raw() from
  // reading the body as a Buffer.
  const jsonParser = express.json();
  app.use((req, res, next) => {
    if (req.path === "/upload" || req.path === "/transcribe") return next();
    jsonParser(req, res, next);
  });

  // ── CORS — allow cross-origin requests (auth via token, not cookies) ──
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (_req.method === "OPTIONS") { res.status(204).end(); return; }
    next();
  });

  // ── Shared paths ──
  const pluginDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = join(pluginDir, "..", "..");

  const apkPath = join(projectRoot, "android", "app", "build", "outputs", "apk", "release", "app-release.apk");
  const apkMetadataPath = join(projectRoot, "android", "app", "build", "outputs", "apk", "release", "output-metadata.json");

  /**
   * Read version info — prefer APK build metadata so we report the actual built
   * version, not package.json.  Never cache: a transient read failure (file
   * locked, not yet flushed) must not permanently pin us to the wrong version.
   * Returns `metadataVerified: true` when the version came from the Gradle
   * output-metadata.json (i.e. it definitely matches the APK on disk).
   */
  function readPkgVersion(): { version: string; versionCode: number; metadataVerified: boolean } {
    // First try the Gradle output metadata which reflects the actual APK on disk
    try {
      const meta = JSON.parse(readFileSync(apkMetadataPath, "utf-8"));
      const element = meta.elements?.[0];
      if (element?.versionCode && element?.versionName) {
        return { version: element.versionName, versionCode: element.versionCode, metadataVerified: true };
      }
    } catch { /* fall through to package.json */ }
    // Fallback to package.json — may not match the APK on disk if version was
    // bumped without rebuilding, so we flag metadataVerified=false.
    try {
      const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf-8"));
      return { version: pkg.version ?? "0.1.0", versionCode: pkg.versionCode ?? 1, metadataVerified: false };
    } catch {
      return { version: "0.1.0", versionCode: 1, metadataVerified: false };
    }
  }

  // ── Health endpoint (unauthenticated — used for connection testing) ──
  const accessToken = account.accessToken;
  app.get("/health", (_req, res) => {
    const pkg = readPkgVersion();
    res.json({
      status: "ok",
      channel: "enso",
      authRequired: !!accessToken,
      version: pkg.versionCode,
      versionName: pkg.version,
      versionCode: pkg.versionCode,
      clients: clients.size,
      timestamp: Date.now(),
      machine: {
        name: account.machineName ?? hostname(),
        hostname: hostname(),
        platform: platform(),
        arch: arch(),
        memoryGB: Math.round(totalmem() / (1024 ** 3)),
      },
    });
  });

  // ── App version endpoint (unauthenticated — for Android upgrade checks) ──
  app.get("/api/version", (_req, res) => {
    const pkg = readPkgVersion();
    const apkExists = existsSync(apkPath);
    // Only offer the APK for upgrade when we can verify the version from build
    // metadata.  If we fell back to package.json the reported version may be
    // ahead of the actual APK on disk, which causes an infinite upgrade loop.
    const apkAvailable = apkExists && pkg.metadataVerified;
    res.json({
      versionCode: pkg.versionCode,
      versionName: pkg.version,
      apkAvailable,
      apkSizeBytes: apkExists ? statSync(apkPath).size : 0,
    });
  });

  // ── Serve built frontend (unauthenticated — for remote access via tunnel) ──
  const distDir = join(projectRoot, "dist");
  if (existsSync(distDir) && existsSync(join(distDir, "index.html"))) {
    app.use(express.static(distDir));
    runtime.log?.(`[enso] serving frontend from ${distDir}`);
  }

  // ── APK download endpoint (unauthenticated — so users can install the app) ──
  app.get("/api/apk", (_req, res) => {
    if (!existsSync(apkPath)) {
      res.status(404).json({ error: "APK not found. Run: npm run android:build-apk" });
      return;
    }
    const stat = statSync(apkPath);
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", 'attachment; filename="enso.apk"');
    createReadStream(apkPath).pipe(res);
  });

  // ── Demo assets (public — shipped showcase images for Photo Studio) ──
  const demoDir = join(pluginDir, "..", "apps", "photo_studio", "demo");
  if (existsSync(demoDir)) {
    app.use("/demo", express.static(demoDir, { maxAge: "7d" }));
  }

  // ── Media serving (before auth — URLs use non-guessable base64url paths) ──
  app.get("/media/:encodedPath", (req, res) => {
    let filePath = Buffer.from(req.params.encodedPath, "base64url").toString("utf-8");

    // If file doesn't exist, try fuzzy matching (handles corrupted unicode filenames)
    if (!existsSync(filePath)) {
      filePath = fuzzyResolveFile(filePath) ?? filePath;
    }

    if (!existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const ext = extname(filePath).toLowerCase();

    // ── On-demand video transcoding (MPEG-4 Part 2 → H.264) ──
    if (req.query.transcode === "1" && STREAMABLE_EXTS.has(ext)) {
      const TRANSCODE_DIR = join(homedir(), ".enso", "apps", "multimedia", "transcode");
      mkdirSync(TRANSCODE_DIR, { recursive: true });
      const cacheKey = Buffer.from(filePath, "utf-8").toString("base64url");
      const cachePath = join(TRANSCODE_DIR, cacheKey + ".mp4");

      // Serve cached transcoded file with Range support
      if (existsSync(cachePath)) {
        const cachedSize = statSync(cachePath).size;
        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.setHeader("Accept-Ranges", "bytes");
        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : cachedSize - 1;
          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${cachedSize}`,
            "Content-Length": end - start + 1,
          });
          createReadStream(cachePath, { start, end }).pipe(res);
        } else {
          res.setHeader("Content-Length", cachedSize);
          createReadStream(cachePath).pipe(res);
        }
        return;
      }

      // Stream-transcode: pipe fragmented MP4 to client AND write to cache
      res.setHeader("Content-Type", "video/mp4");
      const tmpPath = cachePath + ".tmp";
      const ff = spawn("ffmpeg", [
        "-i", filePath,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "-f", "mp4", "pipe:1",
      ], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });

      let clientOpen = true;
      const cacheStream = createWriteStream(tmpPath);

      ff.stdout.on("data", (chunk: Buffer) => {
        cacheStream.write(chunk);
        if (clientOpen) {
          try { res.write(chunk); } catch { clientOpen = false; }
        }
      });

      ff.on("close", (code) => {
        cacheStream.end(() => {
          if (code === 0 && existsSync(tmpPath)) {
            try { renameSync(tmpPath, cachePath); } catch {}
          } else {
            try { unlinkSync(tmpPath); } catch {}
          }
        });
        if (clientOpen) res.end();
      });

      req.on("close", () => { clientOpen = false; });
      return;
    }

    // Enforce file size limit — skip for streamable video/audio (Range requests serve small chunks)
    if (!STREAMABLE_EXTS.has(ext)) {
      try {
        const stat = statSync(filePath);
        if (stat.size > MAX_MEDIA_FILE_SIZE) {
          res.status(413).json({ error: "File too large (max 300 MB)" });
          return;
        }
      } catch {
        res.status(500).json({ error: "Cannot read file" });
        return;
      }
    }

    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".bmp": "image/bmp",
      ".ico": "image/x-icon",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".avi": "video/x-msvideo",
      ".mov": "video/quicktime",
      ".ts": "video/mp2t",
      ".mts": "video/mp2t",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".flac": "audio/flac",
      ".m4a": "audio/mp4",
      ".aac": "audio/aac",
      // Documents
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".ppt": "application/vnd.ms-powerpoint",
      ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ".txt": "text/plain",
      ".csv": "text/csv",
      ".md": "text/plain",
      ".json": "application/json",
      ".xml": "application/xml",
      ".rtf": "application/rtf",
      ".zip": "application/zip",
    };
    const contentType = mimeTypes[ext] ?? "application/octet-stream";

    const fileSize = statSync(filePath).size;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Accept-Ranges", "bytes");

    // Trigger browser download for document types
    const isDownloadable = !contentType.startsWith("image/") &&
      !contentType.startsWith("video/") &&
      !contentType.startsWith("audio/") &&
      contentType !== "application/pdf";
    if (isDownloadable) {
      res.setHeader("Content-Disposition", `attachment; filename="${basename(filePath)}"`);
    }

    // Range request support — required for <video> and <audio> playback
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": chunkSize,
      });
      createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader("Content-Length", fileSize);
      createReadStream(filePath).pipe(res);
    }
  });

  // ── Token auth middleware — skip if no token configured (local-only mode) ──
  if (accessToken) {
    app.use((req, res, next) => {
      if (req.method === "OPTIONS") return next();
      // Browser navigation bypass — sec-fetch-mode:"navigate" is set by browsers for
      // top-level page loads (typing URL, clicking links, refresh).  These requests only
      // need the HTML shell served by the SPA fallback; actual data is fetched via
      // authenticated API calls afterward.  This header is a "forbidden header name" so
      // it cannot be forged by client-side JavaScript.
      if (req.headers["sec-fetch-mode"] === "navigate") return next();
      // Same-origin bypass (matches WebSocket auth behavior)
      // Note: browsers omit Origin header on same-origin GET requests, so also check Sec-Fetch-Site
      const origin = req.headers.origin ?? "";
      const isSameOrigin = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`
        || req.headers["sec-fetch-site"] === "same-origin";
      if (isSameOrigin) return next();
      const token = req.headers.authorization?.replace("Bearer ", "")
        || (req.query.token as string | undefined);
      if (token !== accessToken) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    });
    runtime.log?.(`[enso] access token required for remote connections`);
  }

  // ── Share token endpoint — returns access token for embedding in live exports ──
  app.get("/api/share-token", (_req, res) => {
    res.json({ token: accessToken || "" });
  });

  // ── Scoped share endpoint — creates a path-restricted card context for sharing ──
  app.post("/api/create-share", express.json(), (req, res) => {
    const { cardId, allowedRoot } = req.body as { cardId?: string; allowedRoot?: string };
    if (!cardId || !allowedRoot) {
      res.status(400).json({ error: "cardId and allowedRoot are required" });
      return;
    }
    const result = createScopedShareContext(cardId, allowedRoot);
    if (!result.ok) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json({
      shareCardId: result.shareCardId,
      token: accessToken || "",
      allowedRoot: result.normalizedRoot,
    });
  });

  // ── Card state endpoint — returns card data + template for share-link loading ──
  app.get("/api/card/:cardId/state", (req, res) => {
    const state = getCardState(req.params.cardId);
    if (!state) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    res.json(state);
  });


  // Inspect domain-evolution queue/state for newly discovered uncaptured domains.
  app.get("/domain-evolution/jobs", (_req, res) => {
    const jobs = getDomainEvolutionJobs();
    res.json({
      total: jobs.length,
      jobs,
    });
  });

  app.get("/domain-evolution/jobs/:id", (req, res) => {
    const job = getDomainEvolutionJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  });

  // List available slash commands for a project directory
  app.get("/api/claude-commands", (req, res) => {
    const cwd = req.query.cwd as string | undefined;
    if (!cwd) { res.json([]); return; }
    const cmdDir = join(cwd, ".claude", "commands");
    if (!existsSync(cmdDir)) { res.json([]); return; }
    try {
      const files = readdirSync(cmdDir).filter(f => f.endsWith(".md"));
      const commands = files.map(f => {
        const name = f.replace(/\.md$/, "");
        const content = readFileSync(join(cmdDir, f), "utf-8");
        const firstLine = content.split("\n").find(l => l.trim())?.trim() ?? "";
        return { name, description: firstLine };
      });
      res.json(commands);
    } catch { res.json([]); }
  });

  // ── Action Log API (for Claude Code review) ──
  app.get("/api/action-log", (req, res) => {
    const count = Math.min(Math.max(parseInt(req.query.count as string) || 100, 1), 500);
    const typeFilter = (req.query.type as string) || undefined;
    res.json(getRecentLog(count, typeFilter));
  });

  // ── Projects API ──
  app.get("/api/projects", async (_req, res) => {
    const { listProjects } = await import("./project-manager.js");
    res.json({ projects: listProjects() });
  });

  app.get("/api/projects/:id", async (req, res) => {
    const { loadProject } = await import("./project-manager.js");
    const project = loadProject(req.params.id);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.json(project);
  });

  app.post("/api/projects", express.json({ limit: "1mb" }), async (req, res) => {
    const { saveProject } = await import("./project-manager.js");
    try {
      const project = req.body;
      if (!project.id || !project.name) { res.status(400).json({ error: "id and name required" }); return; }
      project.createdAt = project.createdAt || Date.now();
      project.updatedAt = Date.now();
      saveProject(project);
      res.json({ ok: true, project });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/projects/:id", express.json({ limit: "1mb" }), async (req, res) => {
    const { loadProject, saveProject } = await import("./project-manager.js");
    const existing = loadProject(req.params.id);
    if (!existing) { res.status(404).json({ error: "Project not found" }); return; }
    const updated = { ...existing, ...req.body, id: req.params.id };
    saveProject(updated);
    res.json({ ok: true, project: updated });
  });

  app.delete("/api/projects/:id", async (req, res) => {
    const { deleteProject } = await import("./project-manager.js");
    if (req.params.id === "enso") { res.status(403).json({ error: "Cannot delete default Enso project" }); return; }
    const ok = deleteProject(req.params.id);
    res.json({ ok });
  });

  // ── Team Generation API ──

  app.post("/api/projects/generate-team", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const { projectId, projectName, description, vision, codebasePath, techStack, testUrl } = req.body;
      if (!projectId || !projectName || !codebasePath) {
        res.status(400).json({ error: "projectId, projectName, and codebasePath required" });
        return;
      }
      const geminiApiKey = account?.geminiApiKey;
      if (!geminiApiKey) { res.status(400).json({ error: "Gemini API key not configured" }); return; }

      const { generateTeamForProject } = await import("./team-generator.js");
      const result = await generateTeamForProject({
        projectId, projectName,
        description: description || "",
        vision, codebasePath, techStack, testUrl,
        geminiApiKey,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/create-with-team", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const { projectId, projectName, description, vision, codebasePath, techStack, testUrl, testCommand } = req.body;
      if (!projectId || !projectName || !codebasePath) {
        res.status(400).json({ error: "projectId, projectName, and codebasePath required" });
        return;
      }
      const geminiApiKey = account?.geminiApiKey;
      if (!geminiApiKey) { res.status(400).json({ error: "Gemini API key not configured" }); return; }

      const { generateTeamForProject } = await import("./team-generator.js");
      const { saveProject } = await import("./project-manager.js");

      const result = await generateTeamForProject({
        projectId, projectName,
        description: description || "",
        vision, codebasePath, techStack, testUrl,
        geminiApiKey,
      });

      const project = {
        id: projectId,
        name: projectName,
        description: description || result.detectedDescription,
        vision: vision || "",
        codebasePath,
        techStack: techStack || result.techStack,
        testUrl,
        testCommand,
        teamAgents: result.teamAgents,
        personas: result.personas,
        validationPersonaIds: result.validationPersonaIds,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveProject(project);
      res.json({ ok: true, project });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Evolution Sprint History API (project-scoped) ──
  app.get("/api/evolution-sprints", async (req, res) => {
    const { listEvolutionSprints } = await import("./evolution-archive.js");
    const projectId = (req.query.projectId as string) || "enso";
    res.json({ sprints: listEvolutionSprints(projectId) });
  });

  app.get("/api/evolution-sprints/:id", async (req, res) => {
    const { loadEvolutionSprint } = await import("./evolution-archive.js");
    const projectId = (req.query.projectId as string) || "enso";
    const sprint = loadEvolutionSprint(req.params.id, projectId);
    if (!sprint) { res.status(404).json({ error: "Sprint not found" }); return; }
    res.json(sprint);
  });

  app.get(/^\/api\/evolution-sprints\/([^/]+)\/file\/(.+)$/, async (req, res) => {
    const { getEvolutionFile } = await import("./evolution-archive.js");
    const projectId = (req.query.projectId as string) || "enso";
    const sprintId = req.params[0] || "";
    const filename = req.params[1] || "";
    const content = getEvolutionFile(sprintId, filename, projectId);
    if (content === null) { res.status(404).json({ error: "File not found" }); return; }
    if (filename.endsWith(".jsx")) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    } else {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    res.send(content);
  });

  // ── Discovery History API ──

  app.get("/api/discovery-results", async (_req, res) => {
    const { listDiscoveryResults } = await import("./discovery-archive.js");
    res.json({ results: listDiscoveryResults() });
  });

  app.get("/api/discovery-results/:id", async (req, res) => {
    const { loadDiscoveryResult } = await import("./discovery-archive.js");
    const result = loadDiscoveryResult(req.params.id);
    if (!result) { res.status(404).json({ error: "Discovery not found" }); return; }
    res.json(result);
  });

  app.get("/api/discovery-results/:id/pptx", async (req, res) => {
    try {
      const { generateDiscoveryPptx } = await import("./discovery-pptx.js");
      const buf = await generateDiscoveryPptx(req.params.id);
      if (!buf) { res.status(404).json({ error: "Discovery not found or no memo available" }); return; }
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      res.setHeader("Content-Disposition", `attachment; filename="discovery-${req.params.id}.pptx"`);
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: "Failed to generate PPTX" });
    }
  });

  app.get(/^\/api\/discovery-results\/([^/]+)\/file\/(.+)$/, async (req, res) => {
    const { getDiscoveryFile } = await import("./discovery-archive.js");
    const discoveryId = req.params[0] || "";
    const filename = req.params[1] || "";
    const content = getDiscoveryFile(discoveryId, filename);
    if (content === null) { res.status(404).json({ error: "File not found" }); return; }
    if (filename.endsWith(".jsx")) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    } else {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    res.send(content);
  });

  // ── Memory API — Enso's local memory (ENSO_USER.md + ENSO_MEMORY.md) ──
  app.get("/api/memory", (_req, res) => {
    res.json(readEnsoMemory());
  });

  app.put("/api/memory", express.json(), (req, res) => {
    const { user, memory } = req.body as { user?: string; memory?: string };
    if (typeof user === "string") {
      const ok = writeEnsoUser(user);
      if (!ok) { res.status(500).json({ error: "Failed to write ENSO_USER.md" }); return; }
    }
    if (typeof memory === "string") {
      const ok = writeEnsoMemory(memory);
      if (!ok) { res.status(500).json({ error: "Failed to write ENSO_MEMORY.md" }); return; }
    }
    res.json({ ok: true });
  });

  // ── Clear Chat History API ──
  app.delete("/api/history", (req, res) => {
    const clientId = req.query.clientId as string;
    if (!clientId) { res.status(400).json({ error: "clientId required" }); return; }
    const ok = clearCardHistory(clientId);
    res.json({ ok });
  });

  // ── Collections API — browse all persisted document collections ──
  app.get("/api/collections", async (_req, res) => {
    try {
      const { listAllCollections } = await import("./persistence.js");
      res.json({ collections: listAllCollections() });
    } catch (err) {
      res.status(500).json({ error: "Failed to list collections" });
    }
  });

  app.get("/api/collections/:family/:collection/:id", async (req, res) => {
    try {
      const { loadCollectionDocument } = await import("./persistence.js");
      const doc = loadCollectionDocument(req.params.family, req.params.collection, req.params.id);
      if (doc == null) {
        res.status(404).json({ error: "Document not found" });
      } else {
        res.json(doc);
      }
    } catch (err) {
      res.status(500).json({ error: "Failed to load document" });
    }
  });

  // Accept file uploads from the browser client
  const uploadDir = join(tmpdir(), "enso-uploads");
  mkdirSync(uploadDir, { recursive: true });

  app.post("/upload", express.raw({ type: () => true, limit: "50mb" }), (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: "Empty or missing upload body" });
        return;
      }

      const contentType = req.headers["content-type"] ?? "application/octet-stream";
      const bodyLen = req.body.length;
      logAction({ ts: Date.now(), type: "action", category: "upload", message: `Upload received: contentType=${contentType}, bodyLen=${bodyLen}, isBuffer=true` });
      const extMap: Record<string, string> = {
        // Images
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
        "image/bmp": ".bmp",
        // Video
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
        "video/x-msvideo": ".avi",
        // Audio
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/ogg": ".ogg",
        "audio/flac": ".flac",
        "audio/mp4": ".m4a",
        "audio/aac": ".aac",
        // Documents
        "application/pdf": ".pdf",
        "application/msword": ".doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "application/vnd.ms-excel": ".xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
        "application/vnd.ms-powerpoint": ".ppt",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
        "text/plain": ".txt",
        "text/csv": ".csv",
        "text/markdown": ".md",
        "application/json": ".json",
        "application/xml": ".xml",
        "text/xml": ".xml",
        "application/rtf": ".rtf",
        "application/zip": ".zip",
      };

      let fileBuffer: Buffer;
      let mimeType = contentType;

      // Handle base64 JSON uploads from Capacitor native (where Blob/ArrayBuffer
      // fetch bodies are serialized as "{}" by the Android WebView)
      if (contentType === "application/json") {
        try {
          const json = JSON.parse(req.body.toString("utf-8"));
          if (json.data && json.mimeType) {
            fileBuffer = Buffer.from(json.data, "base64");
            mimeType = json.mimeType;
            logAction({ ts: Date.now(), type: "action", category: "upload", message: `Decoded base64 JSON: mimeType=${mimeType}, decodedLen=${fileBuffer.length}` });
          } else {
            // Regular JSON file upload
            fileBuffer = req.body;
          }
        } catch {
          fileBuffer = req.body;
        }
      } else {
        fileBuffer = req.body;
      }

      // Detect MIME from magic bytes when Content-Type is missing/generic
      // (common on Capacitor Android where file.type can be empty)
      if (!mimeType || mimeType === "application/octet-stream" || !extMap[mimeType]) {
        const detected = detectMimeFromMagicBytes(fileBuffer);
        if (detected) {
          logAction({ ts: Date.now(), type: "action", category: "upload", message: `MIME detected from magic bytes: ${detected} (was: ${mimeType || "(empty)"})` });
          mimeType = detected;
        }
      }

      // Reject corrupt uploads (Capacitor Blob serialization produces 2-byte "{}")
      if (fileBuffer.length < 200 && mimeType.startsWith("image/")) {
        logError("upload", `Rejecting corrupt image upload: ${fileBuffer.length} bytes`);
        res.status(400).json({ error: "Upload too small — image appears corrupt. Please try again." });
        return;
      }

      const ext = extMap[mimeType] ?? ".bin";
      const filename = `${randomUUID()}${ext}`;
      const filePath = join(uploadDir, filename);

      writeFileSync(filePath, fileBuffer);
      const mediaUrl = toMediaUrl(filePath);
      logAction({ ts: Date.now(), type: "action", category: "upload", message: `Upload saved: ${filename} (${fileBuffer.length} bytes, ${mimeType})` });
      res.json({ mediaUrl, filePath });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown upload error";
      logError("upload", `Upload failed: ${message}`);
      res.status(500).json({ error: `Upload failed: ${message}` });
    }
  });

  // Transcribe audio from the browser (voice input on native)
  // Accepts either raw audio body or JSON { audio: base64, mimeType: string }
  app.post("/transcribe", express.json({ limit: "20mb" }), express.raw({ type: () => true, limit: "20mb" }), async (req, res) => {
    const account = getActiveAccount();
    if (!account?.geminiApiKey) {
      res.status(422).json({ error: "No Gemini API key configured" });
      return;
    }
    try {
      const extMap: Record<string, string> = {
        "audio/webm": ".webm",
        "audio/ogg": ".ogg",
        "audio/mp4": ".m4a",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
      };
      let audioBuffer: Buffer;
      let audioMimeType: string;
      if (req.body?.audio && typeof req.body.audio === "string") {
        // Base64 JSON body (from Capacitor native)
        audioBuffer = Buffer.from(req.body.audio, "base64");
        audioMimeType = req.body.mimeType ?? "audio/webm";
      } else if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        // Raw audio body (from desktop browser)
        audioBuffer = req.body;
        audioMimeType = req.headers["content-type"] ?? "audio/webm";
      } else {
        res.status(400).json({ error: "Empty or missing audio body" });
        return;
      }
      const ext = extMap[audioMimeType] ?? ".webm";
      const filename = `${randomUUID()}${ext}`;
      const filePath = join(uploadDir, filename);
      writeFileSync(filePath, audioBuffer);
      const transcript = await transcribeAudio({ filePath, geminiApiKey: account.geminiApiKey });
      unlinkSync(filePath);
      if (transcript) {
        res.json({ transcript });
      } else {
        res.status(422).json({ error: "Could not transcribe audio" });
      }
    } catch (err) {
      logError("upload", "Audio transcription failed", err);
      res.status(500).json({ error: "Transcription failed" });
    }
  });

  // ── SPA fallback (must be after all API routes) ──
  if (existsSync(distDir) && existsSync(join(distDir, "index.html"))) {
    app.get("/{*path}", (_req, res) => {
      res.sendFile(join(distDir, "index.html"));
    });
  }

  const server: Server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  /** Cleanup timers for disconnected clients — keyed by clientId. */
  const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ── WebSocket keep-alive pings ──
  // Mobile networks (especially Android cellular) aggressively close idle TCP
  // connections after ~2 minutes.  Send protocol-level pings every 30s so the
  // connection is never considered idle.  Browsers respond with pong
  // automatically at the protocol level.
  const WS_PING_INTERVAL_MS = 30_000;
  const WS_PONG_TIMEOUT_MS = 10_000;
  const pingInterval = setInterval(() => {
    for (const client of clients.values()) {
      const { ws: clientWs } = client;
      if (clientWs.readyState !== WebSocket.OPEN) continue;
      // Mark as awaiting pong — if no pong arrives before next cycle, terminate.
      if ((clientWs as any)._ensoAwaitingPong) {
        runtime.log?.(`[enso] ping timeout for ${client.id}, terminating`);
        clientWs.terminate();
        continue;
      }
      (clientWs as any)._ensoAwaitingPong = true;
      clientWs.ping();
    }
  }, WS_PING_INTERVAL_MS);

  wss.on("connection", (ws, req) => {
    // Reset pong flag on each pong received
    ws.on("pong", () => { (ws as any)._ensoAwaitingPong = false; });
    // ── WebSocket token auth ──
    const wsUrl = new URL(req.url ?? "", `http://${req.headers.host}`);
    if (accessToken) {
      const origin = req.headers.origin ?? "";
      const isSameOrigin = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
      if (!isSameOrigin && wsUrl.searchParams.get("token") !== accessToken) {
        ws.close(4001, "Unauthorized");
        return;
      }
    }

    // ── Persistent client identity (reconnect-safe) ──
    const clientId = wsUrl.searchParams.get("clientId") ?? randomUUID().slice(0, 8);
    const existing = clients.get(clientId);

    let client: ConnectedClient;
    if (existing) {
      // Reconnect — swap ws and send on the existing object so all captured
      // references (runClaudeCode, orchestrator, build-via-claude) automatically
      // route to the new socket.
      existing.ws = ws;
      existing.send = (msg: ServerMessage) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        } else {
          const buf = existing._disconnectedBuffer;
          if (buf.length < 2000) buf.push(msg);
        }
      };
      client = existing;
      // Cancel any pending cleanup timer
      const timer = cleanupTimers.get(clientId);
      if (timer) { clearTimeout(timer); cleanupTimers.delete(clientId); }

      // Replay messages that were buffered while disconnected (mobile background).
      // This ensures Claude Code output isn't lost when the app is backgrounded.
      const buffered = existing._disconnectedBuffer.splice(0);
      if (buffered.length > 0) {
        runtime.log?.(`[enso] replaying ${buffered.length} buffered message(s) for ${clientId}`);
        for (const msg of buffered) {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
        }
      }
      runtime.log?.(`[enso] client reconnected: ${clientId}`);
      logAction({ ts: Date.now(), type: "system", category: "system:reconnect", message: `Client reconnected: ${clientId}`, metadata: { bufferedMessages: buffered.length } });
    } else {
      // New connection
      const sessionKey = `enso_${clientId}`;
      client = {
        id: clientId,
        sessionKey,
        ws,
        _disconnectedBuffer: [],
        send: (msg: ServerMessage) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
          } else {
            // Buffer messages while disconnected (mobile background) so they
            // can be replayed on reconnect.  Cap at 2000 entries (~2 MB) to
            // avoid unbounded memory growth from very long Claude Code sessions.
            const buf = client._disconnectedBuffer;
            if (buf.length < 2000) buf.push(msg);
          }
        },
      };
      clients.set(clientId, client);
      runtime.log?.(`[enso] client connected: ${clientId}`);
      logAction({ ts: Date.now(), type: "system", category: "system:connect", message: `Client connected: ${clientId}` });
    }

    // Send current mode + available tool families + project path to newly connected client
    const toolFamilies = APP_CATALOG.map((c) => ({ appId: c.appId, toolFamily: c.appId, description: c.description }));
    const ensoProjectPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    client.send({
      id: randomUUID(),
      runId: randomUUID(),
      sessionKey: client.sessionKey,
      seq: 0,
      state: "final",
      settings: { mode: account.mode ?? "full", toolFamilies, ensoProjectPath },
      timestamp: Date.now(),
    });

    // Send resolved bugs notification on reconnect
    try {
      const unackedFixes = getUnacknowledgedFixes();
      if (unackedFixes.length > 0) {
        client.send({
          id: randomUUID(),
          runId: randomUUID(),
          sessionKey: client.sessionKey,
          seq: 0,
          state: "final",
          resolvedBugs: unackedFixes.map((f) => ({
            id: f.id,
            timestamp: f.timestamp,
            description: f.description,
            resolution: f.resolution,
            category: f.category,
          })),
          timestamp: Date.now(),
        });
        acknowledgeFixes(unackedFixes.map((f) => f.id));
      }
    } catch (err) {
      logError("server", "Failed to send resolved bugs", err instanceof Error ? err : undefined);
    }

    // Local aliases so the message handler continues to work unchanged.
    // `send` delegates through `client.send` which is swapped on reconnect.
    const send = (msg: ServerMessage) => client.send(msg);
    const sessionKey = client.sessionKey;
    const connectionId = clientId; // backward-compat alias for senderNick, shell cleanup, etc.

    ws.on("message", async (raw) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());
        runtime.log?.(`[enso] received: ${msg.type} ${msg.text?.slice(0, 50) ?? ""}`);

        statusSink?.({ lastInboundAt: Date.now() });

        switch (msg.type) {
          case "chat.send":
            // Persist user bubble to card history — but skip tool-routed
            // messages (e.g. claude-code prompts contain system instructions
            // that shouldn't appear as user messages in history).
            if (msg.text && !msg.routing?.toolId) {
              const userCardId = randomUUID();
              persistCard(clientId, {
                id: userCardId,
                runId: userCardId,
                type: "user-bubble",
                role: "user",
                text: msg.text,
                mediaUrls: msg.mediaUrls,
                timestamp: Date.now(),
              });
            }
            // Direct tool invocation — bypass OpenClaw pipeline entirely
            if (msg.routing?.toolId === "claude-code" && msg.text) {
              runtime.log?.(`[enso] direct claude-code: "${msg.text.slice(0, 60)}"`);
              const runId = randomUUID();
              await runClaudeCode({
                prompt: msg.text,
                cwd: msg.routing.cwd,
                toolSessionId: msg.routing.toolSessionId,
                client,
                runId,
                targetCardId: msg.sourceCardId,
                model: client.claudeModel,
                thinking: client.claudeThinking,
              });
              if (msg.text.startsWith("The user wants to enhance the Enso system")) {
                logFix({
                  description: `System enhancement: ${msg.text.slice(0, 150)}`,
                  error: "",
                  resolution: "Claude Code analyzed and implemented system improvements",
                  category: "system",
                });
              } else if (msg.text.includes("reported a bug") && msg.text.includes("debug reporter")) {
                // Extract bug description from the prompt
                const descMatch = msg.text.match(/Bug description:\s*"([^"]+)"/);
                const desc = descMatch?.[1] || "Bug reported via debug reporter";
                logFix({
                  description: desc.slice(0, 200),
                  error: desc.slice(0, 500),
                  resolution: "Claude Code investigated and fixed the reported bug",
                  category: "debug-report",
                });
              }
            // Direct researcher routing — /research slash command
            } else if (msg.routing?.toolId === "researcher" && msg.text) {
              runtime.log?.(`[enso] direct researcher: "${msg.text.slice(0, 60)}"`);
              try {
                await routeToResearch({
                  topic: msg.text,
                  depth: "standard",
                  originalText: msg.text,
                  sessionKey,
                  client,
                  account,
                  config,
                  runtime,
                  connectionId,
                });
              } catch (researchErr) {
                logError("task-router", "/research direct routing failed, falling through to agent", researchErr);
                await handleInbound({
                  message: {
                    messageId: randomUUID(),
                    sessionId: sessionKey,
                    senderNick: `user_${connectionId}`,
                    text: msg.text,
                    mediaUrls: msg.mediaUrls,
                    timestamp: Date.now(),
                  },
                  account, config, runtime, client,
                  routing: msg.routing,
                });
              }
            } else if (msg.text && account.geminiApiKey && !msg.routing && account.mode !== "im") {
              // Smart task routing — auto-classify message complexity
              const processingRunId = randomUUID();
              // Emit initial processing status
              send({
                id: randomUUID(),
                runId: processingRunId,
                sessionKey,
                seq: 0,
                state: "delta",
                operation: {
                  operationId: processingRunId,
                  stage: "processing",
                  label: "Understanding your request...",
                  cancellable: false,
                },
                timestamp: Date.now(),
              });
              try {
                // Build recent conversation context for the classifier
                const recentCards = loadCardHistory(clientId, 10);
                const recentHistory = recentCards
                  .filter((c) => c.text)
                  .slice(-5)
                  .map((c) => `${c.role}: ${c.text!.slice(0, 300)}`);

                // ── Pre-classification: check for app intent (E1 routing fix) ──
                const appIntent = matchAppIntent(msg.text);
                if (appIntent && appIntent.confidence >= 0.85) {
                  runtime.log?.(`[enso] app-intent: matched "${appIntent.toolFamily}" (confidence=${appIntent.confidence}) for: "${msg.text.slice(0, 60)}"`);
                  // Dismiss the processing indicator
                  send({
                    id: randomUUID(),
                    runId: processingRunId,
                    sessionKey,
                    seq: 99,
                    state: "final",
                    text: "",
                    timestamp: Date.now(),
                  });
                  // Launch the matched app — same pattern as apps.run
                  try {
                    const { loadAllApps } = await import("./app-persistence.js");
                    const { executeToolDirect } = await import("./native-tools/registry.js");
                    const apps = loadAllApps();
                    const app = apps.find((a) => a.spec.toolFamily === appIntent.toolFamily);

                    if (app) {
                      const primary = app.spec.tools.find((t: any) => t.isPrimary) ?? app.spec.tools[0];
                      const primaryToolName = `${app.spec.toolPrefix}${primary.suffix}`;
                      const inferredParams = inferAppParams(msg.text, primary);

                      const result = await executeToolDirect(primaryToolName, { ...primary.sampleParams, ...inferredParams });
                      const data = result.success && result.data != null ? result.data : primary.sampleData;

                      const { registerCardContext } = await import("./outbound.js");
                      const cardId = randomUUID();
                      registerCardContext(cardId, {
                        cardId,
                        originalPrompt: msg.text,
                        originalResponse: "",
                        currentData: structuredClone(data),
                        geminiApiKey: account.geminiApiKey,
                        account,
                        mode: "full",
                        actionHistory: [],
                        appToolHint: {
                          toolName: primaryToolName,
                          params: inferredParams,
                          handlerPrefix: app.spec.toolPrefix,
                        },
                        interactionMode: "tool",
                        toolFamily: app.spec.toolFamily,
                        signatureId: app.spec.signatureId,
                        coverageStatus: "covered",
                      });

                      const appCardMsg = {
                        id: cardId,
                        runId: randomUUID(),
                        sessionKey,
                        seq: 0,
                        state: "final" as const,
                        data,
                        generatedUI: app.templateJSX,
                        cardMode: {
                          interactionMode: "tool" as const,
                          toolFamily: app.spec.toolFamily,
                          signatureId: app.spec.signatureId,
                          coverageStatus: "covered" as const,
                        },
                        timestamp: Date.now(),
                      };
                      send(appCardMsg);

                      persistCard(clientId, {
                        id: cardId,
                        runId: appCardMsg.runId,
                        type: "dynamic-ui",
                        role: "assistant",
                        data,
                        generatedUI: app.templateJSX,
                        cardMode: appCardMsg.cardMode,
                        timestamp: appCardMsg.timestamp,
                      });

                      break; // Exit the chat.send handler
                    } else {
                      const allFamilies = apps.map((a) => a.spec.toolFamily).join(", ");
                      runtime.log?.(`[enso] app-intent: app "${appIntent.toolFamily}" not found among ${apps.length} loaded apps: [${allFamilies}]`);
                    }
                  } catch (appErr) {
                    runtime.log?.(`[enso] app-intent: launch failed, falling through to classifier: ${String(appErr)}`);
                    // Fall through to classifyTask
                  }
                }

                const classification = await classifyTask({
                  userMessage: msg.text,
                  conversationHistory: recentHistory,
                  geminiApiKey: account.geminiApiKey,
                  mediaUrls: msg.mediaUrls,
                });

                // Emit classification result status
                send({
                  id: randomUUID(),
                  runId: processingRunId,
                  sessionKey,
                  seq: 1,
                  state: "delta",
                  operation: {
                    operationId: processingRunId,
                    stage: "processing",
                    label: classification.complexity === "research"
                      ? "Searching for information..."
                      : classification.complexity === "orchestrated"
                      ? "Planning a multi-step approach..."
                      : classification.complexity === "one-off"
                      ? "Preparing to work on your task..."
                      : "Composing a response...",
                    cancellable: false,
                  },
                  timestamp: Date.now(),
                });

                // Dismiss the processing indicator card before each path creates its own card
                const dismissProcessing = () => {
                  send({
                    id: randomUUID(),
                    runId: processingRunId,
                    sessionKey,
                    seq: 99,
                    state: "final",
                    text: "",
                    timestamp: Date.now(),
                  });
                };

                // Post-classification visualization intent override
                // When Gemini classifies as "simple" but user clearly wants a
                // dashboard/chart/visualization, re-route to Claude agent
                const vizKeywords = /\b(dashboard|chart|graph|visualize|visualization|KPI\s*(board|display|view)|metrics?\s+(display|board|view|visual)|show\s+(me\s+)?(the\s+)?data\s+in\s+(chart|graph|visual)|interactive\s+(chart|graph|dashboard))\b/i;
                const vizModifiers = /\b(executive|quarterly|monthly|annual|real-?time|live)\b/i;

                if (
                  classification.complexity === "simple" &&
                  vizKeywords.test(msg.text) &&
                  (vizModifiers.test(msg.text) ||
                   /\b(showing|display|create|build|generate)\b/i.test(msg.text))
                ) {
                  runtime.log?.(`[enso] viz-override: reclassifying "${msg.text.slice(0, 60)}" from simple to agent`);
                  dismissProcessing();
                  await handleInbound({
                    message: {
                      messageId: randomUUID(),
                      sessionId: sessionKey,
                      senderNick: `user_${connectionId}`,
                      text: msg.text,
                      mediaUrls: msg.mediaUrls,
                      timestamp: Date.now(),
                    },
                    account,
                    config,
                    runtime,
                    client,
                    routing: msg.routing,
                    statusSink,
                  });
                  break;
                }

                // Post-classification app intent override (E1 routing fix)
                // When Gemini classifies as "simple" or "one-off" but user clearly wants a media app,
                // intercept and launch the matched app instead of routing to Claude Code Terminal.
                if (
                  (classification.complexity === "simple" || classification.complexity === "one-off") &&
                  appIntent &&
                  appIntent.confidence >= 0.7
                ) {
                  runtime.log?.(`[enso] app-override: reclassifying "${msg.text.slice(0, 60)}" from ${classification.complexity} to app (${appIntent.toolFamily})`);
                  dismissProcessing();
                  try {
                    const { loadAllApps: loadApps2 } = await import("./app-persistence.js");
                    const { executeToolDirect: execTool2 } = await import("./native-tools/registry.js");
                    const apps2 = loadApps2();
                    const app2 = apps2.find((a) => a.spec.toolFamily === appIntent.toolFamily);

                    if (app2) {
                      const primary2 = app2.spec.tools.find((t: any) => t.isPrimary) ?? app2.spec.tools[0];
                      const toolName2 = `${app2.spec.toolPrefix}${primary2.suffix}`;
                      const params2 = inferAppParams(msg.text, primary2);

                      const result2 = await execTool2(toolName2, { ...primary2.sampleParams, ...params2 });
                      const data2 = result2.success && result2.data != null ? result2.data : primary2.sampleData;

                      const { registerCardContext: regCtx2 } = await import("./outbound.js");
                      const cardId2 = randomUUID();
                      regCtx2(cardId2, {
                        cardId: cardId2,
                        originalPrompt: msg.text,
                        originalResponse: "",
                        currentData: structuredClone(data2),
                        geminiApiKey: account.geminiApiKey,
                        account,
                        mode: "full",
                        actionHistory: [],
                        appToolHint: {
                          toolName: toolName2,
                          params: params2,
                          handlerPrefix: app2.spec.toolPrefix,
                        },
                        interactionMode: "tool",
                        toolFamily: app2.spec.toolFamily,
                        signatureId: app2.spec.signatureId,
                        coverageStatus: "covered",
                      });

                      const overrideMsg = {
                        id: cardId2,
                        runId: randomUUID(),
                        sessionKey,
                        seq: 0,
                        state: "final" as const,
                        data: data2,
                        generatedUI: app2.templateJSX,
                        cardMode: {
                          interactionMode: "tool" as const,
                          toolFamily: app2.spec.toolFamily,
                          signatureId: app2.spec.signatureId,
                          coverageStatus: "covered" as const,
                        },
                        timestamp: Date.now(),
                      };
                      send(overrideMsg);

                      persistCard(clientId, {
                        id: cardId2,
                        runId: overrideMsg.runId,
                        type: "dynamic-ui",
                        role: "assistant",
                        data: data2,
                        generatedUI: app2.templateJSX,
                        cardMode: overrideMsg.cardMode,
                        timestamp: overrideMsg.timestamp,
                      });

                      break;
                    } else {
                      runtime.log?.(`[enso] app-override: app "${appIntent.toolFamily}" not found among ${apps2.length} loaded apps`);
                    }
                  } catch (overrideErr) {
                    runtime.log?.(`[enso] app-override: launch failed, continuing with classification: ${String(overrideErr)}`);
                    // Fall through to normal classification handling
                  }
                }

                if (classification.complexity === "orchestrated") {
                  runtime.log?.(`[enso] task-router: orchestrated → "${msg.text.slice(0, 60)}"`);
                  dismissProcessing();
                  const { handleOrchestration } = await import("./orchestrator.js");
                  handleOrchestration({
                    userMessage: msg.text,
                    classification,
                    client,
                    account,
                  }).catch((err) => {
                    logError("orchestrator", "Auto-routed orchestration failed", err);
                    runtime.error?.(`[enso] orchestrator error: ${err instanceof Error ? err.message : String(err)}`);
                  });
                  break;
                }

                if (classification.complexity === "research") {
                  const topic = classification.researchTopic || msg.text;
                  // Deep research is only triggered via ✨ button on completed cards, never from initial classification
                  const depth = (classification.researchDepth === "quick" ? "quick" : "standard") as "quick" | "standard";
                  runtime.log?.(`[enso] task-router: research → "${topic.slice(0, 60)}" (depth=${depth})`);

                  // Dismiss processing card before routeToResearch creates the researcher card
                  dismissProcessing();

                  try {
                    await routeToResearch({
                      topic,
                      depth,
                      originalText: msg.text,
                      sessionKey,
                      client,
                      account,
                      config,
                      runtime,
                      connectionId,
                    });
                  } catch (researchErr) {
                    logError("task-router", "Research routing failed, falling through to agent", researchErr);
                    runtime.log?.(`[enso] task-router: research routing failed, falling through`);
                    await handleInbound({
                      message: {
                        messageId: randomUUID(),
                        sessionId: sessionKey,
                        senderNick: `user_${connectionId}`,
                        text: msg.text,
                        mediaUrls: msg.mediaUrls,
                        timestamp: Date.now(),
                      },
                      account,
                      config,
                      runtime,
                      client,
                    });
                  }
                  break;
                }

                if (classification.complexity === "one-off") {
                  dismissProcessing();
                  // One-off tasks with archetypes get escalated to orchestrator for bespoke UI output
                  if (classification.archetype && classification.archetype !== "general") {
                    runtime.log?.(`[enso] task-router: one-off with archetype "${classification.archetype}" → escalating to orchestrator`);
                    const { handleOrchestration } = await import("./orchestrator.js");
                    handleOrchestration({
                      userMessage: msg.text,
                      classification: { ...classification, complexity: "orchestrated" },
                      client,
                      account,
                    }).catch((err) => {
                      logError("orchestrator", "Archetype-escalated orchestration failed", err);
                    });
                    break;
                  }
                  runtime.log?.(`[enso] task-router: one-off → "${msg.text.slice(0, 60)}"`);
                  const runId = randomUUID();
                  const targetCardId = randomUUID();
                  await runClaudeCode({
                    prompt: msg.text,
                    cwd: ensoProjectPath,
                    client,
                    runId,
                    targetCardId,
                  });
                  break;
                }

                // "simple" — router provides the answer directly
                dismissProcessing();
                if (classification.answer) {
                  // Quality gate — validate answer before sending
                  const gate = qualityGate(classification.answer, msg.text);
                  if (!gate.pass) {
                    runtime.log?.(`[enso] quality-gate FAILED (${gate.reason}): "${msg.text.slice(0, 60)}" — escalating to agent`);
                    await handleInbound({
                      message: {
                        messageId: randomUUID(),
                        sessionId: sessionKey,
                        senderNick: `user_${connectionId}`,
                        text: msg.text,
                        mediaUrls: msg.mediaUrls,
                        timestamp: Date.now(),
                      },
                      account,
                      config,
                      runtime,
                      client,
                      routing: msg.routing,
                      statusSink,
                    });
                  } else {
                    runtime.log?.(`[enso] task-router: simple → "${msg.text.slice(0, 60)}"`);
                    const answerCardId = randomUUID();
                    const answerRunId = randomUUID();

                    // Headline-first: send first paragraph as delta for perceived speed
                    const firstParaEnd = classification.answer.indexOf("\n\n");
                    if (firstParaEnd > 20 && firstParaEnd < classification.answer.length - 50) {
                      send({
                        id: answerCardId,
                        runId: answerRunId,
                        sessionKey,
                        seq: 0,
                        state: "delta",
                        text: classification.answer.slice(0, firstParaEnd),
                        timestamp: Date.now(),
                      });
                      await new Promise(r => setTimeout(r, 100));
                    }

                    send({
                      id: answerCardId,
                      runId: answerRunId,
                      sessionKey,
                      seq: firstParaEnd > 20 && firstParaEnd < classification.answer.length - 50 ? 1 : 0,
                      state: "final",
                      text: classification.answer,
                      timestamp: Date.now(),
                    });
                    persistCard(clientId, {
                      id: answerCardId,
                      runId: answerRunId,
                      type: "chat",
                      role: "assistant",
                      text: classification.answer,
                      timestamp: Date.now(),
                    });
                  }
                } else {
                  // No answer (classification fallback or heuristic) — route to normal agent for a real response
                  runtime.log?.(`[enso] task-router: simple with no answer → routing to agent`);
                  await handleInbound({
                    message: {
                      messageId: randomUUID(),
                      sessionId: sessionKey,
                      senderNick: `user_${connectionId}`,
                      text: msg.text,
                      mediaUrls: msg.mediaUrls,
                      timestamp: Date.now(),
                    },
                    account,
                    config,
                    runtime,
                    client,
                    routing: msg.routing,
                    statusSink,
                  });
                }
              } catch (routerErr) {
                // Router failed — fall through to agent as last resort
                runtime.log?.(`[enso] task-router failed, falling through to agent: ${String(routerErr)}`);
                await handleInbound({
                  message: {
                    messageId: randomUUID(),
                    sessionId: sessionKey,
                    senderNick: `user_${connectionId}`,
                    text: msg.text,
                    mediaUrls: msg.mediaUrls,
                    timestamp: Date.now(),
                  },
                  account,
                  config,
                  runtime,
                  client,
                  routing: msg.routing,
                  statusSink,
                });
              }
            } else if (msg.text || (msg.mediaUrls && msg.mediaUrls.length > 0)) {
              // Fallback for: media-only messages, IM mode, no Gemini key, or explicit routing
              await handleInbound({
                message: {
                  messageId: randomUUID(),
                  sessionId: sessionKey,
                  senderNick: `user_${connectionId}`,
                  text: msg.text ?? "",
                  mediaUrls: msg.mediaUrls,
                  timestamp: Date.now(),
                },
                account,
                config,
                runtime,
                client,
                routing: msg.routing,
                statusSink,
              });
            }
            break;
          case "operation.cancel":
            if (msg.operationId) {
              const cancelled = cancelClaudeCodeRun(msg.operationId);
              if (!cancelled) {
                send({
                  id: randomUUID(),
                  runId: msg.operationId,
                  sessionKey,
                  seq: 0,
                  state: "error",
                  text: "Operation is no longer running.",
                  operation: {
                    operationId: msg.operationId,
                    stage: "error",
                    label: "Not running",
                    cancellable: false,
                  },
                  timestamp: Date.now(),
                });
              }
            }
            break;
          case "ui_action":
            if (msg.uiAction) {
              const actionText = `UI Action: ${msg.uiAction.action} on ${msg.uiAction.componentId}`;
              await handleInbound({
                message: {
                  messageId: randomUUID(),
                  sessionId: sessionKey,
                  senderNick: `user_${connectionId}`,
                  text: actionText,
                  timestamp: Date.now(),
                },
                account,
                config,
                runtime,
                client,
                statusSink,
              });
            }
            break;

          case "image_research": {
            // Dedicated image-to-research route — completely bypasses chat.send / task-router / agent pipeline
            if (!msg.mediaUrls?.length) {
              send({ id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
                text: "No image was attached. Please try again with a photo.", timestamp: Date.now() });
              break;
            }
            // Persist user bubble with image
            const irUserCardId = randomUUID();
            persistCard(clientId, {
              id: irUserCardId, runId: irUserCardId, type: "user-bubble", role: "user",
              text: msg.text || "", mediaUrls: msg.mediaUrls, timestamp: Date.now(),
            });

            runtime.log?.(`[enso] image-research: analyzing image for research topic`);
            try {
              const imagePath = msg.mediaUrls[0];
              const { topic, depth } = await analyzeImageForResearch({
                imagePath,
                userText: msg.text || "",
                apiKey: account.geminiApiKey,
              });
              runtime.log?.(`[enso] image-research: topic="${topic.slice(0, 80)}" depth=${depth}`);
              await routeToResearch({
                topic,
                depth,
                originalText: msg.text || topic,
                sessionKey,
                client,
                account,
                config,
                runtime,
                connectionId,
              });
            } catch (err) {
              logError("image-research", "Image analysis failed", err);
              // On error, still try research with user text or generic topic — never fall through to agent
              const fallbackTopic = msg.text || "Analyze this image";
              runtime.log?.(`[enso] image-research: vision failed, using fallback topic: "${fallbackTopic}"`);
              try {
                await routeToResearch({
                  topic: fallbackTopic,
                  depth: "standard",
                  originalText: fallbackTopic,
                  sessionKey,
                  client,
                  account,
                  config,
                  runtime,
                  connectionId,
                });
              } catch (fallbackErr) {
                logError("image-research", "Fallback research also failed", fallbackErr);
                send({ id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
                  text: "Sorry, I couldn't analyze this image. Please try again or describe what you'd like to research.",
                  timestamp: Date.now() });
              }
            }
            break;
          }

          case "card.action":
            if (account.mode === "im") {
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "error",
                text: "Card actions are not available in IM mode.",
                timestamp: Date.now(),
              });
              break;
            }
            if (msg.cardId && msg.cardAction) {
              runtime.log?.(`[enso] card action: ${msg.cardId} ${msg.cardAction}`);
              await handlePluginCardAction({
                cardId: msg.cardId,
                action: msg.cardAction,
                payload: msg.cardPayload,
                mode: msg.mode,
                client,
                config,
                runtime,
                statusSink,
              });
            }
            break;
          case "card.enhance":
            if (msg.cardId && msg.cardText) {
              runtime.log?.(`[enso] card enhance: ${msg.cardId}${msg.suggestedFamily ? ` (family=${msg.suggestedFamily})` : ""}`);
              await handleCardEnhance({
                cardId: msg.cardId,
                cardText: msg.cardText,
                suggestedFamily: msg.suggestedFamily,
                client,
                account,
              });
            }
            break;
          case "card.build_app":
            if (msg.cardId && msg.cardText && msg.buildAppDefinition) {
              runtime.log?.(`[enso] card build-app via Claude Code: ${msg.cardId}`);
              const { handleBuildAppViaClaude } = await import("./build-via-claude.js");
              // Fire-and-forget: build runs as Claude Code session, sends buildComplete when done
              handleBuildAppViaClaude({
                cardId: msg.cardId,
                cardText: msg.cardText,
                buildAppDefinition: msg.buildAppDefinition,
                conversationContext: msg.conversationContext,
                client,
                account,
              }).catch((err) => {
                logError("build-via-claude", "Unhandled build error", err);
                runtime.error?.(`[enso] build-via-claude unhandled error: ${err instanceof Error ? err.message : String(err)}`);
              });
            }
            break;
          case "orchestration.start": {
            if (msg.orchestrationGoal) {
              runtime.log?.(`[enso] orchestration start: ${msg.orchestrationGoal.slice(0, 80)}`);
              const { handleOrchestration } = await import("./orchestrator.js");
              handleOrchestration({
                userMessage: msg.orchestrationGoal,
                classification: { complexity: "orchestrated", reasoning: "User-initiated via /orchestrate" },
                client,
                account,
              }).catch((err) => {
                logError("orchestrator", "Unhandled orchestration start error", err);
                runtime.error?.(`[enso] orchestrator error: ${err instanceof Error ? err.message : String(err)}`);
              });
            }
            break;
          }
          case "orchestration.approve": {
            if (msg.orchestrationId) {
              runtime.log?.(`[enso] orchestration approve: ${msg.orchestrationId}`);
              const { handleOrchestrationApprove } = await import("./orchestrator.js");
              handleOrchestrationApprove({
                orchestrationId: msg.orchestrationId,
                approvedTaskIds: msg.orchestrationApprovedTasks,
                client,
                account,
              }).catch((err) => {
                logError("orchestrator", "Unhandled orchestration approve error", err);
              });
            }
            break;
          }
          case "orchestration.pause": {
            if (msg.orchestrationId) {
              runtime.log?.(`[enso] orchestration pause: ${msg.orchestrationId}`);
              const { handleOrchestrationPause } = await import("./orchestrator.js");
              handleOrchestrationPause(msg.orchestrationId);
            }
            break;
          }
          case "orchestration.resume": {
            if (msg.orchestrationId) {
              runtime.log?.(`[enso] orchestration resume: ${msg.orchestrationId}`);
              const { handleOrchestrationResume } = await import("./orchestrator.js");
              handleOrchestrationResume({
                orchestrationId: msg.orchestrationId,
                client,
                account,
              }).catch((err) => {
                logError("orchestrator", "Unhandled orchestration resume error", err);
              });
            }
            break;
          }
          case "orchestration.cancel": {
            if (msg.orchestrationId) {
              runtime.log?.(`[enso] orchestration cancel: ${msg.orchestrationId}`);
              const { handleOrchestrationCancel } = await import("./orchestrator.js");
              handleOrchestrationCancel(msg.orchestrationId);
            }
            break;
          }
          case "orchestration.message": {
            if (msg.orchestrationId && msg.orchestrationTaskId && msg.orchestrationMessage) {
              const { handleOrchestrationMessage } = await import("./orchestrator.js");
              handleOrchestrationMessage({
                orchestrationId: msg.orchestrationId,
                taskId: msg.orchestrationTaskId,
                message: msg.orchestrationMessage,
              });
            }
            break;
          }
          case "evolution.start": {
            runtime.log?.(`[enso] evolution sprint start`);
            try {
              const { handleEvolutionSprint } = await import("./evolution.js");
              runtime.log?.(`[enso] evolution module imported OK`);
              handleEvolutionSprint({
                projectId: msg.projectId,
                goal: msg.evolutionGoal,
                client,
                account,
              }).catch((err) => {
                logError("evolution", "Unhandled evolution start error", err);
                runtime.log?.(`[enso] evolution sprint error: ${err?.message || err}`);
              });
            } catch (importErr: any) {
              logError("evolution", "Failed to import evolution module", importErr);
              runtime.log?.(`[enso] evolution import error: ${importErr?.message || importErr}`);
              client.send({ type: "chat.send", state: "error", text: `Evolution failed: ${importErr?.message}` } as any);
            }
            break;
          }
          case "discovery.start": {
            runtime.log?.(`[enso] discovery sprint start`);
            try {
              const { handleDiscovery } = await import("./discovery.js");
              handleDiscovery({
                focus: msg.text?.replace(/^\/discover\s*/i, "").trim() || undefined,
                client,
                account,
              }).catch((err) => {
                logError("discovery", "Unhandled discovery error", err);
                client.send({ type: "chat.send", state: "error", text: `Discovery failed: ${err?.message}` } as any);
              });
            } catch (importErr: any) {
              logError("discovery", "Failed to import discovery module", importErr);
              client.send({ type: "chat.send", state: "error", text: `Discovery failed: ${importErr?.message}` } as any);
            }
            break;
          }
          case "apps.list": {
            try {
              const { loadAllApps, isShippedApp } = await import("./app-persistence.js");
              const { APP_CATALOG } = await import("./app-catalog.js");
              const { isToolRegistered } = await import("./native-tools/registry.js");
              const apps = loadAllApps();
              const dynamicApps = apps.map((app) => {
                const primary = app.spec.tools.find((t) => t.isPrimary) ?? app.spec.tools[0];
                return {
                  appId: app.spec.toolFamily,
                  toolFamily: app.spec.toolFamily,
                  description: app.spec.description,
                  toolCount: app.spec.tools.length,
                  primaryToolName: `${app.spec.toolPrefix}${primary.suffix}`,
                  shipped: isShippedApp(app.spec.toolFamily),
                  codebase: isShippedApp(app.spec.toolFamily),
                };
              });
              // Include built-in tool families whose fallback tool is registered
              const dynamicFamilies = new Set(dynamicApps.map((a) => a.toolFamily));
              const builtInApps = APP_CATALOG
                .filter((cap) => !dynamicFamilies.has(cap.appId) && isToolRegistered(cap.primaryTool))
                .map((cap) => ({
                  appId: cap.appId,
                  toolFamily: cap.appId,
                  description: cap.description,
                  toolCount: cap.actions.length,
                  primaryToolName: cap.primaryTool,
                  builtIn: true,
                  system: true,
                }));
              const appsList = [...builtInApps, ...dynamicApps];
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "final",
                appsList,
                timestamp: Date.now(),
              });
            } catch (err) {
              logError("apps", "apps.list failed", err);
              runtime.error?.(`[enso] apps.list failed: ${err instanceof Error ? err.message : String(err)}`);
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "final",
                appsList: [],
                timestamp: Date.now(),
              });
            }
            break;
          }
          case "apps.run": {
            if (msg.toolFamily) {
              runtime.log?.(`[enso:app-runner] apps.run: ${msg.toolFamily}`);
              try {
                const { loadAllApps } = await import("./app-persistence.js");
                const { executeToolDirect, normalizeDataForToolTemplate, getToolTemplateCode, getToolTemplate } = await import("./native-tools/registry.js");
                const { getApp } = await import("./app-catalog.js");
                const apps = loadAllApps();
                const app = apps.find((a) => a.spec.toolFamily === msg.toolFamily);

                if (app) {
                  // ── Dynamic app path ──
                  const primary = app.spec.tools.find((t) => t.isPrimary) ?? app.spec.tools[0];
                  const primaryToolName = `${app.spec.toolPrefix}${primary.suffix}`;

                  const result = await executeToolDirect(primaryToolName, primary.sampleParams);
                  const data = result.success && result.data != null
                    ? result.data
                    : primary.sampleData;

                  const dataKeys = data && typeof data === "object" ? Object.keys(data) : [];
                  runtime.log?.(`[enso:app-runner] tool=${primaryToolName} success=${result.success} dataKeys=[${dataKeys.join(",")}] using app's own template`);
                  if (!result.success) {
                    runtime.log?.(`[enso:app-runner] tool execution failed (${result.error ?? "unknown"}), falling back to sampleData`);
                  }

                  const generatedUI = app.templateJSX;
                  const { registerCardContext } = await import("./outbound.js");
                  const cardId = randomUUID();
                  registerCardContext(cardId, {
                    cardId,
                    originalPrompt: `Run app: ${app.spec.toolFamily}`,
                    originalResponse: "",
                    currentData: structuredClone(data),
                    geminiApiKey: account.geminiApiKey,
                    account,
                    mode: "full",
                    actionHistory: [],
                    appToolHint: {
                      toolName: primaryToolName,
                      params: primary.sampleParams,
                      handlerPrefix: app.spec.toolPrefix,
                    },
                    interactionMode: "tool",
                    toolFamily: app.spec.toolFamily,
                    signatureId: app.spec.signatureId,
                    coverageStatus: "covered",
                  });

                  runtime.log?.(`[enso:app-runner] card=${cardId} prefix=${app.spec.toolPrefix} family=${app.spec.toolFamily}`);

                  const appRunMsg = {
                    id: cardId,
                    runId: randomUUID(),
                    sessionKey,
                    seq: 0,
                    state: "final" as const,
                    data,
                    generatedUI,
                    cardMode: {
                      interactionMode: "tool" as const,
                      toolFamily: app.spec.toolFamily,
                      signatureId: app.spec.signatureId,
                      coverageStatus: "covered" as const,
                    },
                    targetCardId: undefined,
                    timestamp: Date.now(),
                  };
                  send(appRunMsg);

                  // Persist dynamic app card to history
                  persistCard(clientId, {
                    id: cardId,
                    runId: appRunMsg.runId,
                    type: "dynamic-ui",
                    role: "assistant",
                    data,
                    generatedUI,
                    cardMode: appRunMsg.cardMode,
                    timestamp: appRunMsg.timestamp,
                  });
                } else {
                  // ── Built-in tool family path ──
                  const cap = getApp(msg.toolFamily);
                  if (!cap) {
                    send({
                      id: randomUUID(),
                      runId: randomUUID(),
                      sessionKey,
                      seq: 0,
                      state: "error",
                      text: `App "${msg.toolFamily}" not found.`,
                      timestamp: Date.now(),
                    });
                    break;
                  }

                  const toolName = cap.primaryTool;
                  const result = await executeToolDirect(toolName, {});
                  if (!result.success) {
                    runtime.log?.(`[enso:app-runner] built-in tool ${toolName} failed: ${result.error}`);
                    send({
                      id: randomUUID(),
                      runId: randomUUID(),
                      sessionKey,
                      seq: 0,
                      state: "error",
                      text: `Failed to run app: ${result.error ?? "unknown error"}`,
                      timestamp: Date.now(),
                    });
                    break;
                  }

                  const template = getToolTemplate(cap.appId, cap.signatureId);
                  const normalized = template
                    ? normalizeDataForToolTemplate(template, result.data)
                    : (result.data as Record<string, unknown>);
                  const generatedUI = template ? getToolTemplateCode(template) : undefined;

                  // Derive prefix by stripping the fallback suffix from the tool name
                  const fallbackSuffix = cap.actions.find((s) => toolName.endsWith(`_${s}`));
                  const handlerPrefix = fallbackSuffix
                    ? toolName.slice(0, -fallbackSuffix.length)
                    : toolName.replace(/_[^_]+$/, "_");

                  const { registerCardContext } = await import("./outbound.js");
                  const cardId = randomUUID();
                  registerCardContext(cardId, {
                    cardId,
                    originalPrompt: `Run app: ${cap.appId}`,
                    originalResponse: "",
                    currentData: structuredClone(normalized),
                    geminiApiKey: account.geminiApiKey,
                    account,
                    mode: "full",
                    actionHistory: [],
                    appToolHint: {
                      toolName,
                      params: {},
                      handlerPrefix,
                    },
                    interactionMode: "tool",
                    toolFamily: cap.appId,
                    signatureId: cap.signatureId,
                    coverageStatus: "covered",
                  });

                  runtime.log?.(`[enso:app-runner] built-in card=${cardId} tool=${toolName} family=${cap.appId}`);

                  const builtinRunMsg = {
                    id: cardId,
                    runId: randomUUID(),
                    sessionKey,
                    seq: 0,
                    state: "final" as const,
                    data: normalized,
                    generatedUI,
                    cardMode: {
                      interactionMode: "tool" as const,
                      toolFamily: cap.appId,
                      signatureId: cap.signatureId,
                      coverageStatus: "covered" as const,
                    },
                    targetCardId: undefined,
                    timestamp: Date.now(),
                  };
                  send(builtinRunMsg);

                  // Persist built-in app card to history
                  persistCard(clientId, {
                    id: cardId,
                    runId: builtinRunMsg.runId,
                    type: "dynamic-ui",
                    role: "assistant",
                    data: normalized,
                    generatedUI,
                    cardMode: builtinRunMsg.cardMode,
                    timestamp: builtinRunMsg.timestamp,
                  });
                }
              } catch (err) {
                logError("apps", "apps.run failed", err, { toolFamily: msg.toolFamily });
                runtime.error?.(`[enso:app-runner] apps.run failed: ${err instanceof Error ? err.message : String(err)}`);
                send({
                  id: randomUUID(),
                  runId: randomUUID(),
                  sessionKey,
                  seq: 0,
                  state: "error",
                  text: `Failed to run app: ${err instanceof Error ? err.message : String(err)}`,
                  timestamp: Date.now(),
                });
              }
            }
            break;
          }
          case "apps.delete": {
            const family = msg.toolFamily;
            if (!family) {
              send({ id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "error", text: "Missing toolFamily for app deletion", timestamp: Date.now() });
              break;
            }
            runtime.log?.(`[enso] delete app requested: ${family}`);
            try {
              const { loadApps, unregisterLoadedApp, deleteApp } = await import("./app-persistence.js");
              const apps = loadApps();
              const app = apps.find((a) => a.spec.toolFamily === family);
              if (!app) {
                send({ id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "error", text: `App "${family}" not found`, timestamp: Date.now() });
                break;
              }
              unregisterLoadedApp(app.spec);
              deleteApp(family);
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "final",
                appsDeleted: { families: [family], count: 1 },
                timestamp: Date.now(),
              });
            } catch (err) {
              logError("apps", `delete app "${family}" failed`, err);
              send({ id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "error", text: `Failed to delete app: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() });
            }
            break;
          }
          case "card.delete_all_apps": {
            runtime.log?.(`[enso] delete all apps requested`);
            try {
              const { deleteAllApps } = await import("./app-persistence.js");
              const deleted = deleteAllApps();
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "final",
                appsDeleted: { families: deleted, count: deleted.length },
                timestamp: Date.now(),
              });
            } catch (err) {
              logError("apps", "delete_all_apps failed", err);
              runtime.error?.(`[enso] delete all apps failed: ${err instanceof Error ? err.message : String(err)}`);
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "error",
                text: `Failed to delete apps: ${err instanceof Error ? err.message : String(err)}`,
                timestamp: Date.now(),
              });
            }
            break;
          }
          case "apps.reload": {
            runtime.log?.(`[enso] reload all apps requested`);
            try {
              const { loadAndRegisterApps } = await import("./app-persistence.js");
              const { invalidateGalleryCache } = await import("./media-tools.js");
              invalidateGalleryCache();
              const appCount = loadAndRegisterApps();
              runtime.log?.(`[enso] reloaded ${appCount} app(s) from disk`);
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "final",
                text: `Reloaded ${appCount} app(s) from disk.`,
                timestamp: Date.now(),
              });
            } catch (err) {
              logError("apps", "apps.reload failed", err);
              send({ id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "error", text: `Failed to reload apps: ${err instanceof Error ? err.message : String(err)}`, timestamp: Date.now() });
            }
            break;
          }
          case "app.promote":
          case "app.save_to_codebase": {
            if (msg.toolFamily) {
              runtime.log?.(`[enso] save app to codebase: ${msg.toolFamily}`);
              try {
                const { promoteApp } = await import("./app-persistence.js");
                const result = promoteApp(msg.toolFamily);
                send({
                  id: randomUUID(),
                  runId: randomUUID(),
                  sessionKey,
                  seq: 0,
                  state: "final",
                  appSaved: {
                    toolFamily: msg.toolFamily,
                    success: result.success,
                    path: result.path,
                    error: result.error,
                  },
                  timestamp: Date.now(),
                });
              } catch (err) {
                logError("apps", "save_to_codebase failed", err, { toolFamily: msg.toolFamily });
                runtime.error?.(`[enso] save to codebase failed: ${err instanceof Error ? err.message : String(err)}`);
                send({
                  id: randomUUID(),
                  runId: randomUUID(),
                  sessionKey,
                  seq: 0,
                  state: "final",
                  appSaved: {
                    toolFamily: msg.toolFamily,
                    success: false,
                    error: err instanceof Error ? err.message : String(err),
                  },
                  timestamp: Date.now(),
                });
              }
            }
            break;
          }
          case "server.restart": {
            runtime.log?.(`[enso] server restart requested`);
            try {
              const { exec } = await import("node:child_process");
              const { writeFileSync } = await import("node:fs");
              const { tmpdir } = await import("node:os");
              const { join } = await import("node:path");
              const myPid = process.pid;
              // Write a temp batch file that kills our PID and starts a fresh gateway.
              // Then use WMI to run it in a process independent of our tree (parented
              // to WMI Provider Host, survives when our process is killed).
              const script = join(tmpdir(), "enso-restart.cmd");
              writeFileSync(script, [
                `@echo off`,
                `timeout /t 1 /nobreak >nul`,
                `taskkill /PID ${myPid} /F >nul 2>&1`,
                `timeout /t 3 /nobreak >nul`,
                `schtasks /run /tn "OpenClaw Gateway"`,
              ].join("\r\n"));
              exec(
                `powershell.exe -Command "([wmiclass]'Win32_Process').Create('cmd.exe /c ${script.replace(/\\/g, "\\\\")}')"`,
                { windowsHide: true },
                (err) => {
                  if (err) runtime.error?.(`[enso] WMI restart spawn failed: ${err.message}`);
                },
              );
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "final",
                text: "Restarting gateway...",
                timestamp: Date.now(),
              });
              // The WMI process will kill us after ~1s, then start a fresh gateway.
            } catch (err) {
              runtime.error?.(`[enso] restart failed: ${err instanceof Error ? err.message : String(err)}`);
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "error",
                text: `Restart failed: ${err instanceof Error ? err.message : String(err)}`,
                timestamp: Date.now(),
              });
            }
            break;
          }
          case "tools.list_projects": {
            const projects = scanProjects();
            send({
              id: randomUUID(),
              runId: randomUUID(),
              sessionKey,
              seq: 0,
              state: "final",
              projects,
              timestamp: Date.now(),
            });
            break;
          }
          case "sessions.list": {
            try {
              const { listSessions } = await import("@anthropic-ai/claude-agent-sdk");
              const dir = msg.routing?.cwd;
              const sessions = await listSessions({ dir, limit: 20 });
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "final",
                sessionsList: sessions.map((s) => ({
                  sessionId: s.sessionId,
                  summary: s.customTitle || s.summary || s.firstPrompt || "Untitled session",
                  lastModified: s.lastModified,
                  cwd: s.cwd,
                  gitBranch: s.gitBranch,
                })),
                timestamp: Date.now(),
              });
            } catch (err) {
              logError("sessions", "sessions.list failed", err);
              runtime.error?.(`[enso] sessions.list failed: ${err instanceof Error ? err.message : String(err)}`);
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "final",
                sessionsList: [],
                timestamp: Date.now(),
              });
            }
            break;
          }
          case "settings.set_mode": {
            const validModes = ["im", "ui", "full"] as const;
            if (msg.mode && validModes.includes(msg.mode as typeof validModes[number])) {
              account.mode = msg.mode as typeof validModes[number];
              runtime.log?.(`[enso] mode changed to: ${account.mode}`);
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "final",
                settings: { mode: account.mode },
                timestamp: Date.now(),
              });
            }
            break;
          }
          case "settings.set_model": {
            const validModels = ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"];
            const validThinking = ["adaptive", "disabled"] as const;
            if (msg.claudeModel && validModels.includes(msg.claudeModel)) {
              client.claudeModel = msg.claudeModel;
            }
            if (msg.claudeThinking && validThinking.includes(msg.claudeThinking as typeof validThinking[number])) {
              client.claudeThinking = msg.claudeThinking as typeof validThinking[number];
            }
            runtime.log?.(`[enso] claude model: ${client.claudeModel ?? "default"}, thinking: ${client.claudeThinking ?? "default"}`);
            send({
              id: randomUUID(),
              runId: randomUUID(),
              sessionKey,
              seq: 0,
              state: "final",
              settings: { mode: account.mode, claudeModel: client.claudeModel, claudeThinking: client.claudeThinking },
              timestamp: Date.now(),
            });
            break;
          }
          case "shell.create": {
            if (!shellPty) {
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "error",
                text: "Shell feature is not available — node-pty is not installed.",
                targetCardId: msg.sourceCardId,
                toolMeta: { toolId: "shell" },
                timestamp: Date.now(),
              });
              break;
            }
            const shellTargetCardId = msg.sourceCardId ?? randomUUID();
            const shellSessionId = shellPty.createShellSession({
              client,
              targetCardId: shellTargetCardId,
              cols: msg.shellCols ?? 80,
              rows: msg.shellRows ?? 24,
              cwd: msg.routing?.cwd,
            });
            runtime.log?.(`[enso:shell] created session ${shellSessionId} for card ${shellTargetCardId}`);
            break;
          }
          case "shell.input": {
            if (!shellPty || !msg.shellSessionId || msg.shellInput == null) break;
            shellPty.writeToShell(msg.shellSessionId, msg.shellInput);
            break;
          }
          case "shell.resize": {
            if (!shellPty || !msg.shellSessionId) break;
            shellPty.resizeShell(msg.shellSessionId, msg.shellCols ?? 80, msg.shellRows ?? 24);
            break;
          }
          case "shell.destroy": {
            if (!shellPty || !msg.shellSessionId) break;
            shellPty.destroyShell(msg.shellSessionId);
            runtime.log?.(`[enso:shell] destroyed session ${msg.shellSessionId}`);
            break;
          }
          case "client.error": {
            const ce = msg.clientError;
            if (ce) {
              logError("client", ce.message, ce.stack, {
                metadata: { source: ce.source, url: ce.url, clientId: connectionId },
              });
            }
            break;
          }
          case "chat.history": {
            const historyCount = msg.historyCount ?? 50;
            const records = loadCardHistory(clientId, historyCount);
            if (records.length > 0) {
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "final",
                cardHistory: records,
                timestamp: Date.now(),
              });
            }
            break;
          }
        }
      } catch (err) {
        runtime.error?.(`[enso] message handling error: ${String(err)}`);
        send({
          id: randomUUID(),
          runId: randomUUID(),
          sessionKey,
          seq: 0,
          state: "error",
          text: "An error occurred processing your message.",
          timestamp: Date.now(),
        });
      }
    });

    ws.on("close", () => {
      runtime.log?.(`[enso] client disconnected: ${clientId}`);
      logAction({ ts: Date.now(), type: "system", category: "system:disconnect", message: `Client disconnected: ${clientId}` });
      // Delay cleanup — the client may reconnect (especially on mobile where
      // backgrounding kills the WS).  Use a longer timeout (10 min) so Claude
      // Code output is buffered and replayed when the user returns.
      const timer = setTimeout(() => {
        cleanupTimers.delete(clientId);
        if (shellPty) {
          const killed = shellPty.destroyClientSessions(clientId);
          if (killed > 0) runtime.log?.(`[enso:shell] cleaned up ${killed} session(s) for ${clientId}`);
        }
        const droppedMsgs = client._disconnectedBuffer.length;
        client._disconnectedBuffer.length = 0;
        clients.delete(clientId);
        runtime.log?.(`[enso] client cleanup: ${clientId} (no reconnect after 10min, dropped ${droppedMsgs} buffered msgs)`);
      }, 600_000);
      cleanupTimers.set(clientId, timer);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, () => {
      runtime.log?.(`[enso] server listening on :${port}`);
      logAction({ ts: Date.now(), type: "system", category: "system", message: `Server started on port ${port}`, metadata: { port, hostname: hostname(), platform: platform() } });

      // Migrate card journals from old ~/.openclaw/enso-cards/ to ~/.enso/cards/
      try { migrateCardJournals(); } catch { /* best-effort */ }

      // Ensure default Enso project exists
      try {
        import("./project-manager.js").then(m => m.ensureDefaultProject()).catch(() => {});
      } catch { /* best-effort */ }

      // Prune stale card history files on startup
      try { pruneStaleJournals(); } catch { /* best-effort */ }

      // Broadcast fix notifications to all connected clients in real-time
      onFixLogged((fix: FixEntry) => {
        const msg: ServerMessage = {
          id: randomUUID(),
          runId: randomUUID(),
          sessionKey: "",
          seq: 0,
          state: "final",
          resolvedBugs: [{
            id: fix.id,
            timestamp: fix.timestamp,
            description: fix.description,
            resolution: fix.resolution,
            category: fix.category,
          }],
          timestamp: Date.now(),
        };
        for (const client of clients.values()) {
          try { client.send(msg); } catch { /* client may have disconnected */ }
        }
        // Mark as acknowledged since all current clients received it
        acknowledgeFixes([fix.id]);
      });

      resolve();
    });
  });

  function stop() {
    runtime.log?.("[enso] stopping server");
    clearInterval(pingInterval);
    for (const client of clients.values()) {
      client.ws.close();
    }
    clients.clear();
    wss.close();
    server.close();
  }

  opts.abortSignal?.addEventListener("abort", () => {
    stop();
  });

  return { stop };
}

/**
 * Try to find a file when the exact path doesn't exist.
 * Handles corrupted unicode filenames by matching the digit sequence.
 * e.g. "???? 2026-02-15 090519.png" matches "屏幕截图 2026-02-15 090519.png"
 */
function fuzzyResolveFile(filePath: string): string | null {
  try {
    const dir = dirname(filePath);
    const name = basename(filePath);
    const ext = extname(name);

    // Extract all digits from the filename as a fingerprint
    const digits = name.replace(/\D/g, "");
    if (digits.length < 4) return null;

    const files = readdirSync(dir);
    for (const file of files) {
      if (extname(file) !== ext) continue;
      const fileDigits = file.replace(/\D/g, "");
      if (fileDigits === digits) {
        const sep = dir.endsWith("\\") || dir.endsWith("/") ? "" : "\\";
        return `${dir}${sep}${file}`;
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }
  return null;
}
