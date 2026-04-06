/**
 * action-api.ts — HTTP Action API with SSE streaming.
 *
 * Exposes Enso's core capabilities (chat, orchestration, evolution, discovery,
 * research, Claude Code, apps) as HTTP endpoints.  Streaming responses use
 * Server-Sent Events so any HTTP client (curl -N, Python requests, etc.) can
 * consume them.
 *
 * The key trick: we create a synthetic ConnectedClient whose send() writes to
 * the SSE response stream instead of a WebSocket.  All downstream business
 * logic modules work unchanged.
 */

import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import type { ConnectedClient } from "./server.js";
import type { ServerMessage } from "./types.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { CoreConfig } from "./types.js";
import type { EnsoRuntime } from "./local-types.js";
import { logAction, logError } from "./action-log.js";
import { DEFAULT_CONVERSATION_ID } from "./memory-bridge.js";
import { GEMINI_MODEL_FAST } from "./config.js";

// ── SSE Bridge ──────────────────────────────────────────────────────────────

function createSSEClient(
  res: Response,
  settings?: { model?: string; thinking?: string; chatModel?: string },
): ConnectedClient {
  const clientId = `api-${randomUUID()}`;
  return {
    id: clientId,
    sessionKey: `api:enso:api:${clientId}`,
    ws: { readyState: 1 } as any,
    send: (msg: ServerMessage) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(msg)}\n\n`);
      }
    },
    _disconnectedBuffer: [],
    conversationId: DEFAULT_CONVERSATION_ID,
    claudeModel: settings?.model,
    claudeThinking: (settings?.thinking as "adaptive" | "disabled") ?? "adaptive",
    chatModel: settings?.chatModel,
  };
}

function initSSE(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

function endSSE(res: Response, extra?: Record<string, unknown>): void {
  if (!res.writableEnded) {
    res.write(`event: done\ndata: ${JSON.stringify({ status: "complete", ...extra })}\n\n`);
    res.end();
  }
}

// ── Router Factory ──────────────────────────────────────────────────────────

export function createActionRouter(deps: {
  account: ResolvedEnsoAccount;
  config: CoreConfig;
  runtime: EnsoRuntime;
}): Router {
  const { account, config, runtime } = deps;
  const router = Router();

  // ── POST /api/actions/chat ──
  router.post("/api/actions/chat", async (req: Request, res: Response) => {
    const { text, model, thinking, chatModel } = req.body as {
      text?: string; model?: string; thinking?: string; chatModel?: string;
    };
    if (!text) { res.status(400).json({ error: "text is required" }); return; }

    initSSE(res);
    const client = createSSEClient(res, { model, thinking, chatModel });
    const runId = randomUUID();

    logAction({ ts: Date.now(), type: "action", category: "action-api", message: `chat: ${text.slice(0, 80)}` });

    try {
      const chatModel = client.chatModel ?? GEMINI_MODEL_FAST;
      const isGeminiModel = chatModel.startsWith("gemini-");

      if (!account.geminiApiKey && isGeminiModel) {
        client.send({
          id: randomUUID(), runId, sessionKey: client.sessionKey, seq: 0,
          state: "error", text: "No GEMINI_API_KEY configured. Add it in Settings or ~/.enso/api-keys.json",
          timestamp: Date.now(),
        });
      } else {
        const { llm } = await import("./llm.js");
        const providerKeys = { ...account.providerKeys, gemini: account.geminiApiKey };
        const answer = await llm({ prompt: text, model: chatModel, providerKeys });
        client.send({
          id: randomUUID(), runId, sessionKey: client.sessionKey, seq: 0,
          state: "final", text: answer, timestamp: Date.now(),
        });
      }
    } catch (err) {
      logError("action-api", "chat failed", err);
      client.send({
        id: randomUUID(), runId, sessionKey: client.sessionKey, seq: 0,
        state: "error", text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      });
    }

    // For non-streaming paths (simple answers), end immediately.
    // Streaming paths (orchestration, claude-code) will keep the connection open
    // and the client can detect completion via the final state message.
    // Give streaming operations a moment to start, then set up a completion watcher.
    setTimeout(() => endSSE(res, { runId }), 500);
  });

  // ── POST /api/actions/research ──
  router.post("/api/actions/research", async (req: Request, res: Response) => {
    const { query, depth } = req.body as { query?: string; depth?: "quick" | "standard" | "deep" };
    if (!query) { res.status(400).json({ error: "query is required" }); return; }

    initSSE(res);
    const client = createSSEClient(res);

    logAction({ ts: Date.now(), type: "action", category: "action-api", message: `research: ${query.slice(0, 80)}` });

    try {
      await routeToResearchAPI({
        topic: query,
        depth: depth === "quick" ? "quick" : "standard",
        text: query,
        client, account, config, runtime,
      });
    } catch (err) {
      logError("action-api", "research failed", err);
      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
        state: "error", text: `Research error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      });
    }

    setTimeout(() => endSSE(res), 500);
  });

  // ── POST /api/actions/orchestrate ──
  router.post("/api/actions/orchestrate", async (req: Request, res: Response) => {
    const { goal } = req.body as { goal?: string };
    if (!goal) { res.status(400).json({ error: "goal is required" }); return; }

    initSSE(res);
    const client = createSSEClient(res);

    logAction({ ts: Date.now(), type: "action", category: "action-api", message: `orchestrate: ${goal.slice(0, 80)}` });

    try {
      const { handleOrchestration } = await import("./orchestrator.js");
      // Don't await — orchestration is long-running and streams progress
      handleOrchestration({
        userMessage: goal,
        classification: { complexity: "orchestrated", reasoning: "CLI-initiated" },
        client,
        account,
      }).catch((err) => {
        logError("action-api", "orchestration failed", err);
        client.send({
          id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
          state: "error", text: `Orchestration error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        });
        endSSE(res);
      });
    } catch (err) {
      logError("action-api", "orchestrate setup failed", err);
      res.status(500).json({ error: String(err) });
    }

    // Keep connection open — orchestration streams progress over minutes
    req.on("close", () => { /* client disconnected */ });
  });

  // ── POST /api/actions/evolve ──
  router.post("/api/actions/evolve", async (req: Request, res: Response) => {
    const { projectId, goal } = req.body as { projectId?: string; goal?: string };

    initSSE(res);
    const client = createSSEClient(res);

    logAction({ ts: Date.now(), type: "action", category: "action-api", message: `evolve: project=${projectId ?? "default"} goal=${goal?.slice(0, 60) ?? "none"}` });

    try {
      const { handleEvolutionSprint } = await import("./evolution.js");
      handleEvolutionSprint({
        projectId,
        goal,
        client,
        account,
      }).catch((err) => {
        logError("action-api", "evolution failed", err);
        client.send({
          id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
          state: "error", text: `Evolution error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        });
        endSSE(res);
      });
    } catch (err) {
      logError("action-api", "evolve setup failed", err);
      res.status(500).json({ error: String(err) });
    }

    req.on("close", () => { /* client disconnected */ });
  });

  // ── POST /api/actions/discover ──
  router.post("/api/actions/discover", async (req: Request, res: Response) => {
    const { focus } = req.body as { focus?: string };

    initSSE(res);
    const client = createSSEClient(res);

    logAction({ ts: Date.now(), type: "action", category: "action-api", message: `discover: ${focus?.slice(0, 80) ?? "(no focus)"}` });

    try {
      const { handleDiscovery } = await import("./discovery.js");
      handleDiscovery({
        focus: focus || undefined,
        client,
        account,
      }).catch((err) => {
        logError("action-api", "discovery failed", err);
        client.send({
          id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
          state: "error", text: `Discovery error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        });
        endSSE(res);
      });
    } catch (err) {
      logError("action-api", "discover setup failed", err);
      res.status(500).json({ error: String(err) });
    }

    req.on("close", () => { /* client disconnected */ });
  });

  // ── POST /api/actions/code ──
  router.post("/api/actions/code", async (req: Request, res: Response) => {
    const { prompt, cwd, model, thinking } = req.body as {
      prompt?: string; cwd?: string; model?: string; thinking?: string;
    };
    if (!prompt) { res.status(400).json({ error: "prompt is required" }); return; }

    initSSE(res);
    const client = createSSEClient(res, { model, thinking });
    const runId = randomUUID();

    logAction({ ts: Date.now(), type: "action", category: "action-api", message: `code: ${prompt.slice(0, 80)}` });

    try {
      const { runClaudeCode } = await import("./claude-code.js");
      runClaudeCode({
        prompt,
        cwd,
        client,
        runId,
        model: client.claudeModel,
        thinking: client.claudeThinking,
      }).then(() => {
        endSSE(res, { runId });
      }).catch((err) => {
        logError("action-api", "claude-code failed", err);
        client.send({
          id: randomUUID(), runId, sessionKey: client.sessionKey, seq: 0,
          state: "error", text: `Code error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        });
        endSSE(res, { runId });
      });
    } catch (err) {
      logError("action-api", "code setup failed", err);
      res.status(500).json({ error: String(err) });
    }

    req.on("close", () => { /* client disconnected */ });
  });

  // ── GET /api/actions/apps ──
  router.get("/api/actions/apps", async (_req: Request, res: Response) => {
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
        };
      });

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

      res.json({ apps: [...builtInApps, ...dynamicApps] });
    } catch (err) {
      logError("action-api", "apps list failed", err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── POST /api/actions/apps/run ──
  router.post("/api/actions/apps/run", async (req: Request, res: Response) => {
    const { toolFamily, params } = req.body as { toolFamily?: string; params?: Record<string, unknown> };
    if (!toolFamily) { res.status(400).json({ error: "toolFamily is required" }); return; }

    initSSE(res);
    const client = createSSEClient(res);

    logAction({ ts: Date.now(), type: "action", category: "action-api", message: `apps.run: ${toolFamily}` });

    try {
      const { loadAllApps } = await import("./app-persistence.js");
      const { executeToolDirect, getToolTemplateCode, getToolTemplate, normalizeDataForToolTemplate } = await import("./native-tools/registry.js");
      const { getApp } = await import("./app-catalog.js");
      const apps = loadAllApps();
      const app = apps.find((a) => a.spec.toolFamily === toolFamily);

      if (app) {
        const primary = app.spec.tools.find((t) => t.isPrimary) ?? app.spec.tools[0];
        const toolName = `${app.spec.toolPrefix}${primary.suffix}`;
        const mergedParams = { ...primary.sampleParams, ...params };
        const result = await executeToolDirect(toolName, mergedParams);
        const data = result.success && result.data != null ? result.data : primary.sampleData;

        client.send({
          id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
          state: "final", data, timestamp: Date.now(),
        });
      } else {
        const cap = getApp(toolFamily);
        if (!cap) {
          client.send({
            id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
            state: "error", text: `App "${toolFamily}" not found.`, timestamp: Date.now(),
          });
        } else {
          const result = await executeToolDirect(cap.primaryTool, params ?? {});
          if (!result.success) {
            client.send({
              id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
              state: "error", text: `Failed to run app: ${result.error ?? "unknown error"}`, timestamp: Date.now(),
            });
          } else {
            const template = getToolTemplate(cap.appId, cap.signatureId);
            const normalized = template
              ? normalizeDataForToolTemplate(template, result.data)
              : result.data;
            client.send({
              id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
              state: "final", data: normalized, timestamp: Date.now(),
            });
          }
        }
      }
    } catch (err) {
      logError("action-api", "apps.run failed", err, { toolFamily });
      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
        state: "error", text: `App run failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      });
    }

    endSSE(res);
  });

  // ── POST /api/actions/apps/build ──
  router.post("/api/actions/apps/build", async (req: Request, res: Response) => {
    const { instruction } = req.body as { instruction?: string };
    if (!instruction) { res.status(400).json({ error: "instruction is required" }); return; }

    initSSE(res);
    const client = createSSEClient(res);

    logAction({ ts: Date.now(), type: "action", category: "action-api", message: `apps.build: ${instruction.slice(0, 80)}` });

    try {
      const { handleBuildAppViaClaude } = await import("./build-via-claude.js");
      handleBuildAppViaClaude({
        instruction,
        originalText: instruction,
        targetCardId: randomUUID(),
        client,
        account,
      }).then(() => {
        endSSE(res);
      }).catch((err) => {
        logError("action-api", "app build failed", err);
        client.send({
          id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
          state: "error", text: `Build failed: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        });
        endSSE(res);
      });
    } catch (err) {
      logError("action-api", "build setup failed", err);
      res.status(500).json({ error: String(err) });
    }

    req.on("close", () => { /* client disconnected */ });
  });

  // ── DELETE /api/actions/cancel/:runId ──
  router.delete("/api/actions/cancel/:runId", async (req: Request, res: Response) => {
    try {
      const { cancelClaudeCodeRun } = await import("./claude-code.js");
      const cancelled = cancelClaudeCodeRun(String(req.params.runId));
      res.json({ cancelled, runId: req.params.runId });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function routeToResearchAPI(params: {
  topic: string;
  depth: "quick" | "standard";
  text: string;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
  config: CoreConfig;
  runtime: EnsoRuntime;
}): Promise<void> {
  const { topic, depth, text, client, account, config, runtime } = params;

  const { setLastUserMessage } = await import("./researcher-tools.js");
  setLastUserMessage(text);

  const { executeToolDirect, getToolTemplateCode, getToolTemplate } = await import("./native-tools/registry.js");
  const { getApp } = await import("./app-catalog.js");
  const { registerCardContext } = await import("./outbound.js");

  const cap = getApp("researcher");
  if (!cap) {
    client.send({
      id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
      state: "error", text: "Researcher app not available.", timestamp: Date.now(),
    });
    return;
  }

  const toolName = "enso_researcher_search";
  const searchParams = { query: topic, depth };
  const result = await executeToolDirect(toolName, searchParams);

  if (!result.success) {
    client.send({
      id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
      state: "error", text: `Research failed: ${result.error ?? "unknown"}`, timestamp: Date.now(),
    });
    return;
  }

  const template = getToolTemplate(cap.appId, cap.signatureId);
  const generatedUI = template ? getToolTemplateCode(template) : undefined;
  const cardId = randomUUID();

  registerCardContext(cardId, {
    cardId,
    originalPrompt: text,
    originalResponse: "",
    currentData: structuredClone(result.data),
    geminiApiKey: account.geminiApiKey,
    account,
    mode: "full",
    actionHistory: [],
    appToolHint: { toolName, params: searchParams, handlerPrefix: "enso_researcher_" },
    interactionMode: "tool",
    toolFamily: "researcher",
    signatureId: cap.signatureId,
    coverageStatus: "covered",
  });

  client.send({
    id: cardId,
    runId: randomUUID(),
    sessionKey: client.sessionKey,
    seq: 0,
    state: "final",
    data: result.data,
    generatedUI,
    cardMode: {
      interactionMode: "tool",
      toolFamily: "researcher",
      signatureId: cap.signatureId,
      coverageStatus: "covered",
    },
    timestamp: Date.now(),
  });
}
