/**
 * Task Completion Notification System
 *
 * Multi-platform: works on web (desktop browser), PWA, and Capacitor native (Android/iOS).
 *
 * Web (desktop browser):
 * - Browser Notification API (system notification when tab not focused)
 * - Tab title flash ("✓ Task complete — Enso" alternating with original title)
 * - Favicon badge dot (green circle on favicon)
 * - Completion chime (Web Audio API)
 *
 * Mobile (Capacitor native):
 * - In-app toast banner (always shown — primary notification mechanism)
 * - Haptic vibration
 * - Completion chime (Web Audio API)
 *
 * Both platforms:
 * - In-app toast banner for completions that happen while user is away
 *   (mobile: app backgrounded → reconnect → replay; web: tab not focused)
 */

import { STORAGE_KEYS, TIMINGS } from "./constants";
import { isNative } from "./platform";

// ── State ──

let _permissionGranted = false;
let _enabled = true;
let _soundEnabled = true;
let _originalTitle = typeof document !== "undefined" ? document.title : "";
let _flashInterval: ReturnType<typeof setInterval> | null = null;
let _audioCtx: AudioContext | null = null;

// Favicon badge state (web only)
let _originalFavicon: string | null = null;
let _badgeActive = false;

// Toast queue — consumed by the ToastContainer React component
type ToastEntry = {
  id: number;
  title: string;
  body: string;
  success: boolean;
  timestamp: number;
};
let _toastIdCounter = 0;
let _toasts: ToastEntry[] = [];
let _toastListeners: Array<(toasts: ToastEntry[]) => void> = [];

// Track whether app was recently in background (for mobile reconnect detection)
let _wasBackgrounded = false;
let _backgroundedAt = 0;

// ── Page Visibility ──

export function isPageVisible(): boolean {
  return document.visibilityState === "visible";
}

// ── Permission ──

function persistBrowserNotificationPermission(): void {
  if (isNative || !("Notification" in window)) return;
  try {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATION_PERMISSION, Notification.permission);
  } catch {
    // private mode / quota
  }
}

/** Request notification permission. Call on first long-running task start. */
export async function requestNotificationPermission(): Promise<boolean> {
  // On native, browser Notification API isn't available — skip
  if (isNative) return false;
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") {
    _permissionGranted = true;
    persistBrowserNotificationPermission();
    return true;
  }
  if (Notification.permission === "denied") {
    persistBrowserNotificationPermission();
    return false;
  }
  const result = await Notification.requestPermission();
  _permissionGranted = result === "granted";
  persistBrowserNotificationPermission();
  return _permissionGranted;
}

// ── Settings ──

export function setNotificationsEnabled(enabled: boolean): void {
  _enabled = enabled;
  localStorage.setItem("enso_notifications", enabled ? "1" : "0");
}

export function setSoundEnabled(enabled: boolean): void {
  _soundEnabled = enabled;
  localStorage.setItem("enso_notification_sound", enabled ? "1" : "0");
}

export function getNotificationsEnabled(): boolean {
  return _enabled;
}

export function getSoundEnabled(): boolean {
  return _soundEnabled;
}

/** Load persisted preferences and set up listeners. Call once at startup. */
export function initNotifications(): void {
  const notifPref = localStorage.getItem("enso_notifications");
  if (notifPref !== null) _enabled = notifPref === "1";
  const soundPref = localStorage.getItem("enso_notification_sound");
  if (soundPref !== null) _soundEnabled = soundPref === "1";

  if (!isNative) {
    if ("Notification" in window) {
      persistBrowserNotificationPermission();
      if (Notification.permission === "granted") _permissionGranted = true;
    }
    // Web: save original favicon for badge overlay
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) _originalFavicon = link.href;

    // Web: clear badge/title flash when tab becomes visible
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        clearTitleFlash();
        clearFaviconBadge();
      }
    });
  }

  // Track background state for mobile reconnect detection
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      _wasBackgrounded = true;
      _backgroundedAt = Date.now();
    }
  });
}

/**
 * Check if the app was recently backgrounded (within the last N ms).
 * Used by the store to detect "returning from background" scenario
 * where buffered completions should show toasts even though page is now visible.
 */
export function wasRecentlyBackgrounded(withinMs = 10000): boolean {
  if (!_wasBackgrounded) return false;
  return Date.now() - _backgroundedAt < withinMs;
}

/** Clear the backgrounded flag (call after processing returning-from-background toasts). */
export function clearBackgroundedFlag(): void {
  _wasBackgrounded = false;
}

// ── Completion Sound (Web Audio API — works on both web and native) ──

function playCompletionChime(): void {
  if (!_soundEnabled) return;
  try {
    if (!_audioCtx) _audioCtx = new AudioContext();
    const ctx = _audioCtx;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    // First tone (C5)
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523, now);
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Second tone (E5)
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(659, now + 0.15);
    osc2.connect(gain);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.5);
  } catch {
    // Audio not available — silent fallback
  }
}

