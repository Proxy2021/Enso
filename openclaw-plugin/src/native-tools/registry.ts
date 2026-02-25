import { randomUUID } from "crypto";
import { getAlphaRankTemplateCode, isAlphaRankSignature } from "./templates/alpharank.js";
import { getFilesystemTemplateCode, isFilesystemSignature } from "./templates/filesystem.js";
import { getWorkspaceTemplateCode, isWorkspaceSignature } from "./templates/workspace.js";
import { getMediaTemplateCode, isMediaSignature } from "./templates/media.js";
import { getTravelTemplateCode, isTravelSignature } from "./templates/travel.js";
import { getMealTemplateCode, isMealSignature } from "./templates/meal.js";
import { getToolingTemplateCode, isToolingSignature } from "./templates/tooling.js";
import { getSystemAutoTemplateCode, isSystemAutoSignature } from "./templates/system.js";
import { getGeneralTemplateCode, isGeneralSignature } from "./templates/general.js";
import { TOOL_FAMILY_CAPABILITIES, getCapabilityForFamily } from "../tool-families/catalog.js";

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
 * Action descriptions for UI generation are auto-generated from the OpenClaw
 * plugin registry (tool name, description, and parameter schemas). Override
 * via describeActions() only if you need custom formatting.
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
   * By default, descriptions are auto-generated from the OpenClaw plugin
   * registry (tool metadata). Only implement this if you need custom
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
  execute: (callId: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>;
}>();

/** In-memory store for dynamically generated template JSX code, keyed by signatureId. */
const generatedTemplateCode = new Map<string, string>();

