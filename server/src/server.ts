/**
 * Main Enso server — sets up the Express HTTP server and WebSocket layer.
 * Manages connected browser clients, routes incoming WebSocket messages to
 * handlers (chat, Claude Code, apps, card actions, domain evolution, etc.),
 * and serves media files with MIME detection and Range streaming support.
 */
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
import { createScopedShareContext, getCardState } from "./outbound.js";
import { cancelClaudeCodeRun } from "./claude-code.js";
import { getDomainEvolutionJob, getDomainEvolutionJobs } from "./domain-evolution.js";
import { transcribeAudioBuffer } from "./transcribe.js";
import { APP_CATALOG } from "./app-catalog.js";
import { logAction, logError, getUnacknowledgedFixes, acknowledgeFixes, getRecentLog, onFixLogged } from "./action-log.js";
import type { FixEntry } from "./action-log.js";
import {
  clearCardHistory,
  pruneStaleJournals,
  migrateCardJournals,
  readEnsoMemory,
  writeEnsoUser,
  writeEnsoMemory,
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  DEFAULT_CONVERSATION_ID,
} from "./memory-bridge.js";
import { MAX_MEDIA_FILE_SIZE, WS_PING_INTERVAL_MS, WS_DISCONNECT_CLEANUP_MS } from "./config.js";
import { handleWebSocketMessage, cleanupClientContextSubscriptions } from "./ws-handlers.js";

export type ConnectedClient = {
  id: string;
  sessionKey: string;
  ws: WebSocket;
  send: (msg: ServerMessage) => void;
  /** Messages buffered while the WebSocket was disconnected (mobile background). */
  _disconnectedBuffer: ServerMessage[];
  /** Active chat thread id (per-client journals on disk). */
  conversationId: string;
  /** User-selected Claude model for Claude Code sessions. */
  claudeModel?: string;
  /** User-selected thinking mode. */
  claudeThinking?: "adaptive" | "disabled";
  /** User-selected UI language. */
  language?: string;
  /** User-selected chat LLM model. */
  chatModel?: string;
};

/** All connected browser clients, keyed by connection id. */
const clients = new Map<string, ConnectedClient>();

/** Live runtime account — mutated by settings.set_mode, visible to all handlers. */
let activeAccount: ResolvedEnsoAccount | null = null;

/** Current server port for constructing media URLs. */
let activePort = 3001;

/** Maximum file size for served media (300 MB) — re-exported from centralized config. */
export { MAX_MEDIA_FILE_SIZE } from "./config.js";

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



