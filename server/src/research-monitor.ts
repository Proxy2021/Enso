/**
 * research-monitor.ts — Recurring topic monitoring.
 *
 * Watches research topics for changes by periodically re-running quick research
 * and comparing findings against a stored baseline. Notifies connected clients
 * when significant changes are detected.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { logAction, logError } from "./action-log.js";

// ── Types ──

export interface MonitoredTopic {
  id: string;
  topic: string;
  baselineFindings: string[];
  lastChecked: number;
  intervalMs: number;
  createdAt: number;
  enabled: boolean;
}

interface MonitorChange {
  changed: boolean;
  newFindings: string[];
  removedFindings: string[];
}

// ── Persistence ──

const MONITOR_DIR = join(homedir(), ".enso", "data", "researcher");
const MONITOR_FILE = join(MONITOR_DIR, "monitors.json");
const MAX_MONITORS = 10;

function ensureDir(): void {
  if (!existsSync(MONITOR_DIR)) {
    mkdirSync(MONITOR_DIR, { recursive: true });
  }
}

function loadMonitors(): MonitoredTopic[] {
  try {
    ensureDir();
    if (!existsSync(MONITOR_FILE)) return [];
    return JSON.parse(readFileSync(MONITOR_FILE, "utf-8")) as MonitoredTopic[];
  } catch {
    return [];
  }
}

function saveMonitors(monitors: MonitoredTopic[]): void {
  try {
    ensureDir();
    writeFileSync(MONITOR_FILE, JSON.stringify(monitors, null, 2), "utf-8");
  } catch (err) {
    logError("research-monitor", "Failed to save monitors", err);
  }
}

// ── Public API ──

export function addMonitor(topic: string, baselineFindings: string[]): MonitoredTopic | null {
  const monitors = loadMonitors();

  // Check limit
  if (monitors.length >= MAX_MONITORS) {
    logAction({ ts: Date.now(), type: "action", category: "research-monitor", message: `Monitor limit reached (${MAX_MONITORS}), cannot add "${topic}"` });
    return null;
  }

  // Check duplicate
  const existing = monitors.find((m) => m.topic.toLowerCase() === topic.toLowerCase());
  if (existing) {
    // Update baseline
    existing.baselineFindings = baselineFindings;
    existing.enabled = true;
    existing.lastChecked = Date.now();
    saveMonitors(monitors);
    return existing;
  }

  const monitor: MonitoredTopic = {
    id: randomUUID().slice(0, 8),
    topic,
    baselineFindings,
    lastChecked: Date.now(),
    intervalMs: 6 * 60 * 60 * 1000, // 6 hours
    createdAt: Date.now(),
    enabled: true,
  };

  monitors.push(monitor);
  saveMonitors(monitors);

  logAction({ ts: Date.now(), type: "action", category: "research-monitor", message: `Added monitor: "${topic}" (${monitor.id})` });
  return monitor;
}

export function removeMonitor(id: string): boolean {
  const monitors = loadMonitors();
  const idx = monitors.findIndex((m) => m.id === id);
  if (idx < 0) return false;

  monitors.splice(idx, 1);
  saveMonitors(monitors);

  logAction({ ts: Date.now(), type: "action", category: "research-monitor", message: `Removed monitor: ${id}` });
  return true;
}

export function listMonitors(): MonitoredTopic[] {
  return loadMonitors();
}

// ── Change Detection ──

/**
 * Compare new findings against baseline using Jaccard similarity on text.
 * Returns changed=true if similarity < 0.7 or new findings detected.
 */
function detectChanges(baseline: string[], current: string[]): MonitorChange {
  const baseSet = new Set(baseline.map((f) => f.toLowerCase().trim()));
  const currSet = new Set(current.map((f) => f.toLowerCase().trim()));

  const newFindings = current.filter((f) => !baseSet.has(f.toLowerCase().trim()));
  const removedFindings = baseline.filter((f) => !currSet.has(f.toLowerCase().trim()));

  // Jaccard similarity
  const union = new Set([...baseSet, ...currSet]);
  const intersection = [...baseSet].filter((f) => currSet.has(f));
  const similarity = union.size > 0 ? intersection.length / union.size : 1;

  return {
    changed: similarity < 0.7 || newFindings.length > 0,
    newFindings,
    removedFindings,
  };
}

// ── Monitor Loop ──

let loopInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background monitor loop. Checks all enabled monitors on their interval.
 * Calls `onUpdate` with changes for notification to connected clients.
 */
export function startMonitorLoop(params: {
  onUpdate: (topic: string, changes: { newFindings: string[]; removedFindings: string[] }) => void;
  geminiApiKey?: string;
}): void {
  if (loopInterval) return; // Already running

  const CHECK_INTERVAL = 30 * 60 * 1000; // Check every 30 minutes if any monitors are due

  loopInterval = setInterval(async () => {
    const monitors = loadMonitors();
    const now = Date.now();

    for (const monitor of monitors) {
      if (!monitor.enabled) continue;
      if (now - monitor.lastChecked < monitor.intervalMs) continue;

      try {
        logAction({ ts: now, type: "action", category: "research-monitor", message: `Checking monitor: "${monitor.topic}"` });

        // Dynamic import to avoid circular dependencies
        const { researcherSearchDirect } = await import("./researcher-tools.js");
        if (!researcherSearchDirect) continue;

        const result = await researcherSearchDirect({ topic: monitor.topic, depth: "quick" });
        if (!result) continue;

        const currentFindings = (result.keyFindings ?? []).map((f: { text: string }) => f.text);
        const changes = detectChanges(monitor.baselineFindings, currentFindings);

        // Update lastChecked
        monitor.lastChecked = now;
        if (changes.changed) {
          monitor.baselineFindings = currentFindings; // Update baseline
        }
        saveMonitors(monitors);

        if (changes.changed && (changes.newFindings.length > 0 || changes.removedFindings.length > 0)) {
          logAction({ ts: now, type: "action", category: "research-monitor", message: `Changes detected for "${monitor.topic}": +${changes.newFindings.length} -${changes.removedFindings.length}` });
          params.onUpdate(monitor.topic, changes);
        }
      } catch (err) {
        logError("research-monitor", `Check failed for "${monitor.topic}"`, err);
        // Update lastChecked even on failure to avoid retrying immediately
        monitor.lastChecked = now;
        saveMonitors(monitors);
      }
    }
  }, CHECK_INTERVAL);

  logAction({ ts: Date.now(), type: "action", category: "research-monitor", message: `Monitor loop started (check interval: ${CHECK_INTERVAL / 60000}min)` });
}

export function stopMonitorLoop(): void {
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
}
