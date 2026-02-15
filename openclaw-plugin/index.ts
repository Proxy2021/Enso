import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { ensoPlugin } from "./src/channel.js";
import { setEnsoRuntime } from "./src/runtime.js";

const plugin = {
  id: "enso",
  name: "Enso",
  description: "React-based AI channel with dynamic UI generation",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setEnsoRuntime(api.runtime);
    api.registerChannel({ plugin: ensoPlugin as ChannelPlugin });
  },
};

export default plugin;
