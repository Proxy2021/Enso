/**
 * email-tools.ts — System tool for sending emails via Gmail SMTP.
 *
 * Registered as `enso_email_send` — available to all agents, Claude Code
 * sessions, scheduled tasks, and orchestrations.
 *
 * Credentials: SMTP_EMAIL + SMTP_PASSWORD stored in ~/.enso/api-keys.json,
 * configurable via Settings > Service Keys.
 */

import nodemailer from "nodemailer";
import type { EnsoAgentTool } from "./local-types.js";
import { logAction, logError } from "./action-log.js";

// ── Transporter (lazy-initialized, reused) ──

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): { transporter: nodemailer.Transporter; senderEmail: string } {
  const email = process.env.SMTP_EMAIL;
  const password = process.env.SMTP_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SMTP credentials not configured. Go to Settings > Service Keys and add your Gmail address + App Password. " +
      "Get an App Password at https://myaccount.google.com/apppasswords",
    );
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS
      auth: { user: email, pass: password },
      pool: true,
      maxConnections: 3,
      socketTimeout: 30_000,
      greetingTimeout: 15_000,
    });
  }

  return { transporter, senderEmail: email };
}

// Reset transporter when credentials change (called after api-key save)
export function resetEmailTransporter(): void {
  transporter = null;
}

// ── Tool Definition ──

