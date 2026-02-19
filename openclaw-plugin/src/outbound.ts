import { randomUUID } from "crypto";
import { existsSync, statSync } from "fs";
import { extname, join } from "path";
import type { RuntimeEnv } from "openclaw/plugin-sdk";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { ConnectedClient } from "./server.js";
import { toMediaUrl, MAX_MEDIA_FILE_SIZE, getActiveAccount } from "./server.js";
import type { AgentStep } from "@shared/types";
import type { CardModeDetail, CoreConfig, OperationStage, ServerMessage } from "./types.js";
import {
  selectToolForContent,
  serverGenerateConstrainedFollowupUI,
  serverGenerateUI,
} from "./ui-generator.js";
import { TOOL_FAMILY_CAPABILITIES } from "./tool-families/catalog.js";
import {
  inferToolTemplate,
  executeToolDirect,
  getActionDescriptions,
  getRegisteredToolCatalog,
  getToolTemplate,
  getToolTemplateCode,
  getToolPluginId,
  getPluginToolPrefix,
  isToolActionCovered,
  isToolRegistered,
  normalizeDataForToolTemplate,
  registerToolTemplateCandidate,
  getPreferredToolProviderForFamily,
  type ToolTemplateCoverageStatus,
} from "./native-tools/registry.js";
import {
  buildToolConsoleFamilyData,
  buildToolConsoleHomeData,
  handleToolConsoleAdd,
} from "./tooling-console.js";
// import { parseAgentText } from "./text-parser.js";

// ── Card Interaction Context ──

interface CardContext {
  cardId: string;
  originalPrompt: string;
  originalResponse: string;
  currentData: unknown;
  geminiApiKey?: string;
  account: ResolvedEnsoAccount;
  mode: "im" | "ui" | "full";
  actionHistory: Array<{
    action: string;
    payload: unknown;
    timestamp: number;
  }>;
  /**
   * Present when the agent used a tool from a co-loaded OpenClaw plugin
   * to produce this card's data. Enables card actions to bypass the agent
   * and call the tool directly via the plugin registry.
   */
  nativeToolHint?: {
    /** The full tool name that produced the original data, e.g. "alpharank_latest_predictions" */
    toolName: string;
    /** The params the agent passed to the tool */
    params: Record<string, unknown>;
    /** The action map prefix, used to look up the handler, e.g. "alpharank_" */
    handlerPrefix: string;
  };
  interactionMode: "llm" | "tool";
  toolFamily?: string;
  signatureId?: string;
  coverageStatus?: ToolTemplateCoverageStatus;
}

const cardContexts = new Map<string, CardContext>();

/**
 * Stable card ID per runId — ensures all blocks of a multi-block response
 * use the same msg.id. The frontend creates the card with the first block's
 * id, so the card context must be registered under the same id.
 */

/**
 * Strip Gemini thinking/reasoning blocks from response text.
 * Gemini 2.5 Flash outputs thinking as regular text with bold headers
 * (e.g. "**Analyzing...**\n\nreasoning text\n\n\n") before the actual response.
 */
function stripThinkingBlocks(text: string): string {
  // Match one or more thinking blocks at the start of the text:
  // **Bold Title**\n\n<reasoning content>\n\n\n
  const stripped = text.replace(
    /^(?:\*\*[^*]+\*\*\s*\n\n[\s\S]*?\n\n\n)+/,
    "",
  );
  return stripped.trim() || text;
}

function compactPromptText(prompt: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return "User request";

  // If this is an action-generated wrapper prompt, recover the original user prompt.
  const wrappedMatch = trimmed.match(/created from the prompt "([^"]+)"/i);
  if (wrappedMatch?.[1]) {
    return wrappedMatch[1];
  }

  if (trimmed.length <= 220) return trimmed;
  return `${trimmed.slice(0, 220)}...`;
}

