/**
 * tool-registry-local.ts — Standalone in-process tool registry.
 *
 * Stores all Enso tools locally so they can be discovered and executed
 * without requiring the OpenClaw global plugin registry. This registry
 * is always populated (both standalone and OpenClaw modes).
 *
 * `getAllLocalTools()` merges system tools with dynamically registered
 * app tools (from registerAppTool) so the standalone agent can discover
 * and use user-built apps.
 */

import type { EnsoAgentTool } from "./local-types.js";
import { getAllDynamicTools } from "./native-tools/registry.js";

const localTools = new Map<string, EnsoAgentTool>();

/** Register a system tool in the local registry. */
export function registerLocalTool(tool: EnsoAgentTool): void {
  localTools.set(tool.name, tool);
}

/** Unregister a tool by name. Returns true if it existed. */
export function unregisterLocalTool(name: string): boolean {
  return localTools.delete(name);
}

/** Look up a tool by exact name. */
export function getLocalTool(name: string): EnsoAgentTool | undefined {
  return localTools.get(name);
}

/** Return all registered tools (system + dynamic app tools). */
export function getAllLocalTools(): EnsoAgentTool[] {
  const systemTools = Array.from(localTools.values());
  // Merge dynamically registered app tools so the standalone agent can use them
  const dynamicTools = getAllDynamicTools();
  for (const dt of dynamicTools) {
    if (!localTools.has(dt.name)) {
      systemTools.push({
        name: dt.name,
        description: dt.description,
        parameters: dt.parameters,
        execute: dt.execute,
      });
    }
  }
  return systemTools;
}

/** Return all tool names. */
export function getAllLocalToolNames(): string[] {
  return Array.from(localTools.keys());
}

/**
 * Execute a tool by name with given params.
 * Returns the parsed result data or throws if the tool is not found.
 */
export async function executeLocalTool(
  name: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  let tool: EnsoAgentTool | undefined = localTools.get(name);
  // Fall back to dynamic app tools if not in system registry
  if (!tool) {
    const dt = getAllDynamicTools().find((t) => t.name === name);
    if (dt) tool = dt;
  }
  if (!tool) {
    throw new Error(`Tool not found in local registry: ${name}`);
  }
  const result = await tool.execute("local-" + Date.now(), params);
  // Extract text from the content array
  const textParts = result.content
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text!);
  const combined = textParts.join("\n");

  // Try to parse as JSON, return raw text otherwise
  try {
    return JSON.parse(combined);
  } catch {
    return { text: combined };
  }
}

/** Check if a tool is in the local registry. */
export function isLocalTool(name: string): boolean {
  return localTools.has(name);
}

/** Get count of registered tools. */
export function localToolCount(): number {
  return localTools.size;
}
