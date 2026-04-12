import { randomUUID } from "crypto";
import { getAlphaRankTemplateCode, isAlphaRankSignature } from "./templates/alpharank.js";
import { getFilesystemTemplateCode, isFilesystemSignature } from "./templates/filesystem.js";

import { getToolingTemplateCode, isToolingSignature } from "./templates/tooling.js";
import { getSystemAutoTemplateCode, isSystemAutoSignature } from "./templates/system.js";
import { getGeneralTemplateCode, isGeneralSignature } from "./templates/general.js";
import { getBrowserTemplateCode, isBrowserSignature } from "./templates/browser.js";
import { getResearcherTemplateCode, isResearcherSignature } from "./templates/researcher.js";
import { getClawHubTemplateCode, isClawHubSignature } from "./templates/clawhub.js";
// Wiki native template replaced by shipped Cortex app (server/apps/cortex/)
import { APP_CATALOG, getApp } from "../app-catalog.js";
import { logAction, logError } from "../action-log.js";

import { getLocalTool, isLocalTool, getAllLocalToolNames } from "../tool-registry-local.js";

// ── Types ──

/**
 * Result of executing a tool directly via the registry.
 */
export interface NativeToolResult {
  success: boolean;
  /** Parsed structured data on success, or null on failure */
  data: unknown;
  /** Raw text output from the tool (before parsing) */
  rawText?: string;
  /** Human-readable error on failure */
  error?: string;
}

export interface RegisteredToolCatalogEntry {
  pluginId: string;
  tools: string[];
}

export interface RegisteredToolDetail {
  pluginId: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ToolInteractionMode = "llm" | "tool";
export type ToolTemplateCoverageStatus = "covered" | "partial";

export interface ToolTemplate {
  toolFamily: string;
  signatureId: string;
  templateId: string;
  supportedActions: string[];
  coverageStatus: ToolTemplateCoverageStatus;
}

/**
 * Maps card UI actions to tool invocations for a family of tools
 * identified by a common name prefix (e.g., "alpharank_").
 *
 * To add a new native tool family:
 *   1. Create a new file under native-tools/
 *   2. Define action mappings via registerActionMap()
 *   3. Import the file for side-effects in index.ts
 *
 * Action descriptions for UI generation are auto-generated from registered
 * tool metadata (name, description, and parameter schemas). Override via
 * describeActions() only if you need custom formatting.
 */
export interface NativeToolActionMap {
  /** Human-readable name for logging ("AlphaRank") */
  name: string;

  /** Tool name prefix this handler covers ("alpharank_") */
  prefix: string;

  /**
   * Translate a card UI action into a tool invocation.
   *
   * Custom action mappings for renaming and parameter enrichment.
   * If this returns null, the action name is tried as a tool name
   * (prefix + action) for direct invocation via the registry.
   *
   * @param action    The action name from the UI (e.g., "rebalance", "refresh")
   * @param payload   The payload sent with the action from the card component
   * @param cardData  The current data rendered in the card
   * @returns         A tool name + params, or null if this action is not handled
   */
  mapAction(
    action: string,
    payload: unknown,
    cardData: unknown,
  ): { toolName: string; params: Record<string, unknown> } | null;

