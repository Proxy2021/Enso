import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { ensoPlugin } from "./src/channel.js";
import { setEnsoRuntime } from "./src/runtime.js";
import { findExistingProviderForActionSuffixes, isToolRegistered } from "./src/native-tools/registry.js";
import { recordToolCall } from "./src/native-tools/tool-call-store.js";
import { registerFilesystemTools } from "./src/filesystem-tools.js";
import { registerWorkspaceTools } from "./src/workspace-tools.js";
import { registerMediaTools } from "./src/media-tools.js";
import { registerTravelTools } from "./src/travel-tools.js";
import { registerMealTools } from "./src/meal-tools.js";
import { registerBrowserTools } from "./src/browser-tools.js";
import { registerCityTools } from "./src/city-tools.js";
import { TOOL_FAMILY_CAPABILITIES } from "./src/tool-families/catalog.js";

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
    setEnsoRuntime(api.runtime);
    api.registerChannel({ plugin: ensoPlugin as ChannelPlugin });
    maybeRegisterFallbackToolFamily({
      familyLabel: "filesystem",
      fallbackPrefix: "enso_fs_",
      actionSuffixes: TOOL_FAMILY_CAPABILITIES.find((x) => x.toolFamily === "filesystem")?.actionSuffixes ?? [],
      register: () => registerFilesystemTools(api),
    });
    maybeRegisterFallbackToolFamily({
      familyLabel: "workspace",
      fallbackPrefix: "enso_ws_",
      actionSuffixes: TOOL_FAMILY_CAPABILITIES.find((x) => x.toolFamily === "code_workspace")?.actionSuffixes ?? [],
      register: () => registerWorkspaceTools(api),
    });
    maybeRegisterFallbackToolFamily({
      familyLabel: "media",
      fallbackPrefix: "enso_media_",
      actionSuffixes: TOOL_FAMILY_CAPABILITIES.find((x) => x.toolFamily === "multimedia")?.actionSuffixes ?? [],
      register: () => registerMediaTools(api),
    });
    maybeRegisterFallbackToolFamily({
      familyLabel: "travel",
      fallbackPrefix: "enso_travel_",
      actionSuffixes: TOOL_FAMILY_CAPABILITIES.find((x) => x.toolFamily === "travel_planner")?.actionSuffixes ?? [],
      register: () => registerTravelTools(api),
    });
    maybeRegisterFallbackToolFamily({
      familyLabel: "meal",
      fallbackPrefix: "enso_meal_",
      actionSuffixes: TOOL_FAMILY_CAPABILITIES.find((x) => x.toolFamily === "meal_planner")?.actionSuffixes ?? [],
      register: () => registerMealTools(api),
    });
    maybeRegisterFallbackToolFamily({
      familyLabel: "city",
      fallbackPrefix: "enso_city_",
      actionSuffixes: TOOL_FAMILY_CAPABILITIES.find((x) => x.toolFamily === "city_planner")?.actionSuffixes ?? [],
      register: () => registerCityTools(api),
    });
    maybeRegisterFallbackToolFamily({
      familyLabel: "browser",
      fallbackPrefix: "enso_browser_",
      actionSuffixes: TOOL_FAMILY_CAPABILITIES.find((x) => x.toolFamily === "web_browser")?.actionSuffixes ?? [],
      register: () => registerBrowserTools(api),
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
