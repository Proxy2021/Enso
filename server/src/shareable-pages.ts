/**
 * shareable-pages.ts — Unified page renderer and hosting for Enso.
 *
 * Build one beautiful hosted page, share the URL everywhere (email, WeChat, browser).
 * All pages are dark-themed, mobile-friendly, and persisted to ~/.enso/pages/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir, hostname } from "os";
import { logAction, logError } from "./action-log.js";

// ── Server Base URL (set once at startup, used by page-tools and sharePage) ──

let _serverBaseUrl = "";

/** Set the external base URL for this server (e.g. "https://mac.enso.net"). Called at server startup. */
export function setServerBaseUrl(url: string): void { _serverBaseUrl = url; }

/** Get the external base URL. Falls back to env vars or hostname. */
export function getServerBaseUrl(): string {
  if (_serverBaseUrl) return _serverBaseUrl;
  const name = process.env.ENSO_MACHINE_NAME || hostname();
  return process.env.ENSO_TUNNEL_URL || `https://${name}.enso.net`;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PageAction {
  label: string;
  url: string;
  style?: "primary" | "success" | "info" | "outline";
}

export type PageSection =
  | { type: "text"; title: string; content?: string; body?: string; style?: "blockquote" | "normal" }
  | { type: "list"; title: string; items: Array<{ text: string; detail?: string }> }
  | { type: "findings"; title: string; items: Array<{ headline?: string; text?: string; analysis?: string; detail?: string; impact?: "high" | "medium" | "low"; badge?: string; badgeColor?: string; topic?: string; url?: string; actionItem?: string; connections?: string[] }> }
  | { type: "table"; title: string; headers?: string[]; rows: Array<Record<string, string> | string[]> }
  | { type: "stats"; items: Array<{ label: string; value: string; icon?: string }> }
  | { type: "video-grid"; title: string; videos?: Array<{ title: string; channel?: string; subtitle?: string; meta?: string; thumbnailUrl?: string; videoUrl?: string; url?: string; viewCount?: string; duration?: string; description?: string }>; items?: Array<{ title: string; channel?: string; subtitle?: string; meta?: string; thumbnailUrl?: string; videoUrl?: string; url?: string; viewCount?: string; duration?: string; description?: string }> }
  | { type: "tags"; title?: string; tags?: Array<{ label: string; color?: string }>; items?: Array<string | { label: string; color?: string }> }
  | { type: "html"; content: string };

export interface PageConfig {
  id: string;
  title: string;
  subtitle?: string;
  coverUrl?: string;
  badge?: { label: string; color?: string };
  audio?: { src: string; duration?: string; label?: string };
  sections: PageSection[];
  actions?: PageAction[];
  footer?: string;
  meta?: { description?: string; image?: string };
}

export type ShareChannel =
  | { type: "email"; to: string; subject: string }
  | { type: "wechat"; title: string; description?: string; coverUrl?: string }
  | { type: "ws"; broadcast?: boolean };

// ── Paths ────────────────────────────────────────────────────────────────────

const PAGES_DIR = join(homedir(), ".enso", "pages");
const INDEX_PATH = join(PAGES_DIR, "_index.json");

function ensureDir(): void {
  if (!existsSync(PAGES_DIR)) mkdirSync(PAGES_DIR, { recursive: true });
}

// ── Short ID ─────────────────────────────────────────────────────────────────

/** Generate a short hash from a page ID (deterministic, 5-7 chars). */
export function shortId(pageId: string): string {
  return pageId
    .split("")
    .reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)
    .toString(36)
    .replace("-", "");
}

// ── Index ────────────────────────────────────────────────────────────────────

interface PageIndex {
  [shortHash: string]: { pageId: string; title: string; createdAt: string };
}

function loadIndex(): PageIndex {
  ensureDir();
  if (!existsSync(INDEX_PATH)) return {};
  try {
    return JSON.parse(readFileSync(INDEX_PATH, "utf-8")) as PageIndex;
  } catch {
    return {};
  }
}

