// Monthly Knowledge Growth Report — entity stats + LLM synthesis + HTML email
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

ctx.log("Monthly Knowledge Growth Report starting...");

// ── 1. Gather stats ──
var wikiDir = path.join(os.homedir(), ".enso", "wiki");
var entityDir = path.join(wikiDir, "entities");
var synthesisDir = path.join(wikiDir, "synthesis");

var entityCount = 0, synthesisCount = 0;
try { entityCount = fs.readdirSync(entityDir).filter(function(f) { return f.endsWith(".md"); }).length; } catch(e) {}
try { synthesisCount = fs.readdirSync(synthesisDir).filter(function(f) { return f.endsWith(".md"); }).length; } catch(e) {}

// Read entity index for type breakdown
var entityIndexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var typeBreakdown = {};
var totalEntities = 0;
var recentEntities = [];
var thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

try {
  if (fs.existsSync(entityIndexPath)) {
    var entries = JSON.parse(fs.readFileSync(entityIndexPath, "utf-8"));
    if (Array.isArray(entries)) {
      totalEntities = entries.length;
      entries.forEach(function(e) {
        var t = e.type || "unknown";
        typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
        if (e.addedAt && new Date(e.addedAt).getTime() > thirtyDaysAgo) {
          recentEntities.push({ title: e.title, type: e.type, addedAt: e.addedAt });
        }
      });
    }
  }
} catch(e) { ctx.log("Entity index error: " + (e.message || e)); }

// Count deep content podcasts
var deepContentDir = path.join(os.homedir(), ".enso", "data", "deep-content");
var podcastCount = 0;
try { podcastCount = fs.readdirSync(deepContentDir).filter(function(f) { return f.endsWith(".json"); }).length; } catch(e) {}

ctx.log("Stats: " + totalEntities + " entities, " + entityCount + " wiki pages, " + podcastCount + " podcasts, " + recentEntities.length + " added last 30 days");

// ── 2. LLM synthesis ──
var statsText = "Knowledge base stats:\n"
  + "- Total entities: " + totalEntities + "\n"
  + "- Wiki pages: " + entityCount + " entities, " + synthesisCount + " synthesis\n"
  + "- Deep content podcasts: " + podcastCount + "\n"
  + "- New in last 30 days: " + recentEntities.length + "\n\n"
  + "Type breakdown:\n" + Object.keys(typeBreakdown).map(function(t) { return "  " + t + ": " + typeBreakdown[t]; }).join("\n")
  + "\n\nRecent additions (last 30 days):\n" + recentEntities.slice(0, 20).map(function(e) { return "  - " + e.title + " (" + e.type + ")"; }).join("\n");

var analysisPrompt = "You are creating a Monthly Knowledge Growth Report for a personal knowledge system. Based on these stats, write a concise analysis with:\n\n"
  + "1. growth_summary: 2-3 sentences summarizing growth this month\n"
  + "2. emerging_themes: array of 3-4 themes the user seems gravitating toward\n"
  + "3. strongest_area: the type/domain with most coverage\n"
  + "4. gaps: array of 2-3 knowledge gaps or underrepresented areas\n"
  + "5. recommendations: array of 3-5 specific actions (books to add, topics to research)\n\n"
  + "Return ONLY a JSON object. No markdown fences.\n\n" + statsText;

var analysis = {};
try {
  var aiResult = await ctx.ask(analysisPrompt, { maxTokens: 1500 });
  var rawText = (aiResult && aiResult.text) ? aiResult.text : String(aiResult || "");
  var jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  analysis = JSON.parse(jsonStr);
} catch(e) { ctx.log("LLM analysis failed: " + (e.message || e)); }

// ── 3. Build shareable page ──
var todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
var monthYear = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
var todayISO = new Date().toISOString().slice(0, 10);

var pageSections = [];

pageSections.push({ type: "stats", items: [
  { label: "Entities", value: String(totalEntities), icon: "\uD83D\uDCDA" },
  { label: "Podcasts", value: String(podcastCount), icon: "\uD83C\uDFA7" },
  { label: "New (30d)", value: String(recentEntities.length), icon: "\uD83C\uDD95" },
  { label: "Wiki Pages", value: String(entityCount + synthesisCount), icon: "\uD83D\uDCC4" }
]});

var breakdownItems = Object.keys(typeBreakdown).sort(function(a, b) { return typeBreakdown[b] - typeBreakdown[a]; }).slice(0, 8);
if (breakdownItems.length > 0) {
  pageSections.push({ type: "table", title: "\uD83D\uDCCA Entity Breakdown", headers: ["Type", "Count"], rows: breakdownItems.map(function(t) {
    return [t, String(typeBreakdown[t])];
  })});
}

if (analysis.growth_summary) {
  pageSections.push({ type: "text", title: "\uD83D\uDCC8 Growth Summary", body: analysis.growth_summary });
}

