import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { existsSync, statSync, createReadStream, readdirSync, writeFileSync, mkdirSync } from "fs";
import { extname, dirname, basename, join } from "path";
import { tmpdir } from "os";
import type { RuntimeEnv } from "openclaw/plugin-sdk";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { CoreConfig, ClientMessage, ServerMessage } from "./types.js";
import { handleEnsoInbound } from "./inbound.js";
import { handleCardEnhance, handlePluginCardAction } from "./outbound.js";
import { runClaudeCode, cancelClaudeCodeRun } from "./claude-code.js";
import { getDomainEvolutionJob, getDomainEvolutionJobs } from "./domain-evolution.js";

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
export const MAX_MEDIA_FILE_SIZE = 300 * 1024 * 1024;

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

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      channel: "enso",
      accountId: account.accountId,
      clients: clients.size,
      timestamp: Date.now(),
    });
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

  // Serve local media files referenced in agent responses
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

    // Enforce file size limit
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

    const ext = extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".bmp": "image/bmp",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".pdf": "application/pdf",
    };
    const contentType = mimeTypes[ext] ?? "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    createReadStream(filePath).pipe(res);
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

  const server: Server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
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

    // Send current mode to newly connected client
    send({
      id: randomUUID(),
      runId: randomUUID(),
      sessionKey,
      seq: 0,
      state: "final",
      settings: { mode: account.mode ?? "full" },
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
              runtime.log?.(`[enso] card enhance: ${msg.cardId}`);
              await handleCardEnhance({
                cardId: msg.cardId,
                cardText: msg.cardText,
                client,
                account,
              });
            }
            break;
          case "card.build_app":
            if (msg.cardId && msg.cardText && msg.buildAppDefinition) {
              runtime.log?.(`[enso] card build-app: ${msg.cardId}`);
              const { handleBuildTool } = await import("./tool-factory.js");
              await handleBuildTool({
                cardId: msg.cardId,
                cardText: msg.cardText,
                toolDefinition: msg.buildAppDefinition,
                client,
                account,
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
              const { loadApps } = await import("./app-persistence.js");
              const apps = loadApps();
              const appsList = apps.map((app) => {
                const primary = app.spec.tools.find((t) => t.isPrimary) ?? app.spec.tools[0];
                return {
                  toolFamily: app.spec.toolFamily,
                  description: app.spec.description,
                  toolCount: app.spec.tools.length,
                  primaryToolName: `${app.spec.toolPrefix}${primary.suffix}`,
                };
              });
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
              runtime.log?.(`[enso] apps.run: ${msg.toolFamily}`);
              try {
                const { loadApps } = await import("./app-persistence.js");
                const { executeToolDirect, getToolTemplateCode, inferToolTemplate, normalizeDataForToolTemplate } = await import("./native-tools/registry.js");
                const apps = loadApps();
                const app = apps.find((a) => a.spec.toolFamily === msg.toolFamily);
                if (!app) {
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

                const primary = app.spec.tools.find((t) => t.isPrimary) ?? app.spec.tools[0];
                const primaryToolName = `${app.spec.toolPrefix}${primary.suffix}`;

                // Execute the primary tool with sample params
                const result = await executeToolDirect(primaryToolName, primary.sampleParams);
                const data = result.success && result.data != null
                  ? result.data
                  : primary.sampleData;

                // Get template
                const signature = inferToolTemplate({ toolName: primaryToolName, data });
                const generatedUI = signature ? getToolTemplateCode(signature) : app.templateJSX;
                const normalizedData = signature ? normalizeDataForToolTemplate(signature, data) : data;

                // Register card context for future actions
                const { registerCardContext } = await import("./outbound.js");
                const cardId = randomUUID();
                registerCardContext(cardId, {
                  cardId,
                  originalPrompt: `Run app: ${app.spec.toolFamily}`,
                  originalResponse: "",
                  currentData: structuredClone(normalizedData),
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

                send({
                  id: cardId,
                  runId: randomUUID(),
                  sessionKey,
                  seq: 0,
                  state: "final",
                  data: normalizedData,
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
              } catch (err) {
                runtime.error?.(`[enso] apps.run failed: ${err instanceof Error ? err.message : String(err)}`);
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
