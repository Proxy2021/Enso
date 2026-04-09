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
}

// ── Transporter (lazy, reused) ──

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): { transporter: nodemailer.Transporter; senderEmail: string } {
  const email = process.env.SMTP_EMAIL;
  const password = process.env.SMTP_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SMTP credentials not configured. Go to Settings > Service Keys and add your Gmail address + App Password.",
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

/** Reset transporter when credentials change */
export function resetEmailTransporter(): void {
  transporter = null;
}

/**
 * Send an HTML email via Gmail SMTP (nodemailer).
 */
export async function sendHtmlEmail(params: SendHtmlEmailParams): Promise<SendEmailResult> {
  const { to, subject, html, textFallback } = params;

  try {
    const { transporter: t, senderEmail } = getTransporter();
    const from = params.from ?? `Enso <${senderEmail}>`;
    const plainText = textFallback ?? `${subject}\n\nView this email in an HTML-capable client.`;

    await t.sendMail({
      from,
      to,
      subject,
      text: plainText,
      html,
    });

    logAction({ ts: Date.now(), type: "action", category: "email", message: `Email sent to ${to} via SMTP` });
    return { success: true, message: `Email sent to ${to}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError("email", `SMTP send failed: ${msg}`);
    return { success: false, message: `Email send failed: ${msg}` };
  }
}
