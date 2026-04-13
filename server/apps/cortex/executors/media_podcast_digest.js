// Weekly Media Podcast Digest — checks existing podcasts, recommends unprocessed items, emails digest
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

ctx.log("Weekly Media Podcast Digest starting...");

// ── 1. Scan existing deep content (podcasts) ──
var deepContentDir = path.join(os.homedir(), ".enso", "data", "deep-content");
var existingPodcasts = [];
try {
  if (fs.existsSync(deepContentDir)) {
    var files = fs.readdirSync(deepContentDir).filter(function(f) { return f.endsWith(".json"); });
    files.forEach(function(f) {
      try {
        var meta = JSON.parse(fs.readFileSync(path.join(deepContentDir, f), "utf-8"));
        existingPodcasts.push({
          slug: f.replace(".json", ""),
          title: meta.title || meta.entityTitle || f,
          type: meta.type || meta.entityType || "unknown",
          durationMin: meta.durationMinutes || 0,
          generatedAt: meta.generatedAt || meta.createdAt || ""
        });
      } catch(e) {}
    });
  }
} catch(e) {}

ctx.log("Found " + existingPodcasts.length + " existing podcasts");

// ── 2. Find unprocessed entities from Cortex ──
var entityIndexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var processedSlugs = {};
existingPodcasts.forEach(function(p) { processedSlugs[p.slug] = true; });

