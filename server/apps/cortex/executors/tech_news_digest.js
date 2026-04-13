// AI/Tech News Digest — web search + LLM analysis + HTML email
var p = params || {};

ctx.log("AI/Tech News Digest starting...");

// ── 1. Search for news ──
var allResults = [];
var queries = [
  "latest AI news today breakthroughs announcements",
  "new AI model releases LLM updates today",
  "tech industry news startups funding today"
];

for (var qi = 0; qi < queries.length; qi++) {
  try {
    var sr = await ctx.search(queries[qi], { count: 8 });
    if (sr && sr.results) {
      sr.results.forEach(function(r) {
        allResults.push({
          title: r.title || "",
          url: r.url || "",
          description: (r.description || "").slice(0, 500),
          source: r.url ? r.url.replace(/https?:\/\/(www\.)?/, "").split("/")[0] : "",
        });
      });
    }
  } catch(e) { ctx.log("Search failed for query " + qi + ": " + (e.message || e)); }
}

ctx.log("Found " + allResults.length + " raw results across " + queries.length + " queries");

if (allResults.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_tech_news_digest",
    success: false,
    error: "No search results found"
  }) }] };
}

// ── 2. LLM synthesis ──
var resultsText = allResults.slice(0, 20).map(function(r, i) {
  return (i + 1) + ". " + r.title + "\n   URL: " + r.url + "\n   " + r.description;
}).join("\n\n");

var analysisPrompt = "You are an AI/tech news analyst. From these search results, identify the TOP 8 most significant stories.\n\n"
  + "For each story, provide a JSON object with:\n"
  + "- headline: compelling title\n"
  + "- url: source URL\n"
  + "- summary: 2-3 sentence summary of what happened and why it matters\n"
  + "- impact: HIGH, MEDIUM, or LOW\n"
  + "- soWhat: one sentence about what this means for an AI developer/entrepreneur\n\n"
  + "Return ONLY a JSON array of 8 objects. No markdown fences, no explanation.\n\n"
  + "Search results:\n" + resultsText;

var stories = [];
try {
  var aiResult = await ctx.ask(analysisPrompt, { maxTokens: 2000 });
  var rawText = (aiResult && aiResult.text) ? aiResult.text : String(aiResult || "");
  var jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  stories = JSON.parse(jsonStr);
} catch(e) {
  ctx.log("LLM analysis failed: " + (e.message || e));
}

if (stories.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_tech_news_digest",
    success: false,
    error: "LLM analysis returned no stories"
  }) }] };
}

// ── 3. Build shareable page ──
var todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
var todayISO = new Date().toISOString().slice(0, 10);

var pageSections = [];

var highCount = 0, medCount = 0;
stories.forEach(function(s) { if (s.impact === "HIGH") highCount++; else if (s.impact === "MEDIUM") medCount++; });
pageSections.push({ type: "stats", items: [
  { label: "Stories", value: String(stories.length), icon: "\uD83D\uDCF0" },
  { label: "High Impact", value: String(highCount), icon: "\uD83D\uDD34" },
  { label: "Medium Impact", value: String(medCount), icon: "\uD83D\uDFE1" }
]});

pageSections.push({ type: "findings", title: "\uD83D\uDCF0 Top Stories", items: stories.map(function(s) {
  return {
    text: (s.headline || ""),
    detail: (s.summary || "") + (s.soWhat ? "\n\nSo what? " + s.soWhat : ""),
    badge: s.impact || "",
    badgeColor: s.impact === "HIGH" ? "#ef4444" : s.impact === "MEDIUM" ? "#eab308" : "#22c55e",
    url: s.url || ""
  };
})});

var pageId = "tech-news-" + todayISO;
var pageResult = null;
try {
  pageResult = await ctx.callTool("enso_pages_create", {
    id: pageId,
    title: "\uD83D\uDCF0 AI & Tech Daily Briefing",
    subtitle: todayStr,
    badge: { label: "Tech News", color: "#1e3a5f" },
    sections: pageSections,
    footer: "Enso AI \u2022 Tech News Digest",
    meta: { description: stories.length + " top AI & tech stories for " + todayStr }
  });
  if (pageResult && pageResult.data) pageResult = pageResult.data;
} catch(e) { ctx.log("Page creation failed: " + (e.message || e)); }

// ── 4. Send email with link ──
var emailSent = false;
var emailTo = (await ctx.store.get("news_email_to")) || (await ctx.store.get("notify_email")) || (pageResult && pageResult.notifyEmail) || "";
if (emailTo && pageResult && pageResult.shortUrl) {
  try {
    var topStories = stories.slice(0, 3);
    var emailHtml = "<div style='font-family:system-ui;max-width:600px;margin:0 auto;background:#0f0f23;color:#e2e8f0;border-radius:12px;overflow:hidden'>";
    emailHtml += "<div style='padding:24px;text-align:center;background:linear-gradient(135deg,#1e3a5f,#1e40af)'>";
    emailHtml += "<h1 style='color:white;font-size:22px;margin:0 0 4px'>\uD83D\uDCF0 AI & Tech Briefing</h1>";
    emailHtml += "<p style='color:#93c5fd;font-size:13px;margin:4px 0'>" + todayStr + " \u2014 " + stories.length + " stories</p>";
    emailHtml += "</div><div style='padding:16px 24px'>";
    topStories.forEach(function(s) {
      var ic = s.impact === "HIGH" ? "#ef4444" : s.impact === "MEDIUM" ? "#eab308" : "#22c55e";
      emailHtml += "<div style='border-left:3px solid " + ic + ";padding:6px 12px;margin-bottom:10px'>";
      emailHtml += "<div style='color:#e2e8f0;font-size:13px;font-weight:600'>" + (s.headline || "") + " <span style='background:" + ic + ";color:#fff;font-size:9px;padding:1px 6px;border-radius:3px;margin-left:4px'>" + (s.impact || "") + "</span></div>";
      emailHtml += "<div style='color:#94a3b8;font-size:11px;margin-top:2px'>" + (s.summary || "").slice(0, 100) + "...</div></div>";
    });
    emailHtml += "<div style='text-align:center;margin:16px 0'><a href='" + pageResult.shortUrl + "' style='display:inline-block;background:#2563eb;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px'>Read Full Briefing \u2192</a></div>";
    emailHtml += "</div><div style='padding:12px 24px;text-align:center;border-top:1px solid #2a2a4a'><p style='color:#475569;font-size:11px;margin:0'>Enso AI</p></div></div>";
    var emailResult = await ctx.callTool("enso_email_send", { to: emailTo, subject: "\uD83D\uDCF0 AI & Tech Briefing - " + todayISO, body: emailHtml, html: true });
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
        title: "\uD83D\uDCF0 AI & Tech Briefing",
        content: stories.length + " top stories \u2014 " + todayStr,
        url: pageResult.shortUrl
      });
      wechatSent = !!(wcResult && wcResult.data && wcResult.data.success);
    }
  } catch(e) { ctx.log("WeChat send failed: " + (e.message || e)); }
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_tech_news_digest",
  success: true,
  storiesCount: stories.length,
  emailSent: emailSent,
  wechatSent: wechatSent,
  to: emailTo,
  pageUrl: pageResult ? pageResult.pageUrl : null
}) }] };
