/**
 * standalone-agent.ts — Chat agent for standalone mode.
 *
 * Replaces the OpenClaw agent pipeline (`inbound.ts`) when running without OpenClaw.
 * Supports multi-provider LLM via callChatLLM (respecting the user's chatModel),
 * with Gemini function-calling as a fallback for tool-use scenarios.
 */

import { randomUUID } from "crypto";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { CoreConfig, EnsoInboundMessage, ToolRouting } from "./types.js";
import type { EnsoRuntime, EnsoAgentTool } from "./local-types.js";
import type { ConnectedClient } from "./server.js";
import { deliverEnsoReply } from "./outbound.js";
import { isAudioFile, transcribeAudio } from "./transcribe.js";
import { logAction, logError } from "./action-log.js";
import { setLastUserMessage } from "./researcher-tools.js";
import { GEMINI_MODEL_FAST } from "./ui-generator.js";
import { callChatLLM } from "./llm-provider.js";
import { getAllLocalTools, executeLocalTool, getAllLocalToolNames } from "./tool-registry-local.js";
import { getMemoryContext, appendDailyMemory, loadCardHistory } from "./memory-bridge.js";
import type { CardRecord } from "./memory-bridge.js";
import { geminiUrl, LLM_DEFAULT_TIMEOUT_MS } from "./config.js";
import { recordToolCall } from "./native-tools/tool-call-store.js";

// ── Conversation history (in-memory, per conversation thread) ──

interface ConversationEntry {
  role: "user" | "model";
  parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }>;
}

const conversationHistories = new Map<string, ConversationEntry[]>();
const MAX_HISTORY = 40; // Keep last N turns per conversation

/**
 * Get or create conversation history.
 * Key is conversationId (per-thread) — NOT sessionKey (per-browser).
 * This ensures switching conversations gives the agent a clean/separate context.
 */
function getConversationHistory(conversationId: string): ConversationEntry[] {
  let history = conversationHistories.get(conversationId);
  if (!history) {
    history = [];
    conversationHistories.set(conversationId, history);
  }
  return history;
}

const FLUSH_THRESHOLD = 30; // Flush when history exceeds this before trimming

function trimHistory(history: ConversationEntry[]): void {
  if (history.length > FLUSH_THRESHOLD) {
    flushOlderEntriesToMemory(history);
  }
  while (history.length > MAX_HISTORY) {
    history.shift();
  }
}

/**
 * Pre-compaction memory flush: extract key context from older history entries
 * and save to daily memory log before they're trimmed away.
 * Heuristic — no LLM call, just saves user messages that look substantive.
 */
function flushOlderEntriesToMemory(history: ConversationEntry[]): void {
  try {
    const entriesToFlush = history.slice(0, history.length - FLUSH_THRESHOLD);
    const userMessages = entriesToFlush
      .filter((e) => e.role === "user" && e.parts[0]?.text)
      .map((e) => e.parts[0].text!)
      .filter((t) => t.length > 30 && !/^(hi|hello|hey|thanks|ok|yes|no)\b/i.test(t));

    if (userMessages.length === 0) return;

    // Save a compact summary of what was discussed
    const topics = userMessages.slice(0, 5).map((m) => m.slice(0, 80)).join("; ");
    appendDailyMemory(`[session context] Topics discussed: ${topics}`);

    logAction({
      ts: Date.now(),
      type: "action",
      category: "memory-flush",
      message: `Flushed ${userMessages.length} conversation turns to daily memory`,
    });
  } catch {
    // Best effort — never fail the main flow
  }
}

// ── Card context injection (all card types → agent history) ──

const MAX_SUMMARY_LEN = 500;

function summarizeCardData(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  const parts: string[] = [];
  if (d.tool) parts.push(`tool=${d.tool}`);
  if (d.query) parts.push(`query="${String(d.query).slice(0, 80)}"`);
  if (Array.isArray(d.findings)) parts.push(`${d.findings.length} findings`);
  if (Array.isArray(d.results)) parts.push(`${d.results.length} results`);
  if (d.status) parts.push(`status=${d.status}`);
  if (d.goal) parts.push(`goal="${String(d.goal).slice(0, 80)}"`);
  return parts.join(", ");
}

