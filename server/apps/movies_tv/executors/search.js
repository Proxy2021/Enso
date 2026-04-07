var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "movies-tv.json");
var cached = null;
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}

if (!cached || !cached.items) {
var p = params || {};
  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_movies_tv_search", results: [], query: p.query, message: "No data. Run a scan first." }) }] };
} else {
  var q = (p.query || "").toLowerCase();
  var scored = cached.items.map(function(m) {
    var score = 0;
    if (m.title.toLowerCase().includes(q)) score += 10;
    if (m.title.toLowerCase() === q) score += 20;
    if (m.genres && m.genres.some(function(g) { return g.toLowerCase().includes(q); })) score += 5;
    if (m.cast && m.cast.some(function(c) { return c.toLowerCase().includes(q); })) score += 5;
    if (m.overview && m.overview.toLowerCase().includes(q)) score += 2;
    if (m.directors && m.directors.some(function(d) { return d.toLowerCase().includes(q); })) score += 7;
    var prefix = m.category === "tv" ? "tv-series" : "movie";
    var slug = (m.title + (m.year ? "-" + m.year : "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
    return Object.assign({}, m, { _score: score, entityId: "movies_tv:" + prefix + ":" + slug });
  }).filter(function(m) { return m._score > 0; });

  scored.sort(function(a, b) { return b._score - a._score; });

  return { content: [{ type: "text", text: JSON.stringify({ tool: "enso_movies_tv_search", results: scored.slice(0, 50), query: p.query, totalMatches: scored.length }) }] };
}
