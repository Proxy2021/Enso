/**
 * page-tools.ts — System tools for creating shareable pages.
 *
 * Registered as `enso_pages_create` — available to executors via ctx.callTool,
 * agents, and Claude Code sessions.
 */

import type { EnsoAgentTool } from "./local-types.js";
import { registerPage, getNotifyEmail, getServerBaseUrl, type PageConfig, type PageSection, type PageAction } from "./shareable-pages.js";
import { logAction, logError } from "./action-log.js";

export function createPageTools(): EnsoAgentTool[] {
  return [
    {
      name: "enso_pages_create",
      label: "Create Shareable Page",
      description: "Create a hosted shareable page with structured content. Returns the page URL and short URL for sharing via email, WeChat, or direct link.",
      isPrimary: true,
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Unique page ID (used in URL)" },
          title: { type: "string", description: "Page title" },
          subtitle: { type: "string", description: "Optional subtitle" },
          coverUrl: { type: "string", description: "Cover image URL" },
          badge: {
            type: "object",
            properties: { label: { type: "string" }, color: { type: "string" } },
            additionalProperties: false,
          },
          audio: {
            type: "object",
            properties: { src: { type: "string" }, duration: { type: "string" }, label: { type: "string" } },
            additionalProperties: false,
          },
          sections: {
            type: "array",
            description: "Page sections. Each has a 'type' (text, list, findings, stats, video-grid, tags, html) and type-specific fields.",
            items: { type: "object" },
          },
          actions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                url: { type: "string" },
                style: { type: "string", enum: ["primary", "success", "info", "outline"] },
              },
              additionalProperties: false,
            },
          },
          footer: { type: "string" },
          meta: {
            type: "object",
            properties: { description: { type: "string" }, image: { type: "string" } },
            additionalProperties: false,
          },
        },
        required: ["id", "title", "sections"],
        additionalProperties: false,
      },
      execute: async (_callId, params) => {
        try {
          const config: PageConfig = {
            id: String(params.id),
            title: String(params.title),
            subtitle: params.subtitle ? String(params.subtitle) : undefined,
            coverUrl: params.coverUrl ? String(params.coverUrl) : undefined,
            badge: params.badge as PageConfig["badge"],
            audio: params.audio as PageConfig["audio"],
            sections: (params.sections || []) as PageSection[],
            actions: (params.actions || []) as PageAction[],
            footer: params.footer ? String(params.footer) : undefined,
            meta: params.meta as PageConfig["meta"],
          };

          const baseUrl = getServerBaseUrl();
          const result = registerPage(config, baseUrl);

          logAction({ ts: Date.now(), type: "action", category: "pages", message: `Page created via tool: ${config.id}` });

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                tool: "enso_pages_create",
                success: true,
                pageUrl: result.pageUrl,
                shortUrl: result.shortUrl,
                pageId: config.id,
                notifyEmail: getNotifyEmail(),
              }),
            }],
          };
        } catch (err) {
          logError("pages", `Page creation failed: ${err instanceof Error ? err.message : String(err)}`, err);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ tool: "enso_pages_create", success: false, error: err instanceof Error ? err.message : String(err) }),
            }],
          };
        }
      },
    },
  ];
}
