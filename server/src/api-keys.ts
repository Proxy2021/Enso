/**
 * api-keys.ts — Centralized service API key storage.
 *
 * Stores all service API keys in ~/.enso/api-keys.json.
 * Easy to copy this single file to a new machine for instant setup.
 *
 * On load: reads the file and injects keys into process.env (if not already set).
 * On save: updates process.env immediately + persists to disk.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { ENSO_HOME } from "./utils/home.js";
import { join } from "node:path";
import { logAction } from "./action-log.js";

const API_KEYS_FILE = join(ENSO_HOME, "api-keys.json");

// ── Key Definitions ──

export interface ServiceKeyDef {
  id: string;
  envVar: string;
  label: string;
  description: string;
  setupUrl: string;
}

const SERVICE_KEYS: ServiceKeyDef[] = [
  { id: "gemini", envVar: "GEMINI_API_KEY", label: "Google Gemini", description: "Chat AI model (powers agent conversations)", setupUrl: "https://aistudio.google.com/apikey" },
  { id: "brave", envVar: "BRAVE_API_KEY", label: "Brave Search", description: "Web search for research tools", setupUrl: "https://brave.com/search/api/" },
  { id: "accessToken", envVar: "ENSO_ACCESS_TOKEN", label: "Access Token", description: "Server authentication token (auto-generated if empty)", setupUrl: "" },
  { id: "byteplus", envVar: "BYTEPLUS_API_KEY", label: "BytePlus Seedance", description: "AI video generation", setupUrl: "https://console.byteplus.com/" },
  { id: "replicate", envVar: "REPLICATE_API_TOKEN", label: "Replicate", description: "AI image upscaling", setupUrl: "https://replicate.com/account/api-tokens" },
  { id: "removebg", envVar: "REMOVE_BG_API_KEY", label: "Remove.bg", description: "Background removal", setupUrl: "https://www.remove.bg/api" },
  { id: "smtpEmail", envVar: "SMTP_EMAIL", label: "Gmail Address", description: "Gmail address for sending emails (e.g. you@gmail.com)", setupUrl: "https://myaccount.google.com/apppasswords" },
  { id: "smtpPassword", envVar: "SMTP_PASSWORD", label: "Gmail App Password", description: "Gmail App Password (16-char code from Google > Security > App Passwords)", setupUrl: "https://myaccount.google.com/apppasswords" },
  { id: "youtubeClientId", envVar: "YOUTUBE_CLIENT_ID", label: "YouTube Client ID", description: "Google Cloud OAuth2 Client ID for YouTube API", setupUrl: "https://console.cloud.google.com/apis/credentials" },
  { id: "youtubeClientSecret", envVar: "YOUTUBE_CLIENT_SECRET", label: "YouTube Client Secret", description: "Google Cloud OAuth2 Client Secret", setupUrl: "https://console.cloud.google.com/apis/credentials" },
  { id: "youtubeRefreshToken", envVar: "YOUTUBE_REFRESH_TOKEN", label: "YouTube Refresh Token", description: "Auto-generated after OAuth authorization (do not edit manually)", setupUrl: "" },
];

export function getServiceKeyDefinitions(): ServiceKeyDef[] {
  return SERVICE_KEYS;
}

// ── Read / Write ──

interface ApiKeysFile {
  /** Map of service id → API key value */
  [key: string]: string;
}

function readKeysFile(): ApiKeysFile {
  try {
    return JSON.parse(readFileSync(API_KEYS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeKeysFile(keys: ApiKeysFile): void {
  writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2) + "\n", "utf-8");
}

// ── Public API ──

/**
 * Load all API keys from ~/.enso/api-keys.json into process.env.
 * Called once at startup. Does NOT overwrite keys already in process.env
 * (system env vars take precedence).
 */
export function loadApiKeys(): void {
  const keys = readKeysFile();
  let loaded = 0;

  for (const def of SERVICE_KEYS) {
    const value = keys[def.id];
    if (value && !process.env[def.envVar]) {
      process.env[def.envVar] = value;
      loaded++;
    }
  }

  if (loaded > 0) {
    logAction({
      ts: Date.now(),
      type: "system",
      category: "api-keys",
      message: `Loaded ${loaded} API key(s) from ${API_KEYS_FILE}`,
    });
  }
}

/**
 * Save a single API key. Updates process.env immediately + persists to disk.
 * Pass empty string to remove a key.
 */
export function saveApiKey(id: string, envVar: string, value: string): void {
  const keys = readKeysFile();

  if (value) {
    keys[id] = value;
    process.env[envVar] = value;
  } else {
    delete keys[id];
    delete process.env[envVar];
  }

  writeKeysFile(keys);

  logAction({
    ts: Date.now(),
    type: "action",
    category: "api-keys",
    message: value ? `Saved key: ${id}` : `Removed key: ${id}`,
  });
}

/**
 * Migrate keys from server/.env to api-keys.json.
 * Called once — reads .env, extracts known service keys,
 * writes them to api-keys.json, and removes them from .env.
 */
export function migrateFromEnvFile(envPath: string): void {
  try {
    const content = readFileSync(envPath, "utf-8");
    const existingKeys = readKeysFile();
    const envVarToId = new Map(SERVICE_KEYS.map((sk) => [sk.envVar, sk.id]));
    const migratedIds: string[] = [];
    const remainingLines: string[] = [];

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        remainingLines.push(line);
        continue;
      }

      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) { remainingLines.push(line); continue; }

      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      const serviceId = envVarToId.get(key);

      if (serviceId && val) {
        // Migrate this key (don't overwrite if already in api-keys.json)
        if (!existingKeys[serviceId]) {
          existingKeys[serviceId] = val;
          migratedIds.push(serviceId);
        }
        // Don't keep in .env
      } else {
        remainingLines.push(line);
      }
    }

    if (migratedIds.length > 0) {
      writeKeysFile(existingKeys);

      // Rewrite .env without the migrated keys
      while (remainingLines.length > 0 && remainingLines[remainingLines.length - 1].trim() === "")
        remainingLines.pop();
      writeFileSync(envPath, remainingLines.join("\n") + "\n", "utf-8");

      logAction({
        ts: Date.now(),
        type: "system",
        category: "api-keys",
        message: `Migrated ${migratedIds.length} key(s) from .env to api-keys.json: ${migratedIds.join(", ")}`,
      });
    }
  } catch {
    // .env doesn't exist or can't be read — nothing to migrate
  }
}
