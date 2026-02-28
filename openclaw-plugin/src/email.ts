/**
 * Shared email sending via himalaya CLI.
 *
 * Himalaya is a local CLI email client configured at ~/.config/himalaya/config.toml.
 * It sends via SMTP (Gmail app password) — no external API key needed.
 *
 * Uses MML (MIME Meta Language) for composing multipart HTML emails.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface SendHtmlEmailParams {
  to: string;
  subject: string;
  html: string;
  /** Optional From header override (default: read from himalaya config) */
  from?: string;
  /** Plain-text fallback (auto-generated from subject if omitted) */
  textFallback?: string;
}

export interface SendEmailResult {
  success: boolean;
  message: string;
}

/** Lazily resolved sender address from himalaya config */
let cachedFrom: string | null = null;

function resolveFromAddress(): string {
  if (cachedFrom) return cachedFrom;

  try {
    const configPath = path.join(os.homedir(), ".config", "himalaya", "config.toml");
    const raw = fs.readFileSync(configPath, "utf-8");

    // Extract display-name and email from the default account
    const displayMatch = raw.match(/display-name\s*=\s*"([^"]+)"/);
    const emailMatch = raw.match(/email\s*=\s*"([^"]+)"/);

    const displayName = displayMatch?.[1] ?? "";
    const email = emailMatch?.[1] ?? "";

    if (email) {
      cachedFrom = displayName ? `${displayName} <${email}>` : email;
    }
  } catch {
    // Config not found — fallback
  }

  if (!cachedFrom) {
    cachedFrom = "Enso <noreply@localhost>";
  }

  return cachedFrom;
}

/**
 * Send an HTML email using the himalaya CLI.
 *
 * Composes using MML multipart/alternative (plain text + HTML) and pipes
 * to `himalaya template send`.
 */
export async function sendHtmlEmail(params: SendHtmlEmailParams): Promise<SendEmailResult> {
  const { to, subject, html, textFallback } = params;
  const from = params.from ?? resolveFromAddress();

  // Build MML template (multipart/alternative: plain text + HTML)
  const plainText = textFallback ?? `${subject}\n\nView this email in an HTML-capable client.`;

  const mml = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "",
    "<#multipart type=alternative>",
    plainText,
    "<#part type=text/html>",
    html,
    "<#/multipart>",
  ].join("\n");

  return new Promise<SendEmailResult>((resolve) => {
    const child = execFile(
      "himalaya",
      ["template", "send"],
      { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) {
          const msg = stderr?.trim() || error.message;
          console.log(`[enso:email] himalaya send failed: ${msg}`);
          resolve({ success: false, message: `Email send failed: ${msg}` });
        } else {
          console.log(`[enso:email] email sent to ${to} via himalaya`);
          resolve({ success: true, message: `Email sent to ${to}` });
        }
      },
    );

    // Pipe the MML template to stdin
    if (child.stdin) {
      child.stdin.write(mml);
      child.stdin.end();
    }
  });
}
