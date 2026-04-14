/**
 * Remark System — Async feedback loop between Enso and user.
 *
 * Every notification Enso sends (email, WeChat, in-app) includes remark actions.
 * Users can respond through any channel:
 *   - WeChat: Reply to the message → webhook captures it
 *   - Email: Click action buttons → hits /api/remark endpoint
 *   - Web: Visit /r/<id> → simple form submission
 *   - In-app: Remark button on notification cards
 *
 * Remarks are queued and processed by the Team Leader on next check-in.
 * The TL decides if a remark warrants a new task, priority change, or response.
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

export interface Remark {
  id: string;
  /** How the user responded */
  channel: "wechat" | "email" | "web" | "in-app";
  /** The notification this is a response to */
  context: NotificationContext;
  /** User's remark text */
  text: string;
  /** Quick action the user took (if any) */
  action?: "approve" | "dismiss" | "defer" | "custom";
  /** When the remark was received */
  timestamp: string;
  /** Has the Team Leader processed this? */
  processed: boolean;
  processedAt?: string;
  /** What the TL decided to do with it */
  resolution?: string;
  /** Task ID created from this remark (if any) */
  resultingTaskId?: string;
}

// ── Storage ──

const REMARKS_PATH = join(homedir(), ".enso", "data", "remarks.json");
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
  try {
    if (existsSync(NOTIFICATION_CONTEXT_PATH)) {
      return JSON.parse(readFileSync(NOTIFICATION_CONTEXT_PATH, "utf-8")) as ContextRegistry;
    }
  } catch { /* fresh */ }
  return { contexts: {}, lastWechatNotification: {}, lastEmailNotificationId: null };
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

function loadRemarks(): Remark[] {
  try {
    if (existsSync(REMARKS_PATH)) return JSON.parse(readFileSync(REMARKS_PATH, "utf-8")) as Remark[];
  } catch { /* fresh */ }
  return [];
}

function saveRemarks(remarks: Remark[]): void {
  const dir = dirname(REMARKS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Keep last 200 remarks
  const trimmed = remarks.slice(-200);
  writeFileSync(REMARKS_PATH, JSON.stringify(trimmed, null, 2), "utf-8");
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

// ── Submit Remarks ──

/**
 * Submit a remark from any channel. Queued for Team Leader processing.
 */
export function submitRemark(params: {
  channel: Remark["channel"];
  context: NotificationContext;
  text: string;
  action?: Remark["action"];
}): Remark {
  const remark: Remark = {
    id: randomUUID(),
    channel: params.channel,
    context: params.context,
    text: params.text,
    action: params.action,
    timestamp: new Date().toISOString(),
    processed: false,
  };

  const remarks = loadRemarks();
  remarks.push(remark);
  saveRemarks(remarks);

  logAction({
    ts: Date.now(), type: "action", category: "remarks",
    message: `Remark received via ${params.channel}: "${params.text.slice(0, 80)}" (re: ${params.context.type}/${params.context.summary.slice(0, 40)})`,
  });

  // Fire agent event — TL processes the remark immediately.
  // TL may decide to delegate to an expert based on context.
  import("./team-leader.js").then(({ processEvent, createEvent }) => {
    processEvent(createEvent("remark.received", { agent: "tl" }, {
      remarkId: remark.id,
      focusId: params.context.focusId,
      contextType: params.context.type,
    }, "user"));
  }).catch(() => {});

  return remark;
}

/**
 * Submit a remark from a WeChat reply — auto-associates with last notification.
 */
export function submitWechatRemark(openId: string, text: string): Remark | null {
  const context = getLastWechatNotification(openId);
  if (!context) {
    // No recent notification to associate with — store as general feedback
    return submitRemark({
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

  return submitRemark({
    channel: "wechat",
    context,
    text,
    action: "custom",
  });
}

// ── Read & Process Remarks ──

/**
 * Get all unprocessed remarks (for Team Leader consumption).
 */
export function getPendingRemarks(): Remark[] {
  return loadRemarks().filter(r => !r.processed);
}

/**
 * Get all remarks (for dashboard/history).
 */
export function getAllRemarks(limit = 50): Remark[] {
  return loadRemarks().slice(-limit).reverse();
}

/**
 * Mark a remark as processed by the Team Leader.
 */
export function resolveRemark(remarkId: string, resolution: string, taskId?: string): boolean {
  const remarks = loadRemarks();
  const remark = remarks.find(r => r.id === remarkId);
  if (!remark) return false;

  remark.processed = true;
  remark.processedAt = new Date().toISOString();
  remark.resolution = resolution;
  if (taskId) remark.resultingTaskId = taskId;

  saveRemarks(remarks);

  logAction({
    ts: Date.now(), type: "action", category: "remarks",
    message: `Remark resolved: "${remark.text.slice(0, 40)}" → ${resolution.slice(0, 60)}${taskId ? ` (task: ${taskId})` : ""}`,
  });

  return true;
}

// ── Notification Template Helpers ──

/**
 * Generate remark action buttons/links for email notifications.
 * Returns HTML string with quick-action buttons.
 */
export function emailRemarkActions(notificationId: string, baseUrl: string): string {
  const actions = [
    { label: "👍 Approve", action: "approve", color: "#10b981" },
    { label: "⏸ Defer", action: "defer", color: "#6b7280" },
    { label: "💬 Reply", action: "remark", color: "#7c3aed" },
  ];

  const buttons = actions.map(a => {
    const url = a.action === "remark"
      ? `${baseUrl}/r/${notificationId}`
      : `${baseUrl}/api/remarks/quick?nid=${notificationId}&action=${a.action}`;
    return `<a href="${url}" style="display:inline-block;background:${a.color};color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;margin-right:8px;">${a.label}</a>`;
  }).join("");

  return `<div style="margin-top:16px;padding-top:12px;border-top:1px solid #374151;">
    <p style="font-size:11px;color:#6b7280;margin:0 0 8px;">Quick actions:</p>
    ${buttons}
  </div>`;
}

/**
 * Generate remark prompt for WeChat messages.
 * Appended to the end of WeChat notifications.
 */
export function wechatRemarkPrompt(): string {
  return "\n\n💬 Reply to this message with any thoughts or instructions.";
}

/**
 * Build the HTML for the /r/<notificationId> remark web form.
 */
export function buildRemarkPage(notificationId: string): string {
  const context = getNotificationContext(notificationId);
  const contextInfo = context
    ? `<p style="color:#9ca3af;font-size:14px;margin:8px 0 20px;">Re: ${context.type} — ${context.summary}</p>`
    : `<p style="color:#6b7280;font-size:14px;">Notification context not found (may have expired).</p>`;

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Enso — Your Remark</title>
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
  <h1>💬 Your Remark</h1>
  ${contextInfo}
  <form id="form" method="POST" action="/api/remarks/web">
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
    const res = await fetch('/api/remarks/web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      document.querySelector('.card').innerHTML = '<div class="success"><h2>✓ Received</h2><p style="color:#9ca3af;">Your remark has been queued. The Team Leader will process it on the next check-in.</p></div>';
    }
  } catch(err) { alert('Failed to send. Please try again.'); }
});
</script>
</body></html>`;
}
