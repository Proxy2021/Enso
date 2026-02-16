import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { ensoPlugin } from "./src/channel.js";
import { setEnsoRuntime } from "./src/runtime.js";
import { isToolRegistered } from "./src/native-tools/registry.js";
import { recordToolCall } from "./src/native-tools/tool-call-store.js";

const plugin = {
  id: "enso",
  name: "Enso",
  description: "React-based AI channel with dynamic UI generation",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setEnsoRuntime(api.runtime);
    api.registerChannel({ plugin: ensoPlugin as ChannelPlugin });

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
