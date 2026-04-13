// Weekend Watch Guide — profile-driven movie/TV recommendations via search + LLM curation
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

ctx.log("Weekend Watch Guide starting...");

// ── 1. Read user profile interests ──
var interests = [];
try {
  var profilePath = path.join(os.homedir(), ".enso", "data", "user-context", "profile.json");
  if (fs.existsSync(profilePath)) {
    var profile = JSON.parse(fs.readFileSync(profilePath, "utf-8"));
    interests = (profile.topInterests || profile.interests || []).slice(0, 8);
  }
} catch(e) {}

// Also read Cortex themes
var topThemes = [];
try {
  var indexPath = path.join(os.homedir(), ".enso", "wiki", "_index.md");
  if (fs.existsSync(indexPath)) {
    var idx = fs.readFileSync(indexPath, "utf-8");
    var themeCounts = {};
    var matches = idx.match(/Themes:\s*(.+)/g) || [];
    matches.forEach(function(m) {
      m.replace(/Themes:\s*/, "").split(",").forEach(function(t) {
        var theme = t.trim().toLowerCase();
        if (theme && theme !== "personal-history" && theme !== "daily-life" && theme !== "memory-keeping")
          themeCounts[theme] = (themeCounts[theme] || 0) + 1;
      });
    });
    topThemes = Object.keys(themeCounts).sort(function(a, b) { return themeCounts[b] - themeCounts[a]; }).slice(0, 5);
  }
} catch(e) {}

ctx.log("User interests: " + interests.join(", ") + " | Themes: " + topThemes.join(", "));

// ── 2. Search for trending content ──
var searchResults = [];
var searchQueries = [
  "best new movies streaming this week 2026",
  "top rated TV shows new episodes this week 2026",
  "must watch movies in theaters now 2026"
];
// Add interest-specific query
if (topThemes.length > 0) {
  searchQueries.push("best new " + topThemes[0] + " movies 2026");
}

for (var qi = 0; qi < searchQueries.length; qi++) {
  try {
    var sr = await ctx.search(searchQueries[qi], { count: 6 });
    if (sr && sr.results) {
      sr.results.forEach(function(r) {
        searchResults.push({ title: r.title || "", url: r.url || "", description: (r.description || "").slice(0, 400) });
      });
    }
  } catch(e) { ctx.log("Search " + qi + " failed: " + (e.message || e)); }
}

ctx.log("Found " + searchResults.length + " search results");

// ── 3. LLM curation ──
var resultsText = searchResults.slice(0, 20).map(function(r, i) {
  return (i + 1) + ". " + r.title + "\n   " + r.description;
}).join("\n\n");

var curationPrompt = "You are curating a personalized weekend watch guide. The user's interests include: "
  + (interests.length > 0 ? interests.join(", ") : topThemes.join(", ") || "technology, sci-fi, drama")
  + ".\n\nFrom these search results and your own knowledge, recommend exactly 8 items:\n"
  + "- 3 Movies (mix of new releases + hidden gems)\n"
  + "- 3 TV Shows (new episodes or binge-worthy)\n"
  + "- 2 Wildcards (documentaries, anime, international picks)\n\n"
  + "For each, return a JSON object with:\n"
  + "- title: movie/show title\n"
  + "- type: 'movie', 'tv', or 'wildcard'\n"
  + "- genres: array of 2-3 genre tags\n"
  + "- whereToWatch: platform name(s)\n"
  + "- pitch: 2-3 sentence personalized pitch explaining why THIS user would enjoy it\n\n"
  + "Return ONLY a JSON array. No markdown fences.\n\n"
  + "Search results:\n" + resultsText;

var picks = [];
try {
  var aiResult = await ctx.ask(curationPrompt, { maxTokens: 2000 });
  var rawText = (aiResult && aiResult.text) ? aiResult.text : String(aiResult || "");
  var jsonStr = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  picks = JSON.parse(jsonStr);
} catch(e) { ctx.log("LLM curation failed: " + (e.message || e)); }

if (picks.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_cortex_watch_guide",
    success: false,
    error: "LLM returned no recommendations"
  }) }] };
}

// ── 4. Build shareable page ──
var todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
var todayISO = new Date().toISOString().slice(0, 10);
var typeLabels = { movie: "\uD83C\uDFAC Movie", tv: "\uD83D\uDCFA TV Show", wildcard: "\uD83C\uDFB2 Wildcard" };

var pageSections = [];

var movieCount = 0, tvCount = 0, wildcardCount = 0;
picks.forEach(function(p) { if (p.type === "movie") movieCount++; else if (p.type === "tv") tvCount++; else wildcardCount++; });
pageSections.push({ type: "stats", items: [
  { label: "Movies", value: String(movieCount), icon: "\uD83C\uDFAC" },
  { label: "TV Shows", value: String(tvCount), icon: "\uD83D\uDCFA" },
  { label: "Wildcards", value: String(wildcardCount), icon: "\uD83C\uDFB2" }
]});

