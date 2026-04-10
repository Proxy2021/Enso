/**
 * standalone-agent.ts — Chat agent for standalone mode.
 *
 * Replaces the OpenClaw agent pipeline (`inbound.ts`) when running without OpenClaw.
 * Supports multi-provider LLM via callChatLLM (respecting the user's chatModel),
 * with Gemini function-calling as a fallback for tool-use scenarios.
 */

import { randomUUID } from "crypto";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { CoreConfig, EnsoInboundMessage, ToolRouting, OperationStage } from "./types.js";
import type { EnsoRuntime, EnsoAgentTool } from "./local-types.js";
import type { ConnectedClient } from "./server.js";
import { deliverEnsoReply } from "./outbound.js";
import { isAudioFile, transcribeAudio } from "./transcribe.js";
import { logAction, logError } from "./action-log.js";
import { setLastUserMessage } from "./researcher-tools.js";
import { setTopicHint } from "./memory-bridge.js";
import { GEMINI_MODEL_FAST } from "./ui-generator.js";
import { llm } from "./llm.js";
import { getAllLocalTools, executeLocalTool, getAllLocalToolNames } from "./tool-registry-local.js";
import { getUserProfileContext, appendDailyMemory, loadCardHistory } from "./memory-bridge.js";
import type { CardRecord } from "./memory-bridge.js";
import { geminiUrl, LLM_DEFAULT_TIMEOUT_MS } from "./config.js";
import { recordToolCall } from "./native-tools/tool-call-store.js";
import { maybeCompactHistory, forceCompactHistory } from "./conversation-compactor.js";

// ── Conversation history (in-memory, per conversation thread) ──

export interface ConversationEntry {
  role: "user" | "model";
  parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }>;
  _meta?: { cardId?: string; conversationId?: string; ts?: number };
}

const conversationHistories = new Map<string, ConversationEntry[]>();
const MAX_HISTORY = 60; // Safety net — compaction handles the normal case at 20 entries

/**
 * Track conversations created in this server session.
 * Fresh conversations should NOT be hydrated from old journal data
 * to prevent stale context contamination (BUG-04).
 */
const freshConversationIds = new Set<string>();

export function markConversationFresh(clientId: string, conversationId: string): void {
  freshConversationIds.add(`${clientId}|${conversationId}`);
}

export function isConversationFresh(clientId: string, conversationId: string): boolean {
  return freshConversationIds.has(`${clientId}|${conversationId}`);
}

/**
 * Get or create conversation history.
 * Key is conversationId (per-thread) — NOT sessionKey (per-browser).
 * This ensures switching conversations gives the agent a clean/separate context.
 */
