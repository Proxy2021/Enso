var os = require("os");
var path = require("path");
var fs = require("fs");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "movies-tv.json");
var cached = null;
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch(e) {}

if (!cached || !cached.items) {
  result = { tool: "enso_movies_tv_search", results: [], query: params.query, message: "No data. Run a scan first." };
} else {
  var q = (params.query || "").toLowerCase();
  var scored = cached.items.map(function(m) {
    var score = 0;
    if (m.title.toLowerCase().includes(q)) score += 10;
    if (m.title.toLowerCase() === q) score += 20;
    if (m.genres && m.genres.some(function(g) { return g.toLowerCase().includes(q); })) score += 5;
    if (m.cast && m.cast.some(function(c) { return c.toLowerCase().includes(q); })) score += 5;
    if (m.overview && m.overview.toLowerCase().includes(q)) score += 2;
    if (m.directors && m.directors.some(function(d) { return d.toLowerCase().includes(q); })) score += 7;
    return Object.assign({}, m, { _score: score });
  }).filter(function(m) { return m._score > 0; });

  scored.sort(function(a, b) { return b._score - a._score; });

  result = { tool: "enso_movies_tv_search", results: scored.slice(0, 50), query: params.query, totalMatches: scored.length };
}
