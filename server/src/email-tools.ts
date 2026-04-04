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
import type { EnsoAgentTool, EnsoPluginApi } from "./local-types.js";
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

        try {
          const { transporter: smtp, senderEmail } = getTransporter();

          const mailOptions: nodemailer.SendMailOptions = {
            from: senderEmail,
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
          const message = err instanceof Error ? err.message : String(err);
          logError("email", `Failed to send email to ${to}`, err);
          return { content: [{ type: "text", text: `[ERROR] Failed to send email: ${message}` }] };
        }
      },
    } as EnsoAgentTool,
  ];
}

// ── Registration ──

export function registerEmailTools(api?: EnsoPluginApi): void {
  for (const tool of createEmailTools()) {
    if (api) api.registerTool(tool);
  }
}