export function createEmailTools(): EnsoAgentTool[] {
  return [
    {
      name: "enso_email_send",
      label: "Send Email",
      description:
        "Send an email via Gmail SMTP. Supports HTML body, plain text, CC/BCC, attachments, and reply-to. " +
        "Requires SMTP_EMAIL and SMTP_PASSWORD to be configured in Settings > Service Keys.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          to: {
            type: "string",
            description: "Recipient email address(es), comma-separated for multiple",
          },
          subject: {
            type: "string",
            description: "Email subject line",
          },
          body: {
            type: "string",
            description: "Email body content (plain text by default, or HTML if html=true)",
          },
          html: {
            type: "boolean",
            description: "If true, treat body as HTML content. Default: false (plain text)",
          },
          cc: {
            type: "string",
            description: "CC recipient(s), comma-separated",
          },
          bcc: {
            type: "string",
            description: "BCC recipient(s), comma-separated",
          },
          replyTo: {
            type: "string",
            description: "Reply-to email address (defaults to sender)",
          },
          attachments: {
            type: "array",
            description: "File attachments — array of objects with 'filename' and 'path' (absolute local file path)",
            items: {
              type: "object",
              properties: {
                filename: { type: "string", description: "Display filename in email" },
                path: { type: "string", description: "Absolute path to the file on disk" },
              },
              required: ["path"],
            },
          },
        },
        required: ["to", "subject", "body"],
      },
      isPrimary: true,
      execute: async (_callId: string, params: Record<string, unknown>) => {
        const to = String(params.to ?? "");
        const subject = String(params.subject ?? "");
        const body = String(params.body ?? "");
        const isHtml = Boolean(params.html);
        const cc = params.cc ? String(params.cc) : undefined;
        const bcc = params.bcc ? String(params.bcc) : undefined;
        const replyTo = params.replyTo ? String(params.replyTo) : undefined;
        const attachments = Array.isArray(params.attachments)
          ? (params.attachments as Array<{ filename?: string; path: string }>)
          : undefined;

        if (!to.trim()) {
          return { content: [{ type: "text", text: "[ERROR] No recipient specified (to field is empty)" }] };
        }
        if (!subject.trim()) {
          return { content: [{ type: "text", text: "[ERROR] No subject specified" }] };
        }

        const maxRetries = 2;
        let lastErr: unknown;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            const { transporter: smtp, senderEmail } = getTransporter();

            const mailOptions: nodemailer.SendMailOptions = {
              from: `Enso AI <${senderEmail}>`,
              to,
              subject,
              replyTo: replyTo || senderEmail,
            };

            if (isHtml) {
              mailOptions.html = body;
            } else {
              mailOptions.text = body;
            }

            if (cc) mailOptions.cc = cc;
            if (bcc) mailOptions.bcc = bcc;

            if (attachments && attachments.length > 0) {
              mailOptions.attachments = attachments.map((a) => ({
                filename: a.filename || a.path.split(/[/\\]/).pop() || "attachment",
                path: a.path,
              }));
            }

            const info = await smtp.sendMail(mailOptions);

            logAction({
              ts: Date.now(),
              type: "action",
              category: "email",
              message: `Email sent to ${to} — subject: "${subject}" (messageId: ${info.messageId})`,
            });

            const result = {
              tool: "enso_email_send",
              success: true,
              messageId: info.messageId,
              to,
              cc: cc || undefined,
              bcc: bcc || undefined,
              subject,
              attachmentCount: attachments?.length ?? 0,
              from: senderEmail,
            };

            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            const isTransient = /socket close|ECONN|ETIMEDOUT|ECONNRESET|socket disconnected|TLS connection|before secure/i.test(msg);
            if (isTransient && attempt < maxRetries) {
              transporter = null;
              await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
              continue;
            }
            break;
          }
        }
        const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
        logError("email", `Failed to send email to ${to}`, lastErr);
        return { content: [{ type: "text", text: `[ERROR] Failed to send email: ${message}` }] };
      },
    } as EnsoAgentTool,

    // ── enso_briefing_send — the canonical way to deliver notification emails ──
    // Wraps enso_email_send with the full Enso notification pattern:
    //   • registers the notification (tracked UUID)
    //   • appends Approve / Defer / Reply action buttons
    //   • appends "View full briefing online →" link to /briefing/<id>
    //   • persists the HTML so the landing page can re-render it
    // Use this for any recurring or scheduled notification email (daily briefings,
    // sprint results, FactorStrategies signal, book recommendations, etc.).
    {
      name: "enso_briefing_send",
      label: "Send Briefing Email",
      description:
        "Send a briefing-style email with Enso's full notification pattern: registered notificationId, react action buttons (Approve/Defer/Reply), and a landing-page link at /briefing/<id> where the user can view the full briefing online and reply. Use this instead of enso_email_send for any recurring notification, scheduled-task briefing, or async update that the user may want to react to. Requires SMTP_EMAIL and SMTP_PASSWORD.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          to: { type: "string", description: "Recipient email address(es), comma-separated for multiple" },
          subject: { type: "string", description: "Email subject line — should be distinctive per-day (e.g. 'FactorStrategies Daily — 2026-04-18 Saturday')" },
          body: { type: "string", description: "HTML body of the briefing. Action buttons + 'View online' link are appended automatically — do NOT include them yourself." },
          notificationType: {
            type: "string",
            description: "Category of this notification — used for react routing and analytics",
            enum: ["briefing", "pulse", "sprint-complete", "alert", "checkin", "discovery", "factor-strategies", "book-recommendation", "youtube-daily", "focus-progress"],
          },
          summary: { type: "string", description: "Short one-line summary of what the briefing contains (shown on the landing page header and in react context)" },
          focusId: { type: "string", description: "Optional focus area ID if this briefing is about a specific focus" },
          cc: { type: "string", description: "CC recipient(s), comma-separated" },
          bcc: { type: "string", description: "BCC recipient(s), comma-separated" },
        },
        required: ["to", "subject", "body", "notificationType", "summary"],
      },
      isPrimary: false,
      execute: async (_callId: string, params: Record<string, unknown>) => {
        const to = String(params.to ?? "").trim();
        const subject = String(params.subject ?? "").trim();
        const body = String(params.body ?? "");
        const notificationType = String(params.notificationType ?? "briefing") as
          | "briefing" | "pulse" | "sprint-complete" | "alert" | "checkin" | "discovery"
          | "factor-strategies" | "book-recommendation" | "youtube-daily" | "focus-progress";
        const summary = String(params.summary ?? "").slice(0, 200);
        const focusId = params.focusId ? String(params.focusId) : undefined;

        if (!to) return { content: [{ type: "text", text: "[ERROR] No recipient specified (to)" }] };
        if (!subject) return { content: [{ type: "text", text: "[ERROR] No subject specified" }] };
        if (!body) return { content: [{ type: "text", text: "[ERROR] No body specified" }] };
        if (!summary) return { content: [{ type: "text", text: "[ERROR] summary is required — used for react context + landing page header" }] };

        try {
          const { sendBriefingEmail } = await import("./email.js");
          const result = await sendBriefingEmail({
            to,
            subject,
            html: body,
            notification: { type: notificationType, summary, focusId },
          });

          if (!result.success) {
            return { content: [{ type: "text", text: `[ERROR] ${result.message}` }] };
          }

          return { content: [{ type: "text", text: JSON.stringify({
            tool: "enso_briefing_send",
            success: true,
            to,
            subject,
            notificationId: result.notificationId,
            briefingUrl: result.briefingUrl,
            message: `Briefing sent to ${to} — viewable at ${result.briefingUrl}`,
          }, null, 2) }] };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logError("email", `Failed to send briefing to ${to}`, err);
          return { content: [{ type: "text", text: `[ERROR] Failed to send briefing: ${message}` }] };
        }
      },
    } as EnsoAgentTool,
  ];
}
