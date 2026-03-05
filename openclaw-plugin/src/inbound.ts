import {
  createReplyPrefixOptions,
  type OpenClawConfig,
  type RuntimeEnv,
} from "openclaw/plugin-sdk";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { CoreConfig, EnsoInboundMessage, ToolRouting } from "./types.js";
import type { ConnectedClient } from "./server.js";
import { getEnsoRuntime } from "./runtime.js";
import { deliverEnsoReply } from "./outbound.js";
import { selectToolForContent } from "./ui-generator.js";
import { TOOL_FAMILY_CAPABILITIES } from "./tool-families/catalog.js";
import { isAudioFile, transcribeAudio } from "./transcribe.js";
import { randomUUID } from "crypto";
import { logAction, logError } from "./action-log.js";

// ── Background app compatibility check ──

async function runBackgroundCompatCheck(params: {
  cardId: string;
  cardText: string;
  geminiApiKey: string;
  client: ConnectedClient;
}): Promise<void> {
  const { cardId, cardText, geminiApiKey, client } = params;
  logAction({ ts: Date.now(), type: "action", category: "enhance", message: `bg compat check: cardId=${cardId}, textLen=${cardText.length}` });

  const result = await selectToolForContent({
    cardText,
    geminiApiKey,
    toolFamilies: TOOL_FAMILY_CAPABILITIES,
  });

  if (!result) {
    logAction({ ts: Date.now(), type: "action", category: "enhance", message: `bg compat check: no match for cardId=${cardId}` });
    return;
  }

  logAction({ ts: Date.now(), type: "action", category: "enhance", message: `bg compat check: match for cardId=${cardId}, family=${result.toolFamily}` });

  client.send({
    id: randomUUID(),
    runId: randomUUID(),
    sessionKey: client.sessionKey,
    seq: 0,
    state: "final",
    targetCardId: cardId,
    enhanceHint: { toolFamily: result.toolFamily },
    timestamp: Date.now(),
  });
}

const CHANNEL_ID = "enso" as const;

export async function handleEnsoInbound(params: {
  message: EnsoInboundMessage;
  account: ResolvedEnsoAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  client: ConnectedClient;
  routing?: ToolRouting;
  targetCardId?: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { message, account, config, runtime, client, routing, targetCardId, statusSink } = params;
  const core = getEnsoRuntime();

  let rawBody = message.text?.trim() ?? "";
  const mediaUrls = message.mediaUrls ?? [];
  if (!rawBody && mediaUrls.length === 0) {
    return;
  }

  // Transcribe audio attachments and prepend transcripts to the message body
  if (account.geminiApiKey && mediaUrls.length > 0) {
    const audioFiles = mediaUrls.filter(isAudioFile);
    if (audioFiles.length > 0) {
      const transcripts = await Promise.all(
        audioFiles.map((filePath) =>
          transcribeAudio({ filePath, geminiApiKey: account.geminiApiKey! }).catch(() => null),
        ),
      );
      const validTranscripts = transcripts.filter((t): t is string => t !== null);
      if (validTranscripts.length > 0) {
        const transcriptBlock = validTranscripts
          .map((t, i) => audioFiles.length > 1 ? `[Audio Transcript ${i + 1}]: ${t}` : `[Audio Transcript]: ${t}`)
          .join("\n\n");
        rawBody = rawBody ? `${transcriptBlock}\n\n${rawBody}` : transcriptBlock;
        logAction({ ts: Date.now(), type: "action", category: "inbound", message: `Transcribed ${validTranscripts.length}/${audioFiles.length} audio files` });
      }
    }
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
  const stableCardId = targetCardId ?? randomUUID();
  let seq = 0;
  const steps: Array<{ seq: number; text: string }> = [];

  logAction({ ts: Date.now(), type: "action", category: "inbound", message: `Dispatching: runId=${runId}, cardId=${stableCardId}, peer=${peerId}, targetCardId=${targetCardId ?? "none"}, textLen=${rawBody.length}` });
  logAction({ ts: Date.now(), type: "action", category: "inbound", message: `Chat: ${rawBody.slice(0, 100)}`, cardId: stableCardId });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config as OpenClawConfig,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload) => {
        const toolMeta = routing ? { toolId: routing.toolId, toolSessionId: routing.toolSessionId } : undefined;
        const blockText = (payload as { text?: string }).text ?? "";
        const currentSeq = seq++;
        if (blockText.trim()) {
          steps.push({ seq: currentSeq, text: blockText });
        }
        logAction({ ts: Date.now(), type: "action", category: "inbound", message: `Block delivered: seq=${currentSeq}, blockLen=${blockText.length}, totalSteps=${steps.length}`, cardId: stableCardId });
        await deliverEnsoReply({
          payload: payload as { text?: string; mediaUrl?: string; mediaUrls?: string[] },
          client,
          runId,
          seq: currentSeq,
          account,
          userMessage: rawBody,
          targetCardId,
          cardId: stableCardId,
          steps: steps.length > 0 ? [...steps] : undefined,
          toolMeta,
          statusSink,
        });
      },
      onError: (err, info) => {
        runtime.error?.(`enso ${info.kind} reply failed: ${String(err)}`);
        logError("inbound", `Reply failed (${info.kind})`, err, { cardId: stableCardId });
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

  // Background app compatibility check (fire-and-forget).
  // Only for fresh agent responses (not tool-routed or card-action updates).
  if (
    !routing &&
    !targetCardId &&
    account.geminiApiKey &&
    steps.length > 0 &&
    TOOL_FAMILY_CAPABILITIES.length > 0
  ) {
    const finalText = steps[steps.length - 1].text;
    if (finalText.trim().length >= 50) {
      runBackgroundCompatCheck({
        cardId: stableCardId,
        cardText: finalText,
        geminiApiKey: account.geminiApiKey,
        client,
      }).catch((err) => {
        logError("enhance", "Background compat check failed (non-fatal)", err, { cardId: stableCardId });
      });
    }
  }
}