if (analysis.emerging_themes && analysis.emerging_themes.length > 0) {
  pageSections.push({ type: "tags", title: "\uD83C\uDF31 Emerging Themes", items: analysis.emerging_themes });
}

if (analysis.gaps && analysis.gaps.length > 0) {
  pageSections.push({ type: "list", title: "\uD83D\uDD0D Knowledge Gaps", items: analysis.gaps.map(function(g) {
    return { text: typeof g === "string" ? g : (g.area || JSON.stringify(g)) };
  })});
}

if (analysis.recommendations && analysis.recommendations.length > 0) {
  pageSections.push({ type: "list", title: "\uD83D\uDCA1 Recommendations", items: analysis.recommendations.map(function(r) {
    return { text: typeof r === "string" ? r : (r.action || JSON.stringify(r)) };
  })});
}

if (recentEntities.length > 0) {
  pageSections.push({ type: "list", title: "\uD83C\uDD95 Recent Additions (30 days)", items: recentEntities.slice(0, 15).map(function(e) {
    return { text: e.title, detail: e.type + (e.addedAt ? " \u00B7 " + e.addedAt.slice(0, 10) : "") };
  })});
}

var pageId = "knowledge-growth-" + todayISO.slice(0, 7);
var pageResult = null;
try {
  pageResult = await ctx.callTool("enso_pages_create", {
    id: pageId,
    title: "\uD83D\uDCC8 Monthly Knowledge Growth Report",
    subtitle: monthYear,
    badge: { label: "Knowledge Growth", color: "#064e3b" },
    sections: pageSections,
    footer: "Enso AI \u2022 Knowledge Growth Report",
    meta: { description: totalEntities + " entities, " + recentEntities.length + " new in 30 days, " + podcastCount + " podcasts" }
  });
  if (pageResult && pageResult.data) pageResult = pageResult.data;
} catch(e) { ctx.log("Page creation failed: " + (e.message || e)); }

// ── 4. Send email with link ──
var emailSent = false;
var emailTo = (await ctx.store.get("growth_email_to")) || (await ctx.store.get("notify_email")) || (pageResult && pageResult.notifyEmail) || "";
if (emailTo && pageResult && pageResult.shortUrl) {
  try {
    var emailHtml = "<div style='font-family:system-ui;max-width:600px;margin:0 auto;background:#0f0f23;color:#e2e8f0;border-radius:12px;overflow:hidden'>";
    emailHtml += "<div style='padding:24px;text-align:center;background:linear-gradient(135deg,#064e3b,#065f46)'>";
    emailHtml += "<h1 style='color:white;font-size:22px;margin:0 0 4px'>\uD83D\uDCC8 Knowledge Growth Report</h1>";
    emailHtml += "<p style='color:#6ee7b7;font-size:13px;margin:4px 0'>" + monthYear + "</p>";
    emailHtml += "</div><div style='padding:16px 24px'>";
    emailHtml += "<div style='display:flex;gap:8px;margin-bottom:16px'>";
    [{ l: "Entities", v: totalEntities }, { l: "New (30d)", v: recentEntities.length }, { l: "Podcasts", v: podcastCount }].forEach(function(s) {
      emailHtml += "<div style='flex:1;background:#1e293b;border-radius:8px;padding:10px;text-align:center'><div style='color:#e2e8f0;font-size:20px;font-weight:700'>" + s.v + "</div><div style='color:#94a3b8;font-size:10px'>" + s.l + "</div></div>";
    });
    emailHtml += "</div>";
    if (analysis.growth_summary) emailHtml += "<p style='color:#94a3b8;font-size:13px;margin:0 0 16px'>" + (analysis.growth_summary || "").slice(0, 200) + "...</p>";
    emailHtml += "<div style='text-align:center'><a href='" + pageResult.shortUrl + "' style='display:inline-block;background:#059669;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px'>View Full Report \u2192</a></div>";
    emailHtml += "</div><div style='padding:12px 24px;text-align:center;border-top:1px solid #2a2a4a'><p style='color:#475569;font-size:11px;margin:0'>Enso AI</p></div></div>";
    var emailResult = await ctx.callTool("enso_email_send", { to: emailTo, subject: "\uD83D\uDCC8 Knowledge Growth Report \u2014 " + monthYear, body: emailHtml, html: true });
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
        title: "\uD83D\uDCC8 Knowledge Growth Report",
        content: totalEntities + " entities \u00B7 " + recentEntities.length + " new \u00B7 " + monthYear,
        url: pageResult.shortUrl
      });
      wechatSent = !!(wcResult && wcResult.data && wcResult.data.success);
    }
  } catch(e) { ctx.log("WeChat send failed: " + (e.message || e)); }
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_knowledge_growth",
  success: true,
  totalEntities: totalEntities,
  newLast30Days: recentEntities.length,
  podcastCount: podcastCount,
  emailSent: emailSent,
  wechatSent: wechatSent,
  pageUrl: pageResult ? pageResult.pageUrl : null
}) }] };
