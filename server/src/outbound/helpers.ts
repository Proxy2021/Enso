import { existsSync, statSync } from "fs";
import { join } from "path";
import type { CardContext } from "./card-context.js";
import type { CardModeDetail } from "../types.js";
import {
  inferToolTemplate,
  getRegisteredToolCatalog,
  getToolTemplate,
  getToolTemplateCode,
  getDataHintForSignature,
  normalizeDataForToolTemplate,
  registerToolTemplateCandidate,
  getPreferredToolProviderForFamily,
  type ToolTemplateCoverageStatus,
} from "../native-tools/registry.js";
import {
  serverGenerateConstrainedFollowupUI,
  serverGenerateUI,
} from "../ui-generator.js";
import { MAX_MEDIA_FILE_SIZE } from "../server.js";
import { logAction } from "../action-log.js";

// ── Text Processing Utilities ──

/**
 * Strip Gemini thinking/reasoning blocks from response text.
 * Gemini 2.5 Flash outputs thinking as regular text with bold headers
 * (e.g. "**Analyzing...**\n\nreasoning text\n\n\n") before the actual response.
 */
export function stripThinkingBlocks(text: string): string {
  // Match one or more thinking blocks at the start of the text:
  // **Bold Title**\n\n<reasoning content>\n\n\n
  const stripped = text.replace(
    /^(?:\*\*[^*]+\*\*\s*\n\n[\s\S]*?\n\n\n)+/,
    "",
  );
  return stripped.trim() || text;
}

export function compactPromptText(prompt: string): string {
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

export function summarizeCardDataForAgent(data: unknown): string {
  try {
    const json = JSON.stringify(data);
    if (!json) return "No card data";
    return json.length > 380 ? `${json.slice(0, 380)}...` : json;
  } catch {
    return "Unserializable card data";
  }
}

// ── Exec Failure Rewriting ──

export function rewriteExecCommandNotFound(text: string): string {
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

export function rewriteExecFailure(text: string): string {
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

// ── Template & Data Utilities ──

export function applyDetectedToolTemplate(ctx: CardContext, signature: ReturnType<typeof inferToolTemplate>): void {
  if (!signature) return;
  ctx.interactionMode = "tool";
  ctx.toolFamily = signature.toolFamily;
  ctx.signatureId = signature.signatureId;
  ctx.coverageStatus = signature.coverageStatus;
}

export function cardModeFromContext(ctx: CardContext | undefined): CardModeDetail | undefined {
  if (!ctx) return undefined;
  return {
    interactionMode: ctx.interactionMode,
    ...(ctx.toolFamily ? { toolFamily: ctx.toolFamily } : {}),
    ...(ctx.signatureId ? { signatureId: ctx.signatureId } : {}),
    ...(ctx.coverageStatus ? { coverageStatus: ctx.coverageStatus } : {}),
  };
}

export function inferDesktopLikePathFromPrompt(prompt: string): string | undefined {
  const lower = prompt.toLowerCase();
  if (lower.includes("desktop")) return "~/Desktop";
  if (lower.includes("download")) return "~/Downloads";
  if (lower.includes("document")) return "~/Documents";
  if (lower.includes("home folder") || lower.includes("home directory") || lower.includes("home")) return "~";
  return undefined;
}

export function hydrateFilesystemLikeData(data: unknown, prompt: string): unknown {
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

export function attachSyntheticNativeToolHint(ctx: CardContext, data: unknown, prompt: string): void {
  if (ctx.appToolHint || !ctx.toolFamily) return;
  const hydrated = (data && typeof data === "object") ? (data as Record<string, unknown>) : {};
  if (ctx.toolFamily === "filesystem") {
    const provider = getPreferredToolProviderForFamily("filesystem");
    if (!provider) return;
    const path =
      (typeof hydrated.path === "string" && hydrated.path.trim())
        ? hydrated.path
        : (inferDesktopLikePathFromPrompt(prompt) ?? ".");
    ctx.appToolHint = {
      toolName: provider.toolName,
      params: { path },
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
    ctx.appToolHint = {
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
    ctx.appToolHint = {
      toolName: provider.toolName,
      params: { diet },
      handlerPrefix: provider.handlerPrefix,
    };
  }
}

export function isToolConsoleCommand(text: string): boolean {
  return /^\/tool\s+enso\b/i.test(text.trim());
}

// ── Followup UI Rendering ──

export async function renderFollowupUI(params: {
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
      ?? inferToolTemplate({ toolName: ctx.appToolHint?.toolName, data });
    if (signature) {
      const templateCode = getToolTemplateCode(signature);
      if (templateCode) {
        // Check if the returned data shape matches what the primary template expects.
        // For generated apps, the template only renders the primary tool's data shape
        // (e.g., "movies" array). If an action tool returns a different shape (e.g.,
        // "movie_details" object), we must fall through to Gemini-based one-off generation.
        const dataRecord = (data && typeof data === "object" && !Array.isArray(data))
          ? data as Record<string, unknown> : {};
        const primaryHint = getDataHintForSignature(ctx.toolFamily, ctx.signatureId);
        const shapeMismatch = primaryHint
          && primaryHint.requiredKeys.length > 0
          && !primaryHint.requiredKeys.some((k) => k in dataRecord);

        if (!shapeMismatch) {
          return {
            generatedUI: templateCode,
            renderData: normalizeDataForToolTemplate(signature, data),
          };
        }
        logAction({ ts: Date.now(), type: "action", category: "action", message: `Data shape mismatch for ${ctx.toolFamily}/${ctx.signatureId}: expected keys [${primaryHint!.requiredKeys.join(",")}], got [${Object.keys(dataRecord).join(",")}] — generating one-off UI` });
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

// ── Media Path Extraction ──

/**
 * Scan agent response text for absolute local file paths that point to
 * supported media files. Returns validated paths (exist on disk, within
 * size limit) that can be converted to media URLs.
 */
export function extractMediaPaths(text: string): string[] {
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
