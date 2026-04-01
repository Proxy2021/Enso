/**
 * local-types.ts — Enso-owned type definitions that replace openclaw/plugin-sdk imports.
 *
 * These types mirror the shapes Enso actually uses from OpenClaw, allowing
 * Enso to run standalone while remaining compatible when OpenClaw is present.
 */

// ── Tool shape (mirrors AnyAgentTool from openclaw/plugin-sdk) ──

export interface EnsoAgentTool {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  isPrimary?: boolean;
  execute: (
    callId: string,
    params: Record<string, unknown>,
    context?: Record<string, unknown>,
  ) => Promise<{ content: Array<{ type: string; text?: string }> }>;
}

// ── Runtime logging (mirrors RuntimeEnv from openclaw/plugin-sdk) ──

export interface EnsoRuntime {
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

// ── Config shape (mirrors the subset of OpenClawConfig that Enso uses) ──

export interface EnsoBaseConfig {
  session?: { store?: string };
  agents?: Record<string, unknown>;
}

// ── Plugin API shape (mirrors OpenClawPluginApi for the methods Enso uses) ──

export interface EnsoPluginApi {
  registerTool: (tool: EnsoAgentTool) => void;
  registerChannel: (opts: { plugin: unknown }) => void;
  on: (event: string, handler: (...args: unknown[]) => unknown) => void;
  runtime: EnsoPluginRuntime;
}

// ── Plugin Runtime shape (mirrors PluginRuntime for the subset Enso uses) ──

export interface EnsoPluginRuntime extends EnsoRuntime {
  channel: {
    routing: {
      resolveAgentRoute: (params: {
        cfg: unknown;
        channel: string;
        accountId: string;
        peer: { kind: string; id: string };
      }) => { agentId: string; sessionKey: string; accountId: string };
    };
    session: {
      resolveStorePath: (store: string | undefined, params: { agentId: string }) => string;
      readSessionUpdatedAt: (params: { storePath: string; sessionKey: string }) => number | undefined;
      recordInboundSession: (params: {
        storePath: string;
        sessionKey: string;
        ctx: Record<string, unknown>;
        onRecordError?: (err: unknown) => void;
      }) => Promise<void>;
    };
    reply: {
      resolveEnvelopeFormatOptions: (cfg: unknown) => unknown;
      formatAgentEnvelope: (params: {
        channel: string;
        from: string;
        timestamp: number;
        previousTimestamp: number | undefined;
        envelope: unknown;
        body: string;
      }) => string;
      finalizeInboundContext: (params: Record<string, unknown>) => Record<string, unknown>;
      dispatchReplyWithBufferedBlockDispatcher: (params: {
        ctx: Record<string, unknown>;
        cfg: unknown;
        dispatcherOptions: {
          deliver: (payload: unknown) => Promise<void>;
          onError: (err: unknown, info: { kind: string }) => void;
          [key: string]: unknown;
        };
        replyOptions: Record<string, unknown>;
      }) => Promise<void>;
    };
  };
}

// ── Default account constant ──

export const DEFAULT_ACCOUNT_ID = "default";
