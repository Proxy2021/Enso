var p = params || {};
// YouTube Manager — daily_email.js
// Deterministic daily email digest of latest YouTube subscription videos.
// No LLM involved — fetches feed data, builds HTML, sends email.

var maxResults = p.maxResults || 10;

// ── 1. Fetch feed (live API, with disk-cache fallback) ──
var result = await ctx.callTool("enso_youtube_my_feed", { maxResults: maxResults });
var videos = [];
var usingFallback = false;
if (result && result.success && result.data) {
  videos = result.data.videos || [];
} else if (result && typeof result === "string") {
  try { videos = JSON.parse(result).videos || []; } catch(e) {}
}

// Fallback 1: try the persistent feed disk cache (survives server restarts & quota errors)
if (videos.length === 0) {
  try {
    var os = require("os");
    var path = require("path");
    var fs = require("fs");
    var feedCachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "youtube-feed-cache.json");
    if (fs.existsSync(feedCachePath)) {
      var feedCache = JSON.parse(fs.readFileSync(feedCachePath, "utf-8"));
      if (feedCache.videos && feedCache.videos.length > 0) {
        videos = feedCache.videos.slice(0, maxResults);
        usingFallback = true;
        ctx.log("Live feed empty — using persistent disk cache (" + videos.length + " videos from " + (feedCache.savedAt || "?") + ")");
      }
    }
  } catch(e) { ctx.log("Disk cache fallback failed: " + (e.message || e)); }
}

// Fallback 2: try the user-context scan cache (youtube-data.json)
if (videos.length === 0) {
  try {
    var scanCachePath = (require("path")).join((require("os")).homedir(), ".enso", "data", "user-context", "cache", "youtube-data.json");
    var fsModule = require("fs");
    if (fsModule.existsSync(scanCachePath)) {
      var scanCache = JSON.parse(fsModule.readFileSync(scanCachePath, "utf-8"));
      if (scanCache.feed && scanCache.feed.length > 0) {
        videos = scanCache.feed.slice(0, maxResults);
        usingFallback = true;
        ctx.log("Live feed empty — using scan cache (" + videos.length + " videos)");
      }
    }
  } catch(e) { ctx.log("Scan cache fallback failed: " + (e.message || e)); }
}

if (videos.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_youtube_manager_daily_email", emailSent: false, error: "No videos in feed (live API and all caches empty)", videoCount: 0 }) }] };
}

// ── 2. Config ──
var emailTo = (await ctx.store.get("youtube_email_to")) || (await ctx.store.get("notify_email")) || "";
var todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
var todayShort = new Date().toISOString().slice(0, 10);

function fmtViews(count) {
  if (!count) return "";
  var n = parseInt(count);
  if (isNaN(n)) return "";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M views";
  if (n >= 1000) return Math.round(n / 1000) + "K views";
  return n + " views";
}

// ── 3. Build shareable page ──
var count = Math.min(videos.length, maxResults);
var videoItems = [];
for (var i = 0; i < count; i++) {
  var vid = videos[i];
  var metaParts = [];
  var viewStr = fmtViews(vid.viewCount);
  if (viewStr) metaParts.push(viewStr);
  if (vid.duration) metaParts.push(vid.duration);
  if (vid.publishedAt) metaParts.push(vid.publishedAt.slice(0, 10));
  videoItems.push({
    thumbnailUrl: vid.thumbnailUrl || "",
    videoUrl: vid.videoUrl || "",
    title: vid.title || "",
    channelTitle: vid.channelTitle || "",
    meta: metaParts.join(" \u00B7 ")
  });
}

var pageSections = [];
pageSections.push({ type: "video-grid", title: "\uD83C\uDFA5 Today's Picks", items: videoItems.map(function(v) {
  return { title: v.title, thumbnailUrl: v.thumbnailUrl, url: v.videoUrl, subtitle: v.channelTitle, meta: v.meta };
})});

