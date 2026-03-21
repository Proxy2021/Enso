import { isToolRegistered } from "./registry.js";

// ── Types ──

export interface ToolCallRecord {
  /** The full tool name, e.g. "alpharank_portfolio_performance" */
  toolName: string;
  /** The parameters the agent passed to the tool */
  params: Record<string, unknown>;
  /** The tool's result (opaque — kept for potential future use) */
  result?: unknown;
  /** When the hook fired */
  timestamp: number;
}

// ── Store ──

/**
 * Chronologically ordered list of recent tool calls from co-loaded
 * OpenClaw plugins. Entries are evicted after MAX_AGE_MS.
 *
 * This bridges the gap between the after_tool_call hook (which fires
 * during agent execution) and the deliver callback (which fires after).
 */
const recentCalls: ToolCallRecord[] = [];

/**
 * Records older than this are evicted. 30 seconds is generous;
 * the typical hook-to-deliver gap is under 1 second for query tools.
 */
const MAX_AGE_MS = 30_000;

/**
 * Record a tool call from the after_tool_call hook.
 * Only called for tools from co-loaded OpenClaw plugins (filtered in index.ts).
 *
 * Note: OpenClaw fires after_tool_call twice per tool execution (once awaited
 * in the tool adapter, once fire-and-forget in the event subscriber). We
 * deduplicate by checking if the most recent record has the same tool name.
 */
export function recordToolCall(record: ToolCallRecord): void {
  evictStale();

  // Deduplicate: skip if the last record is the same tool call
  // (same name, within 1 second — indicates a duplicate hook fire)
  const last = recentCalls[recentCalls.length - 1];
  if (last && last.toolName === record.toolName && Math.abs(last.timestamp - record.timestamp) < 1000) {
    return;
  }

  recentCalls.push(record);
}

/**
 * Consume (remove and return) the most recent tool call record
 * from a co-loaded OpenClaw plugin tool. Called from deliverEnsoReply
 * when creating a new card context.
 *
 * Returns undefined if no matching record exists.
 */
export function consumeRecentToolCall(): ToolCallRecord | undefined {
  evictStale();

  // Walk backwards: most recent call is most likely to correspond
  // to the response being delivered right now.
  for (let i = recentCalls.length - 1; i >= 0; i--) {
    const record = recentCalls[i];
    if (isToolRegistered(record.toolName)) {
      recentCalls.splice(i, 1);
      return record;
    }
  }
  return undefined;
}

/**
 * Remove entries older than MAX_AGE_MS.
 * Since entries are chronological, we only need to scan from the front.
 */
function evictStale(): void {
  const cutoff = Date.now() - MAX_AGE_MS;
  while (recentCalls.length > 0 && recentCalls[0].timestamp < cutoff) {
    recentCalls.shift();
  }
}
