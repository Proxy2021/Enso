var os = require("os");
var fs = require("fs");
var path = require("path");

var cacheDir = path.join(os.homedir(), ".enso", "data", "user-context", "cache");
var cachePath = path.join(cacheDir, "photo-albums.json");

var cached = { albums: [], tasteProfile: { interactionCount: 0 } };
try { cached = JSON.parse(fs.readFileSync(cachePath, "utf-8")); } catch (e) {}

var albums = Array.isArray(cached.albums) ? cached.albums.slice() : [];
var p = params || {};

// Kind/tab filter
var tab = p.tab || "all";
var filtered = albums;
if (tab === "external") filtered = filtered.filter(function(a) { return (a.kind || "external") === "external"; });
else if (tab === "personal") filtered = filtered.filter(function(a) { return a.kind === "personal"; });

// Secondary filters
if (p.photographer) {
  var ph = String(p.photographer).toLowerCase();
  filtered = filtered.filter(function(a) { return (a.photographer || "").toLowerCase().indexOf(ph) >= 0; });
}
if (p.style) {
  var st = String(p.style).toLowerCase();
  filtered = filtered.filter(function(a) { return (a.style || "").toLowerCase() === st; });
}
if (p.theme) {
  var th = String(p.theme).toLowerCase();
  filtered = filtered.filter(function(a) { return (a.themes || []).some(function(t) { return String(t).toLowerCase() === th; }); });
}
if (p.query) {
  var q = String(p.query).toLowerCase();
  filtered = filtered.filter(function(a) {
    return (a.title || "").toLowerCase().indexOf(q) >= 0
      || (a.photographer || "").toLowerCase().indexOf(q) >= 0
      || (a.description || "").toLowerCase().indexOf(q) >= 0
      || (a.themes || []).some(function(t) { return String(t).toLowerCase().indexOf(q) >= 0; });
  });
}

// Sort
var sortBy = p.sortBy || "addedAt";
if (sortBy === "addedAt") {
  filtered.sort(function(a, b) { return String(b.addedAt || "").localeCompare(String(a.addedAt || "")); });
} else if (sortBy === "yearPublished") {
  filtered.sort(function(a, b) { return (b.yearPublished || 0) - (a.yearPublished || 0); });
} else if (sortBy === "title") {
  filtered.sort(function(a, b) { return String(a.title || "").localeCompare(String(b.title || "")); });
} else if (sortBy === "photographer") {
  filtered.sort(function(a, b) { return String(a.photographer || "").localeCompare(String(b.photographer || "")); });
} else if (sortBy === "plateCount") {
  filtered.sort(function(a, b) { return (b.plateCount || (b.plates || []).length || 0) - (a.plateCount || (a.plates || []).length || 0); });
}

// Aggregate facets across ALL albums (not just filtered)
var photographerCounts = {};
var styleCounts = {};
var themeCounts = {};
for (var i = 0; i < albums.length; i++) {
  var a = albums[i];
  if (a.photographer) photographerCounts[a.photographer] = (photographerCounts[a.photographer] || 0) + 1;
  if (a.style) styleCounts[a.style] = (styleCounts[a.style] || 0) + 1;
  var ths = a.themes || [];
  for (var j = 0; j < ths.length; j++) themeCounts[ths[j]] = (themeCounts[ths[j]] || 0) + 1;
}
function topEntries(map, n) {
  return Object.entries(map).sort(function(a, b) { return b[1] - a[1]; }).slice(0, n).map(function(e) { return { name: e[0], count: e[1] }; });
}

// Pagination
var pageSize = p.pageSize || 24;
var page = p.page || 1;
var totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
var startIdx = (page - 1) * pageSize;
var pageAlbums = filtered.slice(startIdx, startIdx + pageSize);

// Check wiki pages
var wikiIndexPath = path.join(os.homedir(), ".enso", "wiki", "_index.md");
var existingPages = new Set();
try {
  if (fs.existsSync(wikiIndexPath)) {
    var idx = fs.readFileSync(wikiIndexPath, "utf-8");
    var matches = idx.matchAll(/^## (.+\.md)$/gm);
    for (var m of matches) existingPages.add(m[1]);
  }
} catch (e) {}

var externalCount = albums.filter(function(a) { return (a.kind || "external") === "external"; }).length;
var personalCount = albums.filter(function(a) { return a.kind === "personal"; }).length;

return { content: [{ type: "text", text: JSON.stringify({
  tool: "enso_photo_albums_browse",
  totalAlbums: albums.length,
  externalCount: externalCount,
  personalCount: personalCount,
  filteredCount: filtered.length,
  tab: tab,
  page: page,
  pageSize: pageSize,
  totalPages: totalPages,
  sortBy: sortBy,
  photographer: p.photographer || null,
  style: p.style || null,
  theme: p.theme || null,
  query: p.query || null,
  photographers: topEntries(photographerCounts, 20),
  styles: topEntries(styleCounts, 15),
  themes: topEntries(themeCounts, 30),
  albums: pageAlbums.map(function(a) {
    var kind = a.kind || "external";
    return {
      entityId: a.entityId,
      slug: a.slug,
      title: a.title,
      kind: kind,
      photographer: a.photographer || null,
      yearPublished: a.yearPublished || null,
      publisher: a.publisher || null,
      style: a.style || null,
      themes: a.themes || [],
      plateCount: a.plateCount || (a.plates || []).length || 0,
      coverUrl: a.coverUrl || (Array.isArray(a.plates) && a.plates[0] ? (a.plates[0].imageUrl || a.plates[0].filePath) : null),
      description: a.description || "",
      source: a.source || (kind === "external" ? "research" : "manual"),
      sourceUrl: a.sourceUrl || null,
      addedAt: a.addedAt || null,
      updatedAt: a.updatedAt || null,
      userRating: a.userRating || 0,
      isFavorite: !!a.isFavorite,
      hasWikiPage: existingPages.has("entities/album-" + a.slug + ".md"),
      wikiPath: "entities/album-" + a.slug + ".md",
    };
  }),
  tasteProfile: cached.tasteProfile || { interactionCount: 0 },
}) }] };
