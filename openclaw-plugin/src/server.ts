import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { existsSync, statSync, createReadStream, createWriteStream, readFileSync, readdirSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from "fs";
import { extname, dirname, basename, join } from "path";
import { fileURLToPath } from "url";
import { tmpdir, homedir, hostname, platform, arch, totalmem } from "os";
import { spawn } from "child_process";
import type { RuntimeEnv } from "openclaw/plugin-sdk";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { CoreConfig, ClientMessage, ServerMessage } from "./types.js";
import { handleEnsoInbound } from "./inbound.js";
import { handleCardEnhance, handlePluginCardAction } from "./outbound.js";
import { runClaudeCode, cancelClaudeCodeRun } from "./claude-code.js";
import { getDomainEvolutionJob, getDomainEvolutionJobs } from "./domain-evolution.js";
import { TOOL_FAMILY_CAPABILITIES } from "./tool-families/catalog.js";

export type ConnectedClient = {
  id: string;
  sessionKey: string;
  ws: WebSocket;
  send: (msg: ServerMessage) => void;
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

export async function startEnsoServer(opts: {
  account: ResolvedEnsoAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  abortSignal?: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<{ stop: () => void }> {
  const { account, config, runtime, statusSink } = opts;
  const port = account.port;
  activePort = port;
  activeAccount = account;

  // Re-hydrate saved apps from disk before setting up routes
  try {
    const { loadAndRegisterSavedApps } = await import("./app-persistence.js");
    const appCount = loadAndRegisterSavedApps();
    if (appCount > 0) {
      console.log(`[enso] re-hydrated ${appCount} saved app(s) from disk`);
    }
  } catch (err) {
    console.log(`[enso] app re-hydration failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  const app = express();
  app.use(express.json());

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

  /** Read version info from package.json (cached after first call). */
  let _pkgCache: { version: string; versionCode: number } | null = null;
  function readPkgVersion() {
    if (_pkgCache) return _pkgCache;
    try {
      const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf-8"));
      _pkgCache = { version: pkg.version ?? "0.1.0", versionCode: pkg.versionCode ?? 1 };
    } catch {
      _pkgCache = { version: "0.1.0", versionCode: 1 };
    }
    return _pkgCache;
  }

  const apkPath = join(projectRoot, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");

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
    res.json({
      versionCode: pkg.versionCode,
      versionName: pkg.version,
      apkAvailable: apkExists,
      apkSizeBytes: apkExists ? statSync(apkPath).size : 0,
    });
  });

  // ── Serve built frontend (unauthenticated — for remote access via tunnel) ──
  const distDir = join(projectRoot, "dist");
  if (existsSync(distDir) && existsSync(join(distDir, "index.html"))) {
    app.use(express.static(distDir));
    runtime.log?.(`[enso] serving frontend from ${distDir}`);
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
      const TRANSCODE_DIR = join(homedir(), ".openclaw", "enso-apps", "multimedia", "transcode");
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
      ".pdf": "application/pdf",
    };
    const contentType = mimeTypes[ext] ?? "application/octet-stream";

    const fileSize = statSync(filePath).size;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Accept-Ranges", "bytes");

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

  // ── APK download endpoint (authenticated — serves built APK for app upgrades) ──
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

  // Accept image uploads from the browser client
  const uploadDir = join(tmpdir(), "enso-uploads");
  mkdirSync(uploadDir, { recursive: true });

  app.post("/upload", express.raw({ type: "image/*", limit: "20mb" }), (req, res) => {
    const contentType = req.headers["content-type"] ?? "image/png";
    const extMap: Record<string, string> = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/gif": ".gif",
      "image/webp": ".webp",
    };
    const ext = extMap[contentType] ?? ".png";
    const filename = `${randomUUID()}${ext}`;
    const filePath = join(uploadDir, filename);

    writeFileSync(filePath, req.body);
    const mediaUrl = toMediaUrl(filePath);
    res.json({ mediaUrl, filePath });
  });

  // ── SPA fallback (must be after all API routes) ──
  if (existsSync(distDir) && existsSync(join(distDir, "index.html"))) {
    app.get("*", (_req, res) => {
      res.sendFile(join(distDir, "index.html"));
    });
  }

  const server: Server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    // ── WebSocket token auth ──
    if (accessToken) {
      const wsUrl = new URL(req.url ?? "", `http://${req.headers.host}`);
      const origin = req.headers.origin ?? "";
      const isSameOrigin = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
      if (!isSameOrigin && wsUrl.searchParams.get("token") !== accessToken) {
        ws.close(4001, "Unauthorized");
        return;
      }
    }

    const connectionId = randomUUID().slice(0, 8);
    const sessionKey = `enso_${connectionId}`;
    runtime.log?.(`[enso] client connected: ${connectionId}`);

    const send = (msg: ServerMessage) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    };

    const client: ConnectedClient = { id: connectionId, sessionKey, ws, send };
    clients.set(connectionId, client);

    // Send current mode + available tool families + project path to newly connected client
    const toolFamilies = TOOL_FAMILY_CAPABILITIES.map((c) => ({ toolFamily: c.toolFamily, description: c.description }));
    const ensoProjectPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    send({
      id: randomUUID(),
      runId: randomUUID(),
      sessionKey,
      seq: 0,
      state: "final",
      settings: { mode: account.mode ?? "full", toolFamilies, ensoProjectPath },
      timestamp: Date.now(),
    });

    ws.on("message", async (raw) => {
      try {
        const msg: ClientMessage = JSON.parse(raw.toString());
        runtime.log?.(`[enso] received: ${msg.type} ${msg.text?.slice(0, 50) ?? ""}`);

        statusSink?.({ lastInboundAt: Date.now() });

        switch (msg.type) {
          case "chat.send":
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
              });
            } else if (msg.text || (msg.mediaUrls && msg.mediaUrls.length > 0)) {
              await handleEnsoInbound({
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
              await handleEnsoInbound({
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
              runtime.log?.(`[enso] card build-app (async): ${msg.cardId}`);
              const { handleBuildTool } = await import("./tool-factory.js");
              // Fire-and-forget: build runs in background, sends buildComplete when done
              handleBuildTool({
                cardId: msg.cardId,
                cardText: msg.cardText,
                toolDefinition: msg.buildAppDefinition,
                conversationContext: msg.conversationContext,
                client,
                account,
              }).catch((err) => {
                runtime.error?.(`[enso] build-app unhandled error: ${err instanceof Error ? err.message : String(err)}`);
              });
            }
            break;
          case "card.propose_app":
            if (msg.cardId && msg.cardText) {
              runtime.log?.(`[enso] card propose-app: ${msg.cardId}`);
              try {
                const { generateAppProposal } = await import("./tool-factory.js");
                const proposal = await generateAppProposal({
                  cardText: msg.cardText,
                  conversationContext: msg.conversationContext ?? "",
                  apiKey: account.geminiApiKey,
                });
                send({
                  id: randomUUID(),
                  runId: randomUUID(),
                  sessionKey,
                  seq: 0,
                  state: "final",
                  appProposal: { cardId: msg.cardId, proposal },
                  timestamp: Date.now(),
                });
              } catch (err) {
                runtime.error?.(`[enso] propose-app failed: ${err instanceof Error ? err.message : String(err)}`);
                send({
                  id: randomUUID(),
                  runId: randomUUID(),
                  sessionKey,
                  seq: 0,
                  state: "final",
                  appProposal: { cardId: msg.cardId, proposal: "" },
                  timestamp: Date.now(),
                });
              }
            }
            break;
          case "apps.list": {
            try {
              const { loadAllApps, isCodebaseApp } = await import("./app-persistence.js");
              const { TOOL_FAMILY_CAPABILITIES } = await import("./tool-families/catalog.js");
              const { isToolRegistered } = await import("./native-tools/registry.js");
              const apps = loadAllApps();
              const dynamicApps = apps.map((app) => {
                const primary = app.spec.tools.find((t) => t.isPrimary) ?? app.spec.tools[0];
                return {
                  toolFamily: app.spec.toolFamily,
                  description: app.spec.description,
                  toolCount: app.spec.tools.length,
                  primaryToolName: `${app.spec.toolPrefix}${primary.suffix}`,
                  codebase: isCodebaseApp(app.spec.toolFamily),
                };
              });
              // Include built-in tool families whose fallback tool is registered
              const dynamicFamilies = new Set(dynamicApps.map((a) => a.toolFamily));
              const builtInApps = TOOL_FAMILY_CAPABILITIES
                .filter((cap) => !dynamicFamilies.has(cap.toolFamily) && isToolRegistered(cap.fallbackToolName))
                .map((cap) => ({
                  toolFamily: cap.toolFamily,
                  description: cap.description,
                  toolCount: cap.actionSuffixes.length,
                  primaryToolName: cap.fallbackToolName,
                  builtIn: true,
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
                const { getCapabilityForFamily } = await import("./tool-families/catalog.js");
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
                    nativeToolHint: {
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

                  send({
                    id: cardId,
                    runId: randomUUID(),
                    sessionKey,
                    seq: 0,
                    state: "final",
                    data,
                    generatedUI,
                    cardMode: {
                      interactionMode: "tool",
                      toolFamily: app.spec.toolFamily,
                      signatureId: app.spec.signatureId,
                      coverageStatus: "covered",
                    },
                    targetCardId: undefined,
                    timestamp: Date.now(),
                  });
                } else {
                  // ── Built-in tool family path ──
                  const cap = getCapabilityForFamily(msg.toolFamily);
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

                  const toolName = cap.fallbackToolName;
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

                  const template = getToolTemplate(cap.toolFamily, cap.signatureId);
                  const normalized = template
                    ? normalizeDataForToolTemplate(template, result.data)
                    : (result.data as Record<string, unknown>);
                  const generatedUI = template ? getToolTemplateCode(template) : undefined;

                  // Derive prefix by stripping the fallback suffix from the tool name
                  const fallbackSuffix = cap.actionSuffixes.find((s) => toolName.endsWith(`_${s}`));
                  const handlerPrefix = fallbackSuffix
                    ? toolName.slice(0, -fallbackSuffix.length)
                    : toolName.replace(/_[^_]+$/, "_");

                  const { registerCardContext } = await import("./outbound.js");
                  const cardId = randomUUID();
                  registerCardContext(cardId, {
                    cardId,
                    originalPrompt: `Run app: ${cap.toolFamily}`,
                    originalResponse: "",
                    currentData: structuredClone(normalized),
                    geminiApiKey: account.geminiApiKey,
                    account,
                    mode: "full",
                    actionHistory: [],
                    nativeToolHint: {
                      toolName,
                      params: {},
                      handlerPrefix,
                    },
                    interactionMode: "tool",
                    toolFamily: cap.toolFamily,
                    signatureId: cap.signatureId,
                    coverageStatus: "covered",
                  });

                  runtime.log?.(`[enso:app-runner] built-in card=${cardId} tool=${toolName} family=${cap.toolFamily}`);

                  send({
                    id: cardId,
                    runId: randomUUID(),
                    sessionKey,
                    seq: 0,
                    state: "final",
                    data: normalized,
                    generatedUI,
                    cardMode: {
                      interactionMode: "tool",
                      toolFamily: cap.toolFamily,
                      signatureId: cap.signatureId,
                      coverageStatus: "covered",
                    },
                    targetCardId: undefined,
                    timestamp: Date.now(),
                  });
                }
              } catch (err) {
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
          case "app.save_to_codebase": {
            if (msg.toolFamily) {
              runtime.log?.(`[enso] save app to codebase: ${msg.toolFamily}`);
              try {
                const { saveAppToCodebase } = await import("./app-persistence.js");
                const result = saveAppToCodebase(msg.toolFamily);
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
          case "chat.history":
            break;
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
      clients.delete(connectionId);
      runtime.log?.(`[enso] client disconnected: ${connectionId}`);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, () => {
      runtime.log?.(`[enso] server listening on :${port}`);
      resolve();
    });
  });

  function stop() {
    runtime.log?.("[enso] stopping server");
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
