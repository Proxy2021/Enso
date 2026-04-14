/**
 * React System — Async feedback loop between Enso and user.
 *
 * Every notification Enso sends (email, WeChat, in-app) includes react actions.
 * Users can respond through any channel:
 *   - WeChat: Reply to the message → webhook captures it
 *   - Email: Click action buttons → hits /api/reacts endpoint
 *   - Web: Visit /r/<id> → simple form submission
 *   - In-app: React button on notification cards
 *
 * Reacts are queued and processed by the Team Leader on next check-in.
 * The TL decides if a react warrants a new task, priority change, or response.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { logAction, logError } from "./action-log.js";

// ── Types ──

export interface NotificationContext {
  /** What type of notification this was */
  type: "briefing" | "pulse" | "sprint-complete" | "alert" | "checkin" | "discovery";
  /** Unique ID for the notification instance */
  notificationId: string;
  /** Which focus area this relates to (if any) */
  focusId?: string;
  /** Which action from the TL's plan this relates to (if any) */
  actionId?: string;
  /** Short description of what the notification was about */
  summary: string;
  /** When the notification was sent */
  sentAt: string;
}

export interface React {
  id: string;
  /** How the user responded */
  channel: "wechat" | "email" | "web" | "in-app";
  /** The notification this is a response to */
  context: NotificationContext;
  /** User's react text */
  text: string;
  /** Quick action the user took (if any) */
  action?: "approve" | "dismiss" | "defer" | "custom";
  /** When the react was received */
  timestamp: string;
  /** Has the Team Leader processed this? */
  processed: boolean;
  processedAt?: string;
  /** What the TL decided to do with it */
  resolution?: string;
  /** Task ID created from this react (if any) */
  resultingTaskId?: string;
}

// ── Storage ──

const REACTS_PATH = join(homedir(), ".enso", "data", "reacts.json");
// Backward compat: read from old file if new one doesn't exist yet
const LEGACY_REACTS_PATH = join(homedir(), ".enso", "data", "remarks.json");
const NOTIFICATION_CONTEXT_PATH = join(homedir(), ".enso", "data", "notification-contexts.json");

// Notification context registry — maps notificationId → context
// Also tracks "last notification per channel+user" for WeChat reply association
interface ContextRegistry {
  contexts: Record<string, NotificationContext>;
  /** Last notification sent per WeChat openId — used to associate replies */
  lastWechatNotification: Record<string, string>; // openId → notificationId
  /** Last notification sent via email */
  lastEmailNotificationId: string | null;
}

function loadContextRegistry(): ContextRegistry {
  const defaults: ContextRegistry = { contexts: {}, lastWechatNotification: {}, lastEmailNotificationId: null };
  try {
    if (existsSync(NOTIFICATION_CONTEXT_PATH)) {
      const raw = JSON.parse(readFileSync(NOTIFICATION_CONTEXT_PATH, "utf-8"));
      return { ...defaults, ...raw };
    }
  } catch { /* fresh */ }
  return defaults;
}

function saveContextRegistry(reg: ContextRegistry): void {
  const dir = dirname(NOTIFICATION_CONTEXT_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Keep registry compact — prune contexts older than 7 days
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, ctx] of Object.entries(reg.contexts)) {
    if (new Date(ctx.sentAt).getTime() < cutoff) delete reg.contexts[id];
  }
  writeFileSync(NOTIFICATION_CONTEXT_PATH, JSON.stringify(reg, null, 2), "utf-8");
}

export function loadReacts(): React[] {
  try {
    if (existsSync(REACTS_PATH)) return JSON.parse(readFileSync(REACTS_PATH, "utf-8")) as React[];
    // Backward compat: read from old remarks.json if reacts.json doesn't exist
    if (existsSync(LEGACY_REACTS_PATH)) return JSON.parse(readFileSync(LEGACY_REACTS_PATH, "utf-8")) as React[];
  } catch { /* fresh */ }
  return [];
}

