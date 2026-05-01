/**
 * WebSocket message dispatcher — extracted from server.ts.
 *
 * Contains all `switch (msg.type)` case handlers for incoming WebSocket
 * messages, plus helper functions used exclusively by those handlers.
 * Also includes the 4 new `context.*` handlers for cross-card context sharing.
 */
import { randomUUID } from "crypto";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import type { EnsoRuntime } from "./local-types.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { CoreConfig, ClientMessage, ServerMessage } from "./types.js";
import type { ConnectedClient } from "./server.js";
import type { CardRecord } from "./memory-bridge.js";
import { handleInbound } from "./agent-adapter.js";
import { injectCardContext } from "./standalone-agent.js";
import { handleCardEnhance, handlePluginCardAction } from "./outbound.js";
import { runClaudeCode, cancelClaudeCodeRun } from "./claude-code.js";
import { toProxiedImageUrl } from "./utils/proxy-url.js";
import { logError, logFix } from "./action-log.js";
import type { ErrorSeverity } from "./action-log.js";
import { runWithRequestId, addBreadcrumb, getBreadcrumbs } from "./request-context.js";
import { EnsoError } from "./errors.js";
import { setActiveClientId } from "./runtime.js";
import {
  persistCard,
  loadCardHistory,
  listConversations,
  conversationJournalHasUserMessage,
  maybeAutotitleConversation,
  isSafeConversationId,
  DEFAULT_CONVERSATION_ID,
  getRecentConversationTopics,
} from "./memory-bridge.js";
import { DEFAULT_CHAT_MODEL, HOME_DIR } from "./config.js";
import { contextBus } from "./context-bus.js";
import type { SharedContextBus } from "./context-bus.js";

// ── Types ────────────────────────────────────────────────────────────

export interface WsHandlerContext {
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
  config: CoreConfig;
  runtime: EnsoRuntime;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  shellPty: typeof import("./shell-pty.js") | null;
  onRestartRequested?: () => void;
  projectRoot: string;
}

// ── Module-level state ───────────────────────────────────────────────

/** Tracks active context subscriptions for cleanup.  Key: `${clientId}:${cardId}:${channelName}` */
const contextSubscriptions = new Map<string, () => void>();

/** Clean up all context subscriptions for a given client. */
export function cleanupClientContextSubscriptions(clientId: string): void {
  for (const [key, unsub] of contextSubscriptions) {
    if (key.startsWith(`${clientId}:`)) {
      unsub();
      contextSubscriptions.delete(key);
    }
  }
}

// ── Helpers (moved from server.ts) ───────────────────────────────────

function resolveConversationId(client: ConnectedClient, msg?: { conversationId?: string }): string {
  const fromMsg = msg?.conversationId;
  if (fromMsg && isSafeConversationId(fromMsg)) {
    client.conversationId = fromMsg;
    return fromMsg;
  }
  if (client.conversationId && isSafeConversationId(client.conversationId)) {
    return client.conversationId;
  }
  client.conversationId = DEFAULT_CONVERSATION_ID;
  return DEFAULT_CONVERSATION_ID;
}

function scanProjects(): Array<{ name: string; path: string }> {
  const projects: Array<{ name: string; path: string }> = [];
  const searchDirs = [
    join(HOME_DIR, "Desktop", "Github"),
    join(HOME_DIR, "Github"),
    join(HOME_DIR, "Projects"),
    join(HOME_DIR, "Desktop", "Projects"),
    join(HOME_DIR, "repos"),
    join(HOME_DIR, "src"),
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
    send({
      id: cardId,
      runId: randomUUID(),
      sessionKey,
      seq: 0,
      state: "error",
      text: "Research failed — please try again.",
      timestamp: Date.now(),
    });
  });
}

