/**
 * Shared email sending via nodemailer (Gmail SMTP).
 *
 * Credentials: SMTP_EMAIL + SMTP_PASSWORD from ~/.enso/api-keys.json
 * (loaded into process.env by api-keys.ts on startup).
 */

import nodemailer from "nodemailer";
import { logAction, logError } from "./action-log.js";

export interface SendHtmlEmailParams {
  to: string;
  subject: string;
  html: string;
  /** Optional From header override */
  from?: string;
  /** Plain-text fallback (auto-generated from subject if omitted) */
  textFallback?: string;
}

export interface SendEmailResult {
  success: boolean;
  message: string;
  /** notificationId if the email was sent via sendBriefingEmail() */
  notificationId?: string;
  /** Landing page URL for the briefing (if notification was registered) */
  briefingUrl?: string;
}

// ── Transporter (lazy, recreated after idle) ──

let transporter: nodemailer.Transporter | null = null;
let lastSendTs = 0;
const MAX_IDLE_MS = 5 * 60 * 1000;

function getTransporter(): { transporter: nodemailer.Transporter; senderEmail: string } {
  const email = process.env.SMTP_EMAIL;
  const password = process.env.SMTP_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SMTP credentials not configured. Go to Settings > Service Keys and add your Gmail address + App Password.",
    );
  }

  const idleMs = Date.now() - lastSendTs;
  if (transporter && lastSendTs > 0 && idleMs > MAX_IDLE_MS) {
    transporter.close();
    transporter = null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS
      auth: { user: email, pass: password },
      connectionTimeout: 10_000,
      socketTimeout: 30_000,
      greetingTimeout: 10_000,
    });
  }

  return { transporter, senderEmail: email };
}

/** Reset transporter when credentials change */
export function resetEmailTransporter(): void {
  transporter = null;
}

/**
 * Send an HTML email via Gmail SMTP (nodemailer).
 */
export async function sendHtmlEmail(params: SendHtmlEmailParams): Promise<SendEmailResult> {
  const { to, subject, html, textFallback } = params;
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { transporter: t, senderEmail } = getTransporter();
      const from = params.from ?? `Enso <${senderEmail}>`;
      const plainText = textFallback ?? `${subject}\n\nView this email in an HTML-capable client.`;

      await t.sendMail({ from, to, subject, text: plainText, html });

      lastSendTs = Date.now();
      logAction({ ts: Date.now(), type: "action", category: "email", message: `Email sent to ${to} via SMTP` });
      return { success: true, message: `Email sent to ${to}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /socket close|ECONN|ETIMEDOUT|ECONNRESET|socket disconnected|TLS connection|before secure|timeout/i.test(msg);
      if (isTransient && attempt < maxRetries) {
        logAction({ ts: Date.now(), type: "action", category: "email", message: `SMTP transient error (attempt ${attempt + 1}/${maxRetries + 1}): ${msg.slice(0, 120)}` });
        transporter = null;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      logError("email", `SMTP send failed: ${msg}`);
      return { success: false, message: `Email send failed: ${msg}` };
    }
  }

  return { success: false, message: "Email send failed after retries" };
}

// ── Unified Briefing Send (with react buttons + landing page) ──

import type { NotificationContext } from "./reacts.js";

export interface SendBriefingEmailParams {
  to: string;
  subject: string;
  /** Body HTML — react buttons + "View online →" link are appended automatically */
  html: string;
  textFallback?: string;
  /** Notification context — what this email is about (for react tracking) */
  notification: Pick<NotificationContext, "type" | "summary" | "focusId" | "actionId">;
}

/**
 * Send a briefing-style email with the full Enso notification pattern:
 *   1. Registers the notification (gets a tracked notificationId)
 *   2. Appends react action buttons (Approve / Defer / Reply)
 *   3. Appends a "View full briefing online →" link to /briefing/<id>
 *   4. Sends via Gmail SMTP
 *   5. Stashes the full HTML in the notification context so the landing page
 *      can re-render the briefing for the user.
 *
 * This is the canonical way to deliver any notification email in Enso — use
 * it for daily briefings, sprint results, task summaries, etc.
 */
export async function sendBriefingEmail(params: SendBriefingEmailParams): Promise<SendEmailResult> {
  // Lazy-import to avoid circular deps (reacts.ts also imports from email via other paths).
  const { registerNotification, emailReactActions, storeBriefingHtml } = await import("./reacts.js");
  const { getEnsoUrl } = await import("./shareable-pages.js");

  const baseUrl = getEnsoUrl();

  const notificationId = registerNotification(
    { ...params.notification },
    { isEmail: true },
  );

  const reactHtml = emailReactActions(notificationId, baseUrl);
  const viewOnlineHtml = `<div style="margin-top:12px;text-align:center;">
    <a href="${baseUrl}/briefing/${notificationId}"
       style="display:inline-block;background:#4c1d95;color:#c4b5fd;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:500;">
      View full briefing online →
    </a>
  </div>`;

  const htmlWithActions = params.html + viewOnlineHtml + reactHtml;

  // Persist the full HTML on the notification context so /briefing/<id> can
  // re-render the exact email the user received.
  storeBriefingHtml(notificationId, htmlWithActions, params.subject);

  const result = await sendHtmlEmail({
    to: params.to,
    subject: params.subject,
    html: htmlWithActions,
    textFallback: params.textFallback,
  });

  return {
    ...result,
    notificationId,
    briefingUrl: `${baseUrl}/briefing/${notificationId}`,
  };
}
