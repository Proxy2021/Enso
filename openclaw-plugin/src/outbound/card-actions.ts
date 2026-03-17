import { randomUUID } from "crypto";
import type { RuntimeEnv } from "openclaw/plugin-sdk";
import type { ConnectedClient } from "../server.js";
import { getActiveAccount } from "../server.js";
import type { CardModeDetail, CoreConfig, OperationStage, ServerMessage } from "../types.js";
import { APP_CATALOG } from "../app-catalog.js";
import {
  inferToolTemplate,
  executeToolDirect,
  getActionDescriptions,
  getToolTemplateCode,
  isToolRegistered,
  getGeneratedTemplateCodeBySignature,
  registerAppTemplate,
  isDynamicTool,
  getExecutorBody,
  hotSwapExecutor,
  getRegisteredToolCatalog,
} from "../native-tools/registry.js";
import {
  buildToolConsoleFamilyData,
  buildToolConsoleHomeData,
  handleToolConsoleAdd,
} from "../tooling-console.js";
import { logAction, logError, logFix } from "../action-log.js";
import { setResearchProgressCallback, setDeepResearchLauncher } from "../researcher-tools.js";
import { runClaudeCode } from "../claude-code.js";
import { handleDeepResearchBuild } from "../build-via-claude.js";
// fs imports removed — no longer needed after deep research refactor
import { recordAppInteraction, buildFailureContext } from "../interaction-tracker.js";
import type { CardContext } from "./card-context.js";
import { cardContexts, isPathWithinRoot, validateScopedAction } from "./card-context.js";
import {
  compactPromptText,
  summarizeCardDataForAgent,
  renderFollowupUI,
  applyDetectedToolTemplate,
  cardModeFromContext,
} from "./helpers.js";

// ── Context Reconstruction ──

/**
 * Attempt to reconstruct a minimal CardContext for known tool families
 * when the original context was lost (e.g. server restart).
 * Returns null if the action/payload doesn't match a known pattern.
 */
function tryReconstructContext(
  cardId: string,
  action: string,
  payload: unknown,
  client: ConnectedClient,
): CardContext | null {
  const p = (payload ?? {}) as Record<string, unknown>;

  // ── Researcher family ──
  const researcherActions = ["follow_up", "compare", "deep_dive", "search", "deep_research", "generate_podcast", "send_report", "delete_history", "clear_all_history"];
  if (researcherActions.includes(action) || (p.topic && typeof p.topic === "string")) {
    const account = getActiveAccount();
    if (!account) return null;
    return {
      cardId,
      originalPrompt: String(p.topic ?? p.question ?? ""),
      originalResponse: "",
      currentData: { tool: "enso_researcher_search", topic: p.topic ?? "", phase: "complete" },
      geminiApiKey: account.geminiApiKey,
      account,
      mode: "full",
      actionHistory: [],
      appToolHint: {
        toolName: "enso_researcher_search",
        params: { topic: String(p.topic ?? ""), depth: "standard" },
        handlerPrefix: "enso_researcher_",
      },
      interactionMode: "tool",
      toolFamily: "researcher",
      signatureId: "research_board",
    };
  }

  return null;
}

// ── Card Action Processing ──

/**
 * Processes an interactive action on an existing card (plugin path).
 * Applies mechanical data mutations, regenerates UI via Gemini,
 * and sends the update back targeted to the same card.
 */
