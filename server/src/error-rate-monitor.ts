/**
 * Error Rate Monitor — Sliding-window rate tracker with alerting.
 *
 * Watches the error stream (fed by logError in action-log.ts) and fires
 * an alert callback when the rate exceeds a threshold or a critical error occurs.
 */

import type { ErrorSeverity } from "./action-log.js";
import { logAction } from "./action-log.js";

interface RateWindow {
  timestamps: number[];
  readonly windowMs: number;
  readonly threshold: number;
}

let alertCallback: ((message: string, severity: ErrorSeverity) => void) | null = null;

const rateWindow: RateWindow = {
  timestamps: [],
  windowMs: 5 * 60 * 1000,
  threshold: 20,
};

const categorySuppression = new Map<string, number>();
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;
let lastAlertTime = 0;

export function onErrorRateAlert(cb: (message: string, severity: ErrorSeverity) => void): void {
  alertCallback = cb;
}

export function suppressCategory(category: string, durationMs: number): void {
  categorySuppression.set(category, Date.now() + durationMs);
}

export function record(severity: ErrorSeverity, category: string): void {
  const now = Date.now();

  const suppressUntil = categorySuppression.get(category);
  if (suppressUntil && now < suppressUntil) return;
  if (suppressUntil && now >= suppressUntil) categorySuppression.delete(category);

  rateWindow.timestamps.push(now);

  const cutoff = now - rateWindow.windowMs;
  while (rateWindow.timestamps.length > 0 && rateWindow.timestamps[0] < cutoff) {
    rateWindow.timestamps.shift();
  }

  const shouldAlert =
    severity === "critical" ||
    rateWindow.timestamps.length > rateWindow.threshold;

  if (shouldAlert && now - lastAlertTime > ALERT_COOLDOWN_MS) {
    lastAlertTime = now;
    const msg = severity === "critical"
      ? `Critical error in ${category}`
      : `Error rate spike: ${rateWindow.timestamps.length} errors in last 5 min (threshold: ${rateWindow.threshold})`;

    logAction({
      ts: now,
      type: "system",
      category: "error-rate-monitor",
      message: msg,
      severity: "warning",
    });

    alertCallback?.(msg, severity === "critical" ? "critical" : "warning");
  }
}

export function getErrorRate(): { count: number; windowMs: number; threshold: number } {
  const now = Date.now();
  const cutoff = now - rateWindow.windowMs;
  while (rateWindow.timestamps.length > 0 && rateWindow.timestamps[0] < cutoff) {
    rateWindow.timestamps.shift();
  }
  return { count: rateWindow.timestamps.length, windowMs: rateWindow.windowMs, threshold: rateWindow.threshold };
}
