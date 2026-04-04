/**
 * shell-pty.ts — PTY session manager for remote terminal.
 *
 * Spawns real shell processes (PowerShell on Windows, bash/zsh on macOS/Linux)
 * via node-pty and streams output to the browser as ServerMessage deltas.
 */

import * as pty from "node-pty";
import { platform, homedir } from "os";
import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { dirname, join, normalize, resolve } from "path";
import { fileURLToPath } from "url";
import type { ConnectedClient } from "./server.js";
import type { ServerMessage } from "./types.js";
import { logError, logAction } from "./action-log.js";

/** Detect project root from module location (server/src → ../../). */
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(join(PLUGIN_DIR, "..", ".."));

/** Maximum concurrent shell sessions per client. */
const MAX_SESSIONS_PER_CLIENT = 3;

/** Session idle timeout — auto-destroy after 10 minutes of inactivity. */
const SESSION_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/** Maximum output buffer size per session (1 MB). */
const MAX_OUTPUT_BUFFER = 1024 * 1024;

interface ShellSession {
  id: string;
  ptyProcess: pty.IPty;
  client: ConnectedClient;
  targetCardId: string;
  runId: string;
  cols: number;
  rows: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
  outputBytes: number;
}

const sessions = new Map<string, ShellSession>();

/** Validate that CWD is a real existing directory. */
export function validateCwd(cwd: string | undefined): string {
  const defaultCwd = PROJECT_ROOT;
  if (!cwd) return existsSync(defaultCwd) ? defaultCwd : homedir();
  const resolved = normalize(resolve(cwd));
  if (!existsSync(resolved)) return existsSync(defaultCwd) ? defaultCwd : homedir();
  return resolved;
}

function resetSessionIdleTimer(session: ShellSession): void {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    logAction({ ts: Date.now(), type: "action", category: "shell", message: `Shell session ${session.id} idle timeout — destroying` });
    destroyShell(session.id);
  }, SESSION_IDLE_TIMEOUT_MS);
}

function getClientSessionCount(clientId: string): number {
  let count = 0;
  for (const session of sessions.values()) {
    if (session.client.id === clientId) count++;
  }
  return count;
}

export function createShellSession(params: {
  client: ConnectedClient;
  targetCardId: string;
  cols?: number;
  rows?: number;
  cwd?: string;
}): string {
  const { client, targetCardId, cols = 80, rows = 24, cwd } = params;

  // Enforce per-client session limit
  if (getClientSessionCount(client.id) >= MAX_SESSIONS_PER_CLIENT) {
    throw new Error(`Maximum concurrent shell sessions (${MAX_SESSIONS_PER_CLIENT}) reached for this client`);
  }

  const sessionId = randomUUID().slice(0, 12);
  const runId = randomUUID();

  // Validate CWD — default to Enso project root, not HOME
  const safeCwd = validateCwd(cwd);

  // Detect shell based on platform
  const isWindows = platform() === "win32";
  const shell = isWindows ? "powershell.exe" : (process.env.SHELL || "/bin/bash");
  const shellArgs = isWindows ? ["-NoLogo"] : [];

  // Sanitize environment — remove sensitive variables from PTY env
  const sanitizedEnv = { ...process.env } as Record<string, string>;
  const sensitiveVars = ["AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "GITHUB_TOKEN", "NPM_TOKEN",
    "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "DATABASE_URL", "DB_PASSWORD"];
  for (const v of sensitiveVars) delete sanitizedEnv[v];

  let ptyProcess: pty.IPty;
  try {
    ptyProcess = pty.spawn(shell, shellArgs, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: safeCwd,
      env: sanitizedEnv,
    });
  } catch (err) {
    logError("shell", "Failed to spawn PTY process", err);
    throw err;
  }

  const session: ShellSession = {
    id: sessionId,
    ptyProcess,
    client,
    targetCardId,
    runId,
    cols,
    rows,
    idleTimer: null,
    outputBytes: 0,
  };

  sessions.set(sessionId, session);
  resetSessionIdleTimer(session);
  logAction({ ts: Date.now(), type: "action", category: "shell", message: `Shell session created: ${sessionId} (cwd: ${safeCwd})` });

  // Stream PTY output to the browser with output size tracking
  ptyProcess.onData((data: string) => {
    session.outputBytes += data.length;
    resetSessionIdleTimer(session);

    // Warn if output buffer is getting large (runaway process)
    if (session.outputBytes > MAX_OUTPUT_BUFFER) {
      logAction({ ts: Date.now(), type: "action", category: "shell", message: `Shell session ${sessionId} exceeded output limit — destroying` });
      destroyShell(sessionId);
      return;
    }

    const msg: ServerMessage = {
      id: randomUUID(),
      runId,
      sessionKey: client.sessionKey,
      seq: 0,
      state: "delta",
      text: data,
      targetCardId,
      toolMeta: { toolId: "shell", toolSessionId: sessionId },
      timestamp: Date.now(),
    };
    client.send(msg);
  });

  // Handle PTY exit
  ptyProcess.onExit(({ exitCode, signal }) => {
    const msg: ServerMessage = {
      id: randomUUID(),
      runId,
      sessionKey: client.sessionKey,
      seq: 0,
      state: "final",
      text: `\r\n[Process exited with code ${exitCode}${signal ? `, signal ${signal}` : ""}]\r\n`,
      data: { exitCode, signal },
      targetCardId,
      toolMeta: { toolId: "shell", toolSessionId: sessionId },
      timestamp: Date.now(),
    };
    client.send(msg);
    sessions.delete(sessionId);
  });

  return sessionId;
}

export function writeToShell(sessionId: string, data: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.ptyProcess.write(data);
  return true;
}

export function resizeShell(sessionId: string, cols: number, rows: number): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.cols = cols;
  session.rows = rows;
  session.ptyProcess.resize(cols, rows);
  return true;
}

export function destroyShell(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.ptyProcess.kill();
  sessions.delete(sessionId);
  return true;
}

/** Destroy all sessions for a given client (called on WS disconnect). */
export function destroyClientSessions(clientId: string): number {
  let count = 0;
  for (const [id, session] of sessions) {
    if (session.client.id === clientId) {
      if (session.idleTimer) clearTimeout(session.idleTimer);
      session.ptyProcess.kill();
      sessions.delete(id);
      count++;
    }
  }
  return count;
}

export function getSessionCount(): number {
  return sessions.size;
}