export function registerGeneratedTool(tool: {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (callId: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>;
}): void {
  generatedToolExecutors.set(tool.name, tool);
  console.log(`[enso:native-tools] registered generated tool "${tool.name}"`);
}

export function registerGeneratedTemplateCode(signatureId: string, code: string): void {
  generatedTemplateCode.set(signatureId, code);
  console.log(`[enso:native-tools] registered generated template code for signature "${signatureId}"`);
}

/** Remove a generated tool executor by name. Returns true if it existed. */
export function unregisterGeneratedTool(toolName: string): boolean {
  const existed = generatedToolExecutors.delete(toolName);
  if (existed) console.log(`[enso:native-tools] unregistered generated tool "${toolName}"`);
  return existed;
}

/** Retrieve generated template code by signatureId. Returns undefined if not found. */
export function getGeneratedTemplateCodeBySignature(signatureId: string): string | undefined {
  return generatedTemplateCode.get(signatureId);
}

/** Remove generated template code by signatureId. Returns true if it existed. */
export function unregisterGeneratedTemplateCode(signatureId: string): boolean {
  const existed = generatedTemplateCode.delete(signatureId);
  if (existed) console.log(`[enso:native-tools] unregistered generated template code for signature "${signatureId}"`);
  return existed;
}

/** Remove a tool template (signature) from the registry. Returns true if it existed. */
export function unregisterToolTemplate(toolFamily: string, sigId: string): boolean {
  const key = signatureKey(toolFamily, sigId);
  const existed = signatureRegistry.delete(key);
  if (existed) console.log(`[enso:native-tools] unregistered tool template "${key}"`);
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
  console.log(`[enso:native-tools] registered action map "${map.name}" (prefix: ${map.prefix})`);
}

export function registerToolTemplate(signature: ToolTemplate): void {
  signatureRegistry.set(signatureKey(signature.toolFamily, signature.signatureId), signature);
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
      supportedActions: ["refresh", "list_drives", "list_directory", "read_text_file", "stat_path", "search_paths", "create_directory", "rename_path", "delete_path", "move_path"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "multimedia",
      signatureId: "media_gallery",
      templateId: "media-gallery-v1",
      supportedActions: ["refresh", "scan_library", "inspect_file", "group_by_type"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "code_workspace",
      signatureId: "workspace_inventory",
      templateId: "code-workspace-v1",
      supportedActions: ["refresh", "list_repos", "detect_dev_tools", "project_overview"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "travel_planner",
      signatureId: "itinerary_board",
      templateId: "travel-itinerary-v1",
      supportedActions: ["refresh", "plan_trip", "optimize_day", "budget_breakdown"],
      coverageStatus: "covered",
    },
    {
      toolFamily: "meal_planner",
      signatureId: "weekly_meal_plan",
      templateId: "meal-weekly-v1",
      supportedActions: ["refresh", "plan_week", "grocery_list", "swap_meal"],
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
 *   2. Auto-generated from OpenClaw plugin registry metadata
 */
export function getActionDescriptions(toolName: string): string | undefined {
  // 1. Check for manual override via action map
  const map = findActionMap(toolName);
  if (map?.describeActions) {
    return map.describeActions();
  }

  // 2. Auto-generate from the OpenClaw plugin registry
  // Use the action map's prefix if available, otherwise auto-detect from plugin
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

  // Specific prefix handlers first — they distinguish sub-signatures within
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
  if (lower.startsWith("enso_ws_")) {
    return getToolTemplate("code_workspace", "workspace_inventory");
  }
  if (lower.startsWith("enso_media_")) {
    return getToolTemplate("multimedia", "media_gallery");
  }
  if (lower.startsWith("enso_fs_")) {
    return getToolTemplate("filesystem", "directory_listing");
  }
  if (lower.startsWith("enso_travel_")) {
    return getToolTemplate("travel_planner", "itinerary_board");
  }
  if (lower.startsWith("enso_meal_")) {
    return getToolTemplate("meal_planner", "weekly_meal_plan");
  }
  if (lower.includes("plugin") || lower.includes("clawhub")) {
    return getToolTemplate("plugin_discovery", "plugin_catalog_list");
  }

  // Capability-suffix detection — catch-all for non-Enso providers
  // that expose equivalent operations under a different prefix.
  for (const capability of TOOL_FAMILY_CAPABILITIES) {
    const match = capability.actionSuffixes.some((suffix) => lower.endsWith(`_${suffix}`));
    if (match) {
      return getToolTemplate(capability.toolFamily, capability.signatureId);
    }
  }

  const matchedDynamicPrefix = Array.from(dynamicPrefixSignatureMap.keys())
    .filter((prefix) => lower.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];
  if (matchedDynamicPrefix) {
    const mapped = dynamicPrefixSignatureMap.get(matchedDynamicPrefix);
    if (mapped) return getToolTemplate(mapped.toolFamily, mapped.signatureId);
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
  if (Array.isArray(record.media) || Array.isArray(record.images) || Array.isArray(record.videos)) {
    return getToolTemplate("multimedia", "media_gallery");
  }
  if (Array.isArray(record.developmentTools) || "workspace" in record || "projectDirectories" in record) {
    return getToolTemplate("code_workspace", "workspace_inventory");
  }
  if (Array.isArray(record.itinerary) || "destination" in record || Array.isArray(record.categories)) {
    return getToolTemplate("travel_planner", "itinerary_board");
  }
  if (Array.isArray(record.mealPlan) || Array.isArray(record.groceryGroups) || "weeklyBudget" in record) {
    return getToolTemplate("meal_planner", "weekly_meal_plan");
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
  if (isAlphaRankSignature(signature.signatureId)) {
    return getAlphaRankTemplateCode(signature);
  }
  if (isFilesystemSignature(signature.signatureId)) {
    return getFilesystemTemplateCode(signature);
  }
  if (isWorkspaceSignature(signature.signatureId)) {
    return getWorkspaceTemplateCode(signature);
  }
  if (isMediaSignature(signature.signatureId)) {
    return getMediaTemplateCode(signature);
  }
  if (isTravelSignature(signature.signatureId)) {
    return getTravelTemplateCode(signature);
  }
  if (isMealSignature(signature.signatureId)) {
    return getMealTemplateCode(signature);
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
  // Check dynamically generated template code (from Tool Factory)
  const generatedCode = generatedTemplateCode.get(signature.signatureId);
  if (generatedCode) return generatedCode;

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
        title: source.title ?? "Loaded OpenClaw plugins",
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
      return {
        ...source,
        regime: source.regime ?? source.state ?? source.market_regime ?? "Unknown",
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
    case "workspace_inventory": {
      const repos = Array.isArray(source.repos) ? source.repos : Array.isArray(source.repositories) ? source.repositories : [];
      const found = Array.isArray(source.found) ? source.found : [];
      return {
        ...source,
        title: source.title ?? "Workspace inventory",
        rows: repos.length > 0 ? repos : found,
      };
    }
    case "media_gallery": {
      const items = Array.isArray(source.items) ? source.items : [];
      const groups = Array.isArray(source.groups)
        ? source.groups
        : Array.isArray(source.mediaTypes)
          ? source.mediaTypes
          : [];
      return {
        ...source,
        title: source.title ?? "Media gallery",
        rows: items,
        groups,
      };
    }
    case "itinerary_board": {
      const itinerary = Array.isArray(source.itinerary) ? source.itinerary : [];
      const categories = Array.isArray(source.categories) ? source.categories : [];
      return {
        ...source,
        title: source.title ?? "Travel itinerary",
        rows: itinerary,
        categories,
      };
    }
    case "weekly_meal_plan": {
      const mealPlan = Array.isArray(source.mealPlan) ? source.mealPlan : [];
      const groceryGroups = Array.isArray(source.groceryGroups) ? source.groceryGroups : [];
      return {
        ...source,
        title: source.title ?? "Weekly meal plan",
        rows: mealPlan,
        groceryGroups,
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

// Backward-compatible aliases during migration.
export type SignatureCoverageStatus = ToolTemplateCoverageStatus;
export type ToolSignature = ToolTemplate;
export const registerToolSignature = registerToolTemplate;
export const getToolSignature = getToolTemplate;
export const isSignatureActionCovered = isToolActionCovered;
export const detectSignatureForToolName = detectToolTemplateForToolName;
export const detectCapabilitySignature = detectToolTemplateFromData;
export const registerSignatureTemplateCandidate = registerToolTemplateCandidate;
export const getSignatureTemplateCode = getToolTemplateCode;
export const normalizeDataForSignature = normalizeDataForToolTemplate;
export const registerSignatureDataHint = registerToolTemplateDataHint;

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
    "enso_fs_",
    "enso_ws_",
    "enso_media_",
    "enso_travel_",
    "enso_meal_",
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
  const registry = getPluginRegistry();
  if (!registry) return;
  for (const entry of registry.tools) {
    const prefix = getPluginToolPrefix(entry.pluginId).toLowerCase();
    if (!prefix) continue;
    registerDynamicSystemTemplate({ prefix, pluginId: entry.pluginId });
  }
}

function getAllRegisteredToolNames(): string[] {
  const registry = getPluginRegistry();
  if (!registry) return [];
  const names = new Set<string>();
  for (const entry of registry.tools) {
    for (const name of entry.names) names.add(name);
  }
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
  const capability = getCapabilityForFamily(toolFamily);
  if (!capability) return undefined;

  const fallbackPrefix = extractToolPrefix(capability.fallbackToolName);
  if (!fallbackPrefix) return undefined;

  const existing = findExistingProviderForActionSuffixes({
    excludePrefix: fallbackPrefix,
    actionSuffixes: capability.actionSuffixes,
    minMatches: Math.min(2, capability.actionSuffixes.length),
  });
  if (existing) {
    return {
      toolName: existing.sampleToolName,
      handlerPrefix: existing.prefix,
    };
  }
  if (isToolRegistered(capability.fallbackToolName)) {
    return {
      toolName: capability.fallbackToolName,
      handlerPrefix: fallbackPrefix,
    };
  }
  return undefined;
}

/**
 * Detect the tool prefix for a given tool name by looking up its plugin
 * in the OpenClaw registry and computing the common prefix.
 */
function detectPrefixForTool(toolName: string): string | undefined {
  const pluginId = getToolPluginId(toolName);
  if (!pluginId) return undefined;
  return getPluginToolPrefix(pluginId);
}

// ── OpenClaw Plugin Registry Access ──

/**
 * Access the global OpenClaw plugin registry. Both Enso and other plugins
 * (e.g., AlphaRank) run in the same Node.js process, so the registry is
 * shared via a global Symbol.
 */
function getPluginRegistry(): { tools: Array<{ pluginId: string; factory: (ctx: Record<string, unknown>) => unknown; names: string[]; optional: boolean; source: string }> } | null {
  const state = (globalThis as Record<symbol, { registry?: unknown }>)[Symbol.for("openclaw.pluginRegistryState")];
  return (state?.registry as ReturnType<typeof getPluginRegistry>) ?? null;
}

/**
 * Return the currently loaded OpenClaw tool catalog grouped by plugin.
 * Useful for "list/search plugins" UX actions without requiring shell CLIs.
 */
export function getRegisteredToolCatalog(): RegisteredToolCatalogEntry[] {
  const registry = getPluginRegistry();
  if (!registry) return [];

  const byPlugin = new Map<string, Set<string>>();
  for (const entry of registry.tools) {
    const bucket = byPlugin.get(entry.pluginId) ?? new Set<string>();
    for (const name of entry.names) bucket.add(name);
    byPlugin.set(entry.pluginId, bucket);
  }

  return Array.from(byPlugin.entries())
    .map(([pluginId, tools]) => ({
      pluginId,
      tools: Array.from(tools).sort(),
    }))
    .sort((a, b) => a.pluginId.localeCompare(b.pluginId));
}

export function getRegisteredToolsDetailed(): RegisteredToolDetail[] {
  const registry = getPluginRegistry();
  if (!registry) return [];
  const details: RegisteredToolDetail[] = [];
  const seen = new Set<string>();

  for (const entry of registry.tools) {
    try {
      const resolved = entry.factory({});
      if (!resolved) continue;
      const tools = Array.isArray(resolved) ? resolved : [resolved];
      for (const tool of tools) {
        const t = tool as { name?: string; description?: string; parameters?: unknown };
        if (!t.name || seen.has(t.name)) continue;
        seen.add(t.name);
        details.push({
          pluginId: entry.pluginId,
          name: t.name,
          description: t.description ?? "",
          parameters: (t.parameters ?? {}) as Record<string, unknown>,
        });
      }
    } catch {
      // ignore one broken registry factory; continue with others
    }
  }

  return details.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a tool by name from the OpenClaw plugin registry.
 * Calls the tool's factory with an empty context to get the executable tool object.
 */
function resolveToolByName(toolName: string): { name: string; execute: (callId: string, params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }> } | null {
  const registry = getPluginRegistry();
  if (!registry) {
    console.log("[enso:native-tools] plugin registry not available");
    return null;
  }

  for (const entry of registry.tools) {
    if (entry.names.includes(toolName)) {
      try {
        const resolved = entry.factory({});
        if (!resolved) continue;

        // Factory can return a single tool or an array
        const tools = Array.isArray(resolved) ? resolved : [resolved];
        const tool = tools.find((t: { name?: string }) => t?.name === toolName);
        if (tool && typeof (tool as { execute?: unknown }).execute === "function") {
          return tool as ReturnType<typeof resolveToolByName>;
        }
      } catch (err) {
        console.log(`[enso:native-tools] failed to resolve tool "${toolName}" from plugin "${entry.pluginId}": ${String(err)}`);
      }
    }
  }

  // Fallback: check dynamically generated tool executors (from Tool Factory)
  const generated = generatedToolExecutors.get(toolName);
  if (generated && typeof generated.execute === "function") {
    return generated as ReturnType<typeof resolveToolByName>;
  }

  return null;
}

/**
 * Check if a tool exists in the OpenClaw plugin registry without resolving it.
 * Used to validate action names that might correspond to tool names.
 */
export function isToolRegistered(toolName: string): boolean {
  if (generatedToolExecutors.has(toolName)) return true;
  const registry = getPluginRegistry();
  if (!registry) return false;
  return registry.tools.some((entry) => entry.names.includes(toolName));
}

/**
 * Find the pluginId that owns a given tool name.
 */
export function getToolPluginId(toolName: string): string | undefined {
  const registry = getPluginRegistry();
  if (!registry) return undefined;
  const entry = registry.tools.find((e) => e.names.includes(toolName));
  return entry?.pluginId;
}

/**
 * Auto-detect the common name prefix shared by all tools from the same plugin.
 * e.g. for pluginId "alpharank" with tools ["alpharank_daily", "alpharank_predict", ...]
 * returns "alpharank_".
 *
 * Falls back to `pluginId + "_"` if no common prefix can be computed.
 */
export function getPluginToolPrefix(pluginId: string): string {
  const registry = getPluginRegistry();
  if (!registry) return `${pluginId}_`;

  // Collect all tool names from this plugin
  const names: string[] = [];
  for (const entry of registry.tools) {
    if (entry.pluginId === pluginId) {
      names.push(...entry.names);
    }
  }

  if (names.length === 0) return `${pluginId}_`;
  if (names.length === 1) {
    // Single tool — use everything up to and including the last underscore
    const lastUnderscore = names[0].lastIndexOf("_");
    return lastUnderscore > 0 ? names[0].slice(0, lastUnderscore + 1) : `${pluginId}_`;
  }

  // Find longest common prefix
  let prefix = names[0];
  for (let i = 1; i < names.length; i++) {
    while (!names[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix.length === 0) return `${pluginId}_`;
    }
  }

  // Ensure prefix ends with underscore for clean action names
  if (!prefix.endsWith("_")) {
    const lastUnderscore = prefix.lastIndexOf("_");
    prefix = lastUnderscore > 0 ? prefix.slice(0, lastUnderscore + 1) : `${pluginId}_`;
  }

  return prefix;
}

/**
 * Execute a registered OpenClaw tool directly, bypassing the agent loop.
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
 * Resolved tool metadata from the OpenClaw plugin registry.
 */
interface ResolvedToolMeta {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

/**
 * Resolve all tools matching a prefix from the OpenClaw plugin registry.
 * Returns their name, description, and parameter schemas.
 */
function resolveToolsByPrefix(prefix: string): ResolvedToolMeta[] {
  const registry = getPluginRegistry();
  if (!registry) return [];

  const results: ResolvedToolMeta[] = [];
  const seen = new Set<string>();

  for (const entry of registry.tools) {
    // Check if any tool name in this entry matches the prefix
    const matchingNames = entry.names.filter((n) => n.startsWith(prefix));
    if (matchingNames.length === 0) continue;

    try {
      const resolved = entry.factory({});
      if (!resolved) continue;

      const tools = Array.isArray(resolved) ? resolved : [resolved];
      for (const tool of tools) {
        const t = tool as { name?: string; description?: string; parameters?: unknown };
        if (!t?.name || !t.name.startsWith(prefix) || seen.has(t.name)) continue;
        seen.add(t.name);

        results.push({
          name: t.name,
          description: t.description ?? "",
          parameters: (t.parameters ?? {}) as Record<string, unknown>,
        });
      }
    } catch (err) {
      console.log(`[enso:native-tools] failed to resolve tools from plugin "${entry.pluginId}": ${String(err)}`);
    }
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
 * Auto-generate Gemini-friendly action descriptions from the OpenClaw plugin
 * registry. Reads tool name, description, and parameter schemas directly from
 * the registered tools — no hand-written descriptions needed.
 *
 * Returns undefined if no tools are found for the prefix.
 */
function generateActionDescriptionsFromRegistry(prefix: string): string | undefined {
  const tools = resolveToolsByPrefix(prefix);
  console.log(`[enso:native-tools] auto-generating action descriptions for prefix "${prefix}": found ${tools.length} tools`);
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
