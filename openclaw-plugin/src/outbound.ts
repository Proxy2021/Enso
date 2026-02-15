import { randomUUID } from "crypto";
import type { ResolvedEnsoAccount } from "./accounts.js";
import { resolveEnsoAccount } from "./accounts.js";
import type { ConnectedClient } from "./server.js";
import { toMediaUrl } from "./server.js";
import type { CoreConfig, ServerMessage } from "./types.js";
import {
  serverGenerateUI,
  serverGenerateUIFromText,
} from "./ui-generator.js";

/**
 * Strip Gemini thinking/reasoning blocks from response text.
 * Gemini 2.5 Flash outputs thinking as regular text with bold headers
 * (e.g. "**Analyzing...**\n\nreasoning text\n\n\n") before the actual response.
 */
function stripThinkingBlocks(text: string): string {
  // Match one or more thinking blocks at the start of the text:
  // **Bold Title**\n\n<reasoning content>\n\n\n
  const stripped = text.replace(
    /^(?:\*\*[^*]+\*\*\s*\n\n[\s\S]*?\n\n\n)+/,
    "",
  );
  return stripped.trim() || text;
}

/**
 * Deliver an agent reply payload to a connected browser client.
 * Called from the buffered block dispatcher's `deliver` callback.
 */
export async function deliverEnsoReply(params: {
  payload: { text?: string; mediaUrl?: string; mediaUrls?: string[] };
  client: ConnectedClient;
  runId: string;
  seq: number;
  account: ResolvedEnsoAccount;
  userMessage: string;
  statusSink?: (patch: { lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { payload, client, runId, seq, account, userMessage, statusSink } = params;
  const text = stripThinkingBlocks(payload.text ?? "");
  console.log(`[enso:outbound] deliverEnsoReply called, seq=${seq}, textLen=${text.length}`);

  // Collect media URLs from payload, converting local paths to HTTP URLs
  const mediaUrls: string[] = [];
  if (payload.mediaUrls) mediaUrls.push(...payload.mediaUrls.map(toMediaUrl));
  if (payload.mediaUrl) {
    const url = toMediaUrl(payload.mediaUrl);
    if (!mediaUrls.includes(url)) mediaUrls.push(url);
  }

  if (!text.trim() && mediaUrls.length === 0) {
    return;
  }

  let data: unknown = undefined;
  let generatedUI: string | undefined;

  // Path 1: Try to detect structured JSON data in the response
  const structuredData = extractStructuredData(text);

  if (structuredData) {
    const uiResult = await serverGenerateUI({
      data: structuredData,
      userMessage,
      assistantText: text,
      geminiApiKey: account.geminiApiKey,
    });
    data = structuredData;
    generatedUI = uiResult.code;
  } else if (text.trim().length >= 100) {
    // Let the LLM decide whether this response warrants rich UI
    const textResult = await serverGenerateUIFromText({
      userMessage,
      assistantText: text,
      geminiApiKey: account.geminiApiKey,
    });
    if (textResult) {
      data = textResult.data;
      generatedUI = textResult.code;
    }
  }

  const msg: ServerMessage = {
    id: randomUUID(),
    runId,
    sessionKey: client.sessionKey,
    seq,
    state: "final",
    text,
    data: data ?? undefined,
    generatedUI,
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    timestamp: Date.now(),
  };

  client.send(msg);
  statusSink?.({ lastOutboundAt: Date.now() });
}

/**
 * Outbound sendText/sendMedia handler for the channel plugin's outbound adapter.
 * Used when OpenClaw delivers agent responses or sends messages via `openclaw send`.
 */
export async function deliverToEnso(ctx: {
  cfg?: unknown;
  to: string;
  text: string;
  mediaUrl?: string;
  accountId?: string | null;
}): Promise<{ channel: string; messageId: string; target: string }> {
  const { getClientsBySession, getClientsByPeerId, getAllClients } = await import("./server.js");

  let targets = getClientsBySession(ctx.to);
  if (targets.length === 0) {
    targets = getClientsByPeerId(ctx.to);
  }
  if (targets.length === 0) {
    targets = getAllClients();
  }

  const messageId = randomUUID();
  const text = stripThinkingBlocks(ctx.text ?? "");
  console.log(`[enso:outbound] deliverToEnso called, to=${ctx.to}, textLen=${text.length}, targets=${targets.length}, mediaUrl=${ctx.mediaUrl ?? "none"}, keys=${Object.keys(ctx).join(",")}`);

  let data: unknown = undefined;
  let generatedUI: string | undefined;

  // Resolve Gemini API key for UI generation
  const accountId = ctx.accountId ?? "default";
  const account = resolveEnsoAccount({
    cfg: (ctx.cfg ?? {}) as CoreConfig,
    accountId,
  });
  const geminiApiKey = account?.geminiApiKey;

  if (text.trim().length >= 100) {
    const structuredData = extractStructuredData(text);
    if (structuredData) {
      const uiResult = await serverGenerateUI({
        data: structuredData,
        userMessage: "",
        assistantText: text,
        geminiApiKey,
      });
      data = structuredData;
      generatedUI = uiResult.code;
    } else {
      const textResult = await serverGenerateUIFromText({
        userMessage: "",
        assistantText: text,
        geminiApiKey,
      });
      if (textResult) {
        data = textResult.data;
        generatedUI = textResult.code;
      }
    }
  }

  const mediaUrls = ctx.mediaUrl ? [toMediaUrl(ctx.mediaUrl)] : undefined;

  const msg: ServerMessage = {
    id: messageId,
    runId: randomUUID(),
    sessionKey: ctx.to,
    seq: 0,
    state: "final",
    text,
    data: data ?? undefined,
    generatedUI,
    mediaUrls,
    timestamp: Date.now(),
  };

  for (const client of targets) {
    client.send(msg);
  }

  return { channel: "enso", messageId, target: ctx.to };
}

/**
 * Try to extract structured JSON data from agent response text.
 */
function extractStructuredData(text: string): unknown | null {
  const jsonBlockMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1]);
    } catch {
      // Not valid JSON
    }
  }

  const bareJsonMatch = text.match(/^(\{[\s\S]*\})$/m);
  if (bareJsonMatch) {
    try {
      const parsed = JSON.parse(bareJsonMatch[1]);
      if (typeof parsed === "object" && parsed !== null && Object.keys(parsed).length >= 2) {
        return parsed;
      }
    } catch {
      // Not valid JSON
    }
  }

  return null;
}
