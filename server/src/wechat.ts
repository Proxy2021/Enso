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

/** Split text into chunks that fit within WeChat's 2048-byte limit. */
function splitForWechat(text: string, maxBytes = 1800): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of text.split("\n")) {
    const candidate = current ? current + "\n" + line : line;
    if (Buffer.byteLength(candidate, "utf-8") > maxBytes) {
      if (current) chunks.push(current);
      // If a single line exceeds maxBytes, truncate it
      if (Buffer.byteLength(line, "utf-8") > maxBytes) {
        let truncated = "";
        for (const ch of line) {
          if (Buffer.byteLength(truncated + ch, "utf-8") > maxBytes - 3) break;
          truncated += ch;
        }
        chunks.push(truncated + "...");
      } else {
        current = line;
      }
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Send a single text chunk via customer service API. */
async function sendTextChunk(token: string, openId: string, content: string): Promise<{ errcode?: number; errmsg?: string }> {
  const url = `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ touser: openId, msgtype: "text", text: { content } }),
  });
  return (await res.json()) as { errcode?: number; errmsg?: string };
}

/** Send a text message to a specific user via customer service API. Auto-splits long messages. */
export async function sendTextMessage(openId: string, content: string): Promise<SendWechatResult> {
  const token = await getAccessToken();
  const chunks = splitForWechat(content);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks.length > 1 ? `[${i + 1}/${chunks.length}]\n${chunks[i]}` : chunks[i];
    const data = await sendTextChunk(token, openId, chunk);

    if (data.errcode && data.errcode !== 0) {
      const msg = `WeChat send failed: ${data.errmsg} (code: ${data.errcode})`;
      logError("wechat", msg);
      return { success: false, message: msg };
    }
  }

  logAction({ ts: Date.now(), type: "action", category: "wechat", message: `Text message sent to ${openId} (${chunks.length} part${chunks.length > 1 ? "s" : ""})` });
  return { success: true, message: `Message sent to ${openId}${chunks.length > 1 ? ` (${chunks.length} parts)` : ""}` };
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

// ── Article Publishing (Draft → Publish → Send) ──

/**
 * Publish a rich HTML article on the WeChat platform and send it to a user.
 * Articles are hosted on WeChat's servers (mp.weixin.qq.com) — always accessible,
 * rich formatting, and much larger content limits than text messages.
 *
 * Flow: upload thumb → create draft → publish → poll for URL → send news card
 */
export async function sendArticle(
  openId: string,
  article: { title: string; author?: string; content: string; digest?: string; coverUrl?: string },
): Promise<SendWechatResult> {
  const token = await getAccessToken();

  // Step 1: Upload a thumb image (required for articles)
  // Use a 1x1 transparent PNG as default if no cover
  let thumbMediaId: string;
  try {
    if (article.coverUrl) {
      // Download the cover image and upload to WeChat
      const imgRes = await fetch(article.coverUrl);
      if (imgRes.ok) {
        const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
        thumbMediaId = await uploadTempMedia(token, imgBuffer, "thumb.jpg", "image");
      } else {
        thumbMediaId = await uploadDefaultThumb(token);
      }
    } else {
      thumbMediaId = await uploadDefaultThumb(token);
    }
  } catch {
    thumbMediaId = await uploadDefaultThumb(token);
  }

  // Step 2: Create a draft article
  const draftUrl = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`;
  const draftBody = {
    articles: [{
      title: article.title,
      author: article.author || "Enso AI",
      digest: article.digest || article.content.replace(/<[^>]*>/g, "").slice(0, 120),
      content: article.content,
      thumb_media_id: thumbMediaId,
      need_open_comment: 0,
      only_fans_can_comment: 0,
    }],
  };

  const draftRes = await fetch(draftUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draftBody),
  });
  const draftData = (await draftRes.json()) as { media_id?: string; errcode?: number; errmsg?: string };

  if (draftData.errcode || !draftData.media_id) {
    const msg = `WeChat draft creation failed: ${draftData.errmsg} (code: ${draftData.errcode})`;
    logError("wechat", msg);
    return { success: false, message: msg };
  }

  logAction({ ts: Date.now(), type: "action", category: "wechat", message: `Draft created: ${draftData.media_id}` });

  // Step 3: Publish the draft
  const publishUrl = `https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${token}`;
  const publishRes = await fetch(publishUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: draftData.media_id }),
  });
  const publishData = (await publishRes.json()) as { publish_id?: string; errcode?: number; errmsg?: string };

  if (publishData.errcode || !publishData.publish_id) {
    // If publish fails (e.g. test account doesn't support it), fall back to text message
    logAction({ ts: Date.now(), type: "action", category: "wechat", message: `Publish failed (${publishData.errmsg}), falling back to text` });
    const plainText = article.content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
    return sendTextMessage(openId, `${article.title}\n\n${plainText}`);
  }

  // Step 4: Poll for publish completion (up to 30 seconds)
  let articleUrl = "";
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const freshToken = await getAccessToken();
    const statusUrl = `https://api.weixin.qq.com/cgi-bin/freepublish/get?access_token=${freshToken}`;
    const statusRes = await fetch(statusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publish_id: publishData.publish_id }),
    });
    const statusData = (await statusRes.json()) as {
      publish_status?: number;
      article_id?: string;
      article_detail?: { item?: Array<{ article_url?: string }> };
      errcode?: number;
    };

    if (statusData.publish_status === 0 && statusData.article_detail?.item?.[0]?.article_url) {
      articleUrl = statusData.article_detail.item[0].article_url;
      break;
    }
    // status 1 = publishing, 2 = original failed, 3 = used someone else's content
    if (statusData.publish_status && statusData.publish_status > 1) {
      logAction({ ts: Date.now(), type: "action", category: "wechat", message: `Publish rejected (status ${statusData.publish_status}), falling back to text` });
      const plainText = article.content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
      return sendTextMessage(openId, `${article.title}\n\n${plainText}`);
    }
  }

  if (!articleUrl) {
    // Timed out — fall back to text
    logAction({ ts: Date.now(), type: "action", category: "wechat", message: "Publish timed out, falling back to text" });
    const plainText = article.content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
    return sendTextMessage(openId, `${article.title}\n\n${plainText}`);
  }

  logAction({ ts: Date.now(), type: "action", category: "wechat", message: `Article published: ${articleUrl}` });

  // Step 5: Send article link as a news card
  return sendNewsMessage(openId, {
    title: article.title,
    description: article.digest || article.content.replace(/<[^>]*>/g, "").slice(0, 120),
    url: articleUrl,
    picurl: article.coverUrl,
  });
}

/** Upload a buffer as temporary media to WeChat. */
async function uploadTempMedia(token: string, buffer: Buffer, filename: string, type: string): Promise<string> {
  const boundary = "----EnsoWechat" + Date.now();
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([Buffer.from(header), buffer, Buffer.from(footer)]);

  const res = await fetch(`https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${token}&type=${type}`, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
  const data = (await res.json()) as { media_id?: string; errcode?: number; errmsg?: string };

  if (!data.media_id) throw new Error(`Media upload failed: ${data.errmsg}`);
  return data.media_id;
}

/** Upload a minimal default thumb image. */
async function uploadDefaultThumb(token: string): Promise<string> {
  // 1x1 white JPEG (smallest valid JPEG)
  const minJpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA=",
    "base64",
  );
  return uploadTempMedia(token, minJpeg, "thumb.jpg", "thumb");
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