function summarizeCardDataForAgent(data: unknown): string {
  try {
    const json = JSON.stringify(data);
    if (!json) return "No card data";
    return json.length > 380 ? `${json.slice(0, 380)}...` : json;
  } catch {
    return "Unserializable card data";
  }
}

function rewriteExecCommandNotFound(text: string): string {
  const execFailure = text.match(/Exec:\s*([\s\S]*?)\s+failed:\s*([\s\S]*)$/i);
  const failedCommand = execFailure?.[1]?.trim();
  const failureReason = execFailure?.[2]?.trim();

  const missing = text.match(/command not found:\s*([^\s]+)/i);
  if (!missing) return text;
  const cmd = missing[1];

  // Special-case clawhub: provide an immediate ecosystem discovery fallback
  // using the loaded OpenClaw runtime registry instead of external CLI tools.
  if (cmd.toLowerCase() === "clawhub" || /exec:\s*clawhub/i.test(text)) {
    const catalog = getRegisteredToolCatalog();
    if (catalog.length > 0) {
      const preview = catalog
        .slice(0, 8)
        .map((entry) => `- ${entry.pluginId} (${entry.tools.length} tools)`)
        .join("\n");
      return `I cannot run \`clawhub\` in this environment, but I can still show the loaded OpenClaw ecosystem directly.

Loaded plugins right now: ${catalog.length}
${preview}

To explore more, ask:
- "list all loaded plugins"
- "search loaded tools for <keyword>"
- "show details for plugin <name>"`;
    }
  }

  return `The requested command is not available in this runtime environment.

Missing command: \`${cmd}\`

Try one of these next steps:
- Ask me to list currently loaded OpenClaw plugins/tools directly (no CLI required).
- If you expected this command to exist, install/configure it in the host environment and retry.
- Use a plugin/tool-centric request instead of a shell command (for example: "show loaded tools" or "search loaded tools for X").`;
}

function rewriteExecFailure(text: string): string {
  const commandNotFoundRewrite = rewriteExecCommandNotFound(text);
  if (commandNotFoundRewrite !== text) return commandNotFoundRewrite;

  const execFailure = text.match(/Exec:\s*([\s\S]*?)\s+failed:\s*([\s\S]*)$/i);
  if (!execFailure) return text;

  const cmd = execFailure[1].trim();
  const reason = execFailure[2].trim();
  const cmdPreview = cmd.length > 140 ? `${cmd.slice(0, 140)}...` : cmd;

  // Common case: one probe command in a chain fails with non-zero exit.
  if (/command exited with code\s+\d+/i.test(reason)) {
    return `A shell probe failed before the full check completed.

What failed:
- Command: \`${cmdPreview}\`
- Reason: ${reason}

What to do next:
- Re-run with narrower checks (one tool family at a time) to avoid brittle chained probes.
- Ask for a resilient inventory format (e.g. "check python/node/git/docker individually and summarize").
- If you want OpenClaw ecosystem discovery, use runtime-native requests like:
  - "list all loaded plugins"
  - "search loaded tools for <keyword>"`;
  }

  return `A shell execution step failed.

What failed:
- Command: \`${cmdPreview}\`
- Reason: ${reason}

Try a narrower request or a runtime-native tool query so Enso can recover gracefully if one probe fails.`;
}

function applyDetectedToolTemplate(ctx: CardContext, signature: ReturnType<typeof inferToolTemplate>): void {
  if (!signature) return;
  ctx.interactionMode = "tool";
  ctx.toolFamily = signature.toolFamily;
  ctx.signatureId = signature.signatureId;
  ctx.coverageStatus = signature.coverageStatus;
}

function cardModeFromContext(ctx: CardContext | undefined): CardModeDetail | undefined {
  if (!ctx) return undefined;
  return {
    interactionMode: ctx.interactionMode,
    ...(ctx.toolFamily ? { toolFamily: ctx.toolFamily } : {}),
    ...(ctx.signatureId ? { signatureId: ctx.signatureId } : {}),
    ...(ctx.coverageStatus ? { coverageStatus: ctx.coverageStatus } : {}),
  };
}

