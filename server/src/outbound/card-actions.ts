import { randomUUID } from "crypto";
import { hostname } from "node:os";
import type { EnsoRuntime } from "../local-types.js";
import type { ConnectedClient } from "../server.js";
import { getActiveAccount } from "../server.js";
import { findCardRecordForClient, DEFAULT_CONVERSATION_ID } from "../memory-bridge.js";
import type { CardModeDetail, CoreConfig, OperationStage, ServerMessage } from "../types.js";
import { persistCard } from "../memory-bridge.js";
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
import { generateResearchFollowUps } from "../followup-generator.js";
import { runClaudeCode } from "../claude-code.js";
import { handleDeepResearchBuild, handleBuildAppViaClaude } from "../build-via-claude.js";
// fs imports removed — no longer needed after deep research refactor
import { recordAppInteraction, buildFailureContext } from "../interaction-tracker.js";
import { sendHtmlEmail } from "../email.js";
import { sendTextMessage, sendArticle, getFollowerOpenIds } from "../wechat.js";
import type { CardContext } from "./card-context.js";
import { cardContexts, getCardContext, isPathWithinRoot, validateScopedAction } from "./card-context.js";
import {
  compactPromptText,
  summarizeCardDataForAgent,
  renderFollowupUI,
  applyDetectedToolTemplate,
  cardModeFromContext,
} from "./helpers.js";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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
  capturedConvId?: string,
): CardContext | null {
  const p = (payload ?? {}) as Record<string, unknown>;

  // ── Researcher family ──
  const researcherActions = ["follow_up", "compare", "deep_dive", "search", "deep_research", "send_report", "delete_history", "clear_all_history", "build_from_research", "monitor_topic", "cortex_ingest", "add_to_cortex"];
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

  // ── Generic recovery from persisted card journal ──
  // Scan the client's card history for this cardId and reconstruct
  // from the stored data, cardMode, and appCardMode fields.
  const account = getActiveAccount();
  if (account) {
    const rec = findCardRecordForClient(client.id, cardId, capturedConvId);
    if (rec) {
      const mode = rec.appCardMode ?? rec.cardMode;
      const data = rec.appData ?? rec.data;
      const toolFamily = mode?.toolFamily ?? mode?.appId;
      if (toolFamily && data) {
        const toolName = (data as Record<string, unknown>).tool as string | undefined;
        const handlerPrefix = toolName
          ? toolName.replace(/_[^_]+$/, "_") // "enso_filesystem_list_dir" → "enso_filesystem_"
          : `enso_${toolFamily}_`;
        logAction({ ts: Date.now(), type: "action", category: "action", message: `Journal-recovered context for family=${toolFamily}`, cardId });
        return {
          cardId,
          originalPrompt: rec.text ?? "",
          originalResponse: "",
          currentData: data,
          geminiApiKey: account.geminiApiKey,
          account,
          mode: "full",
          actionHistory: [],
          appToolHint: toolName
            ? { toolName, params: {}, handlerPrefix }
            : undefined,
          interactionMode: "tool",
          toolFamily,
          signatureId: mode?.signatureId,
        };
      }
    }
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
  runtime: EnsoRuntime;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { cardId, mode, client, config, runtime, statusSink } = params;
  const capturedConvId = client.conversationId ?? DEFAULT_CONVERSATION_ID;
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

  let ctx = getCardContext(cardId);
  if (!ctx) {
    // ── Reconstruct minimal context for known tool families ──
    // After server restart, card contexts are lost. For tools where the
    // payload is self-contained (e.g. researcher follow_up/compare/deep_dive),
    // we can reconstruct enough context to dispatch the action.
    const reconstructed = tryReconstructContext(cardId, action, payload, client, capturedConvId);
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

  // ── Share Email: send card content via email (generic, works for any card) ──
  if (action === "share_email") {
    const p = (payload ?? {}) as Record<string, unknown>;
    const recipient = String(p.recipient ?? "").trim();
    if (!recipient) {
      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
        state: "error", targetCardId: cardId,
        text: "Recipient email address is required.",
        operation: { operationId, stage: "error", label: "Email failed", cancellable: false },
        timestamp: Date.now(),
      });
      return;
    }

    const emailTitle = typeof p.title === "string" ? p.title : ctx.toolFamily ?? "Enso Card";

    // Build email body from card context data
    const data = ctx.currentData as Record<string, unknown> | undefined;
    const parts: string[] = [];
    parts.push(`<div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;color:#1f2937;">`);
    parts.push(`<h1 style="color:#1e40af;font-size:22px;margin-bottom:8px;">${escapeHtml(emailTitle)}</h1>`);
    parts.push(`<p style="font-size:12px;color:#6b7280;margin-bottom:16px;">${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>`);
    parts.push(`<hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;" />`);

    const summary = typeof data?.summary === "string" ? data.summary : null;
    const narrative = typeof data?.narrative === "string" ? data.narrative : null;
    const text = typeof data?.text === "string" ? data.text : null;

    if (summary) {
      parts.push(`<p style="font-size:15px;line-height:1.6;">${escapeHtml(summary)}</p>`);
    }
    if (narrative) {
      for (const para of narrative.split(/\n\n+/)) {
        parts.push(`<p style="font-size:14px;line-height:1.5;color:#374151;">${escapeHtml(para.trim())}</p>`);
      }
    }
    if (!summary && !narrative && text) {
      parts.push(`<pre style="font-size:13px;line-height:1.5;white-space:pre-wrap;color:#374151;">${escapeHtml(text)}</pre>`);
    }
    if (!summary && !narrative && !text) {
      parts.push(`<p style="color:#6b7280;">Card content shared from Enso.</p>`);
    }

    parts.push(`<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />`);
    parts.push(`<p style="font-size:11px;color:#9ca3af;text-align:center;">Shared from Enso</p>`);
    parts.push(`</div>`);

    const html = parts.join("\n");

    try {
      const result = await sendHtmlEmail({
        to: recipient,
        subject: `Enso: ${emailTitle}`,
        html,
        textFallback: [emailTitle, "", summary ?? narrative ?? text ?? "Card content shared from Enso."].join("\n"),
      });
      sendOperation("complete", result.success ? "Email sent" : "Email failed");
      client.send({
        id: randomUUID(), runId: operationId, sessionKey: client.sessionKey, seq: 0,
        state: "complete", targetCardId: cardId,
        data: { tool: "share_email", success: result.success, message: result.message },
        generatedUI: ctx.signatureId ? getGeneratedTemplateCodeBySignature(ctx.signatureId) : undefined,
        timestamp: Date.now(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError("email", `share_email failed: ${msg}`, undefined, { cardId });
      sendOperation("error", "Email failed", msg);
    }
    return;
  }

  // ── Share WeChat: send card content via WeChat (generic, works for any card) ──
  if (action === "share_wechat") {
    const p = (payload ?? {}) as Record<string, unknown>;
    const content = String(p.content ?? "").trim();
    if (!content) {
      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
        state: "error", targetCardId: cardId,
        text: "No content to share.",
        operation: { operationId, stage: "error", label: "WeChat failed", cancellable: false },
        timestamp: Date.now(),
      });
      return;
    }

    try {
      const followers = await getFollowerOpenIds();
      if (followers.length === 0) {
        sendOperation("error", "No followers", "No WeChat followers found. Follow the test account first.");
        return;
      }

      // Send to first follower — article mode if HTML provided, text otherwise
      const articleHtml = typeof p.articleHtml === "string" ? p.articleHtml : undefined;
      const title = typeof p.title === "string" ? p.title : undefined;
      const coverUrl = typeof p.coverUrl === "string" ? p.coverUrl : undefined;
      const author = typeof p.author === "string" ? p.author : undefined;

      const result = (articleHtml && title)
        ? await sendArticle(followers[0], { title, author, content: articleHtml, coverUrl })
        : await sendTextMessage(followers[0], content);
      sendOperation("complete", result.success ? "Sent to WeChat" : "WeChat failed");
      client.send({
        id: randomUUID(), runId: operationId, sessionKey: client.sessionKey, seq: 0,
        state: "complete", targetCardId: cardId,
        data: { tool: "share_wechat", success: result.success, message: result.message },
        generatedUI: ctx.signatureId ? getGeneratedTemplateCodeBySignature(ctx.signatureId) : undefined,
        timestamp: Date.now(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError("wechat", `share_wechat failed: ${msg}`, undefined, { cardId });
      sendOperation("error", "WeChat failed", msg);
    }
    return;
  }

  // ── Open External App: open a local file with the system's default application ──
  if (action === "open_external_app") {
    const p = (payload ?? {}) as Record<string, unknown>;
    const filePath = String(p.path ?? "").trim();
    if (!filePath) {
      sendOperation("error", "No file path", "No file path provided.");
      return;
    }
    try {
      logAction({ ts: Date.now(), type: "action", category: "action", message: `Open external app: ${filePath}`, cardId });
      const result = await executeToolDirect("enso_fs_open_external", { path: filePath });
      if (result.success) {
        sendOperation("complete", "Opened in external app");
      } else {
        sendOperation("error", "Failed to open", String(result.error ?? "Unknown error"));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError("action", `open_external_app failed: ${msg}`, undefined, { cardId });
      sendOperation("error", "Failed to open", msg);
    }
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
      `- Dynamic apps: ~/.enso/apps/<family>/ or server/apps/<family>/`,
      `- Built-in apps: server/src/`,
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
      improveParts.push(`## App: ${ctx.toolFamily}`, `Location: server/apps/${ctx.toolFamily}/`, ``);
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
      const refineAccount = getActiveAccount();
      const result = await refineTemplate({
        toolFamily: ctx.toolFamily ?? "unknown",
        signatureId: ctx.signatureId,
        currentData: ctx.currentData,
        instruction,
        existingTemplate: existingTemplate ?? undefined,
        apiKey: ctx.geminiApiKey,
        model: client.chatModel,
        providerKeys: refineAccount ? { ...refineAccount.providerKeys, gemini: refineAccount.geminiApiKey } : undefined,
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

      // Persist the new card to history
      persistCard(client.id, capturedConvId, {
        id: newCardId,
        runId: "",
        type: "dynamic-ui",
        role: "assistant",
        data: resultData,
        generatedUI,
        cardMode: cardModeFromContext(ctx),
        timestamp: Date.now(),
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

      // Persist card update to history (merges with existing record)
      persistCard(client.id, capturedConvId, {
        id: cardId,
        runId: "",
        type: "dynamic-ui",
        role: "assistant",
        data: resultData,
        generatedUI,
        cardMode: cardModeFromContext(ctx),
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
        ? `Enso plugins matching "${query}"`
        : "Loaded Enso plugins",
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
      assistantText: "Showing currently loaded Enso plugins and tools from runtime registry.",
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

  // ── Path 1b: Cross-app navigation ──
  // Handles __cross_app actions dispatched from templates to switch between apps
  // (e.g. "Style in Photo Studio" from Media Gallery, "View in Gallery" from Photo Studio).
  if (action === "__cross_app" && payload && (payload as Record<string, unknown>).target) {
    const crossPayload = payload as Record<string, unknown>;
    const targetFamily = String(crossPayload.target);
    const targetToolSuffix = String(crossPayload.tool || "");
    const targetParams = (crossPayload.params || {}) as Record<string, unknown>;

    // Find target app in catalog
    const targetCap = APP_CATALOG.find((c) => c.appId === targetFamily);
    if (targetCap) {
      // Derive tool prefix: convention is "enso_{toolFamily}_"
      const derivedPrefix = `enso_${targetFamily}_`;
      // Determine the full tool name
      const toolName = targetToolSuffix
        ? `${derivedPrefix}${targetToolSuffix}`
        : targetCap.primaryTool;

      if (isToolRegistered(toolName)) {
        logAction({ ts: Date.now(), type: "action", category: "action:cross-app", message: `Cross-app: ${ctx.toolFamily ?? "?"} → ${targetFamily}, tool=${toolName}`, cardId });
        sendOperation("calling_tool", `Navigating to ${targetFamily}`);

        try {
          const result = await executeToolDirect(toolName, targetParams);

          if (result.success && result.data != null) {
            // Update card context to the target app
            ctx.toolFamily = targetFamily;
            ctx.signatureId = targetCap.signatureId;
            ctx.appToolHint = {
              toolName,
              params: targetParams,
              handlerPrefix: derivedPrefix,
            };
            ctx.currentData = structuredClone(result.data);

            // Get the target app's template
            const targetTemplate = getGeneratedTemplateCodeBySignature(targetCap.signatureId);

            if (targetTemplate) {
              sendActionResult(result.data, targetTemplate);
            } else {
              // Fallback: send data with current template
              sendActionResult(result.data, ctx.signatureId
                ? (getGeneratedTemplateCodeBySignature(ctx.signatureId) ?? "")
                : "");
            }
            return;
          }
        } catch (crossErr) {
          logError("action:cross-app", `Cross-app navigation failed: ${targetFamily}/${targetToolSuffix}`, crossErr, { cardId });
        }
      }
    }
    // Fall through to normal action handling if cross-app fails
    logAction({ ts: Date.now(), type: "action", category: "action:cross-app", message: `Cross-app fallback: target=${targetFamily} not resolved, falling through`, cardId });
  }

  // ── Entity Navigation: view_entity / nav_back ──
  // These actions support in-place card navigation across entity scopes.
  // view_entity pushes the current card state onto the navStack and shows entity detail.
  // nav_back pops the stack and restores the previous state.
  if (action === "view_entity") {
    const p = (payload ?? {}) as Record<string, unknown>;
    const entityId = String(p.entityId ?? "").trim();
    if (!entityId) {
      sendOperation("error", "No entity ID provided");
      return;
    }

    logAction({ ts: Date.now(), type: "action", category: "action:entity", message: `view_entity: ${entityId}`, cardId });
    sendOperation("processing", "Loading entity");

    try {
      logAction({ ts: Date.now(), type: "action", category: "action:entity", message: `Resolving entity: ${entityId}`, cardId });
      const { buildEntityDetailData } = await import("../entity-model.js");
      logAction({ ts: Date.now(), type: "action", category: "action:entity", message: `Import OK, calling buildEntityDetailData...`, cardId });
      const detailData = await buildEntityDetailData(entityId);
      logAction({ ts: Date.now(), type: "action", category: "action:entity", message: `Detail data: ${detailData ? 'OK' : 'NULL'} for ${entityId}`, cardId });

      // If entity has been deep-processed, merge podcast + research data
      if (detailData) {
        try {
          const { getProcessedContent } = await import("../deep-content.js");
          const processed = getProcessedContent(entityId);
          if (processed) {
            detailData.processedBook = processed;
            detailData.podcastAudioUrl = processed.audioUrl;
            detailData.podcastScript = processed.script;
            detailData.podcastDuration = processed.durationMinutes;
            detailData.podcastStatus = "ready";
            logAction({ ts: Date.now(), type: "action", category: "action:entity", message: `Merged processed content: ${processed.durationMinutes} min podcast for ${entityId}`, cardId });
          }
        } catch { /* deep-content not available, skip */ }
      }

      // Add cross-type related entities via Cortex keyword search (zero LLM, fast)
      if (detailData) {
        try {
          const { findRelatedContent } = await import("../cortex-synthesis.js");
          const entityTitle = (detailData.entity as Record<string, unknown>)?.title as string || "";
          if (entityTitle) {
            const related = await findRelatedContent(entityTitle);
            const crossType: Array<Record<string, unknown>> = [];
            const entityType = (detailData.entity as Record<string, unknown>)?.type as string || "";
            for (const [source, hits] of Object.entries(related.relatedContent?.bySource || {})) {
              for (const hit of (hits as Array<{ title: string; entityId?: string; type?: string; reason?: string }>).slice(0, 3)) {
                // Skip same-type entities
                if (hit.type === entityType) continue;
                crossType.push({ title: hit.title, entityId: hit.entityId, type: hit.type || source, reason: hit.reason });
              }
            }
            // Also add from cortex pages
            for (const page of (related.relatedContent?.cortexPages || []).slice(0, 5)) {
              const p = page as { title: string; entityId?: string; type?: string };
              if (p.type !== entityType) {
                crossType.push({ title: p.title, entityId: p.entityId, type: p.type || "cortex" });
              }
            }
            if (crossType.length > 0) {
              detailData.crossTypeEntities = crossType.slice(0, 8);
            }
          }
        } catch { /* cortex synthesis not available */ }
      }

      if (!detailData) {
        sendOperation("error", "Entity not found");
        client.send({
          id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
          state: "error", targetCardId: cardId,
          text: `Entity "${entityId}" not found in index or cache.`,
          operation: { operationId, stage: "error", label: "Entity not found", cancellable: false },
          timestamp: Date.now(),
        });
        return;
      }

      // Push current state onto nav stack
      if (!ctx.navStack) ctx.navStack = [];
      const currentTitle = ((ctx.currentData as Record<string, unknown>)?.entity as Record<string, unknown>)?.title
        ?? ctx.toolFamily ?? "Previous view";
      ctx.navStack.push({
        data: structuredClone(ctx.currentData),
        generatedUI: ctx.currentGeneratedUI,
        title: String(currentTitle),
        focusEntity: ((ctx.currentData as Record<string, unknown>)?.focusEntity) as string | undefined,
      });

      // Update context with detail data
      detailData.navStack = ctx.navStack.map(e => ({ title: e.title })); // breadcrumb info only
      ctx.currentData = detailData;

      // Resolve the generatedUI — use entity detail template
      const { getGeneratedTemplateCodeBySignature: getTemplateBySignature } = await import("../native-tools/registry.js");
      let generatedUI = ctx.currentGeneratedUI;

      // Try to find the app's template (which should handle focusEntity via scope-adaptive rendering)
      if (ctx.signatureId) {
        const appTemplate = getTemplateBySignature(ctx.signatureId);
        if (appTemplate) {
          generatedUI = appTemplate;
        }
      }

      // If still no template, get it from the loaded app's templateJSX
      if (!generatedUI) {
        try {
          const { loadAllApps } = await import("../app-persistence.js");
          const apps = loadAllApps();
          const app = apps.find(a => a.spec.signatureId === ctx.signatureId || a.spec.toolFamily === ctx.toolFamily);
          if (app?.templateJSX) generatedUI = app.templateJSX;
        } catch { /* best effort */ }
      }

      if (!generatedUI) {
        logAction({ ts: Date.now(), type: "action", category: "action:entity", message: `WARNING: no template found for signatureId=${ctx.signatureId} toolFamily=${ctx.toolFamily}`, cardId });
      }

      ctx.currentGeneratedUI = generatedUI;

      // Send in-place update
      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
        state: "final", targetCardId: cardId,
        data: detailData,
        generatedUI,
        cardMode: cardModeFromContext(ctx),
        operation: { operationId, stage: "complete", label: "Entity loaded", cancellable: false },
        timestamp: Date.now(),
      });

      // Persist
      persistCard(client.id, capturedConvId, {
        id: cardId, runId: "", type: "dynamic-ui", role: "assistant",
        data: detailData, generatedUI,
        cardMode: cardModeFromContext(ctx), timestamp: Date.now(),
      });
    } catch (err) {
      logError("action:entity", `view_entity failed for ${entityId}`, err, { cardId });
      sendOperation("error", "Failed to load entity");
    }
    return;
  }

  if (action === "nav_back") {
    if (!ctx.navStack?.length) {
      logAction({ ts: Date.now(), type: "action", category: "action:entity", message: `nav_back: stack empty`, cardId });
      sendOperation("complete", "Already at root");
      return;
    }

    const entry = ctx.navStack.pop()!;
    logAction({ ts: Date.now(), type: "action", category: "action:entity", message: `nav_back: restoring "${entry.title}"`, cardId });

    // Restore previous state
    ctx.currentData = entry.data;
    ctx.currentGeneratedUI = entry.generatedUI;

    // Add navStack breadcrumb to restored data
    const restoredData = structuredClone(entry.data) as Record<string, unknown>;
    restoredData.navStack = ctx.navStack.map(e => ({ title: e.title }));

    client.send({
      id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
      state: "final", targetCardId: cardId,
      data: restoredData,
      generatedUI: entry.generatedUI,
      cardMode: cardModeFromContext(ctx),
      operation: { operationId, stage: "complete", label: "Navigated back", cancellable: false },
      timestamp: Date.now(),
    });

    // Persist
    persistCard(client.id, capturedConvId, {
      id: cardId, runId: "", type: "dynamic-ui", role: "assistant",
      data: restoredData, generatedUI: entry.generatedUI,
      cardMode: cardModeFromContext(ctx), timestamp: Date.now(),
    });
    return;
  }

  // ── Add to Cortex: create a Cortex entity page from discovered/recommended content ──
  if (action === "add_to_cortex") {
    const p = (payload ?? {}) as Record<string, unknown>;
    const title = String(p.title ?? "").trim();
    const type = String(p.type ?? "").trim();
    if (!title || !type) { sendOperation("error", "Missing title or type"); return; }

    logAction({ ts: Date.now(), type: "action", category: "action:add-to-cortex", message: `Add to Cortex: ${title} (${type})`, cardId });

    try {
      const { ingestDiscoveredEntity } = await import("../cortex-direct-ingest.js");
      const result = await ingestDiscoveredEntity({
        title,
        type,
        creator: p.creator ? String(p.creator) : undefined,
        year: p.year ? String(p.year) : undefined,
        description: p.description ? String(p.description) : undefined,
        imageUrl: p.imageUrl ? String(p.imageUrl) : undefined,
        url: p.url ? String(p.url) : undefined,
        metadata: p.metadata && typeof p.metadata === "object" ? p.metadata as Record<string, unknown> : undefined,
      });

      // Auto-enrich with type-appropriate API metadata (fire-and-forget)
      if (result.created) {
        import("../content-enrichment.js").then(mod => {
          mod.enrichEntity(result.entityId).catch(() => {});
        }).catch(() => {});
      }

      // Track added entities in card data so template can show checkmarks
      const currentData = ctx.currentData as Record<string, unknown>;
      const added = Array.isArray(currentData._addedToCortex) ? [...currentData._addedToCortex as string[]] : [];
      if (!added.includes(title)) added.push(title);
      currentData._addedToCortex = added;
      ctx.currentData = currentData;

      sendOperation("complete", result.created ? `Added "${title}" to Cortex` : `"${title}" already in Cortex`);
      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
        state: "final", targetCardId: cardId,
        data: currentData,
        generatedUI: ctx.currentGeneratedUI,
        cardMode: cardModeFromContext(ctx),
        timestamp: Date.now(),
      });

      // Persist
      persistCard(client.id, capturedConvId, {
        id: cardId, runId: "", type: "dynamic-ui", role: "assistant",
        data: currentData, generatedUI: ctx.currentGeneratedUI,
        cardMode: cardModeFromContext(ctx), timestamp: Date.now(),
      });
    } catch (err) {
      logError("action:add-to-cortex", `Failed to add "${title}" to Cortex`, err, { cardId });
      sendOperation("error", `Failed to add to Cortex: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  // ── Regenerate Podcast: delete cache and re-generate ──
  if (action === "regenerate_podcast") {
    const p = (payload ?? {}) as Record<string, unknown>;
    const entityId = String(p.entityId ?? "").trim();
    if (!entityId) { sendOperation("error", "No entity ID"); return; }

    // Delete cached podcast
    const { deleteProcessedBook } = await import("../deep-content.js");
    deleteProcessedBook(entityId);
    logAction({ ts: Date.now(), type: "action", category: "action:book-podcast", message: `Regenerating podcast for ${entityId} (cache cleared)` });

    // Clear podcast state from card data so UI shows generation progress
    const detailData = ctx.currentData as Record<string, unknown>;
    delete detailData.processedBook;
    delete detailData.podcastAudioUrl;
    delete detailData.podcastScript;
    delete detailData.podcastDuration;
    detailData.podcastStatus = "processing";
    detailData.podcastStatusDetail = "Regenerating podcast — researching...";
    detailData.podcastPercent = 0;
    ctx.currentData = detailData;

    // Send the cleared state to the client immediately so UI switches to progress view
    client.send({
      id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
      state: "delta", targetCardId: cardId,
      data: detailData,
      generatedUI: ctx.currentGeneratedUI,
      cardMode: cardModeFromContext(ctx),
      timestamp: Date.now(),
    });

    // Fall through to the deep_content handler below to start generation
  }

  // ── Deep Content: generate deep research + long-form podcast for any entity or rich card ──
  if (action === "deep_content" || action === "book_podcast" || action === "regenerate_podcast") {
    const p = (payload ?? {}) as Record<string, unknown>;
    const entityId = String(p.entityId ?? "").trim();
    if (!entityId) { sendOperation("error", "No entity ID"); return; }

    logAction({ ts: Date.now(), type: "action", category: "action:book-podcast", message: `book_podcast: ${entityId}`, cardId });

    // Auto-create entity in Cortex if it doesn't exist (e.g., triggered from researcher)
    const { lookupEntity: lookupEnt } = await import("../entity-model.js");
    if (!lookupEnt(entityId) && p.title) {
      try {
        const { ingestDiscoveredEntity } = await import("../cortex-direct-ingest.js");
        await ingestDiscoveredEntity({
          title: String(p.title),
          type: String(p.type ?? "book"),
          creator: p.creator ? String(p.creator) : undefined,
          year: p.year ? String(p.year) : undefined,
          description: p.description ? String(p.description) : undefined,
        });
        logAction({ ts: Date.now(), type: "action", category: "action:book-podcast", message: `Auto-created entity for deep content: ${entityId}`, cardId });
      } catch (err) {
        logError("action:book-podcast", "Failed to auto-create entity", err, { entityId });
      }
    }

    // Check cache first
    const { getProcessedBook, generateBookPodcast } = await import("../deep-content.js");
    const cached = getProcessedBook(entityId);
    if (cached) {
      // Return cached podcast immediately
      const detailData = ctx.currentData as Record<string, unknown>;
      detailData.processedBook = cached;
      detailData.podcastAudioUrl = cached.audioUrl;
      detailData.podcastScript = cached.script;
      detailData.podcastDuration = cached.durationMinutes;
      detailData.podcastStatus = "ready";
      ctx.currentData = detailData;

      sendOperation("complete", "Podcast loaded from cache");
      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
        state: "final", targetCardId: cardId,
        data: detailData,
        generatedUI: ctx.currentGeneratedUI,
        cardMode: cardModeFromContext(ctx),
        timestamp: Date.now(),
      });
      return;
    }

    // Generate podcast in background (non-blocking for the WS handler)
    sendOperation("processing", "Starting book podcast pipeline...");

    generateBookPodcast({
      entityId,
      language: client.language,
      onProgress: (progress) => {
        // Stream progress as delta messages
        const detailData = structuredClone(ctx.currentData) as Record<string, unknown>;
        detailData.podcastStatus = progress.phase;
        detailData.podcastStatusDetail = progress.detail;
        detailData.podcastPercent = progress.percentComplete;

        client.send({
          id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
          state: "delta", targetCardId: cardId,
          data: detailData,
          generatedUI: ctx.currentGeneratedUI,
          cardMode: cardModeFromContext(ctx),
          timestamp: Date.now(),
        });
      },
    }).then((processed) => {
      // Update card with completed podcast
      const detailData = ctx.currentData as Record<string, unknown>;
      detailData.processedBook = processed;
      detailData.podcastAudioUrl = processed.audioUrl;
      detailData.podcastScript = processed.script;
      detailData.podcastDuration = processed.durationMinutes;
      detailData.podcastStatus = "ready";
      detailData.podcastPercent = 100;
      ctx.currentData = detailData;

      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
        state: "final", targetCardId: cardId,
        data: detailData,
        generatedUI: ctx.currentGeneratedUI,
        cardMode: cardModeFromContext(ctx),
        operation: { operationId, stage: "complete", label: `Podcast ready (${processed.durationMinutes} min)`, cancellable: false },
        timestamp: Date.now(),
      });

      persistCard(client.id, capturedConvId, {
        id: cardId, runId: "", type: "dynamic-ui", role: "assistant",
        data: detailData, generatedUI: ctx.currentGeneratedUI,
        cardMode: cardModeFromContext(ctx), timestamp: Date.now(),
      });

      logAction({ ts: Date.now(), type: "action", category: "action:book-podcast", message: `Podcast complete for ${entityId}: ${processed.durationMinutes} min` });
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      logError("action:book-podcast", `Podcast generation failed for ${entityId}`, err, { cardId });

      const detailData = ctx.currentData as Record<string, unknown>;
      detailData.podcastStatus = "error";
      detailData.podcastError = msg;

      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
        state: "final", targetCardId: cardId,
        data: detailData,
        generatedUI: ctx.currentGeneratedUI,
        cardMode: cardModeFromContext(ctx),
        operation: { operationId, stage: "error", label: "Podcast failed", message: msg, cancellable: false },
        timestamp: Date.now(),
      });
    });

    return;
  }

  // ── Book Batch Process: process multiple books as a background task ──
  if (action === "batch_deep_content" || action === "book_batch_process") {
    const p = (payload ?? {}) as Record<string, unknown>;
    const entityIds = (p.entityIds ?? []) as string[];
    if (!entityIds.length) { sendOperation("error", "No books selected"); return; }

    logAction({ ts: Date.now(), type: "action", category: "action:book-podcast", message: `Batch process: ${entityIds.length} books`, cardId });
    sendOperation("processing", `Processing ${entityIds.length} books...`);

    const { processBookBatch } = await import("../deep-content.js");

    processBookBatch({
      entityIds,
      onBookProgress: (bookIdx, totalBooks, bookTitle, progress) => {
        const detailData = structuredClone(ctx.currentData) as Record<string, unknown>;
        detailData.batchStatus = `Processing ${bookIdx + 1}/${totalBooks}: "${bookTitle}"`;
        detailData.batchPhase = progress.phase;
        detailData.batchDetail = progress.detail;
        detailData.batchPercent = Math.round(((bookIdx + (progress.percentComplete || 0) / 100) / totalBooks) * 100);

        client.send({
          id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
          state: "delta", targetCardId: cardId,
          data: detailData,
          generatedUI: ctx.currentGeneratedUI,
          cardMode: cardModeFromContext(ctx),
          timestamp: Date.now(),
        });
      },
    }).then((result) => {
      const detailData = ctx.currentData as Record<string, unknown>;
      detailData.batchStatus = `Complete: ${result.processed} processed, ${result.failed} failed`;
      detailData.batchPercent = 100;
      detailData.batchResults = result.results;
      ctx.currentData = detailData;

      client.send({
        id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
        state: "final", targetCardId: cardId,
        data: detailData,
        generatedUI: ctx.currentGeneratedUI,
        cardMode: cardModeFromContext(ctx),
        operation: { operationId, stage: "complete", label: `Batch complete: ${result.processed}/${entityIds.length}`, cancellable: false },
        timestamp: Date.now(),
      });

      logAction({ ts: Date.now(), type: "action", category: "action:book-podcast", message: `Batch complete: ${result.processed} processed, ${result.failed} failed` });
    }).catch((err) => {
      logError("action:book-podcast", "Batch processing failed", err, { cardId });
      sendOperation("error", `Batch failed: ${err instanceof Error ? err.message : String(err)}`);
    });

    return;
  }

  // ── Book Email Share: send processed book summary + podcast link via email ──
  if (action === "entity_share_email" || action === "book_share_email") {
    const p = (payload ?? {}) as Record<string, unknown>;
    const recipient = String(p.recipient ?? "").trim();
    const entityId = String(p.entityId ?? "").trim();
    if (!recipient) {
      sendOperation("error", "Recipient email required");
      return;
    }
    if (!entityId) {
      sendOperation("error", "No entity ID");
      return;
    }

    try {
      const { getProcessedBook, buildEntityPage } = await import("../deep-content.js");
      const processed = getProcessedBook(entityId);
      if (!processed) {
        sendOperation("error", "Book not yet processed. Generate the podcast first.");
        return;
      }

      const { getServerBaseUrl } = await import("../shareable-pages.js");
      const tunnelUrl = getServerBaseUrl();
      const { shortUrl } = buildEntityPage(processed, tunnelUrl);

      sendOperation("processing", "Sending email...");
      const previewHtml = `<div style="font-family:system-ui;max-width:600px;margin:0 auto;background:#0f0f23;color:#e2e8f0;border-radius:12px;padding:24px;text-align:center">
<h1 style="font-size:22px;margin:0 0 8px">${processed.title}</h1>
<p style="color:#94a3b8;margin:4px 0">${processed.author} · ${processed.durationMinutes} min AI Podcast</p>
<p style="color:#94a3b8;font-size:13px;line-height:1.6;text-align:left;margin:16px 0">${(processed.research.coreThesis || "").slice(0, 300)}</p>
<a href="${shortUrl}" style="display:inline-block;background:#7c3aed;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin:16px 0">▶ Play Podcast & Read Insights →</a>
<p style="color:#475569;font-size:11px;margin-top:16px">Enso AI</p></div>`;

      const result = await sendHtmlEmail({
        to: recipient,
        subject: `📚 ${processed.title} — AI Podcast + Insights`,
        html: previewHtml,
        textFallback: `${processed.title} by ${processed.author}\n\n${processed.research.coreThesis}\n\nView: ${shortUrl}`,
      });

      sendOperation("complete", result.success ? "Email sent" : "Email failed");
      logAction({ ts: Date.now(), type: "action", category: "action:book-email", message: `Entity page shared for "${processed.title}" to ${recipient}` });
    } catch (err) {
      logError("action:book-email", "Email failed", err, { cardId, entityId });
      sendOperation("error", `Email failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  // ── Path 2: Native tool invocation ──
  // If the card was produced by a tool from a co-loaded plugin,
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

      // ── Build App from Research ──
      if (action === "build_from_research" && ctx.toolFamily === "researcher") {
        const researchData = ctx.currentData as Record<string, unknown>;
        const topic = String(researchData?.topic ?? (payload as Record<string, unknown>)?.topic ?? "");
        const findings = (researchData?.keyFindings as Array<{ text: string }> ?? [])
          .slice(0, 5).map((f) => `- ${f.text}`).join("\n");
        const sectionTitles = (researchData?.sections as Array<{ title: string }> ?? [])
          .map((s) => s.title).join(", ");

        const buildPrompt = `Build an interactive dashboard app about "${topic}".

Key findings from research:
${findings || "General overview of " + topic}

Sections covered: ${sectionTitles || topic}

Requirements:
- Include data visualizations (charts, stats, progress indicators)
- Add filtering and search capabilities
- Include a findings/insights section with expandable details
- Use the EnsoUI component library (Tabs, DataTable, Stat, Badge, etc.)
- Make it visually polished with the dark theme`;

        logAction({ ts: Date.now(), type: "action", category: "action:native", message: `Build from research: "${topic}"`, cardId });
        handleBuildAppViaClaude({
          cardId,
          cardText: topic,
          buildAppDefinition: buildPrompt,
          client,
          account: ctx.account,
        }).catch((err) => logError("action:build_from_research", "Build failed", err, { cardId }));
        return;
      }

      // ── Save to Cortex ──
      if (action === "cortex_ingest") {
        const researchData = ctx.currentData as Record<string, unknown>;
        const p = (payload ?? {}) as Record<string, unknown>;
        const topic = String(p.topic ?? researchData?.topic ?? "");
        const summary = String(p.summary ?? researchData?.summary ?? "");
        const narrative = String(p.narrative ?? researchData?.narrative ?? "");
        const keyFindings = (p.keyFindings ?? researchData?.keyFindings ?? []) as Array<{ text: string; type?: string }>;
        const sections = (p.sections ?? researchData?.sections ?? []) as Array<{ title: string; summary?: string; bullets?: string[] }>;
        const sources = (p.sources ?? researchData?.sources ?? []) as Array<{ url?: string; title?: string; snippet?: string }>;

        logAction({ ts: Date.now(), type: "action", category: "action:cortex", message: `Cortex ingest from research: "${topic}"`, cardId });
        sendOperation("processing", "Saving to Cortex");

        try {
          const { ingestFromResearch } = await import("../cortex-tools.js");
          const result = await ingestFromResearch({ topic, summary, narrative, keyFindings, sections, sources });

          sendOperation("complete", "Saved to Cortex");
          client.send({
            id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0, state: "final",
            text: `Saved to Cortex: ${result.pagesCreated.length} pages created, ${result.pagesUpdated.length} updated.\n${result.summary}`,
            timestamp: Date.now(),
          });
        } catch (err) {
          logError("action:cortex_ingest", "Cortex ingest failed", err, { cardId });
          sendOperation("error", "Cortex ingest failed");
        }
        return;
      }

      // ── Import Data Sources to Cortex ──
      if (action === "import_sources") {
        logAction({ ts: Date.now(), type: "action", category: "action:cortex", message: "Cortex import from data sources", cardId });
        sendOperation("processing", "Importing data sources to Cortex");

        try {
          const { ingestFromDataSources } = await import("../cortex-tools.js");
          const result = await ingestFromDataSources();

          sendOperation("complete", "Imported to Cortex");
          client.send({
            id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0, state: "final",
            text: result.pagesCreated.length === 0 && result.pagesUpdated.length === 0
              ? `No data sources to import. ${result.summary}`
              : `Imported data sources to Cortex: ${result.pagesCreated.length} pages created, ${result.pagesUpdated.length} updated.\n${result.summary}`,
            timestamp: Date.now(),
          });
        } catch (err) {
          logError("action:import_sources", "Cortex data source import failed", err, { cardId });
          sendOperation("error", "Import failed");
        }
        return;
      }

      // ── Monitor Topic ──
      if (action === "monitor_topic" && ctx.toolFamily === "researcher") {
        try {
          const { addMonitor } = await import("../research-monitor.js");
          const researchData = ctx.currentData as Record<string, unknown>;
          const topic = String(researchData?.topic ?? (payload as Record<string, unknown>)?.topic ?? "");
          const findings = (researchData?.keyFindings as Array<{ text: string }> ?? []).map((f) => f.text);
          addMonitor(topic, findings);
          logAction({ ts: Date.now(), type: "action", category: "action:native", message: `Monitor added: "${topic}"`, cardId });
          client.send({
            id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0, state: "final",
            text: `Now monitoring "${topic}" for changes. I'll check every 6 hours and notify you of significant updates.`,
            timestamp: Date.now(),
          });
        } catch (err) {
          logError("action:monitor_topic", "Failed to add monitor", err, { cardId });
        }
        return;
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
          // Save standard data before overwriting (needed for deep research toggle)
          const previousStandardData = ctx.currentData ? structuredClone(ctx.currentData) : null;
          ctx.currentData = structuredClone(result.data);

          // Deep research: deliver as enhanceResult so user can toggle between
          // standard research board (Original) and custom deep UI (App)
          const resultObj = result.data as Record<string, unknown>;
          if (resultObj._generatedUI && typeof resultObj._generatedUI === "string") {
            const customUI = resultObj._generatedUI as string;
            delete resultObj._generatedUI; // Don't pass internal field to frontend
            logAction({ ts: Date.now(), type: "action", category: "action:native", message: `Deep research custom UI delivered as enhanceResult (${customUI.length} chars)`, cardId });

            // Mark the ORIGINAL standard data with hasDeepResearch flag to hide the Deep button
            const standardData = previousStandardData ?? ctx.currentData;
            if (standardData && typeof standardData === "object") {
              (standardData as Record<string, unknown>).hasDeepResearch = true;
            }

            // Update the card's standard data (original research) with the flag
            const tpl = inferToolTemplate({ toolName: ctx.appToolHint.toolName, data: standardData });
            const templateCode = tpl ? getToolTemplateCode(tpl) : undefined;
            client.send({
              id: randomUUID(),
              runId: randomUUID(),
              sessionKey: client.sessionKey,
              seq: 0,
              state: "final",
              targetCardId: cardId,
              data: standardData,
              ...(templateCode ? { generatedUI: templateCode } : {}),
              cardMode: cardModeFromContext(ctx),
              timestamp: Date.now(),
            });

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
                cardMode: {
                  interactionMode: "tool" as const,
                  ...cardModeFromContext(ctx),
                  signatureId: "deep_research_custom",
                },
              },
              timestamp: Date.now(),
            });

            // Persist both standard and deep research data to card history
            persistCard(client.id, capturedConvId, {
              id: cardId,
              runId: "",
              type: "dynamic-ui",
              role: "assistant",
              data: standardData,
              generatedUI: templateCode ?? undefined,
              cardMode: cardModeFromContext(ctx),
              appData: result.data,
              appGeneratedUI: customUI,
              appCardMode: { interactionMode: "tool" as const, ...cardModeFromContext(ctx), signatureId: "deep_research_custom" },
              timestamp: Date.now(),
            });
            return;
          }

          // If deep research build failed (no _generatedUI) and card was in building state,
          // clear the building status by sending a null enhanceResult
          if ((resultObj as Record<string, unknown>).depth === "deep") {
            client.send({
              id: randomUUID(),
              runId: randomUUID(),
              sessionKey: client.sessionKey,
              seq: 0,
              state: "final",
              targetCardId: cardId,
              enhanceResult: null,
              timestamp: Date.now(),
            });
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

          // Send context-aware follow-up chips for research results
          if (ctx.toolFamily === "researcher" && (action === "search" || !action)) {
            try {
              const researchData = (result.data ?? followup.renderData) as Record<string, unknown>;
              const suggestions = generateResearchFollowUps({
                data: {
                  topic: researchData.topic as string,
                  keyFindings: researchData.keyFindings as Array<{ text: string; type?: string }>,
                  sections: researchData.sections as Array<{ title: string; bullets?: string[] }>,
                  contradictions: researchData.contradictions as Array<{ claim: string }>,
                },
                language: client.language,
              });
              if (suggestions.length > 0) {
                client.send({
                  id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0, state: "final",
                  followUps: { cardId, suggestions },
                  timestamp: Date.now(),
                });
              }
            } catch { /* non-fatal */ }
          }
          return;
        }

        // ── Executor failed — try auto-heal first, then Claude Code ──
        const errorMsg = result.error ?? "Tool returned no data";
        if (isDynamicTool(toolCall.toolName)) {
          const execBody = getExecutorBody(toolCall.toolName);
          if (execBody) {
            // Attempt lightweight LLM auto-heal before resorting to Claude Code
            const healAccount = getActiveAccount();
            if (healAccount?.geminiApiKey) {
              sendOperation("processing", "Auto-healing executor");
              logAction({ ts: Date.now(), type: "action", category: "action:autoheal", message: `Attempting auto-heal for "${toolCall.toolName}": ${errorMsg}`, cardId });

              try {
                const { autoHealExecutor } = await import("../tool-factory.js");
                const { buildFailureContext } = await import("../interaction-tracker.js");
                const failureCtx = buildFailureContext(ctx.toolFamily ?? "", errorMsg);
                const healResult = await autoHealExecutor({
                  toolName: toolCall.toolName,
                  toolFamily: ctx.toolFamily ?? "unknown",
                  executorBody: execBody,
                  errorMessage: errorMsg,
                  failedParams: (toolCall.params ?? {}) as Record<string, unknown>,
                  sampleData: (ctx.currentData ?? {}) as Record<string, unknown>,
                  expectedKeys: Object.keys((ctx.currentData ?? {}) as Record<string, unknown>),
                  apiKey: healAccount.geminiApiKey,
                  failureContext: failureCtx ? { formatted: failureCtx.formatted } : undefined,
                  model: client.chatModel,
                  providerKeys: { ...healAccount.providerKeys, gemini: healAccount.geminiApiKey },
                });

                if (healResult.success && healResult.fixedBody) {
                  logAction({ ts: Date.now(), type: "action", category: "action:autoheal", message: `Auto-heal succeeded for "${toolCall.toolName}", persisting fix and retrying`, cardId });

                  hotSwapExecutor(toolCall.toolName, healResult.fixedBody, ctx.toolFamily ?? "unknown", healAccount.geminiApiKey);

                  const { executeToolDirect } = await import("../native-tools/registry.js");
                  const retryResult = await executeToolDirect(toolCall.toolName, toolCall.params ?? {});
                  if (retryResult.success && retryResult.data) {
                    sendOperation("complete", "Auto-heal succeeded");
                    const freshData = retryResult.data;
                    ctx.currentData = freshData;
                    client.send({
                      id: randomUUID(), runId: randomUUID(), sessionKey: client.sessionKey, seq: 0,
                      state: "final", targetCardId: cardId,
                      data: freshData,
                      operation: { operationId, stage: "complete", label: "Fixed and refreshed", cancellable: false },
                      timestamp: Date.now(),
                    } as ServerMessage);
                    return;
                  }
                }
                logAction({ ts: Date.now(), type: "action", category: "action:autoheal", message: `Auto-heal failed for "${toolCall.toolName}", falling back to Claude Code`, cardId });
              } catch (healErr) {
                logError("action:autoheal", "Auto-heal threw", healErr, { cardId, toolName: toolCall.toolName });
              }
            }
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
              fixParts.push(``, `## App Location`, `server/apps/${ctx.toolFamily}/`);
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

  // No mechanical handler matched — route through agent pipeline.
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

  const { handleInbound } = await import("../agent-adapter.js");
  await handleInbound({
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