  /**
   * Override auto-generated action descriptions for UI generation.
   * By default, descriptions are auto-generated from registered tool
   * metadata. Only implement this if you need custom
   * action names or descriptions that differ from the tool definitions.
   */
  describeActions?(): string;
}

// ── Action Map Registry ──

const actionMaps = new Map<string, NativeToolActionMap>();
const signatureRegistry = new Map<string, ToolTemplate>();
const signatureTemplateCandidates = new Map<string, string[]>();
const runtimeDataHints: Array<{ toolFamily: string; signatureId: string; requiredKeys: string[] }> = [];
const dynamicPrefixSignatureMap = new Map<string, { toolFamily: string; signatureId: string }>();

// ── Generated Tool Storage (from Tool Factory) ──

/** In-memory store for dynamically generated tool executors. */
const generatedToolExecutors = new Map<string, {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  body?: string;
  execute: (callId: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>;
}>();

/** In-memory store for dynamically generated template JSX code, keyed by signatureId. */
const generatedTemplateCode = new Map<string, string>();

export function registerAppTool(tool: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  body?: string;
  execute: (callId: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>;
}): void {
  generatedToolExecutors.set(tool.name, tool);
  logAction({ ts: Date.now(), type: "action", category: "native-tools", message: `registered app tool "${tool.name}"` });
}

// ── Auto-heal helpers ──

/** Check whether a tool name belongs to a dynamically generated (non-built-in) executor. */
export function isDynamicTool(toolName: string): boolean {
  return generatedToolExecutors.has(toolName);
}

/** Retrieve the raw JavaScript function body for a dynamic tool (for auto-heal diagnosis). */
export function getExecutorBody(toolName: string): string | undefined {
  return generatedToolExecutors.get(toolName)?.body;
}

/** Hot-swap a dynamic tool's executor with a fixed body. Does NOT persist to disk. */
export function hotSwapExecutor(
  toolName: string,
  newBody: string,
  toolFamily: string,
  apiKey?: string,
): void {
  const existing = generatedToolExecutors.get(toolName);
  if (!existing) return;

  const AsyncFn = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (
    callId: string,
    params: Record<string, unknown>,
    ctx: unknown,
  ) => Promise<{ content: Array<{ type: string; text?: string }> }>;
  const executeFn = new AsyncFn("callId", "params", "ctx", newBody);

  generatedToolExecutors.set(toolName, {
    ...existing,
    body: newBody,
    execute: async (callId: string, toolParams: Record<string, unknown>) => {
      const { buildExecutorContext } = await import("../app-persistence.js");
      const suffix = toolName.slice(toolName.lastIndexOf("_") + 1);
      let key = apiKey;
      if (!key) {
        const { getActiveAccount } = await import("../server.js");
        key = getActiveAccount()?.geminiApiKey;
      }
      const ctx = buildExecutorContext(toolFamily, suffix, key);
      return executeFn(callId, toolParams, ctx);
    },
  });

  logAction({ ts: Date.now(), type: "action", category: "native-tools", message: `hot-swapped executor for "${toolName}" (${newBody.length} chars)` });
}

export function registerAppTemplate(signatureId: string, code: string): void {
  generatedTemplateCode.set(signatureId, code);
  logAction({ ts: Date.now(), type: "action", category: "native-tools", message: `registered generated template code for signature "${signatureId}"` });
}

/** Return all dynamically registered app tools (for standalone agent discovery). */
export function getAllDynamicTools(): Array<{
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (callId: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>;
}> {
  return Array.from(generatedToolExecutors.values());
}

/** Remove a generated tool executor by name. Returns true if it existed. */
export function unregisterAppTool(toolName: string): boolean {
  const existed = generatedToolExecutors.delete(toolName);
  if (existed) logAction({ ts: Date.now(), type: "action", category: "native-tools", message: `unregistered generated tool "${toolName}"` });
  return existed;
}

/** Retrieve generated template code by signatureId. Returns undefined if not found. */
export function getGeneratedTemplateCodeBySignature(signatureId: string): string | undefined {
  return generatedTemplateCode.get(signatureId);
}

/** Remove generated template code by signatureId. Returns true if it existed. */
export function unregisterAppTemplate(signatureId: string): boolean {
  const existed = generatedTemplateCode.delete(signatureId);
  if (existed) logAction({ ts: Date.now(), type: "action", category: "native-tools", message: `unregistered generated template code for signature "${signatureId}"` });
  return existed;
}

/** Remove a tool template (signature) from the registry. Returns true if it existed. */
export function unregisterToolTemplate(toolFamily: string, sigId: string): boolean {
  const key = signatureKey(toolFamily, sigId);
  const existed = signatureRegistry.delete(key);
  if (existed) logAction({ ts: Date.now(), type: "action", category: "native-tools", message: `unregistered tool template "${key}"` });
  return existed;
}

/** Remove runtime data hints for a given toolFamily. */
export function unregisterToolTemplateDataHints(toolFamily: string): void {
  for (let i = runtimeDataHints.length - 1; i >= 0; i--) {
    if (runtimeDataHints[i].toolFamily === toolFamily) {
      runtimeDataHints.splice(i, 1);
    }
  }
}

function signatureKey(toolFamily: string, signatureId: string): string {
  return `${toolFamily}:${signatureId}`;
}

/**
 * Register an action map for a tool family. Called at module-load time
 * by each tool mapping module (e.g., alpharank.ts).
 */
export function registerActionMap(map: NativeToolActionMap): void {
  actionMaps.set(map.prefix, map);
  logAction({ ts: Date.now(), type: "action", category: "native-tools", message: `registered action map "${map.name}" (prefix: ${map.prefix})` });
}

export function registerToolTemplate(signature: ToolTemplate): void {
  signatureRegistry.set(signatureKey(signature.toolFamily, signature.signatureId), signature);
}

/**
 * Register a tool prefix → family/signature mapping so that
 * detectToolTemplateForToolName can match dynamic app tools
 * (e.g. enso_media_gallery_browse → media_gallery/media_gallery_view)
 * before the shorter built-in prefixes (e.g. enso_media_ → multimedia).
 */
export function registerDynamicAppPrefix(prefix: string, toolFamily: string, signatureId: string): void {
  dynamicPrefixSignatureMap.set(prefix.toLowerCase(), { toolFamily, signatureId });
}

export function registerToolTemplateDataHint(input: {
  toolFamily: string;
  signatureId: string;
  requiredKeys: string[];
}): void {
  const requiredKeys = input.requiredKeys
    .map((k) => k.trim())
    .filter(Boolean);
  if (requiredKeys.length === 0) return;
  const exists = runtimeDataHints.some((hint) =>
    hint.toolFamily === input.toolFamily
    && hint.signatureId === input.signatureId
    && hint.requiredKeys.length === requiredKeys.length
    && hint.requiredKeys.every((k, idx) => k === requiredKeys[idx]));
  if (exists) return;
  runtimeDataHints.push({
    toolFamily: input.toolFamily,
    signatureId: input.signatureId,
    requiredKeys,
  });
}

/**
 * Look up a data hint for a given tool family + signature.
 * Returns the required data keys the primary template expects, or undefined if no hint exists.
 * Used by renderFollowupUI to detect data shape mismatches for generated app templates.
 */
export function getDataHintForSignature(
  toolFamily: string,
  signatureId: string,
): { requiredKeys: string[] } | undefined {
  return runtimeDataHints.find(
    (h) => h.toolFamily === toolFamily && h.signatureId === signatureId,
  );
}

function registerDefaultSignatures(): void {
  const defaults: ToolTemplate[] = [
    {
      toolFamily: "alpharank",
      signatureId: "ranked_predictions_table",
      templateId: "market-top-picks-v1",
      supportedActions: ["refresh", "predictions", "market_regime", "daily_routine", "status"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "alpharank",
      signatureId: "market_regime_snapshot",
      templateId: "market-regime-v1",
      supportedActions: ["refresh", "predictions", "daily_routine"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "alpharank",
      signatureId: "routine_execution_report",
      templateId: "routine-report-v1",
      supportedActions: ["refresh", "predictions", "market_regime", "daily_routine"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "alpharank",
      signatureId: "ticker_detail",
      templateId: "ticker-detail-v1",
      supportedActions: ["refresh", "predictions", "market_regime"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "plugin_discovery",
      signatureId: "plugin_catalog_list",
      templateId: "plugin-catalog-v1",
      supportedActions: ["refresh", "search_plugins", "list_all_plugins", "get_plugin_details", "install_plugin"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "filesystem",
      signatureId: "directory_listing",
      templateId: "filesystem-browser-v2",
      supportedActions: ["refresh", "list_drives", "list_directory", "read_text_file", "open_file", "open_external", "stat_path", "search_paths", "create_directory", "rename_path", "delete_path", "move_path", "write_file", "copy_path", "search_content"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "researcher",
      signatureId: "research_board",
      templateId: "researcher-v1",
      supportedActions: ["refresh", "search", "deep_dive", "compare", "follow_up", "send_report"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "web_browser",
      signatureId: "remote_browser",
      templateId: "remote-browser-v1",
      supportedActions: ["refresh", "open", "navigate", "click", "scroll", "back", "type", "extract", "key", "evaluate", "wait"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "clawhub",
      signatureId: "clawhub_store",
      templateId: "clawhub-store-v1",
      supportedActions: ["browse", "search", "inspect", "installed", "install", "uninstall"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "enso_tooling",
      signatureId: "tool_console",
      templateId: "tool-console-v1",
      supportedActions: ["refresh", "view_tool_family", "tooling_back", "tooling_add_tool"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "general",
      signatureId: "smart_text_card",
      templateId: "smart-text-card-v1",
      supportedActions: ["send_message"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "data_table_explorer",
      signatureId: "table_rows_columns",
      templateId: "table-explorer-v1",
      supportedActions: ["refresh", "filter", "sort_by", "view_details"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "tool_inspector",
      signatureId: "tool_run_summary",
      templateId: "tool-inspector-v1",
      supportedActions: ["refresh", "retry", "show_logs", "show_details"],
      coverageStatus: "covered",
    },
  ];
  for (const signature of defaults) {
    registerToolTemplate(signature);
  }
}

/**
 * Find the action map for a given full tool name by prefix match.
 * Returns undefined if no action map covers this tool.
 */
export function findActionMap(toolName: string): NativeToolActionMap | undefined {
  for (const [prefix, map] of actionMaps) {
    if (toolName.startsWith(prefix)) {
      return map;
    }
  }
  return undefined;
}

/**
 * Get an action map by its exact prefix key.
 */
export function getActionMap(prefix: string): NativeToolActionMap | undefined {
  return actionMaps.get(prefix);
}

/**
 * Get a prompt-friendly description of available actions for a tool.
 * Used by the UI generator to tell Gemini what buttons to create.
 *
 * Priority:
 *   1. Manual describeActions() on a registered action map (if defined)
 *   2. Auto-generated from registered tool metadata
 */
export function getActionDescriptions(toolName: string): string | undefined {
  // 1. Check for manual override via action map
  const map = findActionMap(toolName);
  if (map?.describeActions) {
    return map.describeActions();
  }

  // 2. Auto-generate from registered tool metadata
  // Use the action map's prefix if available, otherwise auto-detect from tool name
  const prefix = map?.prefix ?? detectPrefixForTool(toolName);
  if (prefix) {
    return generateActionDescriptionsFromRegistry(prefix);
  }

  return undefined;
}

export function getToolTemplate(toolFamily: string, signatureId: string): ToolTemplate | undefined {
  return signatureRegistry.get(signatureKey(toolFamily, signatureId));
}

export function getAllToolTemplates(): ToolTemplate[] {
  return Array.from(signatureRegistry.values());
}

export function isToolActionCovered(signature: ToolTemplate, action: string): boolean {
  return signature.supportedActions.includes(action) || action === "refresh";
}

export function detectToolTemplateForToolName(toolName: string): ToolTemplate | undefined {
  ensureDynamicSystemTemplatesFromRegistry();
  const lower = toolName.toLowerCase();

  // Dynamic app prefixes first — they are always more specific (longer) than
  // built-in prefixes (e.g. "enso_media_gallery_" vs "enso_media_"), so
  // dynamic apps should take priority over the built-in template families.
  const matchedDynamicPrefix = Array.from(dynamicPrefixSignatureMap.keys())
    .filter((prefix) => lower.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];
  if (matchedDynamicPrefix) {
    const mapped = dynamicPrefixSignatureMap.get(matchedDynamicPrefix);
    if (mapped) return getToolTemplate(mapped.toolFamily, mapped.signatureId);
  }

  // Built-in prefix handlers — distinguish sub-signatures within
  // the same family (e.g. alpharank regime vs predictions).
  if (lower.startsWith("alpharank_")) {
    if (lower.includes("market_regime") || lower.includes("regime")) {
      return getToolTemplate("alpharank", "market_regime_snapshot");
    }
    if (lower.includes("daily_routine") || lower.includes("daily") || lower.includes("routine")) {
      return getToolTemplate("alpharank", "routine_execution_report");
    }
    return getToolTemplate("alpharank", "ranked_predictions_table");
  }
  if (lower.startsWith("enso_fs_")) {
    return getToolTemplate("filesystem", "directory_listing");
  }
  if (lower.startsWith("enso_researcher_")) {
    return getToolTemplate("researcher", "research_board");
  }
  if (lower.startsWith("enso_clawhub_")) {
    return getToolTemplate("clawhub", "clawhub_store");
  }
  if (lower.includes("plugin") || lower.includes("clawhub")) {
    return getToolTemplate("plugin_discovery", "plugin_catalog_list");
  }

  // App action detection — catch-all for non-Enso providers
  // that expose equivalent operations under a different prefix.
  for (const app of APP_CATALOG) {
    const match = app.actions.some((suffix) => lower.endsWith(`_${suffix}`));
    if (match) {
      return getToolTemplate(app.appId, app.signatureId);
    }
  }

  return undefined;
}

export function detectToolTemplateFromData(data: unknown): ToolTemplate | undefined {
  ensureDynamicSystemTemplatesFromRegistry();
  if (Array.isArray(data)) {
    if (data.every((x) => x && typeof x === "object" && "name" in (x as Record<string, unknown>))) {
      return getToolTemplate("filesystem", "directory_listing");
    }
    return undefined;
  }
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  if (
    Array.isArray(record.files)
    && record.files.every((x) => x && typeof x === "object" && "name" in (x as Record<string, unknown>))
  ) {
    return getToolTemplate("filesystem", "directory_listing");
  }
  if (Array.isArray(record.items) && record.items.every((x) => x && typeof x === "object" && "name" in (x as Record<string, unknown>))) {
    return getToolTemplate("filesystem", "directory_listing");
  }
  if (Array.isArray(record.drives)) {
    return getToolTemplate("filesystem", "directory_listing");
  }
  if (Array.isArray(record.plugins) || "totalPlugins" in record) {
    return getToolTemplate("plugin_discovery", "plugin_catalog_list");
  }
  if ("single_ticker_data" in record) {
    return getToolTemplate("alpharank", "ticker_detail");
  }
  if (Array.isArray(record.top_picks) || Array.isArray(record.picks) || Array.isArray(record.predictions)) {
    if ("ticker" in record && !Array.isArray(record.top_picks)) {
      return getToolTemplate("alpharank", "ticker_detail");
    }
    return getToolTemplate("alpharank", "ranked_predictions_table");
  }
  if ("regime" in record || "regimeConfidence" in record) {
    return getToolTemplate("alpharank", "market_regime_snapshot");
  }
  if (Array.isArray(record.steps) && ("status" in record || "routine" in record)) {
    return getToolTemplate("alpharank", "routine_execution_report");
  }
  if (Array.isArray(record.rows) && Array.isArray(record.columns)) {
    return getToolTemplate("data_table_explorer", "table_rows_columns");
  }
  if (Array.isArray(record.steps) && ("logs" in record || "failure" in record)) {
    return getToolTemplate("tool_inspector", "tool_run_summary");
  }
  if ((typeof record.tool === "string" && (record.tool as string).startsWith("enso_researcher_")) || (Array.isArray(record.keyFindings) && Array.isArray(record.sections) && "topic" in record)) {
    return getToolTemplate("researcher", "research_board");
  }
  if ((typeof record.tool === "string" && (record.tool as string).startsWith("enso_clawhub_")) || ("installedSlugs" in record && Array.isArray(record.skills))) {
    return getToolTemplate("clawhub", "clawhub_store");
  }
  if ((typeof record.tool === "string" && (record.tool as string).startsWith("enso_browser_")) || ("screenshotUrl" in record && "viewportWidth" in record)) {
    return getToolTemplate("web_browser", "remote_browser");
  }
  for (const hint of runtimeDataHints) {
    if (hint.requiredKeys.every((k) => k in record)) {
      const signature = getToolTemplate(hint.toolFamily, hint.signatureId);
      if (signature) return signature;
    }
  }
  return undefined;
}

export function inferToolTemplate(input: { toolName?: string; data?: unknown }): ToolTemplate | undefined {
  const fromTool = input.toolName ? detectToolTemplateForToolName(input.toolName) : undefined;
  // When the tool name maps to a family's default template but the data shape
  // suggests a more specific template, prefer the data-driven detection.
  if (fromTool && input.data) {
    const fromData = detectToolTemplateFromData(input.data);
    if (fromData && fromData.toolFamily === fromTool.toolFamily && fromData.signatureId !== fromTool.signatureId) {
      return fromData;
    }
  }
  if (fromTool) return fromTool;
  return detectToolTemplateFromData(input.data);
}

export function registerToolTemplateCandidate(signature: ToolTemplate, componentCode: string): void {
  const key = signatureKey(signature.toolFamily, signature.signatureId);
  const candidates = signatureTemplateCandidates.get(key) ?? [];
  if (candidates.length >= 5) return;
  candidates.push(componentCode);
  signatureTemplateCandidates.set(key, candidates);
}

function signatureTitle(signature: ToolTemplate): string {
  return `${signature.toolFamily.replace(/_/g, " ")} · ${signature.signatureId.replace(/_/g, " ")}`;
}

export function getToolTemplateCode(signature: ToolTemplate): string {
  // Evolved / dynamically generated templates take precedence over built-in
  const generatedCode = generatedTemplateCode.get(signature.signatureId);
  if (generatedCode) return generatedCode;

  if (isAlphaRankSignature(signature.signatureId)) {
    return getAlphaRankTemplateCode(signature);
  }
  if (isFilesystemSignature(signature.signatureId)) {
    return getFilesystemTemplateCode(signature);
  }
  if (isBrowserSignature(signature.signatureId)) {
    return getBrowserTemplateCode(signature);
  }
  if (isResearcherSignature(signature.signatureId)) {
    return getResearcherTemplateCode(signature);
  }
  // Wiki template now handled by shipped Cortex app
  if (isClawHubSignature(signature.signatureId)) {
    return getClawHubTemplateCode(signature);
  }
  if (isToolingSignature(signature.signatureId)) {
    return getToolingTemplateCode(signature);
  }
  if (isGeneralSignature(signature.signatureId)) {
    return getGeneralTemplateCode(signature);
  }
  if (isSystemAutoSignature(signature.signatureId)) {
    return getSystemAutoTemplateCode(signature);
  }

  return `export default function GeneratedUI({ data, onAction }) {
  const rows = Array.isArray(data?.rows)
    ? data.rows
    : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.plugins)
        ? data.plugins
        : Array.isArray(data?.picks)
          ? data.picks
          : Array.isArray(data?.predictions)
            ? data.predictions
            : [];
  const labels = rows.slice(0, 6).map((row, idx) => {
    if (row && typeof row === "object") {
      const r = row;
      return String(r.name ?? r.ticker ?? r.pluginId ?? r.title ?? r.id ?? ("Item " + (idx + 1)));
    }
    return "Item " + (idx + 1);
  });
  return (
    <div className="bg-gray-900 rounded-xl p-3 border border-gray-700 space-y-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">Tool mode</div>
          <div className="text-sm font-semibold text-gray-100">${signatureTitle(signature)}</div>
        </div>
        <button
          onClick={() => onAction("refresh", {})}
          className="px-2.5 py-1 text-xs rounded-full bg-gray-700 border border-gray-600 hover:bg-gray-600 cursor-pointer transition-all duration-150 active:scale-[0.98]"
        >
          Refresh
        </button>
      </div>
      {rows.length > 0 ? (
        <div className="space-y-1.5">
          {labels.map((label, idx) => (
            <div key={idx} className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-1.5 text-xs text-gray-300">
              {label}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-md border border-gray-600/50 px-2.5 py-2 text-xs text-gray-400">
          No rows available for this signature yet.
        </div>
      )}
      <div className="text-[11px] text-gray-500">This card uses a deterministic tool template for follow-up actions.</div>
    </div>
  );
}`;
}

export function normalizeDataForToolTemplate(signature: ToolTemplate, data: unknown): Record<string, unknown> {
  const source = (data && typeof data === "object" && !Array.isArray(data)) ? (data as Record<string, unknown>) : {};
  switch (signature.signatureId) {
    case "plugin_catalog_list": {
      const plugins = Array.isArray(source.plugins) ? source.plugins : [];
      return {
        ...source,
        title: source.title ?? "Loaded plugins",
        totalPlugins: source.totalPlugins ?? plugins.length,
        rows: plugins,
      };
    }
    case "ranked_predictions_table": {
      const picks = Array.isArray(source.top_picks)
        ? source.top_picks
        : Array.isArray(source.picks)
          ? source.picks
          : Array.isArray(source.predictions)
            ? source.predictions
            : Array.isArray(source.rows) && (source.rows as unknown[]).length > 0
              ? source.rows
              : [];
      return {
        ...source,
        title: source.title ?? "Ranked predictions",
        rows: picks,
        totalStocksScanned: source.totalStocksScanned ?? source.total_stocks ?? source.total ?? (picks as unknown[]).length,
      };
    }
    case "market_regime_snapshot": {
      // regime may arrive as an object (e.g. { state: "...", label: "..." }) — extract a string
      const rawRegime = source.regime ?? source.state ?? source.market_regime ?? "Unknown";
      const regimeStr = (typeof rawRegime === "object" && rawRegime !== null)
        ? (rawRegime as Record<string, unknown>).label ?? (rawRegime as Record<string, unknown>).state ?? (rawRegime as Record<string, unknown>).name ?? JSON.stringify(rawRegime)
        : rawRegime;
      return {
        ...source,
        regime: regimeStr,
        confidence: source.confidence ?? source.regimeConfidence ?? source.regime_confidence ?? 0,
        guidance: Array.isArray(source.guidance) ? source.guidance : [],
      };
    }
    case "routine_execution_report": {
      return {
        ...source,
        steps: Array.isArray(source.steps) ? source.steps : [],
        status: source.status ?? "completed",
      };
    }
    case "ticker_detail": {
      const single = (source.single_ticker_data && typeof source.single_ticker_data === "object")
        ? source.single_ticker_data as Record<string, unknown>
        : {};
      const s = { ...source, ...single };
      const factors: Array<{ name: string; value: number }> = [];
      if (Array.isArray(s.factors) && s.factors.length > 0) {
        factors.push(...(s.factors as Array<{ name: string; value: number }>));
      } else {
        if (s.rf_score != null) factors.push({ name: "RF Score", value: Number(s.rf_score) });
        if (s.lgb_score != null) factors.push({ name: "LGB Score", value: Number(s.lgb_score) });
        if (s.ranker_score != null) factors.push({ name: "Ranker Score", value: Number(s.ranker_score) });
      }
      return {
        ...s,
        ticker: s.ticker ?? s.symbol ?? "Ticker",
        score: s.ranker_score ?? s.score ?? s.rankerScore ?? 0,
        rank: s.rank ?? s.composite_rank ?? null,
        compositeRank: s.composite_rank ?? s.compositeRank ?? null,
        predictionDate: s.prediction_date ?? s.date ?? null,
        rfRank: s.rf_rank ?? null,
        lgbRank: s.lgb_rank ?? null,
        rankerRank: s.ranker_rank ?? null,
        factors,
      };
    }
    case "smart_text_card": {
      return { ...source };
    }
    case "directory_listing": {
      const rowsFromArray = Array.isArray(data) ? data : [];
      const items = Array.isArray(source.items) ? source.items : [];
      const files = Array.isArray(source.files) ? source.files : [];
      const matches = Array.isArray(source.matches) ? source.matches : [];
      return {
        ...source,
        title: source.title ?? "Directory listing",
        rows: items.length > 0 ? items : files.length > 0 ? files : matches.length > 0 ? matches : rowsFromArray,
      };
    }
    case "table_rows_columns": {
      const rows = Array.isArray(source.rows) ? source.rows : [];
      return {
        ...source,
        title: source.title ?? "Table explorer",
        rows,
        columns: Array.isArray(source.columns) ? source.columns : [],
      };
    }
    case "media_gallery": {
      const items = Array.isArray(source.items) ? source.items : [];
      const groups = Array.isArray(source.groups)
        ? source.groups
        : Array.isArray(source.mediaTypes)
          ? source.mediaTypes
          : [];
      const directories = Array.isArray(source.directories) ? source.directories : [];
      const results = Array.isArray(source.results) ? source.results : [];
      const collections = Array.isArray(source.collections) ? source.collections : [];
      const drives = Array.isArray(source.drives) ? source.drives : [];
      const quickAccess = Array.isArray(source.quickAccess) ? source.quickAccess : [];
      const bookmarks = Array.isArray(source.bookmarks) ? source.bookmarks : [];
      return {
        ...source,
        title: source.title ?? "Photo Gallery",
        rows: items,
        items,
        groups,
        directories,
        results,
        collections,
        drives,
        quickAccess,
        bookmarks,
      };
    }
    default: {
      if (isSystemAutoSignature(signature.signatureId)) {
        if (Array.isArray(data)) {
          return {
            title: source.title ?? "System tool results",
            rows: data,
          };
        }
        const rows = Array.isArray(source.rows)
          ? source.rows
          : Array.isArray(source.items)
            ? source.items
            : Array.isArray(source.results)
              ? source.results
              : Array.isArray(source.records)
                ? source.records
                : [];
        return {
          ...source,
          title: source.title ?? "System tool results",
          rows,
        };
      }
      return { ...source };
    }
  }
}


function extractToolPrefix(toolName: string): string | undefined {
  const idx = toolName.lastIndexOf("_");
  if (idx <= 0) return undefined;
  return `${toolName.slice(0, idx + 1)}`;
}

function sanitizeForId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "tool_family";
}

function supportedActionsForPrefix(prefix: string): string[] {
  const toolNames = getAllRegisteredToolNames();
  const actions = new Set<string>();
  for (const name of toolNames) {
    const lower = name.toLowerCase();
    if (!lower.startsWith(prefix)) continue;
    const action = lower.slice(prefix.length);
    if (action) actions.add(action);
  }
  return Array.from(actions).sort();
}

function registerDynamicSystemTemplate(input: { prefix: string; pluginId?: string }): void {
  const knownPrefixes = [
    "alpharank_",
    "enso_",
    "enso_fs_",
    "enso_browser_",
    "enso_researcher_",
    "enso_clawhub_",
  ];
  if (knownPrefixes.includes(input.prefix)) return;
  if (dynamicPrefixSignatureMap.has(input.prefix)) return;

  const actions = supportedActionsForPrefix(input.prefix);
  if (actions.length === 0) return;
  const familyBase = input.pluginId ? sanitizeForId(input.pluginId) : sanitizeForId(input.prefix.replace(/_+$/, ""));
  const signatureBase = sanitizeForId(input.prefix.replace(/_+$/, ""));
  const toolFamily = `system_${familyBase}`;
  const signatureId = `system_auto_${signatureBase}`;
  registerToolTemplate({
    toolFamily,
    signatureId,
    templateId: `system-auto-${signatureBase}-v1`,
    supportedActions: actions,
    coverageStatus: "covered",
  });
  dynamicPrefixSignatureMap.set(input.prefix, { toolFamily, signatureId });
}

function ensureDynamicSystemTemplatesFromRegistry(): void {
  // No-op: dynamic system templates are registered directly via
  // registerDynamicSystemTemplate() at startup.
}

function getAllRegisteredToolNames(): string[] {
  const names = new Set<string>();
  // Include tools from the local registry
  for (const name of getAllLocalToolNames()) names.add(name);
  // Include dynamically generated tools
  for (const name of generatedToolExecutors.keys()) names.add(name);
  return Array.from(names);
}

/**
 * Detect if another provider already supports a family by matching action suffixes.
 * Returns the best provider prefix and a representative tool name.
 */
export function findExistingProviderForActionSuffixes(input: {
  excludePrefix: string;
  actionSuffixes: string[];
  minMatches?: number;
}): { prefix: string; sampleToolName: string } | undefined {
  const tools = getAllRegisteredToolNames();
  if (tools.length === 0) return undefined;
  const suffixes = new Set(input.actionSuffixes.map((s) => s.toLowerCase()));
  const minMatches = input.minMatches ?? 2;

  const byPrefix = new Map<string, { tools: string[]; matchedSuffixes: Set<string> }>();
  for (const name of tools) {
    const lower = name.toLowerCase();
    const prefix = extractToolPrefix(lower);
    if (!prefix || prefix === input.excludePrefix.toLowerCase()) continue;
    const suffix = lower.slice(prefix.length);
    if (!suffixes.has(suffix)) continue;
    const bucket = byPrefix.get(prefix) ?? { tools: [], matchedSuffixes: new Set<string>() };
    bucket.tools.push(name);
    bucket.matchedSuffixes.add(suffix);
    byPrefix.set(prefix, bucket);
  }

  const ranked = Array.from(byPrefix.entries())
    .map(([prefix, meta]) => ({
      prefix,
      score: meta.matchedSuffixes.size,
      sampleToolName: meta.tools[0],
    }))
    .filter((x) => x.score >= minMatches)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return undefined;
  return {
    prefix: ranked[0].prefix,
    sampleToolName: ranked[0].sampleToolName,
  };
}

export function getPreferredToolProviderForFamily(toolFamily: string): {
  toolName: string;
  handlerPrefix: string;
} | undefined {
  const app = getApp(toolFamily);
  if (!app) return undefined;

  const fallbackPrefix = extractToolPrefix(app.primaryTool);
  if (!fallbackPrefix) return undefined;

  const existing = findExistingProviderForActionSuffixes({
    excludePrefix: fallbackPrefix,
    actionSuffixes: app.actions,
    minMatches: Math.min(2, app.actions.length),
  });
  if (existing) {
    return {
      toolName: existing.sampleToolName,
      handlerPrefix: existing.prefix,
    };
  }
  if (isToolRegistered(app.primaryTool)) {
    return {
      toolName: app.primaryTool,
      handlerPrefix: fallbackPrefix,
    };
  }
  return undefined;
}

/**
 * Detect the tool prefix for a given tool name by extracting everything
 * up to and including the last underscore.
 */
function detectPrefixForTool(toolName: string): string | undefined {
  return extractToolPrefix(toolName);
}

// ── Tool Registry Access ──

/**
 * Return the tool catalog grouped by prefix (family).
 * Combines dynamically generated tools and locally registered tools.
 */
export function getRegisteredToolCatalog(): RegisteredToolCatalogEntry[] {
  const byPrefix = new Map<string, Set<string>>();

  // Collect from generated tool executors
  for (const name of generatedToolExecutors.keys()) {
    const prefix = extractToolPrefix(name) ?? "enso_";
    const familyId = prefix.replace(/_$/, "");
    const bucket = byPrefix.get(familyId) ?? new Set<string>();
    bucket.add(name);
    byPrefix.set(familyId, bucket);
  }

  // Collect from local tool registry
  for (const name of getAllLocalToolNames()) {
    const prefix = extractToolPrefix(name) ?? "enso_";
    const familyId = prefix.replace(/_$/, "");
    const bucket = byPrefix.get(familyId) ?? new Set<string>();
    bucket.add(name);
    byPrefix.set(familyId, bucket);
  }

  return Array.from(byPrefix.entries())
    .map(([pluginId, tools]) => ({
      pluginId,
      tools: Array.from(tools).sort(),
    }))
    .sort((a, b) => a.pluginId.localeCompare(b.pluginId));
}

export function getRegisteredToolsDetailed(): RegisteredToolDetail[] {
  const details: RegisteredToolDetail[] = [];
  const seen = new Set<string>();

  // Collect from generated tool executors
  for (const tool of generatedToolExecutors.values()) {
    if (seen.has(tool.name)) continue;
    seen.add(tool.name);
    const prefix = extractToolPrefix(tool.name) ?? "enso_";
    details.push({
      pluginId: prefix.replace(/_$/, ""),
      name: tool.name,
      description: tool.description ?? "",
      parameters: (tool.parameters ?? {}) as Record<string, unknown>,
    });
  }

  // Collect from local tool registry
  for (const name of getAllLocalToolNames()) {
    if (seen.has(name)) continue;
    seen.add(name);
    const local = getLocalTool(name);
    if (!local) continue;
    const prefix = extractToolPrefix(name) ?? "enso_";
    details.push({
      pluginId: prefix.replace(/_$/, ""),
      name: local.name,
      description: (local as { description?: string }).description ?? "",
      parameters: ((local as { parameters?: unknown }).parameters ?? {}) as Record<string, unknown>,
    });
  }

  return details.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a tool by name from the local registries.
 */
function resolveToolByName(toolName: string): { name: string; execute: (callId: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }> } | null {
  // 1. Check dynamically generated tool executors (from Tool Factory / Build App)
  const generated = generatedToolExecutors.get(toolName);
  if (generated && typeof generated.execute === "function") {
    return generated as ReturnType<typeof resolveToolByName>;
  }

  // 2. Check the local tool registry (system tools registered at startup)
  const localTool = getLocalTool(toolName);
  if (localTool && typeof localTool.execute === "function") {
    return localTool as ReturnType<typeof resolveToolByName>;
  }

  return null;
}

/**
 * Check if a tool exists in the local registries without resolving it.
 * Used to validate action names that might correspond to tool names.
 */
export function isToolRegistered(toolName: string): boolean {
  if (generatedToolExecutors.has(toolName)) return true;
  if (isLocalTool(toolName)) return true;
  return false;
}

/**
 * Derive the family/plugin ID for a given tool name by extracting its prefix.
 * Returns "enso" as the family for all known tools, or the prefix-derived family.
 */
export function getToolPluginId(toolName: string): string | undefined {
  if (!generatedToolExecutors.has(toolName) && !isLocalTool(toolName)) return undefined;
  const prefix = extractToolPrefix(toolName);
  return prefix ? prefix.replace(/_$/, "") : "enso";
}

/**
 * Return the tool name prefix for a given family/plugin ID.
 * Simply appends "_" to the pluginId.
 */
export function getPluginToolPrefix(pluginId: string): string {
  return `${pluginId}_`;
}

/**
 * Execute a registered tool directly, bypassing the agent loop.
 * This calls the tool's execute() method — no LLM, no hooks.
 */
export async function executeToolDirect(
  toolName: string,
  params: Record<string, unknown>,
): Promise<NativeToolResult> {
  const tool = resolveToolByName(toolName);
  if (!tool) {
    return { success: false, data: null, error: `Tool "${toolName}" not found in registry` };
  }

  try {
    const callId = randomUUID();
    const result = await tool.execute(callId, params);

    // Extract text content from AgentToolResult
    const textParts: string[] = [];
    if (result?.content) {
      for (const block of result.content) {
        if (block.type === "text" && block.text) {
          textParts.push(block.text);
        }
      }
    }

    const rawText = textParts.join("\n");

    // Check for error indicators in the output
    if (rawText.startsWith("[ERROR]")) {
      return { success: false, data: null, rawText, error: rawText };
    }

    // Try to parse as JSON for structured data
    const data = parseToolOutput(rawText);

    return { success: true, data, rawText };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, data: null, error: msg };
  }
}

// ── Auto-Generated Action Descriptions ──

/**
 * Resolved tool metadata from local registries.
 */
interface ResolvedToolMeta {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

/**
 * Resolve all tools matching a prefix from local registries.
 * Returns their name, description, and parameter schemas.
 */
function resolveToolsByPrefix(prefix: string): ResolvedToolMeta[] {
  const results: ResolvedToolMeta[] = [];
  const seen = new Set<string>();

  // Search generated tool executors
  for (const tool of generatedToolExecutors.values()) {
    if (!tool.name.startsWith(prefix) || seen.has(tool.name)) continue;
    seen.add(tool.name);
    results.push({
      name: tool.name,
      description: tool.description ?? "",
      parameters: (tool.parameters ?? {}) as Record<string, unknown>,
    });
  }

  // Search local tool registry
  for (const name of getAllLocalToolNames()) {
    if (!name.startsWith(prefix) || seen.has(name)) continue;
    seen.add(name);
    const local = getLocalTool(name);
    if (!local) continue;
    results.push({
      name: local.name,
      description: (local as { description?: string }).description ?? "",
      parameters: ((local as { parameters?: unknown }).parameters ?? {}) as Record<string, unknown>,
    });
  }

  return results;
}

/**
 * Format a JSON Schema parameter object into a concise payload description.
 * e.g. `{ account_name: string, rank_threshold?: number }`
 */
function formatParamsFromSchema(schema: Record<string, unknown>): string {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties || Object.keys(properties).length === 0) {
    return "No payload needed.";
  }

  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );

  const fields = Object.entries(properties).map(([key, prop]) => {
    const type = (prop.type as string) ?? "unknown";
    const isOptional = !required.has(key);
    return `${key}${isOptional ? "?" : ""}: ${type}`;
  });

  return `Payload: { ${fields.join(", ")} }`;
}

/**
 * Strip the prefix from a tool name to get a short action name.
 * e.g. "alpharank_portfolio_checkin" with prefix "alpharank_" → "portfolio_checkin"
 */
function toActionName(toolName: string, prefix: string): string {
  return toolName.startsWith(prefix)
    ? toolName.slice(prefix.length)
    : toolName;
}

/**
 * Auto-generate Gemini-friendly action descriptions from registered tools.
 * Reads tool name, description, and parameter schemas directly from
 * the registered tools — no hand-written descriptions needed.
 *
 * Returns undefined if no tools are found for the prefix.
 */
function generateActionDescriptionsFromRegistry(prefix: string): string | undefined {
  const tools = resolveToolsByPrefix(prefix);
  logAction({ ts: Date.now(), type: "action", category: "native-tools", message: `auto-generating action descriptions for prefix "${prefix}": found ${tools.length} tools` });
  if (tools.length === 0) return undefined;

  const lines = tools.map((t) => {
    const actionName = toActionName(t.name, prefix);
    // Take the first sentence of the description for brevity
    const shortDesc = t.description.split(". ")[0] || t.description;
    const params = formatParamsFromSchema(t.parameters);
    return `- "${actionName}" — ${shortDesc}. ${params}`;
  });

  // Check if any tool has an account_name parameter
  const hasAccountName = tools.some((t) => {
    const props = (t.parameters.properties ?? {}) as Record<string, unknown>;
    return "account_name" in props;
  });

  const accountHint = hasAccountName
    ? `\n- For actions requiring account_name, extract it from the data prop — look for data.account_name, data.accountName, data.account, or data.name.`
    : "";

  return `AVAILABLE TOOL ACTIONS — use these EXACT names with onAction():
- "refresh" — Re-fetch the current data from the server. No payload needed.
${lines.join("\n")}

IMPORTANT:
- Use ONLY these action names with onAction(). Do NOT invent other action names.
- Always include a "refresh" button (e.g. a RefreshCw icon button).${accountHint}
- Show contextually relevant actions as buttons — not all actions apply to every view.
- Use local useState for tab switching, sorting, filtering, expanding — onAction is only for server-side operations.`;
}

/**
 * Parse tool text output into structured data.
 * Tries JSON first, then wraps raw text so the UI generator can still work with it.
 */
function parseToolOutput(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { rawOutput: raw, type: "text_result" };
  }
}

registerDefaultSignatures();
