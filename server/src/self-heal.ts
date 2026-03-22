/**
 * self-heal.ts — In-process health monitoring for the Enso server.
 *
 * Monitors event loop latency, memory pressure, and error rates.
 * Sends IPC heartbeats to the guardian process when running under
 * guardian supervision. Triggers controlled restarts when thresholds
 * are exceeded.
 */

import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";

// ── Thresholds ──

const ERROR_WINDOW_MS = 5 * 60_000;
const ERROR_BUDGET = 50;
const MEMORY_WARNING_RATIO = 0.70;
const MEMORY_CRITICAL_MB = 1536;
const MEMORY_CHECK_MS = 30_000;
const EVENT_LOOP_CHECK_MS = 5_000;
const EVENT_LOOP_BLOCK_FACTOR = 3;
const HEARTBEAT_MS = 5_000;
const HEAP_GROWTH_CHECKS = 5;
const HEAP_GROWTH_THRESHOLD_MB = 50;

export interface SelfHealMetrics {
  uptimeMs: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  eventLoopP99Ms: number;
  eventLoopMaxMs: number;
  errorsLast5Min: number;
  memoryWarning: boolean;
  memoryCritical: boolean;
}

interface SelfHealOpts {
  onRestartNeeded: (reason: string) => void;
}

export function startSelfHealing(opts: SelfHealOpts) {
  const startTime = Date.now();
  const errorTimestamps: number[] = [];
  let memoryWarning = false;
  let memoryCritical = false;
  let restartRequested = false;
  let lastEventLoopTick = Date.now();
  const heapHistory: number[] = [];

  // Event loop delay histogram (nanosecond resolution)
  let histogram: IntervalHistogram | undefined;
  try {
    histogram = monitorEventLoopDelay({ resolution: 20 });
    histogram.enable();
  } catch {
    // Not available — fall back to drift detection only
  }

  // ── Event loop freeze detection ──
  // If the interval fires much later than expected, the loop was blocked.
  const eventLoopTimer = setInterval(() => {
    const now = Date.now();
    const elapsed = now - lastEventLoopTick;
    if (elapsed > EVENT_LOOP_CHECK_MS * EVENT_LOOP_BLOCK_FACTOR) {
      const blockMs = elapsed - EVENT_LOOP_CHECK_MS;
      console.warn(`[enso:self-heal] Event loop blocked for ~${blockMs}ms`);
      recordError(new Error(`Event loop blocked for ${blockMs}ms`));
    }
    lastEventLoopTick = now;
  }, EVENT_LOOP_CHECK_MS);

  // ── Memory pressure monitoring ──
  const memoryTimer = setInterval(() => {
    const mem = process.memoryUsage();
    const heapUsedMB = mem.heapUsed / 1_048_576;
    const heapTotalMB = mem.heapTotal / 1_048_576;
    const rssMB = mem.rss / 1_048_576;

    heapHistory.push(heapUsedMB);
    if (heapHistory.length > HEAP_GROWTH_CHECKS) heapHistory.shift();

    if (heapHistory.length === HEAP_GROWTH_CHECKS) {
      const growth = heapHistory[heapHistory.length - 1] - heapHistory[0];
      if (growth > HEAP_GROWTH_THRESHOLD_MB) {
        console.warn(
          `[enso:self-heal] Possible memory leak: heap grew ${growth.toFixed(0)}MB over ${HEAP_GROWTH_CHECKS} checks`,
        );
      }
    }

    memoryWarning = heapUsedMB / heapTotalMB > MEMORY_WARNING_RATIO;
    if (memoryWarning) {
      console.warn(
        `[enso:self-heal] Memory warning: heap ${heapUsedMB.toFixed(0)}/${heapTotalMB.toFixed(0)}MB ` +
          `(${((heapUsedMB / heapTotalMB) * 100).toFixed(0)}%)`,
      );
      if (typeof globalThis.gc === "function") globalThis.gc();
    }

    memoryCritical = rssMB > MEMORY_CRITICAL_MB;
    if (memoryCritical && !restartRequested) {
      console.error(
        `[enso:self-heal] Memory CRITICAL: RSS ${rssMB.toFixed(0)}MB exceeds ${MEMORY_CRITICAL_MB}MB`,
      );
      requestRestart(`Memory critical: RSS ${rssMB.toFixed(0)}MB`);
    }
  }, MEMORY_CHECK_MS);

  // ── IPC heartbeat to guardian ──
  const heartbeatTimer = process.send
    ? setInterval(() => {
        try {
          const mem = process.memoryUsage();
          process.send!({
            type: "heartbeat",
            ts: Date.now(),
            memory: {
              heapUsedMB: Math.round(mem.heapUsed / 1_048_576),
              rssMB: Math.round(mem.rss / 1_048_576),
            },
            eventLoopP99Ms: histogram
              ? Math.round(histogram.percentile(99) / 1e6)
              : -1,
            errorCount: pruneAndCount(),
          });
        } catch {
          // Guardian may have disconnected — harmless
        }
      }, HEARTBEAT_MS)
    : undefined;

  function pruneAndCount(): number {
    const cutoff = Date.now() - ERROR_WINDOW_MS;
    while (errorTimestamps.length > 0 && errorTimestamps[0] < cutoff) {
      errorTimestamps.shift();
    }
    return errorTimestamps.length;
  }

  function requestRestart(reason: string) {
    if (restartRequested) return;
    restartRequested = true;
    opts.onRestartNeeded(reason);
  }

  function recordError(err: unknown) {
    errorTimestamps.push(Date.now());
    const count = pruneAndCount();
    if (count >= ERROR_BUDGET && !restartRequested) {
      console.error(
        `[enso:self-heal] Error budget exceeded: ${count} errors in 5min`,
      );
      requestRestart(`Error budget exceeded: ${count} errors in 5min`);
    }
  }

  function metrics(): SelfHealMetrics {
    const mem = process.memoryUsage();
    return {
      uptimeMs: Date.now() - startTime,
      heapUsedMB: Math.round(mem.heapUsed / 1_048_576),
      heapTotalMB: Math.round(mem.heapTotal / 1_048_576),
      rssMB: Math.round(mem.rss / 1_048_576),
      eventLoopP99Ms: histogram
        ? Math.round(histogram.percentile(99) / 1e6)
        : -1,
      eventLoopMaxMs: histogram ? Math.round(histogram.max / 1e6) : -1,
      errorsLast5Min: pruneAndCount(),
      memoryWarning,
      memoryCritical,
    };
  }

  function stop() {
    clearInterval(eventLoopTimer);
    clearInterval(memoryTimer);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (histogram) histogram.disable();
  }

  return { metrics, recordError, stop };
}
