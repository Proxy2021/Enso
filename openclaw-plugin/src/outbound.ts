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

// ── Card Interaction Context ──

interface CardContext {
  cardId: string;
  originalPrompt: string;
  originalResponse: string;
  currentData: unknown;
  geminiApiKey?: string;
  account: ResolvedEnsoAccount;
  actionHistory: Array<{
    action: string;
    payload: unknown;
    timestamp: number;
  }>;
}

const cardContexts = new Map<string, CardContext>();

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
  targetCardId?: string;
  statusSink?: (patch: { lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { payload, client, runId, seq, account, userMessage, targetCardId, statusSink } = params;
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

  const msgId = targetCardId ?? randomUUID();

  // Register card context for interactive actions
  if (data && generatedUI && !targetCardId) {
    cardContexts.set(msgId, {
      cardId: msgId,
      originalPrompt: userMessage,
      originalResponse: text,
      currentData: structuredClone(data),
      geminiApiKey: account.geminiApiKey,
      account,
      actionHistory: [],
    });
  }

  // When targeting an existing card, update its context
  if (targetCardId) {
    const existingCtx = cardContexts.get(targetCardId);
    if (existingCtx) {
      existingCtx.originalResponse = text;
      if (data) existingCtx.currentData = structuredClone(data);
    }
  }

  const msg: ServerMessage = {
    id: msgId,
    runId,
    sessionKey: client.sessionKey,
    seq,
    state: "final",
    text,
    data: data ?? undefined,
    generatedUI,
    mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    ...(targetCardId ? { targetCardId } : {}),
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

  // Register card context for interactive actions
  if (data && generatedUI && account) {
    cardContexts.set(messageId, {
      cardId: messageId,
      originalPrompt: "",
      originalResponse: text,
      currentData: structuredClone(data),
      geminiApiKey,
      account,
      actionHistory: [],
    });
  }

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

// ── Card Action Processing ──

/**
 * Processes an interactive action on an existing card (plugin path).
 * Applies mechanical data mutations, regenerates UI via Gemini,
 * and sends the update back targeted to the same card.
 */
export async function handlePluginCardAction(params: {
  cardId: string;
  action: string;
  payload: unknown;
  client: ConnectedClient;
  config: CoreConfig;
  runtime: RuntimeEnv;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { cardId, action, payload, client, config, runtime, statusSink } = params;
  const ctx = cardContexts.get(cardId);
  if (!ctx) {
    client.send({
      id: randomUUID(),
      runId: randomUUID(),
      sessionKey: client.sessionKey,
      seq: 0,
      state: "error",
      targetCardId: cardId,
      text: "Card context not found — the server may have restarted.",
      timestamp: Date.now(),
    });
    return;
  }

  // Record action in history
  ctx.actionHistory.push({ action, payload, timestamp: Date.now() });

  // Try mechanical data mutation first
  const updatedData = applyAction(ctx.currentData, action, payload);
  const dataChanged = updatedData !== ctx.currentData;

  if (dataChanged) {
    // Mechanical mutation succeeded — regenerate UI with updated data
    ctx.currentData = updatedData;

    const uiResult = await serverGenerateUI({
      data: updatedData,
      userMessage: `${ctx.originalPrompt} [Action: ${action}${payload ? ` ${JSON.stringify(payload)}` : ""}]`,
      assistantText: ctx.originalResponse,
      geminiApiKey: ctx.geminiApiKey,
    });

    console.log(
      `[enso:outbound] Card action (mechanical): cardId=${cardId} action=${action} shape=${uiResult.shapeKey}`,
    );

    client.send({
      id: randomUUID(),
      runId: randomUUID(),
      sessionKey: client.sessionKey,
      seq: 0,
      state: "final",
      targetCardId: cardId,
      data: updatedData,
      generatedUI: uiResult.code,
      timestamp: Date.now(),
    });
    return;
  }

  // No mechanical handler matched — route through OpenClaw agent.
  // The agent response will be delivered back to this card via targetCardId.
  const p = (payload ?? {}) as Record<string, unknown>;
  let actionMessage: string;

  if (action === "send_message" && typeof p.text === "string") {
    // Redirected sendMessage call — use the text directly as the query,
    // with card context so the agent can provide a relevant follow-up.
    actionMessage = `${p.text}\n\nContext: The user is viewing a card from the prompt "${ctx.originalPrompt}". The card shows: ${JSON.stringify(ctx.currentData).slice(0, 500)}.`;
  } else {
    const payloadStr = payload ? ` ${JSON.stringify(payload)}` : "";
    actionMessage = `[Card action: ${action}${payloadStr}] Context: The user is viewing a card that was created from the prompt "${ctx.originalPrompt}". The card shows: ${JSON.stringify(ctx.currentData).slice(0, 500)}. The user clicked: ${action}${payloadStr}. Respond with updated or detailed information based on this action.`;
  }

  console.log(
    `[enso:outbound] Card action (agent): cardId=${cardId} action=${action} → routing to OpenClaw agent`,
  );

  const { handleEnsoInbound } = await import("./inbound.js");
  await handleEnsoInbound({
    message: {
      messageId: randomUUID(),
      sessionId: client.sessionKey,
      senderNick: `user_${client.id}`,
      text: actionMessage,
      timestamp: Date.now(),
    },
    account: ctx.account,
    config,
    runtime,
    client,
    targetCardId: cardId,
    statusSink,
  });
}

// ── Mechanical Action Handlers ──

function applyAction(data: unknown, action: string, payload: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;

  // Task board (has "columns" array) — only clone for known task actions
  if (Array.isArray(d.columns)) {
    switch (action) {
      case "complete_task":
      case "move_task":
      case "delete_task":
      case "add_task":
        return applyTaskAction(structuredClone(d) as TaskBoardData, action, payload);
    }
  }

  // Sales dashboard (has "quarters" array) — only clone for known sales actions
  if (Array.isArray(d.quarters)) {
    switch (action) {
      case "sort_by":
      case "filter":
        return applySalesAction(structuredClone(d) as SalesData, action, payload);
    }
  }

  // Unknown action — return original reference so dataChanged === false,
  // allowing the agent-routed fallback to handle it.
  return data;
}

interface TaskItem { id: number; title: string; priority: string; assignee: string }
interface TaskColumn { name: string; tasks: TaskItem[] }
interface TaskBoardData { projectName: string; columns: TaskColumn[]; [key: string]: unknown }

function applyTaskAction(data: TaskBoardData, action: string, payload: unknown): TaskBoardData {
  const p = (payload ?? {}) as Record<string, unknown>;

  switch (action) {
    case "complete_task": {
      const taskId = p.taskId as number | undefined;
      if (taskId == null) return data;
      let task: TaskItem | undefined;
      for (const col of data.columns) {
        const idx = col.tasks.findIndex((t) => t.id === taskId);
        if (idx !== -1) { task = col.tasks.splice(idx, 1)[0]; break; }
      }
      if (task) {
        let doneCol = data.columns.find((c) => c.name === "Done");
        if (!doneCol) { doneCol = { name: "Done", tasks: [] }; data.columns.push(doneCol); }
        doneCol.tasks.push(task);
      }
      return data;
    }
    case "move_task": {
      const taskId = p.taskId as number | undefined;
      const targetColumn = p.targetColumn as string | undefined;
      if (taskId == null || !targetColumn) return data;
      let task: TaskItem | undefined;
      for (const col of data.columns) {
        const idx = col.tasks.findIndex((t) => t.id === taskId);
        if (idx !== -1) { task = col.tasks.splice(idx, 1)[0]; break; }
      }
      if (task) {
        let target = data.columns.find((c) => c.name === targetColumn);
        if (!target) { target = { name: targetColumn, tasks: [] }; data.columns.push(target); }
        target.tasks.push(task);
      }
      return data;
    }
    case "delete_task": {
      const taskId = p.taskId as number | undefined;
      if (taskId == null) return data;
      for (const col of data.columns) {
        const idx = col.tasks.findIndex((t) => t.id === taskId);
        if (idx !== -1) { col.tasks.splice(idx, 1); break; }
      }
      return data;
    }
    case "add_task": {
      const title = p.title as string | undefined;
      const column = (p.column as string) ?? "To Do";
      const priority = (p.priority as string) ?? "medium";
      const assignee = (p.assignee as string) ?? "Unassigned";
      if (!title) return data;
      const maxId = data.columns.flatMap((c) => c.tasks).reduce((max, t) => Math.max(max, t.id), 0);
      let target = data.columns.find((c) => c.name === column);
      if (!target) { target = { name: column, tasks: [] }; data.columns.push(target); }
      target.tasks.push({ id: maxId + 1, title, priority, assignee });
      return data;
    }
    default:
      return data;
  }
}

interface QuarterData { quarter: string; revenue: number; deals: number }
interface SalesData { quarters: QuarterData[]; [key: string]: unknown }

function applySalesAction(data: SalesData, action: string, payload: unknown): SalesData {
  const p = (payload ?? {}) as Record<string, unknown>;

  switch (action) {
    case "sort_by": {
      const field = (p.field as keyof QuarterData) ?? "revenue";
      const dir = (p.direction as string) ?? "desc";
      data.quarters.sort((a, b) => {
        const av = a[field] as number;
        const bv = b[field] as number;
        return dir === "asc" ? av - bv : bv - av;
      });
      return data;
    }
    case "filter": {
      const minRevenue = p.minRevenue as number | undefined;
      if (minRevenue != null) {
        data.quarters = data.quarters.filter((q) => q.revenue >= minRevenue);
      }
      return data;
    }
    default:
      return data;
  }
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
