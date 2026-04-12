/**
 * agent-adapter.ts — Unified message handler for the standalone Gemini-powered agent.
 */

import type { ResolvedEnsoAccount } from "./accounts.js";
import type { CoreConfig, EnsoInboundMessage, ToolRouting } from "./types.js";
import type { EnsoRuntime } from "./local-types.js";
import type { ConnectedClient } from "./server.js";
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
  return handleStandaloneInbound(params);
}
