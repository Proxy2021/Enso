var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "movies-tv.json");
var indexPath = path.join(os.homedir(), ".enso", "wiki", "_index.md");

var cached = null;
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}

if (!cached || !cached.items || cached.items.length === 0) {
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_movies_tv_browse", items: [], totalItems: 0, message: "No movies/TV found. Run a scan first.", categories: [], genres: [] }) }] };
} else {
  var items = cached.items.slice();
var p = params || {};
  var category = p.category || "all";

  if (category !== "all") {
    items = items.filter(function(m) { return m.category === category; });
  }

  if (p.query) {
    var q = p.query.toLowerCase();
    items = items.filter(function(m) {
      return m.title.toLowerCase().includes(q) ||
             (m.originalTitle && m.originalTitle.toLowerCase().includes(q)) ||
             (m.genres && m.genres.some(function(g) { return g.toLowerCase().includes(q); })) ||
             (m.cast && m.cast.some(function(c) { return c.toLowerCase().includes(q); }));
    });
  }

  var sortBy = p.sortBy || "title";
  if (sortBy === "title") items.sort(function(a, b) { return a.title.localeCompare(b.title); });
  else if (sortBy === "year") items.sort(function(a, b) { return (b.year || 0) - (a.year || 0); });
  else if (sortBy === "rating") items.sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); });

  // Collect genres and categories
  var genreSet = {};
  var catCounts = {};
  cached.items.forEach(function(m) {
    catCounts[m.category] = (catCounts[m.category] || 0) + 1;
    (m.genres || []).forEach(function(g) { genreSet[g] = true; });
  });

  // Check wiki
  var indexContent = "";
  try { indexContent = fs.readFileSync(indexPath, "utf-8"); } catch(e) {}

  items = items.map(function(m) {
    var prefix = m.category === "tv" ? "tv-" : "movie-";
    var slug = m.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    return Object.assign({}, m, { hasWikiPage: indexContent.includes("entities/" + prefix + slug + ".md") });
  });

  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_movies_tv_browse",
    items: items.slice(0, 200),
    totalItems: cached.items.length,
    filteredCount: items.length,
    categories: catCounts,
    genres: Object.keys(genreSet).sort(),
    scannedAt: cached.scannedAt
  }) }] };
}