pageSections.push({ type: "findings", title: "\uD83C\uDFAC This Weekend's Picks", items: picks.map(function(pick) {
  var genresStr = (pick.genres || []).join(", ");
  var detail = (pick.pitch || "");
  if (pick.whereToWatch) detail += "\n\n\uD83D\uDCCD " + pick.whereToWatch;
  return {
    text: (pick.title || ""),
    detail: detail,
    badge: typeLabels[pick.type] || pick.type,
    badgeColor: pick.type === "movie" ? "#be185d" : pick.type === "tv" ? "#1d4ed8" : "#6d28d9"
  };
})});

if (picks.some(function(p) { return p.genres && p.genres.length > 0; })) {
  var allGenres = [];
  picks.forEach(function(p) { (p.genres || []).forEach(function(g) { if (allGenres.indexOf(g) === -1) allGenres.push(g); }); });
  pageSections.push({ type: "tags", title: "\uD83C\uDFF7\uFE0F Genres Covered", items: allGenres });
}

var pageId = "watch-guide-" + todayISO;
var pageResult = null;
try {
  pageResult = await ctx.callTool("enso_pages_create", {
    id: pageId,
    title: "\uD83C\uDFAC Weekend Watch Guide",
    subtitle: todayStr,
    badge: { label: "Watch Guide", color: "#581c87" },
    sections: pageSections,
    footer: "Enso AI \u2022 Weekend Watch Guide",
    meta: { description: picks.length + " curated picks for the weekend" }
  });
  if (pageResult && pageResult.data) pageResult = pageResult.data;
} catch(e) { ctx.log("Page creation failed: " + (e.message || e)); }

// ── 5. Send email with link ──
var emailSent = false;
var emailTo = (await ctx.store.get("watch_guide_email_to")) || (await ctx.store.get("notify_email")) || (pageResult && pageResult.notifyEmail) || "";
if (emailTo && pageResult && pageResult.shortUrl) {
  try {
    var topPicks = picks.slice(0, 3);
    var emailHtml = "<div style='font-family:system-ui;max-width:600px;margin:0 auto;background:#0f0f23;color:#e2e8f0;border-radius:12px;overflow:hidden'>";
    emailHtml += "<div style='padding:24px;text-align:center;background:linear-gradient(135deg,#581c87,#7e22ce)'>";
    emailHtml += "<h1 style='color:white;font-size:22px;margin:0 0 4px'>\uD83C\uDFAC Weekend Watch Guide</h1>";
    emailHtml += "<p style='color:#d8b4fe;font-size:13px;margin:4px 0'>" + todayStr + " \u2014 " + picks.length + " curated picks</p>";
    emailHtml += "</div><div style='padding:16px 24px'>";
    topPicks.forEach(function(p) {
      var tl = typeLabels[p.type] || p.type;
      emailHtml += "<div style='border-left:3px solid #a855f7;padding:6px 12px;margin-bottom:10px'>";
      emailHtml += "<div style='color:#d8b4fe;font-size:10px;text-transform:uppercase;font-weight:600'>" + tl + "</div>";
      emailHtml += "<div style='color:#e2e8f0;font-size:14px;font-weight:600'>" + (p.title || "") + "</div>";
      emailHtml += "<div style='color:#94a3b8;font-size:11px;margin-top:2px'>" + (p.pitch || "").slice(0, 80) + "...</div></div>";
    });
    emailHtml += "<div style='text-align:center;margin:16px 0'><a href='" + pageResult.shortUrl + "' style='display:inline-block;background:#7e22ce;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px'>See All Picks \u2192</a></div>";
    emailHtml += "</div><div style='padding:12px 24px;text-align:center;border-top:1px solid #2a2a4a'><p style='color:#475569;font-size:11px;margin:0'>Enso AI</p></div></div>";
    var emailResult = await ctx.callTool("enso_email_send", { to: emailTo, subject: "\uD83C\uDFAC Weekend Watch Guide - " + todayISO, body: emailHtml, html: true });
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
        title: "\uD83C\uDFAC Weekend Watch Guide",
        content: picks.length + " curated picks for the weekend",
        url: pageResult.shortUrl
      });
      wechatSent = !!(wcResult && wcResult.data && wcResult.data.success);
    }
  } catch(e) { ctx.log("WeChat send failed: " + (e.message || e)); }
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_watch_guide",
  success: true,
  picksCount: picks.length,
  emailSent: emailSent,
  wechatSent: wechatSent,
  to: emailTo,
  pageUrl: pageResult ? pageResult.pageUrl : null
}) }] };
