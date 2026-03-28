import type { EnsoPluginRuntime, EnsoPluginApi } from "./local-types.js";

let runtime: EnsoPluginRuntime | null = null;
let pluginApi: EnsoPluginApi | null = null;

export function setEnsoRuntime(next: EnsoPluginRuntime) {
  runtime = next;
}

export function getEnsoRuntime(): EnsoPluginRuntime {
  if (!runtime) {
    throw new Error("Enso runtime not initialized");
  }
  return runtime;
}

/** Returns true if an OpenClaw runtime has been initialized (i.e., running as a plugin). */
export function hasOpenClawRuntime(): boolean {
  return runtime !== null;
}

/**
 * Store the OpenClaw Plugin API for use after the register() phase.
 * Enables dynamic apps to register as OpenClaw tools at runtime.
 */
export function setPluginApi(api: EnsoPluginApi) {
  pluginApi = api;
}

/**
 * Get the stored OpenClaw Plugin API.
 * Returns null if called before plugin registration or in standalone mode.
 */
export function getPluginApi(): EnsoPluginApi | null {
  return pluginApi;
}

// ── Active client tracking (per-request) ──
// Set before entering the agent pipeline, so tools can access the current client.

let _activeClientId: string | null = null;

export function setActiveClientId(id: string | null): void {
  _activeClientId = id;
}

export function getActiveClientId(): string | null {
  return _activeClientId;
}