function inferDesktopLikePathFromPrompt(prompt: string): string | undefined {
  const lower = prompt.toLowerCase();
  if (lower.includes("desktop")) return "~/Desktop";
  if (lower.includes("download")) return "~/Downloads";
  if (lower.includes("document")) return "~/Documents";
  if (lower.includes("home folder") || lower.includes("home directory") || lower.includes("home")) return "~";
  return undefined;
}

function inferWorkspaceLikePathFromPrompt(prompt: string): string | undefined {
  const lower = prompt.toLowerCase();
  if (lower.includes("github")) return "~/Desktop/Github";
  if (lower.includes("project")) return "~/Desktop/Github";
  return undefined;
}


function hydrateFilesystemLikeData(data: unknown, prompt: string): unknown {
  if (
    Array.isArray(data)
    && data.every((entry) => entry && typeof entry === "object" && "name" in (entry as Record<string, unknown>))
  ) {
    const inferredPath = inferDesktopLikePathFromPrompt(prompt) ?? ".";
    return {
      title: "Directory listing",
      files: data.map((entry) => {
        const record = entry as Record<string, unknown>;
        if (typeof record.path === "string" && record.path.trim()) return entry;
        const name = typeof record.name === "string" ? record.name.trim() : "";
        if (!name) return entry;
        return { ...record, path: join(inferredPath, name) };
      }),
      path: inferredPath,
    };
  }
  if (!data || typeof data !== "object") return data;
  const source = data as Record<string, unknown>;
  const hasFiles = Array.isArray(source.files);
  const hasItems = Array.isArray(source.items);
  if (!hasFiles && !hasItems) return data;

  const inferredPath =
    (typeof source.path === "string" && source.path.trim()) ? source.path : inferDesktopLikePathFromPrompt(prompt);
  if (!inferredPath) return data;

  const clone: Record<string, unknown> = { ...source, path: inferredPath };
  const listKey = hasFiles ? "files" : "items";
  const list = (clone[listKey] as unknown[]).map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const record = entry as Record<string, unknown>;
    if (typeof record.path === "string" && record.path.trim()) return entry;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) return entry;
    return { ...record, path: join(inferredPath, name) };
  });
  clone[listKey] = list;
  return clone;
}

