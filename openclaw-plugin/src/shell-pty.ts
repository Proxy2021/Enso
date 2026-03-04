/**
 * shell-pty.ts — PTY session manager for remote terminal.
 *
 * Spawns real shell processes (PowerShell on Windows, bash/zsh on macOS/Linux)
 * via node-pty and streams output to the browser as ServerMessage deltas.
 */

import * as pty from "node-pty";
import { platform } from "os";
import { randomUUID } from "crypto";
import type { ConnectedClient } from "./server.js";
import type { ServerMessage } from "./types.js";

interface ShellSession {
  id: string;
  ptyProcess: pty.IPty;
  client: ConnectedClient;
  targetCardId: string;
  runId: string;
  cols: number;
  rows: number;
}

const sessions = new Map<string, ShellSession>();

export function createShellSession(params: {
  client: ConnectedClient;
  targetCardId: string;
  cols?: number;
  rows?: number;
  cwd?: string;
}): string {
  const { client, targetCardId, cols = 80, rows = 24, cwd } = params;
  const sessionId = randomUUID().slice(0, 12);
  const runId = randomUUID();

  // Detect shell based on platform
  const isWindows = platform() === "win32";
  const shell = isWindows ? "powershell.exe" : (process.env.SHELL || "/bin/bash");
  const shellArgs = isWindows ? ["-NoLogo"] : [];

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: "xterm-256color",
    cols,
    rows,
    cwd: cwd || process.env.HOME || process.env.USERPROFILE || undefined,
    env: { ...process.env } as Record<string, string>,
  });

  const session: ShellSession = {
    id: sessionId,
    ptyProcess,
    client,
    targetCardId,
    runId,
    cols,
    rows,
  };

  sessions.set(sessionId, session);

  // Stream PTY output to the browser
  ptyProcess.onData((data: string) => {
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
  session.ptyProcess.kill();
  sessions.delete(sessionId);
  return true;
}

/** Destroy all sessions for a given client (called on WS disconnect). */
export function destroyClientSessions(clientId: string): number {
  let count = 0;
  for (const [id, session] of sessions) {
    if (session.client.id === clientId) {
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
