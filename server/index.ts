/**
 * index.ts — OpenClaw plugin entry point.
 *
 * This file is ONLY loaded when Enso runs as an OpenClaw plugin.
 * It registers Enso as a channel, registers tools with both the local
 * registry AND the OpenClaw ecosystem, and sets up event hooks.
 *
 * For standalone mode, use standalone.ts instead.
 */

import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { ensoPlugin } from "./src/channel.js";
import { setEnsoRuntime, setPluginApi } from "./src/runtime.js";
import { findExistingProviderForActionSuffixes, isToolRegistered } from "./src/native-tools/registry.js";
import { recordToolCall } from "./src/native-tools/tool-call-store.js";
import { buildEnsoContext, setWorkspaceDir } from "./src/memory-bridge.js";
import { registerFilesystemTools, createFilesystemTools } from "./src/filesystem-tools.js";
import { registerMediaTools, createMediaTools } from "./src/media-tools.js";
import { registerScreenTools, createScreenTools } from "./src/screen-tools.js";
import { registerBrowserTools, createBrowserTools } from "./src/browser-tools.js";
import { registerResearcherTools, createResearcherTools } from "./src/researcher-tools.js";
import { registerClawHubTools, createClawHubTools } from "./src/clawhub-tools.js";
import { registerLocalTool } from "./src/tool-registry-local.js";
import { APP_CATALOG } from "./src/app-catalog.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EnsoPluginApi } from "./src/local-types.js";

/**
 * Load .env file from the Enso project root into process.env.
 * Only sets keys that are NOT already present (system env takes precedence).
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
    if (loaded > 0) console.log(`[enso] Loaded ${loaded} env var(s) from ${envPath}`);
  } catch {
    // .env not found — rely on system env
  }
}

loadEnvFile();

/** Register tools in the local registry (always) for standalone agent + card actions. */
function registerAllToolsLocally(): void {
  const allToolSets = [
    createFilesystemTools(),
    createMediaTools(),
    createScreenTools(),
    createBrowserTools(),
    createResearcherTools(),
    createClawHubTools(),
  ];
  for (const tools of allToolSets) {
    for (const tool of tools) {
      registerLocalTool(tool);
    }
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
    // Store runtime + API for use throughout Enso
    setEnsoRuntime(api.runtime as Parameters<typeof setEnsoRuntime>[0]);
    setPluginApi(api as unknown as EnsoPluginApi);

    // Always populate the local tool registry
    registerAllToolsLocally();

    // Register as an OpenClaw channel
    api.registerChannel({ plugin: ensoPlugin as ChannelPlugin });

    // Register tools with OpenClaw ecosystem (with fallback dedup)
    maybeRegisterFallbackToolFamily({
      familyLabel: "filesystem",
      fallbackPrefix: "enso_fs_",
      actionSuffixes: APP_CATALOG.find((x) => x.appId === "filesystem")?.actions ?? [],
      register: () => registerFilesystemTools(api as unknown as EnsoPluginApi),
    });
    registerMediaTools(api as unknown as EnsoPluginApi);
    registerScreenTools(api as unknown as EnsoPluginApi);
    maybeRegisterFallbackToolFamily({
      familyLabel: "browser",
      fallbackPrefix: "enso_browser_",
      actionSuffixes: APP_CATALOG.find((x) => x.appId === "web_browser")?.actions ?? [],
      register: () => registerBrowserTools(api as unknown as EnsoPluginApi),
    });
    maybeRegisterFallbackToolFamily({
      familyLabel: "researcher",
      fallbackPrefix: "enso_researcher_",
      actionSuffixes: APP_CATALOG.find((x) => x.appId === "researcher")?.actions ?? [],
      register: () => registerResearcherTools(api as unknown as EnsoPluginApi),
    });
    maybeRegisterFallbackToolFamily({
      familyLabel: "clawhub",
      fallbackPrefix: "enso_clawhub_",
      actionSuffixes: APP_CATALOG.find((x) => x.appId === "clawhub")?.actions ?? [],
      register: () => registerClawHubTools(api as unknown as EnsoPluginApi),
    });

    // ── Native Tool Bridge: capture agent tool usage ──
    api.on("after_tool_call", (event: { error?: unknown; toolName: string; params: Record<string, unknown>; result: unknown }, _ctx: unknown) => {
      if (event.error) return;
      if (isToolRegistered(event.toolName)) {
        recordToolCall({
          toolName: event.toolName,
          params: event.params,
          result: event.result,
          timestamp: Date.now(),
        });
      }
    });

    // ── Memory Bridge: inject Enso usage context into agent prompts ──
    api.on("before_prompt_build", async (_event: unknown, ctx: { workspaceDir?: string; sessionKey?: string }) => {
      if (ctx.workspaceDir) setWorkspaceDir(ctx.workspaceDir);
      if (!ctx.sessionKey?.includes(":enso:")) return {};
      try {
        const prependContext = await buildEnsoContext();
        if (!prependContext) return {};
        return { prependContext };
      } catch {
        return {};
      }
    });
  },
};

export default plugin;
