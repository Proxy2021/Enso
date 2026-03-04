/**
 * Frontend Error Reporter — sends client errors to the backend via WebSocket.
 *
 * Usage:
 *   initErrorReporter(sendFn)       — call once when WS connects
 *   setupGlobalErrorHandlers()      — call once at app startup
 *   reportError(message, source)    — call from any catch block
 */

import type { ClientMessage } from "@shared/types";

type ErrorSource =
  | "unhandled"
  | "unhandled_rejection"
  | "react_boundary"
  | "ws"
  | "sandbox"
  | "card_render"
  | "manual";

let _send: ((msg: ClientMessage) => void) | null = null;
const _recent = new Map<string, number>();
const DEDUP_MS = 5000;

/** Wire up the send function (call once when WS client is created). */
export function initErrorReporter(send: (msg: ClientMessage) => void): void {
  _send = send;
}

/** Report an error to the backend. Deduplicates identical messages within 5s. */
export function reportError(
  message: string,
  source: ErrorSource,
  extra?: { stack?: string; componentStack?: string },
): void {
  if (!_send) return;

  const now = Date.now();
  const key = `${source}:${message}`;
  const lastSent = _recent.get(key);
  if (lastSent && now - lastSent < DEDUP_MS) return;
  _recent.set(key, now);

  // Clean stale entries
  for (const [k, ts] of _recent) {
    if (now - ts > DEDUP_MS * 2) _recent.delete(k);
  }

  _send({
    type: "client.error",
    clientError: {
      message: message.slice(0, 500),
      source,
      stack: extra?.stack?.slice(0, 2000),
      componentStack: extra?.componentStack?.slice(0, 1000),
      url: window.location.href,
      timestamp: now,
    },
  });
}

/** Register global window error handlers. Call once at app startup. */
export function setupGlobalErrorHandlers(): void {
  window.addEventListener("error", (event) => {
    reportError(event.message || "Unknown error", "unhandled", {
      stack: event.error?.stack,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason ?? "Unknown rejection");
    reportError(message, "unhandled_rejection", {
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
