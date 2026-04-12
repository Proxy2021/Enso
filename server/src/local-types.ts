/**
 * local-types.ts — Enso-owned type definitions for the standalone server.
 */

// ── Tool shape ──

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

// ── Runtime logging ──

export interface EnsoRuntime {
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

// ── Config shape ──

export interface EnsoBaseConfig {
  session?: { store?: string };
  agents?: Record<string, unknown>;
}

// ── Default account constant ──

export const DEFAULT_ACCOUNT_ID = "default";
