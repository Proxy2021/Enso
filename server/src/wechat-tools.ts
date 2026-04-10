/**
 * wechat-tools.ts — System tools for sending messages via WeChat Official Account.
 *
 * Registered as `enso_wechat_send` and `enso_wechat_followers` — available to all
 * agents, Claude Code sessions, scheduled tasks, and orchestrations.
 *
 * Credentials: WECHAT_APP_ID + WECHAT_APP_SECRET stored in ~/.enso/api-keys.json,
 * configurable via Settings > Service Keys.
 */

import type { EnsoAgentTool, EnsoPluginApi } from "./local-types.js";
import { logAction, logError } from "./action-log.js";
import {
  sendTextMessage,
  sendNewsMessage,
  sendMassTextMessage,
  getFollowersWithInfo,
  getFollowerOpenIds,
  isWithinServiceWindow,
} from "./wechat.js";

// ── Tool Definitions ──

export function createWechatTools(): EnsoAgentTool[] {
  return [
    // ── Send Message ──
    {
      name: "enso_wechat_send",
      label: "Send WeChat Message",
      description:
        "Send a message via WeChat Official Account. Can send to a specific follower (by OpenID) " +
        "or broadcast to all followers. Supports text messages and news/article link cards. " +
        "For individual sends, the user must have interacted with the account within 48 hours. " +
        "Mass sends are limited to 1 per day. " +
        "Requires WECHAT_APP_ID and WECHAT_APP_SECRET in Settings > Service Keys.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          to: {
            type: "string",
            description:
              'Recipient: a specific OpenID to send to one user, or "all" to broadcast to all followers. ' +
              "Use enso_wechat_followers to get OpenIDs.",
          },
          content: {
            type: "string",
            description: "Message content. For text type: the text body. For news type: the article description.",
          },
          type: {
            type: "string",
            enum: ["text", "news"],
            description: 'Message type. "text" for plain text, "news" for a rich article link card. Default: "text"',
          },
          title: {
            type: "string",
            description: "Article title (required when type is news)",
          },
          url: {
            type: "string",
            description: "Article URL that opens when tapped (required when type is news)",
          },
          picUrl: {
            type: "string",
            description: "Cover image URL for the news card (optional)",
          },
        },
        required: ["to", "content"],
      },
      isPrimary: true,
      execute: async (_callId: string, params: Record<string, unknown>) => {
        const to = String(params.to ?? "").trim();
        const content = String(params.content ?? "").trim();
        const msgType = String(params.type ?? "text");
        const title = params.title ? String(params.title) : undefined;
        const url = params.url ? String(params.url) : undefined;
        const picUrl = params.picUrl ? String(params.picUrl) : undefined;

        if (!to) {
          return { content: [{ type: "text", text: '[ERROR] No recipient specified. Use an OpenID or "all".' }] };
        }
        if (!content) {
          return { content: [{ type: "text", text: "[ERROR] No message content specified." }] };
        }

        try {
          // ── Mass send to all followers ──
          if (to.toLowerCase() === "all") {
            if (msgType === "news") {
              return {
                content: [{ type: "text", text: "[ERROR] Mass news messages require uploading media first. Use text type for mass sends, or send news to individual users." }],
              };
            }
            const result = await sendMassTextMessage(content);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ tool: "enso_wechat_send", ...result, to: "all", type: "mass_text" }, null, 2),
              }],
            };
          }

          // ── Send to individual user ──
          if (!isWithinServiceWindow(to)) {
            // Try sending anyway — WeChat will return an error if outside window,
            // but the interaction tracking is in-memory only so we might miss valid windows
            logAction({
              ts: Date.now(),
              type: "action",
              category: "wechat",
              message: `Warning: ${to} may be outside 48h service window, attempting send anyway`,
            });
          }

          let result;
          if (msgType === "news") {
            if (!title || !url) {
              return {
                content: [{ type: "text", text: "[ERROR] News messages require title and url parameters." }],
              };
            }
            result = await sendNewsMessage(to, {
              title,
              description: content,
              url,
              picurl: picUrl,
            });
          } else {
            result = await sendTextMessage(to, content);
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ tool: "enso_wechat_send", ...result, to, type: msgType }, null, 2),
            }],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logError("wechat", `Failed to send WeChat message to ${to}`, err);
          return { content: [{ type: "text", text: `[ERROR] WeChat send failed: ${message}` }] };
        }
      },
    } as EnsoAgentTool,

    // ── List Followers ──
    {
      name: "enso_wechat_followers",
      label: "WeChat Followers",
      description:
        "List all followers of the WeChat Official Account with their nicknames and service window status. " +
        "Use this to get OpenIDs for sending messages via enso_wechat_send.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: [],
      },
      isPrimary: false,
      execute: async (_callId: string, _params: Record<string, unknown>) => {
        try {
          const followers = await getFollowersWithInfo();
          const result = {
            tool: "enso_wechat_followers",
            total: followers.length,
            followers: followers.map((f) => ({
              openId: f.openId,
              nickname: f.nickname ?? "Unknown",
              avatar: f.headimgurl ?? "",
              canMessage: f.withinServiceWindow,
            })),
          };

          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logError("wechat", "Failed to list followers", err);
          return { content: [{ type: "text", text: `[ERROR] Failed to list followers: ${message}` }] };
        }
      },
    } as EnsoAgentTool,
  ];
}

// ── Registration ──

export function registerWechatTools(api?: EnsoPluginApi): void {
  for (const tool of createWechatTools()) {
    if (api) api.registerTool(tool);
  }
}
