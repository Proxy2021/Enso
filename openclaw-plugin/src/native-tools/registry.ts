import { randomUUID } from "crypto";

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

/**
 * Register an action map for a tool family. Called at module-load time
 * by each tool mapping module (e.g., alpharank.ts).
 */
export function registerActionMap(map: NativeToolActionMap): void {
  actionMaps.set(map.prefix, map);
  console.log(`[enso:native-tools] registered action map "${map.name}" (prefix: ${map.prefix})`);
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

  return null;
}

/**
 * Check if a tool exists in the OpenClaw plugin registry without resolving it.
 * Used to validate action names that might correspond to tool names.
 */
export function isToolRegistered(toolName: string): boolean {
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