export async function handlePluginCardAction(params: {
  cardId: string;
  action: string;
  payload: unknown;
  mode?: "im" | "ui" | "full";
  client: ConnectedClient;
  config: CoreConfig;
  runtime: RuntimeEnv;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { cardId, mode, client, config, runtime, statusSink } = params;
  let { action, payload } = params;
  const operationId = randomUUID();
  const sendOperation = (stage: OperationStage, label: string, message?: string) => {
    client.send({
      id: randomUUID(),
      runId: operationId,
      sessionKey: client.sessionKey,
      seq: 0,
      state: "delta",
      targetCardId: cardId,
      operation: {
        operationId,
        stage,
        label,
        message,
        cancellable: false,
      },
      timestamp: Date.now(),
    });
  };

  logAction({ ts: Date.now(), type: "action", category: "action", message: `Action: ${action}`, cardId, metadata: { payload } });
  sendOperation("processing", "Processing action");

  let ctx = cardContexts.get(cardId);
  if (!ctx) {
    // ── Reconstruct minimal context for known tool families ──
    // After server restart, card contexts are lost. For tools where the
    // payload is self-contained (e.g. researcher follow_up/compare/deep_dive),
    // we can reconstruct enough context to dispatch the action.
    const reconstructed = tryReconstructContext(cardId, action, payload, client);
    if (reconstructed) {
      ctx = reconstructed;
      cardContexts.set(cardId, ctx);
      logAction({ ts: Date.now(), type: "action", category: "action", message: `Reconstructed context for family=${ctx.toolFamily}`, cardId });
    } else {
      logError("action", "Card context not found", undefined, { cardId });
      client.send({
        id: randomUUID(),
        runId: randomUUID(),
        sessionKey: client.sessionKey,
        seq: 0,
        state: "error",
        targetCardId: cardId,
        text: "Card context not found — the server may have restarted. Try running the app again.",
        operation: {
          operationId,
          stage: "error",
          label: "Action failed",
          cancellable: false,
        },
        timestamp: Date.now(),
      });
      return;
    }
  }

  logAction({ ts: Date.now(), type: "action", category: "action", message: `Context found: cardId=${cardId}, family=${ctx.toolFamily ?? "none"}, signature=${ctx.signatureId ?? "none"}, mode=${ctx.interactionMode}, hasAppHint=${!!ctx.appToolHint}` });

  // Determine effective mode at click-time to avoid stale per-card mode.
  // Priority: explicit client mode > active account mode > card context mode.
  const activeMode = getActiveAccount()?.mode;
  const effectiveMode = mode ?? activeMode ?? ctx.mode;
  ctx.mode = effectiveMode;

  // IM mode has no card actions — reject early
  if (effectiveMode === "im") {
    client.send({
      id: randomUUID(),
      runId: randomUUID(),
      sessionKey: client.sessionKey,
      seq: 0,
      state: "error",
      targetCardId: cardId,
      text: "Card actions are not available in IM mode.",
      operation: {
        operationId,
        stage: "error",
        label: "Action not allowed",
        cancellable: false,
      },
      timestamp: Date.now(),
    });
    return;
  }

  // ── Scoped share enforcement ──
  if (ctx.allowedRoot) {
    // Redirect list_drives → browse_folder at allowed root
    if (action === "list_drives") {
      logAction({ ts: Date.now(), type: "action", category: "action", message: `Scoped share: redirecting list_drives → browse_folder at root="${ctx.allowedRoot}"` });
      action = "browse_folder";
      payload = { path: ctx.allowedRoot };
    }
    // Default browse_folder with no path → allowed root
    const bp = (payload ?? {}) as Record<string, unknown>;
    if (action === "browse_folder" && (!bp.path || (typeof bp.path === "string" && !bp.path.trim()))) {
      (payload as Record<string, unknown>).path = ctx.allowedRoot;
    }
    // Validate paths against allowed root
    const scopeError = validateScopedAction(ctx, action, payload);
    if (scopeError) {
      logAction({ ts: Date.now(), type: "action", category: "action", message: `Scoped share blocked: ${scopeError}` });
      client.send({
        id: randomUUID(),
        runId: randomUUID(),
        sessionKey: client.sessionKey,
        seq: 0,
        state: "error",
        targetCardId: cardId,
        text: scopeError,
        operation: { operationId, stage: "error", label: "Access restricted", cancellable: false },
        timestamp: Date.now(),
      });
      return;
    }
  }

  // Record action in history (in-memory, volatile)
  ctx.actionHistory.push({ action, payload, timestamp: Date.now() });

  // Record action in persistent interaction tracker (Living Apps)
  recordAppInteraction(ctx.toolFamily, {
    type: action === "refine" ? "refine" : "action",
    action,
    payload,
    cardId,
    timestamp: Date.now(),
  });

  // Block code modification actions for scoped shares
  if (ctx.allowedRoot && (action === "refine" || action === "fix_with_code" || action === "improve_with_code")) {
    client.send({
      id: randomUUID(),
      runId: randomUUID(),
      sessionKey: client.sessionKey,
      seq: 0,
      state: "error",
      targetCardId: cardId,
      text: "This action is not available for shared galleries.",
      operation: { operationId, stage: "error", label: "Action not allowed", cancellable: false },
      timestamp: Date.now(),
    });
    return;
  }

  // ── Fix with Code: launch Claude Code debugging session ──
  if (action === "fix_with_code") {
    const p = (payload ?? {}) as Record<string, unknown>;
    const errorStr = String(p.error ?? "Unknown error").trim();
    const toolName = String(p.toolName ?? ctx.appToolHint?.toolName ?? "unknown");

    logAction({ ts: Date.now(), type: "action", category: "action:fix_with_code", message: `Fix with code: ${toolName}`, cardId, toolFamily: ctx.toolFamily, metadata: { error: errorStr, toolName } });

    // Build debugging prompt with context
    const debugParts: string[] = [
      `An Enso app tool is failing and needs debugging.`,
      ``,
      `## Error`,
      `\`\`\``,
      errorStr,
      `\`\`\``,
      ``,
      `## Tool Name`,
      toolName,
    ];

    // Include executor body if it's a dynamic tool
    if (isDynamicTool(toolName)) {
      const execBody = getExecutorBody(toolName);
      if (execBody) {
        debugParts.push(``, `## Executor Source`, `\`\`\`javascript`, execBody, `\`\`\``);
      }
    }

    // Include template if available
    if (ctx.signatureId) {
      const templateCode = getGeneratedTemplateCodeBySignature(ctx.signatureId);
      if (templateCode) {
        debugParts.push(``, `## Template JSX`, `\`\`\`jsx`, templateCode.slice(0, 3000), `\`\`\``);
      }
    }

    // Inject interaction trail for contextual debugging (Living Apps Phase 1B)
    if (ctx.toolFamily) {
      const failureCtx = buildFailureContext(ctx.toolFamily, errorStr);
      if (failureCtx.interactionTrail.length > 0) {
        debugParts.push(``, failureCtx.formatted);
      }
    }

    debugParts.push(
      ``,
      `## Instructions`,
      `Please investigate and fix this error. The tool/template files are in:`,
      `- Dynamic apps: ~/.openclaw/enso-apps/<family>/ or openclaw-plugin/apps/<family>/`,
      `- Built-in apps: openclaw-plugin/src/`,
      ``,
      `After identifying the issue, edit the appropriate file(s) to fix the bug.`,
      ``,
    );

    const debugPrompt = debugParts.join("\n");

    // Send complete status to restore the source card
    client.send({
      id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
      state: "final", targetCardId: cardId,
      operation: { operationId, stage: "complete", label: "Launching debugger", cancellable: false },
      timestamp: Date.now(),
    });

    // Launch Claude Code directly (same path as chat.send with claude-code routing)
    try {
      const { runClaudeCode } = await import("../claude-code.js");
      const runId = randomUUID();
      await runClaudeCode({
        prompt: debugPrompt,
        client,
        runId,
      });
      logFix({
        description: `Fixed error in ${toolName}`,
        error: errorStr.slice(0, 500),
        resolution: "Claude Code debugged and fixed the issue",
        category: ctx.toolFamily ?? "app",
      });
    } catch (err) {
      logError("action:fix_with_code", "fix_with_code failed", err, { cardId, toolFamily: ctx.toolFamily });
      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
        state: "error", targetCardId: cardId,
        text: `Failed to launch debugger: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      });
    }
    return;
  }

  // ── Improve with Code: launch Claude Code with full app context ──
  if (action === "improve_with_code") {
    const p = (payload ?? {}) as Record<string, unknown>;
    const instruction = String(p.instruction ?? "").trim();
    if (!instruction) {
      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
        state: "error", targetCardId: cardId,
        text: "Instruction is empty.",
        operation: { operationId, stage: "error", label: "Failed", cancellable: false },
        timestamp: Date.now(),
      });
      return;
    }

    logAction({ ts: Date.now(), type: "action", category: "action:improve_with_code", message: `Improve with code: ${instruction.slice(0, 100)}`, cardId, toolFamily: ctx.toolFamily });

    const improveParts: string[] = [
      `A user wants to improve an existing Enso app.`,
      ``,
      `## User Instruction`,
      instruction,
      ``,
    ];

    if (ctx.toolFamily) {
      improveParts.push(`## App: ${ctx.toolFamily}`, `Location: openclaw-plugin/apps/${ctx.toolFamily}/`, ``);
    }

    if (ctx.originalPrompt) {
      improveParts.push(`## Original Prompt`, ctx.originalPrompt.slice(0, 1000), ``);
    }

    if (ctx.currentData != null) {
      improveParts.push(`## Current Data (sample)`, "```json", JSON.stringify(ctx.currentData, null, 2).slice(0, 2000), "```", ``);
    }

    if (ctx.signatureId) {
      const templateCode = getGeneratedTemplateCodeBySignature(ctx.signatureId);
      if (templateCode) {
        improveParts.push(`## Template JSX`, "```jsx", templateCode.slice(0, 4000), "```", ``);
      }
    }

    if (ctx.appToolHint && isDynamicTool(ctx.appToolHint.toolName)) {
      const execBody = getExecutorBody(ctx.appToolHint.toolName);
      if (execBody) {
        improveParts.push(`## Executor Source (${ctx.appToolHint.toolName})`, "```javascript", execBody.slice(0, 2000), "```", ``);
      }
    }

    improveParts.push(
      `## Instructions`,
      `Read CLAUDE-REFERENCE.md for the app structure reference.`,
      `Modify template.jsx, executors/*.js, or app.json as needed.`,
      `After making changes, run \`npm run build\` to verify the fix compiles.`,
      ``,
    );

    // Restore source card
    client.send({
      id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
      state: "final", targetCardId: cardId,
      operation: { operationId, stage: "complete", label: "Launching Code", cancellable: false },
      timestamp: Date.now(),
    });

    try {
      const { runClaudeCode } = await import("../claude-code.js");
      await runClaudeCode({ prompt: improveParts.join("\n"), client, runId: randomUUID() });
      logFix({
        description: `Improved app: ${instruction.slice(0, 100)}`,
        error: "",
        resolution: "Claude Code implemented the improvement",
        category: ctx.toolFamily ?? "app",
      });
    } catch (err) {
      logError("action:improve_with_code", "improve_with_code failed", err, { cardId, toolFamily: ctx.toolFamily });
      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
        state: "error", targetCardId: cardId,
        text: `Failed to launch Code: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      });
    }
    return;
  }

  // ── Refine action: re-generate template only ──
  if (action === "refine" && ctx.signatureId && ctx.geminiApiKey) {
    const p = (payload ?? {}) as Record<string, unknown>;
    const instruction = String(p.instruction ?? "").trim();
    if (!instruction) {
      client.send({
        id: randomUUID(),
        runId: randomUUID(),
        sessionKey: client.sessionKey,
        seq: 0,
        state: "error",
        targetCardId: cardId,
        text: "Refine instruction is empty.",
        operation: { operationId, stage: "error", label: "Refine failed", cancellable: false },
        timestamp: Date.now(),
      });
      return;
    }

    logAction({ ts: Date.now(), type: "action", category: "action:refine", message: `Refine: cardId=${cardId}, instruction="${instruction.slice(0, 100)}"`, cardId });
    sendOperation("generating_ui", "Refining template");

    try {
      const { refineTemplate } = await import("../tool-factory.js");
      const existingTemplate = getGeneratedTemplateCodeBySignature(ctx.signatureId);
      const result = await refineTemplate({
        toolFamily: ctx.toolFamily ?? "unknown",
        signatureId: ctx.signatureId,
        currentData: ctx.currentData,
        instruction,
        existingTemplate: existingTemplate ?? undefined,
        apiKey: ctx.geminiApiKey,
      });

      if (!result.valid) {
        logError("action:refine", "Template validation failed", undefined, { cardId });
        client.send({
          id: randomUUID(),
          runId: randomUUID(),
          sessionKey: client.sessionKey,
          seq: 0,
          state: "error",
          targetCardId: cardId,
          text: `Template refinement failed: ${result.errors.join("; ")}`,
          operation: { operationId, stage: "error", label: "Refine failed", cancellable: false },
          timestamp: Date.now(),
        });
        return;
      }

      // Update stored template code
      registerAppTemplate(ctx.signatureId, result.templateJSX);
      logAction({ ts: Date.now(), type: "action", category: "action:refine", message: `Template updated for ${ctx.signatureId} (${result.templateJSX.length} chars)`, cardId });

      // Send updated card with new template + existing data
      client.send({
        id: randomUUID(),
        runId: randomUUID(),
        sessionKey: client.sessionKey,
        seq: 0,
        state: "final",
        targetCardId: cardId,
        data: ctx.currentData,
        generatedUI: result.templateJSX,
        cardMode: cardModeFromContext(ctx),
        operation: { operationId, stage: "complete", label: "Refined", cancellable: false },
        timestamp: Date.now(),
      });
      return;
    } catch (err) {
      logError("action:refine", "Template refine failed", err, { cardId });
      client.send({
        id: randomUUID(),
        runId: randomUUID(),
        sessionKey: client.sessionKey,
        seq: 0,
        state: "error",
        targetCardId: cardId,
        text: `Refine error: ${err instanceof Error ? err.message : String(err)}`,
        operation: { operationId, stage: "error", label: "Refine failed", cancellable: false },
        timestamp: Date.now(),
      });
      return;
    }
  }

  /**
   * Send an action result respecting the card's mode:
   * - full: in-place update via targetCardId
   * - ui: restore source card, then create a new card below
   */
  const sendActionResult = (resultData: unknown, generatedUI: string) => {
    if (effectiveMode === "ui") {
      // Restore the source card (frontend preserves original data/generatedUI
      // when msg.data is absent via `msg.data ?? card.data`)
      client.send({
        id: randomUUID(),
        runId: randomUUID(),
        sessionKey: client.sessionKey,
        seq: 0,
        state: "final",
        targetCardId: cardId,
        cardMode: cardModeFromContext(ctx),
        operation: {
          operationId,
          stage: "complete",
          label: "Action complete",
          cancellable: false,
        },
        timestamp: Date.now(),
      });

      // Create a new card with the action result
      const newCardId = randomUUID();
      client.send({
        id: newCardId,
        runId: randomUUID(),
        sessionKey: client.sessionKey,
        seq: 0,
        state: "final",
        data: resultData,
        generatedUI,
        cardMode: cardModeFromContext(ctx),
        operation: {
          operationId,
          stage: "complete",
          label: "Action complete",
          cancellable: false,
        },
        timestamp: Date.now(),
      });

      // Register context for the new card so it can receive further actions
      cardContexts.set(newCardId, {
        cardId: newCardId,
        originalPrompt: ctx.originalPrompt,
        originalResponse: ctx.originalResponse,
        currentData: structuredClone(resultData),
        geminiApiKey: ctx.geminiApiKey,
        account: ctx.account,
        mode: ctx.mode,
        appToolHint: ctx.appToolHint,
        actionHistory: [],
        interactionMode: ctx.interactionMode,
        toolFamily: ctx.toolFamily,
        signatureId: ctx.signatureId,
        coverageStatus: ctx.coverageStatus,
      });
    } else {
      // Full mode: in-place update
      client.send({
        id: randomUUID(),
        runId: randomUUID(),
        sessionKey: client.sessionKey,
        seq: 0,
        state: "final",
        targetCardId: cardId,
        data: resultData,
        generatedUI,
        cardMode: cardModeFromContext(ctx),
        operation: {
          operationId,
          stage: "complete",
          label: "Action complete",
          cancellable: false,
        },
        timestamp: Date.now(),
      });
    }
  };

  // Try mechanical data mutation first
  const updatedData = applyAction(ctx.currentData, action, payload);
  const dataChanged = updatedData !== ctx.currentData;

  if (dataChanged) {
    logAction({ ts: Date.now(), type: "action", category: "action", message: `Mechanical action: ${action} mutated data`, cardId });
    sendOperation("generating_ui", "Generating UI");
    ctx.currentData = updatedData;

    // If the card has a native tool hint, include action hints for UI regen
    const mechanicalActionHints = ctx.appToolHint
      ? getActionDescriptions(ctx.appToolHint.toolName)
      : undefined;

    const followup = await renderFollowupUI({
      ctx,
      action,
      payload,
      data: updatedData,
      assistantText: ctx.originalResponse,
      actionHints: mechanicalActionHints,
    });
    ctx.currentData = structuredClone(followup.renderData);
    sendActionResult(followup.renderData, followup.generatedUI);
    return;
  }

  // ── Built-in plugin catalog actions (CLI-free) ──
  if (action === "list_all_plugins" || action === "search_plugins") {
    const catalog = getRegisteredToolCatalog();
    const query = String(((payload ?? {}) as Record<string, unknown>).query ?? "").trim().toLowerCase();

    const filtered = action === "search_plugins" && query
      ? catalog.filter((entry) =>
          entry.pluginId.toLowerCase().includes(query)
          || entry.tools.some((t) => t.toLowerCase().includes(query)))
      : catalog;

    const resultData = {
      title: action === "search_plugins"
        ? `OpenClaw plugins matching "${query}"`
        : "Loaded OpenClaw plugins",
      totalPlugins: filtered.length,
      totalTools: filtered.reduce((acc, e) => acc + e.tools.length, 0),
      query: action === "search_plugins" ? query : undefined,
      plugins: filtered.map((entry) => ({
        pluginId: entry.pluginId,
        toolCount: entry.tools.length,
        tools: entry.tools,
      })),
      nextActions: [
        "search_plugins",
        "list_all_plugins",
      ],
    };

    sendOperation("generating_ui", "Rendering plugin catalog");
    const followup = await renderFollowupUI({
      ctx,
      action,
      payload,
      data: resultData,
      assistantText: "Showing currently loaded OpenClaw plugins and tools from runtime registry.",
    });
    ctx.currentData = structuredClone(followup.renderData);

    sendActionResult(followup.renderData, followup.generatedUI);
    return;
  }

  if (ctx.toolFamily === "enso_tooling") {
    let resultData: Record<string, unknown>;
    if (action === "view_tool_family") {
      const family = String(((payload ?? {}) as Record<string, unknown>).toolFamily ?? "").trim();
      resultData = buildToolConsoleFamilyData(family);
    } else if (action === "tooling_back" || action === "refresh") {
      resultData = buildToolConsoleHomeData();
    } else if (action === "tooling_add_tool") {
      const description = String(((payload ?? {}) as Record<string, unknown>).description ?? "");
      resultData = {
        ...buildToolConsoleHomeData(),
        creationResult: await handleToolConsoleAdd(description),
      };
    } else {
      resultData = {
        ...buildToolConsoleHomeData(),
        creationResult: {
          status: "unsupported_action",
          message: `Unknown tool-console action: ${action}`,
        },
      };
    }

    sendOperation("generating_ui", "Updating tool console");
    const followup = await renderFollowupUI({
      ctx,
      action,
      payload,
      data: resultData,
      assistantText: "Tool console action update.",
    });
    ctx.currentData = structuredClone(followup.renderData);
    sendActionResult(followup.renderData, followup.generatedUI);
    return;
  }

  // ── Path 2: Native tool invocation ──
  // If the card was produced by a tool from a co-loaded OpenClaw plugin,
  // try to handle the action by calling the tool directly via the registry.
  if (ctx.appToolHint) {
    let toolCall: { toolName: string; params: Record<string, unknown> } | null = null;
    let resolvedVia = "";

    if (action === "refresh") {
      toolCall = {
        toolName: ctx.appToolHint.toolName,
        params: ctx.appToolHint.params,
      };
      resolvedVia = "refresh";
    } else {
      const actionParams = (payload ?? {}) as Record<string, unknown>;

      // 1. Exact match: prefix + action
      const candidateToolName = `${ctx.appToolHint.handlerPrefix}${action}`;
      if (isToolRegistered(candidateToolName)) {
        toolCall = { toolName: candidateToolName, params: actionParams };
        resolvedVia = "exact";
      } else {
        logAction({ ts: Date.now(), type: "action", category: "action:native", message: `Exact match "${candidateToolName}" not registered` });
      }

      // 2. Suffix match
      if (!toolCall && ctx.toolFamily) {
        const capability = APP_CATALOG.find((c) => c.appId === ctx.toolFamily);
        if (capability) {
          const suffixRe = (s: string) => new RegExp(`(^|_)${s}(_|$)`);
          const matchedSuffix = capability.actions.find(
            (s) => action === s || action.endsWith(`_${s}`) || action.startsWith(`${s}_`) || suffixRe(s).test(action),
          );
          if (matchedSuffix) {
            const suffixTool = `${ctx.appToolHint.handlerPrefix}${matchedSuffix}`;
            if (isToolRegistered(suffixTool)) {
              toolCall = { toolName: suffixTool, params: actionParams };
              resolvedVia = `suffix(${matchedSuffix})`;
            } else {
              logAction({ ts: Date.now(), type: "action", category: "action:native", message: `Suffix match "${suffixTool}" not registered` });
            }
          }
          // 3. Family fallback tool
          if (!toolCall && isToolRegistered(capability.primaryTool)) {
            toolCall = {
              toolName: capability.primaryTool,
              params: { ...ctx.appToolHint.params, ...actionParams },
            };
            resolvedVia = "fallback";
          }
        }
      }
    }

    if (toolCall) {
      logAction({ ts: Date.now(), type: "action", category: "action:native", message: `Resolved=${resolvedVia}, tool=${toolCall.toolName}`, cardId });
      sendOperation("calling_tool", `Calling ${toolCall.toolName}`);

      // Wire up progressive rendering for researcher tools
      const isResearcherTool = toolCall.toolName.startsWith("enso_researcher_");
      if (isResearcherTool) {
        const templateCode = ctx.signatureId
          ? (getGeneratedTemplateCodeBySignature(ctx.signatureId) ?? undefined)
          : undefined;
        setResearchProgressCallback((data: Record<string, unknown>) => {
          client.send({
            id: randomUUID(),
            runId: operationId,
            sessionKey: client.sessionKey,
            seq: 0,
            state: "delta",
            targetCardId: cardId,
            data,
            ...(templateCode ? { generatedUI: templateCode } : {}),
            cardMode: cardModeFromContext(ctx),
            timestamp: Date.now(),
          });
        });

        // Wire up deep research launcher — generates custom UI for the topic
        setDeepResearchLauncher(({ topic, language, onComplete }) => {
          handleDeepResearchBuild({
            topic,
            language,
            cardId,
            client,
            account: ctx.account,
          }).then((generatedUI) => {
            onComplete(generatedUI);
          }).catch((err) => {
            logError("researcher", "Deep research UI generation failed", err, { topic });
            onComplete(null);
          });
        });
      }

      try {
        let result = await executeToolDirect(toolCall.toolName, toolCall.params);
        logAction({ ts: Date.now(), type: "action", category: "action:native", message: `Execute result: success=${result.success}, hasData=${result.data != null}, error=${result.error ?? "none"}`, cardId });

        // Retry with family fallback if tool fails
        if (!result.success && ctx.toolFamily) {
          const cap = APP_CATALOG.find((c) => c.appId === ctx.toolFamily);
          if (cap && toolCall.toolName !== cap.primaryTool && isToolRegistered(cap.primaryTool)) {
            logAction({ ts: Date.now(), type: "action", category: "action:native", message: `Retrying with fallback ${cap.primaryTool}`, cardId });
            toolCall = {
              toolName: cap.primaryTool,
              params: { ...ctx.appToolHint.params, ...toolCall.params },
            };
            result = await executeToolDirect(toolCall.toolName, toolCall.params);
            logAction({ ts: Date.now(), type: "action", category: "action:native", message: `Fallback result: success=${result.success}, hasData=${result.data != null}`, cardId });
          }
        }

        if (result.success && result.data != null) {
          ctx.currentData = structuredClone(result.data);

          // Deep research: deliver as enhanceResult so user can toggle between
          // standard research board (Original) and custom deep UI (App)
          const resultObj = result.data as Record<string, unknown>;
          if (resultObj._generatedUI && typeof resultObj._generatedUI === "string") {
            const customUI = resultObj._generatedUI as string;
            delete resultObj._generatedUI; // Don't pass internal field to frontend
            logAction({ ts: Date.now(), type: "action", category: "action:native", message: `Deep research custom UI delivered as enhanceResult (${customUI.length} chars)`, cardId });

            // Complete the operation on the card
            sendOperation("complete", "Deep research complete");

            // Send as enhanceResult → stored in appData/appGeneratedUI, toggleable with Original
            client.send({
              id: randomUUID(),
              runId: randomUUID(),
              sessionKey: client.sessionKey,
              seq: 0,
              state: "final",
              targetCardId: cardId,
              enhanceResult: {
                data: result.data,
                generatedUI: customUI,
                cardMode: cardModeFromContext(ctx),
              },
              timestamp: Date.now(),
            });
            return;
          }

          ctx.appToolHint = {
            toolName: toolCall.toolName,
            params: toolCall.params,
            handlerPrefix: ctx.appToolHint.handlerPrefix,
          };

          const nativeActionHints = getActionDescriptions(toolCall.toolName);
          applyDetectedToolTemplate(ctx, inferToolTemplate({ toolName: toolCall.toolName, data: result.data }));
          sendOperation("generating_ui", "Generating UI");
          const followup = await renderFollowupUI({
            ctx,
            action,
            payload,
            data: result.data,
            assistantText: ctx.originalResponse,
            actionHints: nativeActionHints,
          });
          ctx.currentData = structuredClone(followup.renderData);

          // Clamp parentPath for scoped shares — hides "Up" button at share root
          if (ctx.allowedRoot && followup.renderData && typeof followup.renderData === "object") {
            const rd = followup.renderData as Record<string, unknown>;
            if (typeof rd.parentPath === "string" && !isPathWithinRoot(rd.parentPath, ctx.allowedRoot)) {
              rd.parentPath = undefined;
            }
          }

          logAction({ ts: Date.now(), type: "action", category: "action:native", message: `Complete, delivering result mode=${effectiveMode}`, cardId });

          sendActionResult(followup.renderData, followup.generatedUI);
          return;
        }

        // ── Executor failed — launch Claude Code to fix ──
        const errorMsg = result.error ?? "Tool returned no data";
        if (isDynamicTool(toolCall.toolName)) {
          const execBody = getExecutorBody(toolCall.toolName);
          if (execBody) {
            logAction({ ts: Date.now(), type: "action", category: "action:native", message: `Executor failed for "${toolCall.toolName}": ${errorMsg}, launching Claude Code`, cardId });

            const fixParts: string[] = [
              `An Enso app executor is failing and needs debugging.`,
              ``,
              `## Error`,
              "```",
              errorMsg,
              "```",
              ``,
              `## Tool Name`,
              toolCall.toolName,
              ``,
              `## Executor Source`,
              "```javascript",
              execBody,
              "```",
              ``,
              `## Failed Parameters`,
              "```json",
              JSON.stringify(toolCall.params, null, 2).slice(0, 2000),
              "```",
            ];

            if (ctx.toolFamily) {
              fixParts.push(``, `## App Location`, `openclaw-plugin/apps/${ctx.toolFamily}/`);
            }

            fixParts.push(
              ``,
              `## Instructions`,
              `Read CLAUDE-REFERENCE.md for the executor format rules.`,
              `Fix the executor file to resolve this error. Executors are function bodies (no imports/exports), use \`var\` not \`const\`/\`let\`, and receive a \`ctx\` parameter.`,
              `After fixing, run \`npm run build\` to verify.`,
              ``,
                    );

            // Restore source card, then launch Claude Code
            client.send({
              id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
              state: "final", targetCardId: cardId,
              operation: { operationId, stage: "complete", label: "Launching debugger", cancellable: false },
              timestamp: Date.now(),
            });

            try {
              const { runClaudeCode } = await import("../claude-code.js");
              await runClaudeCode({ prompt: fixParts.join("\n"), client, runId: randomUUID() });
              logFix({
                description: `Auto-fixed executor for ${toolCall.toolName}`,
                error: errorMsg.slice(0, 500),
                resolution: "Claude Code debugged and fixed the executor",
                category: ctx.toolFamily ?? "app",
              });
            } catch (codeErr) {
              logError("action:native", "Claude Code launch for fix failed", codeErr, { cardId });
            }
            return;
          }
        }

        logAction({ ts: Date.now(), type: "action", category: "action:native", message: `Tool failed (${errorMsg}), falling through to agent`, cardId });
      } catch (err) {
        logError("action:native", "Native tool exception", err, { cardId });
      } finally {
        if (isResearcherTool) {
          setResearchProgressCallback(null);
          setDeepResearchLauncher(null);
        }
      }
    } else {
      logAction({ ts: Date.now(), type: "action", category: "action:native", message: `No tool resolved for action="${action}", falling through to agent` });
    }
  } else {
    logAction({ ts: Date.now(), type: "action", category: "action", message: `No appToolHint on card, skipping native path`, cardId });
  }

  // ── Path 3: Agent round-trip fallback ──
  // Block agent fallback for scoped shares — no LLM access
  if (ctx.allowedRoot) {
    logAction({ ts: Date.now(), type: "action", category: "action", message: `Scoped share: blocking agent fallback for action="${action}"`, cardId });
    client.send({
      id: randomUUID(),
      runId: randomUUID(),
      sessionKey: client.sessionKey,
      seq: 0,
      state: "error",
      targetCardId: cardId,
      text: "This action is not available for shared galleries.",
      operation: { operationId, stage: "error", label: "Action not allowed", cancellable: false },
      timestamp: Date.now(),
    });
    return;
  }

  // No mechanical handler matched — route through OpenClaw agent.
  const p = (payload ?? {}) as Record<string, unknown>;
  let actionMessage: string;

  if (action === "send_message" && typeof p.text === "string") {
    // Redirected sendMessage call — keep prompt compact to prevent recursive prompt growth.
    actionMessage = `${p.text}\n\nCard context:\n- Base request: "${compactPromptText(ctx.originalPrompt)}"\n- Current card summary: ${summarizeCardDataForAgent(ctx.currentData)}`;
  } else {
    const payloadStr = payload ? ` ${JSON.stringify(payload)}` : "";
    actionMessage = `User clicked card action "${action}"${payloadStr}.
Base request: "${compactPromptText(ctx.originalPrompt)}"
Current card summary: ${summarizeCardDataForAgent(ctx.currentData)}
Please respond with updated or detailed information for this action.`;
  }

  logAction({ ts: Date.now(), type: "action", category: "action", message: `Agent fallback: cardId=${cardId} action=${action} mode=${effectiveMode}, msgLen=${actionMessage.length}`, cardId });
  sendOperation("agent_fallback", "Routing through agent");

  // UI mode: restore source card first, then route to agent WITHOUT targetCardId
  // so the agent response creates a new card. Full mode: pass targetCardId for in-place update.
  if (effectiveMode === "ui") {
    client.send({
      id: randomUUID(),
      runId: randomUUID(),
      sessionKey: client.sessionKey,
      seq: 0,
      state: "final",
      targetCardId: cardId,
      timestamp: Date.now(),
    });
  }

  const { handleEnsoInbound } = await import("../inbound.js");
  await handleEnsoInbound({
    message: {
      messageId: randomUUID(),
      sessionId: client.sessionKey,
      senderNick: `user_${client.id}`,
      text: actionMessage,
      timestamp: Date.now(),
    },
    account: ctx.account,
    config,
    runtime,
    client,
    targetCardId: effectiveMode === "full" ? cardId : undefined,
    statusSink,
  });
}

