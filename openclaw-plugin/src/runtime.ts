import type { PluginRuntime, OpenClawPluginApi } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;
let pluginApi: OpenClawPluginApi | null = null;

export function setEnsoRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getEnsoRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Enso runtime not initialized");
  }
  return runtime;
}

/**
 * Store the OpenClaw Plugin API for use after the register() phase.
 * Enables dynamic apps to register as OpenClaw tools at runtime.
 */
export function setPluginApi(api: OpenClawPluginApi) {
  pluginApi = api;
}

/**
 * Get the stored OpenClaw Plugin API.
 * Returns null if called before plugin registration.
 */
export function getPluginApi(): OpenClawPluginApi | null {
  return pluginApi;
}