export async function startEnsoServer(opts: {
  account: ResolvedEnsoAccount;
  config: CoreConfig;
  runtime: EnsoRuntime;
  abortSignal?: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  /** Self-heal metrics accessor for the /health endpoint. */
  selfHealMetrics?: () => { uptimeMs: number; heapUsedMB: number; heapTotalMB: number; rssMB: number; eventLoopP99Ms: number; eventLoopMaxMs: number; errorsLast5Min: number; memoryWarning: boolean; memoryCritical: boolean };
  /** Callback when a client requests server restart (code 78). */
  onRestartRequested?: () => void;
}): Promise<{ stop: (isRestart?: boolean) => Promise<void> }> {
  console.log(`[Enso] Server starting at ${new Date().toISOString()}`);
  const { account, config, runtime, statusSink } = opts;
  const port = account.port;
  activePort = port;
  activeAccount = account;

  const bootId = randomUUID();

  // Pre-import provider status for initial settings (connection handler is not async)
  let _getProviderStatus: ((keys: Record<string, string>) => unknown[]) | undefined;
  try {
    const mod = await import("./llm-provider.js");
    _getProviderStatus = mod.getProviderStatus;
  } catch { /* non-fatal */ }

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

  // Run Cortex schema migration (version-gated, runs once)
  try {
    const { migrateCortexV2 } = await import("./cortex-migration.js");
    migrateCortexV2();
  } catch (err) {
    logError("system", "Cortex V2 migration failed (non-fatal)", err);
  }

  // Background re-enrichment: tag and cross-reference under-connected entities
  setTimeout(async () => {
    try {
      const { reEnrichStaleEntities } = await import("./cortex-enrichment.js");
      const result = await reEnrichStaleEntities(50);
      if (result.enriched > 0 || result.refsCreated > 0) {
        console.log(`[enso] Background re-enrichment: ${result.enriched} tagged, ${result.refsCreated} cross-refs`);
      }
    } catch (err) {
      logError("system", "Background re-enrichment failed (non-fatal)", err);
    }
  }, 30_000); // 30s after boot

  // Validate APP_CATALOG integrity: every non-terminal entry must have a template
  // (either a shipped app in server/apps/<appId>/ or a registered native template).
  // Catches phantom catalog entries that show up in the UI but render as raw JSON.
  try {
    const { SHIPPED_APPS_DIR } = await import("./app-persistence.js");
    const { getGeneratedTemplateCodeBySignature, getAllToolTemplates } = await import("./native-tools/registry.js");
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const registeredSigIds = new Set(getAllToolTemplates().map((s) => s.signatureId));
    const orphans: string[] = [];
    for (const entry of APP_CATALOG) {
      if (entry.experience === "terminal") continue;
      const hasShippedApp = existsSync(join(SHIPPED_APPS_DIR, entry.appId, "app.json"));
      const hasNativeTemplate = registeredSigIds.has(entry.signatureId) || !!getGeneratedTemplateCodeBySignature(entry.signatureId);
      if (!hasShippedApp && !hasNativeTemplate) {
        orphans.push(`${entry.appId} (signatureId: "${entry.signatureId}")`);
      }
    }
    if (orphans.length > 0) {
      console.warn(`[enso] ⚠️  APP_CATALOG integrity: ${orphans.length} entry(s) have no UI template — will render as raw JSON:`);
      for (const o of orphans) console.warn(`[enso]   - ${o}`);
      console.warn(`[enso]   Fix: add server/apps/<appId>/ with app.json+template.jsx, or register a native template for the signatureId.`);
      logAction({ ts: Date.now(), type: "error", category: "system", message: `APP_CATALOG orphans: ${orphans.join(", ")}` });
    }
  } catch (err) {
    logError("system", "APP_CATALOG integrity check failed (non-fatal)", err);
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
    if (req.path === "/upload" || req.path === "/transcribe" || req.path === "/api/settings/import") return next();
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

  // ── Simple IP-based rate limiter (no external package — safety rules block npm install) ──
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  const RATE_WINDOW_MS = 60_000;
  const RATE_LIMIT = 60;
  function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let entry = rateLimitMap.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
      rateLimitMap.set(ip, entry);
    }
    entry.count++;
    if (entry.count > RATE_LIMIT) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    next();
  }
  // Periodic cleanup to prevent memory growth
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now > entry.resetAt) rateLimitMap.delete(ip);
    }
  }, 5 * 60_000).unref();

  // ── Client-side WS debug log (unauthenticated — must work even when auth fails) ──
  app.post("/api/ws-debug", rateLimit, express.json(), (req, res) => {
    const entries: Array<{ event: string; ts: number; detail?: string }> = req.body?.entries;
    if (Array.isArray(entries)) {
      for (const e of entries) {
        runtime.log?.(`[enso:ws-client] ${e.event} clientId=${req.body?.clientId ?? '?'} ${e.detail ?? ''} (client-ts=${new Date(e.ts).toISOString()})`);
      }
    }
    res.json({ ok: true });
  });

  // ── Health endpoint (unauthenticated — used for connection testing) ──
  const accessToken = account.accessToken;
  app.get("/health", rateLimit, (_req, res) => {
    const pkg = readPkgVersion();
    const shm = opts.selfHealMetrics?.();
    const mem = process.memoryUsage();
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
      process: {
        pid: process.pid,
        uptimeSeconds: Math.floor(process.uptime()),
        heapUsedMB: shm?.heapUsedMB ?? Math.round(mem.heapUsed / 1_048_576),
        heapTotalMB: shm?.heapTotalMB ?? Math.round(mem.heapTotal / 1_048_576),
        rssMB: shm?.rssMB ?? Math.round(mem.rss / 1_048_576),
        eventLoopP99Ms: shm?.eventLoopP99Ms ?? -1,
        errorsLast5Min: shm?.errorsLast5Min ?? 0,
        memoryWarning: shm?.memoryWarning ?? false,
        guardianManaged: process.env.ENSO_GUARDIAN_MANAGED === "1",
      },
    });
  });

  // ── App version endpoint (unauthenticated — for Android upgrade checks) ──
  app.get("/api/version", rateLimit, (_req, res) => {
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

  // ── Tunnel registry (unauthenticated — only active on master instances) ──
  if (process.env.CLOUDFLARE_API_TOKEN) {
    const { tunnelRoutes } = await import("./tunnel-registry.js");
    app.use("/api/tunnel", express.json(), tunnelRoutes);
    runtime.log?.("[enso] tunnel registry enabled (master mode)");
  }

  // ── WeChat webhook (unauthenticated — WeChat server verification + message receiving) ──
  {
    const { wechatRoutes } = await import("./wechat-webhook.js");
    // WeChat sends XML bodies — use raw text parser for this route
    app.use("/api/wechat", express.text({ type: ["text/xml", "application/xml"] }), wechatRoutes);
    runtime.log?.("[enso] WeChat webhook mounted at /api/wechat");
  }

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

  // ── External image proxy (before auth — uses non-guessable base64url URLs) ──
  app.get("/media/proxy/:encodedUrl", async (req, res) => {
    let url: string;
    try {
      url = Buffer.from(req.params.encodedUrl, "base64url").toString("utf-8");
    } catch {
      res.status(400).json({ error: "Invalid encoded URL" });
      return;
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      res.status(400).json({ error: "Only HTTP(S) URLs allowed" });
      return;
    }
    try {
      const upstream = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Enso/1.0)" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: "Upstream fetch failed" });
        return;
      }
      const ct = upstream.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=86400");
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("Content-Length", buf.length);
      res.send(buf);
    } catch {
      res.status(502).json({ error: "Failed to fetch image" });
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

  // ── Action API (HTTP + SSE endpoints for CLI / external tools) ──
  const { createActionRouter } = await import("./action-api.js");
  app.use(createActionRouter({ account, config, runtime }));

  // ── Share token endpoint — returns access token for embedding in live exports ──
  // Defense-in-depth: explicit guard beyond the global auth middleware, since this
  // endpoint returns the actual access token and the global middleware allows
  // same-origin bypass (sec-fetch-site can be forged via curl).
  app.get("/api/share-token", (req, res) => {
    if (accessToken) {
      const origin = req.headers.origin ?? "";
      const isSameOrigin = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
      const hasToken = req.headers.authorization?.replace("Bearer ", "") === accessToken
        || req.query.token === accessToken;
      if (!isSameOrigin && !hasToken) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }
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

  // ── App Templates API (for Cortex tab — renders app UIs directly) ──
  app.get("/api/apps/templates", async (_req, res) => {
    try {
      const { loadAllApps } = await import("./app-persistence.js");
      const allApps = loadAllApps() as Array<{ spec: { toolFamily: string; toolPrefix: string; description?: string; signatureId?: string; tools: Array<{ suffix: string; isPrimary?: boolean; parameters?: unknown }> }; templateJSX?: string }>;

      // Content apps to surface in the Cortex tab
      const cortexApps: Record<string, { label: string; icon: string; order: number }> = {
        books: { label: "Books", icon: "📚", order: 1 },
        movies_tv: { label: "Movies", icon: "🎬", order: 2 },
        steam: { label: "Games", icon: "🎮", order: 3 },
        youtube_manager: { label: "YouTube", icon: "📺", order: 4 },
        articles: { label: "Articles", icon: "📰", order: 5 },
        travel: { label: "Travel", icon: "🌍", order: 6 },
        cortex: { label: "Knowledge", icon: "🧠", order: 7 },
      };

      const result = allApps
        .filter(a => cortexApps[a.spec.toolFamily])
        .map(a => {
          const meta = cortexApps[a.spec.toolFamily];
          const primaryTool = a.spec.tools.find(t => t.isPrimary) || a.spec.tools[0];
          return {
            family: a.spec.toolFamily,
            label: meta.label,
            icon: meta.icon,
            order: meta.order,
            templateJSX: a.templateJSX || "",
            primaryTool: `${a.spec.toolPrefix}${primaryTool.suffix}`,
            primaryParams: {},
          };
        })
        .sort((a, b) => a.order - b.order);

      res.json({ apps: result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // In-memory progress tracking for deep content generation (for Cortex tab polling)
  const deepContentProgress = new Map<string, { phase: string; detail?: string; percentComplete?: number; startedAt: number }>();

  // ── Cortex Card Action API (for Cortex tab — handles view_entity, nav_back, add_to_cortex etc.) ──
  app.post("/api/cortex/action", async (req, res) => {
    try {
      const { action, payload, appFamily, currentData } = req.body as {
        action: string; payload?: Record<string, unknown>;
        appFamily: string; currentData?: unknown;
      };
      if (!action) { res.status(400).json({ error: "Missing action" }); return; }

      // Handle entity-related actions
      if (action === "view_entity") {
        const entityId = String(payload?.entityId ?? "");
        if (!entityId) { res.json({ error: "No entity ID" }); return; }

        const { buildEntityDetailData } = await import("./entity-model.js");
        const detailData = await buildEntityDetailData(entityId);
        if (!detailData) { res.json({ error: "Entity not found" }); return; }

        // Check for processed deep content
        try {
          const { getProcessedContent } = await import("./deep-content.js");
          const processed = getProcessedContent(entityId);
          if (processed) {
            detailData.processedBook = processed;
            detailData.podcastAudioUrl = processed.audioUrl;
            detailData.podcastScript = processed.script;
            detailData.podcastDuration = processed.durationMinutes;
            detailData.podcastStatus = "ready";
          }
        } catch { /* ignore */ }

        // Add cross-type related entities
        try {
          const { findRelatedContent } = await import("./cortex-synthesis.js");
          const title = (detailData.entity as Record<string, unknown>)?.title as string || "";
          if (title) {
            const related = await findRelatedContent(title);
            const crossType: Array<Record<string, unknown>> = [];
            const entityType = (detailData.entity as Record<string, unknown>)?.type as string || "";
            for (const [, hits] of Object.entries(related.relatedContent?.bySource || {})) {
              for (const hit of (hits as Array<{ title: string; entityId?: string; type?: string }>).slice(0, 3)) {
                if (hit.type !== entityType) crossType.push(hit);
              }
            }
            if (crossType.length) detailData.crossTypeEntities = crossType.slice(0, 8);
          }
        } catch { /* ignore */ }

        res.json(detailData);
        return;
      }

      if (action === "add_to_cortex") {
        const { ingestDiscoveredEntity } = await import("./cortex-direct-ingest.js");
        const p = payload || {};
        const result = await ingestDiscoveredEntity({
          title: String(p.title ?? ""), type: String(p.type ?? ""),
          creator: p.creator ? String(p.creator) : undefined,
          year: p.year ? String(p.year) : undefined,
          description: p.description ? String(p.description) : undefined,
        });
        // Auto-enrich
        if (result.created) {
          try { const { enrichEntity } = await import("./content-enrichment.js"); await enrichEntity(result.entityId); } catch { /* best effort */ }
        }
        res.json({ ...result, _addedToCortex: [String(p.title ?? "")], ...(currentData as Record<string, unknown> || {}) });
        return;
      }

      if (action === "deep_content" || action === "book_podcast") {
        const entityId = String(payload?.entityId ?? "");
        if (!entityId) { res.json({ error: "No entity ID" }); return; }

        // Check cache first
        const { getProcessedContent, generateDeepContent } = await import("./deep-content.js");
        const cached = getProcessedContent(entityId);
        if (cached) {
          // Return cached podcast data
          const { buildEntityDetailData: buildDetail } = await import("./entity-model.js");
          const detailData = await buildDetail(entityId) || {};
          detailData.processedBook = cached;
          detailData.podcastAudioUrl = cached.audioUrl;
          detailData.podcastScript = cached.script;
          detailData.podcastDuration = cached.durationMinutes;
          detailData.podcastStatus = "ready";
          detailData.focusEntity = true;
          detailData.tool = "entity_detail";
          res.json(detailData);
          return;
        }

        // Auto-create entity if needed
        try {
          const { lookupEntity: lookupEnt3 } = await import("./entity-model.js");
          if (!lookupEnt3(entityId) && payload?.title) {
            const { ingestDiscoveredEntity: ingestEnt } = await import("./cortex-direct-ingest.js");
            await ingestEnt({ title: String(payload.title), type: String(payload.type || "book"), creator: payload.creator ? String(payload.creator) : undefined });
          }
        } catch { /* best effort */ }

        // Check if already in progress
        const existingProgress = deepContentProgress.get(entityId);
        if (existingProgress) {
          res.json({ podcastStatus: "processing", entityId, message: `${existingProgress.phase} ${existingProgress.percentComplete ?? ""}% — ${existingProgress.detail || "Working..."}`, phase: existingProgress.phase, percentComplete: existingProgress.percentComplete });
          return;
        }

        // Start tracking progress
        deepContentProgress.set(entityId, { phase: "starting", startedAt: Date.now() });

        // Respond immediately — pipeline runs in background
        res.json({ podcastStatus: "processing", entityId, message: `Starting deep podcast generation — this takes 15-30 minutes.` });

        // Fire-and-forget: generate podcast in background with progress tracking
        generateDeepContent({
          entityId,
          language: req.body?.language,
          onProgress: (p) => {
            deepContentProgress.set(entityId, { phase: p.phase, detail: p.detail, percentComplete: p.percentComplete, startedAt: deepContentProgress.get(entityId)?.startedAt || Date.now() });
          },
        })
          .then((processed) => {
            deepContentProgress.delete(entityId);
            logAction({ ts: Date.now(), type: "action", category: "cortex-action", message: `Deep content complete for ${entityId}: ${processed.durationMinutes} min` });
          })
          .catch((err) => {
            deepContentProgress.delete(entityId);
            logError("cortex-action", `Deep content failed for ${entityId}`, err);
          });
        return;
      }

      // ── Entity Share Email: send book/entity report + podcast via email ──
      if (action === "entity_share_email" || action === "book_share_email") {
        const p = payload || {};
        const recipient = String(p.recipient ?? "").trim();
        const entityId = String(p.entityId ?? "").trim();
        if (!recipient) { res.json({ error: "Recipient email required" }); return; }
        if (!entityId) { res.json({ error: "No entity ID" }); return; }

        try {
          const { getProcessedContent, buildEntityEmailHtml } = await import("./deep-content.js");
          const processed = getProcessedContent(entityId);
          if (!processed) {
            res.json({ error: "Book not yet processed. Generate the podcast first." });
            return;
          }

          const tunnelUrl = process.env.ENSO_TUNNEL_URL || `https://${req.hostname === "localhost" ? "pc1.enso.net" : req.hostname}`;
          const html = buildEntityEmailHtml(processed, tunnelUrl);

          const { sendHtmlEmail } = await import("./email.js");
          const result = await sendHtmlEmail({
            to: recipient,
            from: "Enso AI <noreply@enso.ai>",
            subject: `📚 ${processed.title} by ${processed.author} — ${processed.durationMinutes} min AI Podcast`,
            html,
            textFallback: `${processed.title} by ${processed.author}\n\n${processed.research.coreThesis}`,
          });

          logAction({ ts: Date.now(), type: "action", category: "action:book-email", message: `Book email sent for "${processed.title}" to ${recipient}` });
          res.json({ success: result.success, message: result.message });
        } catch (err) {
          logError("action:book-email", "Email failed", err);
          res.json({ error: `Email failed: ${err instanceof Error ? err.message : String(err)}` });
        }
        return;
      }

      if (action === "share_wechat") {
        const p = payload || {};
        const content = String(p.content ?? "").trim();
        if (!content) { res.json({ error: "No content to share" }); return; }

        try {
          const { sendTextMessage, sendArticle, getFollowerOpenIds } = await import("./wechat.js");
          const followers = await getFollowerOpenIds();
          if (followers.length === 0) { res.json({ error: "No WeChat followers. Follow the test account first." }); return; }

          // If article HTML is provided, publish as a rich article; otherwise send as text
          const articleHtml = p.articleHtml ? String(p.articleHtml) : undefined;
          const title = p.title ? String(p.title) : undefined;
          const coverUrl = p.coverUrl ? String(p.coverUrl) : undefined;
          const author = p.author ? String(p.author) : undefined;

          let result;
          if (articleHtml && title) {
            logAction({ ts: Date.now(), type: "action", category: "wechat", message: `Publishing article to WeChat: ${title}` });
            result = await sendArticle(followers[0], { title, author, content: articleHtml, coverUrl });
          } else {
            result = await sendTextMessage(followers[0], content);
          }
          logAction({ ts: Date.now(), type: "action", category: "wechat", message: `Cortex share to WeChat: ${(title || content).slice(0, 50)}` });
          res.json(result);
        } catch (err) {
          logError("wechat", "Cortex share_wechat failed", err);
          res.json({ error: `WeChat send failed: ${err instanceof Error ? err.message : String(err)}` });
        }
        return;
      }

      // For tool-based actions (browse, search, add, etc.) — run via executor
      const toolSuffix = action;
      const { getExecutorBody, isDynamicTool } = await import("./native-tools/registry.js");

      // Try different tool ID patterns
      const candidates = [
        `enso_${appFamily}_${toolSuffix}`,
        `enso_${appFamily.replace(/_/g, "_")}_${toolSuffix}`,
      ];
      let toolId = "";
      for (const c of candidates) { if (isDynamicTool(c)) { toolId = c; break; } }

      if (toolId) {
        const body = getExecutorBody(toolId);
        if (body) {
          const { executeToolBody } = await import("./app-persistence.js");
          const result = await executeToolBody(body, payload || {});
          if (result?.content?.[0]?.text) {
            try { res.json(JSON.parse(result.content[0].text)); return; } catch { /* fall through */ }
          }
          res.json(result || {});
          return;
        }
      }

      res.json({ error: `Unknown action: ${action}`, action, appFamily });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── App Tool Runner API (for Cortex tab — runs app tools directly) ──
  app.post("/api/apps/run", async (req, res) => {
    try {
      const toolId = req.query.tool as string;
      if (!toolId) { res.status(400).json({ error: "Missing tool parameter" }); return; }

      const { getExecutorBody, isDynamicTool } = await import("./native-tools/registry.js");
      if (!isDynamicTool(toolId)) {
        res.status(404).json({ error: `Tool not found: ${toolId}`, tool: toolId });
        return;
      }

      const body = getExecutorBody(toolId);
      if (!body) {
        res.status(404).json({ error: `No executor body for: ${toolId}` });
        return;
      }

      // Execute using the app-persistence executor runner
      const { executeToolBody } = await import("./app-persistence.js");
      const params = req.body || {};
      const result = await executeToolBody(body, params);

      // Extract data from AgentToolResult format
      if (result?.content?.[0]?.text) {
        try {
          const parsed = JSON.parse(result.content[0].text);
          res.json(parsed);
          return;
        } catch { /* fall through */ }
      }
      res.json(result || {});
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Podcast Streaming API (for email sharing) ──
  app.get("/api/podcast/stream/:slug", (req, res) => {
    const slug = decodeURIComponent(req.params.slug).replace(/[^\p{L}\p{N}_-]/gu, "");
    const audioDir = join(homedir(), ".enso", "data", "deep-content", "audio");
    // Prefer MP3 (mobile-compatible, much smaller)
    const mp3Path = join(audioDir, `${slug}.mp3`);
    const wavPath = join(audioDir, `${slug}.wav`);
    const audioPath = existsSync(mp3Path) ? mp3Path : wavPath;
    const isMp3 = audioPath.endsWith(".mp3");
    if (!existsSync(audioPath)) {
      res.status(404).json({ error: "Podcast not found" });
      return;
    }
    const stat = statSync(audioPath);
    res.setHeader("Content-Type", isMp3 ? "audio/mpeg" : "audio/wav");
    res.setHeader("Content-Length", stat.size);
    const ext = isMp3 ? ".mp3" : ".wav";
    const safeFilename = slug.replace(/[^\x20-\x7E]/g, "_");
    res.setHeader("Content-Disposition", `inline; filename="${safeFilename}${ext}"; filename*=UTF-8''${encodeURIComponent(slug)}${ext}`);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Accept-Ranges", "bytes");
    // Support Range requests for seek/scrub on mobile
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": end - start + 1,
      });
      createReadStream(audioPath, { start, end }).pipe(res);
    } else {
      createReadStream(audioPath).pipe(res);
    }
  });

  // Podcast metadata API (for email link previews)
  app.get("/api/podcast/info/:slug", async (req, res) => {
    try {
      const slug = decodeURIComponent(req.params.slug).replace(/[^\p{L}\p{N}_-]/gu, "");
      const metaPath = join(homedir(), ".enso", "data", "deep-content", `${slug}.json`);
      if (!existsSync(metaPath)) {
        res.status(404).json({ error: "Podcast not found" });
        return;
      }
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      res.json({
        title: meta.title,
        author: meta.author,
        durationMinutes: meta.durationMinutes,
        processedAt: meta.processedAt,
        streamUrl: `/api/podcast/stream/${slug}`,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Action Log API (for Claude Code review) ──
  app.get("/api/action-log", (req, res) => {
    const count = Math.min(Math.max(parseInt(req.query.count as string) || 100, 1), 500);
    const typeFilter = (req.query.type as string) || undefined;
    res.json(getRecentLog(count, typeFilter));
  });

  // ── Entity Index API ──
  app.get("/api/entities", async (req, res) => {
    try {
      const { getEntityIndex, getEntitiesBySource, getEntitiesByType, lookupEntity } = await import("./entity-model.js");
      const source = req.query.source as string | undefined;
      const type = req.query.type as string | undefined;
      const id = req.query.id as string | undefined;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 500);

      if (id) {
        const entity = lookupEntity(id);
        return res.json(entity ?? { error: "Entity not found" });
      }
      if (source) return res.json(getEntitiesBySource(source as never, limit));
      if (type) return res.json(getEntitiesByType(type as never, limit));
      // Default: return index stats
      const index = getEntityIndex();
      const stats: Record<string, number> = {};
      for (const e of index.values()) stats[e.source] = (stats[e.source] || 0) + 1;
      return res.json({ totalEntities: index.size, bySource: stats });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Cortex Import API (direct trigger) ──
  app.post("/api/cortex-import", async (_req, res) => {
    try {
      const { ingestFromDataSources } = await import("./cortex-tools.js");
      logAction({ ts: Date.now(), type: "action", category: "cortex", message: "Cortex import triggered via API" });
      const result = await ingestFromDataSources();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Cortex Direct Ingest API (per-item pages, no LLM cost) ──
  app.post("/api/cortex-direct-ingest", async (req, res) => {
    try {
      const { directIngestFromSources } = await import("./cortex-direct-ingest.js");
      const sourceIds = (req.query.sources as string)?.split(",").filter(Boolean);
      const forceUpdate = req.query.force === "true";
      const result = await directIngestFromSources({ sourceIds, forceUpdate });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Cortex Enrichment API — backfill semantic tags + cross-references ──
  app.post("/api/cortex-enrich", async (req, res) => {
    try {
      // Mode: re-enrich — process under-connected entities
      if (req.query.mode === "re-enrich") {
        const maxEntities = parseInt(req.query.limit as string) || 200;
        const { reEnrichStaleEntities } = await import("./cortex-enrichment.js");
        const result = await reEnrichStaleEntities(maxEntities);
        res.json(result);
        return;
      }

      const { enrichNewEntities, crossReferenceNewEntities } = await import("./cortex-enrichment.js");
      const { getEntityIndex } = await import("./entity-model.js");
      const index = getEntityIndex();

      // Collect entities that need enrichment (no semanticTags yet), interleaved by source
      const bySource = new Map<string, string[]>();
      for (const [id, entry] of index) {
        if (!entry.semanticTags?.length) {
          const src = entry.source || "unknown";
          if (!bySource.has(src)) bySource.set(src, []);
          bySource.get(src)!.push(id);
        }
      }
      // Interleave: take one from each source in round-robin for diverse batches
      const entityIds: string[] = [];
      const sources = [...bySource.values()];
      const maxLen = Math.max(...sources.map(s => s.length), 0);
      for (let i = 0; i < maxLen; i++) {
        for (const arr of sources) {
          if (i < arr.length) entityIds.push(arr[i]);
        }
      }
      const limit = parseInt(req.query.limit as string) || entityIds.length;
      const batch = entityIds.slice(0, limit);

      logAction({ ts: Date.now(), type: "action", category: "cortex-enrichment", message: `Backfill enrichment: ${batch.length} of ${entityIds.length} entities` });

      const tagResult = await enrichNewEntities(batch);
      const xrefResult = await crossReferenceNewEntities(batch);

      // Level 4: YouTube video recommendations (separate pass — uses entities needing videos)
      const { recommendVideosForEntities } = await import("./cortex-enrichment.js");
      const videoType = req.query.videoType as string | undefined;
      const needVideos: string[] = [];
      for (const [id, entry] of index) {
        if (!entry.recommendedVideos?.length && entry.source !== "youtube") {
          // Skip unmatched movies (raw files without TMDB genre data)
          if (entry.source === "movies_tv") {
            const genres = (entry.tags || []).filter(t => t !== "movie" && t !== "tv-series" && t !== "documentary" && t !== "video");
            if (genres.length === 0) continue;
          }
          if (videoType && entry.type !== videoType) continue;
          needVideos.push(id);
        }
      }
      const videoLimit = Math.min(parseInt(req.query.videoLimit as string) || 100, needVideos.length);
      const videoResult = await recommendVideosForEntities(needVideos.slice(0, videoLimit));

      res.json({
        totalUnenriched: entityIds.length,
        processed: batch.length,
        enriched: tagResult.enriched,
        crossRefsCreated: xrefResult.refsCreated,
        videosMatched: videoResult.matched,
        videosRemaining: needVideos.length - videoLimit,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── Daily Book Recommendation Pipeline API ──
  // Discovers a new book based on Cortex interests, generates deep podcast, sends email
  app.post("/api/book-recommendation/daily", async (req, res) => {
    try {
      const { discoverNewBooks, generateDeepContent, buildEntityEmailHtml } = await import("./deep-content.js");
      const { ingestDiscoveredEntity } = await import("./cortex-direct-ingest.js");
      const { sendHtmlEmail } = await import("./email.js");

      // Determine language from request or default
      const reqLanguage = (req.query.language as string) || (req.body?.language as string) || undefined;
      logAction({ ts: Date.now(), type: "action", category: "book-recommendation", message: `Daily book discovery pipeline started [lang=${reqLanguage || "auto"}]` });

      // Step 1: Discover a new book via web search + LLM
      const discoveries = await discoverNewBooks(1, reqLanguage);
      if (!discoveries.length) {
        res.json({ success: false, message: "Could not discover a new book recommendation today — try again tomorrow" });
        return;
      }
      const book = discoveries[0];
      logAction({ ts: Date.now(), type: "action", category: "book-recommendation", message: `Discovered: "${book.title}" by ${book.author} — ${book.whyRecommended}` });

      // Step 2: Create entity in Cortex (so deep content pipeline can resolve it)
      await ingestDiscoveredEntity({
        title: book.title,
        type: "book",
        source: "research",
        creator: book.author,
        year: book.year,
        description: book.description,
      });

      // Send immediate response (pipeline takes 15-30 min)
      res.json({
        success: true,
        message: `Discovered "${book.title}" by ${book.author} — generating podcast + email`,
        entityId: book.entityId,
        title: book.title,
        author: book.author,
        whyRecommended: book.whyRecommended,
      });

      // Step 3: Generate deep content (runs in background)
      const processed = await generateDeepContent({
        entityId: book.entityId,
        language: reqLanguage,
        onProgress: (p) => {
          logAction({ ts: Date.now(), type: "action", category: "book-recommendation", message: `${book.title}: ${p.phase} (${p.percentComplete}%)` });
        },
      });

      logAction({ ts: Date.now(), type: "action", category: "book-recommendation", message: `Podcast generated: ${book.title} — ${processed.durationMinutes} min` });

      // Step 4: Build and send email with podcast + Add to Cortex button
      const baseUrl = `https://${req.hostname === "localhost" ? "pc1.enso.net" : req.hostname}`;
      const emailHtml = buildEntityEmailHtml(processed, baseUrl, reqLanguage);
      const emailResult = await sendHtmlEmail({
        to: "kkwong@xiaomi.com",
        from: "Enso AI <noreply@enso.ai>",
        subject: `📚 ${book.title} by ${book.author} — ${processed.durationMinutes} min AI Podcast`,
        html: emailHtml,
      });

      logAction({ ts: Date.now(), type: "action", category: "book-recommendation", message: `Email sent: ${emailResult.success ? "✅" : "❌"} ${emailResult.message}` });
    } catch (err) {
      logError("book-recommendation", "Daily pipeline failed", err);
      // Response already sent if we got past step 1
    }
  });

  // ── Universal Content Recommendation Pipeline API ──
  // Discovers new content of any type based on Cortex interests, generates deep podcast, sends email
  app.post("/api/content-recommendation/daily", async (req, res) => {
    const contentType = (req.query.type as string) || (req.body?.type as string) || "movie";
    const reqLanguage = (req.query.language as string) || (req.body?.language as string) || undefined;

    try {
      const { discoverNewBooks, generateDeepContent, buildEntityEmailHtml } = await import("./deep-content.js");
      const { ingestDiscoveredEntity } = await import("./cortex-direct-ingest.js");
      const { enrichEntity } = await import("./content-enrichment.js");
      const { sendHtmlEmail } = await import("./email.js");
      const { llm } = await import("./llm.js");
      const { braveWebSearch } = await import("./researcher-tools.js");

      logAction({ ts: Date.now(), type: "action", category: "content-recommendation", message: `Daily ${contentType} recommendation pipeline started [lang=${reqLanguage || "auto"}]` });

      // Read Cortex themes
      const { existsSync: ex, readFileSync: rf } = await import("node:fs");
      const { join: jn } = await import("node:path");
      const { homedir: hd } = await import("node:os");
      let topThemes: string[] = [];
      try {
        const indexPath = jn(hd(), ".enso", "wiki", "_index.md");
        if (ex(indexPath)) {
          const idx = rf(indexPath, "utf-8");
          const themeCounts: Record<string, number> = {};
          for (const m of idx.matchAll(/Themes:\s*(.+)/g)) {
            m[1].split(",").forEach(t => { const theme = t.trim().toLowerCase(); if (theme) themeCounts[theme] = (themeCounts[theme] || 0) + 1; });
          }
          topThemes = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
        }
      } catch { /* ignore */ }
      if (!topThemes.length) topThemes = ["technology", "science", "history", "leadership"];

      // Collect existing titles to exclude
      const existingTitles = new Set<string>();
      try {
        const eiPath = jn(hd(), ".enso", "data", "entity-index.json");
        if (ex(eiPath)) {
          const idx = JSON.parse(rf(eiPath, "utf-8"));
          for (const entry of Object.values(idx) as Array<{ type?: string; title?: string }>) {
            if (entry.type === contentType || entry.type === "movie" || entry.type === "tv-series") {
              if (entry.title) existingTitles.add(entry.title.toLowerCase());
            }
          }
        }
      } catch { /* ignore */ }

      // Type-specific search queries
      const isChinese = reqLanguage === "zh";
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
      const themeOffset = dayOfYear % Math.max(1, topThemes.length - 2);
      const searchThemes = topThemes.slice(themeOffset, themeOffset + 3);

      const queryTemplates: Record<string, string[]> = {
        movie: isChinese
          ? [`2024 2025 必看电影推荐 ${searchThemes[0]}`, `豆瓣高分电影 ${searchThemes.slice(0, 2).join(" ")}`, `值得一看的好电影 深度`]
          : [`best movies ${searchThemes.slice(0, 2).join(" ")} 2024 2025 recommendations`, `must watch films ${searchThemes[0]} thought provoking`, `critically acclaimed movies ${searchThemes[1] || "drama"}`],
        game: [`best games ${searchThemes[0]} 2024 2025`, `must play games ${searchThemes.slice(0, 2).join(" ")}`, `critically acclaimed games deep narrative`],
        channel: [`best youtube channels ${searchThemes[0]} educational`, `top youtube creators ${searchThemes.slice(0, 2).join(" ")} 2024`, `underrated youtube channels ${searchThemes[1] || "science"}`],
        article: isChinese
          ? [`${searchThemes[0]} 最新深度文章 2025 2026`, `${searchThemes.slice(0, 2).join(" ")} 重磅分析`, `科技商业 深度报道 值得一读`]
          : [`best ${searchThemes[0]} articles 2025 2026 in-depth`, `${searchThemes.slice(0, 2).join(" ")} analysis longread`, `thought provoking ${searchThemes[1] || "technology"} article must read`],
        place: isChinese
          ? [`${searchThemes[0]} 旅行目的地推荐 小众`, `值得一去的地方 文化 摄影`, `深度旅行 独特体验 2025`]
          : [`hidden gem travel destinations ${searchThemes[0]}`, `best places to visit ${searchThemes.slice(0, 2).join(" ")} culture photography`, `unique travel experiences off the beaten path 2025`],
      };
      const queries = queryTemplates[contentType] || queryTemplates.movie;

      // Web search
      const allResults: Array<{ title: string; description: string; url: string }> = [];
      for (const q of queries) {
        try { allResults.push(...await braveWebSearch(q, 5)); } catch { /* ignore */ }
      }

      if (!allResults.length) {
        res.json({ success: false, message: `No web search results for ${contentType} recommendations` });
        return;
      }

      // LLM picks the best recommendation
      const existingList = [...existingTitles].slice(0, 50).join(", ");
      const typeLabel = { movie: "movie or TV show", game: "video game", channel: "YouTube channel" }[contentType] || contentType;
      const langRule = isChinese ? "\nCRITICAL: ALL output MUST be in Chinese (中文)." : "";

      const prompt = `You are a personal ${typeLabel} curator. Your client's interests: ${topThemes.join(", ")}.${langRule}

They already know these (DO NOT recommend): ${existingList || "none"}

Web search results about recommended ${typeLabel}s:
${allResults.slice(0, 10).map((r, i) => `[${i}] ${r.title}: ${r.description}`).join("\n")}

Pick 1 ${typeLabel} that would be most valuable. Return JSON:
{
  "title": "exact title",
  "creator": "director/developer/creator",
  "year": "year or null",
  "type": "${contentType === "movie" ? "movie" : contentType}",
  "description": "2-3 sentence description",
  "whyRecommended": "why this matches their interests"
}
Return ONLY JSON.`;

      const raw = await llm({ prompt, tier: "utility", timeoutMs: 30000 });
      const cleaned = raw.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
      const picked = JSON.parse(cleaned) as { title: string; creator?: string; year?: string; type?: string; description?: string; whyRecommended?: string };

      if (!picked.title) { res.json({ success: false, message: "LLM did not return a recommendation" }); return; }

      // Skip if too similar to existing
      if (existingTitles.has(picked.title.toLowerCase())) {
        res.json({ success: false, message: `"${picked.title}" already in library` });
        return;
      }

      const entityType = picked.type || contentType;
      logAction({ ts: Date.now(), type: "action", category: "content-recommendation", message: `Discovered ${entityType}: "${picked.title}" by ${picked.creator}` });

      // Ingest + enrich (await enrichment so metadata is available for podcast)
      const result = await ingestDiscoveredEntity({
        title: picked.title, type: entityType, source: "research",
        creator: picked.creator, year: picked.year, description: picked.description,
      });
      try { await enrichEntity(result.entityId); } catch { /* best effort */ }

      // Respond immediately
      res.json({ success: true, message: `Discovered "${picked.title}" — generating podcast + email`, entityId: result.entityId, title: picked.title, creator: picked.creator, type: entityType, whyRecommended: picked.whyRecommended });

      // Generate deep content + email in background
      try {
        const processed = await generateDeepContent({
          entityId: result.entityId, language: reqLanguage,
          onProgress: (p) => { logAction({ ts: Date.now(), type: "action", category: "content-recommendation", message: `${picked.title}: ${p.phase} (${p.percentComplete}%)` }); },
        });

        const baseUrl = `https://${req.hostname === "localhost" ? "pc1.enso.net" : req.hostname}`;
        const emailHtml = buildEntityEmailHtml(processed, baseUrl, reqLanguage);
        const typeEmoji = { movie: "🎬", game: "🎮", channel: "📺", article: "📰", place: "🌍" }[contentType] || "🎯";
        const creatorStr = picked.creator ? ` by ${picked.creator}` : "";
        await sendHtmlEmail({
          to: "kkwong@xiaomi.com",
          from: "Enso AI <noreply@enso.ai>",
          subject: `${typeEmoji} ${picked.title}${creatorStr} — ${processed.durationMinutes} min AI Podcast`,
          html: emailHtml,
        });
        logAction({ ts: Date.now(), type: "action", category: "content-recommendation", message: `Email sent for ${entityType} "${picked.title}"` });
      } catch (err) {
        logError("content-recommendation", `Pipeline failed for ${picked.title}`, err);
      }
    } catch (err) {
      logError("content-recommendation", `Daily ${contentType} pipeline failed`, err);
      if (!res.headersSent) res.json({ success: false, message: String((err as Error).message) });
    }
  });

  // ── Cortex Quick-Add API (for email links and external quick-add) ──
  app.get("/api/cortex/quick-add", async (req, res) => {
    const title = decodeURIComponent((req.query.title as string) || "");
    const type = decodeURIComponent((req.query.type as string) || "");
    if (!title || !type) {
      res.status(400).send(htmlPage("Missing Parameters", "Both title and type are required.", "error"));
      return;
    }
    try {
      const { ingestDiscoveredEntity } = await import("./cortex-direct-ingest.js");
      const result = await ingestDiscoveredEntity({
        title,
        type,
        creator: req.query.creator ? decodeURIComponent(req.query.creator as string) : undefined,
        year: req.query.year ? decodeURIComponent(req.query.year as string) : undefined,
        description: req.query.description ? decodeURIComponent(req.query.description as string) : undefined,
      });
      if (result.created) {
        // Auto-enrich with type-appropriate API metadata (await for rich page)
        try { const { enrichEntity } = await import("./content-enrichment.js"); await enrichEntity(result.entityId); } catch { /* best effort */ }

        // Read enriched data for rich display
        let coverUrl = "", desc = "";
        try {
          const idxPath = join(homedir(), ".enso", "data", "entity-index.json");
          const idx = JSON.parse(readFileSync(idxPath, "utf-8"));
          const entity = idx[result.entityId];
          if (entity?.imageUrl) coverUrl = entity.imageUrl;
          // Read description from Cortex page
          const pagePath = join(homedir(), ".enso", "wiki", result.cortexPath);
          if (existsSync(pagePath)) {
            const content = readFileSync(pagePath, "utf-8");
            const descMatch = content.match(/## Overview\n\n([\s\S]*?)(?=\n## )/);
            if (descMatch) desc = descMatch[1].trim().slice(0, 300);
          }
        } catch { /* ignore */ }

        const typeEmoji: Record<string, string> = { book: "📚", movie: "🎬", "tv-series": "📺", game: "🎮", channel: "📺", article: "📰", place: "🌍" };
        const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        let body = `<div style="text-align:center;padding:20px">`;
        body += `<div style="font-size:48px;margin-bottom:12px">✅</div>`;
        body += `<h1 style="font-size:22px;color:#10b981;margin-bottom:4px">Added to Cortex</h1>`;
        body += `</div>`;
        body += `<div class="card" style="display:flex;gap:16px;align-items:start">`;
        if (coverUrl) body += `<img src="${esc(coverUrl)}" style="width:100px;border-radius:6px;flex-shrink:0" />`;
        body += `<div style="flex:1;min-width:0">`;
        body += `<div class="badge" style="background:#312e81;color:#c4b5fd;margin-bottom:6px">${typeEmoji[type] || "🎯"} ${type}</div>`;
        body += `<h2 style="font-size:18px;margin:4px 0;color:#e2e8f0">${esc(title)}</h2>`;
        if (req.query.creator) body += `<p style="color:#94a3b8;font-size:13px;margin:2px 0">by ${esc(decodeURIComponent(req.query.creator as string))}</p>`;
        if (desc) body += `<p style="color:#64748b;font-size:12px;margin-top:8px;line-height:1.5">${esc(desc)}</p>`;
        body += `</div></div>`;
        body += `<div style="text-align:center;margin-top:20px">`;
        body += `<p style="color:#6b7280;font-size:13px;margin-bottom:12px">Entity enriched and saved to your Knowledge Cortex.</p>`;
        body += `</div>`;
        body += `<div class="footer">Enso AI</div>`;
        res.send(htmlShell(`Added: ${title}`, body));
      } else {
        let body = `<div style="text-align:center;padding:40px">`;
        body += `<div style="font-size:48px;margin-bottom:12px">ℹ️</div>`;
        body += `<h1 style="font-size:22px;color:#3b82f6">Already in Cortex</h1>`;
        body += `<p style="color:#94a3b8;font-size:14px;margin-top:8px">"${title}" already exists in your Knowledge Cortex.</p>`;
        body += `</div>`;
        res.send(htmlShell(`${title} — Already in Cortex`, body));
      }
    } catch (err) {
      res.status(500).send(htmlPage("Error", `Failed to add "${title}": ${err instanceof Error ? err.message : String(err)}`, "error"));
    }
  });

  // ── YouTube Unsubscribe API (for email links) ──
  app.get("/api/youtube/unsubscribe", async (req, res) => {
    const channelId = req.query.channelId as string | undefined;
    const channelName = decodeURIComponent((req.query.channelName as string) || "");
    if (!channelId) {
      res.status(400).send(htmlPage("Missing channelId", "No channel ID provided.", "error"));
      return;
    }
    try {
      const { createYouTubeTools } = await import("./youtube-tools.js");
      const tools = createYouTubeTools();
      const unsubTool = tools.find((t) => t.name === "enso_youtube_unsubscribe");
      if (!unsubTool) throw new Error("YouTube unsubscribe tool not available");
      const rawResult = await unsubTool.execute("api-unsub", { channelIds: [channelId] });
      // Tool returns AgentToolResult: { content: [{ type: "text", text: "..." }] }
      // Extract the JSON text from the content array
      let parsed: Record<string, unknown>;
      if (rawResult?.content?.[0]?.text) {
        parsed = JSON.parse(rawResult.content[0].text);
      } else if (typeof rawResult === "string") {
        parsed = JSON.parse(rawResult);
      } else {
        parsed = rawResult as Record<string, unknown>;
      }
      if ((parsed.unsubscribed as string[])?.length > 0) {
        const name = channelName || (parsed.unsubscribed as string[])[0];
        let body = `<div style="text-align:center;padding:40px 20px">`;
        body += `<div style="font-size:48px;margin-bottom:12px">✅</div>`;
        body += `<h1 style="font-size:22px;color:#10b981">Unsubscribed</h1>`;
        body += `<p style="color:#94a3b8;font-size:14px;margin:12px 0">Successfully unsubscribed from <strong style="color:#e2e8f0">${name}</strong>.</p>`;
        body += `<p style="color:#6b7280;font-size:13px">This channel will no longer appear in your daily picks.</p>`;
        body += `</div>`;
        body += `<div class="footer">Enso AI</div>`;
        res.send(htmlShell(`Unsubscribed: ${name}`, body));
      } else {
        res.send(htmlPage(
          "Could not unsubscribe",
          (parsed.errors as string[])?.join(", ") || "Channel not found in your subscriptions.",
          "error",
        ));
      }
    } catch (err) {
      res.status(500).send(htmlPage("Error", `Failed: ${err instanceof Error ? err.message : String(err)}`, "error"));
    }
  });

  /** Base HTML shell for rich landing pages */
  function htmlShell(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Enso AI</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#0f0f23;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;min-height:100vh}
.container{max-width:640px;margin:0 auto;padding:24px}
.card{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:12px;padding:20px;margin-bottom:16px}
.btn{display:inline-block;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;cursor:pointer;border:none;transition:opacity 0.2s}
.btn:hover{opacity:0.85}
.btn-primary{background:#7c3aed;color:white}
.btn-success{background:#059669;color:white}
.btn-outline{background:transparent;color:#94a3b8;border:1px solid #374151}
.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600}
h1{margin:0 0 8px}h2{margin:16px 0 8px;font-size:16px;color:#a78bfa}
audio{width:100%;margin:12px 0;border-radius:8px}
.meta{font-size:13px;color:#94a3b8;line-height:1.6}
.cover{max-width:240px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4)}
.insight{background:#1e1b4b;border-left:3px solid #7c3aed;padding:8px 12px;margin:6px 0;border-radius:0 6px 6px 0;font-size:13px}
.chapter{padding:6px 0;border-bottom:1px solid #1e1e3a;font-size:13px}
.footer{text-align:center;font-size:11px;color:#475569;margin-top:32px;padding-top:16px;border-top:1px solid #1e1e3a}
</style></head><body><div class="container">${bodyHtml}</div></body></html>`;
  }

  function htmlPage(title: string, message: string, type: "success" | "error"): string {
    const color = type === "success" ? "#10b981" : "#ef4444";
    const icon = type === "success" ? "✅" : "❌";
    return htmlShell(title, `
<div style="text-align:center;padding:60px 20px">
<div style="font-size:48px;margin-bottom:16px">${icon}</div>
<h1 style="font-size:24px;color:${color}">${title}</h1>
<p style="font-size:14px;color:#94a3b8;max-width:400px;margin:12px auto;line-height:1.5">${message}</p>
</div>`);
  }

  // ── Rich Podcast Player Page ──
  app.get("/api/podcast/play/:slug", async (req, res) => {
    try {
      const slug = decodeURIComponent(req.params.slug).replace(/[^\p{L}\p{N}_-]/gu, "");
      const metaPath = join(homedir(), ".enso", "data", "deep-content", `${slug}.json`);
      if (!existsSync(metaPath)) { res.status(404).send(htmlPage("Not Found", "Podcast not found.", "error")); return; }

      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      const r = meta.research || {};
      const streamUrl = `/api/podcast/stream/${slug}`;

      // Resolve cover image from entity index
      let coverUrl = "";
      let entityType = "book";
      try {
        const idxPath = join(homedir(), ".enso", "data", "entity-index.json");
        if (existsSync(idxPath)) {
          const idx = JSON.parse(readFileSync(idxPath, "utf-8"));
          const entity = idx[meta.entityId];
          if (entity?.imageUrl) coverUrl = entity.imageUrl;
          if (entity?.type) entityType = entity.type;
        }
      } catch { /* ignore */ }

      const typeEmoji: Record<string, string> = { book: "📚", movie: "🎬", "tv-series": "📺", game: "🎮", channel: "📺", article: "📰", place: "🌍" };
      const typeLabel: Record<string, string> = { book: "Book", movie: "Film", "tv-series": "TV Series", game: "Game", channel: "Channel", article: "Article", place: "Destination" };
      const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

      let body = "";

      // Header with cover
      body += `<div style="text-align:center;margin-bottom:20px">`;
      if (coverUrl) body += `<img src="${esc(coverUrl)}" alt="${esc(meta.title)}" class="cover" style="margin-bottom:16px" />`;
      body += `<div class="badge" style="background:#312e81;color:#c4b5fd;margin-bottom:8px">${typeEmoji[entityType] || "🎯"} ${typeLabel[entityType] || entityType}</div>`;
      body += `<h1 style="font-size:24px;color:#e2e8f0">${esc(meta.title)}</h1>`;
      if (meta.author && meta.author !== "Unknown") body += `<p style="color:#94a3b8;font-size:14px;margin:4px 0">by ${esc(meta.author)}</p>`;
      body += `<p style="color:#6b7280;font-size:13px">${meta.durationMinutes} min · ${r.chapterSummaries?.length || 0} chapters · ${r.keyInsights?.length || 0} insights</p>`;
      body += `</div>`;

      // Audio player
      body += `<div class="card" style="text-align:center">`;
      body += `<p style="color:#a78bfa;font-weight:600;margin:0 0 8px">🎙️ AI Podcast</p>`;
      body += `<audio controls preload="metadata" src="${streamUrl}" style="width:100%"></audio>`;
      body += `<p style="font-size:11px;color:#475569;margin:8px 0 0">Streaming from Enso · ${meta.durationMinutes} min</p>`;
      body += `</div>`;

      // Core Thesis
      if (r.coreThesis) {
        body += `<div class="card"><h2>💡 Core Thesis</h2><p class="meta">${esc(r.coreThesis)}</p></div>`;
      }

      // Key Insights
      if (r.keyInsights?.length > 0) {
        body += `<div class="card"><h2>🔑 Key Insights</h2>`;
        for (const ins of r.keyInsights.slice(0, 10)) {
          body += `<div class="insight">${esc(ins.insight)}`;
          if (ins.example) body += `<br><span style="color:#6b7280;font-style:italic;font-size:12px">${esc(ins.example)}</span>`;
          body += `</div>`;
        }
        body += `</div>`;
      }

      // Chapter Overview
      if (r.chapterSummaries?.length > 0) {
        body += `<div class="card"><h2>📑 Chapters</h2>`;
        for (const ch of r.chapterSummaries.slice(0, 15)) {
          body += `<div class="chapter"><strong style="color:#c4b5fd">${esc(ch.chapter)}</strong><br><span style="color:#94a3b8">${esc(ch.summary)}</span></div>`;
        }
        body += `</div>`;
      }

      // Critical Perspectives
      if (Array.isArray(r.criticalPerspectives) && r.criticalPerspectives.length > 0) {
        body += `<div class="card"><h2>⚖️ Different Perspectives</h2>`;
        for (const cp of r.criticalPerspectives) {
          const cpText = typeof cp === "string" ? cp : (cp as Record<string, unknown>)?.text || (cp as Record<string, unknown>)?.perspective || String(cp);
          body += `<p class="meta" style="padding:4px 0;border-bottom:1px solid #1e1e3a">• ${esc(cpText)}</p>`;
        }
        body += `</div>`;
      }

      // Resolve content URL (Read on Kindle/WeRead)
      let contentUrl = "";
      let contentLabel = "📖 Read";
      try {
        const entitySource = meta.entityId?.split(":")[0] || "";
        if (entitySource === "kindle") {
          const kindlePath = join(homedir(), ".enso", "data", "user-context", "cache", "kindle-library.json");
          if (existsSync(kindlePath)) {
            const kc = JSON.parse(readFileSync(kindlePath, "utf-8"));
            const book = kc.books?.find((b: Record<string, unknown>) => b.title === meta.title);
            if (book?.readerUrl) { contentUrl = String(book.readerUrl); contentLabel = "📖 Read on Kindle"; }
          }
        } else if (entitySource === "weread") {
          const wereadPath = join(homedir(), ".enso", "data", "user-context", "cache", "weread-library.json");
          if (existsSync(wereadPath)) {
            const wc = JSON.parse(readFileSync(wereadPath, "utf-8"));
            const book = wc.books?.find((b: Record<string, unknown>) => b.title === meta.title);
            if (book?.wereadBookId) {
              try {
                const { encodeWereadBookId } = await import("./entity-model.js");
                contentUrl = `https://weread.qq.com/web/bookDetail/${encodeWereadBookId(String(book.wereadBookId))}`;
              } catch {
                contentUrl = `https://weread.qq.com/web/bookDetail/${book.wereadBookId}`;
              }
              contentLabel = "📖 Read on WeRead";
            }
          }
        }
      } catch { /* ignore */ }

      // Actions
      const quickAddUrl = `/api/cortex/quick-add?title=${encodeURIComponent(meta.title)}&type=${encodeURIComponent(entityType)}&creator=${encodeURIComponent(meta.author || "")}`;
      body += `<div style="text-align:center;margin:24px 0">`;
      body += `<a href="${streamUrl}" download="${slug}.wav" class="btn btn-primary" style="margin:4px">⬇ Download Podcast</a> `;
      if (contentUrl) {
        body += `<a href="${contentUrl}" target="_blank" class="btn" style="margin:4px;background:#2563eb;color:white">${contentLabel}</a> `;
      }
      body += `<a href="${quickAddUrl}" class="btn btn-success" style="margin:4px">📥 Add to Cortex</a>`;
      body += `</div>`;

      body += `<div class="footer">Generated by Enso AI · ${new Date(meta.processedAt).toLocaleDateString()}</div>`;

      res.send(htmlShell(`${meta.title} — AI Podcast`, body));
    } catch (err) {
      res.status(500).send(htmlPage("Error", `Failed to load podcast: ${err instanceof Error ? err.message : String(err)}`, "error"));
    }
  });

  // ── Cortex Stats API ──
  let _cortexStatsCache: { data: unknown; ts: number } | null = null;
  app.get("/api/cortex-stats", async (_req, res) => {
    try {
      if (_cortexStatsCache && Date.now() - _cortexStatsCache.ts < 60_000) {
        res.json(_cortexStatsCache.data);
        return;
      }
      const { readIndex } = await import("./cortex-tools.js");
      const index = readIndex();
      const categories: Record<string, number> = {};
      for (const e of index) {
        const cat = e.path.split("/")[0] ?? "other";
        categories[cat] = (categories[cat] ?? 0) + 1;
      }
      const recentPages = [...index]
        .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""))
        .slice(0, 5)
        .map((e) => ({ path: e.path, title: e.title, summary: e.summary, updated: e.updated }));
      const data = { totalPages: index.length, categories, recentPages };
      _cortexStatsCache = { data, ts: Date.now() };
      res.json(data);
    } catch {
      res.json({ totalPages: 0, categories: {}, recentPages: [] });
    }
  });

  // ── Cortex Pulse — enrichment stats + insights for WelcomeCard ──
  app.get("/api/cortex-pulse", async (_req, res) => {
    try {
      const { getEntityIndex } = await import("./entity-model.js");
      const entityIndex = getEntityIndex();

      let withSemanticTags = 0, withCrossRefs = 0, withVideos = 0;
      let maxCrossRefs = 0;
      let topConnectionFrom: { title: string; source: string } | null = null;
      let topConnectionTo: { entityId: string; reason: string } | null = null;
      const tagCounts: Record<string, number> = {};

      for (const [, entry] of entityIndex) {
        if (entry.semanticTags?.length) {
          withSemanticTags++;
          for (const tag of entry.semanticTags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        }
        if (entry.crossReferences?.length) {
          withCrossRefs++;
          if (entry.crossReferences.length > maxCrossRefs) {
            maxCrossRefs = entry.crossReferences.length;
            topConnectionFrom = { title: entry.title, source: entry.source };
            topConnectionTo = entry.crossReferences[0];
          }
        }
        if ((entry as any).recommendedVideos?.length) withVideos++;
      }

      const totalEntities = entityIndex.size;
      const topSemanticTags = Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([tag, count]) => ({ tag, count }));

      // Build top connection info
      let topConnection: { from: string; to: string; reason: string } | null = null;
      if (topConnectionFrom && topConnectionTo) {
        const toEntry = entityIndex.get(topConnectionTo.entityId as any);
        topConnection = {
          from: topConnectionFrom.title,
          to: toEntry?.title ?? topConnectionTo.entityId,
          reason: topConnectionTo.reason,
        };
      }

      // Recent enrichment activity from action log
      let recentActivity: string[] = [];
      try {
        const { getRecentLog } = await import("./action-log.js");
        const logs = getRecentLog(20, "action");
        recentActivity = logs
          .filter(l => l.category === "cortex-enrichment")
          .slice(0, 3)
          .map(l => l.message);
      } catch { /* action log not available */ }

      res.json({
        totalEntities,
        enriched: { withSemanticTags, withCrossRefs, withVideos },
        topConnection,
        recentActivity,
        topSemanticTags,
      });
    } catch (err) {
      res.json({
        totalEntities: 0,
        enriched: { withSemanticTags: 0, withCrossRefs: 0, withVideos: 0 },
        topConnection: null,
        recentActivity: [],
        topSemanticTags: [],
      });
    }
  });

  // ── Focus Areas API ──
  app.get("/api/focus-areas", async (_req, res) => {
    try {
      const { loadFocusState } = await import("./focus-areas.js");
      const state = loadFocusState();
      res.json(state || { areas: [], lastInferredAt: "", lastRefreshedAt: "", version: 0 });
    } catch (err) {
      res.json({ areas: [], lastInferredAt: "", lastRefreshedAt: "", version: 0 });
    }
  });

  app.post("/api/focus-areas/infer", async (_req, res) => {
    try {
      const { inferFocusAreas } = await import("./focus-areas.js");
      const state = await inferFocusAreas();
      res.json(state);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Inference failed" });
    }
  });

  app.post("/api/focus-areas/refresh", async (_req, res) => {
    try {
      const { refreshFocusProgress } = await import("./focus-areas.js");
      const state = await refreshFocusProgress();
      res.json(state || { areas: [] });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Refresh failed" });
    }
  });

  app.patch("/api/focus-areas/:id", async (req, res) => {
    try {
      const { updateFocusArea } = await import("./focus-areas.js");
      const area = updateFocusArea(req.params.id, req.body);
      if (!area) { res.status(404).json({ error: "Focus area not found" }); return; }
      // Register focus provider when a conversationId is assigned
      if (req.body.conversationId && area.conversationId) {
        import("./focus-areas.js").then(({ registerFocusProvider }) => {
          registerFocusProvider(area.id, area.conversationId!).catch(() => {});
        }).catch(() => {});
      }
      res.json(area);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Update failed" });
    }
  });

  app.delete("/api/focus-areas/:id", async (req, res) => {
    try {
      const { deleteFocusArea } = await import("./focus-areas.js");
      const ok = deleteFocusArea(req.params.id);
      if (!ok) { res.status(404).json({ error: "Focus area not found" }); return; }
      res.json({ deleted: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Delete failed" });
    }
  });

  app.post("/api/focus-areas", async (req, res) => {
    try {
      const { addFocusArea } = await import("./focus-areas.js");
      const area = addFocusArea(req.body);
      res.json(area);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Create failed" });
    }
  });

  app.post("/api/focus-areas/:id/prepare", async (req, res) => {
    try {
      const { prepareFocusArea } = await import("./focus-areas.js");
      // Find a connected client to receive orchestration progress
      const firstClient = clients.values().next().value as ConnectedClient | undefined;
      const result = await prepareFocusArea(req.params.id, firstClient, account);
      if (!result) { res.status(404).json({ error: "Focus area not found" }); return; }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Preparation failed" });
    }
  });

  // Get conversation transcript for a focus area (used for Evolve sprint brief)
  app.get("/api/focus-areas/:id/transcript", async (req, res) => {
    try {
      const { loadFocusState } = await import("./focus-areas.js");
      const state = loadFocusState();
      const area = state?.areas.find((a: { id: string }) => a.id === req.params.id);
      if (!area?.conversationId) { res.json({ transcript: "" }); return; }

      // Search ALL client directories for this conversation (not just connected clients)
      const { loadCardHistory } = await import("./memory-bridge.js");
      const { readdirSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { homedir } = await import("node:os");
      const cardsRoot = join(homedir(), ".enso", "cards");
      let transcript = "";

      try {
        const clientDirs = readdirSync(cardsRoot);
        // Find client with the MOST records for this conversation
        let bestRecords: Array<{ text?: string; role?: string; timestamp?: number }> = [];
        for (const clientId of clientDirs) {
          const records = loadCardHistory(clientId, area.conversationId, 100);
          if (records.length > bestRecords.length) bestRecords = records;
        }

        // Filter to only messages from the LATEST discussion round
        // (after the last sprint or preparation, whichever is more recent)
        const lastCycleTs = Math.max(
          area.lastSprintDate ? new Date(area.lastSprintDate).getTime() : 0,
          area.preparedAt ? new Date(area.preparedAt).getTime() : 0,
        );
        const recentRecords = lastCycleTs > 0
          ? bestRecords.filter((r: any) => !r.timestamp || r.timestamp > lastCycleTs)
          : bestRecords;

        // Use recent records if available, fallback to last 20 messages
        const finalRecords = recentRecords.length > 0 ? recentRecords : bestRecords.slice(-20);

        if (finalRecords.length > 0) {
          transcript = finalRecords
            .filter((r) => r.text?.trim())
            .map((r) => `${r.role === "user" ? "User" : "Enso"}: ${r.text}`)
            .join("\n\n");
        }
      } catch { /* cards dir doesn't exist */ }

      res.json({ transcript });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to load transcript" });
    }
  });

  // Absorb conversation insights into focus area description/intent before Evolve
  app.post("/api/focus-areas/:id/absorb-conversation", async (req, res) => {
    try {
      const { loadFocusState, saveFocusState } = await import("./focus-areas.js");
      const state = loadFocusState();
      const area = state?.areas.find((a: { id: string }) => a.id === req.params.id);
      if (!area?.conversationId) { res.json({ updated: false, reason: "No conversation" }); return; }

      // Load transcript
      const { loadCardHistory } = await import("./memory-bridge.js");
      const { readdirSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { homedir } = await import("node:os");
      const cardsRoot = join(homedir(), ".enso", "cards");
      let transcript = "";
      try {
        // Find the client with the MOST records for this conversation
        let bestRecords: Array<{ text?: string; role?: string }> = [];
        for (const clientId of readdirSync(cardsRoot)) {
          const records = loadCardHistory(clientId, area.conversationId, 100);
          if (records.length > bestRecords.length) bestRecords = records;
        }
        if (bestRecords.length > 0) {
          transcript = bestRecords
            .filter((r) => r.text?.trim() && r.role === "user")
            .map((r) => r.text)
            .join("\n");
        }
      } catch { /* ignore */ }

      if (!transcript.trim()) { res.json({ updated: false, reason: "No user messages found" }); return; }

      // Truncate transcript to avoid LLM context issues
      const trimmedTranscript = transcript.slice(0, 3000);

      // Use LLM to revise focus area based on conversation
      const { llm } = await import("./llm.js");
      const revised = await llm({
        prompt: `Rewrite a user's focus area to fully incorporate what they revealed in a strategic discussion. The revised version should sound like the user wrote it themselves — specific, personal, grounded in what they actually said.

CURRENT focus area:
- Title: "${area.title}"
- Description: "${area.description}"
- Intent: "${area.intent || "not set"}"
- Deeper motivation: "${area.deeperIntent || "not set"}"

WHAT THE USER SAID (their own words):
${trimmedTranscript}

INSTRUCTIONS: Rewrite ALL fields to incorporate the user's specific insights. The description and intent should reflect what they actually want to do (not generic platitudes). Extract concrete next steps from what they discussed. For example, if they talked about "learning from elite photographers" or "compiling photo albums for friends", those should appear in the revised fields.

Return JSON:
{"description":"rewritten to reflect what user actually described","intent":"rewritten to reflect the specific outcome they want","deeperIntent":"rewritten with the personal motivation they revealed","nextSteps":["concrete step from conversation","another concrete step"],"clarity":"developing or clear based on how specific they got"}`,
        tier: "fast",
        maxOutputTokens: 2000,
        temperature: 0.2,
      });

      let result: { description?: string; intent?: string; deeperIntent?: string; nextSteps?: string[]; clarity?: string };
      try {
        // Extract JSON from response — try multiple strategies
        let jsonStr = revised.trim();
        // Strategy 1: extract from markdown code block
        const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
        // Strategy 2: find outermost { ... }
        const braceStart = jsonStr.indexOf("{");
        const braceEnd = jsonStr.lastIndexOf("}");
        if (braceStart >= 0 && braceEnd > braceStart) {
          jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
        }
        result = JSON.parse(jsonStr);
      } catch (parseErr) {
        logError("focus-areas", "absorb JSON parse failed", parseErr, { rawResponse: revised.slice(0, 500) });
        res.json({ updated: false, reason: "LLM returned invalid JSON" });
        return;
      }

      let changed = false;
      if (result.description && result.description !== area.description) { area.description = result.description; changed = true; }
      if (result.intent && result.intent !== area.intent) { area.intent = result.intent; changed = true; }
      if (result.deeperIntent && result.deeperIntent !== area.deeperIntent) { area.deeperIntent = result.deeperIntent; changed = true; }
      if (result.nextSteps?.length) { area.nextSteps = result.nextSteps; changed = true; }
      if (result.clarity && ["emerging", "developing", "clear"].includes(result.clarity)) {
        const order = ["emerging", "developing", "clear"];
        if (order.indexOf(result.clarity) >= order.indexOf(area.clarity)) {
          area.clarity = result.clarity as typeof area.clarity;
          changed = true;
        }
      }

      if (changed) {
        area.updatedAt = new Date().toISOString();
        area.refinements.push({
          date: area.updatedAt,
          source: "conversation",
          change: "Absorbed conversation insights before Evolve sprint",
        });
        saveFocusState(state!);

        // Extract entity connections from conversation (non-blocking)
        (async () => {
          try {
            const { getEntityIndex, lookupEntity, upsertEntityIndex, saveEntityIndex } = await import("./entity-model.js");
            const { buildEntityInventory } = await import("./cortex-enrichment.js");
            const inventory = buildEntityInventory(getEntityIndex(), 300);
            if (!inventory) return;

            const linksResponse = await llm({
              prompt: `Given this conversation about the focus area "${area.title}", identify entity connections that should be cross-referenced in the knowledge graph.

Conversation excerpt:
${trimmedTranscript.slice(0, 2000)}

Available entities:
${inventory}

Return JSON array of entity pairs that the conversation reveals as connected:
[{ "from": "entityId1", "to": "entityId2", "reason": "brief explanation of connection discussed" }]

Only include connections explicitly discussed or strongly implied. Return [] if none found. Return ONLY the JSON array.`,
              tier: "fast",
              maxOutputTokens: 500,
              temperature: 0.2,
            });

            const links = JSON.parse(linksResponse.replace(/```json?\s*/g, "").replace(/```/g, "").trim()) as Array<{ from: string; to: string; reason: string }>;
            let created = 0;
            for (const link of links) {
              if (!link.from || !link.to || !link.reason) continue;
              const fromEntry = lookupEntity(link.from);
              const toEntry = lookupEntity(link.to);
              if (!fromEntry || !toEntry) continue;
              if (fromEntry.source === toEntry.source) continue;
              // Add bidirectional cross-reference
              const fromRefs = fromEntry.crossReferences || [];
              if (!fromRefs.some(r => r.entityId === link.to)) {
                upsertEntityIndex({ ...fromEntry, crossReferences: [...fromRefs, { entityId: link.to, reason: link.reason }] });
              }
              const toRefs = toEntry.crossReferences || [];
              if (!toRefs.some(r => r.entityId === link.from)) {
                upsertEntityIndex({ ...toEntry, crossReferences: [...toRefs, { entityId: link.from, reason: link.reason }] });
              }
              created++;
            }
            if (created > 0) {
              saveEntityIndex();
              logAction({ ts: Date.now(), type: "action", category: "focus-areas",
                message: `Conversation entity linking: ${created} cross-references from "${area.title}" discussion` });
            }
          } catch { /* best effort — don't block absorption */ }
        })();
      }

      res.json({ updated: changed, area });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Absorption failed" });
    }
  });

  // Ensure focus area conversations are visible to the current client
  // (copies conversation entries from whichever client created them)
  app.post("/api/focus-areas/sync-conversations", express.json(), async (req, res) => {
    try {
      const { clientId } = req.body as { clientId?: string };
      if (!clientId) { res.status(400).json({ error: "clientId required" }); return; }

      const { loadFocusState } = await import("./focus-areas.js");
      const { loadCardHistory } = await import("./memory-bridge.js");
      const { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { homedir } = await import("node:os");

      const state = loadFocusState();
      if (!state?.areas.length) { res.json({ synced: 0 }); return; }

      const cardsRoot = join(homedir(), ".enso", "cards");
      const clientDir = join(cardsRoot, clientId);
      if (!existsSync(clientDir)) mkdirSync(clientDir, { recursive: true });

      const convIndexPath = join(clientDir, "conversations.json");
      let clientConvs: Array<{ id: string; title: string; createdAt: number; updatedAt: number; context?: { type: string; sourceId: string; label?: string } }> = [];
      try { clientConvs = JSON.parse(readFileSync(convIndexPath, "utf-8")); } catch { clientConvs = []; }

      let synced = 0;
      for (const area of state.areas) {
        if (!area.conversationId) continue;
        // Already in this client's list?
        if (clientConvs.some(c => c.id === area.conversationId)) continue;

        // Find which client has the conversation journal
        let sourceClientId: string | null = null;
        try {
          for (const dir of readdirSync(cardsRoot)) {
            const journalPath = join(cardsRoot, dir, `${area.conversationId}.jsonl`);
            if (existsSync(journalPath)) {
              sourceClientId = dir;
              break;
            }
          }
        } catch { continue; }

        if (!sourceClientId) continue;

        // Copy the journal file to current client (always use source if it's larger)
        const srcJournal = join(cardsRoot, sourceClientId, `${area.conversationId}.jsonl`);
        const dstJournal = join(clientDir, `${area.conversationId}.jsonl`);
        try {
          const { statSync } = await import("node:fs");
          const srcSize = statSync(srcJournal).size;
          const dstSize = existsSync(dstJournal) ? statSync(dstJournal).size : 0;
          if (srcSize > dstSize) {
            copyFileSync(srcJournal, dstJournal);
          }
        } catch { /* best effort */ }

        // Find the conversation entry from source client
        let sourceConvEntry: typeof clientConvs[0] | null = null;
        try {
          const srcIndex = JSON.parse(readFileSync(join(cardsRoot, sourceClientId, "conversations.json"), "utf-8")) as typeof clientConvs;
          sourceConvEntry = srcIndex.find(c => c.id === area.conversationId) ?? null;
        } catch { /* ignore */ }

        // Add to current client's conversation list
        clientConvs.push(sourceConvEntry || {
          id: area.conversationId!,
          title: area.title,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          context: { type: "focus", sourceId: area.id, label: "Focus" },
        });
        synced++;
      }

      if (synced > 0) {
        writeFileSync(convIndexPath, JSON.stringify(clientConvs, null, 2), "utf-8");
      }

      res.json({ synced });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Sync failed" });
    }
  });

  app.post("/api/focus-areas/:id/gaps", async (req, res) => {
    try {
      const { analyzeFocusGaps } = await import("./focus-areas.js");
      const result = await analyzeFocusGaps(req.params.id);
      if (!result) { res.status(404).json({ error: "Focus area not found or analysis failed" }); return; }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Gap analysis failed" });
    }
  });

  app.post("/api/focus-areas/:id/enrich", async (req, res) => {
    try {
      const { enrichFocusArea } = await import("./focus-areas.js");
      const area = await enrichFocusArea(req.params.id);
      if (!area) { res.status(404).json({ error: "Focus area not found" }); return; }
      res.json(area);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Enrichment failed" });
    }
  });

  app.post("/api/focus-areas/:id/plan", async (req, res) => {
    try {
      const { generateFocusPlan } = await import("./focus-areas.js");
      const result = generateFocusPlan(req.params.id);
      if (!result) { res.status(404).json({ error: "Focus area not found" }); return; }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Plan generation failed" });
    }
  });

  app.get("/api/focus-areas/:id/activity", async (req, res) => {
    try {
      const { getFocusAreaActivity } = await import("./focus-areas.js");
      const result = await getFocusAreaActivity(req.params.id);
      if (!result) { res.status(404).json({ error: "Focus area not found" }); return; }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Activity fetch failed" });
    }
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

  // ── Branch Management API ──

  app.get("/api/projects/:id/branch-status", async (req, res) => {
    try {
      const { loadProject, getProjectBranch } = await import("./project-manager.js");
      const { execSync } = await import("child_process");
      const project = loadProject(req.params.id);
      if (!project) { res.status(404).json({ error: "Project not found" }); return; }
      if (!project.codebasePath) { res.status(400).json({ error: "Project has no codebasePath" }); return; }

      const cwd = project.codebasePath;
      const branch = getProjectBranch(project);
      const currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8" }).trim();
      const hasUncommitted = execSync("git status --porcelain", { cwd, encoding: "utf-8" }).trim().length > 0;

      let aheadOfMain = 0;
      let behindMain = 0;
      if (branch !== "main" && currentBranch === branch) {
        try {
          const counts = execSync(`git rev-list --left-right --count main...${branch}`, { cwd, encoding: "utf-8" }).trim();
          const [behind, ahead] = counts.split(/\s+/).map(Number);
          behindMain = behind || 0;
          aheadOfMain = ahead || 0;
        } catch { /* branch may not have diverged yet */ }
      }

      res.json({ branch, currentBranch, aheadOfMain, behindMain, hasUncommitted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/projects/:id/merge-branch", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const { loadProject, getProjectBranch } = await import("./project-manager.js");
      const { execSync } = await import("child_process");
      const project = loadProject(req.params.id);
      if (!project) { res.status(404).json({ error: "Project not found" }); return; }
      if (!project.codebasePath) { res.status(400).json({ error: "Project has no codebasePath" }); return; }

      const branch = getProjectBranch(project);
      if (branch === "main") { res.status(400).json({ error: "Project is already on main — nothing to merge" }); return; }

      const cwd = project.codebasePath;
      const message = req.body.message || `Merge evolution branch '${branch}' into main`;

      // Switch to main and merge
      execSync("git checkout main", { cwd, encoding: "utf-8" });
      execSync(`git merge ${branch} --no-ff -m "${message.replace(/"/g, '\\"')}"`, { cwd, encoding: "utf-8" });

      // Push if remote tracking exists
      let pushed = false;
      try {
        const remote = execSync("git remote", { cwd, encoding: "utf-8" }).trim();
        if (remote) {
          execSync("git push", { cwd, encoding: "utf-8" });
          pushed = true;
        }
      } catch { /* no remote or push failed — that's ok */ }

      const commitHash = execSync("git rev-parse --short HEAD", { cwd, encoding: "utf-8" }).trim();
      res.json({ ok: true, commitHash, pushed, message });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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

  // ── Session & Orchestration Management API ──

  app.get("/api/sessions", async (_req, res) => {
    const { getSystemStatus } = await import("./session-registry.js");
    res.json(getSystemStatus());
  });

  app.delete("/api/sessions/:runId", async (req, res) => {
    try {
      cancelClaudeCodeRun(req.params.runId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to cancel session" });
    }
  });

  app.get("/api/orchestrations/active", async (_req, res) => {
    const { getActiveOrchestrations } = await import("./session-registry.js");
    res.json({ orchestrations: getActiveOrchestrations() });
  });

  app.delete("/api/orchestrations/:id", async (req, res) => {
    try {
      const { handleOrchestrationCancel } = await import("./orchestrator.js");
      handleOrchestrationCancel(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to cancel orchestration" });
    }
  });

  app.post("/api/orchestrations/:id/pause", async (req, res) => {
    try {
      const { handleOrchestrationPause } = await import("./orchestrator.js");
      handleOrchestrationPause(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to pause orchestration" });
    }
  });

  app.post("/api/orchestrations/:id/resume", async (_req, res) => {
    // Resume requires a client and account (WebSocket context), so we return
    // guidance to use the existing WebSocket protocol for resume operations.
    res.status(400).json({ error: "Use WebSocket orchestration.resume for resume operations (requires active client context)" });
  });

  app.get("/api/orchestrations/recoverable", async (_req, res) => {
    const { listWorkspaces } = await import("./orchestration-workspace.js");
    const { getActiveOrchestrations } = await import("./session-registry.js");
    const { loadOrchestration } = await import("./orchestrator.js");
    const active = new Set(getActiveOrchestrations().map((o) => o.orchestrationId));
    const workspaces = listWorkspaces()
      .filter((ws) => !active.has(ws.orchestrationId))
      .map((ws) => {
        const plan = loadOrchestration(ws.orchestrationId);
        return {
          orchestrationId: ws.orchestrationId,
          rootDir: ws.rootDir,
          goal: plan?.goal,
          status: plan?.status,
          taskCount: plan?.tasks?.length ?? 0,
          completedCount: plan?.tasks?.filter((t: any) => t.status === "completed").length ?? 0,
        };
      });
    res.json({ workspaces });
  });

  // ── Scheduled Tasks REST API ──

  app.get("/api/scheduled-tasks", async (_req, res) => {
    const { listTasks } = await import("./scheduled-tasks.js");
    res.json({ tasks: listTasks() });
  });

  app.post("/api/scheduled-tasks", async (req, res) => {
    try {
      const { createTask } = await import("./scheduled-tasks.js");
      const task = createTask(req.body);
      res.json({ success: true, task });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put("/api/scheduled-tasks/:taskId", async (req, res) => {
    try {
      const { updateTask } = await import("./scheduled-tasks.js");
      const task = updateTask(req.params.taskId, req.body);
      res.json({ success: true, task });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/scheduled-tasks/:taskId", async (req, res) => {
    try {
      const { deleteTask } = await import("./scheduled-tasks.js");
      deleteTask(req.params.taskId);
      res.json({ success: true });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/scheduled-tasks/:taskId/trigger", async (req, res) => {
    try {
      const { triggerTask } = await import("./scheduled-tasks.js");
      const run = await triggerTask(req.params.taskId);
      res.json({ success: true, run });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/scheduled-tasks/:taskId/runs", async (req, res) => {
    const { getTaskRuns } = await import("./scheduled-tasks.js");
    const count = parseInt(req.query.count as string) || 20;
    res.json({ runs: getTaskRuns(req.params.taskId, count) });
  });

  // ── Service API Keys Management ──
  // Persisted in ~/.enso/api-keys.json — easy to copy between machines

  const { loadApiKeys, saveApiKey, getServiceKeyDefinitions } = await import("./api-keys.js");

  app.get("/api/service-keys", (_req, res) => {
    const defs = getServiceKeyDefinitions();
    const keys = defs.map((sk) => {
      const value = process.env[sk.envVar] ?? "";
      return {
        ...sk,
        configured: !!value,
        maskedValue: value ? value.slice(0, 4) + "..." + value.slice(-4) : "",
      };
    });
    res.json({ keys });
  });

  app.put("/api/service-keys/:id", (req, res) => {
    const { id } = req.params;
    const { value } = req.body ?? {};
    const defs = getServiceKeyDefinitions();
    const sk = defs.find((k) => k.id === id);
    if (!sk) { res.status(404).json({ error: "Unknown service key" }); return; }
    if (typeof value !== "string") { res.status(400).json({ error: "value is required" }); return; }

    try {
      saveApiKey(sk.id, sk.envVar, value);
      runtime.log?.(`[enso] Service key updated: ${sk.id} (${sk.envVar})`);
      res.json({ success: true, configured: !!value });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to save key" });
    }
  });

  // ── Settings Export / Import ──

  app.get("/api/settings/export", async (req, res) => {
    const { handleExport } = await import("./settings-transfer.js");
    handleExport(req, res);
  });

  app.post("/api/settings/import", express.json({ limit: "5gb" }), async (req, res) => {
    const { handleImport } = await import("./settings-transfer.js");
    handleImport(req, res);
  });

  // ── Audio Backup Download (streaming, no JSON) ──
  app.get("/api/settings/export-audio", async (_req, res) => {
    const { createGzip } = await import("node:zlib");
    const audioDir = join(homedir(), ".enso", "data", "deep-content", "audio");
    if (!existsSync(audioDir)) {
      res.status(404).json({ error: "No audio files found" });
      return;
    }

    const files = readdirSync(audioDir).filter(f => f.endsWith(".wav"));
    if (files.length === 0) {
      res.json({ error: "No audio files", count: 0 });
      return;
    }

    // Stream as a simple concatenated format: [4-byte name length][name][8-byte data length][data]...
    // This is a simple binary archive format that can be parsed on import
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="enso-audio-${dateStr}.ensoarc"`);

    // Write header: magic + file count
    const header = Buffer.alloc(12);
    header.write("ENSOARC1", 0); // magic
    header.writeUInt32LE(files.length, 8); // file count
    res.write(header);

    for (const file of files) {
      const filePath = join(audioDir, file);
      const stat = statSync(filePath);
      const nameBytes = Buffer.from(file, "utf-8");

      // Write: [2-byte name length][name][8-byte file size]
      const entryHeader = Buffer.alloc(2 + nameBytes.length + 8);
      entryHeader.writeUInt16LE(nameBytes.length, 0);
      nameBytes.copy(entryHeader, 2);
      // Use two 32-bit writes for file size (BigInt not available in older Node)
      entryHeader.writeUInt32LE(stat.size & 0xFFFFFFFF, 2 + nameBytes.length);
      entryHeader.writeUInt32LE(Math.floor(stat.size / 0x100000000), 2 + nameBytes.length + 4);
      res.write(entryHeader);

      // Stream file data
      const data = readFileSync(filePath);
      res.write(data);
    }

    res.end();
    logAction({ ts: Date.now(), type: "action", category: "settings-transfer", message: `Audio backup: ${files.length} files exported` });
  });

  // ── Audio Backup Import ──
  app.post("/api/settings/import-audio", async (req, res) => {
    const audioDir = join(homedir(), ".enso", "data", "deep-content", "audio");
    mkdirSync(audioDir, { recursive: true });

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const data = Buffer.concat(chunks);
        // Parse header
        const magic = data.subarray(0, 8).toString();
        if (magic !== "ENSOARC1") {
          res.status(400).json({ error: "Invalid audio archive format" });
          return;
        }
        const fileCount = data.readUInt32LE(8);
        let offset = 12;
        let imported = 0;

        for (let i = 0; i < fileCount; i++) {
          const nameLen = data.readUInt16LE(offset);
          offset += 2;
          const name = data.subarray(offset, offset + nameLen).toString("utf-8");
          offset += nameLen;
          const sizeLow = data.readUInt32LE(offset);
          const sizeHigh = data.readUInt32LE(offset + 4);
          const fileSize = sizeLow + sizeHigh * 0x100000000;
          offset += 8;

          const fileData = data.subarray(offset, offset + fileSize);
          offset += fileSize;

          writeFileSync(join(audioDir, name), fileData);
          imported++;
        }

        logAction({ ts: Date.now(), type: "action", category: "settings-transfer", message: `Audio import: ${imported} files` });
        res.json({ success: true, imported, fileCount });
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      }
    });
  });

  // ── YouTube OAuth API ──

  app.get("/api/youtube/auth", async (_req, res) => {
    const { getAuthUrl } = await import("./youtube-auth.js");
    const baseUrl = `http://localhost:${port}`;
    const url = getAuthUrl(baseUrl);
    if (!url) {
      res.status(400).json({ error: "YouTube Client ID and Secret must be configured first in Settings > Service Keys" });
      return;
    }
    res.redirect(url);
  });

  app.get("/api/youtube/callback", async (req, res) => {
    const code = req.query.code as string;
    if (!code) { res.status(400).send("Missing authorization code"); return; }

    const { handleCallback } = await import("./youtube-auth.js");
    const baseUrl = `http://localhost:${port}`;
    const result = await handleCallback(code, baseUrl);

    if (result.success) {
      res.send("<html><body style='background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center'><h1>YouTube Authorized</h1><p style='color:#4ade80'>You can close this tab and return to Enso.</p></div></body></html>");
    } else {
      res.status(400).send(`<html><body style='background:#0a0a0a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center'><h1>Authorization Failed</h1><p style='color:#f87171'>${result.error}</p></div></body></html>`);
    }
  });

  app.get("/api/youtube/status", async (_req, res) => {
    const { isAuthorized } = await import("./youtube-auth.js");
    res.json({ authorized: isAuthorized() });
  });

  // ── Email-Triggered Orchestration API ──

  app.get("/api/trigger/evolve", async (req, res) => {
    const goal = req.query.goal as string;
    const projectId = (req.query.projectId as string) || "enso";
    if (!goal) { res.status(400).send("Missing goal parameter"); return; }

    try {
      const { handleEvolutionSprint } = await import("./evolution.js");
      const firstClient = clients.values().next().value;
      if (!firstClient) {
        res.send(`<html><body style="background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#fbbf24;font-size:48px;margin-bottom:8px">&#9888;</h1><h2>No Client Connected</h2><p style="color:#94a3b8">Open <a href="https://pc1.enso.net" style="color:#60a5fa">pc1.enso.net</a> first, then click the button again.</p></div></body></html>`);
        return;
      }

      handleEvolutionSprint({
        client: firstClient,
        account,
        goal,
        projectId,
      }).catch((err: Error) => {
        logError("trigger", "Email-triggered evolve failed", err);
      });

      res.send(`<html><body style="background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#a78bfa;font-size:48px;margin-bottom:8px">&#9889;</h1><h2>Evolution Sprint Started</h2><p style="color:#94a3b8;max-width:500px">${goal.slice(0, 200)}</p><p style="color:#475569;font-size:13px;margin-top:20px">Check progress in <a href="https://pc1.enso.net" style="color:#60a5fa">Enso</a></p></div></body></html>`);
    } catch (err) {
      res.status(500).send(`<html><body style="background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#f87171">Error</h1><p style="color:#94a3b8">${err instanceof Error ? err.message : String(err)}</p></div></body></html>`);
    }
  });

  app.get("/api/trigger/discover", async (req, res) => {
    const focus = req.query.focus as string;
    if (!focus) { res.status(400).send("Missing focus parameter"); return; }

    try {
      const { handleDiscovery } = await import("./discovery.js");
      const firstClient = clients.values().next().value;
      if (!firstClient) {
        res.send(`<html><body style="background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#fbbf24;font-size:48px;margin-bottom:8px">&#9888;</h1><h2>No Client Connected</h2><p style="color:#94a3b8">Open <a href="https://pc1.enso.net" style="color:#60a5fa">pc1.enso.net</a> first, then click the button again.</p></div></body></html>`);
        return;
      }

      handleDiscovery({
        client: firstClient,
        account,
        focus,
      }).catch((err: Error) => {
        logError("trigger", "Email-triggered discover failed", err);
      });

      res.send(`<html><body style="background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#f59e0b;font-size:48px;margin-bottom:8px">&#128270;</h1><h2>Discovery Started</h2><p style="color:#94a3b8;max-width:500px">${focus.slice(0, 200)}</p><p style="color:#475569;font-size:13px;margin-top:20px">Check progress in <a href="https://pc1.enso.net" style="color:#60a5fa">Enso</a></p></div></body></html>`);
    } catch (err) {
      res.status(500).send(`<html><body style="background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#f87171">Error</h1><p style="color:#94a3b8">${err instanceof Error ? err.message : String(err)}</p></div></body></html>`);
    }
  });

  // ── Email Cleanup API ──

  app.get("/api/trigger/deploy", async (_req, res) => {
    try {
      const { execSync } = await import("node:child_process");
      const cwd = process.env.ENSO_PROJECT_PATH || "D:/Github/Enso";

      // Run build + commit + push (but NOT restart — that would kill this process)
      const steps: Array<{ step: string; ok: boolean; output: string }> = [];

      try {
        execSync("npm run build", { cwd, encoding: "utf-8", timeout: 120_000 });
        steps.push({ step: "Build", ok: true, output: "success" });
      } catch (e) {
        steps.push({ step: "Build", ok: false, output: (e as Error).message.slice(0, 200) });
      }

      try {
        execSync("git add -A && git commit -m \"chore: deploy from email trigger\" --allow-empty", { cwd, encoding: "utf-8", timeout: 30_000 });
        steps.push({ step: "Commit", ok: true, output: "success" });
      } catch (e) {
        steps.push({ step: "Commit", ok: false, output: (e as Error).message.slice(0, 200) });
      }

      try {
        execSync("git push", { cwd, encoding: "utf-8", timeout: 30_000 });
        steps.push({ step: "Push", ok: true, output: "success" });
      } catch (e) {
        steps.push({ step: "Push", ok: false, output: (e as Error).message.slice(0, 200) });
      }

      const allOk = steps.every(s => s.ok);
      const stepsHtml = steps.map(s =>
        `<div style="padding:6px 0;color:${s.ok ? "#4ade80" : "#f87171"}">${s.ok ? "✓" : "✗"} ${s.step}: ${s.output}</div>`
      ).join("");

      logAction({ ts: Date.now(), type: "action", category: "deploy", message: `Email-triggered deploy: ${allOk ? "success" : "partial"} (${steps.filter(s=>s.ok).length}/${steps.length} steps)` });

      res.send(`<html><body style="background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center;max-width:500px"><h1 style="color:${allOk ? "#4ade80" : "#fbbf24"};font-size:48px;margin-bottom:8px">${allOk ? "&#10003;" : "&#9888;"}</h1><h2>Deploy ${allOk ? "Complete" : "Partial"}</h2><div style="text-align:left;background:#1e293b;border-radius:12px;padding:16px;margin:16px 0">${stepsHtml}</div><p style="color:#475569;font-size:13px">Note: Server restart must be done manually or via the next scheduled restart.</p></div></body></html>`);
    } catch (err) {
      res.status(500).send(`<html><body style="background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#f87171">Deploy Failed</h1><p style="color:#94a3b8">${err instanceof Error ? err.message : String(err)}</p></div></body></html>`);
    }
  });

  app.get("/api/email-cleanup/confirm", async (req, res) => {
    const token = req.query.token as string;
    if (!token) { res.status(400).send("Missing token"); return; }

    const { executePendingCleanup } = await import("./email-cleanup.js");
    const result = executePendingCleanup(token);

    if (result.success) {
      res.send(`<html><body style="background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#4ade80;font-size:48px;margin-bottom:8px">&#10003;</h1><h2>Cleanup Complete</h2><p style="color:#94a3b8;font-size:18px">${result.deleted} emails deleted</p><p style="color:#475569;font-size:13px;margin-top:20px">You can close this tab.</p></div></body></html>`);
    } else {
      res.status(400).send(`<html><body style="background:#0f172a;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#f87171;font-size:48px;margin-bottom:8px">&#10007;</h1><h2>Cleanup Failed</h2><p style="color:#94a3b8">${result.error}</p></div></body></html>`);
    }
  });

  // ── Growth Marketing & Sales API ──

  try {
    const growthRouter = (await import("./growth-api.js")).default;
    app.use("/api/growth", growthRouter);
  } catch { /* growth-api not yet implemented */ }

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

  // ── Conversations (multi-chat threads per browser client) ──
  app.get("/api/conversations", (req, res) => {
    const clientId = req.query.clientId as string;
    if (!clientId) { res.status(400).json({ error: "clientId required" }); return; }
    res.json({ conversations: listConversations(clientId) });
  });

  app.post("/api/conversations", express.json(), (req, res) => {
    const { clientId, title, context } = req.body as { clientId?: string; title?: string; context?: { type: string; sourceId: string; label?: string } };
    if (!clientId) { res.status(400).json({ error: "clientId required" }); return; }
    const c = createConversation(clientId, title, context);
    res.json(c);
  });

  app.patch("/api/conversations/:id", express.json(), (req, res) => {
    const conversationId = req.params.id;
    const { clientId, title } = req.body as { clientId?: string; title?: string };
    if (!clientId || typeof title !== "string") {
      res.status(400).json({ error: "clientId and title required" });
      return;
    }
    const ok = renameConversation(clientId, conversationId, title);
    res.json({ ok });
  });

  app.delete("/api/conversations/:id", (req, res) => {
    const conversationId = req.params.id;
    const clientId = req.query.clientId as string;
    if (!clientId) { res.status(400).json({ error: "clientId required" }); return; }
    const ok = deleteConversation(clientId, conversationId);
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

  // Analyze an uploaded image with Gemini Vision and return a research topic
  app.post("/api/image-analyze", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const { imagePath } = req.body;
      if (!imagePath) { res.status(400).json({ error: "imagePath required" }); return; }
      const apiKey = account?.geminiApiKey;
      if (!apiKey) { res.status(400).json({ error: "Gemini API key not configured" }); return; }

      const { topic } = await analyzeImageForResearch({
        imagePath,
        userText: "",
        apiKey,
      });
      res.json({ topic });
    } catch (err: any) {
      logError("image-analyze", "Vision analysis failed", err);
      res.json({ topic: "" }); // Return empty topic — user can type manually
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
      const transcript = await transcribeAudioBuffer({ audioBuffer, mimeType: audioMimeType, geminiApiKey: account.geminiApiKey });
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

  // Guard against protocol-level WebSocket errors crashing the process
  wss.on("error", (err) => {
    runtime.log?.(`[enso] WebSocketServer error: ${err.message}`);
  });

  /** Cleanup timers for disconnected clients — keyed by clientId. */
  const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ── WebSocket keep-alive pings ──
  // Mobile networks (especially Android cellular) aggressively close idle TCP
  // connections after ~2 minutes.  Send protocol-level pings every 30s so the
  // connection is never considered idle.  Browsers respond with pong
  // automatically at the protocol level.
  // Allow up to 2 missed pong responses (~60s) before terminating.
  // Mobile networks (cellular, tunnels, network switches) can cause transient
  // delays that exceed a single 30s cycle but recover within 60s.
  const WS_MAX_MISSED_PONGS = 2;
  const pingInterval = setInterval(() => {
    for (const client of clients.values()) {
      const { ws: clientWs } = client;
      if (clientWs.readyState !== WebSocket.OPEN) continue;
      const missed = ((clientWs as any)._ensoMissedPongs as number) ?? 0;
      if (missed >= WS_MAX_MISSED_PONGS) {
        runtime.log?.(`[enso] ping timeout for ${client.id} (${missed} missed pongs), terminating`);
        (clientWs as any)._ensoMissedPongs = 0;
        clientWs.terminate();
        continue;
      }
      (clientWs as any)._ensoMissedPongs = missed + 1;
      clientWs.ping();
    }
  }, WS_PING_INTERVAL_MS);

  wss.on("connection", (ws, req) => {
    // Parse URL early so clientId is available for error logging
    const wsUrl = new URL(req.url ?? "", `http://${req.headers.host}`);

    // ── Persistent client identity (reconnect-safe) ──
    const clientId = wsUrl.searchParams.get("clientId") ?? randomUUID().slice(0, 8);

    // Reset pong flag on each pong received
    ws.on("pong", () => { (ws as any)._ensoMissedPongs = 0; });
    ws.on("error", (err) => { runtime.log?.(`[enso] ws error for ${clientId}: ${err.message}`); });
    // ── WebSocket token auth ──
    if (accessToken) {
      const origin = req.headers.origin ?? "";
      const isSameOrigin = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
      if (!isSameOrigin && wsUrl.searchParams.get("token") !== accessToken) {
        ws.close(4001, "Unauthorized");
        return;
      }
    }
    const existing = clients.get(clientId);

    let client: ConnectedClient;
    if (existing) {
      // Reconnect — swap ws and send on the existing object so all captured
      // references (runClaudeCode, orchestrator, build-via-claude) automatically
      // route to the new socket.
      const oldWs = existing.ws;
      existing.ws = ws;
      // Terminate the old socket so its close handler (which checks client.ws !== ws)
      // fires harmlessly, and the ping loop stops pinging the stale socket.
      if (oldWs !== ws && oldWs.readyState <= WebSocket.OPEN) {
        oldWs.terminate();
      }
      existing.send = (msg: ServerMessage) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        } else {
          const buf = existing._disconnectedBuffer;
          if (buf.length < 2000) buf.push(msg);
        }
      };
      client = existing;
      if (!client.conversationId) client.conversationId = DEFAULT_CONVERSATION_ID;
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
        conversationId: DEFAULT_CONVERSATION_ID,
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
      settings: {
        mode: account.mode ?? "full",
        toolFamilies,
        ensoProjectPath,
        defaultProjectCwd: process.cwd(),
        bootId,
        providers: _getProviderStatus ? _getProviderStatus(account.providerKeys) as any : undefined,
      },
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

        await handleWebSocketMessage(msg, {
          client,
          account,
          config,
          runtime,
          statusSink,
          shellPty,
          onRestartRequested: opts.onRestartRequested,
          projectRoot,
        });
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

    ws.on("close", (code, reason) => {
      // If the client already reconnected with a new socket, this close event
      // is from the stale/old socket — ignore it completely.  Without this
      // guard, the stale close fires *after* the reconnect, starting a cleanup
      // timer that races with the live connection (causing spurious disconnect/
      // reconnect churn visible on mobile).
      if (client.ws !== ws) {
        runtime.log?.(`[enso] stale ws close for ${clientId} (already reconnected), ignoring`);
        return;
      }
      runtime.log?.(`[enso] client disconnected: ${clientId} code=${code} reason="${reason?.toString() || ''}" missed=${(ws as any)._ensoMissedPongs ?? '?'}`);
      logAction({ ts: Date.now(), type: "system", category: "system:disconnect", message: `Client disconnected: ${clientId} code=${code}` });
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
      }, WS_DISCONNECT_CLEANUP_MS);
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

      // Build entity index from data source caches + Cortex (background, non-blocking)
      import("./entity-model.js").then(({ buildEntityIndex }) =>
        buildEntityIndex().catch(() => {})
      ).catch(() => {});

      // Convert existing WAV podcasts to MP3 in background (mobile compatibility)
      import("./deep-content.js").then(({ convertExistingPodcastsToMp3 }) =>
        convertExistingPodcastsToMp3().catch(() => {})
      ).catch(() => {});

      // Start scheduled task scheduler
      import("./scheduled-tasks.js").then(async ({ initScheduler }) => {
        const { executeScheduledTask, setScheduledTaskClient } = await import("./scheduled-tasks-executor.js");
        // Register first connected client for delivery (will update on reconnect)
        const broadcastToClients = (msg: Partial<ServerMessage>) => {
          const fullMsg: ServerMessage = {
            id: randomUUID(), runId: randomUUID(), sessionKey: "", seq: 0, state: "final",
            ...msg,
            timestamp: Date.now(),
          };
          for (const c of clients.values()) {
            try { c.send(fullMsg); } catch { /* client may have disconnected */ }
          }
          // Keep executor aware of first available client
          const firstClient = clients.values().next().value;
          setScheduledTaskClient(firstClient ? {
            ws: firstClient.ws as unknown as { send: (data: string) => void; readyState: number },
            clientId: firstClient.id,
            account: { id: account.id ?? "standalone", peer: firstClient.id },
          } : null);
        };
        initScheduler(executeScheduledTask, broadcastToClients);
        runtime.log?.("[enso] scheduled task scheduler started");
      }).catch((err) => {
        runtime.error?.(`[enso] failed to start scheduler: ${err instanceof Error ? err.message : String(err)}`);
      });

      // Register focus area conversation providers and start proactive delivery loop
      import("./focus-areas.js").then(async ({ registerFocusProviders }) => {
        await registerFocusProviders();
        runtime.log?.("[enso] focus area conversation providers registered");

        // Proactive delivery loop — check every 60s for messages to deliver
        setInterval(async () => {
          try {
            const { contextRegistry } = await import("./conversation-context.js");
            const pending = await contextRegistry.checkProactive();
            if (pending.size === 0) return;

            for (const [convId, messages] of pending) {
              // Find a connected client that has this conversation
              for (const c of clients.values()) {
                for (const msg of messages) {
                  const cardId = randomUUID();
                  // Persist the proactive message to the conversation journal
                  const { persistCard } = await import("./memory-bridge.js");
                  persistCard(c.id, convId, {
                    id: cardId, runId: cardId, type: "chat", role: "assistant",
                    text: msg.text, timestamp: Date.now(),
                  });
                  // Send to client if they're connected
                  c.send({
                    id: cardId, runId: cardId, sessionKey: c.sessionKey,
                    seq: 0, state: "final", text: msg.text,
                    conversationId: convId, timestamp: Date.now(),
                  });
                  logAction({
                    ts: Date.now(), type: "action", category: "conversation-context",
                    message: `Proactive message delivered to conv=${convId.slice(0, 20)}: ${msg.text.slice(0, 60)}`,
                  });
                }
                break; // Only deliver to first connected client
              }
            }
          } catch { /* proactive check failed — not critical */ }
        }, 60_000);
      }).catch(() => {});

      // Start research topic monitor loop
      import("./research-monitor.js").then(({ startMonitorLoop }) => {
        startMonitorLoop({
          geminiApiKey: account.geminiApiKey,
          onUpdate: (topic: string, changes: { newFindings: string[]; removedFindings: string[] }) => {
            const msg: ServerMessage = {
              id: randomUUID(), runId: randomUUID(), sessionKey: "", seq: 0, state: "final",
              monitorUpdate: { topic, changes, timestamp: Date.now() },
              timestamp: Date.now(),
            };
            for (const c of clients.values()) c.send(msg);
          },
        });
      }).catch(() => {});

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

  function stop(isRestart = false): Promise<void> {
    return new Promise<void>((resolve) => {
      runtime.log?.(`[enso] stopping server (restart=${isRestart})`);
      clearInterval(pingInterval);

      if (isRestart) {
        const restartMsg: ServerMessage = {
          id: randomUUID(),
          runId: randomUUID(),
          sessionKey: "",
          seq: 0,
          state: "final",
          serverEvent: "restarting",
          timestamp: Date.now(),
        };
        for (const client of clients.values()) {
          try { client.send(restartMsg); } catch { /* best-effort */ }
        }
      }

      // Stop scheduled task scheduler
      import("./scheduled-tasks.js").then(({ stopScheduler }) => stopScheduler()).catch(() => {});

      const closeCode = isRestart ? 4078 : 1001;
      const closeReason = isRestart ? "server-restart" : "shutdown";
      for (const client of clients.values()) {
        try { client.ws.close(closeCode, closeReason); } catch { /* best-effort */ }
      }
      clients.clear();
      wss.close();
      const drainTimeout = setTimeout(resolve, 5_000);
      server.close(() => {
        clearTimeout(drainTimeout);
        resolve();
      });
    });
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
