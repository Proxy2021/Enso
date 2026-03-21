/**
 * agent-adapter.ts — Unified message handler that routes to OpenClaw or standalone agent.
 *
 * server.ts imports this instead of inbound.ts directly. When OpenClaw is active
 * (runtime initialized), messages are dispatched through the OpenClaw agent pipeline.
 * Otherwise, they go through the standalone Gemini-powered agent.
 */

import type { ResolvedEnsoAccount } from "./accounts.js";
import type { CoreConfig, EnsoInboundMessage, ToolRouting } from "./types.js";
import type { EnsoRuntime } from "./local-types.js";
import type { ConnectedClient } from "./server.js";
import { hasOpenClawRuntime } from "./runtime.js";
import { handleStandaloneInbound } from "./standalone-agent.js";

export async function handleInbound(params: {
  message: EnsoInboundMessage;
  account: ResolvedEnsoAccount;
  config: CoreConfig;
  runtime: EnsoRuntime;
  client: ConnectedClient;
  routing?: ToolRouting;
  targetCardId?: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  if (hasOpenClawRuntime()) {
    // OpenClaw is active — use the full agent pipeline (dynamic import to
    // avoid pulling in openclaw/plugin-sdk when it's not installed)
    const { handleEnsoInbound } = await import("./inbound.js");
    return handleEnsoInbound(params);
  }

  // Standalone mode — use Gemini Flash agent directly
  return handleStandaloneInbound(params);
}
