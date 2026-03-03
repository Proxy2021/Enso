import { spawn } from "child_process";
import { randomUUID } from "crypto";
import type { ConnectedClient } from "./server.js";
import type { ServerMessage } from "./types.js";

const CLAUDE_EXE = "C:\\Users\\Administrator\\.local\\bin\\claude.exe";

/** No active processes — remote-control now launches a standalone terminal window. */
export function cancelRemoteControl(_runId: string): boolean {
  return false;
}

/**
 * Launch `claude remote-control` in a new native terminal window on the remote
 * machine, instead of streaming its output into an Enso terminal card.
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

  const sendFinal = (text?: string) => {
    if (resultSent) return;
    resultSent = true;
    if (text) sendDelta(text);
    send({
      state: "final",
      operation: {
        operationId: runId,
        stage: "complete",
        label: "Terminal launched",
        cancellable: false,
      },
    });
  };

  const sendError = (text: string) => {
    if (resultSent) return;
    resultSent = true;
    send({
      state: "error",
      text,
      operation: {
        operationId: runId,
        stage: "error",
        label: "Failed",
        cancellable: false,
      },
    });
  };

  console.log(`[remote-control] launching claude remote-control in new terminal window (runId=${runId})`);

  // Open a new visible cmd window on the remote machine running claude remote-control.
  // "cmd /c start <title> cmd /k <exe> remote-control" spawns an independent window
  // that is fully detached from the Enso process — no output is streamed into Enso.
  const proc = spawn(
    "cmd",
    ["/c", "start", "Claude Remote-Control", "cmd", "/k", CLAUDE_EXE, "remote-control"],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    },
  );

  proc.on("error", (err) => {
    console.error(`[remote-control] failed to launch terminal window:`, err.message);
    sendError(`Failed to launch remote-control terminal: ${err.message}`);
  });

  proc.unref();

  // Report success after a brief moment to let the window open.
  // The launched terminal is fully independent — errors will appear there, not here.
  setTimeout(() => {
    sendFinal("Claude remote-control launched in a new terminal window on the remote machine.\n");
  }, 300);
}