var unprocessedByType = { book: [], movie: [], game: [], channel: [] };
try {
  if (fs.existsSync(entityIndexPath)) {
    var entries = JSON.parse(fs.readFileSync(entityIndexPath, "utf-8"));
    if (Array.isArray(entries)) {
      entries.forEach(function(e) {
        if (!e.title || !e.type) return;
        var slug = (e.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (processedSlugs[slug]) return;
        if (unprocessedByType[e.type]) {
          unprocessedByType[e.type].push({ title: e.title, type: e.type, source: e.source });
        }
      });
    }
  }
} catch(e) {}

var unprocessedCounts = {};
for (var t in unprocessedByType) unprocessedCounts[t] = unprocessedByType[t].length;
ctx.log("Unprocessed: " + JSON.stringify(unprocessedCounts));

// ── 3. Pick recommendations (deterministic: newest unprocessed from each type) ──
var picks = [];
var types = ["book", "movie", "game"];
types.forEach(function(t) {
  if (unprocessedByType[t].length > 0) {
    picks.push(unprocessedByType[t][0]);
  }
});

// ── 4. Build shareable page ──
var todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
var todayISO = new Date().toISOString().slice(0, 10);

var recentPodcasts = existingPodcasts.sort(function(a, b) {
  return (b.generatedAt || "").localeCompare(a.generatedAt || "");
}).slice(0, 8);

var pageSections = [];

pageSections.push({ type: "stats", items: [
  { label: "Total Podcasts", value: String(existingPodcasts.length), icon: "\uD83C\uDFA7" },
  { label: "New This Week", value: String(recentPodcasts.length), icon: "\uD83C\uDD95" },
  { label: "Up Next", value: String(picks.length), icon: "\u23F3" }
]});

if (recentPodcasts.length > 0) {
  pageSections.push({ type: "list", title: "\uD83C\uDFA7 Recently Generated", items: recentPodcasts.map(function(rp) {
    return { text: rp.title, detail: rp.type + (rp.durationMin ? " \u00B7 " + rp.durationMin + " min" : "") };
  })});
}

if (picks.length > 0) {
  pageSections.push({ type: "list", title: "\u23F3 Up Next (No Podcast Yet)", items: picks.map(function(pick) {
    return { text: pick.title, detail: pick.type + (pick.source ? " \u00B7 " + pick.source : "") };
  })});
}

var unprocessedStatItems = [];
for (var ut in unprocessedCounts) {
  if (unprocessedCounts[ut] > 0) unprocessedStatItems.push({ label: ut + "s", value: String(unprocessedCounts[ut]) });
}
if (unprocessedStatItems.length > 0) {
  pageSections.push({ type: "stats", items: unprocessedStatItems });
}

var pageId = "podcast-digest-" + todayISO;
var pageResult = null;
try {
  pageResult = await ctx.callTool("enso_pages_create", {
    id: pageId,
    title: "\uD83C\uDFA7 Weekly Media Podcast Digest",
    subtitle: todayStr + " \u2014 " + existingPodcasts.length + " podcasts in library",
    badge: { label: "Podcast Digest", color: "#312e81" },
    sections: pageSections,
    footer: "Enso AI \u2022 Media Podcast Digest",
    meta: { description: existingPodcasts.length + " podcasts, " + picks.length + " queued for generation" }
  });
  if (pageResult && pageResult.data) pageResult = pageResult.data;
} catch(e) { ctx.log("Page creation failed: " + (e.message || e)); }

// ── 5. Send email with link ──
var emailSent = false;
var emailTo = (await ctx.store.get("podcast_email_to")) || (await ctx.store.get("notify_email")) || (pageResult && pageResult.notifyEmail) || "";
if (emailTo && pageResult && pageResult.shortUrl) {
  try {
    var emailHtml = "<div style='font-family:system-ui;max-width:600px;margin:0 auto;background:#0f0f23;color:#e2e8f0;border-radius:12px;overflow:hidden'>";
    emailHtml += "<div style='padding:24px;text-align:center;background:linear-gradient(135deg,#1e1b4b,#312e81)'>";
    emailHtml += "<h1 style='color:white;font-size:22px;margin:0 0 4px'>\uD83C\uDFA7 Weekly Podcast Digest</h1>";
    emailHtml += "<p style='color:#a5b4fc;font-size:13px;margin:4px 0'>" + todayStr + " \u2014 " + existingPodcasts.length + " podcasts</p>";
    emailHtml += "</div><div style='padding:16px 24px;text-align:center'>";
    if (recentPodcasts.length > 0) emailHtml += "<p style='color:#94a3b8;font-size:13px;margin:0 0 16px'>Latest: " + recentPodcasts.slice(0, 3).map(function(rp) { return rp.title; }).join(", ") + "</p>";
    emailHtml += "<a href='" + pageResult.shortUrl + "' style='display:inline-block;background:#7c3aed;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px'>View Full Digest \u2192</a>";
    emailHtml += "</div><div style='padding:12px 24px;text-align:center;border-top:1px solid #2a2a4a'><p style='color:#475569;font-size:11px;margin:0'>Enso AI</p></div></div>";
    var emailResult = await ctx.callTool("enso_email_send", { to: emailTo, subject: "\uD83C\uDFA7 Weekly Podcast Digest - " + todayISO, body: emailHtml, html: true });
    emailSent = !!(emailResult && emailResult.success);
  } catch(e) { ctx.log("Email send failed: " + (e.message || e)); }
}

// ── 6. Send WeChat notification ──
var wechatSent = false;
if (pageResult && pageResult.shortUrl) {
  try {
    var followers = await ctx.callTool("enso_wechat_followers", {});
    var followerList = (followers && followers.data && followers.data.followers) || [];
    if (followerList.length > 0) {
      var wcResult = await ctx.callTool("enso_wechat_send", {
        to: followerList[0].openId,
        type: "news",
        title: "\uD83C\uDFA7 Weekly Podcast Digest",
        content: existingPodcasts.length + " podcasts \u00B7 " + picks.length + " queued",
        url: pageResult.shortUrl
      });
      wechatSent = !!(wcResult && wcResult.data && wcResult.data.success);
    }
  } catch(e) { ctx.log("WeChat send failed: " + (e.message || e)); }
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_media_podcast_digest",
  success: true,
  existingPodcasts: existingPodcasts.length,
  picks: picks.length,
  emailSent: emailSent,
  wechatSent: wechatSent,
  pageUrl: pageResult ? pageResult.pageUrl : null
}) }] };
