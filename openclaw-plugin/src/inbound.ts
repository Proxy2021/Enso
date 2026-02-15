import {
  createReplyPrefixOptions,
  type OpenClawConfig,
  type RuntimeEnv,
} from "openclaw/plugin-sdk";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { CoreConfig, EnsoInboundMessage, ServerMessage } from "./types.js";
import type { ConnectedClient } from "./server.js";
import { getEnsoRuntime } from "./runtime.js";
import { deliverEnsoReply } from "./outbound.js";
import { randomUUID } from "crypto";

const CHANNEL_ID = "enso" as const;

export async function handleEnsoInbound(params: {
  message: EnsoInboundMessage;
  account: ResolvedEnsoAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  client: ConnectedClient;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { message, account, config, runtime, client, statusSink } = params;
  const core = getEnsoRuntime();

  const rawBody = message.text?.trim() ?? "";
  const mediaUrls = message.mediaUrls ?? [];
  if (!rawBody && mediaUrls.length === 0) {
    return;
  }

  statusSink?.({ lastInboundAt: message.timestamp });

  const peerId = message.senderNick;
  const route = core.channel.routing.resolveAgentRoute({
    cfg: config as OpenClawConfig,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: "direct",
      id: peerId,
    },
  });

  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config as OpenClawConfig);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: CHANNEL_ID,
    from: peerId,
    timestamp: message.timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: `enso:${peerId}`,
    To: `enso:${peerId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: peerId,
    SenderName: peerId,
    SenderId: peerId,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    MessageSid: message.messageId,
    Timestamp: message.timestamp,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `enso:${peerId}`,
    CommandAuthorized: true,
    ...(mediaUrls.length > 0 && {
      MediaPaths: mediaUrls,
      MediaPath: mediaUrls[0],
      MediaUrls: mediaUrls,
      MediaUrl: mediaUrls[0],
    }),
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`enso: failed updating session meta: ${String(err)}`);
    },
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config as OpenClawConfig,
    agentId: route.agentId,
    channel: CHANNEL_ID,
    accountId: account.accountId,
  });

  const runId = randomUUID();
  let seq = 0;

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config as OpenClawConfig,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload) => {
        await deliverEnsoReply({
          payload: payload as { text?: string; mediaUrl?: string; mediaUrls?: string[] },
          client,
          runId,
          seq: seq++,
          account,
          userMessage: rawBody,
          statusSink,
        });
      },
      onError: (err, info) => {
        runtime.error?.(`enso ${info.kind} reply failed: ${String(err)}`);
        client.send({
          id: randomUUID(),
          runId,
          sessionKey: client.sessionKey,
          seq: seq++,
          state: "error",
          text: "An error occurred generating a response.",
          timestamp: Date.now(),
        });
      },
    },
    replyOptions: {
      onModelSelected,
      disableBlockStreaming:
        typeof account.config.blockStreaming === "boolean"
          ? !account.config.blockStreaming
          : undefined,
    },
  });
}
