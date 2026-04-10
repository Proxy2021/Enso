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

var searchQuery = "best " + style + " travel destinations " + (region || "");
if (topThemes.length > 0) searchQuery += " " + topThemes.slice(0, 2).join(" ");
ctx.log("Discovering destinations: " + searchQuery);

function stripHtml(s) {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&#\d+;/g, "").replace(/\s+/g, " ").trim();
}

var destinations = [];
try {
  var searchResult = await ctx.search(searchQuery, { count: 8 });
  if (searchResult && searchResult.results) {
    var seen = {};
    destinations = searchResult.results.map(function(r) {
      var raw = r.title.replace(/ - .*$/, "").replace(/ \| .*$/, "").trim();
      var clean = raw
        .replace(/\s*[:：]\s*Travel Guide.*$/i, "")
        .replace(/\s*Travel Guide\s*(&|and)\s*Tips\s*$/i, "")
        .replace(/\s*Travel Guide$/i, "")
        .replace(/\s*City Guide$/i, "")
        .replace(/\s*Visitor('s)?\s*Guide$/i, "")
        .replace(/\s*Tourism\s*(Guide|Info(rmation)?|Board|Website|Portal)$/i, "")
        .replace(/^(Best|Top|Ultimate|Visit|Explore|Discover)\s+(Things to Do|Places to Visit|Guide to|Attractions|in|to)\s*/i, "")
        .replace(/^Visit\s+/i, "")
        .replace(/\s*\d{4}(\s*[-–]\s*\d{4})?\s*$/i, "")
        .replace(/\s*\(.*\)\s*$/, "")
        .replace(/^Things to Do in\s+/i, "")
        .replace(/^Guide to\s+/i, "")
        .replace(/^Top\s+\d+\s+(Best|Must-Visit|Foodie|Hidden|Amazing)\s+/i, "")
        .replace(/^Culinary Tourism.*Identifies\s+/i, "")
        .replace(/^(Best|Top)\s+\d+\s+/i, "")
        .replace(/\s+for\s+\d{4}$/i, "")
        .replace(/\s+in\s+\d{4}$/i, "")
        .replace(/\s+by\s+.*$/i, "")
        .replace(/^(A |An |The )(Complete|Essential|Ultimate|Best|Perfect)\s+.*(Guide|Weekend|Trip|Visit).*$/i, "")
        .trim();
      var title = clean || raw;
      var key = title.toLowerCase();
      if (seen[key]) return null;
      seen[key] = true;
      return {
        title: title,
        url: r.url,
        description: stripHtml((r.description || "").slice(0, 300)),
        source: r.url ? r.url.replace(/https?:\/\/(www\.)?/, "").split("/")[0] : "",
      };
    }).filter(function(r) { return r && r.title && r.title.length > 2; });
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
