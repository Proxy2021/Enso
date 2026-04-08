// Articles — Trending News: find trending articles matching Cortex interests
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

// Read Cortex themes
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
        if (theme) themeCounts[theme] = (themeCounts[theme] || 0) + 1;
      });
    });
    topThemes = Object.keys(themeCounts).sort(function(a, b) { return themeCounts[b] - themeCounts[a]; }).slice(0, 5);
  }
} catch(e) {}

var topic = p.topic || topThemes.slice(0, 2).join(" ") || "technology AI";
ctx.log("Finding trending articles for: " + topic);

var articles = [];
try {
  var searchResult = await ctx.search(topic + " latest news 2025 2026", { count: 10 });
  if (searchResult && searchResult.results) {
    articles = searchResult.results.map(function(r) {
      return {
        title: r.title || "",
        url: r.url || "",
        description: (r.description || "").slice(0, 300),
        source: r.url ? r.url.replace(/https?:\/\/(www\.)?/, "").split("/")[0] : "",
      };
    }).filter(function(r) { return r.title && r.url; });
  }
} catch(e) {
  ctx.log("Search error: " + (e.message || e));
}

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_articles_trending",
  topic: topic,
  cortexThemes: topThemes,
  totalResults: articles.length,
  articles: articles.slice(0, 10),
}) }] };
