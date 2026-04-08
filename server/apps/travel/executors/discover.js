// Travel — Discover Destinations: AI-powered destination discovery
var os = require("os");
var fs = require("fs");
var path = require("path");
var p = params || {};

var style = p.style || "culture";
var region = p.region || "";

// Read Cortex themes for personalization
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

var searchQuery = style + " travel destinations " + (region || "") + " " + topThemes.slice(0, 2).join(" ") + " 2024 2025 hidden gems";
ctx.log("Discovering destinations: " + searchQuery);

var destinations = [];
try {
  var searchResult = await ctx.search(searchQuery, { count: 8 });
  if (searchResult && searchResult.results) {
    destinations = searchResult.results.map(function(r) {
      return {
        title: r.title.replace(/ - .*$/, "").replace(/ \| .*$/, "").trim(),
        url: r.url,
        description: (r.description || "").slice(0, 300),
        source: r.url ? r.url.replace(/https?:\/\/(www\.)?/, "").split("/")[0] : "",
      };
    }).filter(function(r) { return r.title; });
  }
} catch(e) { ctx.log("Search error: " + (e.message || e)); }

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_travel_discover",
  style: style,
  region: region || "worldwide",
  cortexThemes: topThemes,
  totalResults: destinations.length,
  destinations: destinations.slice(0, 8),
}) }] };