function attachSyntheticNativeToolHint(ctx: CardContext, data: unknown, prompt: string): void {
  if (ctx.nativeToolHint || !ctx.toolFamily) return;
  const hydrated = (data && typeof data === "object") ? (data as Record<string, unknown>) : {};
  if (ctx.toolFamily === "filesystem") {
    const provider = getPreferredToolProviderForFamily("filesystem");
    if (!provider) return;
    const path =
      (typeof hydrated.path === "string" && hydrated.path.trim())
        ? hydrated.path
        : (inferDesktopLikePathFromPrompt(prompt) ?? ".");
    ctx.nativeToolHint = {
      toolName: provider.toolName,
      params: { path },
      handlerPrefix: provider.handlerPrefix,
    };
    return;
  }
  if (ctx.toolFamily === "code_workspace") {
    const provider = getPreferredToolProviderForFamily("code_workspace");
    if (!provider) return;
    const pathCandidate =
      (typeof hydrated.path === "string" && hydrated.path.trim())
      || (typeof hydrated.parentPath === "string" && hydrated.parentPath.trim())
      || (typeof hydrated.basePath === "string" && hydrated.basePath.trim())
      || inferWorkspaceLikePathFromPrompt(prompt)
      || "~/Desktop/Github";
    ctx.nativeToolHint = {
      toolName: provider.toolName,
      params: { path: pathCandidate },
      handlerPrefix: provider.handlerPrefix,
    };
    return;
  }
  if (ctx.toolFamily === "multimedia") {
    const provider = getPreferredToolProviderForFamily("multimedia");
    if (!provider) return;
    const pathCandidate =
      (typeof hydrated.path === "string" && hydrated.path.trim())
      || (typeof hydrated.scannedPath === "string" && hydrated.scannedPath.trim())
      || inferDesktopLikePathFromPrompt(prompt)
      || "~/Desktop";
    ctx.nativeToolHint = {
      toolName: provider.toolName,
      params: { path: pathCandidate },
      handlerPrefix: provider.handlerPrefix,
    };
    return;
  }
  if (ctx.toolFamily === "travel_planner") {
    const provider = getPreferredToolProviderForFamily("travel_planner");
    if (!provider) return;
    const destination =
      (typeof hydrated.destination === "string" && hydrated.destination.trim())
      || "Tokyo";
    const days =
      (typeof hydrated.days === "number" && hydrated.days > 0)
      ? Math.floor(hydrated.days)
      : 5;
    ctx.nativeToolHint = {
      toolName: provider.toolName,
      params: { destination, days },
      handlerPrefix: provider.handlerPrefix,
    };
    return;
  }
  if (ctx.toolFamily === "meal_planner") {
    const provider = getPreferredToolProviderForFamily("meal_planner");
    if (!provider) return;
    const diet =
      (typeof hydrated.diet === "string" && hydrated.diet.trim())
      || "balanced";
    ctx.nativeToolHint = {
      toolName: provider.toolName,
      params: { diet },
      handlerPrefix: provider.handlerPrefix,
    };
  }
}

function isToolConsoleCommand(text: string): boolean {
  return /^\/tool\s+enso\b/i.test(text.trim());
}