export function getConversationHistory(clientId: string, conversationId: string): ConversationEntry[] {
  const key = `${clientId}|${conversationId}`;
  let history = conversationHistories.get(key);
  if (!history) {
    history = [];
    conversationHistories.set(key, history);
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
 * BUG-04: Tags each injected entry with _meta for provenance tracking.
 */
export function injectCardContext(clientId: string, conversationId: string, record: CardRecord): void {
  const entry = cardToEntry(record);
  if (!entry) return;

  // BUG-04: Tag the entry with its source for provenance tracking
  entry._meta = { cardId: record.id, conversationId, ts: Date.now() };

  const history = getConversationHistory(clientId, conversationId);
  history.push(entry);
  trimHistory(history);
}

/**
 * Hydrate agent history from persisted journal on cold start.
 * Called when the in-memory history is empty (server restart or first message).
 * BUG-04: Skip hydration for conversations marked fresh in this session
 * to prevent stale context from leaking into new conversations.
 */
function hydrateFromJournal(clientId: string, conversationId: string): number {
  // BUG-04: Fresh conversations should start clean — no old journal data
  if (isConversationFresh(clientId, conversationId)) return 0;

  try {
    const records = loadCardHistory(clientId, conversationId, 20);
    if (records.length === 0) return 0;

    const history = getConversationHistory(clientId, conversationId);
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

async function buildSystemPrompt(tools: EnsoAgentTool[], conversationId?: string, userMessage?: string): Promise<string> {
  const toolDescriptions = tools
    .map((t) => `- **${t.name}**: ${t.description}`)
    .join("\n");

  // Load user profile only (NOT cross-conversation memory — that causes context contamination)
  let profileBlock = "";
  try {
    const profile = getUserProfileContext();
    if (profile) profileBlock = `\n\n## User Context\n${profile}`;
  } catch { /* ignore */ }

  // Inject daily briefing from user's desktop context (browser, email, projects)
  let briefingBlock = "";
  try {
    const { getDailyBriefing } = await import("./user-context-proactive.js");
    const briefing = getDailyBriefing();
    if (briefing) briefingBlock = `\n\n## Today's Context\n${briefing}`;
  } catch { /* user-context-proactive not available — skip */ }

  // Inject Knowledge Cortex summary — accumulated cortex knowledge about user's interests, projects, tools
  let cortexBlock = "";
  try {
    const { getCortexContextSummary } = await import("./cortex-tools.js");
    const cortex = getCortexContextSummary(1500);
    if (cortex) cortexBlock = `\n\n## Knowledge Cortex\nYour persistent knowledge base with interlinked pages about the user's interests, projects, and expertise. Organized by themes spanning multiple data sources (books, movies, games, photos, YouTube, projects). Use enso_wiki_search with source/theme filters for targeted retrieval. Use enso_cortex_synthesize(topic) for deep cross-source semantic analysis:\n${cortex}`;
  } catch { /* cortex not available — skip */ }

  // Inject topic-relevant Cortex entities based on the current user message
  let topicBlock = "";
  try {
    const { getTopicRelevantCortex } = await import("./memory-bridge.js");
    const topicCtx = await getTopicRelevantCortex();
    if (topicCtx) topicBlock = topicCtx;
  } catch { /* topic context not available — skip */ }

  // Inject focus areas — check conversation context registry first for dedicated focus conversations
  let focusBlock = "";
  try {
    if (conversationId) {
      const { contextRegistry } = await import("./conversation-context.js");
      const registryCtx = await contextRegistry.getContextForPrompt(conversationId);
      if (registryCtx) {
        focusBlock = `\n\n${registryCtx}`;
      }
    }
    // Fallback: generic focus context for regular (non-focus) chats
    if (!focusBlock) {
      const { getFocusContextForAgent } = await import("./focus-areas.js");
      const focusCtx = getFocusContextForAgent(userMessage);
      if (focusCtx) focusBlock = `\n\n${focusCtx}`;
    }
  } catch { /* focus areas not available — skip */ }

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

## Session Boundary (CRITICAL — violating this makes your responses WRONG)
This is a NEW, independent conversation. You have NO memory of any prior conversations with this user.
- Do NOT reference any project, dashboard, app, artifact, or topic from prior conversations.
- Do NOT say "as we discussed", "continuing from before", "the dashboard we built", or anything that implies prior work.
- If you see references to past topics in your context, IGNORE them — they are from a different session.
- If you have no conversation history above, this is your FIRST interaction. Treat it as such.
- NEVER mention specific artifacts (e.g. "API Monitoring Dashboard") unless the user explicitly brings them up in THIS conversation.

## Available Tools
${toolDescriptions}
${profileBlock}${cortexBlock}${topicBlock}${focusBlock}${briefingBlock}${memoryRecallBlock}

## MANDATORY Tool Use Rules
These rules override all other instructions. Violating them produces WRONG answers.

1. **You do NOT know the current time.** Any question about "what time", "current time", "time now", or time zones MUST call a time-related tool (enso_world_clock_now or enso_system_info). NEVER guess or fabricate a time.
2. **You cannot see the user's filesystem.** Any request to list, browse, open, or find files/directories MUST call enso_filesystem_list or another filesystem tool. NEVER fabricate file listings.
3. **You cannot access the internet.** Any question requiring live/current data (prices, news, weather, stocks, "what's trending", "latest") MUST call enso_researcher_search or enso_launch_task_session.
4. **Running commands vs writing code:**
   - For **simple shell commands** (npm test, npm run build, git status, ls, pwd, docker ps, etc.) — use enso_shell_execute. It's faster and cheaper.
   - For **complex tasks** that require writing code, fixing bugs, building apps, multi-step file operations, or creative work — use enso_launch_task_session to start a Claude Code session.
   - Rule of thumb: if the user's request can be fulfilled with a single terminal command, use enso_shell_execute. If it requires writing or modifying files, use enso_launch_task_session.
5. **System status queries** (CPU, memory, disk, uptime) MUST call enso_system_info.

For questions requiring **live/current data** (prices, news, weather, scores, "latest", schedules), ALWAYS call the appropriate tool — your knowledge may be outdated.
For **general knowledge** questions (translations, history, science, math, definitions, game/movie names, language questions), answer directly from your training data — do NOT call a research tool. Only use a tool when you genuinely lack the knowledge or the question demands real-time information.

## Build-First Rule
When the user asks to **create**, **build**, **make**, **generate**, or **write** something (e.g. "create a todo app", "build me a dashboard", "make a landing page"), DO NOT ask clarifying questions. Instead:
1. Immediately call enso_launch_task_session to start building with reasonable defaults.
2. Deliver a working result first, then offer to refine.
Users expect immediate action, not interviews. Ship first, iterate second.

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

/** User-facing status label for tool execution — shown as operation indicator */
function toolStatusLabel(toolName: string): string {
  if (toolName.startsWith("enso_researcher_")) return "Researching...";
  if (toolName.startsWith("enso_fs_") || toolName.startsWith("enso_filesystem_")) return "Browsing files...";
  if (toolName.startsWith("enso_media_")) return "Processing media...";
  if (toolName.startsWith("enso_browser_") || toolName.startsWith("enso_web_browser_")) return "Opening browser...";
  if (toolName.startsWith("enso_youtube_")) return "Querying YouTube...";
  if (toolName.startsWith("enso_email_")) return "Sending email...";
  if (toolName.startsWith("enso_photo_")) return "Processing photos...";
  if (toolName.startsWith("enso_video_")) return "Processing video...";
  if (toolName.startsWith("enso_screen_") || toolName.startsWith("enso_remote_")) return "Capturing screen...";
  if (toolName.startsWith("enso_system_")) return "Running system command...";
  if (toolName.startsWith("enso_shell_")) return "Executing command...";
  if (toolName.startsWith("enso_memory_")) return "Searching memory...";
  if (toolName.includes("launch_task") || toolName.includes("claude_code")) return "Launching Claude Code...";
  return "Running tool...";
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
      // Force structured function calling — without this, some Gemini models
      // output tool calls as text (e.g. $$ tool_name(...) $$) instead of
      // using the functionCall response format.
      (body as Record<string, unknown>).tool_config = {
        function_calling_config: { mode: "AUTO" },
      };
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

  // Look up if this conversation belongs to a focus area (for refinement after response)
  let activeFocusId: string | null = null;
  try {
    const { contextRegistry } = await import("./conversation-context.js");
    const provider = contextRegistry.getProvider(conversationId);
    if (provider?.type === "focus") activeFocusId = provider.sourceId;
  } catch { /* registry not available */ }

  // Hydrate from journal on cold start (server restart or first message in this conversation)
  const existingHistory = getConversationHistory(clientId, conversationId);
  if (existingHistory.length === 0 && clientId) {
    const hydrated = hydrateFromJournal(clientId, conversationId);
    if (hydrated > 0) {
      logAction({ ts: Date.now(), type: "action", category: "standalone-agent", message: `Hydrated ${hydrated} turns from journal for conv=${conversationId.slice(0, 20)}` });
    }
  }

  logAction({ ts: Date.now(), type: "action", category: "standalone-agent", message: `Chat [conv=${conversationId.slice(0, 20)}]: ${rawBody.slice(0, 100)}`, cardId: stableCardId });
  setLastUserMessage(rawBody);
  // Inject topic-relevant Cortex entities into agent context for this message
  setTopicHint(rawBody);

  // Send immediate processing indicator so the user sees feedback right away
  client.send({
    id: randomUUID(),
    runId,
    sessionKey,
    seq: 0,
    state: "delta",
    operation: { operationId: stableCardId, stage: "processing", label: "Thinking...", cancellable: true },
    targetCardId: stableCardId,
    timestamp: Date.now(),
  });

  // ── /compact command: force-compact conversation history ──
  if (rawBody === "/compact") {
    const compactHistory = getConversationHistory(clientId, conversationId);
    if (compactHistory.length < 6) {
      await deliverEnsoReply({
        payload: { text: "Conversation history is too short to compact (need at least 6 entries)." },
        client, runId, seq: 0, account, userMessage: rawBody,
        targetCardId, cardId: stableCardId, statusSink, conversationId,
      });
      return;
    }
    if (!account.geminiApiKey) {
      await deliverEnsoReply({
        payload: { text: "Compaction requires a Gemini API key." },
        client, runId, seq: 0, account, userMessage: rawBody,
        targetCardId, cardId: stableCardId, statusSink, conversationId,
      });
      return;
    }
    try {
      const oldCount = compactHistory.length;
      const summary = await forceCompactHistory(compactHistory, account.geminiApiKey);
      await deliverEnsoReply({
        payload: { text: `Compacted ${oldCount} → ${compactHistory.length} entries. Conversation context preserved.\n\n**Summary:**\n${summary}` },
        client, runId, seq: 0, account, userMessage: rawBody,
        targetCardId, cardId: stableCardId, statusSink, conversationId,
      });
    } catch (err) {
      await deliverEnsoReply({
        payload: { text: `Compaction failed: ${err instanceof Error ? err.message : String(err)}` },
        client, runId, seq: 0, account, userMessage: rawBody,
        targetCardId, cardId: stableCardId, statusSink, conversationId,
      });
    }
    return;
  }

  const userChatModel = client.chatModel;
  const isGeminiModel = !userChatModel || userChatModel.startsWith("gemini-");
  const providerKeys: Record<string, string> = {
    ...account.providerKeys,
    ...(account.geminiApiKey ? { gemini: account.geminiApiKey } : {}),
  };

  // Focus area conversations: clean dialogue mode — no tool calls, no app cards.
  // The rich focus context (state, Cortex, cross-source) is already in the system prompt.
  if (activeFocusId && account.geminiApiKey) {
    try {
      // Pass empty tools list — focus conversations are pure dialogue, no tool descriptions in prompt
      const systemPrompt = await buildSystemPrompt([], conversationId, rawBody);
      const history = getConversationHistory(clientId, conversationId);
      if (history.length === 0 && clientId) {
        const hydrated = hydrateFromJournal(clientId, conversationId);
        if (hydrated > 0) logAction({ ts: Date.now(), type: "action", category: "standalone-agent", message: `Focus chat: hydrated ${hydrated} turns` });
      }
      history.push({ role: "user", parts: [{ text: rawBody }] });

      const answer = await llm({
        prompt: rawBody,
        systemPrompt,
        tier: "utility",
      });

      history.push({ role: "model", parts: [{ text: answer }] });
      trimHistory(history);

      await deliverEnsoReply({
        payload: { text: answer },
        client, runId, seq: 0, account, userMessage: rawBody,
        targetCardId, cardId: stableCardId, statusSink, conversationId,
      });
      // Refine focus area from conversation (fire-and-forget)
      import("./focus-areas.js").then(({ refineFocusFromConversation }) => {
        refineFocusFromConversation(activeFocusId!, rawBody, answer).catch(() => {});
      }).catch(() => {});
    } catch (err) {
      logError("standalone-agent", "Focus chat LLM call failed", err, { cardId: stableCardId });
      client.send({
        id: randomUUID(), runId, sessionKey, seq: 0, state: "error",
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      });
    }
    return;
  }

  // When the user selected a non-Gemini model, route through callChatLLM
  // for a simple text response (tool calling is Gemini-only).
  if (!isGeminiModel) {
    const toolMeta = routing ? { toolId: routing.toolId, toolSessionId: routing.toolSessionId } : undefined;
    try {
      const tools = getAllLocalTools();
      const systemPrompt = await buildSystemPrompt(tools, conversationId, rawBody);
      const answer = await llm({
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
      // Refine focus area from conversation (fire-and-forget)
      if (activeFocusId) {
        import("./focus-areas.js").then(({ refineFocusFromConversation }) => {
          refineFocusFromConversation(activeFocusId!, rawBody, answer).catch(() => {});
        }).catch(() => {});
      }
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
  const systemPrompt = await buildSystemPrompt(tools, conversationId, rawBody);
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

  const history = getConversationHistory(clientId, conversationId);
  logAction({ ts: Date.now(), type: "action", category: "standalone-agent", message: `History for conv=${conversationId.slice(0, 20)}: ${history.length} turns` });
  history.push({ role: "user", parts: [{ text: rawBody }] });

  // ── BUG-03 FIX: Build intent fast path ──
  // When the user wants to build/create software, bypass Gemini tool selection
  // (which misroutes to media tools like Photo Studio) and go straight to Claude Code.
  const BUILD_INTENT = /\b(build|create|make|generate|develop|scaffold|bootstrap)\b.*\b(app|application|dashboard|website|page|site|tool|api|server|backend|frontend|project|service|bot|script|plugin|extension|component|module)\b/i;
  const BUILD_EXCLUSION = /\b(make progress|help me|what should|how do|tell me|discuss|focus on|work on)\b/i;
  if (BUILD_INTENT.test(rawBody) && !BUILD_EXCLUSION.test(rawBody)) {
    logAction({ ts: Date.now(), type: "action", category: "standalone-agent",
      message: `Build intent detected — fast-pathing to enso_launch_task_session`, cardId: stableCardId });

    const fastPathToolMeta = routing ? { toolId: routing.toolId, toolSessionId: routing.toolSessionId } : undefined;

    // Deliver interim message
    await deliverEnsoReply({
      payload: { text: "Starting a build session for your request..." },
      client, runId, seq: 0, account, userMessage: rawBody,
      targetCardId, cardId: stableCardId, toolMeta: fastPathToolMeta, statusSink, conversationId,
    });

    // Directly invoke the task session launcher
    try {
      await executeLocalTool("enso_launch_task_session", { task: rawBody },
        { clientId: client.id, getClient: () => client });
      history.push({ role: "model", parts: [{ text: `I've launched a Claude Code session to handle: ${rawBody.slice(0, 100)}` }] });
      await deliverEnsoReply({
        payload: { text: `I've launched a Claude Code session to handle your request. You'll see results streaming in shortly.` },
        client, runId, seq: 1, account, userMessage: rawBody,
        targetCardId, cardId: stableCardId, toolMeta: fastPathToolMeta, statusSink, conversationId,
      });
    } catch (err) {
      logError("standalone-agent", "Build fast-path failed", err, { cardId: stableCardId });
      await deliverEnsoReply({
        payload: { text: `I tried to start a build session but encountered an error: ${err instanceof Error ? err.message : String(err)}. Please try again.` },
        client, runId, seq: 1, account, userMessage: rawBody,
        targetCardId, cardId: stableCardId, toolMeta: fastPathToolMeta, statusSink, conversationId,
      });
    }
    return; // Skip the Gemini agent loop entirely
  }

  // ── NEW-BUG-01 FIX: Trivial shell command fast path ──
  // Short shell commands (ls, pwd, etc.) fail shouldAttemptRouting() due to length < 6
  // and Gemini doesn't reliably route them to enso_shell_execute via function calling.
  // Fast-path these directly to shell execution.
  const TRIVIAL_SHELL_PATTERNS = /^\s*(ls|dir|pwd|cd|cat|head|tail|wc|df|du|whoami|hostname|date|uptime|uname|echo|which|where|type|env|set|cls|clear)\b/i;
  if (TRIVIAL_SHELL_PATTERNS.test(rawBody.trim())) {
    logAction({ ts: Date.now(), type: "action", category: "standalone-agent",
      message: `Trivial shell command detected — fast-pathing to enso_shell_execute`, cardId: stableCardId });
    try {
      const shellResult = await executeLocalTool("enso_shell_execute", { command: rawBody.trim() },
        { clientId: client.id, getClient: () => client });
      const shellOutput = shellResult && typeof shellResult === "object" && "content" in (shellResult as Record<string, unknown>)
        ? ((shellResult as { content: Array<{ text?: string }> }).content?.[0]?.text ?? JSON.stringify(shellResult))
        : String(shellResult ?? "Command executed.");
      history.push({ role: "user", parts: [{ text: rawBody }] });
      history.push({ role: "model", parts: [{ text: shellOutput }] });
      await deliverEnsoReply({
        payload: { text: shellOutput },
        client, runId, seq: 0, account, userMessage: rawBody,
        targetCardId, cardId: stableCardId, toolMeta: { toolId: "shell" }, statusSink, conversationId,
      });
      return;
    } catch (err) {
      logError("standalone-agent", "Trivial shell fast-path failed, falling through to agent", err, { cardId: stableCardId });
      // Fall through to normal agent loop
    }
  }

  const toolMeta = routing ? { toolId: routing.toolId, toolSessionId: routing.toolSessionId } : undefined;

  // BUG-02 FIX: "Never silent" guard — track whether we delivered at least one message
  let delivered = false;
  try {
    let finalText = "";
    let deliverSeq = 0;
    let chatPrefix = "";

    // Helper: send operation status update to keep user informed
    const sendStatus = (stage: string, label: string) => {
      client.send({
        id: randomUUID(),
        runId,
        sessionKey,
        seq: 0,
        state: "delta",
        operation: { operationId: stableCardId, stage: stage as OperationStage, label, cancellable: true },
        targetCardId: stableCardId,
        timestamp: Date.now(),
      });
    };

    for (let iteration = 0; iteration < 5; iteration++) {
      // Update status based on iteration
      if (iteration === 0) {
        sendStatus("processing", "Thinking...");
      } else {
        sendStatus("processing", `Processing (step ${iteration + 1})...`);
      }

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

        // Send tool-specific status indicator
        const toolLabel = toolStatusLabel(name);
        sendStatus("calling_tool", toolLabel);

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

        // Re-send status after interim delivery so the indicator persists
        // (deliverEnsoReply sends state:"final" which can clear the indicator)
        sendStatus("calling_tool", toolLabel);

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

        // Show "Analyzing results..." while Gemini processes the tool output
        sendStatus("processing", "Analyzing results...");

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

    // Intelligent compaction: summarize older entries via LLM, fall back to dumb trim
    try {
      const compacted = await maybeCompactHistory(history, account.geminiApiKey, `${clientId}|${conversationId}`);
      if (!compacted) trimHistory(history);
    } catch {
      trimHistory(history);
    }

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
    delivered = true;

    // Refine focus area from conversation (fire-and-forget)
    if (activeFocusId) {
      import("./focus-areas.js").then(({ refineFocusFromConversation }) => {
        refineFocusFromConversation(activeFocusId!, rawBody, replyText).catch(() => {});
      }).catch(() => {});
    }
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
      delivered = true;
    } catch (sendErr) {
      logError("standalone-agent", "Failed to send error to client", sendErr, { cardId: stableCardId });
    }
  } finally {
    // BUG-02: Never-silent guarantee — if no message was delivered, send a last-resort fallback
    if (!delivered) {
      try {
        client.send({
          id: randomUUID(),
          runId,
          sessionKey,
          seq: 0,
          state: "error",
          text: "Something went wrong processing your request. Please try again.",
          timestamp: Date.now(),
        });
      } catch { /* truly unrecoverable — client gone */ }
    }
  }
}
