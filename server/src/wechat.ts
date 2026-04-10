/**
 * wechat.ts — Core WeChat Official Account API module.
 *
 * Handles access token management, customer service messages,
 * mass messaging, and follower management.
 *
 * Credentials: WECHAT_APP_ID + WECHAT_APP_SECRET stored in ~/.enso/api-keys.json,
 * configurable via Settings > Service Keys.
 */

import { logAction, logError } from "./action-log.js";

// ── Access Token Cache ──

let cachedToken: { token: string; expiresAt: number } | null = null;

function getCredentials(): { appId: string; appSecret: string } {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      "WeChat credentials not configured. Go to Settings > Service Keys and add your WeChat App ID + App Secret. " +
      "Get them from https://mp.weixin.qq.com/debug/cgi-bin/sandbox",
    );
  }

  return { appId, appSecret };
}

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 200s safety margin)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 200_000) {
    return cachedToken.token;
  }

  const { appId, appSecret } = getCredentials();
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;

  const res = await fetch(url);
  const data = (await res.json()) as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string };

  if (data.errcode || !data.access_token) {
    throw new Error(`WeChat token error: ${data.errmsg ?? "unknown error"} (code: ${data.errcode})`);
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
  };

  logAction({ ts: Date.now(), type: "action", category: "wechat", message: "Access token refreshed" });
  return cachedToken.token;
}

/** Clear cached token (call when credentials change). */
export function resetWechatClient(): void {
  cachedToken = null;
}

// ── User Interaction Tracking ──

/** Map of openId → last interaction timestamp (for 48h window). */
const interactionMap = new Map<string, number>();

const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

/** Record that a user interacted with the account. */
export function recordUserInteraction(openId: string): void {
  interactionMap.set(openId, Date.now());
}

/** Check if a user is within the 48h customer service window. */
export function isWithinServiceWindow(openId: string): boolean {
  const lastInteraction = interactionMap.get(openId);
  if (!lastInteraction) return false;
  return Date.now() - lastInteraction < FORTY_EIGHT_HOURS;
}

// ── Customer Service Messages ──

export interface SendWechatResult {
  success: boolean;
  message: string;
}

/** Send a text message to a specific user via customer service API. */
export async function sendTextMessage(openId: string, content: string): Promise<SendWechatResult> {
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${token}`;

  const body = {
    touser: openId,
    msgtype: "text",
    text: { content },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { errcode?: number; errmsg?: string };

  if (data.errcode && data.errcode !== 0) {
    const msg = `WeChat send failed: ${data.errmsg} (code: ${data.errcode})`;
    logError("wechat", msg);
    return { success: false, message: msg };
  }

  logAction({ ts: Date.now(), type: "action", category: "wechat", message: `Text message sent to ${openId}` });
  return { success: true, message: `Message sent to ${openId}` };
}

/** Send a news (article link) message to a specific user via customer service API. */
export async function sendNewsMessage(
  openId: string,
  article: { title: string; description: string; url: string; picurl?: string },
): Promise<SendWechatResult> {
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${token}`;

  const body = {
    touser: openId,
    msgtype: "news",
    news: {
      articles: [
        {
          title: article.title,
          description: article.description,
          url: article.url,
          picurl: article.picurl || "",
        },
      ],
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { errcode?: number; errmsg?: string };

  if (data.errcode && data.errcode !== 0) {
    const msg = `WeChat news send failed: ${data.errmsg} (code: ${data.errcode})`;
    logError("wechat", msg);
    return { success: false, message: msg };
  }

  logAction({ ts: Date.now(), type: "action", category: "wechat", message: `News message sent to ${openId}: ${article.title}` });
  return { success: true, message: `News article sent to ${openId}` };
}

// ── Mass Messaging ──

/** Send a mass text message to all followers. Limited to 1/day for subscription accounts. */
export async function sendMassTextMessage(content: string): Promise<SendWechatResult> {
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/mass/sendall?access_token=${token}`;

  const body = {
    filter: { is_to_all: true },
    msgtype: "text",
    text: { content },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { errcode?: number; errmsg?: string; msg_id?: number };

  if (data.errcode && data.errcode !== 0) {
    const msg = `WeChat mass send failed: ${data.errmsg} (code: ${data.errcode})`;
    logError("wechat", msg);
    return { success: false, message: msg };
  }

  logAction({ ts: Date.now(), type: "action", category: "wechat", message: `Mass text sent (msg_id: ${data.msg_id})` });
  return { success: true, message: `Mass message sent to all followers (msg_id: ${data.msg_id})` };
}

// ── Follower Management ──

export interface WechatFollower {
  openId: string;
  nickname?: string;
  headimgurl?: string;
  withinServiceWindow: boolean;
}

/** Get list of all follower OpenIDs. */
export async function getFollowerOpenIds(): Promise<string[]> {
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/user/get?access_token=${token}`;

  const res = await fetch(url);
  const data = (await res.json()) as {
    total?: number;
    count?: number;
    data?: { openid?: string[] };
    errcode?: number;
    errmsg?: string;
  };

  if (data.errcode && data.errcode !== 0) {
    throw new Error(`WeChat follower list failed: ${data.errmsg} (code: ${data.errcode})`);
  }

  return data.data?.openid ?? [];
}

/** Get user info for a specific OpenID. */
export async function getUserInfo(openId: string): Promise<{ nickname: string; headimgurl: string }> {
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/user/info?access_token=${token}&openid=${openId}&lang=zh_CN`;

  const res = await fetch(url);
  const data = (await res.json()) as {
    nickname?: string;
    headimgurl?: string;
    errcode?: number;
    errmsg?: string;
  };

  if (data.errcode && data.errcode !== 0) {
    throw new Error(`WeChat user info failed: ${data.errmsg} (code: ${data.errcode})`);
  }

  return {
    nickname: data.nickname ?? "Unknown",
    headimgurl: data.headimgurl ?? "",
  };
}

/** Get followers with basic info. */
export async function getFollowersWithInfo(): Promise<WechatFollower[]> {
  const openIds = await getFollowerOpenIds();
  const followers: WechatFollower[] = [];

  for (const openId of openIds) {
    try {
      const info = await getUserInfo(openId);
      followers.push({
        openId,
        nickname: info.nickname,
        headimgurl: info.headimgurl,
        withinServiceWindow: isWithinServiceWindow(openId),
      });
    } catch {
      followers.push({ openId, withinServiceWindow: isWithinServiceWindow(openId) });
    }
  }

  return followers;
}
