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
import { getAllLocalTools, executeLocalTool } from "./tool-registry-local.js";
import { getMemoryContext, appendDailyMemory } from "./memory-bridge.js";
import { geminiUrl, LLM_DEFAULT_TIMEOUT_MS } from "./config.js";

// ── Conversation history (in-memory, per session) ──

interface ConversationEntry {
  role: "user" | "model";
  parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }>;
}

const sessionHistories = new Map<string, ConversationEntry[]>();
const MAX_HISTORY = 40; // Keep last N turns per session

function getSessionHistory(sessionKey: string): ConversationEntry[] {
  let history = sessionHistories.get(sessionKey);
  if (!history) {
    history = [];
    sessionHistories.set(sessionKey, history);
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

## Guidelines
- Be concise but thorough
- When a tool can provide better data than your knowledge, prefer the tool
- Always explain your findings after calling a tool
- If a tool call fails, explain the error and try an alternative approach`;
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

function toolToFunctionDeclaration(tool: EnsoAgentTool): GeminiFunctionDeclaration {
  // Clone parameters and ensure valid JSON Schema for Gemini
  const params = { ...tool.parameters };
  // Gemini requires "type": "object" at the top level
  if (!params.type) params.type = "object";
  return {
    name: tool.name,
    description: tool.description,
    parameters: params,
  };
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

  logAction({ ts: Date.now(), type: "action", category: "standalone-agent", message: `Chat: ${rawBody.slice(0, 100)}`, cardId: stableCardId });
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
      payload: { text: "No Gemini API key configured. Please set GEMINI_API_KEY in your .env file or select a different chat model in Settings." },
      client,
      runId,
      seq: 0,
      account,
      userMessage: rawBody,
      targetCardId,
      cardId: stableCardId,
      statusSink,
    });
    return;
  }

  const tools = getAllLocalTools();
  const systemPrompt = buildSystemPrompt(tools);
  const functionDeclarations = tools.map(toolToFunctionDeclaration);

  const history = getSessionHistory(sessionKey);
  history.push({ role: "user", parts: [{ text: rawBody }] });

  const toolMeta = routing ? { toolId: routing.toolId, toolSessionId: routing.toolSessionId } : undefined;

  try {
    let finalText = "";
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

        history.push({ role: "model", parts: [{ functionCall: { name, args } }] });

        let toolResult: unknown;
        try {
          const result = await executeLocalTool(name, args);
          toolResult = result ?? { success: true };
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

    await deliverEnsoReply({
      payload: { text: finalText },
      client,
      runId,
      seq: 0,
      account,
      userMessage: rawBody,
      targetCardId,
      cardId: stableCardId,
      toolMeta,
      statusSink,
    });
  } catch (err) {
    logError("standalone-agent", "Gemini agent call failed", err, { cardId: stableCardId });

    // Friendly message for common Gemini errors instead of raw API errors
    const errMsg = err instanceof Error ? err.message : String(err);
    const userFriendly = errMsg.includes("400")
      ? "I couldn't process that request. Please try rephrasing your message."
      : `An error occurred: ${errMsg}`;

    client.send({
      id: randomUUID(),
      runId,
      sessionKey,
      seq: 0,
      state: "error",
      text: userFriendly,
      timestamp: Date.now(),
    });
  }
}
