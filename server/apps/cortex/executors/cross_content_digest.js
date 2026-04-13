// Weekly Cross-Content Digest — cross-references + LLM synthesis of surprising connections
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

ctx.log("Weekly Cross-Content Digest starting...");

// ── 1. Find top entities to cross-reference ──
var entityIndexPath = path.join(os.homedir(), ".enso", "data", "entity-index.json");
var topEntities = [];
var typeCounts = {};
try {
  if (fs.existsSync(entityIndexPath)) {
    var entries = JSON.parse(fs.readFileSync(entityIndexPath, "utf-8"));
    if (Array.isArray(entries)) {
      entries.forEach(function(e) {
        typeCounts[e.type || "unknown"] = (typeCounts[e.type || "unknown"] || 0) + 1;
      });
      // Pick entities with most cross-references or semantic tags
      var scored = entries.filter(function(e) { return e.title; }).map(function(e) {
        var score = (e.crossReferences ? e.crossReferences.length : 0) * 3
          + (e.semanticTags ? e.semanticTags.length : 0);
        return { title: e.title, type: e.type, source: e.source, score: score };
      });
      scored.sort(function(a, b) { return b.score - a.score; });
      topEntities = scored.slice(0, 10);
    }
  }
} catch(e) { ctx.log("Entity index error: " + (e.message || e)); }

ctx.log("Top entities: " + topEntities.length + " | Types: " + Object.keys(typeCounts).join(", "));

// ── 2. Run cross-references for top topics ──
var crossRefResults = [];
var topics = topEntities.slice(0, 5).map(function(e) { return e.title; });

for (var ti = 0; ti < topics.length; ti++) {
  try {
    var crResult = await ctx.callTool("enso_cross_reference", { topic: topics[ti], synthesize: true });
    if (crResult && crResult.success && crResult.data) {
      crossRefResults.push({
        topic: topics[ti],
        narrative: crResult.data.narrative || "",
        connections: (crResult.data.connections || []).slice(0, 3),
        themes: crResult.data.themes || []
      });
    }
  } catch(e) { ctx.log("Cross-ref failed for " + topics[ti] + ": " + (e.message || e)); }
}

ctx.log("Cross-referenced " + crossRefResults.length + " topics");

// ── 3. LLM synthesis ──
var crText = crossRefResults.map(function(cr) {
  return "Topic: " + cr.topic + "\nNarrative: " + (cr.narrative || "").slice(0, 300)
    + "\nConnections: " + cr.connections.map(function(c) { return c.title || c; }).join(", ")
    + "\nThemes: " + cr.themes.join(", ");
}).join("\n\n");

var synthesisPrompt = "You are creating a weekly cross-content intelligence digest. Based on these cross-reference results from a personal knowledge base, create:\n\n"
  + "1. discovery: The single most surprising cross-content connection (a paragraph)\n"
  + "2. threads: Array of 2-3 thematic threads, each with a theme name and 2-3 sentence description of how it connects different content types\n"
  + "3. blind_spots: Array of 2-3 content types or topics that are underrepresented\n"
  + "4. stats_summary: 1-sentence summary of the library's breadth\n\n"
  + "Return ONLY a JSON object. No markdown fences.\n\n"
  + "Entity type counts: " + JSON.stringify(typeCounts) + "\n\n"
  + "Cross-reference results:\n" + crText;

var synthesis = {};
try {
  var aiResult = await ctx.ask(synthesisPrompt, { maxTokens: 1500 });
  var rawText = (aiResult && aiResult.text) ? aiResult.text : String(aiResult || "");
  var jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  synthesis = JSON.parse(jsonStr);
} catch(e) { ctx.log("LLM synthesis failed: " + (e.message || e)); }

// ── 4. Build shareable page ──
var todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
var todayISO = new Date().toISOString().slice(0, 10);

var pageSections = [];

pageSections.push({ type: "stats", items: [
  { label: "Topics Analyzed", value: String(crossRefResults.length), icon: "\uD83D\uDD17" },
  { label: "Threads Found", value: String((synthesis.threads || []).length), icon: "\uD83E\uDDF5" },
  { label: "Blind Spots", value: String((synthesis.blind_spots || []).length), icon: "\uD83D\uDCA1" }
]});

