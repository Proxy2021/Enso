import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setEnsoRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getEnsoRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Enso runtime not initialized");
  }
  return runtime;
}
