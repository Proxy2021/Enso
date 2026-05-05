/**
 * youtube-auth-state.ts — Lightweight token health state for YouTube OAuth2.
 *
 * In-memory + disk-persisted. Single source of truth for auth status.
 * Used by callWithAuthGuard (reactive) and Team Leader (proactive).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface YouTubeAuthState {
  status: "valid" | "expired" | "warning" | "unknown";
  lastChecked: number;
  lastError?: string;
  consecutiveFailures: number;
  lastReauthNotified?: number;
  lastAuthSuccess?: number;
}

const STATE_PATH = join(homedir(), ".enso", "data", "youtube-auth-state.json");
const NOTIFY_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

let state: YouTubeAuthState = { status: "unknown", lastChecked: 0, consecutiveFailures: 0 };

function loadFromDisk(): void {
  try {
    if (existsSync(STATE_PATH)) {
      const raw = JSON.parse(readFileSync(STATE_PATH, "utf-8"));
      state = { ...state, ...raw };
    }
  } catch { /* start fresh */ }
}

function persistToDisk(): void {
  try {
    mkdirSync(join(homedir(), ".enso", "data"), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  } catch { /* non-fatal */ }
}

loadFromDisk();

export function getAuthState(): YouTubeAuthState {
  return { ...state };
}

export function setAuthValid(): void {
  state.status = "valid";
  state.lastChecked = Date.now();
  state.lastError = undefined;
  state.consecutiveFailures = 0;
  persistToDisk();
}

export function setAuthExpired(error: string): YouTubeAuthState {
  state.status = "expired";
  state.lastChecked = Date.now();
  state.lastError = error;
  state.consecutiveFailures += 1;
  persistToDisk();
  return { ...state };
}

export function shouldNotify(): boolean {
  if (state.consecutiveFailures === 0) return false;
  if (!state.lastReauthNotified) return true;
  return Date.now() - state.lastReauthNotified > NOTIFY_COOLDOWN_MS;
}

export function markNotified(): void {
  state.lastReauthNotified = Date.now();
  persistToDisk();
}

export function clearAuthState(): void {
  state.status = "valid";
  state.lastChecked = Date.now();
  state.lastError = undefined;
  state.consecutiveFailures = 0;
  state.lastReauthNotified = undefined;
  state.lastAuthSuccess = Date.now();
  persistToDisk();
}

export function setAuthWarning(): void {
  state.status = "warning";
  state.lastChecked = Date.now();
  persistToDisk();
}

export function getTokenAgeDays(): number {
  if (!state.lastAuthSuccess) return Infinity;
  return (Date.now() - state.lastAuthSuccess) / 86_400_000;
}

export function setLastAuthSuccess(): void {
  state.lastAuthSuccess = Date.now();
  persistToDisk();
}
