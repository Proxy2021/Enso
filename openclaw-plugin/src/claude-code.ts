import { query } from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { ConnectedClient } from "./server.js";
import type { ServerMessage, ToolQuestion } from "./types.js";

const activeAbortControllers = new Map<string, AbortController>();
const activeTasks = new Map<string, string>(); // taskId → description

export function cancelClaudeCodeRun(runId: string): boolean {
  const ac = activeAbortControllers.get(runId);
  if (!ac) return false;
  ac.abort();
  return true;
}

// ── Tool label helpers ──

const TOOL_LABELS: Record<string, string> = {
  Read: "Reading",
  Edit: "Editing",
  Write: "Writing",
  Bash: "Running command",
  Grep: "Searching",
  Glob: "Finding files",
  Agent: "Running agent",
  WebSearch: "Searching web",
  WebFetch: "Fetching page",
  NotebookEdit: "Editing notebook",
  TodoWrite: "Writing todos",
  AskUserQuestion: "Asking question",
};

function humanToolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

/**
 * Best-effort extraction of a short detail string from partial JSON.
 * We look for common parameter names (file_path, command, pattern, query, url).
 */
function extractToolDetail(name: string, partialJson: string): string | null {
  // Try file_path first (Read, Edit, Write, Glob)
  const fpMatch = partialJson.match(/"file_path"\s*:\s*"([^"]+)"/);
  if (fpMatch) {
    // Return just the filename, not the full path
    const parts = fpMatch[1].replace(/\\/g, "/").split("/");
    return parts[parts.length - 1];
  }

  // command (Bash)
  const cmdMatch = partialJson.match(/"command"\s*:\s*"([^"]{1,60})/);
  if (cmdMatch) return cmdMatch[1].length >= 60 ? cmdMatch[1] + "..." : cmdMatch[1];

  // pattern (Grep, Glob)
  const patMatch = partialJson.match(/"pattern"\s*:\s*"([^"]{1,40})/);
  if (patMatch) return patMatch[1];

  // query (WebSearch)
  const qMatch = partialJson.match(/"query"\s*:\s*"([^"]{1,40})/);
  if (qMatch) return qMatch[1];

  // url (WebFetch)
  const urlMatch = partialJson.match(/"url"\s*:\s*"([^"]{1,60})/);
  if (urlMatch) return urlMatch[1];

  // description (Agent)
  const descMatch = partialJson.match(/"description"\s*:\s*"([^"]{1,40})/);
  if (descMatch) return descMatch[1];

  return null;
}

/**
 * Directly invoke the Claude Code CLI via the Agent SDK, streaming results
 * back to the browser client via WebSocket. Bypasses OpenClaw entirely —
 * no agent pipeline, no middleware, just SDK → WS.
 *
 * Emits inline markers for tool activity and cost:
 *   \u200B[tool:Read:server.ts]     — tool completed
 *   \u200B[cost:$0.0234|3 turns|12.5s] — session cost summary
 */
