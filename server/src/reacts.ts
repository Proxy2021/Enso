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
  type: "briefing" | "pulse" | "sprint-complete" | "alert" | "checkin" | "discovery" | "card" | "focus" | "entity" | "sprint" | "deliverable" | "direct" | "factor-strategies" | "book-recommendation" | "youtube-daily" | "focus-progress" | "stocks-daily";
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
  /** Full briefing HTML for landing page re-rendering. Optional. */
  briefingHtml?: string;
  /** Short subject line of the email (e.g. "FactorStrategies Daily — 2026-04-18 Saturday") */
  subject?: string;
  /** Interactive card snapshot for /share/<id> landing pages. */
  card?: SharedCardSnapshot;
}

/**
 * A card snapshot attached to a notification. Lets the recipient open
 * /share/<notificationId> and interact with the same JSX template that
 * renders inside the chat — buttons trigger executor calls scoped to
 * the allowedActions whitelist.
 */
export interface SharedCardSnapshot {
  /** App family id (e.g. "stocks_daily") used to resolve the tool prefix. */
  appId: string;
  /** Tool prefix, e.g. "enso_stocks_daily_". */
  toolPrefix: string;
  /** Primary tool name (used by /refresh), e.g. "enso_stocks_daily_today". */
  primaryToolName: string;
  /** JSX template source — frozen at send time so the share view stays stable. */
  templateJSX: string;
  /** Most recent executor output. Updated by /action and /refresh calls. */
  data: unknown;
  /** Action suffixes that the recipient is allowed to invoke from /share. */
  allowedActions: string[];
  /** Whether /refresh is enabled (re-runs primary tool). */
  refreshable: boolean;
  /** Page title shown above the card. */
  title: string;
  /** Optional days until snapshot expires. Defaults to NOTIFICATION_TTL_DAYS (7). */
  ttlDays?: number;
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
  /** Attached image URLs (media paths like /media/...) */
  imageUrls?: string[];
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
  // Keep registry compact — prune contexts past their per-snapshot TTL (default 7 days).
  const now = Date.now();
  const defaultMs = 7 * 24 * 60 * 60 * 1000;
  for (const [id, ctx] of Object.entries(reg.contexts)) {
    const ttlMs = (ctx.card?.ttlDays ?? 7) * 24 * 60 * 60 * 1000;
    const ageMs = now - new Date(ctx.sentAt).getTime();
    if (ageMs > Math.max(ttlMs, defaultMs)) delete reg.contexts[id];
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
 * Attach the full briefing HTML (and optional updated subject) to an already-
 * registered notification. Called after send so the /briefing/<id> landing
 * page can re-render the exact email the user received.
 */
export function storeBriefingHtml(notificationId: string, briefingHtml: string, subject?: string): void {
  const reg = loadContextRegistry();
  const ctx = reg.contexts[notificationId];
  if (!ctx) return;
  ctx.briefingHtml = briefingHtml;
  if (subject) ctx.subject = subject;
  saveContextRegistry(reg);
}

/**
 * Attach an interactive card snapshot to a notification. Enables the
 * /share/<id> landing page to render the card and accept actions.
 */
export function attachCardSnapshot(notificationId: string, snapshot: SharedCardSnapshot): void {
  const reg = loadContextRegistry();
  const ctx = reg.contexts[notificationId];
  if (!ctx) return;
  ctx.card = snapshot;
  saveContextRegistry(reg);
}

/**
 * Update only the live `data` portion of an attached snapshot — used by
 * /share/<id>/action and /refresh to persist executor results without
 * reissuing the template.
 */
export function updateSnapshotData(notificationId: string, data: unknown): boolean {
  const reg = loadContextRegistry();
  const ctx = reg.contexts[notificationId];
  if (!ctx?.card) return false;
  ctx.card.data = data;
  saveContextRegistry(reg);
  return true;
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
  /** Attached image URLs (media paths) */
  imageUrls?: string[];
  /** Target a specific agent. Defaults to TL. */
  agentTarget?: { agent: "tl" } | { agent: "expert"; focusId: string; expertId: string };
}): React {
  const react: React = {
    id: randomUUID(),
    channel: params.channel,
    context: params.context,
    text: params.text,
    action: params.action,
    imageUrls: params.imageUrls?.length ? params.imageUrls : undefined,
    timestamp: new Date().toISOString(),
    processed: false,
  };

  const reacts = loadReacts();
  reacts.push(react);
  saveReacts(reacts);

  const target = params.agentTarget || { agent: "tl" as const };
  const targetLabel = target.agent === "tl" ? "TL" : `expert:${(target as any).expertId}`;

  logAction({
    ts: Date.now(), type: "action", category: "reacts",
    message: `React received via ${params.channel} → ${targetLabel}: "${params.text.slice(0, 80)}" (re: ${params.context.type}/${params.context.summary.slice(0, 40)})`,
  });

  // Fire agent event — target agent processes the react immediately.
  import("./team-leader.js").then(({ processEvent, createEvent }) => {
    processEvent(createEvent("react.received", target, {
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
 * Build the HTML for the /briefing/<notificationId> landing page.
 * Re-renders the full briefing email inline + a react section at the bottom.
 * This is the "full version" link target from briefing email footers.
 */
export function buildBriefingPage(notificationId: string): string {
  const context = getNotificationContext(notificationId);
  if (!context) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Enso — Briefing</title>
<style>body{background:#0f172a;color:#f1f5f9;font-family:-apple-system,sans-serif;padding:40px 20px;margin:0;text-align:center}</style>
</head><body><h1 style="font-size:20px">Briefing not found</h1>
<p style="color:#9ca3af">This notification may have expired (briefings are kept for 7 days).</p>
</body></html>`;
  }

  const briefingHtml = context.briefingHtml || `<p style="color:#9ca3af">Briefing body not preserved for this notification.</p>`;
  const subject = context.subject || `Enso Briefing (${context.type})`;
  const sentAt = new Date(context.sentAt).toLocaleString();

  // Type-specific action panel (shown between briefing + react form).
  // FactorStrategies notifications get a "Portfolio Check-in" button that runs
  // portfolio_manager.py checkin KK_Live and streams the result back.
  const customActionsHtml = buildCustomActionsHtml(context, notificationId);

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${subject.replace(/[<>"]/g, "")}</title>
<style>
  body { background:#0a0a1a; color:#f1f5f9; font-family:-apple-system,Segoe UI,sans-serif; margin:0; padding:0; }
  .wrap { max-width:720px; margin:0 auto; padding:24px 16px 80px; }
  .meta { color:#6b7280; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0 0 8px; }
  .subject { font-size:22px; margin:0 0 20px; }
  .briefing { background:#141428; border-radius:12px; padding:8px; }
  .custom-actions { margin-top:24px; background:linear-gradient(135deg,#1e1b4b,#312e81); border-radius:12px; padding:20px 24px; }
  .custom-actions h3 { font-size:15px; margin:0 0 4px; color:#c4b5fd; }
  .custom-actions p { color:#a5b4fc; font-size:13px; margin:0 0 14px; }
  .action-btn { background:#10b981; color:#fff; border:none; padding:11px 22px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; }
  .action-btn:hover { background:#059669; }
  .action-btn:disabled { background:#4b5563; cursor:not-allowed; }
  .action-output { margin-top:14px; background:#0f172a; border:1px solid #1f2937; border-radius:8px; padding:14px; max-height:420px; overflow:auto; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:12px; color:#e2e8f0; white-space:pre-wrap; word-break:break-word; line-height:1.45; }
  .action-output.err { border-color:#7f1d1d; color:#fca5a5; }
  .react-form { margin-top:32px; background:#1e293b; border-radius:12px; padding:24px; }
  .react-form h3 { font-size:16px; margin:0 0 12px; }
  textarea { width:100%; min-height:100px; background:#0f172a; border:1px solid #334155; border-radius:8px; color:#f1f5f9; padding:12px; font-size:14px; resize:vertical; box-sizing:border-box; margin:0 0 12px; font-family:inherit; }
  textarea:focus { outline:none; border-color:#7c3aed; }
  .reply-btn { background:#7c3aed; color:#fff; border:none; padding:10px 24px; border-radius:8px; font-size:14px; cursor:pointer; }
  .reply-btn:hover { background:#6d28d9; }
  .ok { color:#10b981; padding:20px 0; text-align:center; }
</style>
</head><body>
<div class="wrap">
  <p class="meta">Re: ${context.type} · sent ${sentAt}</p>
  <h1 class="subject">${subject}</h1>
  <div class="briefing">${briefingHtml}</div>
  ${customActionsHtml}
  <div class="react-form" id="react">
    <h3>Send a reply to Team Leader</h3>
    <p style="color:#9ca3af;font-size:13px;margin:0 0 12px">Your reply gets queued and processed on the next TL check-in.</p>
    <form id="form">
      <textarea name="text" placeholder="Thoughts, follow-up instructions, or context..."></textarea>
      <button type="submit" class="reply-btn">Send</button>
    </form>
  </div>
</div>
<script>
document.getElementById('form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const text = this.querySelector('textarea').value.trim();
  if (!text) return;
  try {
    const res = await fetch('/api/reacts/web', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: '${notificationId}', text }),
    });
    if (res.ok) {
      document.getElementById('react').innerHTML = '<div class="ok"><h3 style="color:#10b981;margin:0 0 4px">Received</h3><p style="color:#9ca3af;margin:0">Your reply was queued for the Team Leader.</p></div>';
    } else { alert('Failed to send. Please try again.'); }
  } catch(err) { alert('Failed to send. Please try again.'); }
});
</script>
</body></html>`;
}

/**
 * Render notification-type-specific action panels on the briefing landing page.
 * Extend this as new briefing types need their own backend-invoking buttons.
 */
function buildCustomActionsHtml(context: NotificationContext, notificationId: string): string {
  if (context.type === "factor-strategies") {
    return `<div class="custom-actions">
  <h3>💰 Portfolio Check-in</h3>
  <p>Run <code style="background:#0f172a;padding:2px 6px;border-radius:4px;font-size:12px;">portfolio_manager.py checkin KK_Live</code> against the live Futu account. Rebalances to today's consensus holdings and submits orders.</p>
  <button class="action-btn" id="pm-checkin-btn" data-nid="${notificationId}">Run Portfolio Check-in →</button>
  <div class="action-output" id="pm-checkin-output" style="display:none"></div>
</div>
<script>
(function() {
  const btn = document.getElementById('pm-checkin-btn');
  const out = document.getElementById('pm-checkin-output');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const nid = btn.dataset.nid;
    btn.disabled = true;
    btn.textContent = 'Running… (may take 20-60s)';
    out.style.display = 'block';
    out.classList.remove('err');
    out.textContent = '⏳ Spawning portfolio_manager.py checkin KK_Live...\\n';
    try {
      const res = await fetch('/api/factor-strategies/portfolio-checkin?nid=' + encodeURIComponent(nid), { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        btn.textContent = '✓ Check-in complete';
        btn.style.background = '#059669';
        out.textContent = data.output || '(no output)';
      } else {
        btn.textContent = '✗ Check-in failed — retry';
        btn.disabled = false;
        btn.style.background = '#dc2626';
        out.classList.add('err');
        out.textContent = '[ERROR] ' + (data.error || 'unknown') + '\\n\\n' + (data.output || '');
      }
    } catch (err) {
      btn.textContent = '✗ Request failed — retry';
      btn.disabled = false;
      out.classList.add('err');
      out.textContent = '[NETWORK ERROR] ' + err.message;
    }
  });
})();
</script>`;
  }
  return "";
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
