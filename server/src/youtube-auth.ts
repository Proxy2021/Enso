/**
 * youtube-auth.ts — YouTube OAuth2 authentication helper.
 *
 * Manages the one-time OAuth2 consent flow for YouTube Data API v3.
 * After authorization, the refresh token is stored in ~/.enso/api-keys.json
 * and used to auto-refresh access tokens for all YouTube tool calls.
 */

import { google } from "googleapis";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { saveApiKey } from "./api-keys.js";
import { logAction, logError } from "./action-log.js";
import { getAuthState, setAuthValid, setAuthExpired, shouldNotify, markNotified, clearAuthState } from "./youtube-auth-state.js";

const SCOPES = ["https://www.googleapis.com/auth/youtube"];
const REDIRECT_PATH = "/api/youtube/callback";

/** Create an OAuth2 client from stored credentials */
export function getOAuth2Client(baseUrl?: string): InstanceType<typeof google.auth.OAuth2> | null {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const redirectUri = baseUrl
    ? `${baseUrl}${REDIRECT_PATH}`
    : `http://localhost:3001${REDIRECT_PATH}`;

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/** Get an authenticated OAuth2 client (with refresh token set) */
export function getAuthenticatedClient(): InstanceType<typeof google.auth.OAuth2> | null {
  const client = getOAuth2Client();
  if (!client) return null;

  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!refreshToken) return null;

  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/** Generate the Google OAuth consent URL */
export function getAuthUrl(baseUrl?: string): string | null {
  const client = getOAuth2Client(baseUrl);
  if (!client) return null;

  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // Force consent to always get refresh_token
  });
}

/** Exchange authorization code for tokens and store the refresh token */
export async function handleCallback(code: string, baseUrl?: string): Promise<{ success: boolean; error?: string }> {
  const client = getOAuth2Client(baseUrl);
  if (!client) return { success: false, error: "YouTube OAuth credentials not configured" };

  try {
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      return { success: false, error: "No refresh token received. Try revoking access at https://myaccount.google.com/permissions and re-authorizing." };
    }

    // Store refresh token persistently
    saveApiKey("youtubeRefreshToken", "YOUTUBE_REFRESH_TOKEN", tokens.refresh_token);

    // Clear auth-expired notification state so next startup/scan is clean
    clearAuthState();
    try {
      const notifyPath = join(homedir(), ".enso", "data", "youtube-auth-notify.json");
      if (existsSync(notifyPath)) writeFileSync(notifyPath, JSON.stringify({ ts: 0 }));
    } catch { /* non-fatal */ }

    logAction({
      ts: Date.now(),
      type: "action",
      category: "youtube",
      message: "YouTube OAuth authorized successfully",
    });

    return { success: true };
  } catch (err) {
    logError("youtube", "OAuth callback failed", err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Check if YouTube is authorized */
export function isAuthorized(): boolean {
  return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REFRESH_TOKEN);
}

/** Detect OAuth2 auth errors (invalid_grant, invalid_client, token revoked) */
export function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /invalid_grant|invalid_client|token.*revoked|token.*expired|unauthorized_client/i.test(msg);
}

export const REAUTH_MESSAGE = "YouTube authorization expired or revoked. Re-authorize at /api/youtube/auth to fix this.";

/** Test whether the current refresh token is still valid */
export async function checkTokenHealth(): Promise<{ valid: boolean; error?: string }> {
  const client = getAuthenticatedClient();
  if (!client) return { valid: false, error: "No OAuth credentials configured" };

  try {
    const yt = google.youtube({ version: "v3", auth: client });
    await yt.channels.list({ part: ["id"], mine: true, maxResults: 1 });
    return { valid: true };
  } catch (err) {
    if (isAuthError(err)) {
      return { valid: false, error: REAUTH_MESSAGE };
    }
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Get a configured YouTube API instance */
export function getYouTubeAPI() {
  const auth = getAuthenticatedClient();
  if (!auth) return null;
  return google.youtube({ version: "v3", auth });
}

// ── Auth Guard ──

let lastHealthyMark = 0;
const HEALTHY_DEBOUNCE_MS = 30 * 60 * 1000; // 30 min

function markHealthyDebounced(): void {
  if (Date.now() - lastHealthyMark > HEALTHY_DEBOUNCE_MS) {
    lastHealthyMark = Date.now();
    setAuthValid();
  }
}

async function handleAuthFailure(err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  const state = setAuthExpired(msg);
  logError("youtube", `Auth failure (consecutive: ${state.consecutiveFailures}): ${msg}`, err);

  if (shouldNotify()) {
    markNotified();
    try {
      const { sendHtmlEmail } = await import("./email.js");
      const to = process.env.ENSO_NOTIFY_EMAIL || process.env.SMTP_EMAIL || "";
      if (!to) return;
      const baseUrl = process.env.ENSO_PUBLIC_URL || process.env.CLOUDFLARE_TUNNEL_URL || "http://localhost:3001";
      const reauthLink = `${baseUrl}/api/youtube/auth`;
      await sendHtmlEmail({
        to,
        subject: `⚠️ YouTube auth expired — re-authorize now`,
        html: `<div style="font-family:system-ui;max-width:500px;margin:0 auto;background:#0f0f23;color:#e2e8f0;border-radius:12px;overflow:hidden">
<div style="padding:20px;text-align:center;background:#7f1d1d"><h2 style="color:#fca5a5;margin:0">YouTube Auth Expired</h2></div>
<div style="padding:20px">
<p>Your YouTube OAuth2 refresh token has expired (failure #${state.consecutiveFailures}). Feeds are serving <strong>stale cached data</strong>.</p>
<p style="margin-top:16px;text-align:center">
  <a href="${reauthLink}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:white;border-radius:8px;text-decoration:none;font-weight:bold">Re-Authorize YouTube →</a>
</p>
<p style="color:#94a3b8;font-size:12px;margin-top:16px">Tip: Publish your Google Cloud OAuth consent screen to Production to prevent 7-day token expiry.</p>
</div></div>`,
      });
      logAction({ ts: Date.now(), type: "action", category: "youtube", message: "Sent auth-expired notification (auth guard)" });
    } catch (e) {
      logError("youtube", "Failed to send auth-expired notification", e);
    }
  }
}

/**
 * Wrap any YouTube API call with automatic auth failure detection.
 * On success, debounce-marks the token as healthy.
 * On auth error, updates state, notifies user (with cooldown), and optionally returns fallback.
 */
export async function callWithAuthGuard<T>(
  fn: () => Promise<T>,
  fallback?: () => T | Promise<T>,
): Promise<T> {
  try {
    const result = await fn();
    markHealthyDebounced();
    return result;
  } catch (err) {
    if (isAuthError(err)) {
      await handleAuthFailure(err);
      if (fallback) return fallback();
      throw err;
    }
    throw err;
  }
}

/** Re-export state accessors for use by other modules */
export { getAuthState, setAuthValid as markTokenValid, clearAuthState } from "./youtube-auth-state.js";