var pageId = "youtube-daily-" + todayShort;
var pageResult = null;
try {
  pageResult = await ctx.callTool("enso_pages_create", {
    id: pageId,
    title: "\u25B6 Your Daily YouTube Picks",
    subtitle: todayStr + " \u2014 Fresh from your subscriptions",
    badge: { label: "YouTube Daily", color: "#831843" },
    sections: pageSections,
    footer: "Enso AI \u2022 YouTube Daily Digest",
    meta: { description: count + " fresh videos from your subscriptions" }
  });
  if (pageResult && pageResult.data) pageResult = pageResult.data;
} catch(e) { ctx.log("Page creation failed: " + (e.message || e)); }

// ── 4. Send email with link ──
var emailSent = false;
if (!emailTo && pageResult) emailTo = pageResult.notifyEmail || "";
if (emailTo && pageResult && pageResult.shortUrl) {
  try {
    var topVideos = videoItems.slice(0, 4);
    var emailHtml = "<div style='font-family:system-ui;max-width:600px;margin:0 auto;background:#0f0f23;color:#e2e8f0;border-radius:12px;overflow:hidden'>";
    emailHtml += "<div style='padding:24px;text-align:center;background:linear-gradient(135deg,#831843,#be185d)'>";
    emailHtml += "<h1 style='color:white;font-size:22px;margin:0 0 4px'>\u25B6 Daily YouTube Picks</h1>";
    emailHtml += "<p style='color:#fda4af;font-size:13px;margin:4px 0'>" + todayStr + " \u2014 " + count + " new videos</p>";
    emailHtml += "</div><div style='padding:16px 24px'>";
    topVideos.forEach(function(v) {
      emailHtml += "<div style='display:flex;align-items:center;margin-bottom:10px'>";
      if (v.thumbnailUrl) emailHtml += "<img src='" + v.thumbnailUrl + "' width='100' style='border-radius:6px;margin-right:12px' />";
      emailHtml += "<div><div style='color:#e2e8f0;font-size:13px;font-weight:600'>" + v.title + "</div>";
      emailHtml += "<div style='color:#f472b6;font-size:11px'>" + v.channelTitle + "</div></div></div>";
    });
    emailHtml += "<div style='text-align:center;margin:16px 0'><a href='" + pageResult.shortUrl + "' style='display:inline-block;background:#be185d;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px'>View All " + count + " Videos \u2192</a></div>";
    emailHtml += "</div><div style='padding:12px 24px;text-align:center;border-top:1px solid #2a2a4a'><p style='color:#475569;font-size:11px;margin:0'>Enso AI</p></div></div>";
    var emailResult = await ctx.callTool("enso_email_send", { to: emailTo, subject: "\u25B6 Daily YouTube Picks - " + todayShort, body: emailHtml, html: true });
    emailSent = !!(emailResult && emailResult.success);
  } catch(e) { ctx.log("Email send failed: " + (e.message || e)); }
}

// ── 5. Send WeChat notification ──
var wechatSent = false;
if (pageResult && pageResult.shortUrl) {
  try {
    var followers = await ctx.callTool("enso_wechat_followers", {});
    var followerList = (followers && followers.data && followers.data.followers) || [];
    if (followerList.length > 0) {
      var wcResult = await ctx.callTool("enso_wechat_send", {
        to: followerList[0].openId,
        type: "news",
        title: "\u25B6 Daily YouTube Picks",
        content: count + " fresh videos from your subscriptions",
        url: pageResult.shortUrl
      });
      wechatSent = !!(wcResult && wcResult.data && wcResult.data.success);
    }
  } catch(e) { ctx.log("WeChat send failed: " + (e.message || e)); }
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_youtube_manager_daily_email",
  emailSent: emailSent,
  wechatSent: wechatSent,
  videoCount: count,
  to: emailTo,
  pageUrl: pageResult ? pageResult.pageUrl : null
}) }] };
