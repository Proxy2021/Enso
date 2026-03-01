import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { CoreConfig, EnsoAccountConfig } from "./types.js";

const PLUGIN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEMINI_KEY_FILE = join(PLUGIN_DIR, "gemini.key");

export type ResolvedEnsoAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  configured: boolean;
  port: number;
  host: string;
  geminiApiKey: string;
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

  const port = section.port ?? parseInt(process.env.ENSO_PORT ?? "3001", 10);
  const host = section.host ?? process.env.ENSO_HOST ?? "0.0.0.0";
  const geminiApiKey =
    section.geminiApiKey ?? process.env.GEMINI_API_KEY ?? readKeyFile(GEMINI_KEY_FILE) ?? "";

  const configured = true;
  const mode = section.mode ?? "full";

  // Access token: from config, env, or auto-generate
  let accessToken = section.accessToken ?? process.env.ENSO_ACCESS_TOKEN ?? undefined;
  if (!accessToken) {
    accessToken = randomUUID();
    console.log(`[enso] Auto-generated access token: ${accessToken}`);
  }

  return {
    accountId,
    enabled: section.enabled !== false,
    name: section.name,
    configured,
    port,
    host,
    geminiApiKey,
    mode,
    accessToken,
    machineName: section.machineName ?? process.env.ENSO_MACHINE_NAME ?? undefined,
    config: section,
  };
}

function readKeyFile(path: string): string | undefined {
  try {
    const content = readFileSync(path, "utf-8").trim();
    return content || undefined;
  } catch {
    return undefined;
  }
}