// ── Mechanical Action Handlers ──

function applyAction(data: unknown, action: string, payload: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;

  // Task board (has "columns" array) — only clone for known task actions
  if (Array.isArray(d.columns)) {
    switch (action) {
      case "complete_task":
      case "move_task":
      case "delete_task":
      case "add_task":
        return applyTaskAction(structuredClone(d) as TaskBoardData, action, payload);
    }
  }

  // Sales dashboard (has "quarters" array) — only clone for known sales actions
  if (Array.isArray(d.quarters)) {
    switch (action) {
      case "sort_by":
      case "filter":
        return applySalesAction(structuredClone(d) as SalesData, action, payload);
    }
  }

  // Unknown action — return original reference so dataChanged === false,
  // allowing the agent-routed fallback to handle it.
  return data;
}

interface TaskItem { id: number; title: string; priority: string; assignee: string }
interface TaskColumn { name: string; tasks: TaskItem[] }
interface TaskBoardData { projectName: string; columns: TaskColumn[]; [key: string]: unknown }

function applyTaskAction(data: TaskBoardData, action: string, payload: unknown): TaskBoardData {
  const p = (payload ?? {}) as Record<string, unknown>;

  switch (action) {
    case "complete_task": {
      const taskId = p.taskId as number | undefined;
      if (taskId == null) return data;
      let task: TaskItem | undefined;
      for (const col of data.columns) {
        const idx = col.tasks.findIndex((t) => t.id === taskId);
        if (idx !== -1) { task = col.tasks.splice(idx, 1)[0]; break; }
      }
      if (task) {
        let doneCol = data.columns.find((c) => c.name === "Done");
        if (!doneCol) { doneCol = { name: "Done", tasks: [] }; data.columns.push(doneCol); }
        doneCol.tasks.push(task);
      }
      return data;
    }
    case "move_task": {
      const taskId = p.taskId as number | undefined;
      const targetColumn = p.targetColumn as string | undefined;
      if (taskId == null || !targetColumn) return data;
      let task: TaskItem | undefined;
      for (const col of data.columns) {
        const idx = col.tasks.findIndex((t) => t.id === taskId);
        if (idx !== -1) { task = col.tasks.splice(idx, 1)[0]; break; }
      }
      if (task) {
        let target = data.columns.find((c) => c.name === targetColumn);
        if (!target) { target = { name: targetColumn, tasks: [] }; data.columns.push(target); }
        target.tasks.push(task);
      }
      return data;
    }
    case "delete_task": {
      const taskId = p.taskId as number | undefined;
      if (taskId == null) return data;
      for (const col of data.columns) {
        const idx = col.tasks.findIndex((t) => t.id === taskId);
        if (idx !== -1) { col.tasks.splice(idx, 1); break; }
      }
      return data;
    }
    case "add_task": {
      const title = p.title as string | undefined;
      const column = (p.column as string) ?? "To Do";
      const priority = (p.priority as string) ?? "medium";
      const assignee = (p.assignee as string) ?? "Unassigned";
      if (!title) return data;
      const maxId = data.columns.flatMap((c) => c.tasks).reduce((max, t) => Math.max(max, t.id), 0);
      let target = data.columns.find((c) => c.name === column);
      if (!target) { target = { name: column, tasks: [] }; data.columns.push(target); }
      target.tasks.push({ id: maxId + 1, title, priority, assignee });
      return data;
    }
    default:
      return data;
  }
}

interface QuarterData { quarter: string; revenue: number; deals: number }
interface SalesData { quarters: QuarterData[]; [key: string]: unknown }

function applySalesAction(data: SalesData, action: string, payload: unknown): SalesData {
  const p = (payload ?? {}) as Record<string, unknown>;

  switch (action) {
    case "sort_by": {
      const field = (p.field as keyof QuarterData) ?? "revenue";
      const dir = (p.direction as string) ?? "desc";
      data.quarters.sort((a, b) => {
        const av = a[field] as number;
        const bv = b[field] as number;
        return dir === "asc" ? av - bv : bv - av;
      });
      return data;
    }
    case "filter": {
      const minRevenue = p.minRevenue as number | undefined;
      if (minRevenue != null) {
        data.quarters = data.quarters.filter((q) => q.revenue >= minRevenue);
      }
      return data;
    }
    default:
      return data;
  }
}