async function routeToImageSearch(params: {
  topic: string;
  sessionKey: string;
  client: ConnectedClient;
}): Promise<void> {
  const { topic, sessionKey, client } = params;
  const send = (m: ServerMessage) => client.send(m);

  const { braveImageSearch } = await import("./researcher-tools.js");
  const images = await braveImageSearch(`${topic}`, 10);

  const gridTemplate = `
function App(props) {
  var data = props.data || {};
  var images = data.images || [];
  var topic = data.topic || "";

  return (
    <div style={{ padding: "12px" }}>
      <div style={{ fontSize: "13px", fontWeight: 600, color: "#e5e7eb", marginBottom: "8px" }}>
        Similar images: {topic}
      </div>
      {images.length === 0 ? (
        <div style={{ color: "#9ca3af", fontSize: "12px", textAlign: "center", padding: "24px 0" }}>
          No similar images found
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
          {images.map(function(img, i) {
            return (
              <a key={i} href={img.pageUrl} target="_blank" rel="noopener noreferrer"
                 style={{ display: "block", borderRadius: "8px", overflow: "hidden", border: "1px solid #374151", position: "relative", aspectRatio: "1", background: "#111827" }}>
                <img src={img.url} alt={img.title}
                     style={{ width: "100%", height: "100%", objectFit: "cover" }}
                     onError={function(e) { e.target.style.display = "none"; }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "4px 6px", background: "linear-gradient(transparent, rgba(0,0,0,0.8))", fontSize: "9px", color: "#d1d5db", lineHeight: "1.2" }}>
                  {img.title.length > 40 ? img.title.slice(0, 40) + "..." : img.title}
                </div>
              </a>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "6px", textAlign: "right" }}>
        {images.length} images via Brave Search
      </div>
    </div>
  );
}`;

  const cardId = randomUUID();
  send({
    id: cardId,
    runId: randomUUID(),
    sessionKey,
    seq: 0,
    state: "final",
    data: {
      tool: "enso_image_search",
      topic,
      images: images.map(r => ({ url: toProxiedImageUrl(r.thumbnail), title: r.title, pageUrl: r.url })),
    },
    generatedUI: gridTemplate,
    timestamp: Date.now(),
  });
}

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

  const lines = raw.trim().split("\n").map(l => l.trim()).filter(Boolean);
  let topic = lines[0] || "Analyze this image";
  topic = topic.replace(/^(research\s*topic|topic)\s*[:：]\s*/i, "").replace(/^["']|["']$/g, "");

  if (params.userText) {
    topic = `${topic} — ${params.userText}`;
  }

  return { topic, depth: "standard" };
}

// ── Main WebSocket Message Handler ───────────────────────────────────

export async function handleWebSocketMessage(
  msg: ClientMessage,
  ctx: WsHandlerContext,
): Promise<void> {
  const { result } = runWithRequestId(() => _handleWebSocketMessage(msg, ctx));
  await result;
}

async function _handleWebSocketMessage(
  msg: ClientMessage,
  ctx: WsHandlerContext,
): Promise<void> {
  const { client, account, config, runtime, statusSink, shellPty, projectRoot } = ctx;
  const send = (m: ServerMessage) => client.send(m);
  const sessionKey = client.sessionKey;
  const connectionId = client.id;
  const clientId = client.id;

  addBreadcrumb("ws", `${msg.type} from ${clientId}`);

  try {
  switch (msg.type) {
    case "chat.send": {
      // Guard: reject empty/whitespace-only messages with no media
      if (!msg.text?.trim() && (!msg.mediaUrls || msg.mediaUrls.length === 0)) {
        runtime.log?.(`[enso] chat.send: ignoring empty message`);
        break;
      }
      const convId = resolveConversationId(client, msg);

      // BUG-02 Part B: Silent guard timer — ensure a response within 30s.
      // If the entire processing pipeline hangs (tool-router timeout, agent
      // stall, etc.), this timer fires and delivers a fallback error so the
      // user never sees an infinite spinner.
      // The timer resets whenever the agent sends any message to the client,
      // so active tool-calling loops (which legitimately take >30s) won't
      // trigger a false error as long as they keep sending progress updates.
      let silentGuardCleared = false;
      let silentGuardTimer = setTimeout(fireSilentGuard, 60_000);
      function fireSilentGuard() {
        if (!silentGuardCleared) {
          send({
            id: randomUUID(),
            runId: randomUUID(),
            sessionKey,
            seq: 0,
            state: "error",
            text: "I'm having trouble processing that request. Could you try again?",
            conversationId: convId,
            timestamp: Date.now(),
          });
        }
      }
      // Wrap client.send so every outgoing message resets the guard timer
      const originalSend = client.send.bind(client);
      client.send = (m: ServerMessage) => {
        if (!silentGuardCleared) {
          clearTimeout(silentGuardTimer);
          silentGuardTimer = setTimeout(fireSilentGuard, 60_000);
        }
        return originalSend(m);
      };

      try {
        const persistConv = (record: CardRecord) => {
          persistCard(clientId, convId, record);
          try { injectCardContext(clientId, convId, record); } catch { /* best effort */ }
        };
        // Persist user bubble to card history — but skip tool-routed messages
        if (msg.text && !msg.routing?.toolId) {
          const hadPriorUserInThread = conversationJournalHasUserMessage(clientId, convId);
          const userCardId = randomUUID();
          persistConv({
            id: userCardId,
            runId: userCardId,
            type: "user-bubble",
            role: "user",
            text: msg.text,
            mediaUrls: msg.mediaUrls,
            timestamp: Date.now(),
          });
          if (!hadPriorUserInThread && msg.text.trim()) {
            const titled = maybeAutotitleConversation(clientId, convId, msg.text);
            if (titled) {
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "final",
                conversationsList: listConversations(clientId),
                timestamp: Date.now(),
              });
            }
          }
        }
        // Tool-routed messages still need auto-titling
        if (msg.text && msg.routing?.toolId) {
          const hadPrior = conversationJournalHasUserMessage(clientId, convId);
          if (!hadPrior) {
            const titled = maybeAutotitleConversation(clientId, convId, msg.text);
            if (titled) {
              send({
                id: randomUUID(),
                runId: randomUUID(),
                sessionKey,
                seq: 0,
                state: "final",
                conversationsList: listConversations(clientId),
                timestamp: Date.now(),
              });
            }
          }
        }
        // Direct tool invocation — bypass agent pipeline entirely
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
                conversationId: convId,
                clientId: connectionId,
              },
              account, config, runtime, client,
              routing: msg.routing,
            });
          }
        } else if (msg.text?.trim() === "/compact" && account.geminiApiKey && !msg.routing) {
          // /compact command — force-compact conversation history
          const { forceCompactHistory } = await import("./conversation-compactor.js");
          const { getConversationHistory } = await import("./standalone-agent.js");
          const compactHistory = getConversationHistory(connectionId, convId);
          const compactRunId = randomUUID();
          if (compactHistory.length < 6) {
            send({ id: randomUUID(), runId: compactRunId, sessionKey, seq: 0, state: "final",
              text: "Conversation history is too short to compact (need at least 6 entries).",
              conversationId: convId, timestamp: Date.now() });
          } else {
            try {
              const oldCount = compactHistory.length;
              const summary = await forceCompactHistory(compactHistory, account.geminiApiKey);
              send({ id: randomUUID(), runId: compactRunId, sessionKey, seq: 0, state: "final",
                text: `✅ Compacted ${oldCount} → ${compactHistory.length} entries. Context preserved.\n\n**Summary:**\n${summary}`,
                conversationId: convId, timestamp: Date.now() });
            } catch (compactErr: any) {
              send({ id: randomUUID(), runId: compactRunId, sessionKey, seq: 0, state: "final",
                text: `Compaction failed: ${compactErr?.message || compactErr}`,
                conversationId: convId, timestamp: Date.now() });
            }
          }
        } else if (msg.text && account.geminiApiKey && !msg.routing && account.mode !== "im") {
          // Smart task routing — auto-classify message complexity
          const processingRunId = randomUUID();
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
            // Pre-classification: check for missing file references
            const { detectFileReference } = await import("./file-reference-detector.js");
            const fileRef = detectFileReference(msg.text, /* hasAttachments */ false);
            if (fileRef.missingAttachments) {
              send({ id: randomUUID(), runId: processingRunId, sessionKey, seq: 99, state: "final", text: "", timestamp: Date.now() });
              const fileRefCardId = randomUUID();
              send({
                id: fileRefCardId, runId: randomUUID(), sessionKey, seq: 1, state: "final", timestamp: Date.now(),
                text: fileRef.suggestedPrompt!,
                followUps: {
                  cardId: fileRefCardId,
                  suggestions: [{ label: "Browse Files", prompt: "Open the file browser" }],
                },
              });
              break;
            }

            // Dismiss the processing indicator before the agent creates its own card
            send({
              id: randomUUID(),
              runId: processingRunId,
              sessionKey,
              seq: 99,
              state: "final",
              text: "",
              timestamp: Date.now(),
            });

            // Set active client so tools can access it
            setActiveClientId(clientId);

            try {
              runtime.log?.(`[enso] → agent pipeline: "${msg.text.slice(0, 60)}"`);
              await handleInbound({
                message: {
                  messageId: randomUUID(),
                  sessionId: sessionKey,
                  senderNick: `user_${connectionId}`,
                  text: msg.text,
                  mediaUrls: msg.mediaUrls,
                  timestamp: Date.now(),
                  conversationId: convId,
                },
                account,
                config,
                runtime,
                client,
                routing: msg.routing,
                statusSink,
              });
            } finally {
              setActiveClientId(null);
            }
          } catch (routerErr: any) {
            const errMessage = routerErr?.message || "An unexpected error occurred";
            runtime.log?.(`[enso] chat error: ${routerErr?.stack || errMessage}`);
            try {
              send({ id: randomUUID(), runId: processingRunId, sessionKey, seq: 99, state: "final", text: "", timestamp: Date.now() });
              const errCardId = randomUUID();
              send({
                id: errCardId, runId: randomUUID(), sessionKey, seq: 1, state: "final", timestamp: Date.now(),
                text: errMessage,
                followUps: {
                  cardId: errCardId,
                  suggestions: [
                    { label: "Try again", prompt: "Try again" },
                    { label: "Browse Files", prompt: "Open the file browser" },
                  ],
                },
              });
            } catch (sendErr) {
              runtime.log?.(`[enso] chat error boundary: failed to send error to client: ${sendErr}`);
            }
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
              conversationId: convId,
            },
            account,
            config,
            runtime,
            client,
            routing: msg.routing,
            statusSink,
          });
        }
      } finally {
        silentGuardCleared = true;
        clearTimeout(silentGuardTimer);
        client.send = originalSend;
      }
      break;
    }
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
            conversationId: resolveConversationId(client, msg),
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
      if (!msg.mediaUrls?.length) {
        send({ id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
          text: "No image was attached. Please try again with a photo.", timestamp: Date.now() });
        break;
      }
      const irConvId = resolveConversationId(client, msg);
      const irUserCardId = randomUUID();
      persistCard(clientId, irConvId, {
        id: irUserCardId, runId: irUserCardId, type: "user-bubble", role: "user",
        text: msg.text || "", mediaUrls: msg.mediaUrls, timestamp: Date.now(),
      });

      runtime.log?.(`[enso] image-research: analyzing image for research topic`);
      try {
        const imagePath = msg.mediaUrls[0];
        let topic: string;
        let depth: "quick" | "standard" = "standard";
        if (msg.text && msg.text.trim()) {
          topic = msg.text.trim();
          runtime.log?.(`[enso] image-research: using user-provided topic (skipping vision)`);
        } else {
          const result = await analyzeImageForResearch({
            imagePath,
            userText: "",
            apiKey: account.geminiApiKey,
          });
          topic = result.topic;
          depth = result.depth;
        }
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

    case "image_search": {
      if (!msg.text?.trim()) {
        send({ id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
          text: "No search topic provided.", timestamp: Date.now() });
        break;
      }
      const isConvId = resolveConversationId(client, msg);
      if (msg.mediaUrls?.length) {
        const isUserCardId = randomUUID();
        persistCard(clientId, isConvId, {
          id: isUserCardId, runId: isUserCardId, type: "user-bubble", role: "user",
          text: msg.text || "", mediaUrls: msg.mediaUrls, timestamp: Date.now(),
        });
      }
      runtime.log?.(`[enso] image-search: topic="${msg.text.slice(0, 80)}"`);
      try {
        await routeToImageSearch({
          topic: msg.text.trim(),
          sessionKey,
          client,
        });
      } catch (err) {
        logError("image-search", "Image search failed", err);
        send({ id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
          text: "Image search failed. Please try again.", timestamp: Date.now() });
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
    case "card.summarize": {
      if (msg.cardId && msg.cardType && msg.cardContent) {
        const sumCardId = msg.cardId;
        const chatModel = client.chatModel ?? DEFAULT_CHAT_MODEL;
        const providerKeys = { ...account.providerKeys, gemini: account.geminiApiKey };

        runtime.log?.(`[enso] card.summarize: ${sumCardId} (${msg.cardType})`);

        send({
          id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0,
          state: "delta", targetCardId: sumCardId,
          cardSummaryStatus: "generating",
          timestamp: Date.now(),
        });

        (async () => {
          try {
            const { summarizeCard } = await import("./card-summarizer.js");
            const summary = await summarizeCard({
              cardType: msg.cardType!,
              text: msg.cardContent!.text,
              data: msg.cardContent!.data,
              taskTerminals: msg.cardContent!.taskTerminals,
              model: chatModel,
              providerKeys,
            });

            send({
              id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0,
              state: "delta", targetCardId: sumCardId,
              cardSummary: summary,
              cardSummaryStatus: "ready",
              timestamp: Date.now(),
            });

            const sumConvId = resolveConversationId(client, msg);
            try {
              persistCard(clientId, sumConvId, {
                id: sumCardId, runId: "", type: msg.cardType!, role: "assistant",
                cardSummary: summary,
                timestamp: Date.now(),
              });
            } catch { /* best effort */ }

            // Automatically follow up with podcast generation
            // Detect if card has rich structured data → use deep content pipeline
            // Otherwise → use short-form 3-5 min podcast
            const cardData = (msg.cardContent?.data ?? {}) as Record<string, unknown>;
            const isRichContent = !!(
              (Array.isArray(cardData.keyFindings) && cardData.keyFindings.length > 3) ||
              (Array.isArray(cardData.sections) && cardData.sections.length > 2) ||
              cardData.focusEntity ||
              (Array.isArray(cardData.chapterSummaries) && cardData.chapterSummaries.length > 0)
            );

            runtime.log?.(`[enso] card.summarize podcast: rich=${isRichContent} for ${sumCardId}`);

            send({
              id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0,
              state: "delta", targetCardId: sumCardId,
              cardPodcastStatus: isRichContent ? "researching" : "writing_script",
              timestamp: Date.now(),
            });

            try {
              let audioUrl: string;
              let script: string;

              if (isRichContent) {
                // DEEP MODE — long-form podcast from structured data
                const { extractDeepContentSource, generateDeepContent } = await import("./deep-content.js");
                const source = extractDeepContentSource(cardData, sumCardId);
                if (source) {
                  // Use the source title or summary overview for identification
                  source.title = source.title || summary.overview.slice(0, 100);
                  source.summary = source.summary || summary.overview;
                  source.keyPoints = source.keyPoints || summary.keyOutcomes;

                  const result = await generateDeepContent({
                    entityId: source.sourceId,
                    onProgress: (progress) => {
                      send({
                        id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0,
                        state: "delta", targetCardId: sumCardId,
                        cardPodcastStatus: progress.phase,
                        timestamp: Date.now(),
                      });
                    },
                  });
                  audioUrl = result.audioUrl;
                  script = result.script;
                } else {
                  // Fallback to short-form if extraction fails
                  const { generatePodcastAudio } = await import("./podcast.js");
                  const slug = sumCardId.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 60);
                  const r = await generatePodcastAudio({
                    content: { title: summary.overview.slice(0, 100), summary: summary.overview, keyPoints: summary.keyOutcomes, narrative: summary.narrative },
                    audioSlug: slug, subdirectory: "card-summaries", model: chatModel, providerKeys,
                  });
                  audioUrl = r.audioUrl;
                  script = r.script;
                }
              } else {
                // QUICK MODE — short-form 3-5 min podcast (existing behavior)
                const { generatePodcastAudio } = await import("./podcast.js");
                const slug = sumCardId.replace(/[^a-zA-Z0-9-]/g, "_").slice(0, 60);
                const r = await generatePodcastAudio({
                  content: { title: summary.overview.slice(0, 100), summary: summary.overview, keyPoints: summary.keyOutcomes, narrative: summary.narrative },
                  audioSlug: slug, subdirectory: "card-summaries", model: chatModel, providerKeys,
                  onProgress: (status) => {
                    send({ id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "delta", targetCardId: sumCardId, cardPodcastStatus: status, timestamp: Date.now() });
                  },
                });
                audioUrl = r.audioUrl;
                script = r.script;
              }

              send({
                id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0,
                state: "delta", targetCardId: sumCardId,
                cardAudioUrl: audioUrl,
                cardPodcastScript: script,
                cardPodcastStatus: "ready",
                timestamp: Date.now(),
              });

              try {
                persistCard(clientId, sumConvId, {
                  id: sumCardId, runId: "", type: msg.cardType!, role: "assistant",
                  cardSummary: summary,
                  cardAudioUrl: audioUrl,
                  cardPodcastScript: script,
                  timestamp: Date.now(),
                });
              } catch { /* best effort */ }
            } catch (podErr) {
              logError("card.summarize", "podcast generation failed", podErr, { cardId: sumCardId });
              send({
                id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0,
                state: "delta", targetCardId: sumCardId,
                cardPodcastStatus: "error",
                cardSummaryError: podErr instanceof Error ? podErr.message : String(podErr),
                timestamp: Date.now(),
              });
            }
          } catch (err) {
            logError("card.summarize", "summarization failed", err, { cardId: sumCardId });
            send({
              id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0,
              state: "delta", targetCardId: sumCardId,
              cardSummaryStatus: "error",
              cardSummaryError: err instanceof Error ? err.message : String(err),
              timestamp: Date.now(),
            });
          }
        })();
      }
      break;
    }
    case "card.evolve": {
      if (msg.cardId && msg.cardType && msg.cardContent) {
        runtime.log?.(`[enso] card.evolve: ${msg.cardId} (${msg.cardType}${msg.appId ? `, app=${msg.appId}` : ""}${msg.evolutionGoal ? `, goal="${msg.evolutionGoal.slice(0, 60)}"` : ""})`);
        const { handleCardEvolution } = await import("./card-evolution.js");
        handleCardEvolution({
          cardId: msg.cardId,
          cardType: msg.cardType,
          cardContent: msg.cardContent,
          appId: msg.appId,
          toolFamily: msg.toolFamily,
          evolutionGoal: msg.evolutionGoal,
          includeResearch: msg.includeResearch,
          client,
          account,
        }).catch((err) => {
          logError("card.evolve", "Card evolution failed", err, { cardId: msg.cardId });
          runtime.error?.(`[enso] card.evolve error: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
      break;
    }
    case "card.release": {
      if (msg.cardId) {
        const releaseFamily = msg.toolFamily ?? msg.appId;
        runtime.log?.(`[enso] card.release: ${msg.cardId}${releaseFamily ? ` (family=${releaseFamily})` : ""}`);
        const { handleCardRelease } = await import("./card-release.js");
        handleCardRelease({
          cardId: msg.cardId,
          family: releaseFamily,
          client,
          onRestartRequested: ctx.onRestartRequested,
        }).catch((err) => {
          logError("card.release", "Release failed", err, { cardId: msg.cardId });
          runtime.error?.(`[enso] card.release error: ${err instanceof Error ? err.message : String(err)}`);
        });
      }
      break;
    }
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
    case "focus.evolve": {
      runtime.log?.(`[enso] focus evolution start: focusId=${(msg as any).focusId}`);
      try {
        const { launchFocusEvolve } = await import("./focus-areas.js");
        launchFocusEvolve({
          focusId: (msg as any).focusId,
          brief: (msg as any).brief || "",
          client,
          account,
        }).catch((err) => {
          logError("focus-evolve", "Focus evolution error", err);
        });
      } catch (importErr: any) {
        logError("focus-evolve", "Failed to import focus-areas module", importErr);
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
        const dynamicFamilies = new Set(dynamicApps.map((a) => a.toolFamily));
        const { getToolTemplate } = await import("./native-tools/registry.js");
        const builtInApps = APP_CATALOG
          .filter((cap) => {
            if (dynamicFamilies.has(cap.appId)) return false;
            if (!isToolRegistered(cap.primaryTool)) return false;
            if (cap.experience === "terminal") return true;
            if (!getToolTemplate(cap.appId, cap.signatureId)) return false;
            return true;
          })
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
        const appRunConvId = resolveConversationId(client, msg);
        runtime.log?.(`[enso:app-runner] apps.run: ${msg.toolFamily}`);
        try {
          const { loadAllApps } = await import("./app-persistence.js");
          const { executeToolDirect, normalizeDataForToolTemplate, getToolTemplateCode, getToolTemplate } = await import("./native-tools/registry.js");
          const { getApp } = await import("./app-catalog.js");
          const apps = loadAllApps();
          const app = apps.find((a) => a.spec.toolFamily === msg.toolFamily);

          if (app) {
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

            persistCard(clientId, appRunConvId, {
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

            persistCard(clientId, appRunConvId, {
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
      send({
        id: randomUUID(),
        runId: randomUUID(),
        sessionKey,
        seq: 0,
        state: "final",
        text: "Restarting server...",
        timestamp: Date.now(),
      });
      setTimeout(() => {
        if (ctx.onRestartRequested) {
          ctx.onRestartRequested();
        } else {
          process.exit(78);
        }
      }, 200);
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
      const { isValidClaudeCodeModel } = await import("./llm-provider.js");
      const validThinking = ["adaptive", "disabled"] as const;
      if (msg.claudeModel && isValidClaudeCodeModel(msg.claudeModel)) {
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
    case "settings.set_chat_model": {
      const { isValidChatModel } = await import("./llm-provider.js");
      if (msg.chatModel && isValidChatModel(msg.chatModel)) {
        client.chatModel = msg.chatModel;
        runtime.log?.(`[enso] chat model: ${client.chatModel}`);
      }
      send({
        id: randomUUID(),
        runId: randomUUID(),
        sessionKey,
        seq: 0,
        state: "final",
        settings: { mode: account.mode, chatModel: client.chatModel },
        timestamp: Date.now(),
      });
      break;
    }
    case "settings.set_provider_key": {
      if (msg.providerId && msg.providerApiKey) {
        const { saveProviderKey, getProviderStatus, loadProviderKeys } = await import("./llm-provider.js");
        saveProviderKey(msg.providerId, msg.providerApiKey);
        const freshKeys = loadProviderKeys();
        if (account.geminiApiKey) freshKeys.gemini = account.geminiApiKey;
        account.providerKeys = freshKeys;
        runtime.log?.(`[enso] provider key saved: ${msg.providerId}`);
        send({
          id: randomUUID(),
          runId: randomUUID(),
          sessionKey,
          seq: 0,
          state: "final",
          settings: { mode: account.mode, providers: getProviderStatus(account.providerKeys) },
          timestamp: Date.now(),
        });
      }
      break;
    }
    case "settings.set_language": {
      const validLanguages = ["en", "zh"] as const;
      if (msg.language && validLanguages.includes(msg.language as typeof validLanguages[number])) {
        client.language = msg.language;
        runtime.log?.(`[enso] language changed to: ${client.language}`);
        send({
          id: randomUUID(),
          runId: randomUUID(),
          sessionKey,
          seq: 0,
          state: "final",
          settings: { mode: account.mode, language: client.language },
          timestamp: Date.now(),
        });
      }
      break;
    }

    // ── User Context Discovery ──
    case "settings.set_context_consent": {
      try {
        const { readConsent, writeConsent } = await import("./user-context-tools.js");
        const source = msg.source;
        const enabled = msg.enabled;
        const consent = readConsent();
        if (source && source in consent && source !== "updatedAt") {
          (consent as unknown as Record<string, unknown>)[source] = enabled;
          consent.updatedAt = Date.now();
          writeConsent(consent);
          runtime.log?.(`[enso] context consent: ${source} = ${enabled}`);
        }
        send({
          id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
          data: { contextConsent: consent },
          timestamp: Date.now(),
        });
      } catch (err) {
        runtime.error?.("[enso] context consent error:", err);
      }
      break;
    }
    case "settings.context_scan_now": {
      try {
        const { readConsent } = await import("./user-context-tools.js");
        const { buildUserContextProfile } = await import("./user-context-builder.js");
        const consent = readConsent();
        const sources = Array.isArray(msg.sources) ? msg.sources as string[] : undefined;
        send({
          id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "delta",
          data: { contextScanStatus: { scanning: true, sources: sources || null } },
          timestamp: Date.now(),
        });
        buildUserContextProfile(consent, sources).then(async (result) => {
          const { getContextStatus } = await import("./user-context-tools.js");
          const status = getContextStatus();
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
            data: { contextScanStatus: { scanning: false, result }, contextStatus: status },
            timestamp: Date.now(),
          });
        }).catch((err) => {
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "error",
            text: `Context scan failed: ${err?.message || err}`,
            timestamp: Date.now(),
          });
        });
      } catch (err) {
        runtime.error?.("[enso] context scan error:", err);
      }
      break;
    }
    case "settings.get_context_status": {
      try {
        const { getContextStatus } = await import("./user-context-tools.js");
        let isFirstRun = false;
        try {
          const onboarding = await import("./onboarding.js");
          isFirstRun = onboarding.isFirstRun();
        } catch { /* onboarding module not available */ }
        send({
          id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
          data: { contextStatus: getContextStatus(), isFirstRun },
          timestamp: Date.now(),
        });
      } catch (err) {
        runtime.error?.("[enso] context status error:", err);
      }
      break;
    }
    case "settings.context_clear_data": {
      try {
        const { getContextDir } = await import("./user-context-tools.js");
        const { rmSync } = await import("fs");
        const cacheDir = join(getContextDir(), "cache");
        const profilePath = join(getContextDir(), "profile.json");
        const scanLogPath = join(getContextDir(), "scan-log.json");
        try { rmSync(cacheDir, { recursive: true, force: true }); } catch { /* ignore */ }
        try { rmSync(profilePath, { force: true }); } catch { /* ignore */ }
        try { rmSync(scanLogPath, { force: true }); } catch { /* ignore */ }
        runtime.log?.("[enso] context data cleared");
        send({
          id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
          data: { contextCleared: true },
          timestamp: Date.now(),
        });
      } catch (err) {
        runtime.error?.("[enso] context clear error:", err);
      }
      break;
    }

    // ── Onboarding ──
    case "onboarding.setup": {
      const { sources, createTasks } = msg as { sources: string[]; createTasks: boolean; type: string };
      try {
        const { runOnboardingSetup } = await import("./onboarding.js");
        const result = await runOnboardingSetup(sources, { createTasks }, (update) => {
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "delta",
            onboardingProgress: update,
            timestamp: Date.now(),
          });
        });
        send({
          id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
          onboardingProgress: { complete: true, result },
          timestamp: Date.now(),
        });
      } catch (err) {
        send({
          id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "error",
          text: `Onboarding failed: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        });
      }
      break;
    }
    case "onboarding.skip": {
      try {
        const { markOnboardingDone } = await import("./onboarding.js");
        markOnboardingDone();
      } catch { /* ignore */ }
      break;
    }

    // ── Proactive Engine ──
    case "proactive.get_suggestions": {
      try {
        const { getTopSuggestions } = await import("./proactive-engine.js");
        const count = msg.suggestionCount || 5;
        const suggestions = await getTopSuggestions(count);
        send({
          id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
          proactiveSuggestions: suggestions.map(s => ({
            id: s.id, pillar: s.pillar, priority: s.priority,
            title: s.title, description: s.description, icon: s.icon, action: s.action,
          })),
          timestamp: Date.now(),
        });
      } catch (err) {
        runtime.error?.("[enso] proactive suggestions error:", err);
      }
      break;
    }
    case "proactive.get_digest": {
      try {
        const { generateDailyDigest } = await import("./proactive-engine.js");
        const digest = generateDailyDigest();
        if (digest) {
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
            dailyDigest: {
              date: digest.date,
              greeting: digest.greeting,
              items: digest.items,
            },
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        runtime.error?.("[enso] proactive digest error:", err);
      }
      break;
    }
    case "proactive.dismiss": {
      try {
        const { dismissSuggestion, recordDismissal } = await import("./proactive-engine.js");
        const sId = msg.suggestionId;
        const sPillar = msg.suggestionPillar;
        if (sId) dismissSuggestion(sId);
        if (sPillar) recordDismissal(sPillar as never);
      } catch (err) {
        runtime.error?.("[enso] proactive dismiss error:", err);
      }
      break;
    }
    case "proactive.accept": {
      try {
        const { recordAcceptance } = await import("./proactive-engine.js");
        const sPillar = msg.suggestionPillar;
        if (sPillar) recordAcceptance(sPillar as never);
      } catch (err) {
        runtime.error?.("[enso] proactive accept error:", err);
      }
      break;
    }
    case "proactive.set_consent": {
      try {
        const { readProactiveConsent, writeProactiveConsent } = await import("./proactive-engine.js");
        const update = msg.proactiveConsentUpdate;
        if (update) {
          const current = readProactiveConsent();
          const updated = { ...current, ...update, updatedAt: Date.now() };
          writeProactiveConsent(updated);
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
            proactiveConsent: {
              enabled: updated.enabled,
              projectHealth: updated.projectHealth,
              research: updated.research,
              communication: updated.communication,
              workflow: updated.workflow,
              learning: updated.learning,
              ambient: updated.ambient,
            },
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        runtime.error?.("[enso] proactive consent error:", err);
      }
      break;
    }
    case "proactive.get_consent": {
      try {
        const { readProactiveConsent } = await import("./proactive-engine.js");
        const c = readProactiveConsent();
        send({
          id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
          proactiveConsent: {
            enabled: c.enabled,
            projectHealth: c.projectHealth,
            research: c.research,
            communication: c.communication,
            workflow: c.workflow,
            learning: c.learning,
            ambient: c.ambient,
          },
          timestamp: Date.now(),
        });
      } catch (err) {
        runtime.error?.("[enso] proactive get consent error:", err);
      }
      break;
    }
    case "proactive.get_analytics": {
      try {
        const { getAnalytics } = await import("./proactive-engine.js");
        send({
          id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
          proactiveAnalytics: getAnalytics(),
          timestamp: Date.now(),
        });
      } catch (err) {
        runtime.error?.("[enso] proactive analytics error:", err);
      }
      break;
    }

    // ── Shell PTY ──
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
      const shellCwd = msg.routing?.cwd
        ?? (existsSync(join(projectRoot, "package.json")) ? projectRoot : null)
        ?? process.cwd();
      const shellSessionId = shellPty.createShellSession({
        client,
        targetCardId: shellTargetCardId,
        cols: msg.shellCols ?? 80,
        rows: msg.shellRows ?? 24,
        cwd: shellCwd,
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
    case "card.persist": {
      const rec = msg.cardRecord;
      if (rec) {
        const convId = resolveConversationId(client, msg);
        persistCard(clientId, convId, {
          id: rec.id,
          runId: rec.runId,
          type: rec.type,
          role: rec.role,
          text: rec.text,
          data: rec.data as Record<string, unknown> | undefined,
          timestamp: rec.timestamp,
        });
      }
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
      const histConvId = resolveConversationId(client, msg);
      const historyCount = msg.historyCount ?? 50;
      const records = loadCardHistory(clientId, histConvId, historyCount);
      const conversationsList = listConversations(clientId);
      send({
        id: randomUUID(),
        runId: randomUUID(),
        sessionKey,
        seq: 0,
        state: "final",
        ...(records.length > 0 ? { cardHistory: records } : {}),
        conversationsList,
        timestamp: Date.now(),
      });
      const topics = getRecentConversationTopics(clientId, histConvId, 5);
      if (topics.length > 0) {
        send({
          id: randomUUID(),
          runId: randomUUID(),
          sessionKey,
          seq: 0,
          state: "final",
          recentTopics: topics,
          timestamp: Date.now(),
        });
      }
      break;
    }
    case "monitor.list": {
      const { listMonitors } = await import("./research-monitor.js");
      const monitors = listMonitors();
      send({
        id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
        monitorList: monitors.map((m) => ({ id: m.id, topic: m.topic, enabled: m.enabled, lastChecked: m.lastChecked })),
        timestamp: Date.now(),
      });
      break;
    }
    case "monitor.remove": {
      const { removeMonitor } = await import("./research-monitor.js");
      const monitorId = msg.monitorId;
      if (monitorId) removeMonitor(monitorId);
      break;
    }

    // ── Scheduled Tasks ──
    case "scheduled-task.list" as any: {
      const { listTasks } = await import("./scheduled-tasks.js");
      send({
        id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
        scheduledTasks: listTasks(),
        timestamp: Date.now(),
      });
      break;
    }
    case "scheduled-task.create" as any: {
      if (msg.scheduledTaskDef) {
        const { createTask } = await import("./scheduled-tasks.js");
        try {
          const task = createTask(msg.scheduledTaskDef);
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
            scheduledTaskUpdate: task,
            timestamp: Date.now(),
          });
        } catch (err) {
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "error",
            text: err instanceof Error ? err.message : String(err),
            timestamp: Date.now(),
          });
        }
      }
      break;
    }
    case "scheduled-task.update" as any: {
      if (msg.scheduledTaskId && msg.scheduledTaskUpdates) {
        const { updateTask } = await import("./scheduled-tasks.js");
        try {
          const task = updateTask(msg.scheduledTaskId, msg.scheduledTaskUpdates);
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
            scheduledTaskUpdate: task,
            timestamp: Date.now(),
          });
        } catch (err) {
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "error",
            text: err instanceof Error ? err.message : String(err),
            timestamp: Date.now(),
          });
        }
      }
      break;
    }
    case "scheduled-task.delete" as any: {
      if (msg.scheduledTaskId) {
        const { deleteTask } = await import("./scheduled-tasks.js");
        try {
          deleteTask(msg.scheduledTaskId);
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
            text: `Deleted task ${msg.scheduledTaskId}`,
            timestamp: Date.now(),
          });
        } catch (err) {
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "error",
            text: err instanceof Error ? err.message : String(err),
            timestamp: Date.now(),
          });
        }
      }
      break;
    }
    case "scheduled-task.trigger" as any: {
      if (msg.scheduledTaskId) {
        const { triggerTask } = await import("./scheduled-tasks.js");
        triggerTask(msg.scheduledTaskId).then((run) => {
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
            scheduledTaskRun: run,
            timestamp: Date.now(),
          });
        }).catch((err) => {
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "error",
            text: err instanceof Error ? err.message : String(err),
            timestamp: Date.now(),
          });
        });
      }
      break;
    }

    // ── Cross-Card Context Sharing (NEW) ──
    case "context.publish": {
      const { contextChannelName, contextSummary, contextData, cardId } = msg;
      if (!contextChannelName || !cardId) break;
      const ok = contextBus.publish(
        clientId,
        contextChannelName,
        cardId,
        contextSummary ?? "",
        contextData ?? {},
      );
      if (!ok) {
        send({
          id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "error",
          text: "Failed to publish context (size or channel limit exceeded).",
          timestamp: Date.now(),
        });
      }
      break;
    }
    case "context.subscribe": {
      const { contextChannelName, cardId } = msg;
      if (!contextChannelName || !cardId) break;
      // Remove existing subscription if any
      const subKey = `${clientId}:${cardId}:${contextChannelName}`;
      const existingSub = contextSubscriptions.get(subKey);
      if (existingSub) existingSub();

      const unsubscribe = contextBus.subscribe(
        clientId,
        contextChannelName,
        cardId,
        (update) => {
          send({
            id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
            contextUpdate: { channelName: contextChannelName, update },
            timestamp: Date.now(),
          });
        },
      );
      contextSubscriptions.set(subKey, unsubscribe);

      // Send latest value immediately if available
      const latest = contextBus.getLatest(clientId, contextChannelName);
      if (latest) {
        send({
          id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
          contextUpdate: { channelName: contextChannelName, update: latest },
          timestamp: Date.now(),
        });
      }
      break;
    }
    case "context.unsubscribe": {
      const { contextChannelName, cardId } = msg;
      if (!contextChannelName || !cardId) break;
      const unsubKey = `${clientId}:${cardId}:${contextChannelName}`;
      const unsub = contextSubscriptions.get(unsubKey);
      if (unsub) {
        unsub();
        contextSubscriptions.delete(unsubKey);
      }
      break;
    }
    case "context.list": {
      const channels = contextBus.listChannels(clientId);
      send({
        id: randomUUID(), runId: randomUUID(), sessionKey, seq: 0, state: "final",
        contextChannels: channels,
        timestamp: Date.now(),
      });
      break;
    }
  }
  } catch (err) {
    const isEnso = err instanceof EnsoError;
    const isOperational = isEnso && err.isOperational;
    const severity: ErrorSeverity = isEnso ? err.severity
      : (err instanceof SyntaxError ? "warning" : "critical");
    const category = isEnso ? err.category : "ws:unhandled";

    logError(category, `WS handler error on ${msg.type}`, err, {
      severity,
      metadata: {
        messageType: msg.type,
        breadcrumbs: getBreadcrumbs(),
        ...(isEnso ? err.metadata : {}),
      },
    });

    const userFacingTypes = new Set([
      "chat.send", "card.action", "card.enhance", "apps.run",
      "shell.create", "image_search",
    ]);

    if (userFacingTypes.has(msg.type)) {
      send({
        id: randomUUID(),
        runId: randomUUID(),
        sessionKey,
        seq: 0,
        state: "error",
        text: isOperational
          ? (err as EnsoError).message
          : "Something went wrong. Please try again.",
        timestamp: Date.now(),
      });
    }
  }
}