export async function runClaudeCode(params: {
  prompt: string;
  cwd?: string;
  toolSessionId?: string;
  client: ConnectedClient;
  runId: string;
  targetCardId?: string;
}): Promise<{ sessionId: string }> {
  const { prompt: rawPrompt, cwd, toolSessionId, client, runId, targetCardId } = params;

  if (!rawPrompt.trim()) {
    return { sessionId: toolSessionId ?? "" };
  }

  // Parse effort prefix: "!!" at start → max effort, "!" → high
  let effort: "low" | "medium" | "high" | "max" | undefined;
  let prompt = rawPrompt;
  if (prompt.startsWith("!!")) {
    effort = "max";
    prompt = prompt.slice(2).trim();
  } else if (prompt.startsWith("!") && !prompt.startsWith("!/")) {
    effort = "high";
    prompt = prompt.slice(1).trim();
  }

  // Expand slash commands: /name [args] → read .claude/commands/name.md
  const slashMatch = rawPrompt.match(/^\/(\S+)(?:\s+(.*))?$/s);
  if (slashMatch) {
    const cmdName = slashMatch[1];
    const cmdArgs = (slashMatch[2] ?? "").trim();
    const cmdDir = cwd ?? process.cwd();
    const cmdPath = join(cmdDir, ".claude", "commands", `${cmdName}.md`);
    if (existsSync(cmdPath)) {
      const content = readFileSync(cmdPath, "utf-8");
      prompt = cmdArgs ? `${content}\n\n${cmdArgs}` : content;
      console.log(`[claude-code] expanded /${cmdName} → ${cmdPath} (${content.length} chars)`);
    }
  }

  // Built-in terminal commands
  let useContinue = false; // SDK `continue` option — auto-resume most recent session in cwd
  const trimmedLower = prompt.trim().toLowerCase();
  if (trimmedLower === "/resume" || trimmedLower === "/continue") {
    if (!toolSessionId) {
      // No explicit session — use SDK's `continue` to auto-resume the most
      // recent session in this project directory (if one exists).
      useContinue = true;
    }
    prompt = "Continue where you left off.";
    console.log(`[claude-code] ${trimmedLower} → ${toolSessionId ? `resume session ${toolSessionId}` : "continue latest in cwd"}`);
  }

  if (trimmedLower === "/compact") {
    if (!toolSessionId) {
      client.send({
        id: randomUUID(),
        runId,
        sessionKey: client.sessionKey,
        seq: 0,
        timestamp: Date.now(),
        state: "error",
        text: "No active session to compact. Start a session first.\n",
        toolMeta: { toolId: "claude-code" },
        ...(targetCardId ? { targetCardId } : {}),
        operation: { operationId: runId, stage: "error", label: "No session", cancellable: false },
      } as ServerMessage);
      return { sessionId: "" };
    }
    prompt = "Please provide a brief summary of the current state of our work so far, including what we've accomplished, any pending tasks, and key decisions made. Then continue with the next step.";
    console.log(`[claude-code] /compact → triggering context summary for session ${toolSessionId}`);
  }

  const abortController = new AbortController();
  activeAbortControllers.set(runId, abortController);

  let sessionId = toolSessionId ?? "";
  let resumeId: string | undefined = toolSessionId;
  let retried = false;
  let seq = 0;
  let totalTextSent = 0;
  let modelTextStreamed = 0; // Only actual model text (text_delta), NOT injected markers
  let lastCharNewline = true;
  let resultSent = false;
  let startTime = Date.now();

  // Buffered final — prompt_suggestion messages arrive after result in the SDK
  // stream, so we defer sendFinal() until the loop ends to avoid sending a
  // delta (suggestion) after the final message (which resets card status back
  // to "streaming" on the client, causing a stuck blinking cursor).
  let pendingFinalCostDelta: string | null = null;
  let pendingFinalReady = false;
  const pendingSuggestions: string[] = [];

  /** Idempotent flush: send buffered cost + suggestions, then final. */
  const flushPendingFinal = () => {
    if (!pendingFinalReady || resultSent) return;
    if (pendingFinalCostDelta) sendDelta(pendingFinalCostDelta);
    pendingFinalCostDelta = null;
    for (const s of pendingSuggestions) {
      sendDelta(`\u200B[suggest:${s}]\n`);
    }
    pendingSuggestions.length = 0;
    sendFinal();
  };

  // Tool activity tracking
  let activeToolName: string | null = null;
  let toolInputBuf = "";
  let lastEmittedDetail: string | null = null;
  let lastCompletedToolName: string | null = null;

  const toolMeta = (): ServerMessage["toolMeta"] => ({
    toolId: "claude-code",
    ...(sessionId ? { toolSessionId: sessionId } : {}),
  });

  const send = (
    partial: Pick<ServerMessage, "state"> & Partial<ServerMessage>,
  ) => {
    client.send({
      id: randomUUID(),
      runId,
      sessionKey: client.sessionKey,
      seq: seq++,
      timestamp: Date.now(),
      toolMeta: toolMeta(),
      ...(targetCardId ? { targetCardId } : {}),
      ...partial,
    } as ServerMessage);
  };

  const sendDelta = (text?: string, extra?: Partial<ServerMessage>) => {
    if (resultSent) return; // Never send a delta after final (would reset card to "streaming")
    if (text) {
      totalTextSent += text.length;
      lastCharNewline = text.endsWith("\n");
    }
    send({ state: "delta", ...(text ? { text } : {}), ...extra });
  };

  const sendFinal = () => {
    if (resultSent) return;
    resultSent = true;
    if (totalTextSent > 0 && !lastCharNewline) {
      sendDelta("\n");
    }
    send({
      state: "final",
      operation: {
        operationId: runId,
        stage: "complete",
        label: "Completed",
        cancellable: false,
      },
    });
  };

  const sendError = (text: string, cancelled = false) => {
    if (resultSent) return;
    resultSent = true;
    send({
      state: "error",
      text,
      operation: {
        operationId: runId,
        stage: cancelled ? "cancelled" : "error",
        label: cancelled ? "Cancelled" : "Failed",
        cancellable: false,
      },
    });
  };

  // Initial operation status
  sendDelta(undefined, {
    operation: {
      operationId: runId,
      stage: "processing",
      label: "Starting Claude Code",
      cancellable: true,
    },
  });

  const spawnCwd = cwd ? cwd.replace(/\\/g, "/") : undefined;
  console.log(`[claude-code] SDK query (cwd=${spawnCwd ?? "default"}, resume=${toolSessionId ?? "none"})`);

  // Clear CLAUDECODE env var to prevent the spawned CLI from rejecting
  // as a "nested session" (e.g. when the gateway was started from Claude Code)
  delete process.env.CLAUDECODE;

  // Set stream-close timeout BEFORE creating the Query (constructor reads
  // it synchronously).  The SDK default is very short (5s) and Agent/Task
  // tools easily exceed that, causing premature stream termination.
  const prevStreamTimeout = process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT;
  process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT = "300000"; // 5 minutes

  /** Run the SDK query and process all streamed messages. */
  const runQuery = async () => {
    const q = query({
      prompt,
      options: {
        model: "claude-opus-4-6",
        cwd: spawnCwd,
        resume: resumeId || undefined,
        ...(useContinue && !resumeId ? { continue: true } : {}),
        includePartialMessages: true,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        promptSuggestions: true,
        abortController,
        // Append Enso-specific context to Claude Code's default system prompt
        // (only on new sessions — resumed sessions inherit theirs)
        ...(!resumeId ? {
          systemPrompt: {
            type: "preset" as const,
            preset: "claude_code" as const,
            append: [
              "You are running inside Enso, a chat-based app platform.",
              "The user is interacting via a mobile or desktop chat UI, not a terminal.",
              "Keep responses concise and mobile-friendly.",
              "When the user asks you to deploy or restart, use the /deploy slash command if available.",
            ].join(" "),
          },
        } : {}),
        // Effort level: "!!" prefix → max, "!" → high (default is SDK's own default)
        ...(effort ? { effort } : {}),
        // Trigger compaction at ~80% instead of default ~83% for more headroom
        env: { ...process.env, CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "80" },
      },
    });

    // Restore immediately — Query constructor already captured the value
    if (prevStreamTimeout !== undefined) {
      process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT = prevStreamTimeout;
    } else {
      delete process.env.CLAUDE_CODE_STREAM_CLOSE_TIMEOUT;
    }

    for await (const message of q) {
      // Capture session ID from any message that has it
      if ("session_id" in message && message.session_id) {
        sessionId = message.session_id as string;
      }

      // ── System messages (init, tasks) ──
      if (message.type === "system") {
        const msg = message as Record<string, unknown>;
        const subtype = msg.subtype as string | undefined;

        if (subtype === "task_started") {
          const taskId = msg.task_id as string;
          const desc = ((msg.description as string) ?? "").replace(/[\]\n\r]/g, " ").trim().slice(0, 80);
          activeTasks.set(taskId, desc);
          sendDelta(`\u200B[task:start:${desc}]\n`);
          continue;
        }

        if (subtype === "task_notification") {
          const taskId = msg.task_id as string;
          const status = msg.status as string; // completed | failed | stopped
          const summary = ((msg.summary as string) ?? activeTasks.get(taskId) ?? "").replace(/[\]\n\r]/g, " ").trim().slice(0, 80);
          activeTasks.delete(taskId);
          sendDelta(`\u200B[task:${status}:${summary}]\n`);
          continue;
        }

        // Task progress — enrich operation label with live stats
        if (subtype === "task_progress") {
          const usage = msg.usage as { total_tokens?: number; tool_uses?: number; duration_ms?: number } | undefined;
          const lastTool = (msg.last_tool_name as string) ?? "";
          if (usage) {
            const tools = usage.tool_uses ?? 0;
            const durS = Math.round((usage.duration_ms ?? 0) / 1000);
            const taskId = msg.task_id as string;
            const desc = (activeTasks.get(taskId) ?? "").slice(0, 40);
            sendDelta(undefined, {
              operation: {
                operationId: runId,
                stage: "calling_tool",
                label: `Agent: ${lastTool || desc} (${tools} tools, ${durS}s)`,
                cancellable: true,
              },
            });
          }
          continue;
        }

        // Session init — emit model/version/tool count marker
        if (subtype === "init") {
          const model = (msg.model as string) ?? "";
          const version = (msg.claude_code_version as string) ?? "";
          const toolCount = Array.isArray(msg.tools) ? msg.tools.length : 0;
          const mcpCount = Array.isArray(msg.mcp_servers) ? msg.mcp_servers.length : 0;
          const mode = (msg.permissionMode as string) ?? "";
          sendDelta(`\u200B[init:${model}|${version}|${toolCount}|${mcpCount}|${mode}]\n`);
          console.log(`[claude-code] session: ${sessionId}, model=${model}, v=${version}`);
          continue;
        }

        // Files persisted — emit file names as chips
        if (subtype === "files_persisted") {
          const files = (msg.files as Array<{ filename: string }>) ?? [];
          const failed = (msg.failed as Array<{ filename: string }>) ?? [];
          const names = files.map(f => f.filename.replace(/\\/g, "/").split("/").pop() ?? f.filename);
          const failedNames = failed.map(f => f.filename.replace(/\\/g, "/").split("/").pop() ?? f.filename);
          if (names.length > 0 || failedNames.length > 0) {
            const okPart = names.join(",");
            const failPart = failedNames.join(",");
            sendDelta(`\u200B[files:${okPart}|${failPart}]\n`);
          }
          continue;
        }

        // Compaction status
        if (subtype === "status") {
          const status = msg.status as string | null;
          if (status === "compacting") {
            sendDelta(`\u200B[compact:start]\n`);
            sendDelta(undefined, {
              operation: {
                operationId: runId,
                stage: "processing",
                label: "Compacting context...",
                cancellable: true,
              },
            });
          }
          continue;
        }

        // Compaction boundary — context was compacted
        if (subtype === "compact_boundary") {
          const meta = msg.compact_metadata as { trigger?: string; pre_tokens?: number } | undefined;
          const trigger = meta?.trigger ?? "auto";
          const preTokens = meta?.pre_tokens ?? 0;
          const tokensK = preTokens > 0 ? `${Math.round(preTokens / 1000)}k` : "";
          sendDelta(`\u200B[compact:done:${trigger}:${tokensK}]\n`);
          continue;
        }

        // Other system messages
        console.log(`[claude-code] system: ${sessionId}, subtype=${subtype ?? "unknown"}`);
        continue;
      }

      // ── Streaming events (partial messages) ──
      if (message.type === "stream_event") {
        const event = message.event as Record<string, unknown>;

        // content_block_start → detect tool_use or text block
        if (event.type === "content_block_start") {
          const block = event.content_block as Record<string, unknown> | undefined;
          if (block?.type === "tool_use") {
            activeToolName = (block.name as string) ?? null;
            toolInputBuf = "";
            // Update operation label
            if (activeToolName && activeToolName !== "AskUserQuestion") {
              sendDelta(undefined, {
                operation: {
                  operationId: runId,
                  stage: "calling_tool",
                  label: `${humanToolLabel(activeToolName)}...`,
                  cancellable: true,
                },
              });
            }
          }
        }

        // content_block_delta → text or tool input
        if (event.type === "content_block_delta") {
          const delta = event.delta as Record<string, unknown> | undefined;
          if (delta?.type === "text_delta" && typeof delta.text === "string") {
            modelTextStreamed += delta.text.length;
            sendDelta(delta.text, {
              operation: {
                operationId: runId,
                stage: "streaming",
                label: "Streaming output",
                cancellable: true,
              },
            });
          } else if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
            toolInputBuf += delta.partial_json;
            // Progressive detail extraction — update label as soon as key param is known
            if (activeToolName && activeToolName !== "AskUserQuestion") {
              const detail = extractToolDetail(activeToolName, toolInputBuf);
              if (detail && detail !== lastEmittedDetail) {
                lastEmittedDetail = detail;
                sendDelta(undefined, {
                  operation: {
                    operationId: runId,
                    stage: "calling_tool",
                    label: `${humanToolLabel(activeToolName)} ${detail}`,
                    cancellable: true,
                  },
                });
              }
            }
          }
        }

        // content_block_stop → emit tool marker if we were tracking a tool
        if (event.type === "content_block_stop") {
          if (activeToolName && activeToolName !== "AskUserQuestion") {
            lastCompletedToolName = activeToolName;
            if (activeToolName === "Bash") {
              // Emit specialized bash marker with command text
              const cmdMatch = toolInputBuf.match(/"command"\s*:\s*"((?:[^"\\]|\\.)*)"/);
              const cmd = cmdMatch
                ? cmdMatch[1].replace(/\\n/g, " ").replace(/\\"/g, '"').replace(/\\/g, "\\").replace(/]/g, "").trim().slice(0, 120)
                : "";
              sendDelta(cmd ? `\u200B[bash:${cmd}]\n` : `\u200B[tool:Bash]\n`);
            } else {
              const detail = extractToolDetail(activeToolName, toolInputBuf);
              const marker = detail
                ? `\u200B[tool:${activeToolName}:${detail}]\n`
                : `\u200B[tool:${activeToolName}]\n`;
              sendDelta(marker);
            }
          }
          activeToolName = null;
          toolInputBuf = "";
          lastEmittedDetail = null;
        }

        continue;
      }

      // ── Tool output summary ──
      if (message.type === "tool_use_summary") {
        const msg = message as Record<string, unknown>;
        // Suppress noisy file-content dumps from read-only tools
        const suppressTools = new Set(["Read", "Glob", "Grep", "WebFetch"]);
        if (lastCompletedToolName && suppressTools.has(lastCompletedToolName)) {
          lastCompletedToolName = null;
          continue;
        }
        lastCompletedToolName = null;
        const summary = msg.summary as string | undefined;
        if (summary?.trim()) {
          const display = summary.length > 1500 ? summary.slice(0, 1500) + "\n...(truncated)" : summary;
          sendDelta("```\n" + display + "\n```\n");
        }
        continue;
      }

      // ── Tool progress (update operation label with elapsed time) ──
      if (message.type === "tool_progress") {
        const msg = message as Record<string, unknown>;
        const toolName = msg.tool_name as string | undefined;
        const elapsed = msg.elapsed_time_seconds as number | undefined;
        if (toolName) {
          const detail = (toolName === activeToolName && lastEmittedDetail) ? ` ${lastEmittedDetail}` : "";
          const label = elapsed != null
            ? `${humanToolLabel(toolName)}${detail} (${Math.round(elapsed)}s)`
            : `${humanToolLabel(toolName)}${detail}`;
          sendDelta(undefined, {
            operation: {
              operationId: runId,
              stage: "calling_tool",
              label,
              cancellable: true,
            },
          });
        }
        continue;
      }

      // ── Rate limit events ──
      if (message.type === "rate_limit_event") {
        const msg = message as Record<string, unknown>;
        const info = msg.rate_limit_info as Record<string, unknown> | undefined;
        if (info) {
          const status = info.status as string;
          if (status === "rejected" || status === "allowed_warning") {
            const resetsAt = info.resetsAt as number | undefined;
            const waitLabel = resetsAt
              ? ` (resets in ${Math.max(1, Math.round((resetsAt - Date.now() / 1000)))}s)`
              : "";
            const markerStatus = status === "rejected" ? "rejected" : "warning";
            sendDelta(`\u200B[ratelimit:${markerStatus}${waitLabel}]\n`);
            sendDelta(undefined, {
              operation: {
                operationId: runId,
                stage: "calling_tool",
                label: `Rate limited${waitLabel}`,
                cancellable: true,
              },
            });
          }
        }
        continue;
      }

      // ── Assistant turn (full message) ──
      if (message.type === "assistant") {
        const msg = message as Record<string, unknown>;
        const betaMessage = msg.message as Record<string, unknown> | undefined;
        const content = betaMessage?.content as Array<Record<string, unknown>> | undefined;

        if (Array.isArray(content)) {
          // Fallback: send full text if no model text was streamed yet
          // (tool markers don't count — they inflate totalTextSent but aren't real output)
          const textParts = content
            .filter((c) => c.type === "text" && typeof c.text === "string")
            .map((c) => c.text as string);
          const fullText = textParts.join("");
          if (fullText && modelTextStreamed === 0) {
            sendDelta(fullText);
            modelTextStreamed += fullText.length;
          }

          // Detect AskUserQuestion tool_use blocks
          for (const block of content) {
            if (block.type === "tool_use" && block.name === "AskUserQuestion") {
              const input = (block.input ?? {}) as {
                questions?: Array<{
                  question: string;
                  options: Array<{ label: string; description?: string }>;
                }>;
              };
              if (input.questions && input.questions.length > 0) {
                const questions: ToolQuestion[] = input.questions.map((q) => ({
                  question: q.question,
                  options: q.options.map((o) => ({
                    label: o.label,
                    ...(o.description ? { description: o.description } : {}),
                  })),
                }));
                console.log(`[claude-code] AskUserQuestion: ${questions.length} question(s)`);
                sendDelta(undefined, { questions });
              }
            }
          }
        }
        continue;
      }

      // ── Final result ──
      if (message.type === "result") {
        const result = message as Record<string, unknown>;
        if (result.subtype === "success") {
          // If no model text was streamed, send the result text
          // (tool markers inflate totalTextSent but don't count as model output)
          if (modelTextStreamed === 0 && typeof result.result === "string" && result.result) {
            sendDelta(result.result);
          }

          // Emit enriched cost marker with token breakdown
          const cost = result.total_cost_usd as number | undefined;
          const turns = result.num_turns as number | undefined;
          const durationS = ((Date.now() - startTime) / 1000).toFixed(1);

          const usage = result.usage as Record<string, number> | undefined;
          const modelUsage = result.modelUsage as Record<string, { contextWindow?: number; inputTokens?: number; outputTokens?: number }> | undefined;
          const inputTok = usage?.inputTokens ?? 0;
          const outputTok = usage?.outputTokens ?? 0;
          const cacheTok = usage?.cacheReadInputTokens ?? 0;

          let ctxPct = "";
          if (modelUsage) {
            const first = Object.values(modelUsage)[0];
            if (first?.contextWindow && inputTok) {
              ctxPct = `${Math.round((inputTok / first.contextWindow) * 100)}%`;
            }
          }

          // Emit standalone context percentage for real-time header badge
          // (fires immediately, unlike cost marker which is deferred for suggestions)
          if (ctxPct) sendDelta(`\u200B[ctx:${ctxPct}]\n`);

          if (cost != null || turns != null) {
            const costStr = cost != null ? `$${cost.toFixed(4)}` : "$?";
            const turnsStr = turns != null ? `${turns} turn${turns === 1 ? "" : "s"}` : "";
            const parts = [costStr, turnsStr, `${durationS}s`, inputTok ? `${inputTok}in` : "", outputTok ? `${outputTok}out` : "", cacheTok ? `${cacheTok}cache` : "", ctxPct ? `ctx:${ctxPct}` : ""].filter(Boolean);
            pendingFinalCostDelta = `\u200B[cost:${parts.join("|")}]\n`;
            console.log(`[claude-code] done — cost=${costStr}, turns=${turnsStr}, duration=${durationS}s`);
          }

          // Don't call sendFinal() yet — prompt_suggestion messages may still
          // arrive after this result message.  Flush after the loop instead.
          // Note: no safety timer — a delayed flush races with follow-up
          // sessions on the same terminal card, causing stuck "Completed" state.
          pendingFinalReady = true;
        } else {
          // Differentiate error subtypes for better user feedback
          const subtype = result.subtype as string;
          const baseMsg = typeof result.error === "string"
            ? result.error
            : typeof result.result === "string"
              ? result.result
              : "";

          let errMsg: string;
          if (subtype === "error_max_turns") {
            errMsg = baseMsg || "Reached the maximum number of conversation turns.";
            // Offer resume so user can continue
            if (sessionId) pendingSuggestions.push("Continue where you left off");
          } else if (subtype === "error_max_budget_usd") {
            errMsg = baseMsg || "Session cost budget exceeded.";
          } else if (subtype === "error_during_execution") {
            errMsg = baseMsg || "Claude Code encountered an error during execution.";
            if (sessionId) pendingSuggestions.push("Continue where you left off");
          } else {
            errMsg = baseMsg || "Claude Code encountered an error.";
          }

          // For max_turns and execution errors, send as final (not error)
          // so suggestions render and the card doesn't show harsh red
          if ((subtype === "error_max_turns" || subtype === "error_during_execution") && sessionId) {
            sendDelta(`\n*${errMsg}*\n`);
            pendingFinalReady = true;
            flushPendingFinal();
          } else {
            sendError(errMsg);
          }
        }
        continue;
      }

      // ── Prompt suggestion (arrives after result) ──
      if (message.type === "prompt_suggestion") {
        const msg = message as Record<string, unknown>;
        const suggestion = ((msg.suggestion as string) ?? "").replace(/[\]\n\r]/g, " ").trim();
        if (suggestion) {
          if (pendingFinalReady) {
            // Buffer suggestion — will be flushed before the final message
            pendingSuggestions.push(suggestion);
          } else {
            sendDelta(`\u200B[suggest:${suggestion}]\n`);
          }
        }
        continue;
      }
    }

    // Flush buffered final (idempotent)
    flushPendingFinal();

    // If the generator completed without a result message, the session
    // ended abnormally.  Tell the user and suggest resume.
    if (!resultSent) {
      console.log(`[claude-code] stream ended without result message (session=${sessionId})`);
      if (sessionId) {
        sendDelta("\n\n*Session ended unexpectedly. You can type /resume to continue.*\n");
        sendDelta(`\u200B[suggest:Continue where you left off]\n`);
      }
      sendFinal();
    }
  };

  try {
    await runQuery();
  } catch (err: unknown) {
    // If we already received a success result but the process exited with
    // a non-zero code (e.g. exit code 1 after cleanup), flush the pending
    // final instead of treating it as an error — the work completed fine.
    if (pendingFinalReady && !resultSent) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[claude-code] process threw after success result, flushing final (${msg})`);
      flushPendingFinal();
    } else if (!resultSent) {
      const isAbort = err instanceof Error && (err.name === "AbortError" || abortController.signal.aborted);
      if (isAbort) {
        sendError("Claude Code run cancelled.", true);
      } else if (resumeId && totalTextSent === 0 && !retried) {
        // Resume failed before any output — likely stale/crashed session.
        // Retry once with a fresh session so the user isn't stuck.
        retried = true;
        resumeId = undefined;
        sessionId = "";
        console.log(`[claude-code] session resume failed (no output), retrying with fresh session`);
        sendDelta("Session expired — starting fresh...\n");
        try {
          await runQuery();
        } catch (retryErr: unknown) {
          // Same pattern: flush pending final if we got a success before the throw
          if (pendingFinalReady && !resultSent) {
            flushPendingFinal();
          } else if (!resultSent) {
            const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            console.error(`[claude-code] retry error:`, msg);
            sendError(`Claude Code error: ${msg}`);
          }
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[claude-code] error:`, msg);
        sendError(`Claude Code error: ${msg}`);
      }
    }
  } finally {
    activeAbortControllers.delete(runId);
  }

  return { sessionId };
}
