var os = require("os");
var fs = require("fs");
var path = require("path");

var cachePath = path.join(os.homedir(), ".enso", "data", "user-context", "cache", "photo-albums.json");
var cached = { albums: [] };
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch (e) {}

var p = params || {};
var query = String(p.query || "").toLowerCase().trim();

if (!query) {
  return { content: [{ type: "text", text: JSON.stringify({
    tool: "enso_photo_albums_search",
    query: "",
    results: [],
    error: "Provide a search query.",
  }) }] };
}

var albums = Array.isArray(cached.albums) ? cached.albums : [];
function score(a) {
  var s = 0;
  var title = String(a.title || "").toLowerCase();
  var photographer = String(a.photographer || "").toLowerCase();
  var desc = String(a.description || "").toLowerCase();
  var themes = (a.themes || []).map(function(t) { return String(t).toLowerCase(); });
  if (title === query) s += 100;
  else if (title.indexOf(query) >= 0) s += 40;
  if (photographer === query) s += 60;
  else if (photographer.indexOf(query) >= 0) s += 25;
  if (themes.indexOf(query) >= 0) s += 20;
  for (var i = 0; i < themes.length; i++) if (themes[i].indexOf(query) >= 0) s += 5;
  if (desc.indexOf(query) >= 0) s += 10;
  return s;
}

var results = albums
  .map(function(a) { return { album: a, score: score(a) }; })
  .filter(function(x) { return x.score > 0; })
  .sort(function(a, b) { return b.score - a.score; })
  .slice(0, 40)
  .map(function(x) {
    var a = x.album;
    return {
      entityId: a.entityId,
      slug: a.slug,
      title: a.title,
      kind: a.kind || "external",
      photographer: a.photographer || null,
      yearPublished: a.yearPublished || null,
      style: a.style || null,
      themes: a.themes || [],
      coverUrl: a.coverUrl || null,
      description: (a.description || "").slice(0, 200),
      plateCount: a.plateCount || (a.plates || []).length || 0,
    };
  });

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_photo_albums_search",
  query: p.query,
  totalResults: results.length,
  results: results,
}) }] };
