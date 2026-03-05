import { randomUUID } from "crypto";
import { join } from "path";
import type { ResolvedEnsoAccount } from "../accounts.js";
import type { ConnectedClient } from "../server.js";
import { toMediaUrl } from "../server.js";
import type { AgentStep } from "@shared/types";
import type { ServerMessage } from "../types.js";
import { selectToolForContent } from "../ui-generator.js";
import { TOOL_FAMILY_CAPABILITIES } from "../tool-families/catalog.js";
import {
  inferToolTemplate,
  executeToolDirect,
  getToolPluginId,
  getPluginToolPrefix,
  getToolTemplateCode,
  isToolRegistered,
  normalizeDataForToolTemplate,
} from "../native-tools/registry.js";
import { logAction, logError } from "../action-log.js";
import type { CardContext } from "./card-context.js";
import { cardContexts } from "./card-context.js";
import {
  stripThinkingBlocks,
  rewriteExecFailure,
  extractMediaPaths,
  compactPromptText,
} from "./helpers.js";

/**
 * Deliver an agent reply payload to a connected browser client.
 * Called from the buffered block dispatcher's `deliver` callback.
 */
export async function deliverEnsoReply(params: {
  payload: { text?: string; mediaUrl?: string; mediaUrls?: string[] };
  client: ConnectedClient;
  runId: string;
  seq: number;
  account: ResolvedEnsoAccount;
  userMessage: string;
  targetCardId?: string;
  cardId?: string;
  steps?: AgentStep[];
  toolMeta?: { toolId: string; toolSessionId?: string };
  statusSink?: (patch: { lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { payload, client, runId, seq, targetCardId, toolMeta, statusSink } = params;

  // Use last step's text as primary content when multi-block steps are available
  const lastStepText = params.steps?.length
    ? params.steps[params.steps.length - 1].text
    : undefined;
  const rawText = lastStepText ?? payload.text ?? "";
  const text = rewriteExecFailure(stripThinkingBlocks(rawText));
  logAction({ ts: Date.now(), type: "action", category: "outbound", message: `deliverEnsoReply: seq=${seq}, cardId=${params.cardId ?? "auto"}, textLen=${text.length}, steps=${params.steps?.length ?? 0}, targetCardId=${targetCardId ?? "none"}` });

  // Collect media URLs from payload, converting local paths to HTTP URLs
  const mediaUrls: string[] = [];
  if (payload.mediaUrls) mediaUrls.push(...payload.mediaUrls.map(toMediaUrl));
  if (payload.mediaUrl) {
    const url = toMediaUrl(payload.mediaUrl);
    if (!mediaUrls.includes(url)) mediaUrls.push(url);
  }

  // Auto-detect local file paths in response text
  for (const localPath of extractMediaPaths(text)) {
    const url = toMediaUrl(localPath);
    if (!mediaUrls.includes(url)) mediaUrls.push(url);
  }

  if (!text.trim() && mediaUrls.length === 0) {
    return;
  }

  // Stable card ID ensures all blocks of the same run reference the same card
  const msgId = params.cardId ?? targetCardId ?? randomUUID();

  // Tool-routed messages (e.g. claude-code) bypass UI generation —
  // they're rendered as raw text in a terminal card.
  if (toolMeta) {
    const msg: ServerMessage = {
      id: msgId,
      runId,
      sessionKey: client.sessionKey,
      seq,
      state: "final",
      text,
      toolMeta,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      ...(targetCardId ? { targetCardId } : {}),
      timestamp: Date.now(),
    };
    client.send(msg);
    statusSink?.({ lastOutboundAt: Date.now() });
    return;
  }

  const msg: ServerMessage = {
    id: msgId,
    runId,
    sessionKey: client.sessionKey,
    seq,
    state: "final",
    text,
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    steps: params.steps && params.steps.length > 1 ? params.steps : undefined,
    ...(targetCardId ? { targetCardId } : {}),
    timestamp: Date.now(),
  };

  client.send(msg);
  statusSink?.({ lastOutboundAt: Date.now() });
}

/**
 * Handle a user-triggered "Enhance to App" request on a card.
 * Makes a single LLM call to select the best tool, executes it directly,
 * and sends back the app view data + pre-built template code.
 */
export async function handleCardEnhance(params: {
  cardId: string;
  cardText: string;
  suggestedFamily?: string;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}): Promise<void> {
  const { cardId, cardText, client, account } = params;

  const sendEnhanceResult = (enhanceResult: ServerMessage["enhanceResult"]) => {
    const msg: ServerMessage = {
      id: randomUUID(),
      runId: randomUUID(),
      sessionKey: client.sessionKey,
      seq: 0,
      state: "final",
      targetCardId: cardId,
      enhanceResult,
      timestamp: Date.now(),
    };
    client.send(msg);
  };

  logAction({ ts: Date.now(), type: "action", category: "enhance", message: `Enhance start: cardId=${cardId}, textLen=${cardText.length}`, cardId });

  if (!account.geminiApiKey) {
    logAction({ ts: Date.now(), type: "action", category: "enhance", message: `Enhance aborted: no geminiApiKey configured`, cardId });
    sendEnhanceResult(null);
    return;
  }

  // When a family is pre-selected from the menu, skip the LLM tool selection call
  let selection: { toolFamily: string; toolName: string; params: Record<string, unknown> } | null;
  if (params.suggestedFamily) {
    const cap = TOOL_FAMILY_CAPABILITIES.find((c) => c.toolFamily === params.suggestedFamily);
    if (cap) {
      selection = { toolFamily: cap.toolFamily, toolName: cap.fallbackToolName, params: {} };
      logAction({ ts: Date.now(), type: "action", category: "enhance", message: `Family pre-selected: ${cap.toolFamily}, using fallback tool ${cap.fallbackToolName}`, cardId });
    } else {
      logAction({ ts: Date.now(), type: "action", category: "enhance", message: `Suggested family "${params.suggestedFamily}" not found, falling back to LLM selection`, cardId });
      selection = await selectToolForContent({ cardText, geminiApiKey: account.geminiApiKey, toolFamilies: TOOL_FAMILY_CAPABILITIES });
    }
  } else {
    selection = await selectToolForContent({ cardText, geminiApiKey: account.geminiApiKey, toolFamilies: TOOL_FAMILY_CAPABILITIES });
  }

  if (!selection) {
    logAction({ ts: Date.now(), type: "action", category: "enhance", message: `No tool selected by LLM for cardId=${cardId}`, cardId });
    sendEnhanceResult(null);
    return;
  }
  logAction({ ts: Date.now(), type: "action", category: "enhance", message: `Selection: tool=${selection.toolName}, family=${selection.toolFamily}`, cardId });

  // ── Fix 1: Validate / correct tool name ──
  // The LLM sometimes invents tool names like "enso_meal_planner_grocery_list"
  // instead of the registered "enso_meal_grocery_list". Derive the real prefix
  // by stripping the fallback tool's own action suffix.
  let toolName = selection.toolName;
  const capability = TOOL_FAMILY_CAPABILITIES.find((c) => c.toolFamily === selection.toolFamily);
  if (capability) {
    const fallbackSuffix = capability.actionSuffixes.find((s) =>
      capability.fallbackToolName.endsWith(`_${s}`),
    );
    const familyPrefix = fallbackSuffix
      ? capability.fallbackToolName.slice(0, -fallbackSuffix.length)
      : capability.fallbackToolName.replace(/_[^_]+$/, "_");

    const matchedSuffix = capability.actionSuffixes.find((s) => toolName.endsWith(`_${s}`));
    if (matchedSuffix) {
      toolName = `${familyPrefix}${matchedSuffix}`;
    } else {
      toolName = capability.fallbackToolName;
    }
  }

  // ── Fix 2: Normalize param names ──
  // LLM may return variations like "location" instead of "destination",
  // "dietary_preferences" instead of "diet", "duration" instead of "days".
  const execParams: Record<string, unknown> = { ...selection.params };
  const paramAliases: Record<string, string> = {
    location: "destination",
    ...(selection.toolFamily !== "city_planner" ? { city: "destination" } : {}),
    duration: "days",
    duration_days: "days",
    num_days: "days",
    dietary_preferences: "diet",
    dietary: "diet",
    diet_type: "diet",
    num_servings: "servings",
    day_index: "dayIndex",
    meal: "mealType",
    meal_type: "mealType",
    weekly_cost: "budget",
    weekly_budget: "budget",
    budget_usd: "budget",
  };
  for (const [alias, canonical] of Object.entries(paramAliases)) {
    if (alias in execParams && !(canonical in execParams)) {
      execParams[canonical] = execParams[alias];
      delete execParams[alias];
    }
  }
  // Coerce string numbers to actual numbers for common numeric params
  for (const numKey of ["days", "budget", "servings", "day", "dayIndex", "limit"]) {
    if (typeof execParams[numKey] === "string") {
      const n = parseFloat(execParams[numKey] as string);
      if (!Number.isNaN(n)) execParams[numKey] = n;
    }
  }

  logAction({ ts: Date.now(), type: "action", category: "enhance", message: `Tool selected: ${toolName} (family: ${selection.toolFamily})`, cardId });

  // ── Fix 3: Normalize path params ──
  // LLM may return relative paths, bare /Desktop, /home/Desktop, /Users/$USER/Desktop,
  // /Users/username/Desktop, or literal shell variables instead of ~/Desktop
  const home = process.env.HOME ?? ".";
  const user = process.env.USER ?? "user";
  const resolvePathParam = (val: unknown): string => {
    let p = typeof val === "string" ? val.trim() : "";
    if (!p) return home;
    // Replace literal shell variables: $USER, ${USER}, $HOME, ${HOME}
    p = p.replace(/\$\{?USER\}?/g, user);
    p = p.replace(/\$\{?HOME\}?/g, home);
    if (p.startsWith("~")) return join(home, p.slice(1));
    // Strip /Users/<placeholder>/ prefix — LLM often invents usernames
    const usersMatch = p.match(/^\/Users\/[^/]+\/(.*)/);
    if (usersMatch) return join(home, usersMatch[1]);
    // Strip /home/ prefix — LLM sometimes uses Linux conventions
    if (p.match(/^\/home\b/)) p = p.replace(/^\/home(\/[^/]+)?/, "");
    if (p.startsWith("/") && !p.startsWith(home)) return join(home, p);
    if (!p.startsWith("/")) return join(home, p);
    return p;
  };

  if (selection.toolFamily === "filesystem") {
    execParams.path = resolvePathParam(execParams.path);
  } else if (selection.toolFamily === "city_planner" && !execParams.city) {
    // Extract city name from card text when using suggestedFamily shortcut
    // Simple heuristic: look for capitalized words after common prepositions
    const cityMatch = cardText.match(/(?:about|in|visit|explore|to)\s+([A-Z][a-zA-ZÀ-ÿ\s]{1,30}?)(?:\s*[-–—.,;:!?\n]|$)/);
    execParams.city = cityMatch?.[1]?.trim() || cardText.split(/\s+/).slice(0, 3).join(" ");
    logAction({ ts: Date.now(), type: "action", category: "enhance", message: `Extracted city from card text: "${execParams.city}"`, cardId });
  } else if (selection.toolFamily === "researcher" && !execParams.topic) {
    // Use card text as the research topic (first 200 chars, trimmed)
    execParams.topic = cardText.slice(0, 200).trim();
    logAction({ ts: Date.now(), type: "action", category: "enhance", message: `Extracted research topic from card text`, cardId });
  }

  let toolResult = await executeToolDirect(toolName, execParams);

  // If the tool fails, retry: different tool → family fallback; same tool → parent directory
  if (!toolResult.success && capability) {
    const fallbackParams = { ...execParams };
    if (toolName !== capability.fallbackToolName) {
      logAction({ ts: Date.now(), type: "action", category: "enhance", message: `${toolName} failed (${toolResult.error}), retrying with ${capability.fallbackToolName}`, cardId });
      if (typeof fallbackParams.path === "string" && fallbackParams.path.includes("/")) {
        const parentDir = fallbackParams.path.replace(/\/[^/]+$/, "");
        if (parentDir) fallbackParams.path = parentDir;
      }
      toolName = capability.fallbackToolName;
      toolResult = await executeToolDirect(toolName, fallbackParams);
    } else if (typeof fallbackParams.path === "string" && fallbackParams.path.includes("/")) {
      const parentDir = fallbackParams.path.replace(/\/[^/]+$/, "");
      if (parentDir && parentDir !== fallbackParams.path) {
        logAction({ ts: Date.now(), type: "action", category: "enhance", message: `${toolName} failed (${toolResult.error}), retrying with parent dir: ${parentDir}`, cardId });
        toolResult = await executeToolDirect(toolName, { ...fallbackParams, path: parentDir });
      }
    }
  }

  if (!toolResult.success || toolResult.data == null) {
    logAction({ ts: Date.now(), type: "action", category: "enhance", message: `Tool execution failed: ${toolResult.error ?? "no data"}`, cardId });
    sendEnhanceResult(null);
    return;
  }

  const signature = inferToolTemplate({ toolName, data: toolResult.data });
  const templateCode = signature ? getToolTemplateCode(signature) : undefined;

  if (!templateCode) {
    logAction({ ts: Date.now(), type: "action", category: "enhance", message: `No template found for ${toolName}`, cardId });
    sendEnhanceResult(null);
    return;
  }

  const data = signature
    ? normalizeDataForToolTemplate(signature, toolResult.data)
    : toolResult.data;

  // Register card context so card actions work in app mode
  const cardCtx: CardContext = {
    cardId,
    originalPrompt: "",
    originalResponse: cardText,
    currentData: structuredClone(data),
    geminiApiKey: account.geminiApiKey,
    account,
    mode: account.mode,
    actionHistory: [],
    interactionMode: "tool",
    toolFamily: selection.toolFamily,
    signatureId: signature?.signatureId,
    coverageStatus: signature?.coverageStatus,
  };

  const pluginId = getToolPluginId(toolName);
  const prefix = pluginId ? getPluginToolPrefix(pluginId) : undefined;
  if (prefix) {
    cardCtx.nativeToolHint = {
      toolName,
      params: execParams,
      handlerPrefix: prefix,
    };
  }

  cardContexts.set(cardId, cardCtx);
  logAction({ ts: Date.now(), type: "action", category: "enhance", message: `Context registered: cardId=${cardId}, family=${selection.toolFamily}, signature=${signature?.signatureId ?? "none"}, prefix=${prefix ?? "none"}, hasNativeHint=${!!cardCtx.nativeToolHint}`, cardId });

  sendEnhanceResult({
    data,
    generatedUI: templateCode,
    cardMode: {
      interactionMode: "tool",
      toolFamily: selection.toolFamily,
      signatureId: signature?.signatureId,
      coverageStatus: signature?.coverageStatus,
    },
  });
}

/**
 * Outbound sendText/sendMedia handler for the channel plugin's outbound adapter.
 * Used when OpenClaw delivers agent responses or sends messages via `openclaw send`.
 */
export async function deliverToEnso(ctx: {
  cfg?: unknown;
  to: string;
  text: string;
  mediaUrl?: string;
  accountId?: string | null;
}): Promise<{ channel: string; messageId: string; target: string }> {
  const { getClientsBySession, getClientsByPeerId, getAllClients } = await import("../server.js");

  let targets = getClientsBySession(ctx.to);
  if (targets.length === 0) {
    targets = getClientsByPeerId(ctx.to);
  }
  if (targets.length === 0) {
    targets = getAllClients();
  }

  const messageId = randomUUID();
  const text = rewriteExecFailure(stripThinkingBlocks(ctx.text ?? ""));
  logAction({ ts: Date.now(), type: "action", category: "outbound", message: `deliverToEnso: to=${ctx.to}, textLen=${text.length}, targets=${targets.length}, mediaUrl=${ctx.mediaUrl ?? "none"}` });

  const mediaUrls: string[] = [];
  if (ctx.mediaUrl) mediaUrls.push(toMediaUrl(ctx.mediaUrl));
  for (const localPath of extractMediaPaths(text)) {
    const url = toMediaUrl(localPath);
    if (!mediaUrls.includes(url)) mediaUrls.push(url);
  }

  const msg: ServerMessage = {
    id: messageId,
    runId: randomUUID(),
    sessionKey: ctx.to,
    seq: 0,
    state: "final",
    text,
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    timestamp: Date.now(),
  };

  for (const client of targets) {
    client.send(msg);
  }

  return { channel: "enso", messageId, target: ctx.to };
}
