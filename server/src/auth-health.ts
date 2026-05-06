/**
 * auth-health.ts — Per-service authentication health monitor.
 *
 * Generalizes YouTube's auth-state pattern to all services. Tracks health,
 * throttles notifications, and exposes a REST endpoint for the error_monitor app.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { logAction, logError } from "./action-log.js";
import type { AuthErrorCode } from "./errors.js";

export type ServiceHealthStatus = "healthy" | "degraded" | "unhealthy";

export interface ServiceHealth {
  status: ServiceHealthStatus;
  lastCheck: number;
  lastError?: string;
  lastErrorCode?: AuthErrorCode;
  lastHealthy?: number;
  failureCount: number;
  lastNotified?: number;
}

type HealthMap = Record<string, ServiceHealth>;

const STATE_PATH = join(homedir(), ".enso", "data", "auth-health.json");
const NOTIFY_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

let healthState: HealthMap = {};

function loadFromDisk(): void {
  try {
    if (existsSync(STATE_PATH)) {
      healthState = JSON.parse(readFileSync(STATE_PATH, "utf-8"));
    }
  } catch { /* start fresh */ }
}

function persistToDisk(): void {
  try {
    mkdirSync(join(homedir(), ".enso", "data"), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(healthState, null, 2));
  } catch { /* non-fatal */ }
}

loadFromDisk();

function ensureService(service: string): ServiceHealth {
  if (!healthState[service]) {
    healthState[service] = { status: "healthy", lastCheck: 0, failureCount: 0 };
  }
  return healthState[service];
}

export function markHealthy(service: string): void {
  const h = ensureService(service);
  h.status = "healthy";
  h.lastCheck = Date.now();
  h.lastHealthy = Date.now();
  h.lastError = undefined;
  h.lastErrorCode = undefined;
  h.failureCount = 0;
  persistToDisk();
}

export function markUnhealthy(service: string, reason: string, code?: AuthErrorCode): void {
  const h = ensureService(service);
  h.status = "unhealthy";
  h.lastCheck = Date.now();
  h.lastError = reason;
  h.lastErrorCode = code;
  h.failureCount += 1;
  persistToDisk();
  logError("auth-health", `${service} marked unhealthy: ${reason}`, undefined, { severity: "warning" });
}

export function markDegraded(service: string, reason: string): void {
  const h = ensureService(service);
  if (h.status === "unhealthy") return;
  h.status = "degraded";
  h.lastCheck = Date.now();
  h.lastError = reason;
  h.failureCount += 1;
  persistToDisk();
}

export function shouldNotifyForService(service: string): boolean {
  const h = ensureService(service);
  if (h.status === "healthy") return false;
  if (!h.lastNotified) return true;
  return Date.now() - h.lastNotified > NOTIFY_COOLDOWN_MS;
}

export function markNotifiedForService(service: string): void {
  const h = ensureService(service);
  h.lastNotified = Date.now();
  persistToDisk();
}

export function getServiceHealth(service: string): ServiceHealth {
  return { ...ensureService(service) };
}

export function getAllHealth(): HealthMap {
  return { ...healthState };
}

/**
 * Non-blocking startup validation. Checks configured API keys by making
 * lightweight requests. Returns summary; does not block server boot.
 */
export async function validateConfiguredKeys(): Promise<void> {
  const checks: Array<{ service: string; check: () => Promise<void> }> = [];

  if (process.env.GEMINI_API_KEY) {
    checks.push({
      service: "gemini",
      async check() {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (res.status === 401 || res.status === 403) throw new Error(`HTTP ${res.status}`);
      },
    });
  }

  if (process.env.BRAVE_SEARCH_API_KEY) {
    checks.push({
      service: "brave",
      async check() {
        const res = await fetch("https://api.search.brave.com/res/v1/web/search?q=test&count=1", {
          headers: { "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY! },
          signal: AbortSignal.timeout(5000),
        });
        if (res.status === 401 || res.status === 403) throw new Error(`HTTP ${res.status}`);
      },
    });
  }

  const results = await Promise.allSettled(checks.map(async ({ service, check }) => {
    try {
      await check();
      markHealthy(service);
    } catch (err) {
      markUnhealthy(service, err instanceof Error ? err.message : String(err));
    }
  }));

  const healthy = results.filter((r) => r.status === "fulfilled").length;
  logAction({ ts: Date.now(), type: "system", category: "auth-health", message: `Startup key validation: ${healthy}/${checks.length} services healthy` });
}
