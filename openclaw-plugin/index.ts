import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { ensoPlugin } from "./src/channel.js";
import { setEnsoRuntime, setPluginApi } from "./src/runtime.js";
import { findExistingProviderForActionSuffixes, isToolRegistered } from "./src/native-tools/registry.js";
import { recordToolCall } from "./src/native-tools/tool-call-store.js";
import { registerFilesystemTools } from "./src/filesystem-tools.js";

import { registerMediaTools } from "./src/media-tools.js";
import { registerScreenTools } from "./src/screen-tools.js";
import { registerBrowserTools } from "./src/browser-tools.js";
import { registerCityTools } from "./src/city-tools.js";
import { registerResearcherTools } from "./src/researcher-tools.js";
import { registerClawHubTools } from "./src/clawhub-tools.js";
import { APP_CATALOG } from "./src/app-catalog.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load .env file from the Enso project root into process.env.
 * Only sets keys that are NOT already present (system env takes precedence).
 * No external dependencies — pure Node.js.
 */
function loadEnvFile(): void {
  try {
    const pluginDir = dirname(fileURLToPath(import.meta.url));
    const envPath = resolve(pluginDir, "..", ".env");
    const content = readFileSync(envPath, "utf-8");
    let loaded = 0;
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
        loaded++;
      }
    }
    if (loaded > 0) {
      console.log(`[enso] Loaded ${loaded} env var(s) from ${envPath}`);
    }
  } catch {
    // .env file not found or unreadable — that's fine, rely on system env
  }
}

function maybeRegisterFallbackToolFamily(input: {
  familyLabel: string;
  fallbackPrefix: string;
  actionSuffixes: string[];
  register: () => void;
}): void {
  const existing = findExistingProviderForActionSuffixes({
    excludePrefix: input.fallbackPrefix,
    actionSuffixes: input.actionSuffixes,
    minMatches: Math.min(2, input.actionSuffixes.length),
  });
  if (existing) {
    console.log(
      `[enso] Skipping fallback ${input.familyLabel} tools; detected existing provider ${existing.prefix} (${existing.sampleToolName})`,
    );
    return;
  }
  input.register();
}

const plugin = {
  id: "enso",
  name: "Enso",
  description: "React-based AI channel with dynamic UI generation",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    loadEnvFile();
    setEnsoRuntime(api.runtime);
    setPluginApi(api);
    api.registerChannel({ plugin: ensoPlugin as ChannelPlugin });
    maybeRegisterFallbackToolFamily({
      familyLabel: "filesystem",
      fallbackPrefix: "enso_fs_",
      actionSuffixes: APP_CATALOG.find((x) => x.appId === "filesystem")?.actions ?? [],
      register: () => registerFilesystemTools(api),
    });
    // Media tools are registered directly (no catalog entry) — they serve as
    // the backend for the dynamic media_gallery app via ctx.callTool().
    registerMediaTools(api);
    registerScreenTools(api);
    maybeRegisterFallbackToolFamily({
      familyLabel: "city",
      fallbackPrefix: "enso_city_",
      actionSuffixes: APP_CATALOG.find((x) => x.appId === "city_planner")?.actions ?? [],
      register: () => registerCityTools(api),
    });
    maybeRegisterFallbackToolFamily({
      familyLabel: "browser",
      fallbackPrefix: "enso_browser_",
      actionSuffixes: APP_CATALOG.find((x) => x.appId === "web_browser")?.actions ?? [],
      register: () => registerBrowserTools(api),
    });
    maybeRegisterFallbackToolFamily({
      familyLabel: "researcher",
      fallbackPrefix: "enso_researcher_",
      actionSuffixes: APP_CATALOG.find((x) => x.appId === "researcher")?.actions ?? [],
      register: () => registerResearcherTools(api),
    });
    maybeRegisterFallbackToolFamily({
      familyLabel: "clawhub",
      fallbackPrefix: "enso_clawhub_",
      actionSuffixes: APP_CATALOG.find((x) => x.appId === "clawhub")?.actions ?? [],
      register: () => registerClawHubTools(api),
    });

    // ── Native Tool Bridge: capture agent tool usage ──
    // When the agent calls a tool from a co-loaded OpenClaw plugin,
    // record it so the resulting card can invoke it directly on interactions.
    // No manual registration needed — tools are auto-discovered from the registry.
    api.on("after_tool_call", (event, _ctx) => {
      if (event.error) return; // Don't record failed tool calls
      if (isToolRegistered(event.toolName)) {
        recordToolCall({
          toolName: event.toolName,
          params: event.params,
          result: event.result,
          timestamp: Date.now(),
        });
      }
    });
  },
};

export default plugin;