if (synthesis.discovery) {
  pageSections.push({ type: "text", title: "\u2728 This Week's Discovery", body: synthesis.discovery });
}

if (synthesis.threads && synthesis.threads.length > 0) {
  pageSections.push({ type: "findings", title: "\uD83E\uDDF5 Thematic Threads", items: synthesis.threads.map(function(thread) {
    return { text: thread.theme || thread.name || "", detail: thread.description || "" };
  })});
}

if (synthesis.blind_spots && synthesis.blind_spots.length > 0) {
  pageSections.push({ type: "list", title: "\uD83D\uDCA1 Blind Spots", items: synthesis.blind_spots.map(function(bs) {
    return { text: typeof bs === "string" ? bs : (bs.name || bs.area || JSON.stringify(bs)) };
  })});
}

if (synthesis.stats_summary) {
  pageSections.push({ type: "text", title: "\uD83D\uDCCA Library Overview", body: synthesis.stats_summary });
}

var pageId = "cross-content-" + todayISO;
var pageResult = null;
try {
  pageResult = await ctx.callTool("enso_pages_create", {
    id: pageId,
    title: "\uD83D\uDD17 Weekly Cross-Content Intelligence",
    subtitle: todayStr,
    badge: { label: "Cross-Content", color: "#312e81" },
    sections: pageSections,
    footer: "Enso AI \u2022 Cross-Content Digest",
    meta: { description: crossRefResults.length + " topics cross-referenced, " + (synthesis.threads || []).length + " threads discovered" }
  });
  if (pageResult && pageResult.data) pageResult = pageResult.data;
} catch(e) { ctx.log("Page creation failed: " + (e.message || e)); }

// ── 5. Send email with link ──
var emailSent = false;
var emailTo = (await ctx.store.get("digest_email_to")) || (await ctx.store.get("notify_email")) || (pageResult && pageResult.notifyEmail) || "";
if (emailTo && pageResult && pageResult.shortUrl) {
  try {
    var emailHtml = "<div style='font-family:system-ui;max-width:600px;margin:0 auto;background:#0f0f23;color:#e2e8f0;border-radius:12px;overflow:hidden'>";
    emailHtml += "<div style='padding:24px;text-align:center;background:linear-gradient(135deg,#312e81,#4c1d95)'>";
    emailHtml += "<h1 style='color:white;font-size:22px;margin:0 0 4px'>\uD83D\uDD17 Cross-Content Intelligence</h1>";
    emailHtml += "<p style='color:#c4b5fd;font-size:13px;margin:4px 0'>" + todayStr + "</p>";
    emailHtml += "</div><div style='padding:16px 24px;text-align:center'>";
    if (synthesis.discovery) emailHtml += "<p style='color:#94a3b8;font-size:13px;margin:0 0 16px;font-style:italic'>" + (synthesis.discovery || "").slice(0, 200) + "...</p>";
    emailHtml += "<a href='" + pageResult.shortUrl + "' style='display:inline-block;background:#7c3aed;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px'>View Full Report \u2192</a>";
    emailHtml += "</div><div style='padding:12px 24px;text-align:center;border-top:1px solid #2a2a4a'><p style='color:#475569;font-size:11px;margin:0'>Enso AI</p></div></div>";
    var emailResult = await ctx.callTool("enso_email_send", { to: emailTo, subject: "\uD83D\uDD17 Cross-Content Intelligence - " + todayISO, body: emailHtml, html: true });
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
        title: "\uD83D\uDD17 Cross-Content Intelligence",
        content: crossRefResults.length + " topics cross-referenced",
        url: pageResult.shortUrl
      });
      wechatSent = !!(wcResult && wcResult.data && wcResult.data.success);
    }
  } catch(e) { ctx.log("WeChat send failed: " + (e.message || e)); }
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_cross_content_digest",
  success: true,
  topicsAnalyzed: crossRefResults.length,
  emailSent: emailSent,
  wechatSent: wechatSent,
  to: emailTo,
  pageUrl: pageResult ? pageResult.pageUrl : null
}) }] };
