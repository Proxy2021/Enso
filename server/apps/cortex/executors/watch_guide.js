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

// ── 4. Build HTML email ──
var todayStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
var typeColors = { movie: "#f472b6", tv: "#60a5fa", wildcard: "#a78bfa" };
var typeLabels = { movie: "Movie", tv: "TV Show", wildcard: "Wildcard" };

var html = "<div style='background:#0a0a0a;padding:30px 16px;font-family:system-ui,-apple-system,sans-serif;'>";
html += "<div style='max-width:640px;margin:0 auto;'>";
html += "<h1 style='color:#e2e8f0;text-align:center;font-size:22px;margin:0 0 4px;'>Your Weekend Watch Guide</h1>";
html += "<p style='color:#94a3b8;text-align:center;font-size:13px;margin:0 0 20px;'>" + todayStr + "</p>";

for (var pi = 0; pi < picks.length; pi++) {
  var pick = picks[pi];
  var tc = typeColors[pick.type] || "#94a3b8";
  var tl = typeLabels[pick.type] || pick.type;
  var genres = (pick.genres || []).map(function(g) {
    return "<span style='display:inline-block;background:#1e1e3a;color:#94a3b8;font-size:10px;padding:2px 8px;border-radius:10px;margin-right:4px;'>" + g + "</span>";
  }).join("");

  html += "<div style='background:#1a1a2e;border-radius:12px;padding:14px 16px;margin-bottom:12px;border:1px solid #2d2640;'>";
  html += "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;'>";
  html += "<span style='color:" + tc + ";font-size:11px;font-weight:600;text-transform:uppercase;'>" + tl + "</span>";
  if (pick.whereToWatch) html += "<span style='color:#64748b;font-size:10px;'>" + pick.whereToWatch + "</span>";
  html += "</div>";
  html += "<h3 style='color:#e2e8f0;font-size:16px;margin:0 0 6px;'>" + (pick.title || "") + "</h3>";
  if (genres) html += "<div style='margin-bottom:8px;'>" + genres + "</div>";
  html += "<p style='color:#94a3b8;font-size:13px;line-height:1.5;margin:0;font-style:italic;'>" + (pick.pitch || "") + "</p>";
  html += "</div>";
}

html += "<p style='color:#475569;text-align:center;font-size:11px;margin:20px 0 0;'>Enso AI</p>";
html += "</div></div>";

// ── 5. Send email ──
var emailSent = false;
var emailTo = (await ctx.store.get("watch_guide_email_to")) || "kkwong@xiaomi.com";
try {
  var emailResult = await ctx.callTool("enso_email_send", {
    to: emailTo,
    subject: "Weekend Watch Guide - " + new Date().toISOString().slice(0, 10),
    body: html,
    html: true
  });
  emailSent = !!(emailResult && emailResult.success);
} catch(e) { ctx.log("Email send failed: " + (e.message || e)); }

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_cortex_watch_guide",
  success: true,
  picksCount: picks.length,
  emailSent: emailSent,
  to: emailTo
}) }] };
