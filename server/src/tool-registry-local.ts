/**
 * tool-registry-local.ts — Standalone in-process tool registry.
 *
 * Stores all Enso tools locally so they can be discovered and executed
 * without requiring the OpenClaw global plugin registry. This registry
 * is always populated (both standalone and OpenClaw modes).
 *
 * Dynamic app tools (from registerAppTool in registry.ts) are stored
 * separately in `generatedToolExecutors` — this registry is for the
 * system tools (filesystem, media, browser, researcher, etc.).
 */

import type { EnsoAgentTool } from "./local-types.js";

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

/** Return all registered local tools. */
export function getAllLocalTools(): EnsoAgentTool[] {
  return Array.from(localTools.values());
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
  const tool = localTools.get(name);
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
