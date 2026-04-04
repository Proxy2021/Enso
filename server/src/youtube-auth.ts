/**
 * youtube-auth.ts — YouTube OAuth2 authentication helper.
 *
 * Manages the one-time OAuth2 consent flow for YouTube Data API v3.
 * After authorization, the refresh token is stored in ~/.enso/api-keys.json
 * and used to auto-refresh access tokens for all YouTube tool calls.
 */

import { google } from "googleapis";
import { saveApiKey } from "./api-keys.js";
import { logAction, logError } from "./action-log.js";

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

/** Get a configured YouTube API instance */
export function getYouTubeAPI() {
  const auth = getAuthenticatedClient();
  if (!auth) return null;
  return google.youtube({ version: "v3", auth });
}