// ── Haptic Vibration (mobile) ──

function vibrateDevice(): void {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([80, 50, 80]); // short double-tap pattern
    }
  } catch {
    // Vibration not supported
  }
}

// ── Tab Title Flash (web only) ──

function startTitleFlash(message: string): void {
  if (isNative) return;
  clearTitleFlash();
  _originalTitle = document.title;
  let showMessage = true;
  _flashInterval = setInterval(() => {
    document.title = showMessage ? message : _originalTitle;
    showMessage = !showMessage;
  }, 1500);
  document.title = message;
}

function clearTitleFlash(): void {
  if (_flashInterval) {
    clearInterval(_flashInterval);
    _flashInterval = null;
    document.title = _originalTitle;
  }
}

// ── Favicon Badge (web only) ──

function showFaviconBadge(): void {
  if (isNative || _badgeActive) return;
  _badgeActive = true;

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = new Image();
  img.crossOrigin = "anonymous";
  const src = _originalFavicon || "/icon-192.svg";

  img.onload = () => {
    ctx.drawImage(img, 0, 0, 64, 64);
    ctx.beginPath();
    ctx.arc(52, 52, 11, 0, 2 * Math.PI);
    ctx.fillStyle = "#22c55e";
    ctx.fill();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    ctx.stroke();

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = canvas.toDataURL("image/png");
  };
  img.src = src;
}

function clearFaviconBadge(): void {
  if (!_badgeActive) return;
  _badgeActive = false;

  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link && _originalFavicon) {
    link.href = _originalFavicon;
  }
}

// ── In-App Toast System ──

export function pushToast(title: string, body: string, success: boolean, dismissMs = 6000): void {
  const entry: ToastEntry = {
    id: ++_toastIdCounter,
    title,
    body,
    success,
    timestamp: Date.now(),
  };
  _toasts = [..._toasts, entry];
  for (const listener of _toastListeners) listener(_toasts);

  setTimeout(() => dismissToast(entry.id), dismissMs);
}

export function dismissToast(id: number): void {
  _toasts = _toasts.filter((t) => t.id !== id);
  for (const listener of _toastListeners) listener(_toasts);
}

/** Subscribe to toast state changes. Returns an unsubscribe function. */
export function subscribeToasts(listener: (toasts: ToastEntry[]) => void): () => void {
  _toastListeners.push(listener);
  listener(_toasts); // emit current state
  return () => {
    _toastListeners = _toastListeners.filter((l) => l !== listener);
  };
}

export type { ToastEntry };

// ── Main API ──

export type TaskCompletionType =
  | "research"
  | "build"
  | "orchestration"
  | "deep_research"
  | "claude_code"
  | "general";

interface TaskCompletion {
  type: TaskCompletionType;
  title: string;
  body?: string;
  success?: boolean;
}

/**
 * Notify the user that a long-running task has completed.
 *
 * Behavior depends on platform and visibility:
 * - Web + tab hidden: browser notification + title flash + favicon badge + chime + toast
 * - Web + tab visible but was recently backgrounded: chime + toast
 * - Native + page visible (just returned from background): vibrate + chime + toast
 * - Native + page hidden (shouldn't happen — WS disconnected): toast queued for return
 * - Page visible + not recently backgrounded: toast only (user is watching, subtle)
 */
export function notifyTaskComplete(completion: TaskCompletion): void {
  if (!_enabled) return;

  const icon = completion.success === false ? "✗" : "✓";
  const toastTitle = `${icon} ${completion.title}`;
  const toastBody = completion.body || (completion.success === false ? "Task failed" : "Task completed");

  // In-app toast (works on all platforms, all visibility states)
  const isUserAway = !isPageVisible() || wasRecentlyBackgrounded();
  pushToast(toastTitle, toastBody, completion.success !== false, isUserAway ? TIMINGS.NOTIFICATION_DURATION : 5000);

  if (isNative) {
    // ── Mobile path ──
    // Vibrate + chime (if page visible — user just returned from background)
    vibrateDevice();
    playCompletionChime();
  } else {
    // ── Web path ──
    if (!isPageVisible()) {
      // Tab not focused: full notification suite
      const titleMsg = `${icon} ${completion.title} — Enso`;
      startTitleFlash(titleMsg);
      showFaviconBadge();
      playCompletionChime();

      // Browser notification
      if (_permissionGranted && "Notification" in window) {
        try {
          const notif = new Notification(completion.title, {
            body: toastBody,
            icon: "/icon-192.svg",
            tag: "enso-task-complete",
            silent: true, // We play our own sound
          });
          setTimeout(() => notif.close(), TIMINGS.NOTIFICATION_DURATION);
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        } catch {
          // Notification API not available
        }
      }
    } else if (wasRecentlyBackgrounded()) {
      // Tab visible but user just came back — play chime for the returning toast
      playCompletionChime();
    }
    // else: user is actively watching — toast alone is sufficient
  }
}
