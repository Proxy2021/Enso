import { spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import type { ConnectedClient } from "./server.js";
import type { ServerMessage } from "./types.js";

const CLAUDE_EXE = "C:\\Users\\Administrator\\.local\\bin\\claude.exe";

/** Active remote-control processes, keyed by runId. */
const activeProcesses = new Map<string, ChildProcess>();

export function cancelRemoteControl(runId: string): boolean {
  const proc = activeProcesses.get(runId);
  if (!proc) return false;
  proc.kill();
  activeProcesses.delete(runId);
  return true;
}

/**
 * Spawn `claude remote-control` and stream its output back to the browser
 * via WebSocket, rendered in a terminal card.
 */
export function runRemoteControl(params: {
  client: ConnectedClient;
  runId: string;
}): void {
  const { client, runId } = params;

  let seq = 0;
  let resultSent = false;

  const send = (
    partial: Pick<ServerMessage, "state"> & Partial<ServerMessage>,
  ) => {
    client.send({
      id: randomUUID(),
      runId,
      sessionKey: client.sessionKey,
      seq: seq++,
      timestamp: Date.now(),
      toolMeta: { toolId: "claude-remote-control" },
      ...partial,
    } as ServerMessage);
  };

  const sendDelta = (text: string, extra?: Partial<ServerMessage>) => {
    send({ state: "delta", text, ...extra });
  };

  const sendFinal = () => {
    if (resultSent) return;
    resultSent = true;
    send({
      state: "final",
      operation: {
        operationId: runId,
        stage: "complete",
        label: "Session ended",
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

  // Initial status
  sendDelta("Starting Claude remote-control session...\n", {
    operation: {
      operationId: runId,
      stage: "processing",
      label: "Starting remote-control",
      cancellable: true,
    },
  });

  console.log(`[remote-control] spawning claude remote-control (runId=${runId})`);

  const proc = spawn(CLAUDE_EXE, ["remote-control"], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  activeProcesses.set(runId, proc);

  const onData = (chunk: Buffer) => {
    const text = chunk.toString("utf-8");
    sendDelta(text, {
      operation: {
        operationId: runId,
        stage: "streaming",
        label: "Remote-control active",
        cancellable: true,
      },
    });
  };

  proc.stdout?.on("data", onData);
  proc.stderr?.on("data", onData);

  proc.on("close", (code) => {
    activeProcesses.delete(runId);
    console.log(`[remote-control] process exited with code ${code}`);
    if (code === 0 || code === null) {
      sendDelta("Remote-control session ended.\n");
      sendFinal();
    } else {
      sendError(`Remote-control exited with code ${code}`);
    }
  });

  proc.on("error", (err) => {
    activeProcesses.delete(runId);
    console.error(`[remote-control] spawn error:`, err.message);
    sendError(`Failed to start remote-control: ${err.message}`);
  });
}