function saveReacts(reacts: React[]): void {
  const dir = dirname(REACTS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Keep last 200 reacts
  const trimmed = reacts.slice(-200);
  writeFileSync(REACTS_PATH, JSON.stringify(trimmed, null, 2), "utf-8");
}

// ── Register Notification Context ──

/**
 * Register a notification that was sent. Returns the notificationId.
 * Call this every time Enso sends a notification through any channel.
 */
export function registerNotification(context: Omit<NotificationContext, "notificationId" | "sentAt">, options?: {
  wechatOpenId?: string;
  isEmail?: boolean;
}): string {
  const notificationId = randomUUID().slice(0, 12);
  const fullContext: NotificationContext = {
    ...context,
    notificationId,
    sentAt: new Date().toISOString(),
  };

  const reg = loadContextRegistry();
  reg.contexts[notificationId] = fullContext;

  if (options?.wechatOpenId) {
    reg.lastWechatNotification[options.wechatOpenId] = notificationId;
  }
  if (options?.isEmail) {
    reg.lastEmailNotificationId = notificationId;
  }

  saveContextRegistry(reg);
  return notificationId;
}

/**
 * Look up a notification context by ID.
 */
export function getNotificationContext(notificationId: string): NotificationContext | null {
  const reg = loadContextRegistry();
  return reg.contexts[notificationId] ?? null;
}

/**
 * Get the last notification sent to a WeChat user (for reply association).
 */
export function getLastWechatNotification(openId: string): NotificationContext | null {
  const reg = loadContextRegistry();
  const nId = reg.lastWechatNotification[openId];
  if (!nId) return null;
  return reg.contexts[nId] ?? null;
}

// ── Submit Reacts ──

/**
 * Submit a react from any channel. Queued for Team Leader processing.
 */
export function submitReact(params: {
  channel: React["channel"];
  context: NotificationContext;
  text: string;
  action?: React["action"];
}): React {
  const react: React = {
    id: randomUUID(),
    channel: params.channel,
    context: params.context,
    text: params.text,
    action: params.action,
    timestamp: new Date().toISOString(),
    processed: false,
  };

  const reacts = loadReacts();
  reacts.push(react);
  saveReacts(reacts);

  logAction({
    ts: Date.now(), type: "action", category: "reacts",
    message: `React received via ${params.channel}: "${params.text.slice(0, 80)}" (re: ${params.context.type}/${params.context.summary.slice(0, 40)})`,
  });

  // Fire agent event — TL processes the react immediately.
  // TL may decide to delegate to an expert based on context.
  import("./team-leader.js").then(({ processEvent, createEvent }) => {
    processEvent(createEvent("react.received", { agent: "tl" }, {
      reactId: react.id,
      focusId: params.context.focusId,
      contextType: params.context.type,
    }, "user"));
  }).catch(() => {});

  return react;
}

/**
 * Submit a react from a WeChat reply — auto-associates with last notification.
 */
export function submitWechatReact(openId: string, text: string): React | null {
  const context = getLastWechatNotification(openId);
  if (!context) {
    // No recent notification to associate with — store as general feedback
    return submitReact({
      channel: "wechat",
      context: {
        type: "briefing",
        notificationId: "general",
        summary: "General feedback (no specific notification context)",
        sentAt: new Date().toISOString(),
      },
      text,
      action: "custom",
    });
  }

  return submitReact({
    channel: "wechat",
    context,
    text,
    action: "custom",
  });
}

// ── Read & Process Reacts ──

/**
 * Get all unprocessed reacts (for Team Leader consumption).
 */
export function getPendingReacts(): React[] {
  return loadReacts().filter(r => !r.processed);
}

/**
 * Get all reacts (for dashboard/history).
 */
export function getAllReacts(limit = 50): React[] {
  return loadReacts().slice(-limit).reverse();
}

/**
 * Mark a react as processed by the Team Leader.
 */
export function resolveReact(reactId: string, resolution: string, taskId?: string): boolean {
  const reacts = loadReacts();
  const react = reacts.find(r => r.id === reactId);
  if (!react) return false;

  react.processed = true;
  react.processedAt = new Date().toISOString();
  react.resolution = resolution;
  if (taskId) react.resultingTaskId = taskId;

  saveReacts(reacts);

  logAction({
    ts: Date.now(), type: "action", category: "reacts",
    message: `React resolved: "${react.text.slice(0, 40)}" → ${resolution.slice(0, 60)}${taskId ? ` (task: ${taskId})` : ""}`,
  });

  return true;
}

// ── Notification Template Helpers ──

/**
 * Generate react action buttons/links for email notifications.
 * Returns HTML string with quick-action buttons.
 */
export function emailReactActions(notificationId: string, baseUrl: string): string {
  const actions = [
    { label: "Approve", action: "approve", color: "#10b981" },
    { label: "Defer", action: "defer", color: "#6b7280" },
    { label: "Reply", action: "react", color: "#7c3aed" },
  ];

  const buttons = actions.map(a => {
    const url = a.action === "react"
      ? `${baseUrl}/r/${notificationId}`
      : `${baseUrl}/api/reacts/quick?nid=${notificationId}&action=${a.action}`;
    return `<a href="${url}" style="display:inline-block;background:${a.color};color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;margin-right:8px;">${a.label}</a>`;
  }).join("");

  return `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #374151;">
    <p style="font-size:11px;color:#6b7280;margin:0 0 8px;">Quick actions:</p>
    ${buttons}
  </div>`;
}

/**
 * Generate react prompt for WeChat messages.
 * Appended to the end of WeChat notifications.
 */
export function wechatReactPrompt(): string {
  return "\n\n Reply to this message with any thoughts or instructions.";
}

/**
 * Build the HTML for the /r/<notificationId> react web form.
 */
export function buildReactPage(notificationId: string): string {
  const context = getNotificationContext(notificationId);
  const contextInfo = context
    ? `<p style="color:#9ca3af;font-size:14px;margin:8px 0 20px;">Re: ${context.type} — ${context.summary}</p>`
    : `<p style="color:#6b7280;font-size:14px;">Notification context not found (may have expired).</p>`;

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Enso — Your React</title>
<style>
  body { background:#0f172a; color:#f1f5f9; font-family:-apple-system,sans-serif; display:flex; justify-content:center; padding:40px 20px; margin:0; }
  .card { max-width:500px; width:100%; background:#1e293b; border-radius:12px; padding:32px; }
  h1 { font-size:20px; margin:0 0 4px; }
  textarea { width:100%; min-height:120px; background:#0f172a; border:1px solid #334155; border-radius:8px; color:#f1f5f9; padding:12px; font-size:15px; resize:vertical; box-sizing:border-box; margin:0 0 16px; }
  textarea:focus { outline:none; border-color:#7c3aed; }
  button { background:#7c3aed; color:#fff; border:none; padding:12px 32px; border-radius:8px; font-size:15px; cursor:pointer; width:100%; }
  button:hover { background:#6d28d9; }
  .success { text-align:center; padding:40px 0; }
  .success h2 { color:#10b981; }
</style>
</head><body>
<div class="card">
  <h1>Your React</h1>
  ${contextInfo}
  <form id="form" method="POST" action="/api/reacts/web">
    <input type="hidden" name="notificationId" value="${notificationId}">
    <textarea name="text" placeholder="Share your thoughts, instructions, or feedback..." autofocus></textarea>
    <button type="submit">Send to Enso</button>
  </form>
</div>
<script>
document.getElementById('form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const fd = new FormData(this);
  const body = { notificationId: fd.get('notificationId'), text: fd.get('text') };
  if (!body.text?.trim()) return;
  try {
    const res = await fetch('/api/reacts/web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      document.querySelector('.card').innerHTML = '<div class="success"><h2>Received</h2><p style="color:#9ca3af;">Your react has been queued. The Team Leader will process it on the next check-in.</p></div>';
    }
  } catch(err) { alert('Failed to send. Please try again.'); }
});
</script>
</body></html>`;
}
