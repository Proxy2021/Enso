import { randomUUID } from "crypto";
import { DEFAULT_ACCOUNT_ID } from "./local-types.js";
import { ENSO_PORT, ENSO_HOST } from "./config.js";
import type { CoreConfig, EnsoAccountConfig } from "./types.js";
import { loadProviderKeys } from "./llm-provider.js";

export type ResolvedEnsoAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  configured: boolean;
  port: number;
  host: string;
  geminiApiKey: string;
  providerKeys: Record<string, string>;
  mode: "im" | "ui" | "full";
  accessToken?: string;
  machineName?: string;
  config: EnsoAccountConfig;
};

export function listEnsoAccountIds(cfg: CoreConfig): string[] {
  return [DEFAULT_ACCOUNT_ID];
}

export function resolveEnsoAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedEnsoAccount {
  const accountId = params.accountId ?? DEFAULT_ACCOUNT_ID;
  const section = params.cfg.channels?.enso ?? {};

  const port = section.port ?? ENSO_PORT;
  const host = section.host ?? ENSO_HOST;
  const geminiApiKey =
    section.geminiApiKey ?? process.env.GEMINI_API_KEY ?? "";

  const configured = true;
  const mode = section.mode ?? "full";

  // Access token: from config, env, or auto-generate
  let accessToken = section.accessToken ?? process.env.ENSO_ACCESS_TOKEN ?? undefined;
  if (!accessToken) {
    accessToken = randomUUID();
    console.log(`[enso] Auto-generated access token: ${accessToken}`);
  }

  const providerKeys = loadProviderKeys();
  if (geminiApiKey) providerKeys.gemini = geminiApiKey;

  return {
    accountId,
    enabled: section.enabled !== false,
    name: section.name,
    configured,
    port,
    host,
    geminiApiKey,
    providerKeys,
    mode,
    accessToken,
    machineName: section.machineName ?? process.env.ENSO_MACHINE_NAME ?? undefined,
    config: section,
  };
}