function saveIndex(idx: PageIndex): void {
  ensureDir();
  writeFileSync(INDEX_PATH, JSON.stringify(idx, null, 2));
}

// ── HTML Escaping ────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── HTML Shell ───────────────────────────────────────────────────────────────

export function htmlShell(title: string, bodyHtml: string, meta?: { description?: string; image?: string }): string {
  const ogTags = meta
    ? `<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(meta.description || "")}" />
${meta.image ? `<meta property="og:image" content="${esc(meta.image)}" />` : ""}
<meta property="og:type" content="article" />
<meta name="twitter:card" content="summary_large_image" />`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Enso AI</title>
${ogTags}
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🧠</text></svg>">
<style>
*{box-sizing:border-box}body{margin:0;background:#0f0f23;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;min-height:100vh}
.container{max-width:640px;margin:0 auto;padding:24px}
.card{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:12px;padding:20px;margin-bottom:16px}
.btn{display:inline-block;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;cursor:pointer;border:none;transition:opacity 0.2s}
.btn:hover{opacity:0.85}
.btn-primary{background:#7c3aed;color:white}
.btn-success{background:#059669;color:white}
.btn-info{background:#2563eb;color:white}
.btn-outline{background:transparent;color:#94a3b8;border:1px solid #374151}
.badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600}
h1{margin:0 0 8px}h2{margin:16px 0 8px;font-size:16px;color:#a78bfa}
audio{width:100%;margin:12px 0;border-radius:8px}
.meta{font-size:13px;color:#94a3b8;line-height:1.6}
.cover{max-width:240px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4)}
.insight{background:#1e1b4b;border-left:3px solid #7c3aed;padding:8px 12px;margin:6px 0;border-radius:0 6px 6px 0;font-size:13px}
.chapter{padding:6px 0;border-bottom:1px solid #1e1e3a;font-size:13px}
.finding{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:8px;padding:16px;margin:8px 0}
.impact-high{color:#ef4444}.impact-medium{color:#f59e0b}.impact-low{color:#22c55e}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}
.stat-item{background:#1e1b4b;border-radius:8px;padding:12px;text-align:center}
.stat-value{font-size:20px;font-weight:700;color:#a78bfa}
.stat-label{font-size:11px;color:#94a3b8;margin-top:4px}
.tag{display:inline-block;padding:3px 10px;margin:2px;border-radius:12px;font-size:12px;font-weight:500}
.video-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.video-card{background:#0f0d1a;border-radius:10px;overflow:hidden;border:1px solid #2d2640}
.video-card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}
.video-card .info{padding:8px 10px 10px}
.video-card .v-title{font-size:13px;font-weight:600;color:#e2e8f0;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.video-card .v-channel{font-size:11px;color:#e879f9;font-weight:500;margin-top:4px}
.video-card .v-meta{font-size:10px;color:#6b7280;margin-top:3px}
.footer{text-align:center;font-size:11px;color:#475569;margin-top:32px;padding-top:16px;border-top:1px solid #1e1e3a}
@media(max-width:480px){.video-grid{grid-template-columns:1fr}.container{padding:16px}}
</style></head><body><div class="container">${bodyHtml}</div></body></html>`;
}

export function htmlPage(title: string, message: string, type: "success" | "error"): string {
  const color = type === "success" ? "#10b981" : "#ef4444";
  const icon = type === "success" ? "✅" : "❌";
  return htmlShell(title, `
<div style="text-align:center;padding:60px 20px">
<div style="font-size:48px;margin-bottom:16px">${icon}</div>
<h1 style="font-size:24px;color:${color}">${esc(title)}</h1>
<p style="font-size:14px;color:#94a3b8;max-width:400px;margin:12px auto;line-height:1.5">${esc(message)}</p>
</div>`);
}

// ── Section Renderers ────────────────────────────────────────────────────────

function renderTextSection(s: { type: "text"; title: string; content?: string; body?: string; style?: "blockquote" | "normal" }): string {
  const text = s.content || s.body || "";
  if (s.style === "blockquote") {
    return `<div class="card"><h2>${esc(s.title)}</h2><div class="insight" style="font-size:14px;line-height:1.6">${esc(text)}</div></div>`;
  }
  return `<div class="card"><h2>${esc(s.title)}</h2><p class="meta">${esc(text)}</p></div>`;
}

function renderListSection(s: { type: "list"; title: string; items: Array<{ text: string; detail?: string }> }): string {
  let html = `<div class="card"><h2>${esc(s.title)}</h2>`;
  for (const item of s.items) {
    html += `<div class="insight">${esc(item.text)}`;
    if (item.detail) html += `<br><span style="color:#6b7280;font-style:italic;font-size:12px">${esc(item.detail)}</span>`;
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

function renderFindingsSection(s: Extract<PageSection, { type: "findings" }>): string {
  const impactColors: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };
  const impactLabels: Record<string, string> = { high: "HIGH IMPACT", medium: "MEDIUM", low: "LOW" };
  let html = `<div class="card"><h2>${esc(s.title)}</h2>`;
  for (const item of s.items) {
    const headline = item.headline || item.text || "";
    const analysis = item.analysis || item.detail || "";
    const badge = item.badge;
    const badgeColor = item.badgeColor;
    html += `<div class="finding">`;
    if (item.topic || item.impact || badge) {
      html += `<div style="margin-bottom:6px">`;
      if (item.topic) html += `<span style="font-size:11px;color:#818cf8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">${esc(item.topic)}</span> `;
      if (item.impact) html += `<span class="badge impact-${item.impact}" style="background:${impactColors[item.impact] || "#94a3b8"};color:white">${impactLabels[item.impact] || item.impact}</span>`;
      if (badge && !item.impact) html += `<span class="badge" style="background:${esc(badgeColor || "#6b7280")};color:white">${esc(badge)}</span>`;
      html += `</div>`;
    }
    if (item.url) {
      html += `<h3 style="margin:0 0 6px;font-size:15px"><a href="${esc(item.url)}" style="color:#c4b5fd;text-decoration:none">${esc(headline)}</a></h3>`;
    } else {
      html += `<h3 style="margin:0 0 6px;font-size:15px;color:#e2e8f0">${esc(headline)}</h3>`;
    }
    if (analysis) html += `<p class="meta" style="white-space:pre-line">${esc(analysis)}</p>`;
    if (item.actionItem) {
      html += `<div style="margin-top:8px;padding:6px 10px;background:#0f2a1f;border-left:3px solid #22c55e;border-radius:0 4px 4px 0;font-size:12px;color:#4ade80">→ ${esc(item.actionItem)}</div>`;
    }
    if (item.connections?.length) {
      html += `<div style="margin-top:6px;font-size:11px;color:#6b7280">🔗 ${item.connections.map(c => `<span class="tag" style="background:#312e81;color:#a5b4fc">${esc(c)}</span>`).join(" ")}</div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

function renderTableSection(s: Extract<PageSection, { type: "table" }>): string {
  let html = `<div class="card"><h2>${esc(s.title)}</h2><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">`;
  const headers = s.headers || (s.rows.length > 0 ? Object.keys(s.rows[0]) : []);
  html += `<tr>${headers.map(h => `<th style="text-align:left;padding:6px 8px;color:#94a3b8;border-bottom:1px solid #2a2a4a;font-size:11px;text-transform:uppercase">${esc(h)}</th>`).join("")}</tr>`;
  for (const row of s.rows) {
    const isArray = Array.isArray(row);
    html += `<tr>${headers.map((h, i) => `<td style="padding:6px 8px;border-bottom:1px solid #1e1e3a;color:#e2e8f0">${esc(String(isArray ? (row as string[])[i] ?? "" : row[h] ?? ""))}</td>`).join("")}</tr>`;
  }
  html += `</table></div></div>`;
  return html;
}

function renderStatsSection(s: Extract<PageSection, { type: "stats" }>): string {
  let html = `<div class="stat-grid">`;
  for (const item of s.items) {
    html += `<div class="stat-item">`;
    if (item.icon) html += `<div style="font-size:20px;margin-bottom:4px">${item.icon}</div>`;
    html += `<div class="stat-value">${esc(item.value)}</div>`;
    html += `<div class="stat-label">${esc(item.label)}</div>`;
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

function renderVideoGridSection(s: Extract<PageSection, { type: "video-grid" }>): string {
  const videos = s.videos || s.items || [];
  let html = `<div class="card" style="background:linear-gradient(135deg,#1a1025,#1e1b3a);border-color:#3b2d5c"><h2 style="color:#e879f9;text-align:center">${esc(s.title)}</h2>`;
  html += `<div class="video-grid">`;
  for (const vid of videos.slice(0, 8)) {
    html += `<div class="video-card">`;
    const vidUrl = vid.videoUrl || vid.url || "";
    const vidChannel = vid.channel || vid.subtitle || "";
    if (vid.thumbnailUrl) {
      const link = vidUrl ? `<a href="${esc(vidUrl)}" style="display:block">` : "";
      const linkEnd = vidUrl ? `</a>` : "";
      html += `${link}<img src="${esc(vid.thumbnailUrl)}" alt="" />${linkEnd}`;
    }
    html += `<div class="info">`;
    if (vidUrl) {
      html += `<a href="${esc(vidUrl)}" class="v-title" style="text-decoration:none;color:#e2e8f0;display:block">${esc(vid.title)}</a>`;
    } else {
      html += `<div class="v-title">${esc(vid.title)}</div>`;
    }
    if (vidChannel) html += `<div class="v-channel">${esc(vidChannel)}</div>`;
    if (vid.meta) {
      html += `<div class="v-meta">${esc(vid.meta)}</div>`;
    } else {
      const metaParts: string[] = [];
      if (vid.viewCount) {
        const vc = parseInt(vid.viewCount);
        if (vc >= 1_000_000) metaParts.push(`${(vc / 1_000_000).toFixed(1)}M views`);
        else if (vc >= 1000) metaParts.push(`${Math.round(vc / 1000)}K views`);
        else metaParts.push(`${vc} views`);
      }
      if (vid.duration) metaParts.push(vid.duration);
      if (metaParts.length) html += `<div class="v-meta">${metaParts.join(" · ")}</div>`;
    }
    html += `</div></div>`;
  }
  html += `</div>`;
  if (videos.length > 8) {
    html += `<p style="font-size:11px;color:#9ca3af;text-align:center;margin:8px 0 0">+${videos.length - 8} more</p>`;
  }
  html += `</div>`;
  return html;
}

function renderTagsSection(s: Extract<PageSection, { type: "tags" }>): string {
  const rawTags = s.tags || s.items || [];
  let html = "";
  if (s.title) html += `<p style="font-size:12px;color:#6b7280;font-weight:600;margin:16px 0 6px">${esc(s.title)}</p>`;
  html += `<div style="margin-bottom:12px">`;
  for (const tag of rawTags) {
    if (typeof tag === "string") {
      html += `<span class="tag" style="background:#312e81;color:#e2e8f0">${esc(tag)}</span>`;
    } else {
      const bg = tag.color || "#312e81";
      html += `<span class="tag" style="background:${esc(bg)};color:#e2e8f0">${esc(tag.label)}</span>`;
    }
  }
  html += `</div>`;
  return html;
}

function renderSection(s: PageSection): string {
  switch (s.type) {
    case "text": return renderTextSection(s);
    case "list": return renderListSection(s);
    case "findings": return renderFindingsSection(s);
    case "table": return renderTableSection(s);
    case "stats": return renderStatsSection(s);
    case "video-grid": return renderVideoGridSection(s);
    case "tags": return renderTagsSection(s);
    case "html": return s.content;
    default: return "";
  }
}

// ── Page Renderer ────────────────────────────────────────────────────────────

/** Render a PageConfig into a full HTML page string. */
export function renderPage(config: PageConfig): string {
  let body = "";

  // Header with optional cover
  body += `<div style="text-align:center;margin-bottom:20px">`;
  if (config.coverUrl) body += `<img src="${esc(config.coverUrl)}" alt="${esc(config.title)}" class="cover" style="margin-bottom:16px" />`;
  if (config.badge) {
    const bg = config.badge.color || "#312e81";
    body += `<div class="badge" style="background:${esc(bg)};color:#c4b5fd;margin-bottom:8px">${esc(config.badge.label)}</div>`;
  }
  body += `<h1 style="font-size:24px;color:#e2e8f0">${esc(config.title)}</h1>`;
  if (config.subtitle) body += `<p style="color:#94a3b8;font-size:14px;margin:4px 0">${esc(config.subtitle)}</p>`;
  body += `</div>`;

  // Audio player
  if (config.audio) {
    body += `<div class="card" style="text-align:center">`;
    body += `<p style="color:#a78bfa;font-weight:600;margin:0 0 8px">${esc(config.audio.label || "🎙️ AI Podcast")}</p>`;
    body += `<audio controls preload="metadata" src="${esc(config.audio.src)}" style="width:100%"></audio>`;
    if (config.audio.duration) body += `<p style="font-size:11px;color:#475569;margin:8px 0 0">Streaming from Enso · ${esc(config.audio.duration)}</p>`;
    body += `</div>`;
  }

  // Sections
  for (const section of config.sections) {
    body += renderSection(section);
  }

  // Action buttons
  if (config.actions?.length) {
    body += `<div style="text-align:center;margin:24px 0">`;
    for (const action of config.actions) {
      const cls = `btn btn-${action.style || "primary"}`;
      body += `<a href="${esc(action.url)}" class="${cls}" style="margin:4px">${esc(action.label)}</a> `;
    }
    body += `</div>`;
  }

  // Footer
  body += `<div class="footer">${esc(config.footer || `Generated by Enso AI · ${new Date().toLocaleDateString()}`)}</div>`;

  return htmlShell(`${config.title}`, body, config.meta);
}

// ── Registration & Serving ───────────────────────────────────────────────────

/** Register a page: render to HTML, save to disk, index the short link. Returns the page URL path. */
export function registerPage(config: PageConfig, baseUrl?: string): { pageUrl: string; shortUrl: string; html: string } {
  ensureDir();
  const html = renderPage(config);
  const filePath = join(PAGES_DIR, `${config.id}.html`);
  writeFileSync(filePath, html);

  const sid = shortId(config.id);
  const idx = loadIndex();
  idx[sid] = { pageId: config.id, title: config.title, createdAt: new Date().toISOString() };
  saveIndex(idx);

  const base = baseUrl || "";
  logAction({ ts: Date.now(), type: "action", category: "pages", message: `Page registered: ${config.id} (short: ${sid})` });
  return {
    pageUrl: `${base}/page/${encodeURIComponent(config.id)}`,
    shortUrl: `${base}/p/${sid}`,
    html,
  };
}

/** Serve a page by ID — returns HTML string or null if not found. */
export function servePage(pageId: string): string | null {
  const filePath = join(PAGES_DIR, `${pageId}.html`);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}

/** Resolve a short ID to a page ID. Returns null if not found in page index. */
export function resolveShortId(sid: string): string | null {
  const idx = loadIndex();
  return idx[sid]?.pageId ?? null;
}

/** List all registered pages (most recent first). */
export function listPages(): Array<{ shortId: string; pageId: string; title: string; createdAt: string }> {
  const idx = loadIndex();
  return Object.entries(idx)
    .map(([sid, entry]) => ({ shortId: sid, ...entry }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Delete a page by ID. */
export function deletePage(pageId: string): boolean {
  const filePath = join(PAGES_DIR, `${pageId}.html`);
  if (!existsSync(filePath)) return false;
  try { unlinkSync(filePath); } catch { /* ignore */ }
  const idx = loadIndex();
  for (const [sid, entry] of Object.entries(idx)) {
    if (entry.pageId === pageId) { delete idx[sid]; break; }
  }
  saveIndex(idx);
  return true;
}

// ── Notification Email Helper ────────────────────────────────────────────────

/** Get the configured notification email address. */
export function getNotifyEmail(): string {
  return process.env.ENSO_NOTIFY_EMAIL || process.env.SMTP_EMAIL || "";
}

// ── Share Helper ─────────────────────────────────────────────────────────────

/**
 * Share a registered page via multiple channels.
 * Sends email with page link + preview, WeChat news card, etc.
 */
export async function sharePage(
  config: PageConfig,
  channels: ShareChannel[],
  baseUrl?: string,
): Promise<{ results: Array<{ channel: string; success: boolean; message: string }> }> {
  const { shortUrl } = registerPage(config, baseUrl || getServerBaseUrl());
  const results: Array<{ channel: string; success: boolean; message: string }> = [];

  for (const ch of channels) {
    try {
      if (ch.type === "email") {
        const { sendHtmlEmail } = await import("./email.js");
        const previewText = config.sections
          .filter((s): s is Extract<PageSection, { type: "text" }> => s.type === "text")
          .map(s => s.content)
          .join(" ")
          .slice(0, 300);

        const emailHtml = buildEmailPreview(config, shortUrl, previewText);
        const result = await sendHtmlEmail({ to: ch.to, subject: ch.subject, html: emailHtml });
        results.push({ channel: "email", ...result });
      } else if (ch.type === "wechat") {
        const { sendNewsMessage, getFollowerOpenIds } = await import("./wechat.js");
        const followers = await getFollowerOpenIds();
        if (followers.length === 0) {
          results.push({ channel: "wechat", success: false, message: "No WeChat followers" });
          continue;
        }
        const result = await sendNewsMessage(followers[0], {
          title: ch.title,
          description: ch.description || config.subtitle || "",
          url: shortUrl,
          picurl: ch.coverUrl || config.coverUrl,
        });
        results.push({ channel: "wechat", ...result });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError("pages", `Share failed (${ch.type})`, err);
      results.push({ channel: ch.type, success: false, message: msg });
    }
  }

  return { results };
}

/** Build a lightweight email that previews the page content and links to the hosted version. */
function buildEmailPreview(config: PageConfig, pageUrl: string, previewText: string): string {
  const parts: string[] = [];
  parts.push(`<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#0f0f23;color:#e2e8f0;border-radius:12px;overflow:hidden">`);

  // Header
  parts.push(`<div style="padding:24px;text-align:center;background:linear-gradient(135deg,#1e1b4b,#312e81)">`);
  if (config.coverUrl) parts.push(`<img src="${esc(config.coverUrl)}" alt="" style="max-width:160px;border-radius:8px;margin-bottom:12px;box-shadow:0 4px 20px rgba(0,0,0,0.4)" />`);
  if (config.badge) parts.push(`<div style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${esc(config.badge.color || "#312e81")};color:#c4b5fd;margin-bottom:8px">${esc(config.badge.label)}</div><br>`);
  parts.push(`<h1 style="color:#e2e8f0;font-size:22px;margin:0 0 4px">${esc(config.title)}</h1>`);
  if (config.subtitle) parts.push(`<p style="color:#94a3b8;font-size:14px;margin:4px 0">${esc(config.subtitle)}</p>`);
  parts.push(`</div>`);

  // Preview
  if (previewText) {
    parts.push(`<div style="padding:16px 24px">`);
    parts.push(`<p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0">${esc(previewText)}${previewText.length >= 300 ? "..." : ""}</p>`);
    parts.push(`</div>`);
  }

  // CTA
  parts.push(`<div style="padding:16px 24px;text-align:center">`);
  parts.push(`<a href="${esc(pageUrl)}" style="display:inline-block;background:#7c3aed;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;box-shadow:0 2px 8px rgba(124,58,237,0.4)">View Full Page →</a>`);
  parts.push(`</div>`);

  // Footer
  parts.push(`<div style="padding:12px 24px;text-align:center;border-top:1px solid #2a2a4a">`);
  parts.push(`<p style="color:#475569;font-size:11px;margin:0">Enso AI · ${new Date().toLocaleDateString()}</p>`);
  parts.push(`</div></div>`);

  return parts.join("\n");
}