async function renderFollowupUI(params: {
  ctx: CardContext;
  action: string;
  payload: unknown;
  data: unknown;
  assistantText: string;
  actionHints?: string;
}): Promise<{ generatedUI: string; renderData: unknown }> {
  const { ctx, action, payload, data, assistantText, actionHints } = params;
  if (ctx.interactionMode === "tool" && ctx.toolFamily && ctx.signatureId) {
    const signature = getToolTemplate(ctx.toolFamily, ctx.signatureId)
      ?? inferToolTemplate({ toolName: ctx.nativeToolHint?.toolName, data });
    if (signature) {
      const templateCode = getToolTemplateCode(signature);
      if (templateCode) {
        return {
          generatedUI: templateCode,
          renderData: normalizeDataForToolTemplate(signature, data),
        };
      }
    }
    const fallback = await serverGenerateConstrainedFollowupUI({
      data,
      userMessage: `${compactPromptText(ctx.originalPrompt)} [Action: ${action}${payload ? ` ${JSON.stringify(payload)}` : ""}]`,
      assistantText,
      geminiApiKey: ctx.geminiApiKey,
      action,
      signatureId: ctx.signatureId,
      toolFamily: ctx.toolFamily,
      actionHints,
    });
    if (signature) {
      registerToolTemplateCandidate(signature, fallback.code);
    }
    return { generatedUI: fallback.code, renderData: data };
  }

  const uiResult = await serverGenerateUI({
    data,
    userMessage: `${compactPromptText(ctx.originalPrompt)} [Action: ${action}${payload ? ` ${JSON.stringify(payload)}` : ""}]`,
    assistantText,
    geminiApiKey: ctx.geminiApiKey,
    actionHints,
  });
  return { generatedUI: uiResult.code, renderData: data };
}

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
  console.log(`[enso:outbound] deliverEnsoReply: seq=${seq}, cardId=${params.cardId ?? "auto"}, textLen=${text.length}, steps=${params.steps?.length ?? 0}, targetCardId=${targetCardId ?? "none"}`);

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

  console.log(`[enso:enhance] request: cardId=${cardId}, textLen=${cardText.length}`);

  if (!account.geminiApiKey) {
    console.log(`[enso:enhance] aborted: no geminiApiKey configured`);
    sendEnhanceResult(null);
    return;
  }

  const selection = await selectToolForContent({
    cardText,
    geminiApiKey: account.geminiApiKey,
    toolFamilies: TOOL_FAMILY_CAPABILITIES,
  });

  if (!selection) {
    console.log(`[enso:enhance] no tool selected by LLM for cardId=${cardId}`);
    sendEnhanceResult(null);
    return;
  }
  console.log(`[enso:enhance] LLM selection: tool=${selection.toolName}, family=${selection.toolFamily}, params=${JSON.stringify(selection.params)}`);

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
    city: "destination",
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

  console.log(`[enso:enhance] tool selected: ${toolName} (family: ${selection.toolFamily}), params: ${JSON.stringify(execParams)}`);

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

  if (selection.toolFamily === "filesystem" || selection.toolFamily === "multimedia") {
    execParams.path = resolvePathParam(execParams.path);
  } else if (selection.toolFamily === "code_workspace") {
    execParams.path = resolvePathParam(execParams.path ?? execParams.root);
  }

  let toolResult = await executeToolDirect(toolName, execParams);

  // If the tool fails, retry: different tool → family fallback; same tool → parent directory
  if (!toolResult.success && capability) {
    const fallbackParams = { ...execParams };
    if (toolName !== capability.fallbackToolName) {
      console.log(`[enso:enhance] ${toolName} failed (${toolResult.error}), retrying with ${capability.fallbackToolName}`);
      if (typeof fallbackParams.path === "string" && fallbackParams.path.includes("/")) {
        const parentDir = fallbackParams.path.replace(/\/[^/]+$/, "");
        if (parentDir) fallbackParams.path = parentDir;
      }
      toolName = capability.fallbackToolName;
      toolResult = await executeToolDirect(toolName, fallbackParams);
    } else if (typeof fallbackParams.path === "string" && fallbackParams.path.includes("/")) {
      const parentDir = fallbackParams.path.replace(/\/[^/]+$/, "");
      if (parentDir && parentDir !== fallbackParams.path) {
        console.log(`[enso:enhance] ${toolName} failed (${toolResult.error}), retrying with parent dir: ${parentDir}`);
        toolResult = await executeToolDirect(toolName, { ...fallbackParams, path: parentDir });
      }
    }
  }

  if (!toolResult.success || toolResult.data == null) {
    console.log(`[enso:enhance] tool execution failed: ${toolResult.error ?? "no data"}`);
    sendEnhanceResult(null);
    return;
  }

  const signature = inferToolTemplate({ toolName, data: toolResult.data });
  const templateCode = signature ? getToolTemplateCode(signature) : undefined;

  if (!templateCode) {
    console.log(`[enso:enhance] no template found for ${toolName}`);
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
  console.log(`[enso:enhance] context registered: cardId=${cardId}, family=${selection.toolFamily}, signature=${signature?.signatureId ?? "none"}, prefix=${prefix ?? "none"}, hasNativeHint=${!!cardCtx.nativeToolHint}`);

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
  const { getClientsBySession, getClientsByPeerId, getAllClients } = await import("./server.js");

  let targets = getClientsBySession(ctx.to);
  if (targets.length === 0) {
    targets = getClientsByPeerId(ctx.to);
  }
  if (targets.length === 0) {
    targets = getAllClients();
  }

  const messageId = randomUUID();
  const text = rewriteExecFailure(stripThinkingBlocks(ctx.text ?? ""));
  console.log(`[enso:outbound] deliverToEnso called, to=${ctx.to}, textLen=${text.length}, targets=${targets.length}, mediaUrl=${ctx.mediaUrl ?? "none"}, keys=${Object.keys(ctx).join(",")}`);

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
  const { cardId, action, payload, mode, client, config, runtime, statusSink } = params;
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

  console.log(`[enso:action] received: cardId=${cardId}, action=${action}, payload=${JSON.stringify(payload)}`);
  sendOperation("processing", "Processing action");

  const ctx = cardContexts.get(cardId);
  if (!ctx) {
    console.log(`[enso:action] FAILED: card context not found for cardId=${cardId} (contexts: ${cardContexts.size} total)`);
    client.send({
      id: randomUUID(),
      runId: randomUUID(),
      sessionKey: client.sessionKey,
      seq: 0,
      state: "error",
      targetCardId: cardId,
      text: "Card context not found — the server may have restarted.",
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

  console.log(`[enso:action] context found: cardId=${cardId}, family=${ctx.toolFamily ?? "none"}, signature=${ctx.signatureId ?? "none"}, mode=${ctx.interactionMode}, hasNativeHint=${!!ctx.nativeToolHint}, prefix=${ctx.nativeToolHint?.handlerPrefix ?? "none"}`);

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

  // Record action in history
  ctx.actionHistory.push({ action, payload, timestamp: Date.now() });

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
        nativeToolHint: ctx.nativeToolHint,
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
    console.log(`[enso:action] path=mechanical: action=${action} mutated data`);
    sendOperation("generating_ui", "Generating UI");
    ctx.currentData = updatedData;

    // If the card has a native tool hint, include action hints for UI regen
    const mechanicalActionHints = ctx.nativeToolHint
      ? getActionDescriptions(ctx.nativeToolHint.toolName)
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
  if (ctx.nativeToolHint) {
    let toolCall: { toolName: string; params: Record<string, unknown> } | null = null;
    let resolvedVia = "";

    if (action === "refresh") {
      toolCall = {
        toolName: ctx.nativeToolHint.toolName,
        params: ctx.nativeToolHint.params,
      };
      resolvedVia = "refresh";
    } else {
      const actionParams = (payload ?? {}) as Record<string, unknown>;

      // 1. Exact match: prefix + action
      const candidateToolName = `${ctx.nativeToolHint.handlerPrefix}${action}`;
      if (isToolRegistered(candidateToolName)) {
        toolCall = { toolName: candidateToolName, params: actionParams };
        resolvedVia = "exact";
      } else {
        console.log(`[enso:action] path=native: exact match "${candidateToolName}" not registered`);
      }

      // 2. Suffix match
      if (!toolCall && ctx.toolFamily) {
        const capability = TOOL_FAMILY_CAPABILITIES.find((c) => c.toolFamily === ctx.toolFamily);
        if (capability) {
          const suffixRe = (s: string) => new RegExp(`(^|_)${s}(_|$)`);
          const matchedSuffix = capability.actionSuffixes.find(
            (s) => action === s || action.endsWith(`_${s}`) || action.startsWith(`${s}_`) || suffixRe(s).test(action),
          );
          if (matchedSuffix) {
            const suffixTool = `${ctx.nativeToolHint.handlerPrefix}${matchedSuffix}`;
            if (isToolRegistered(suffixTool)) {
              toolCall = { toolName: suffixTool, params: actionParams };
              resolvedVia = `suffix(${matchedSuffix})`;
            } else {
              console.log(`[enso:action] path=native: suffix match "${suffixTool}" not registered`);
            }
          }
          // 3. Family fallback tool
          if (!toolCall && isToolRegistered(capability.fallbackToolName)) {
            toolCall = {
              toolName: capability.fallbackToolName,
              params: { ...ctx.nativeToolHint.params, ...actionParams },
            };
            resolvedVia = "fallback";
          }
        }
      }
    }

    if (toolCall) {
      console.log(`[enso:action] path=native: resolved=${resolvedVia}, tool=${toolCall.toolName}, params=${JSON.stringify(toolCall.params)}`);
      sendOperation("calling_tool", `Calling ${toolCall.toolName}`);

      try {
        let result = await executeToolDirect(toolCall.toolName, toolCall.params);
        console.log(`[enso:action] path=native: execute result success=${result.success}, hasData=${result.data != null}, error=${result.error ?? "none"}`);

        // Retry with family fallback if tool fails
        if (!result.success && ctx.toolFamily) {
          const cap = TOOL_FAMILY_CAPABILITIES.find((c) => c.toolFamily === ctx.toolFamily);
          if (cap && toolCall.toolName !== cap.fallbackToolName && isToolRegistered(cap.fallbackToolName)) {
            console.log(`[enso:action] path=native: retrying with fallback ${cap.fallbackToolName}`);
            toolCall = {
              toolName: cap.fallbackToolName,
              params: { ...ctx.nativeToolHint.params, ...toolCall.params },
            };
            result = await executeToolDirect(toolCall.toolName, toolCall.params);
            console.log(`[enso:action] path=native: fallback result success=${result.success}, hasData=${result.data != null}`);
          }
        }

        if (result.success && result.data != null) {
          ctx.currentData = structuredClone(result.data);

          ctx.nativeToolHint = {
            toolName: toolCall.toolName,
            params: toolCall.params,
            handlerPrefix: ctx.nativeToolHint.handlerPrefix,
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

          console.log(`[enso:action] path=native: complete, delivering result mode=${effectiveMode}`);

          sendActionResult(followup.renderData, followup.generatedUI);
          return;
        }

        console.log(`[enso:action] path=native: tool failed (${result.error ?? "no data"}), falling through to agent`);
      } catch (err) {
        console.log(`[enso:action] path=native: exception ${String(err)}, falling through to agent`);
      }
    } else {
      console.log(`[enso:action] path=native: no tool resolved for action="${action}", falling through to agent`);
    }
  } else {
    console.log(`[enso:action] no nativeToolHint on card, skipping native path`);
  }

  // ── Path 3: Agent round-trip fallback ──
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

  console.log(`[enso:action] path=agent: cardId=${cardId} action=${action} mode=${effectiveMode}, msgLen=${actionMessage.length}`);
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

  const { handleEnsoInbound } = await import("./inbound.js");
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

/**
 * Scan agent response text for absolute local file paths that point to
 * supported media files. Returns validated paths (exist on disk, within
 * size limit) that can be converted to media URLs.
 */
function extractMediaPaths(text: string): string[] {
  // Match absolute Unix paths ending with a supported media extension.
  // Paths may appear bare, inside backticks, or inside quotes.
  const pattern = /(\/(?:[\w.@%+~-]+\/)*[\w.@%+~-]+\.(?:png|jpe?g|gif|webp|svg|bmp|mp4|webm|pdf))/gi;

  const paths: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const filePath = match[1];

    // Skip if this looks like part of a URL (e.g. https://example.com/image.png)
    const preContext = text.slice(Math.max(0, match.index - 10), match.index);
    if (/https?:\/\//.test(preContext)) continue;

    if (seen.has(filePath)) continue;
    seen.add(filePath);

    // Must actually exist on disk
    if (!existsSync(filePath)) continue;

    // Must be a regular file within the size limit
    try {
      const stat = statSync(filePath);
      if (!stat.isFile() || stat.size > MAX_MEDIA_FILE_SIZE) continue;
    } catch {
      continue;
    }

    paths.push(filePath);
  }

  return paths;
}

/**
 * Try to extract structured JSON data from agent response text.
 */
function extractStructuredData(text: string): unknown | null {
  const jsonBlockMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1]);
    } catch {
      // Not valid JSON
    }
  }

  const bareJsonMatch = text.match(/^(\{[\s\S]*\})$/m);
  if (bareJsonMatch) {
    try {
      const parsed = JSON.parse(bareJsonMatch[1]);
      if (typeof parsed === "object" && parsed !== null && Object.keys(parsed).length >= 2) {
        return parsed;
      }
    } catch {
      // Not valid JSON
    }
  }

  return null;
}
