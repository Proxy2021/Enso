import { spawn } from "child_process";
import { createInterface } from "readline";
import { randomUUID } from "crypto";
import type { ConnectedClient } from "./server.js";
import type { ServerMessage, ToolQuestion } from "./types.js";

/**
 * Directly invoke the Claude Code CLI, streaming results back to the
 * browser client via WebSocket. Bypasses OpenClaw entirely — no agent
 * pipeline, no middleware, just CLI → WS.
 *
 * Uses `--output-format stream-json` for structured streaming output:
 *   - system init  → capture session ID
 *   - content_block_delta / stream_event → text deltas
 *   - assistant     → fallback full-text (if no deltas received)
 *   - result        → final / error
 */
export async function runClaudeCode(params: {
  prompt: string;
  cwd?: string;
  toolSessionId?: string;
  client: ConnectedClient;
  runId: string;
}): Promise<{ sessionId: string }> {
  const { prompt, cwd, toolSessionId, client, runId } = params;

  if (!prompt.trim()) {
    return { sessionId: toolSessionId ?? "" };
  }

  const args = [
    "-p", prompt,
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--dangerously-skip-permissions",
  ];

  if (toolSessionId) args.push("--resume", toolSessionId);

  // Resolve full path to claude executable.
  // Use forward slashes — Windows spawn handles them fine and avoids
  // edge cases with backslash-sensitive path handling in some Node loaders.
  const home = (process.env.USERPROFILE || process.env.HOME || "").replace(/\\/g, "/");
  const claudePath = process.platform === "win32" && home
    ? `${home}/.local/bin/claude.exe`
    : "claude";

  // Unset Claude Code env vars to avoid "nested session" detection
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  const spawnCwd = cwd ? cwd.replace(/\\/g, "/") : undefined;

  console.log(`[claude-code] spawning: ${claudePath} (cwd=${spawnCwd ?? "default"}, resume=${toolSessionId ?? "none"})`);

  const child = spawn(claudePath, args, {
    env,
    cwd: spawnCwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let sessionId = toolSessionId ?? "";
  let seq = 0;
  let totalTextSent = 0;
  let lastCharNewline = true;
  let resultSent = false;
  let stderrBuf = "";

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
      ...partial,
    } as ServerMessage);
  };

  const sendDelta = (text?: string, extra?: Partial<ServerMessage>) => {
    if (text) {
      totalTextSent += text.length;
      lastCharNewline = text.endsWith("\n");
    }
    send({ state: "delta", ...(text ? { text } : {}), ...extra });
  };

  const sendFinal = () => {
    if (resultSent) return;
    resultSent = true;
    // Ensure output ends with newline so next prompt starts on fresh line
    if (totalTextSent > 0 && !lastCharNewline) {
      sendDelta("\n");
    }
    send({ state: "final" });
  };

  const sendError = (text: string) => {
    if (resultSent) return;
    resultSent = true;
    send({ state: "error", text });
  };

  const rl = createInterface({ input: child.stdout! });

  return new Promise<{ sessionId: string }>((resolve) => {
    rl.on("line", (line) => {
      if (!line.trim()) return;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line);
      } catch {
        return; // skip unparseable lines
      }

      // ── Session init ──
      if (event.type === "system" && event.session_id) {
        sessionId = event.session_id as string;
        console.log(`[claude-code] session: ${sessionId}`);
        return;
      }

      // ── Streaming text deltas (wrapped in stream_event) ──
      if (event.type === "stream_event") {
        const inner = event.event as Record<string, unknown> | undefined;
        if (inner?.type === "content_block_delta") {
          const delta = inner.delta as Record<string, unknown> | undefined;
          if (delta?.type === "text_delta" && typeof delta.text === "string") {
            sendDelta(delta.text);
          }
        }
        return;
      }

      // ── Streaming text deltas (top-level, alternate format) ──
      if (event.type === "content_block_delta") {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          sendDelta(delta.text);
        }
        return;
      }

      // ── Assistant turn (full text per turn + tool_use blocks) ──
      if (event.type === "assistant") {
        const msg = event.message as Record<string, unknown> | undefined;
        const content = msg?.content as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(content)) {
          // Fallback: send full text if no streaming deltas arrived
          const textParts = content
            .filter((c) => c.type === "text" && typeof c.text === "string")
            .map((c) => c.text as string);
          const fullText = textParts.join("");
          if (fullText && totalTextSent === 0) {
            sendDelta(fullText);
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
        return;
      }

      // ── Final result ──
      if (event.type === "result") {
        if (event.subtype === "error") {
          sendError(typeof event.error === "string" ? event.error : "Claude Code encountered an error.");
        } else {
          // If nothing was streamed, send the result text
          if (totalTextSent === 0 && typeof event.result === "string" && event.result) {
            sendDelta(event.result);
          }
          sendFinal();
        }

        const cost = event.total_cost_usd;
        const turns = event.num_turns;
        if (cost != null || turns != null) {
          console.log(`[claude-code] done — cost=$${cost ?? "?"}, turns=${turns ?? "?"}`);
        }
        return;
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        stderrBuf += text + "\n";
        console.error(`[claude-code] stderr: ${text}`);
      }
    });

    child.on("close", (code) => {
      if (!resultSent) {
        if (code !== 0) {
          const detail = stderrBuf.trim();
          sendError(`Claude Code exited with code ${code}${detail ? `: ${detail}` : ""}`);
        } else {
          sendFinal();
        }
      }
      resolve({ sessionId });
    });

    child.on("error", (err) => {
      sendError(`Failed to start Claude Code: ${err.message}`);
      resolve({ sessionId: "" });
    });
  });
}