function cardToEntry(record: CardRecord): ConversationEntry | null {
  const role: "user" | "model" = record.role === "user" ? "user" : "model";

  // User messages
  if (record.role === "user" && record.text) {
    return { role: "user", parts: [{ text: record.text.slice(0, MAX_SUMMARY_LEN) }] };
  }

  // Assistant chat with text
  if (record.role === "assistant" && record.text) {
    const text = record.text.slice(0, MAX_SUMMARY_LEN);

    // Tag non-chat card types so the agent knows the source
    if (record.type === "terminal" || record.toolMeta?.toolId === "claude-code") {
      return { role: "model", parts: [{ text: `[Claude Code session] ${text}` }] };
    }
    if (record.type === "shell" || record.toolMeta?.toolId === "shell") {
      return { role: "model", parts: [{ text: `[Terminal] ${text}` }] };
    }
    if (record.type === "dynamic-ui" || record.generatedUI) {
      const dataSummary = summarizeCardData(record.data);
      const label = record.cardMode?.toolFamily ?? "App";
      return { role: "model", parts: [{ text: `[${label}] ${text}${dataSummary ? ` (${dataSummary})` : ""}` }] };
    }
    if (record.type === "orchestration") {
      return { role: "model", parts: [{ text: `[Orchestration] ${text}` }] };
    }
    if (record.type === "mission") {
      return { role: "model", parts: [{ text: `[Mission] ${text}` }] };
    }

    return { role: "model", parts: [{ text }] };
  }

  // Cards with data but no text (tool results, research cards)
  if (record.role === "assistant" && record.data) {
    const dataSummary = summarizeCardData(record.data);
    if (dataSummary) {
      const label = record.cardMode?.toolFamily ?? record.type ?? "Result";
      return { role: "model", parts: [{ text: `[${label}] ${dataSummary}` }] };
    }
  }

  return null; // Skip cards with no useful content
}

/**
 * Inject a non-agent card into the conversation's in-memory history.
 * Called from server.ts after persistCard() for cards NOT created by the agent loop.
 */
export function injectCardContext(conversationId: string, record: CardRecord): void {
  const entry = cardToEntry(record);
  if (!entry) return;

  const history = getConversationHistory(conversationId);
  history.push(entry);
  trimHistory(history);
}

/**
 * Hydrate agent history from persisted journal on cold start.
 * Called when the in-memory history is empty (server restart or first message).
 */
