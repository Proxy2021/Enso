/**
 * wechat-webhook.ts — WeChat Official Account webhook handler.
 *
 * Handles two responsibilities:
 * 1. GET /api/wechat — Server verification (echostr challenge from WeChat)
 * 2. POST /api/wechat — Receive incoming user messages (XML), track interactions,
 *    and auto-reply with a welcome message.
 *
 * The interaction tracking is critical: WeChat's customer service message API
 * only allows sending messages to users who interacted within the last 48 hours.
 */

import { Router } from "express";
import { createHash } from "crypto";
import { recordUserInteraction } from "./wechat.js";
import { logAction } from "./action-log.js";

export const wechatRoutes = Router();

// ── Simple XML Extraction ──
// WeChat messages use a simple, predictable XML format. Rather than adding
// a full XML parser dependency, we extract fields with regex.

function extractXmlField(xml: string, field: string): string {
  // Handles both <Field>value</Field> and <Field><![CDATA[value]]></Field>
  const cdataMatch = xml.match(new RegExp(`<${field}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${field}>`));
  if (cdataMatch) return cdataMatch[1];
  const plainMatch = xml.match(new RegExp(`<${field}>([^<]*)</${field}>`));
  return plainMatch?.[1] ?? "";
}

// ── GET: Server Verification ──
// WeChat sends: signature, timestamp, nonce, echostr
// We compute SHA1(sort([token, timestamp, nonce])) and compare with signature.
// If valid, return echostr to confirm the webhook URL.

wechatRoutes.get("/", (req, res) => {
  const token = process.env.WECHAT_VERIFY_TOKEN;
  if (!token) {
    res.status(500).send("WECHAT_VERIFY_TOKEN not configured");
    return;
  }

  const { signature, timestamp, nonce, echostr } = req.query as Record<string, string>;

  if (!signature || !timestamp || !nonce || !echostr) {
    res.status(400).send("Missing parameters");
    return;
  }

  const sorted = [token, timestamp, nonce].sort().join("");
  const computed = createHash("sha1").update(sorted).digest("hex");

  if (computed === signature) {
    logAction({ ts: Date.now(), type: "action", category: "wechat", message: "Webhook verification passed" });
    res.send(echostr);
  } else {
    logAction({ ts: Date.now(), type: "action", category: "wechat", message: "Webhook verification FAILED" });
    res.status(403).send("Invalid signature");
  }
});

// ── POST: Receive Messages ──
// WeChat sends XML messages. We parse them, track the interaction,
// and reply with a simple welcome/acknowledgment.

wechatRoutes.post("/", async (req, res) => {
  // Body may come as raw text or buffer
  let xml = "";
  if (typeof req.body === "string") {
    xml = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    xml = req.body.toString("utf-8");
  } else {
    // If body-parser already parsed as object (shouldn't happen with raw middleware)
    res.send("success");
    return;
  }

  const fromUser = extractXmlField(xml, "FromUserName");
  const toUser = extractXmlField(xml, "ToUserName");
  const msgType = extractXmlField(xml, "MsgType");
  const content = extractXmlField(xml, "Content");

  if (!fromUser) {
    res.send("success");
    return;
  }

  // Track this user's interaction — keeps their 48h service window open
  recordUserInteraction(fromUser);

  logAction({
    ts: Date.now(),
    type: "action",
    category: "wechat",
    message: `Received ${msgType} message from ${fromUser}${content ? `: ${content.slice(0, 50)}` : ""}`,
  });

  // Check if this is a react (reply to a notification) or a fresh interaction
  if (msgType === "text" && content.trim()) {
    try {
      const { submitWechatReact } = await import("./reacts.js");
      const react = submitWechatReact(fromUser, content.trim());
      if (react) {
        // Reply acknowledging the react
        const timestamp = Math.floor(Date.now() / 1000);
        const ackContent = `Received your react. The Team Leader will process it shortly.`;
        const reply = `<xml>
<ToUserName><![CDATA[${fromUser}]]></ToUserName>
<FromUserName><![CDATA[${toUser}]]></FromUserName>
<CreateTime>${timestamp}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${ackContent}]]></Content>
</xml>`;
        res.type("application/xml").send(reply);
        return;
      }
    } catch {
      // React system not available — fall through to default reply
    }
  }

  // Default reply for non-text messages or when react system unavailable
  const timestamp = Math.floor(Date.now() / 1000);
  const replyContent = "Enso AI connected. Your 48-hour messaging window is now active.";

  const reply = `<xml>
<ToUserName><![CDATA[${fromUser}]]></ToUserName>
<FromUserName><![CDATA[${toUser}]]></FromUserName>
<CreateTime>${timestamp}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${replyContent}]]></Content>
</xml>`;

  res.type("application/xml").send(reply);
});
