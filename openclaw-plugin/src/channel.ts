import {
  DEFAULT_ACCOUNT_ID,
  setAccountEnabledInConfigSection,
  deleteAccountFromConfigSection,
  type ChannelPlugin,
} from "openclaw/plugin-sdk";
import type { CoreConfig } from "./types.js";
import {
  listEnsoAccountIds,
  resolveEnsoAccount,
  type ResolvedEnsoAccount,
} from "./accounts.js";
import { startEnsoServer } from "./server.js";
import { deliverToEnso } from "./outbound.js";

const CHANNEL_ID = "enso" as const;

export const ensoPlugin: ChannelPlugin<ResolvedEnsoAccount> = {
  id: CHANNEL_ID,
  meta: {
    id: CHANNEL_ID,
    label: "Enso",
    selectionLabel: "Enso",
    docsPath: "/channels/enso",
    blurb: "React-based AI channel with dynamic UI generation",
  },
  capabilities: {
    chatTypes: ["direct"],
    blockStreaming: true,
  },
  reload: { configPrefixes: ["channels.enso"] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        name: { type: "string" },
        port: { type: "integer", minimum: 1, maximum: 65535 },
        host: { type: "string" },
        geminiApiKey: { type: "string" },
        dmPolicy: { type: "string", enum: ["open", "pairing", "disabled"] },
        allowFrom: { type: "array", items: { type: ["string", "number"] } },
        blockStreaming: { type: "boolean" },
        textChunkLimit: { type: "integer", minimum: 1 },
        mode: { type: "string", enum: ["im", "ui", "full"] },
      },
    },
  },
  config: {
    listAccountIds: (cfg) => listEnsoAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveEnsoAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "enso",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "enso",
        accountId,
        clearBaseFields: ["name", "port", "host", "geminiApiKey", "mode"],
      }),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      port: account.port,
      host: account.host,
      mode: account.mode,
    }),
  },
  messaging: {
    normalizeTarget: (raw: string) => {
      const trimmed = raw.replace(/^enso:/, "").trim();
      return trimmed || undefined;
    },
    targetResolver: {
      looksLikeId: (raw: string) => Boolean(raw.trim()),
      hint: "<session_id>",
    },
  },
  security: {
    resolveDmPolicy: ({ account }) => ({
      policy: account.config.dmPolicy ?? "open",
      allowFrom: account.config.allowFrom ?? [],
      policyPath: "channels.enso.dmPolicy",
      allowFromPath: "channels.enso.allowFrom",
    }),
  },
  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    sendText: async (ctx) => deliverToEnso(ctx),
    sendMedia: async (ctx) => deliverToEnso(ctx),
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ account, snapshot }) => ({
      configured: snapshot.configured ?? false,
      port: account.port,
      host: account.host,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      port: account.port,
      host: account.host,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.log?.info(
        `[${account.accountId}] starting Enso server on :${account.port}`,
      );
      const { stop } = await startEnsoServer({
        account,
        config: ctx.cfg as CoreConfig,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
      return new Promise((resolve) => {
        ctx.abortSignal?.addEventListener("abort", () => {
          stop();
          resolve({ stop });
        });
      });
    },
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 50, idleMs: 100 },
  },
};