function hydrateFromJournal(clientId: string, conversationId: string): number {
  try {
    const records = loadCardHistory(clientId, conversationId, 20);
    if (records.length === 0) return 0;

    const history = getConversationHistory(conversationId);
    let count = 0;
    for (const record of records) {
      const entry = cardToEntry(record);
      if (entry) {
        history.push(entry);
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

// ── System prompt ──

function buildSystemPrompt(tools: EnsoAgentTool[]): string {
  const toolDescriptions = tools
    .map((t) => `- **${t.name}**: ${t.description}`)
    .join("\n");

  // Load user profile (lightweight, always injected)
  let profileBlock = "";
  try {
    const mem = getMemoryContext();
    if (mem) profileBlock = `\n\n## User Context\n${mem}`;
  } catch { /* ignore */ }

  // Check if memory tools are available
  const hasMemoryTools = tools.some((t) => t.name === "enso_memory_search");
  const memoryRecallBlock = hasMemoryTools ? `

## Memory Recall
You have persistent memory across conversations stored in files. Before answering questions about
prior work, user preferences, decisions, past conversations, or anything the user might have
told you before: use enso_memory_search to check your memory files first.
If you learn new facts about the user (preferences, decisions, goals), save them with enso_memory_save.` : "";

  return `You are Enso, a helpful AI assistant that provides rich interactive answers.
You have access to tools that let you browse filesystems, manage media, search the web, take screenshots, and more.

When the user asks a question that can be enhanced with a tool call, use the appropriate tool.
When the user asks a general knowledge question, answer directly.

## Available Tools
${toolDescriptions}
${profileBlock}${memoryRecallBlock}

## MANDATORY Tool Use Rules
These rules override all other instructions. Violating them produces WRONG answers.

1. **You do NOT know the current time.** Any question about "what time", "current time", "time now", or time zones MUST call a time-related tool (enso_world_clock_now or enso_system_info). NEVER guess or fabricate a time.
2. **You cannot see the user's filesystem.** Any request to list, browse, open, or find files/directories MUST call enso_filesystem_list or another filesystem tool. NEVER fabricate file listings.
3. **You cannot access the internet.** Any question requiring live/current data (prices, news, weather, stocks, "what's trending", "latest") MUST call enso_researcher_search or enso_launch_task_session.
4. **You cannot run code.** Any request to write, fix, build, deploy, or execute code MUST call enso_launch_task_session to start a Claude Code session.
5. **System status queries** (CPU, memory, disk, uptime) MUST call enso_system_info.

If a tool exists for the task, ALWAYS call it — even if you think you know the answer. Your knowledge is outdated; tools provide real-time truth.

## Guidelines
- Be concise but thorough
- **Before calling any tool**, write one or two short sentences to the user about what you are doing. That text is shown in chat immediately while the tool runs (users otherwise see an empty card for a long time).
- Always explain your findings after calling a tool
- If a tool call fails, explain the error and try an alternative approach`;
}

/** Shown immediately when the model issues a tool-only turn (no accompanying text). */
function interimMessageForTool(toolName: string): string {
  if (toolName.startsWith("enso_researcher_")) {
    return "I'm searching the web and gathering sources — the interactive research board usually fills in within about 30–60 seconds. I'll add a written summary here when it's ready.";
  }
  if (toolName.startsWith("enso_filesystem_") || toolName.startsWith("enso_media_")) {
    return "Pulling that from your workspace now…";
  }
  if (toolName.startsWith("enso_web_browser_") || toolName.startsWith("enso_browser_")) {
    return "Opening the browser tool to fetch live page data…";
  }
  return "Running a tool to get accurate, up-to-date results — one moment.";
}

// ── Gemini function-calling API ──

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

interface GeminiRequest {
  system_instruction?: { parts: Array<{ text: string }> };
  contents: Array<{
    role: string;
    parts: Array<{
      text?: string;
      functionCall?: { name: string; args: Record<string, unknown> };
      functionResponse?: { name: string; response: unknown };
    }>;
  }>;
  tools?: Array<{ function_declarations: GeminiFunctionDeclaration[] }>;
  generationConfig?: Record<string, unknown>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: { name: string; args: Record<string, unknown> };
      }>;
    };
    finishReason?: string;
  }>;
}

async function callGeminiWithTools(params: {
  apiKey: string;
  systemPrompt: string;
  history: ConversationEntry[];
  tools: GeminiFunctionDeclaration[];
  model?: string;
  timeoutMs?: number;
}): Promise<GeminiResponse> {
  const model = params.model ?? GEMINI_MODEL_FAST;
  const timeoutMs = params.timeoutMs ?? LLM_DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body: GeminiRequest = {
      system_instruction: { parts: [{ text: params.systemPrompt }] },
      contents: params.history.map((entry) => ({
        role: entry.role,
        parts: entry.parts,
      })),
      generationConfig: { maxOutputTokens: 8192 },
    };

    // Only include tools if we have function declarations
    if (params.tools.length > 0) {
      body.tools = [{ function_declarations: params.tools }];
    }

    const response = await fetch(
      geminiUrl(model, params.apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      logError("standalone-agent", `Gemini API error: ${response.status}`, errText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    return (await response.json()) as GeminiResponse;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`Gemini API timeout after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Convert EnsoAgentTool to Gemini function declaration ──

/** Recursively strip fields that Gemini's API doesn't support (e.g. additionalProperties). */
function stripUnsupportedSchemaFields(obj: Record<string, unknown>): Record<string, unknown> {
  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "additionalProperties") continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      clone[key] = stripUnsupportedSchemaFields(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      clone[key] = value.map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? stripUnsupportedSchemaFields(item as Record<string, unknown>)
          : item,
      );
    } else {
      clone[key] = value;
    }
  }
  return clone;
}

function toolToFunctionDeclaration(tool: EnsoAgentTool): GeminiFunctionDeclaration {
  // Clone parameters, strip Gemini-unsupported fields, ensure valid schema
  const params = stripUnsupportedSchemaFields(tool.parameters as Record<string, unknown>);
  // Gemini requires "type": "object" at the top level
  if (!params.type) params.type = "object";
  return {
    name: tool.name,
    description: tool.description,
    parameters: params,
  };
}

/**
 * Validate a Gemini function declaration before submission.
 * Returns null if valid, or an error description if invalid.
 */
function validateFunctionDeclaration(decl: GeminiFunctionDeclaration): string | null {
  try {
    const params = decl.parameters as Record<string, unknown>;
    if (!params || typeof params !== "object") return null;

    function checkProperties(obj: Record<string, unknown>, path: string): string | null {
      const props = obj.properties as Record<string, Record<string, unknown>> | undefined;
      if (!props) return null;
      for (const [key, prop] of Object.entries(props)) {
        if (prop.type === "array" && !prop.items) {
          return `${path}.${key}: array type missing "items" field`;
        }
        if (prop.type === "object" && prop.properties) {
          const nested = checkProperties(prop as Record<string, unknown>, `${path}.${key}`);
          if (nested) return nested;
        }
        if (prop.type === "array" && prop.items && typeof prop.items === "object") {
          const itemObj = prop.items as Record<string, unknown>;
          if (itemObj.type === "object" && itemObj.properties) {
            const nested = checkProperties(itemObj as Record<string, unknown>, `${path}.${key}.items`);
            if (nested) return nested;
          }
        }
      }
      return null;
    }

    return checkProperties(params, decl.name);
  } catch {
    return `${decl.name}: validation threw an exception`;
  }
}

// ── Main handler ──

export async function handleStandaloneInbound(params: {
  message: EnsoInboundMessage;
  account: ResolvedEnsoAccount;
  config: CoreConfig;
  runtime: EnsoRuntime;
  client: ConnectedClient;
  routing?: ToolRouting;
  targetCardId?: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { message, account, runtime, client, routing, targetCardId, statusSink } = params;

  let rawBody = (message.text ?? "")
    .replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u2028\u2029]/g, "")
    .trim();
  const mediaUrls = message.mediaUrls ?? [];
  if (!rawBody && mediaUrls.length === 0) return;

  // Transcribe audio attachments
  if (account.geminiApiKey && mediaUrls.length > 0) {
    const audioFiles = mediaUrls.filter(isAudioFile);
    if (audioFiles.length > 0) {
      const transcripts = await Promise.all(
        audioFiles.map((filePath) =>
          transcribeAudio({ filePath, geminiApiKey: account.geminiApiKey! }).catch(() => null),
        ),
      );
      const valid = transcripts.filter((t): t is string => t !== null);
      if (valid.length > 0) {
        const block = valid
          .map((t, i) => audioFiles.length > 1 ? `[Audio Transcript ${i + 1}]: ${t}` : `[Audio Transcript]: ${t}`)
          .join("\n\n");
        rawBody = rawBody ? `${block}\n\n${rawBody}` : block;
      }
    }
  }

  statusSink?.({ lastInboundAt: message.timestamp });

  const runId = randomUUID();
  const stableCardId = targetCardId ?? randomUUID();
  const sessionKey = client.sessionKey;
  const conversationId = message.conversationId ?? "default";
  const clientId = message.clientId;

  // Hydrate from journal on cold start (server restart or first message in this conversation)
  const existingHistory = getConversationHistory(conversationId);
  if (existingHistory.length === 0 && clientId) {
    const hydrated = hydrateFromJournal(clientId, conversationId);
    if (hydrated > 0) {
      logAction({ ts: Date.now(), type: "action", category: "standalone-agent", message: `Hydrated ${hydrated} turns from journal for conv=${conversationId.slice(0, 20)}` });
    }
  }

  logAction({ ts: Date.now(), type: "action", category: "standalone-agent", message: `Chat [conv=${conversationId.slice(0, 20)}]: ${rawBody.slice(0, 100)}`, cardId: stableCardId });
  setLastUserMessage(rawBody);

  const userChatModel = client.chatModel;
  const isGeminiModel = !userChatModel || userChatModel.startsWith("gemini-");
  const providerKeys: Record<string, string> = {
    ...account.providerKeys,
    ...(account.geminiApiKey ? { gemini: account.geminiApiKey } : {}),
  };

  // When the user selected a non-Gemini model, route through callChatLLM
  // for a simple text response (tool calling is Gemini-only).
  if (!isGeminiModel) {
    const toolMeta = routing ? { toolId: routing.toolId, toolSessionId: routing.toolSessionId } : undefined;
    try {
      const tools = getAllLocalTools();
      const systemPrompt = buildSystemPrompt(tools);
      const answer = await callChatLLM({
        prompt: rawBody,
        systemPrompt,
        model: userChatModel,
        providerKeys,
      });
      await deliverEnsoReply({
        payload: { text: answer },
        client,
        runId,
        seq: 0,
        account,
        userMessage: rawBody,
        targetCardId,
        cardId: stableCardId,
        toolMeta,
        statusSink,
        conversationId,
      });
    } catch (err) {
      logError("standalone-agent", `callChatLLM failed for ${userChatModel}`, err, { cardId: stableCardId });
      client.send({
        id: randomUUID(),
        runId,
        sessionKey,
        seq: 0,
        state: "error",
        text: `Error from ${userChatModel}: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      });
    }
    return;
  }

  // Gemini path: function-calling agent loop
  if (!account.geminiApiKey) {
    await deliverEnsoReply({
      payload: { text: "No Gemini API key configured. Set it in Settings or in ~/.enso/api-keys.json." },
      client,
      runId,
      seq: 0,
      account,
      userMessage: rawBody,
      targetCardId,
      cardId: stableCardId,
      statusSink,
      conversationId,
    });
    return;
  }

  const allTools = getAllLocalTools();
  // Gemini 2.5 Flash can handle up to ~100 function declarations before returning empty responses.
  // Include all system tools (registered via registerLocalTool — media, filesystem, video, etc.)
  // and use family-first dedup only for dynamic app tools to keep count manageable.
  const registeredNames = new Set(getAllLocalToolNames());
  const tools = (() => {
    const selected: EnsoAgentTool[] = [];
    const seenDynamicFamilies = new Set<string>();
    for (const t of allTools) {
      // System tools (registered in local registry): include all
      // This ensures media, photo, video, AI, and other built-in tools are always visible
      if (registeredNames.has(t.name)) {
        selected.push(t);
        continue;
      }
      // Dynamic app tools (user-built): include first tool per family to control count
      const parts = t.name.split("_");
      const family = parts.length >= 3 ? parts.slice(0, -1).join("_") : t.name;
      if (!seenDynamicFamilies.has(family)) {
        seenDynamicFamilies.add(family);
        selected.push(t);
      }
    }
    return selected;
  })();
  const systemPrompt = buildSystemPrompt(tools);
  const allDeclarations = tools.map(toolToFunctionDeclaration);
  const functionDeclarations: GeminiFunctionDeclaration[] = [];
  const skippedTools: string[] = [];

  for (const decl of allDeclarations) {
    const error = validateFunctionDeclaration(decl);
    if (error) {
      skippedTools.push(error);
      logError("standalone-agent", `Skipping invalid tool schema: ${error}`);
    } else {
      functionDeclarations.push(decl);
    }
  }

  if (skippedTools.length > 0) {
    logAction({ ts: Date.now(), type: "action", category: "standalone-agent",
      message: `Skipped ${skippedTools.length} invalid tool schemas: ${skippedTools.join("; ")}`,
      cardId: stableCardId });
  }
  logAction({ ts: Date.now(), type: "action", category: "standalone-agent", message: `Sending ${functionDeclarations.length} tools to Gemini (filtered from ${allTools.length}, ${skippedTools.length} invalid skipped)`, cardId: stableCardId });

  const history = getConversationHistory(conversationId);
  logAction({ ts: Date.now(), type: "action", category: "standalone-agent", message: `History for conv=${conversationId.slice(0, 20)}: ${history.length} turns` });
  history.push({ role: "user", parts: [{ text: rawBody }] });

  const toolMeta = routing ? { toolId: routing.toolId, toolSessionId: routing.toolSessionId } : undefined;

  try {
    let finalText = "";
    let deliverSeq = 0;
    let chatPrefix = "";

    for (let iteration = 0; iteration < 5; iteration++) {
      const response = await callGeminiWithTools({
        apiKey: account.geminiApiKey,
        systemPrompt,
        history,
        tools: functionDeclarations,
      });

      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      const functionCallPart = parts.find((p) => p.functionCall);
      const textPart = parts.find((p) => p.text);

      if (functionCallPart?.functionCall) {
        const { name, args } = functionCallPart.functionCall;
        logAction({ ts: Date.now(), type: "action", category: "standalone-agent", message: `Tool call: ${name}`, cardId: stableCardId });

        const modelPartsForHistory = parts.filter((p) => p.text || p.functionCall);
        history.push({
          role: "model",
          parts: modelPartsForHistory.length > 0 ? modelPartsForHistory : [{ functionCall: { name, args } }],
        });

        const modelBlurb = textPart?.text?.trim() ?? "";
        const chunk = modelBlurb || interimMessageForTool(name);
        chatPrefix = chatPrefix ? `${chatPrefix}\n\n${chunk}` : chunk;

        await deliverEnsoReply({
          payload: { text: chatPrefix },
          client,
          runId,
          seq: deliverSeq++,
          account,
          userMessage: rawBody,
          targetCardId,
          cardId: stableCardId,
          toolMeta,
          statusSink,
          conversationId,
        });

        let toolResult: unknown;
        try {
          const result = await executeLocalTool(name, args, { clientId: client.id, getClient: () => client });
          toolResult = result ?? { success: true };
          // Record the tool call so auto-enhance can render the app UI
          recordToolCall({ toolName: name, params: args, result: toolResult, timestamp: Date.now() });
        } catch (err) {
          toolResult = { error: String(err) };
          logError("standalone-agent", `Tool ${name} failed`, err, { cardId: stableCardId });
        }

        history.push({
          role: "user",
          parts: [{ functionResponse: { name, response: toolResult } }],
        });

        continue;
      }

      finalText = textPart?.text ?? "";
      history.push({ role: "model", parts: [{ text: finalText }] });
      break;
    }

    trimHistory(history);

    const combined =
      chatPrefix && finalText.trim()
        ? `${chatPrefix}\n\n${finalText}`
        : chatPrefix || finalText;

    // Fallback: ensure the user always gets a response (never silent)
    const replyText = combined.trim()
      ? combined
      : "I wasn't able to process that request. Could you try rephrasing or being more specific?";

    await deliverEnsoReply({
      payload: { text: replyText },
      client,
      runId,
      seq: deliverSeq,
      account,
      userMessage: rawBody,
      targetCardId,
      cardId: stableCardId,
      toolMeta,
      statusSink,
      conversationId,
    });
  } catch (err) {
    logError("standalone-agent", "Gemini agent call failed", err, { cardId: stableCardId });

    // Friendly message for common Gemini errors instead of raw API errors
    const errMsg = err instanceof Error ? err.message : String(err);
    const userFriendly = errMsg.includes("SAFETY")
      ? "I can't help with that request due to safety guidelines. Please try a different topic."
      : errMsg.includes("400") || errMsg.includes("500") || errMsg.includes("503") || errMsg.includes("429")
      ? "A temporary service error occurred. Please try again in a moment."
      : `An error occurred: ${errMsg}`;

    try {
      client.send({
        id: randomUUID(),
        runId,
        sessionKey,
        seq: 0,
        state: "error",
        text: userFriendly,
        timestamp: Date.now(),
      });
    } catch (sendErr) {
      logError("standalone-agent", "Failed to send error to client", sendErr, { cardId: stableCardId });
    }
  }
}
